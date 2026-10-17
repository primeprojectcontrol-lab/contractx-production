from __future__ import annotations

import hashlib
import json
import math
import re
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from .calendar_engine import CalendarRegistry, WorkCalendar


Interval = Tuple[time, time]


class XERParser:
    """
    ContractX Engine 2 v5 merged forensic-grade Primavera P6 XER parser.

    Design goals:
    - Preserve every raw XER table for auditability.
    - Expose normalized project, WBS, activity, relationship, resource,
      assignment and calendar datasets used by CPMEngine.
    - Parse Primavera calendar working weeks and date exceptions on a
      deterministic, best-effort basis without silently inventing data.
    - Preserve parse/quality warnings for forensic reporting.
    - Support base-calendar inheritance where the export contains it.
    - Generate deterministic fingerprints for source-programme provenance.

    Important:
    Primavera XER calendar blobs vary across P6 releases and export settings.
    When a calendar fragment cannot be decoded with confidence, this parser
    falls back deterministically and records a warning. It does not claim
    byte-for-byte Oracle P6 calendar reconstruction in every export variant.
    """

    DATE_FORMATS = (
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%d-%b-%y %H:%M",
        "%d-%b-%Y %H:%M",
        "%d-%b-%y",
        "%d-%b-%Y",
        "%m/%d/%Y %H:%M",
        "%m/%d/%Y",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y",
    )

    # Primavera frequently represents weekdays as 1..7.
    # The mapping below assumes Sunday=1, Monday=2 ... Saturday=7,
    # which is the most common P6 XER calendar convention.
    P6_DAY_TO_PYTHON = {
        1: 6,  # Sunday
        2: 0,  # Monday
        3: 1,  # Tuesday
        4: 2,  # Wednesday
        5: 3,  # Thursday
        6: 4,  # Friday
        7: 5,  # Saturday
    }

    # Conservative Primavera activity-type normalization. Raw P6 values are
    # always retained separately for forensic traceability.
    ACTIVITY_TYPE_MAP = {
        "TT_TASK": "TASK_DEPENDENT",
        "TT_RSRC": "RESOURCE_DEPENDENT",
        "TT_LOE": "LEVEL_OF_EFFORT",
        "TT_MILE": "START_MILESTONE",
        "TT_FINMILE": "FINISH_MILESTONE",
        "TT_WBS": "WBS_SUMMARY",
        "TASK_DEPENDENT": "TASK_DEPENDENT",
        "RESOURCE_DEPENDENT": "RESOURCE_DEPENDENT",
        "LEVEL_OF_EFFORT": "LEVEL_OF_EFFORT",
        "START_MILESTONE": "START_MILESTONE",
        "FINISH_MILESTONE": "FINISH_MILESTONE",
        "WBS_SUMMARY": "WBS_SUMMARY",
    }

    TASK_UDF_SUBJECT_TOKENS = {"TASK", "ACTIVITY", "TASKS", "ACTIVITIES"}

    def __init__(self, file_content: str):
        self.raw_content = file_content or ""
        self.tables: Dict[str, pd.DataFrame] = {}
        self.warnings: List[Dict[str, Any]] = []
        self._calendar_decode_cache: Dict[str, Dict[str, Any]] = {}

    # ------------------------------------------------------------------
    # Warning / provenance helpers
    # ------------------------------------------------------------------

    def _warn(
        self,
        message: str,
        *,
        code: str = "XER_WARNING",
        severity: str = "warning",
        table: Optional[str] = None,
        line: Optional[int] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> None:
        item: Dict[str, Any] = {
            "code": code,
            "severity": severity,
            "message": message,
        }
        if table:
            item["table"] = table
        if line is not None:
            item["line"] = line
        if context:
            item["context"] = context
        self.warnings.append(item)

    def source_hash(self) -> str:
        return hashlib.sha256(self.raw_content.encode("utf-8", errors="ignore")).hexdigest()

    def table_hash(self, table_name: str) -> Optional[str]:
        self._ensure()
        df = self.tables.get(table_name)
        if df is None:
            return None
        payload = df.fillna("").astype(str).to_csv(index=False, lineterminator="\n")
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    # ------------------------------------------------------------------
    # Raw parser
    # ------------------------------------------------------------------

    def parse(self) -> Dict[str, pd.DataFrame]:
        self.tables = {}
        self.warnings = []
        self._calendar_decode_cache = {}

        current_table: Optional[str] = None
        headers: List[str] = []
        rows: List[List[str]] = []

        def flush() -> None:
            nonlocal current_table, headers, rows
            if not current_table or not headers:
                return

            expected = len(headers)
            cleaned: List[List[str]] = []

            for row in rows:
                if len(row) < expected:
                    self._warn(
                        f"Row padded from {len(row)} to {expected} fields.",
                        code="ROW_FIELD_COUNT_SHORT",
                        table=current_table,
                        severity="warning",
                    )
                    row = row + [""] * (expected - len(row))
                elif len(row) > expected:
                    self._warn(
                        f"Row truncated from {len(row)} to {expected} fields.",
                        code="ROW_FIELD_COUNT_LONG",
                        table=current_table,
                        severity="high",
                    )
                    row = row[:expected]
                cleaned.append(row)

            self.tables[current_table] = pd.DataFrame(cleaned, columns=headers)

        for line_no, raw in enumerate(self.raw_content.splitlines(), start=1):
            line = raw.rstrip("\r\n")
            if not line.strip():
                continue

            parts = line.split("\t")
            kind = parts[0].strip()

            if kind == "%T":
                flush()
                current_table = parts[1].strip() if len(parts) > 1 else None
                headers, rows = [], []

            elif kind == "%F" and current_table:
                headers = [x.strip() for x in parts[1:]]

            elif kind == "%R" and current_table and headers:
                row = parts[1:]
                if len(row) != len(headers):
                    self._warn(
                        f"{len(row)} values for {len(headers)} fields.",
                        code="ROW_FIELD_COUNT_MISMATCH",
                        table=current_table,
                        line=line_no,
                        severity="warning" if len(row) < len(headers) else "high",
                    )
                rows.append(row)

        flush()

        if "PROJECT" not in self.tables:
            self._warn(
                "PROJECT table was not found in the XER.",
                code="PROJECT_TABLE_MISSING",
                severity="high",
            )
        if "TASK" not in self.tables:
            self._warn(
                "TASK table was not found in the XER.",
                code="TASK_TABLE_MISSING",
                severity="critical",
            )
        if "TASKPRED" not in self.tables:
            self._warn(
                "TASKPRED table was not found in the XER.",
                code="TASKPRED_TABLE_MISSING",
                severity="high",
            )

        return self.tables

    def _ensure(self) -> None:
        if not self.tables:
            self.parse()

    # ------------------------------------------------------------------
    # Generic conversion helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _num(value: Any, default: float = 0.0) -> float:
        """Return a finite float, otherwise the supplied deterministic default."""
        try:
            if value is None or pd.isna(value) or str(value).strip() == "":
                return default
            number = float(value)
            return number if math.isfinite(number) else default
        except Exception:
            return default

    @classmethod
    def _dt(cls, value: Any) -> Optional[pd.Timestamp]:
        text = str(value or "").strip()
        if not text:
            return None

        for fmt in cls.DATE_FORMATS:
            try:
                return pd.Timestamp(datetime.strptime(text, fmt))
            except ValueError:
                pass

        value = pd.to_datetime(text, errors="coerce")
        return None if pd.isna(value) else pd.Timestamp(value)

    @staticmethod
    def _rename(df: pd.DataFrame, mapping: Dict[str, str]) -> pd.DataFrame:
        cols = {source: target for source, target in mapping.items() if source in df.columns}
        return df[list(cols)].rename(columns=cols) if cols else pd.DataFrame()

    @classmethod
    def normalize_activity_type(cls, value: Any) -> str:
        """Return a stable semantic activity type while preserving raw P6 elsewhere."""
        raw = str(value or "").strip().upper()
        return cls.ACTIVITY_TYPE_MAP.get(raw, raw or "UNKNOWN")

    @staticmethod
    def normalize_constraint_token(value: Any) -> str:
        """Normalize the token only; do not infer constraint semantics here."""
        return str(value or "").strip().upper()

    @staticmethod
    def _first_present(row: pd.Series, *fields: str) -> Any:
        for field in fields:
            if field in row.index:
                value = row.get(field)
                if value is not None and not pd.isna(value) and str(value).strip() != "":
                    return value
        return None

    def get_raw_table_records(self, table_name: str) -> List[Dict[str, Any]]:
        """Return a lossless dictionary view of a raw parsed XER table."""
        self._ensure()
        df = self.tables.get(str(table_name or "").upper())
        if df is None or df.empty:
            return []
        return df.where(pd.notna(df), None).to_dict(orient="records")

    def get_table(self, table_name: str) -> List[Dict[str, Any]]:
        """Compatibility alias for relational enrichment consumers."""
        return self.get_raw_table_records(table_name)

    # ------------------------------------------------------------------
    # Normalized project data
    # ------------------------------------------------------------------

    def get_project(self) -> pd.DataFrame:
        self._ensure()
        if "PROJECT" not in self.tables:
            return pd.DataFrame()

        result = self._rename(
            self.tables["PROJECT"],
            {
                "proj_id": "project_id_pk",
                "proj_short_name": "project_code",
                "proj_name": "project_name",
                "plan_start_date": "planned_start",
                "plan_end_date": "planned_finish",
                "scd_end_date": "scheduled_finish",
                "last_recalc_date": "data_date",
                "clndr_id": "default_calendar_id",
                "last_checksum": "last_checksum",
                "def_duration_type": "default_duration_type",
                "task_code_base": "activity_code_base",
            },
        )

        for col in ("planned_start", "planned_finish", "scheduled_finish", "data_date"):
            if col in result:
                result[col] = result[col].apply(self._dt)

        return result

    def get_wbs(self) -> pd.DataFrame:
        self._ensure()
        if "PROJWBS" not in self.tables:
            return pd.DataFrame()

        result = self._rename(
            self.tables["PROJWBS"],
            {
                "wbs_id": "wbs_id",
                "proj_id": "project_id_pk",
                "parent_wbs_id": "parent_wbs_id",
                "wbs_short_name": "wbs_code",
                "wbs_name": "wbs_name",
                "seq_num": "sequence_number",
                "status_code": "status",
            },
        )

        if result.empty:
            return result

        # Preserve the exact PROJWBS row order from the source XER.  The P6
        # sequence_number is also retained separately because sequence_number
        # is meaningful within the WBS hierarchy while source_row_sequence is
        # the deterministic export order fallback.
        result["source_row_sequence"] = range(len(result))
        if "sequence_number" in result.columns:
            result["sequence_number"] = pd.to_numeric(
                result["sequence_number"], errors="coerce"
            )

        lookup = result.set_index("wbs_id").to_dict("index")

        def path_for(wid: Any) -> str:
            current = str(wid)
            seen, parts = set(), []

            while current in lookup and current not in seen:
                seen.add(current)
                row = lookup[current]
                name = str(row.get("wbs_name", "") or "").strip()
                code = str(row.get("wbs_code", "") or "").strip()
                label = name or code
                if label:
                    parts.append(label)

                parent = str(row.get("parent_wbs_id", "") or "").strip()
                if not parent:
                    break
                current = parent

            if current in seen and current:
                self._warn(
                    f"WBS hierarchy cycle detected around WBS {current}.",
                    code="WBS_CYCLE",
                    table="PROJWBS",
                    severity="high",
                )

            return " / ".join(reversed(parts))

        result["wbs_path"] = result["wbs_id"].apply(path_for)
        return result

    def get_activities(self) -> pd.DataFrame:
        self._ensure()
        if "TASK" not in self.tables:
            return pd.DataFrame()

        result = self._rename(
            self.tables["TASK"],
            {
                "task_id": "activity_id_pk",
                "task_code": "activity_id",
                "task_name": "activity_name",
                "proj_id": "project_id_pk",
                "wbs_id": "wbs_id",
                "clndr_id": "calendar_id",
                "task_type": "activity_type",
                "status_code": "status",
                "seq_num": "activity_sequence",
                "duration_type": "duration_type",
                "complete_pct_type": "percent_complete_type",

                "target_start_date": "planned_start",
                "target_end_date": "planned_finish",
                "early_start_date": "early_start",
                "early_end_date": "early_finish",
                "late_start_date": "late_start",
                "late_end_date": "late_finish",
                "act_start_date": "actual_start",
                "act_end_date": "actual_finish",
                "restart_date": "remaining_start",
                "reend_date": "remaining_finish",
                "expect_end_date": "expected_finish",

                "target_drtn_hr_cnt": "planned_duration_hrs",
                "remain_drtn_hr_cnt": "remaining_duration_hrs",
                "total_float_hr_cnt": "total_float_hrs",
                "free_float_hr_cnt": "free_float_hrs",

                "phys_complete_pct": "physical_percent_complete",
                "complete_pct": "percent_complete",

                "cstr_type": "primary_constraint_type",
                "cstr_date": "primary_constraint_date",
                "cstr_type2": "secondary_constraint_type",
                "cstr_date2": "secondary_constraint_date",

                "suspend_date": "suspend_date",
                "resume_date": "resume_date",

                "priority_type": "priority_type",
                "guid": "guid",
            },
        )

        if result.empty:
            return result

        # Keep the exact TASK export row order as an immutable fallback for
        # display ordering.  This is separate from activity_sequence because
        # some XER variants omit TASK.seq_num.
        result["source_row_sequence"] = range(len(result))

        date_cols = [
            "planned_start",
            "planned_finish",
            "early_start",
            "early_finish",
            "late_start",
            "late_finish",
            "actual_start",
            "actual_finish",
            "remaining_start",
            "remaining_finish",
            "expected_finish",
            "primary_constraint_date",
            "secondary_constraint_date",
            "suspend_date",
            "resume_date",
        ]
        for col in date_cols:
            if col in result:
                result[col] = result[col].apply(self._dt)

        numeric_cols = [
            "activity_sequence",
            "planned_duration_hrs",
            "remaining_duration_hrs",
            "total_float_hrs",
            "free_float_hrs",
            "physical_percent_complete",
            "percent_complete",
        ]
        for col in numeric_cols:
            if col in result:
                # Do not convert missing P6 values to 0.0 here.  Missing float,
                # duration or progress is materially different from an explicit
                # zero in a forensic schedule and must remain distinguishable.
                result[col] = (
                    pd.to_numeric(result[col], errors="coerce")
                    .replace([float("inf"), float("-inf")], float("nan"))
                )

        # Preserve raw Primavera tokens and expose deterministic semantic fields.
        # Constraint *meaning* remains the responsibility of the scheduling engine;
        # the parser normalizes only token casing to avoid inventing semantics.
        if "activity_type" in result:
            result["activity_type_raw"] = result["activity_type"]
            result["activity_type_normalized"] = result["activity_type"].apply(
                self.normalize_activity_type
            )
            result["is_start_milestone"] = (
                result["activity_type_normalized"] == "START_MILESTONE"
            )
            result["is_finish_milestone"] = (
                result["activity_type_normalized"] == "FINISH_MILESTONE"
            )

        for prefix in ("primary", "secondary"):
            col = f"{prefix}_constraint_type"
            if col in result:
                result[f"{prefix}_constraint_type_raw"] = result[col]
                result[f"{prefix}_constraint_type_normalized"] = result[col].apply(
                    self.normalize_constraint_token
                )

        wbs = self.get_wbs()
        if not wbs.empty and "wbs_id" in result and "wbs_id" in wbs:
            enrich_cols = [
                c
                for c in [
                    "wbs_id",
                    "parent_wbs_id",
                    "wbs_code",
                    "wbs_name",
                    "wbs_path",
                    "sequence_number",
                    "source_row_sequence",
                ]
                if c in wbs.columns
            ]
            wbs_enrichment = wbs[enrich_cols].drop_duplicates(subset=["wbs_id"]).copy()
            wbs_enrichment = wbs_enrichment.rename(
                columns={
                    "sequence_number": "wbs_sequence_number",
                    "source_row_sequence": "wbs_source_row_sequence",
                }
            )
            result = result.merge(
                wbs_enrichment,
                on="wbs_id",
                how="left",
            )

        return result

    def get_relationships(self) -> pd.DataFrame:
        self._ensure()
        if "TASKPRED" not in self.tables:
            return pd.DataFrame()

        result = self._rename(
            self.tables["TASKPRED"],
            {
                "task_pred_id": "pred_link_id",
                "task_id": "successor_activity_pk",
                "pred_task_id": "predecessor_activity_pk",
                "pred_type": "relationship_type",
                "lag_hr_cnt": "lag_hrs",
                "proj_id": "successor_project_id_pk",
                "pred_proj_id": "predecessor_project_id_pk",
            },
        )

        if not result.empty:
            result["source_row_sequence"] = range(len(result))

        if "lag_hrs" in result:
            # Missing lag is treated as zero by the CPM engine, but retaining
            # NaN here preserves the exact source state for audit/viewer use.
            result["lag_hrs"] = (
                pd.to_numeric(result["lag_hrs"], errors="coerce")
                .replace([float("inf"), float("-inf")], float("nan"))
            )

        return result

    def get_resources(self) -> pd.DataFrame:
        self._ensure()
        if "RSRC" not in self.tables:
            return pd.DataFrame()

        result = self._rename(
            self.tables["RSRC"],
            {
                "rsrc_id": "resource_id",
                "rsrc_name": "resource_name",
                "rsrc_short_name": "resource_code",
                "clndr_id": "calendar_id",
                "max_qty_per_hr": "max_units_per_hour",
                "rsrc_type": "resource_type",
                "parent_rsrc_id": "parent_resource_id",
            },
        )

        if "max_units_per_hour" in result:
            result["max_units_per_hour"] = pd.to_numeric(
                result["max_units_per_hour"], errors="coerce"
            ).fillna(0.0)

        return result

    def get_resource_assignments(self) -> pd.DataFrame:
        self._ensure()
        if "TASKRSRC" not in self.tables:
            return pd.DataFrame()

        result = self._rename(
            self.tables["TASKRSRC"],
            {
                "taskrsrc_id": "assignment_id",
                "task_id": "activity_id_pk",
                "rsrc_id": "resource_id",
                "target_qty": "budgeted_units",
                "remain_qty": "remaining_units",
                "target_qty_per_hr": "units_per_hour",
                "act_reg_qty": "actual_regular_units",
                "act_ot_qty": "actual_overtime_units",
            },
        )

        for col in (
            "budgeted_units",
            "remaining_units",
            "units_per_hour",
            "actual_regular_units",
            "actual_overtime_units",
        ):
            if col in result:
                result[col] = pd.to_numeric(result[col], errors="coerce").fillna(0.0)

        return result

    # ------------------------------------------------------------------
    # Relational forensic enrichment: Activity Codes / UDFs / Resources
    # ------------------------------------------------------------------

    def get_activity_code_types(self) -> pd.DataFrame:
        """Normalize ACTVTYPE without discarding unrecognized raw fields."""
        self._ensure()
        raw = self.tables.get("ACTVTYPE")
        if raw is None or raw.empty:
            return pd.DataFrame()

        result = pd.DataFrame(index=raw.index)
        field_candidates = {
            "activity_code_type_id": ("actv_code_type_id",),
            "project_id_pk": ("proj_id",),
            "activity_code_type": (
                "actv_code_type",
                "actv_code_type_name",
                "actv_code_type_label",
                "actv_type_name",
            ),
            "short_length": ("actv_short_len", "actv_short_length"),
            "sequence_number": ("seq_num",),
        }
        for target, candidates in field_candidates.items():
            for source in candidates:
                if source in raw.columns:
                    result[target] = raw[source]
                    break

        if "activity_code_type_id" not in result:
            return pd.DataFrame()
        return result.reset_index(drop=True)

    def get_activity_code_values(self) -> pd.DataFrame:
        """Normalize ACTVCODE values and attach their Activity Code Type."""
        self._ensure()
        raw = self.tables.get("ACTVCODE")
        if raw is None or raw.empty:
            return pd.DataFrame()

        result = self._rename(
            raw,
            {
                "actv_code_id": "activity_code_id",
                "actv_code_type_id": "activity_code_type_id",
                "parent_actv_code_id": "parent_activity_code_id",
                "short_name": "code_value",
                "actv_code_name": "code_description",
                "seq_num": "sequence_number",
                "proj_id": "project_id_pk",
            },
        )
        if result.empty:
            return result

        types = self.get_activity_code_types()
        if (
            not types.empty
            and "activity_code_type_id" in result
            and "activity_code_type_id" in types
        ):
            type_cols = [
                c
                for c in (
                    "activity_code_type_id",
                    "activity_code_type",
                    "short_length",
                )
                if c in types.columns
            ]
            result = result.merge(
                types[type_cols].drop_duplicates(subset=["activity_code_type_id"]),
                on="activity_code_type_id",
                how="left",
            )
        return result

    def get_activity_code_assignments(self) -> pd.DataFrame:
        """Resolve TASKACTV -> ACTVCODE -> ACTVTYPE for every activity assignment."""
        self._ensure()
        raw = self.tables.get("TASKACTV")
        if raw is None or raw.empty:
            return pd.DataFrame()

        assignments = self._rename(
            raw,
            {
                "task_id": "activity_id_pk",
                "actv_code_id": "activity_code_id",
                "actv_code_type_id": "activity_code_type_id",
                "proj_id": "project_id_pk",
            },
        )
        if assignments.empty:
            return assignments

        values = self.get_activity_code_values()
        if not values.empty and "activity_code_id" in assignments and "activity_code_id" in values:
            value_cols = [
                c
                for c in (
                    "activity_code_id",
                    "activity_code_type_id",
                    "activity_code_type",
                    "parent_activity_code_id",
                    "code_value",
                    "code_description",
                    "sequence_number",
                )
                if c in values.columns
            ]
            # Avoid duplicate type-id columns where TASKACTV already contains it.
            merge_values = values[value_cols].drop_duplicates(subset=["activity_code_id"])
            assignments = assignments.merge(
                merge_values,
                on="activity_code_id",
                how="left",
                suffixes=("", "_resolved"),
            )
            if "activity_code_type_id_resolved" in assignments:
                if "activity_code_type_id" not in assignments:
                    assignments["activity_code_type_id"] = assignments[
                        "activity_code_type_id_resolved"
                    ]
                else:
                    assignments["activity_code_type_id"] = assignments[
                        "activity_code_type_id"
                    ].where(
                        assignments["activity_code_type_id"].astype(str).str.strip().ne(""),
                        assignments["activity_code_type_id_resolved"],
                    )
                assignments = assignments.drop(columns=["activity_code_type_id_resolved"])
        return assignments

    def get_udf_types(self) -> pd.DataFrame:
        """Normalize UDFTYPE metadata while retaining subject-area information."""
        self._ensure()
        raw = self.tables.get("UDFTYPE")
        if raw is None or raw.empty:
            return pd.DataFrame()

        result = pd.DataFrame(index=raw.index)
        field_candidates = {
            "udf_type_id": ("udf_type_id",),
            "udf_title": ("udf_type_label", "udf_type_name", "udf_label"),
            "data_type": ("logical_data_type", "data_type"),
            "subject_area": ("subject_area", "table_name", "subject_area_name"),
        }
        for target, candidates in field_candidates.items():
            for source in candidates:
                if source in raw.columns:
                    result[target] = raw[source]
                    break

        if "udf_type_id" not in result:
            return pd.DataFrame()
        return result.reset_index(drop=True)

    def get_udf_values(self) -> pd.DataFrame:
        """Normalize UDFVALUE and resolve UDF type metadata."""
        self._ensure()
        raw = self.tables.get("UDFVALUE")
        if raw is None or raw.empty:
            return pd.DataFrame()

        result = self._rename(
            raw,
            {
                "udf_type_id": "udf_type_id",
                "fk_id": "foreign_key_id",
                "udf_text": "text_value",
                "udf_number": "number_value",
                "udf_date": "date_value",
                "udf_code_id": "code_value_id",
                "proj_id": "project_id_pk",
            },
        )
        if result.empty:
            return result

        if "number_value" in result:
            result["number_value"] = pd.to_numeric(result["number_value"], errors="coerce")
        if "date_value" in result:
            result["date_value"] = result["date_value"].apply(self._dt)

        udf_types = self.get_udf_types()
        if not udf_types.empty and "udf_type_id" in result and "udf_type_id" in udf_types:
            cols = [
                c for c in ("udf_type_id", "udf_title", "data_type", "subject_area")
                if c in udf_types.columns
            ]
            result = result.merge(
                udf_types[cols].drop_duplicates(subset=["udf_type_id"]),
                on="udf_type_id",
                how="left",
            )

        def resolved_value(row: pd.Series) -> Any:
            for key in ("text_value", "number_value", "date_value", "code_value_id"):
                value = row.get(key)
                if value is not None and not pd.isna(value) and str(value).strip() != "":
                    return value
            return None

        result["resolved_value"] = result.apply(resolved_value, axis=1)
        return result

    @classmethod
    def _is_activity_udf_subject(cls, value: Any) -> Optional[bool]:
        """Return True/False when subject area is explicit, otherwise None."""
        token = str(value or "").strip().upper()
        if not token:
            return None
        return any(part in token for part in cls.TASK_UDF_SUBJECT_TOKENS)

    def get_task_udfs(self, activity_id_pk: Optional[str] = None) -> pd.DataFrame:
        """
        Return Activity/TASK UDFs only.

        If UDFTYPE exposes a subject area, non-activity subject areas are excluded.
        If the export omits subject area metadata, the FK match is retained but marked
        subject_area_verified=False instead of silently asserting it is an activity UDF.
        """
        values = self.get_udf_values()
        if values.empty:
            return values

        if activity_id_pk is not None and "foreign_key_id" in values:
            values = values[
                values["foreign_key_id"].astype(str) == str(activity_id_pk)
            ].copy()

        if "subject_area" in values:
            verdicts = values["subject_area"].apply(self._is_activity_udf_subject)
            values["subject_area_verified"] = verdicts.eq(True)
            # Explicit non-activity UDFs are excluded; unknown/missing subject areas remain.
            values = values[verdicts.ne(False)].copy()
        else:
            values["subject_area_verified"] = False

        return values.reset_index(drop=True)

    def get_task_activity_codes(self, activity_id_pk: Optional[str] = None) -> pd.DataFrame:
        assignments = self.get_activity_code_assignments()
        if assignments.empty or activity_id_pk is None:
            return assignments
        return assignments[
            assignments["activity_id_pk"].astype(str) == str(activity_id_pk)
        ].reset_index(drop=True)

    def get_resource_assignments_enriched(self) -> pd.DataFrame:
        """Join normalized TASKRSRC assignments to normalized RSRC metadata."""
        assignments = self.get_resource_assignments()
        if assignments.empty:
            return assignments
        resources = self.get_resources()
        if resources.empty or "resource_id" not in assignments or "resource_id" not in resources:
            return assignments

        cols = [
            c
            for c in (
                "resource_id",
                "resource_name",
                "resource_code",
                "resource_type",
                "calendar_id",
                "max_units_per_hour",
                "parent_resource_id",
            )
            if c in resources.columns
        ]
        return assignments.merge(
            resources[cols].drop_duplicates(subset=["resource_id"]),
            on="resource_id",
            how="left",
        )

    def get_task_resources(self, activity_id_pk: Optional[str] = None) -> pd.DataFrame:
        result = self.get_resource_assignments_enriched()
        if result.empty or activity_id_pk is None:
            return result
        return result[
            result["activity_id_pk"].astype(str) == str(activity_id_pk)
        ].reset_index(drop=True)

    def get_enriched_activities(self) -> List[Dict[str, Any]]:
        """
        Forensic aggregation compatible with the reviewed parser concept while
        preserving ContractX's canonical normalized DataFrame interfaces.
        """
        activities = self.get_activities()
        if activities.empty:
            return []

        codes = self.get_activity_code_assignments()
        udfs = self.get_task_udfs()
        resources = self.get_resource_assignments_enriched()

        code_groups: Dict[str, List[Dict[str, Any]]] = {}
        if not codes.empty and "activity_id_pk" in codes:
            for key, group in codes.groupby(codes["activity_id_pk"].astype(str), dropna=False):
                code_groups[str(key)] = group.where(pd.notna(group), None).to_dict(orient="records")

        udf_groups: Dict[str, List[Dict[str, Any]]] = {}
        if not udfs.empty and "foreign_key_id" in udfs:
            for key, group in udfs.groupby(udfs["foreign_key_id"].astype(str), dropna=False):
                udf_groups[str(key)] = group.where(pd.notna(group), None).to_dict(orient="records")

        resource_groups: Dict[str, List[Dict[str, Any]]] = {}
        if not resources.empty and "activity_id_pk" in resources:
            for key, group in resources.groupby(resources["activity_id_pk"].astype(str), dropna=False):
                resource_groups[str(key)] = group.where(pd.notna(group), None).to_dict(orient="records")

        enriched: List[Dict[str, Any]] = []
        for _, row in activities.iterrows():
            core = row.where(pd.notna(row), None).to_dict()
            activity_pk = str(core.get("activity_id_pk") or "")
            enriched.append(
                {
                    "core": core,
                    "activity_codes": code_groups.get(activity_pk, []),
                    "udfs": udf_groups.get(activity_pk, []),
                    "resources": resource_groups.get(activity_pk, []),
                }
            )
        return enriched

    def get_full_activities(self) -> List[Dict[str, Any]]:
        """Compatibility alias for the reviewed relational aggregation API."""
        return self.get_enriched_activities()

    def get_calendars(self) -> pd.DataFrame:
        self._ensure()
        if "CALENDAR" not in self.tables:
            return pd.DataFrame()

        result = self._rename(
            self.tables["CALENDAR"],
            {
                "clndr_id": "calendar_id",
                "clndr_name": "calendar_name",
                "clndr_type": "calendar_type",
                "day_hr_cnt": "hours_per_day",
                "week_hr_cnt": "hours_per_week",
                "month_hr_cnt": "hours_per_month",
                "year_hr_cnt": "hours_per_year",
                "base_clndr_id": "base_calendar_id",
                "clndr_data": "calendar_data",
                "proj_id": "project_id_pk",
                "rsrc_id": "resource_id",
                "last_chng_date": "last_change_date",
            },
        )

        for col in (
            "hours_per_day",
            "hours_per_week",
            "hours_per_month",
            "hours_per_year",
        ):
            if col in result:
                result[col] = (
                    pd.to_numeric(result[col], errors="coerce")
                    .replace([float("inf"), float("-inf")], float("nan"))
                )

        if "last_change_date" in result:
            result["last_change_date"] = result["last_change_date"].apply(self._dt)

        return result

    # ------------------------------------------------------------------
    # Calendar decoding
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_time(text: str) -> Optional[time]:
        try:
            return datetime.strptime(text.strip(), "%H:%M").time()
        except Exception:
            return None

    @classmethod
    def _extract_times(cls, blob: str) -> List[Interval]:
        """
        Extract s|HH:MM ... f|HH:MM interval pairs from a calendar fragment.
        """
        if not blob:
            return []

        pattern = re.compile(
            r"(?:^|[\(\|\s])(?:s|start)\|(\d{1,2}:\d{2})"
            r".{0,80}?"
            r"(?:f|finish|end)\|(\d{1,2}:\d{2})",
            flags=re.IGNORECASE | re.DOTALL,
        )

        result: List[Interval] = []
        seen = set()

        for a, b in pattern.findall(blob):
            start_t = cls._parse_time(a)
            end_t = cls._parse_time(b)
            if not start_t or not end_t:
                continue

            # Overnight intervals are not represented directly by WorkCalendar.
            # They are split deterministically into same-day + next-day fragments
            # later by _normalize_weekly_intervals / _normalize_exception_intervals.
            key = (start_t, end_t)
            if key not in seen:
                seen.add(key)
                result.append(key)

        return sorted(result, key=lambda x: (x[0], x[1]))

    @staticmethod
    def _balanced_slice(text: str, start: int) -> Optional[str]:
        """
        Return a balanced-parenthesis substring beginning at `start`.
        """
        if start < 0 or start >= len(text) or text[start] != "(":
            return None

        depth = 0
        for idx in range(start, len(text)):
            ch = text[idx]
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    return text[start : idx + 1]
        return None

    @classmethod
    def _find_named_section(cls, blob: str, name: str) -> Optional[str]:
        """
        Find a named P6 calendar section such as DaysOfWeek or Exceptions.
        """
        match = re.search(rf"{re.escape(name)}\s*\(\)", blob, flags=re.IGNORECASE)
        if not match:
            return None

        open_idx = blob.find("(", match.end())
        if open_idx == -1:
            return None
        return cls._balanced_slice(blob, open_idx)

    @classmethod
    def _parse_weekday_blocks(cls, blob: str) -> Dict[int, List[Interval]]:
        """
        Best-effort decoder for P6 DaysOfWeek() content.

        Handles common fragments such as:
          (0||1()((0||0(s|08:00|f|12:00)(s|13:00|f|17:00))))
        and related P6 export variants.
        """
        section = cls._find_named_section(blob, "DaysOfWeek") or blob
        weekly: Dict[int, List[Interval]] = {}

        # Primary strategy: identify numeric day tokens 1..7 and use the
        # balanced group immediately following that token.
        token_pattern = re.compile(r"(?:^|[\(\|])([1-7])\(\)")
        matches = list(token_pattern.finditer(section))

        for i, match in enumerate(matches):
            p6_day = int(match.group(1))
            py_day = cls.P6_DAY_TO_PYTHON[p6_day]

            segment_start = match.end()
            segment_end = matches[i + 1].start() if i + 1 < len(matches) else len(section)
            segment = section[segment_start:segment_end]

            intervals = cls._extract_times(segment)
            if intervals:
                weekly[py_day] = intervals
            elif re.search(r"(?:nonwork|non-work|0\|\|0\(\))", segment, flags=re.IGNORECASE):
                weekly[py_day] = []

        # Secondary strategy for exports containing explicit weekday labels.
        label_map = {
            "monday": 0,
            "tuesday": 1,
            "wednesday": 2,
            "thursday": 3,
            "friday": 4,
            "saturday": 5,
            "sunday": 6,
        }

        for label, py_day in label_map.items():
            match = re.search(label, section, flags=re.IGNORECASE)
            if not match:
                continue
            next_labels = [
                m.start()
                for other in label_map
                if other != label
                for m in [re.search(other, section[match.end():], flags=re.IGNORECASE)]
                if m
            ]
            end = match.end() + min(next_labels) if next_labels else len(section)
            intervals = cls._extract_times(section[match.end():end])
            if intervals:
                weekly[py_day] = intervals

        return weekly

    @classmethod
    def _candidate_exception_dates(cls, section: str) -> List[Tuple[int, date]]:
        """
        Find common date encodings in the Exceptions section.
        Returns list of (character position, date).
        """
        found: List[Tuple[int, date]] = []

        patterns = (
            r"\b(\d{4}-\d{2}-\d{2})\b",
            r"\b(\d{1,2}-[A-Za-z]{3}-\d{2,4})\b",
            r"\b(\d{1,2}/\d{1,2}/\d{4})\b",
        )

        for pattern in patterns:
            for match in re.finditer(pattern, section):
                ts = cls._dt(match.group(1))
                if ts is not None:
                    found.append((match.start(), ts.date()))

        # Some P6 calendar exports encode exception day using a numeric
        # Excel/OLE-style day count. We intentionally do not guess those
        # values here unless accompanied by a recognizable date string.
        found.sort(key=lambda x: x[0])
        return found

    @classmethod
    def _parse_exceptions(
        cls,
        blob: str,
    ) -> Tuple[set[date], Dict[date, List[Interval]]]:
        """
        Parse date-specific calendar exceptions.

        A date with intervals becomes a working exception.
        A date without intervals becomes a holiday/non-work exception.
        """
        section = cls._find_named_section(blob, "Exceptions")
        if not section:
            return set(), {}

        holidays: set[date] = set()
        exceptions: Dict[date, List[Interval]] = {}

        dated = cls._candidate_exception_dates(section)
        for idx, (position, exc_date) in enumerate(dated):
            end = dated[idx + 1][0] if idx + 1 < len(dated) else len(section)
            fragment = section[position:end]
            intervals = cls._extract_times(fragment)
            if intervals:
                exceptions[exc_date] = intervals
            else:
                holidays.add(exc_date)

        return holidays, exceptions

    @staticmethod
    def _merge_intervals(intervals: List[Interval]) -> List[Interval]:
        if not intervals:
            return []

        # WorkCalendar cannot directly represent overnight intervals.
        # Keep same-day intervals only here; overnight treatment is handled
        # separately by the normalizers.
        same_day = [(a, b) for a, b in intervals if b > a]
        if not same_day:
            return []

        def seconds(t: time) -> int:
            return t.hour * 3600 + t.minute * 60 + t.second

        ordered = sorted(same_day, key=lambda p: seconds(p[0]))
        merged: List[Interval] = [ordered[0]]

        for start, end in ordered[1:]:
            prev_start, prev_end = merged[-1]
            if seconds(start) <= seconds(prev_end):
                if seconds(end) > seconds(prev_end):
                    merged[-1] = (prev_start, end)
            else:
                merged.append((start, end))

        return merged

    def _normalize_weekly_intervals(
        self,
        weekly: Dict[int, List[Interval]],
        *,
        calendar_id: str,
    ) -> Dict[int, List[Interval]]:
        normalized: Dict[int, List[Interval]] = {i: [] for i in range(7)}

        for weekday, intervals in weekly.items():
            for start_t, end_t in intervals:
                if end_t > start_t:
                    normalized[weekday].append((start_t, end_t))
                elif end_t < start_t:
                    # Split overnight shift into current-day and next-day portions.
                    normalized[weekday].append(
                        (start_t, time(23, 59, 59, 999999))
                    )
                    normalized[(weekday + 1) % 7].append(
                        (time(0, 0), end_t)
                    )
                    self._warn(
                        f"Calendar {calendar_id} overnight shift was split across two days.",
                        code="CALENDAR_OVERNIGHT_SPLIT",
                        table="CALENDAR",
                        severity="info",
                        context={
                            "calendar_id": calendar_id,
                            "weekday": weekday,
                            "start": start_t.isoformat(),
                            "end": end_t.isoformat(),
                        },
                    )

        return {
            day: self._merge_intervals(intervals)
            for day, intervals in normalized.items()
            if intervals
        }

    def _normalize_exception_intervals(
        self,
        exceptions: Dict[date, List[Interval]],
        *,
        calendar_id: str,
    ) -> Tuple[Dict[date, List[Interval]], Dict[date, List[Interval]]]:
        """
        Normalize date exceptions and return:
          (same_date_exceptions, carried_next_date_exceptions)
        """
        same_date: Dict[date, List[Interval]] = {}
        carried: Dict[date, List[Interval]] = {}

        for exc_date, intervals in exceptions.items():
            same_date.setdefault(exc_date, [])
            for start_t, end_t in intervals:
                if end_t > start_t:
                    same_date[exc_date].append((start_t, end_t))
                elif end_t < start_t:
                    same_date[exc_date].append(
                        (start_t, time(23, 59, 59, 999999))
                    )
                    next_date = exc_date + timedelta(days=1)
                    carried.setdefault(next_date, []).append((time(0, 0), end_t))
                    self._warn(
                        f"Calendar {calendar_id} overnight exception was split across dates.",
                        code="CALENDAR_EXCEPTION_OVERNIGHT_SPLIT",
                        table="CALENDAR",
                        severity="info",
                        context={
                            "calendar_id": calendar_id,
                            "date": exc_date.isoformat(),
                            "start": start_t.isoformat(),
                            "end": end_t.isoformat(),
                        },
                    )

        same_date = {
            d: self._merge_intervals(v)
            for d, v in same_date.items()
        }
        carried = {
            d: self._merge_intervals(v)
            for d, v in carried.items()
        }
        return same_date, carried

    @staticmethod
    def _fallback_working_week(hours_per_day: float, hours_per_week: float) -> Dict[int, List[Interval]]:
        """
        Deterministic fallback only when P6 clndr_data cannot be decoded.

        Infers approximate working days from hours/week divided by hours/day.
        The inferred week starts Monday. This is explicitly reported as a
        parser warning so forensic output can disclose the assumption.
        """
        hpd = hours_per_day if hours_per_day > 0 else 8.0
        hpw = hours_per_week if hours_per_week > 0 else hpd * 5.0

        working_days = int(round(hpw / hpd)) if hpd else 5
        working_days = min(max(working_days, 1), 7)

        start_dt = datetime(2000, 1, 1, 8, 0)
        finish_dt = start_dt + timedelta(hours=hpd)

        if finish_dt.date() == start_dt.date():
            intervals = [(start_dt.time(), finish_dt.time())]
        else:
            intervals = [(time(0, 0), time(23, 59, 59, 999999))]

        return {day: list(intervals) for day in range(working_days)}

    def _decode_calendar_row(self, row: pd.Series) -> Dict[str, Any]:
        cid = str(row.get("calendar_id", "") or "").strip()
        if cid in self._calendar_decode_cache:
            return self._calendar_decode_cache[cid]

        hours_per_day = self._num(row.get("hours_per_day"), 8.0) or 8.0
        hours_per_week = self._num(row.get("hours_per_week"), hours_per_day * 5.0)
        blob = str(row.get("calendar_data", "") or "")

        weekly = self._parse_weekday_blocks(blob)
        holidays, exceptions = self._parse_exceptions(blob)

        decode_status = "decoded"
        if not weekly:
            weekly = self._fallback_working_week(hours_per_day, hours_per_week)
            decode_status = "fallback"
            self._warn(
                f"Calendar {cid or '<unknown>'} working week could not be decoded; "
                "a deterministic hours/day + hours/week fallback was used.",
                code="CALENDAR_WEEK_FALLBACK",
                table="CALENDAR",
                severity="high",
                context={
                    "calendar_id": cid,
                    "hours_per_day": hours_per_day,
                    "hours_per_week": hours_per_week,
                },
            )

        weekly = self._normalize_weekly_intervals(weekly, calendar_id=cid)

        normalized_exceptions, carried = self._normalize_exception_intervals(
            exceptions,
            calendar_id=cid,
        )
        for d, intervals in carried.items():
            existing = normalized_exceptions.get(d, [])
            normalized_exceptions[d] = self._merge_intervals(existing + intervals)

        payload = {
            "calendar_id": cid,
            "calendar_name": str(row.get("calendar_name", "") or ""),
            "calendar_type": str(row.get("calendar_type", "") or ""),
            "base_calendar_id": str(row.get("base_calendar_id", "") or "").strip() or None,
            "hours_per_day": hours_per_day,
            "hours_per_week": hours_per_week,
            "weekly_intervals": weekly,
            "holidays": holidays,
            "exceptions": normalized_exceptions,
            "decode_status": decode_status,
            "raw_hash": hashlib.sha256(blob.encode("utf-8", errors="ignore")).hexdigest(),
        }
        self._calendar_decode_cache[cid] = payload
        return payload

    def get_calendar_diagnostics(self) -> List[Dict[str, Any]]:
        calendars_df = self.get_calendars()
        diagnostics: List[Dict[str, Any]] = []

        for _, row in calendars_df.iterrows():
            decoded = self._decode_calendar_row(row)
            diagnostics.append(
                {
                    "calendar_id": decoded["calendar_id"],
                    "calendar_name": decoded["calendar_name"],
                    "calendar_type": decoded["calendar_type"],
                    "base_calendar_id": decoded["base_calendar_id"],
                    "hours_per_day": decoded["hours_per_day"],
                    "hours_per_week": decoded["hours_per_week"],
                    "decode_status": decoded["decode_status"],
                    "working_weekdays": sorted(decoded["weekly_intervals"].keys()),
                    "holiday_count": len(decoded["holidays"]),
                    "exception_count": len(decoded["exceptions"]),
                    "calendar_hash": decoded["raw_hash"],
                }
            )

        return diagnostics

    def build_calendar_registry(self) -> CalendarRegistry:
        calendars_df = self.get_calendars()
        project = self.get_project()

        default_id = "DEFAULT"
        if not project.empty and "default_calendar_id" in project:
            value = str(project.iloc[0].get("default_calendar_id", "") or "").strip()
            if value:
                default_id = value

        if calendars_df.empty:
            self._warn(
                "CALENDAR table is missing or empty; standard 5d x 8h fallback will be used.",
                code="CALENDAR_TABLE_EMPTY",
                table="CALENDAR",
                severity="critical",
            )
            return CalendarRegistry({}, default_calendar_id=default_id)

        decoded_by_id: Dict[str, Dict[str, Any]] = {}
        rows_by_id: Dict[str, pd.Series] = {}

        for _, row in calendars_df.iterrows():
            cid = str(row.get("calendar_id", "") or "").strip()
            if not cid:
                continue
            rows_by_id[cid] = row
            decoded_by_id[cid] = self._decode_calendar_row(row)

        resolved: Dict[str, WorkCalendar] = {}
        resolving: set[str] = set()

        def resolve(cid: str) -> Optional[WorkCalendar]:
            if cid in resolved:
                return resolved[cid]
            if cid in resolving:
                self._warn(
                    f"Base-calendar inheritance cycle detected at calendar {cid}.",
                    code="CALENDAR_INHERITANCE_CYCLE",
                    table="CALENDAR",
                    severity="critical",
                    context={"calendar_id": cid},
                )
                return None

            payload = decoded_by_id.get(cid)
            if payload is None:
                return None

            resolving.add(cid)

            base_id = payload.get("base_calendar_id")
            base_calendar = resolve(base_id) if base_id and base_id in decoded_by_id else None

            weekly = (
                {day: list(intervals) for day, intervals in base_calendar.weekly_intervals.items()}
                if base_calendar
                else {}
            )
            holidays = set(base_calendar.holidays) if base_calendar else set()
            exceptions = (
                {d: list(intervals) for d, intervals in base_calendar.exceptions.items()}
                if base_calendar
                else {}
            )

            # Child weekly patterns override inherited weekdays only where the
            # child explicitly decoded them.
            for weekday, intervals in payload["weekly_intervals"].items():
                weekly[weekday] = list(intervals)

            holidays.update(payload["holidays"])
            for exc_date, intervals in payload["exceptions"].items():
                exceptions[exc_date] = list(intervals)
                holidays.discard(exc_date)

            cal = WorkCalendar(
                calendar_id=cid,
                name=payload["calendar_name"],
                weekly_intervals=weekly,
                holidays=holidays,
                exceptions=exceptions,
            )

            resolved[cid] = cal
            resolving.remove(cid)
            return cal

        for cid in decoded_by_id:
            resolve(cid)

        if default_id not in resolved:
            self._warn(
                f"Project default calendar {default_id} is not present in CALENDAR; "
                "CalendarRegistry fallback will be used.",
                code="DEFAULT_CALENDAR_NOT_FOUND",
                table="CALENDAR",
                severity="high",
                context={"default_calendar_id": default_id},
            )

        return CalendarRegistry(resolved, default_calendar_id=default_id)

    # ------------------------------------------------------------------
    # Forensic quality / metadata
    # ------------------------------------------------------------------

    def forensic_metadata(self) -> Dict[str, Any]:
        """
        Source-programme provenance and parser quality information for
        persisted analyses and forensic reports.
        """
        self._ensure()

        project = self.get_project()
        project_row = project.iloc[0].to_dict() if not project.empty else {}

        activities = self.get_activities()
        relationships = self.get_relationships()
        calendars = self.get_calendars()

        status_counts: Dict[str, int] = {}
        if not activities.empty and "status" in activities:
            status_counts = {
                str(k): int(v)
                for k, v in activities["status"].fillna("").astype(str).value_counts().to_dict().items()
            }

        rel_counts: Dict[str, int] = {}
        if not relationships.empty and "relationship_type" in relationships:
            rel_counts = {
                str(k): int(v)
                for k, v in relationships["relationship_type"].fillna("").astype(str).value_counts().to_dict().items()
            }

        data_date = project_row.get("data_date")
        if isinstance(data_date, pd.Timestamp):
            data_date = data_date.isoformat()

        return {
            "source_sha256": self.source_hash(),
            "project_id_pk": project_row.get("project_id_pk"),
            "project_code": project_row.get("project_code"),
            "project_name": project_row.get("project_name"),
            "data_date": data_date,
            "activity_count": int(len(activities)),
            "relationship_count": int(len(relationships)),
            "wbs_count": int(len(self.get_wbs())),
            "raw_task_row_count": int(len(self.tables.get("TASK", pd.DataFrame()))),
            "raw_relationship_row_count": int(len(self.tables.get("TASKPRED", pd.DataFrame()))),
            "blank_activity_pk_count": int(
                activities["activity_id_pk"].fillna("").astype(str).str.strip().eq("").sum()
            ) if not activities.empty and "activity_id_pk" in activities else 0,
            "calendar_count": int(len(calendars)),
            "activity_code_assignment_count": int(len(self.get_activity_code_assignments())),
            "task_udf_value_count": int(len(self.get_task_udfs())),
            "resource_assignment_count": int(len(self.get_resource_assignments())),
            "activity_status_counts": status_counts,
            "relationship_type_counts": rel_counts,
            "calendar_diagnostics": self.get_calendar_diagnostics(),
            "parse_warning_count": len(self.warnings),
            "parse_warnings": list(self.warnings),
        }

    def schedule_quality_snapshot(self) -> Dict[str, Any]:
        """
        Parser-level quality checks. Network-level checks remain in CPMEngine.
        """
        activities = self.get_activities()
        relationships = self.get_relationships()

        findings: List[Dict[str, Any]] = []

        if activities.empty:
            findings.append(
                {
                    "severity": "critical",
                    "code": "NO_ACTIVITIES",
                    "message": "No activities were parsed from the XER.",
                }
            )
            return {"findings": findings, "counts": {"activities": 0, "relationships": 0}}

        duplicate_ids = []
        if "activity_id" in activities:
            duplicates = activities[
                activities["activity_id"].fillna("").astype(str).duplicated(keep=False)
            ]
            duplicate_ids = sorted(
                {
                    str(v)
                    for v in duplicates["activity_id"].tolist()
                    if str(v).strip()
                }
            )
            if duplicate_ids:
                findings.append(
                    {
                        "severity": "high",
                        "code": "DUPLICATE_ACTIVITY_CODES",
                        "message": f"{len(duplicate_ids)} duplicate activity code(s) detected.",
                        "examples": duplicate_ids[:25],
                    }
                )

        negative_durations = []
        if "planned_duration_hrs" in activities:
            neg = activities[activities["planned_duration_hrs"] < 0]
            negative_durations = neg["activity_id"].astype(str).tolist()
            if negative_durations:
                findings.append(
                    {
                        "severity": "critical",
                        "code": "NEGATIVE_DURATIONS",
                        "message": f"{len(negative_durations)} activity(ies) have negative planned duration.",
                        "examples": negative_durations[:25],
                    }
                )

        invalid_relationships = 0
        if not relationships.empty:
            activity_pks = set(activities["activity_id_pk"].astype(str))
            for _, rel in relationships.iterrows():
                pred = str(rel.get("predecessor_activity_pk", ""))
                succ = str(rel.get("successor_activity_pk", ""))
                if pred not in activity_pks or succ not in activity_pks:
                    invalid_relationships += 1

            if invalid_relationships:
                findings.append(
                    {
                        "severity": "high",
                        "code": "EXTERNAL_OR_ORPHAN_RELATIONSHIPS",
                        "message": f"{invalid_relationships} relationship(s) reference activities outside the parsed programme.",
                    }
                )

        constrained_count = 0
        if "primary_constraint_type" in activities:
            constrained_count = int(
                activities["primary_constraint_type"]
                .fillna("")
                .astype(str)
                .str.strip()
                .ne("")
                .sum()
            )

        unknown_activity_types: List[str] = []
        if "activity_type_normalized" in activities:
            known = set(self.ACTIVITY_TYPE_MAP.values())
            unknown_activity_types = sorted(
                {
                    str(v)
                    for v in activities["activity_type_normalized"].fillna("").astype(str)
                    if str(v).strip() and str(v) not in known
                }
            )
            if unknown_activity_types:
                findings.append(
                    {
                        "severity": "warning",
                        "code": "UNKNOWN_ACTIVITY_TYPES",
                        "message": (
                            f"{len(unknown_activity_types)} unrecognized activity type token(s) "
                            "were preserved without semantic conversion."
                        ),
                        "examples": unknown_activity_types[:25],
                    }
                )

        milestone_duration_violations: List[str] = []
        if {"activity_id", "activity_type_normalized", "planned_duration_hrs"}.issubset(activities.columns):
            mask = (
                activities["activity_type_normalized"].isin(
                    ["START_MILESTONE", "FINISH_MILESTONE"]
                )
                & activities["planned_duration_hrs"].abs().gt(1e-9)
            )
            milestone_duration_violations = activities.loc[mask, "activity_id"].astype(str).tolist()
            if milestone_duration_violations:
                findings.append(
                    {
                        "severity": "high",
                        "code": "MILESTONE_NONZERO_DURATION",
                        "message": (
                            f"{len(milestone_duration_violations)} P6 milestone activity(ies) "
                            "carry non-zero planned duration."
                        ),
                        "examples": milestone_duration_violations[:25],
                    }
                )

        constraint_without_date: List[str] = []
        if "activity_id" in activities:
            for _, activity in activities.iterrows():
                for prefix in ("primary", "secondary"):
                    ctype = str(activity.get(f"{prefix}_constraint_type", "") or "").strip()
                    cdate = activity.get(f"{prefix}_constraint_date")
                    if ctype and (cdate is None or pd.isna(cdate)):
                        constraint_without_date.append(str(activity.get("activity_id", "")))
                        break
            if constraint_without_date:
                findings.append(
                    {
                        "severity": "high",
                        "code": "CONSTRAINT_WITHOUT_DATE",
                        "message": (
                            f"{len(constraint_without_date)} constrained activity(ies) have a "
                            "constraint type but no parsed constraint date."
                        ),
                        "examples": constraint_without_date[:25],
                    }
                )

        fallback_calendars = [
            x for x in self.get_calendar_diagnostics()
            if x.get("decode_status") == "fallback"
        ]
        if fallback_calendars:
            findings.append(
                {
                    "severity": "high",
                    "code": "CALENDAR_FALLBACK_USED",
                    "message": f"{len(fallback_calendars)} calendar(s) required deterministic fallback decoding.",
                    "calendar_ids": [x["calendar_id"] for x in fallback_calendars],
                }
            )

        return {
            "counts": {
                "activities": int(len(activities)),
                "relationships": int(len(relationships)),
                "constraints": constrained_count,
                "calendar_fallbacks": len(fallback_calendars),
                "external_or_orphan_relationships": invalid_relationships,
                "unknown_activity_type_tokens": len(unknown_activity_types),
                "milestone_nonzero_duration": len(milestone_duration_violations),
                "constraint_without_date": len(constraint_without_date),
                "activity_code_assignments": int(len(self.get_activity_code_assignments())),
                "task_udf_values": int(len(self.get_task_udfs())),
                "resource_assignments": int(len(self.get_resource_assignments())),
            },
            "findings": findings,
            "parser_warning_count": len(self.warnings),
            "parser_warnings": list(self.warnings),
            "source_sha256": self.source_hash(),
        }
