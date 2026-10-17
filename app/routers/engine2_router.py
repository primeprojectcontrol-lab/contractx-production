from __future__ import annotations

import io
import json
import math
import os
import re
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Literal

from dotenv import load_dotenv
import pandas as pd
from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator

from app.forensic_xlsx_exporter import build_forensic_gantt_xlsx
from app.engine2_cpm.xer_writer import XERWriterError, build_impacted_xer

from app.engine2_cpm import (
    CPMEngine,
    CPMValidationError,
    CriticalMode,
    FloatMode,
    LagCalendarMode,
    MultipleFloatPathMode,
    ProgressMode,
    SchedulingOptions,
    XERParser,
)


router = APIRouter(
    prefix="/api/v1/engine2",
    tags=["Engine 2: CPM & Delay Analytics"],
)

MAX_DELAY_ANALYSES_PER_PROJECT = 3


# =====================================================================
# SUPABASE
# =====================================================================

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY", "")
)

# ContractX Engine 2 schedule source files live inside the existing
# private Supabase bucket `project-documents`, under the virtual
# `project-schedules/` prefix. Keep this explicit so a stale environment
# variable cannot redirect uploads to a non-existent bucket.
SCHEDULE_STORAGE_BUCKET = "project-documents"
SCHEDULE_STORAGE_PREFIX = "project-schedules"

try:
    from supabase import Client, create_client

    supabase_client: Optional[Client] = (
        create_client(SUPABASE_URL, SUPABASE_KEY)
        if SUPABASE_URL and SUPABASE_KEY
        else None
    )
except Exception:
    supabase_client = None


# =====================================================================
# MODELS
# =====================================================================

class SchedulingOptionsPayload(BaseModel):
    progress_mode: ProgressMode = ProgressMode.RETAINED_LOGIC
    float_mode: FloatMode = FloatMode.FINISH_FLOAT
    critical_mode: CriticalMode = CriticalMode.LONGEST_PATH
    lag_calendar_mode: LagCalendarMode = LagCalendarMode.PREDECESSOR

    use_expected_finish_dates: bool = True
    make_open_ended_critical: bool = False
    ignore_external_relationships: bool = True

    calculate_multiple_float_paths: bool = True
    multiple_float_path_mode: MultipleFloatPathMode = (
        MultipleFloatPathMode.FREE_FLOAT
    )
    multiple_float_path_count: int = Field(5, ge=1, le=50)
    multiple_float_path_end_activity: Optional[str] = None

    level_resources: bool = False
    preserve_scheduled_early_late_dates: bool = True
    total_float_threshold_hours: float = 0.0


class FragnetItem(BaseModel):
    """
    Backward-compatible single-activity fragnet.

    When delay_start_date + delay_finish_date are supplied, the dates are the
    authoritative elapsed event window. duration_hours remains mandatory for
    backward compatibility with existing clients, but the updated CPM engine
    derives the actual P6 working duration from the inherited source calendar.
    """

    fragnet_id: str
    fragnet_name: str
    duration_hours: float = Field(..., gt=0)

    # Optional deterministic forensic event window.
    # Example: 2026-04-01 through 2026-04-30 = 30 elapsed calendar days.
    delay_start_date: Optional[str] = None
    delay_finish_date: Optional[str] = None

    predecessor_activity_pk: str
    successor_activity_pk: str

    relationship_type: str = "FS"
    lag_hours: float = 0.0
    calendar_id: Optional[str] = None

    @model_validator(mode="after")
    def validate_delay_window(self):
        if bool(self.delay_start_date) != bool(self.delay_finish_date):
            raise ValueError(
                "delay_start_date and delay_finish_date must be supplied together."
            )
        if self.delay_start_date and self.delay_finish_date:
            start = pd.to_datetime(self.delay_start_date, errors="coerce")
            finish = pd.to_datetime(self.delay_finish_date, errors="coerce")
            if pd.isna(start) or pd.isna(finish):
                raise ValueError("TIA delay window contains an invalid date.")
            if finish < start:
                raise ValueError(
                    "TIA delay_finish_date cannot be earlier than delay_start_date."
                )
        return self


class TIARequest(BaseModel):
    """
    Backward-compatible single-activity TIA request.
    """

    tenant_id: str
    project_id: str
    schedule_id: str
    fragnet: FragnetItem
    scheduling_options: SchedulingOptionsPayload = Field(
        default_factory=SchedulingOptionsPayload
    )


class FragnetActivityPayload(BaseModel):
    activity_id_pk: str
    activity_id: Optional[str] = None
    activity_name: str
    planned_duration_hrs: float = Field(..., ge=0)

    # Optional deterministic forensic event window. When both dates are present,
    # the CPM engine calculates P6 working duration inside this elapsed window.
    delay_start_date: Optional[str] = None
    delay_finish_date: Optional[str] = None

    calendar_id: Optional[str] = None
    activity_type: Optional[str] = None
    status: str = "TK_NOTSTART"

    planned_start: Optional[str] = None
    planned_finish: Optional[str] = None
    actual_start: Optional[str] = None
    actual_finish: Optional[str] = None
    remaining_start: Optional[str] = None
    remaining_finish: Optional[str] = None
    expected_finish: Optional[str] = None

    primary_constraint_type: Optional[str] = None
    primary_constraint_date: Optional[str] = None
    secondary_constraint_type: Optional[str] = None
    secondary_constraint_date: Optional[str] = None

    @model_validator(mode="after")
    def validate_delay_window(self):
        if bool(self.delay_start_date) != bool(self.delay_finish_date):
            raise ValueError(
                "delay_start_date and delay_finish_date must be supplied together."
            )
        if self.delay_start_date and self.delay_finish_date:
            start = pd.to_datetime(self.delay_start_date, errors="coerce")
            finish = pd.to_datetime(self.delay_finish_date, errors="coerce")
            if pd.isna(start) or pd.isna(finish):
                raise ValueError("TIA delay window contains an invalid date.")
            if finish < start:
                raise ValueError(
                    "TIA delay_finish_date cannot be earlier than delay_start_date."
                )
        return self


class FragnetRelationshipPayload(BaseModel):
    predecessor_activity_pk: str
    successor_activity_pk: str
    relationship_type: str = "FS"
    lag_hrs: float = 0.0


class ForensicEventPayload(BaseModel):
    event_id: str
    event_title: str
    description: Optional[str] = None

    event_start: Optional[str] = None
    event_end: Optional[str] = None
    notice_date: Optional[str] = None

    cause_category: Optional[str] = None
    responsibility_category: Optional[str] = None
    delay_type: Optional[str] = None

    source_reference: Optional[str] = None
    notes: Optional[str] = None


class MultiActivityTIARequest(BaseModel):
    tenant_id: str
    project_id: str
    schedule_id: str

    fragnet_id: str
    fragnet_name: str

    fragnet_activities: List[FragnetActivityPayload] = Field(min_length=1)
    fragnet_relationships: List[FragnetRelationshipPayload] = Field(
        default_factory=list
    )
    insertion_relationships: List[FragnetRelationshipPayload] = Field(
        min_length=1
    )
    remove_relationships: List[FragnetRelationshipPayload] = Field(
        default_factory=list
    )

    event: Optional[ForensicEventPayload] = None
    affected_activity_ids: List[str] = Field(default_factory=list)

    scheduling_options: SchedulingOptionsPayload = Field(
        default_factory=SchedulingOptionsPayload
    )

    @model_validator(mode="after")
    def validate_fragnet_ids(self):
        ids = [x.activity_id_pk.strip() for x in self.fragnet_activities]
        if any(not x for x in ids):
            raise ValueError("Every fragnet activity requires activity_id_pk.")
        if len(ids) != len(set(ids)):
            raise ValueError("Fragnet activity_id_pk values must be unique.")
        return self


class ForensicEventModelRequest(BaseModel):
    tenant_id: str
    project_id: str
    schedule_id: str
    event: ForensicEventPayload
    affected_activity_ids: List[str] = Field(default_factory=list)
    scheduling_options: SchedulingOptionsPayload = Field(
        default_factory=SchedulingOptionsPayload
    )


class AnalysisExportRequest(BaseModel):
    analysis_id: str
    format: str = "xlsx"

    # Optional for backward compatibility with the existing UI.
    # Production UI should send both so retrieval is tenant/project scoped.
    tenant_id: Optional[str] = None
    project_id: Optional[str] = None

    @model_validator(mode="after")
    def validate_scope(self):
        if bool(self.tenant_id) != bool(self.project_id):
            raise ValueError(
                "tenant_id and project_id must either both be supplied or both be omitted."
            )
        return self



class XERExportRequest(BaseModel):
    analysis_id: str = Field(..., min_length=1)
    tenant_id: str = Field(..., min_length=1)
    project_id: str = Field(..., min_length=1)
    write_calculated_dates: bool = True


class ForensicAssessmentRequest(BaseModel):
    """
    Single heavy Engine 2 schedule assessment request.

    The endpoint intentionally returns one consolidated forensic assessment
    object instead of proliferating standalone functional deliverables.
    """
    tenant_id: str = Field(..., min_length=1)
    project_id: str = Field(..., min_length=1)
    schedule_id: str = Field(..., min_length=1)
    persist: bool = True
    scheduling_options: SchedulingOptionsPayload = Field(
        default_factory=SchedulingOptionsPayload
    )


class ProgrammeScopeRequest(BaseModel):
    tenant_id: str = Field(..., min_length=1)
    project_id: str = Field(..., min_length=1)


class ProgrammeUpdateRequest(BaseModel):
    tenant_id: str = Field(..., min_length=1)
    project_id: str = Field(..., min_length=1)

    programme_title: Optional[str] = None
    revision_number: Optional[int] = Field(default=None, ge=0)
    revision_label: Optional[str] = None
    programme_status: Optional[Literal[
        "DRAFT",
        "SUBMITTED",
        "ACCEPTED",
        "REJECTED",
        "SUPERSEDED",
        "ARCHIVED",
    ]] = None
    baseline_schedule_id: Optional[str] = None

    @model_validator(mode="after")
    def validate_text_fields(self):
        if self.programme_title is not None and not self.programme_title.strip():
            raise ValueError("programme_title cannot be blank.")
        if self.revision_label is not None and not self.revision_label.strip():
            raise ValueError("revision_label cannot be blank.")
        return self




class RegisteredApAbRequest(BaseModel):
    tenant_id: str = Field(..., min_length=1)
    project_id: str = Field(..., min_length=1)
    baseline_schedule_id: str = Field(..., min_length=1)
    as_built_schedule_id: str = Field(..., min_length=1)
    persist: bool = True

    @model_validator(mode="after")
    def validate_programmes(self):
        if self.baseline_schedule_id == self.as_built_schedule_id:
            raise ValueError("Baseline and As-Built programme IDs must be different.")
        return self


class RegisteredWindowAnalysisRequest(BaseModel):
    tenant_id: str = Field(..., min_length=1)
    project_id: str = Field(..., min_length=1)
    window_a_schedule_id: str = Field(..., min_length=1)
    window_b_schedule_id: str = Field(..., min_length=1)
    persist: bool = True

    @model_validator(mode="after")
    def validate_programmes(self):
        if self.window_a_schedule_id == self.window_b_schedule_id:
            raise ValueError("Window A and Window B programme IDs must be different.")
        return self


# =====================================================================
# GENERIC HELPERS
# =====================================================================

def _safe_records(df: pd.DataFrame) -> List[Dict[str, Any]]:
    if df is None or df.empty:
        return []

    clean = df.copy()

    for col in clean.columns:
        if pd.api.types.is_datetime64_any_dtype(clean[col]):
            clean[col] = clean[col].apply(
                lambda v: v.isoformat() if pd.notna(v) else None
            )

    clean = clean.astype(object).where(pd.notna(clean), None)
    return clean.to_dict(orient="records")


def _json_safe(value: Any) -> Any:
    """
    Convert nested Python/pandas/numpy values into strict JSON-safe values.

    JSON does not permit NaN, +Infinity or -Infinity.  Primavera/XER data can
    legitimately contain missing numeric values after coercion, so preserve
    those as JSON null rather than inventing zero.
    """
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    if isinstance(value, tuple):
        return [_json_safe(v) for v in value]
    if isinstance(value, set):
        return sorted(_json_safe(v) for v in value)
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()

    if not isinstance(value, (str, bytes)):
        try:
            if pd.isna(value):
                return None
        except Exception:
            pass

        # Handle Python, numpy and pandas numeric scalars uniformly.
        try:
            number = float(value)
            if isinstance(value, (int, float)) or hasattr(value, "dtype"):
                if not math.isfinite(number):
                    return None
        except (TypeError, ValueError, OverflowError):
            pass

    return value


def _optional_float(value: Any) -> Optional[float]:
    """Return a finite float or None without inventing zero for missing P6 data."""
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError, OverflowError):
        return None


def _calendar_hours_per_day_map(parser: XERParser) -> Dict[str, float]:
    """
    Resolve calendar-specific hours/day for P6 display conversions.

    P6 stores duration/float in hours in XER.  Dividing everything by a hard
    coded 8 hours can materially misstate programmes that use 9h, 10h, 12h,
    24h or mixed calendars.
    """
    result: Dict[str, float] = {}
    try:
        calendars = parser.get_calendars()
    except Exception:
        return result

    if calendars is None or calendars.empty:
        return result

    for item in calendars.to_dict(orient="records"):
        cid = str(item.get("calendar_id", "") or "").strip()
        hpd = _optional_float(item.get("hours_per_day"))
        if cid and hpd and hpd > 0:
            result[cid] = hpd

    return result


def _activity_hours_per_day(
    source: Dict[str, Any],
    *,
    calendar_hours: Dict[str, float],
    default: float = 8.0,
) -> float:
    cid = str(source.get("calendar_id", "") or "").strip()
    value = calendar_hours.get(cid)
    return value if value and value > 0 else default


def _options_from_payload(
    payload: SchedulingOptionsPayload,
) -> SchedulingOptions:
    return SchedulingOptions(
        progress_mode=payload.progress_mode,
        float_mode=payload.float_mode,
        critical_mode=payload.critical_mode,
        lag_calendar_mode=payload.lag_calendar_mode,
        use_expected_finish_dates=payload.use_expected_finish_dates,
        make_open_ended_critical=payload.make_open_ended_critical,
        ignore_external_relationships=payload.ignore_external_relationships,
        calculate_multiple_float_paths=payload.calculate_multiple_float_paths,
        multiple_float_path_mode=payload.multiple_float_path_mode,
        multiple_float_path_count=payload.multiple_float_path_count,
        multiple_float_path_end_activity=payload.multiple_float_path_end_activity,
        level_resources=payload.level_resources,
        preserve_scheduled_early_late_dates=(
            payload.preserve_scheduled_early_late_dates
        ),
        total_float_threshold_hours=payload.total_float_threshold_hours,
    )


def _project_metadata(parser: XERParser) -> Dict[str, Any]:
    project_df = parser.get_project()

    if project_df.empty:
        return {}

    row = project_df.iloc[0]

    def iso(col: str) -> Optional[str]:
        value = row.get(col)
        if value is None or pd.isna(value):
            return None
        return pd.Timestamp(value).isoformat()

    return {
        "project_id_pk": row.get("project_id_pk"),
        "project_code": row.get("project_code"),
        "project_name": row.get("project_name"),
        "planned_start": iso("planned_start"),
        "planned_finish": iso("planned_finish"),
        "scheduled_finish": iso("scheduled_finish"),
        "data_date": iso("data_date"),
        "default_calendar_id": row.get("default_calendar_id"),
    }


def _get_project_date(
    parser: XERParser,
    column: str,
) -> Optional[datetime]:
    project_df = parser.get_project()

    if project_df.empty or column not in project_df.columns:
        return None

    value = project_df.iloc[0].get(column)

    if value is None or pd.isna(value):
        return None

    return pd.Timestamp(value).to_pydatetime()


def _build_engine(
    parser: XERParser,
    options: Optional[SchedulingOptions] = None,
) -> CPMEngine:
    activities_df = parser.get_activities()
    relationships_df = parser.get_relationships()

    if activities_df.empty:
        raise HTTPException(
            status_code=400,
            detail="No Primavera activities were found in the uploaded XER.",
        )

    calendars = parser.build_calendar_registry()

    return CPMEngine(
        activities_df=activities_df,
        relationships_df=relationships_df,
        calendars=calendars,
        options=options or SchedulingOptions(),
        data_date=_get_project_date(parser, "data_date"),
        project_start=_get_project_date(parser, "planned_start"),
        resources_df=parser.get_resources(),
        assignments_df=parser.get_resource_assignments(),
    )


def _summary_gantt(
    activities: List[Dict[str, Any]],
    *,
    max_rows: int = 60,
) -> List[Dict[str, Any]]:
    if not activities:
        return []

    ordered = sorted(
        activities,
        key=lambda x: (
            not bool(x.get("is_longest_path")),
            not bool(x.get("is_critical")),
            x.get("float_path") or 999,
            x.get("early_start") or "",
        ),
    )

    result: List[Dict[str, Any]] = []
    seen = set()

    for row in ordered:
        key = row.get("activity_pk") or row.get("activity_id")
        if key in seen:
            continue

        seen.add(key)

        result.append(
            {
                "activity_pk": row.get("activity_pk"),
                "activity_id": row.get("activity_id"),
                "activity_name": row.get("activity_name"),
                "start": row.get("early_start"),
                "finish": row.get("early_finish"),
                "late_start": row.get("late_start"),
                "late_finish": row.get("late_finish"),
                "total_float_hours": row.get("total_float_hours"),
                "free_float_hours": row.get("free_float_hours"),
                "is_critical": row.get("is_critical"),
                "is_longest_path": row.get("is_longest_path"),
                "float_path": row.get("float_path"),
                "float_path_order": row.get("float_path_order"),
            }
        )

        if len(result) >= max_rows:
            break

    return result


def _gantt_snapshot_from_cpm(
    activities: List[Dict[str, Any]],
    *,
    parser: XERParser,
    fragnet_activity_pks: Optional[set[str]] = None,
) -> List[Dict[str, Any]]:
    source = parser.get_activities()
    source_by_pk: Dict[str, Dict[str, Any]] = {}

    if not source.empty:
        for row in source.to_dict(orient="records"):
            source_by_pk[str(row.get("activity_id_pk", "") or "")] = row

    fragnet_activity_pks = fragnet_activity_pks or set()
    out: List[Dict[str, Any]] = []

    for item in activities or []:
        pk = str(item.get("activity_pk", "") or "")
        base = source_by_pk.get(pk, {})
        duration_hours = float(
            item.get("duration_hours", base.get("planned_duration_hrs", 0)) or 0
        )
        total_float_hours = float(item.get("total_float_hours", 0) or 0)
        is_fragnet = pk in fragnet_activity_pks

        out.append(
            {
                "activity_id_pk": pk,
                "activity_id": str(item.get("activity_id", "") or pk),
                "activity_name": str(item.get("activity_name", "") or ""),
                "wbs_path": (
                    "DELAY FRAGNET"
                    if is_fragnet
                    else str(base.get("wbs_path", "") or base.get("wbs_code", "") or "")
                ),
                **(
                    {
                        "activity_type": "TASK_DEPENDENT",
                        "activity_type_raw": "",
                        "activity_type_normalized": "TASK_DEPENDENT",
                        "is_start_milestone": False,
                        "is_finish_milestone": False,
                    }
                    if is_fragnet
                    else _activity_milestone_flags(base)
                ),
                "original_duration_days": round(duration_hours / 8.0, 2),
                "start": item.get("early_start"),
                "finish": item.get("early_finish"),
                "total_float_days": round(total_float_hours / 8.0, 2),
                "is_longest_path": bool(item.get("is_longest_path")),
                "is_critical": total_float_hours <= 0.0,
                "is_fragnet": is_fragnet,
            }
        )

    return out


def _gantt_snapshot_from_frame(
    df: pd.DataFrame,
    *,
    mode: Literal["planned", "actual", "window"],
) -> List[Dict[str, Any]]:
    if df is None or df.empty:
        return []

    def first(row: Dict[str, Any], *keys: str) -> Any:
        for key in keys:
            value = row.get(key)
            if value is not None and not pd.isna(value):
                return value
        return None

    def iso(value: Any) -> Optional[str]:
        if value is None or pd.isna(value):
            return None
        return pd.Timestamp(value).isoformat()

    rows: List[Dict[str, Any]] = []

    for raw in df.to_dict(orient="records"):
        if mode == "planned":
            start = first(raw, "planned_start", "early_start")
            finish = first(raw, "planned_finish", "early_finish")
        elif mode == "actual":
            start = first(raw, "actual_start", "remaining_start", "early_start", "planned_start")
            finish = first(raw, "actual_finish", "remaining_finish", "early_finish", "planned_finish")
        else:
            start = first(raw, "remaining_start", "early_start", "planned_start", "actual_start")
            finish = first(raw, "remaining_finish", "early_finish", "planned_finish", "actual_finish")

        duration_hours = float(
            first(raw, "planned_duration_hrs", "remaining_duration_hrs") or 0
        )
        total_float_hours = float(raw.get("total_float_hrs", 0) or 0)

        rows.append(
            {
                "activity_id_pk": str(raw.get("activity_id_pk", "") or ""),
                "activity_id": str(raw.get("activity_id", "") or ""),
                "activity_name": str(raw.get("activity_name", "") or ""),
                "wbs_path": str(raw.get("wbs_path", "") or raw.get("wbs_code", "") or ""),
                **_activity_milestone_flags(raw),
                "original_duration_days": round(duration_hours / 8.0, 2),
                "start": iso(start),
                "finish": iso(finish),
                "total_float_days": round(total_float_hours / 8.0, 2),
                "is_longest_path": False,
                "is_critical": total_float_hours <= 0.0,
                "is_fragnet": False,
            }
        )

    return rows


def _validate_xer_upload(file: UploadFile) -> None:
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Schedule file name is missing.",
        )

    if not file.filename.lower().endswith(".xer"):
        raise HTTPException(
            status_code=400,
            detail=(
                "Engine 2 v4 currently requires Primavera P6 .xer files. "
                "MS Project XML requires the dedicated XML ingestion path."
            ),
        )


async def _parser_from_upload(file: UploadFile) -> XERParser:
    _validate_xer_upload(file)

    raw = await file.read()
    if not raw:
        raise HTTPException(
            status_code=400,
            detail=f"Uploaded schedule {file.filename!r} is empty.",
        )

    parser = XERParser(raw.decode("utf-8", errors="ignore"))
    parser.parse()
    return parser


def _inclusive_calendar_day_count(
    start_value: Any,
    finish_value: Any,
) -> Optional[int]:
    """
    Inclusive elapsed calendar-day count for date-driven TIA event windows.

    2026-04-01 through 2026-04-30 returns 30.
    """
    if not start_value or not finish_value:
        return None

    start = pd.to_datetime(start_value, errors="coerce")
    finish = pd.to_datetime(finish_value, errors="coerce")
    if pd.isna(start) or pd.isna(finish):
        return None

    return int((finish.normalize() - start.normalize()).days) + 1


def _find_calculated_activity(
    activities: List[Dict[str, Any]],
    activity_pk: str,
) -> Dict[str, Any]:
    target = str(activity_pk or "").strip()
    if not target:
        return {}

    for item in activities or []:
        pk = str(
            item.get("activity_pk")
            or item.get("activity_id_pk")
            or ""
        ).strip()
        if pk == target:
            return item
    return {}


def _tia_event_window_summary(
    *,
    activity_pk: str,
    requested_start: Optional[str],
    requested_finish: Optional[str],
    after_schedule_activities: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Stable API payload for the compact TIA UI.

    Calendar/P6 working-hour details remain internal. The UI can show only the
    event start, forecast end and elapsed calendar duration, while ContractX
    retains calculated CPM dates for audit and XER regression.
    """
    calculated = _find_calculated_activity(
        after_schedule_activities,
        activity_pk,
    )

    return {
        "activity_id_pk": str(activity_pk or ""),
        "requested_impact_start_date": requested_start,
        "requested_forecast_end_date": requested_finish,
        "elapsed_impact_calendar_days": _inclusive_calendar_day_count(
            requested_start,
            requested_finish,
        ),
        "calculated_start": calculated.get("early_start"),
        "calculated_finish": calculated.get("early_finish"),
    }


def _forensic_disclaimer() -> Dict[str, str]:
    return {
        "calculation_scope": (
            "Engine 2 reports deterministic schedule facts and calculated "
            "network effects from the supplied programme data."
        ),
        "legal_scope": (
            "The calculation does not by itself determine contractual "
            "entitlement, responsibility, excusability, compensability, "
            "concurrency, damages or legal liability."
        ),
    }



def _load_source_xer_content(
    *,
    tenant_id: str,
    project_id: str,
    schedule_id: str,
) -> tuple[Dict[str, Any], str]:
    client = _require_supabase()
    row = _load_schedule_row(
        tenant_id=tenant_id,
        project_id=project_id,
        schedule_id=schedule_id,
    )

    file_path = row.get("file_path")
    if not file_path:
        raise HTTPException(
            status_code=422,
            detail="Schedule record has no stored XER path.",
        )

    try:
        raw_bytes = (
            client.storage
            .from_(SCHEDULE_STORAGE_BUCKET)
            .download(file_path)
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to download source XER for export: {str(exc)}",
        )

    return row, raw_bytes.decode("utf-8", errors="ignore")


def _normalise_relationship_for_xer(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "predecessor_activity_pk": str(
            row.get("predecessor_activity_pk")
            or row.get("pred")
            or row.get("pred_task_id")
            or ""
        ),
        "successor_activity_pk": str(
            row.get("successor_activity_pk")
            or row.get("succ")
            or row.get("task_id")
            or ""
        ),
        "relationship_type": str(
            row.get("relationship_type")
            or row.get("rel_type")
            or row.get("pred_type")
            or "FS"
        ),
        "lag_hrs": float(
            row.get("lag_hrs", row.get("lag_hours", row.get("lag_hr_cnt", 0))) or 0
        ),
    }


def _source_relationships_for_xer(parser: XERParser) -> List[Dict[str, Any]]:
    df = parser.get_relationships()
    if df is None or df.empty:
        return []
    return [
        _normalise_relationship_for_xer(row)
        for row in df.to_dict(orient="records")
    ]


def _dedupe_relationships(
    relationships: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    seen = set()
    out: List[Dict[str, Any]] = []
    for row in relationships:
        item = _normalise_relationship_for_xer(row)
        key = (
            item["predecessor_activity_pk"],
            item["successor_activity_pk"],
            item["relationship_type"].upper(),
            float(item["lag_hrs"]),
        )
        if not item["predecessor_activity_pk"] or not item["successor_activity_pk"]:
            continue
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _single_tia_relationships_for_xer(
    *,
    parser: XERParser,
    fragnet: Dict[str, Any],
) -> List[Dict[str, Any]]:
    relationships = _source_relationships_for_xer(parser)

    predecessor = str(fragnet.get("predecessor_activity_pk", "") or "")
    successor = str(fragnet.get("successor_activity_pk", "") or "")
    fragnet_id = str(fragnet.get("fragnet_id", "") or "")
    rel_type = str(fragnet.get("relationship_type", "FS") or "FS")
    lag = float(fragnet.get("lag_hours", 0) or 0)

    relationships = [
        rel for rel in relationships
        if not (
            rel.get("predecessor_activity_pk") == predecessor
            and rel.get("successor_activity_pk") == successor
        )
    ]

    relationships.extend([
        {
            "predecessor_activity_pk": predecessor,
            "successor_activity_pk": fragnet_id,
            "relationship_type": rel_type,
            "lag_hrs": lag,
        },
        {
            "predecessor_activity_pk": fragnet_id,
            "successor_activity_pk": successor,
            "relationship_type": rel_type,
            "lag_hrs": lag,
        },
    ])

    return _dedupe_relationships(relationships)


def _multi_tia_relationships_for_xer(
    *,
    parser: XERParser,
    fragnet: Dict[str, Any],
) -> List[Dict[str, Any]]:
    relationships = _source_relationships_for_xer(parser)

    removals = {
        (
            str(x.get("predecessor_activity_pk", "") or ""),
            str(x.get("successor_activity_pk", "") or ""),
            str(x.get("relationship_type", "FS") or "FS").upper(),
        )
        for x in (fragnet.get("remove_relationships", []) or [])
    }

    relationships = [
        rel for rel in relationships
        if (
            str(rel.get("predecessor_activity_pk", "") or ""),
            str(rel.get("successor_activity_pk", "") or ""),
            str(rel.get("relationship_type", "FS") or "FS").upper(),
        ) not in removals
    ]

    relationships.extend(
        _normalise_relationship_for_xer(x)
        for x in (fragnet.get("relationships", []) or [])
    )
    relationships.extend(
        _normalise_relationship_for_xer(x)
        for x in (fragnet.get("insertion_relationships", []) or [])
    )

    return _dedupe_relationships(relationships)


def _template_map_for_xer(analysis: Dict[str, Any]) -> Dict[str, str]:
    fragnet = analysis.get("fragnet") or {}
    result: Dict[str, str] = {}

    if analysis.get("tia_mode") == "single_activity_compatibility":
        fragnet_id = str(fragnet.get("fragnet_id", "") or "")
        predecessor = str(fragnet.get("predecessor_activity_pk", "") or "")
        if fragnet_id and predecessor:
            result[fragnet_id] = predecessor
        return result

    activities = fragnet.get("activities", []) or []
    insertions = fragnet.get("insertion_relationships", []) or []
    synthetic_ids = {
        str(x.get("activity_id_pk", "") or "")
        for x in activities
        if x.get("activity_id_pk")
    }

    for activity_id in synthetic_ids:
        for rel in insertions:
            pred = str(rel.get("predecessor_activity_pk", "") or "")
            succ = str(rel.get("successor_activity_pk", "") or "")
            if succ == activity_id and pred and pred not in synthetic_ids:
                result[activity_id] = pred
                break
        if activity_id in result:
            continue
        for rel in insertions:
            pred = str(rel.get("predecessor_activity_pk", "") or "")
            succ = str(rel.get("successor_activity_pk", "") or "")
            if pred == activity_id and succ and succ not in synthetic_ids:
                result[activity_id] = succ
                break

    return result


def _merge_fragnet_metadata_into_impacted(
    impacted_activities: List[Dict[str, Any]],
    analysis: Dict[str, Any],
) -> List[Dict[str, Any]]:
    fragnet = analysis.get("fragnet") or {}
    fragnet_rows = (
        [fragnet]
        if analysis.get("tia_mode") == "single_activity_compatibility"
        else (fragnet.get("activities", []) or [])
    )

    by_pk = {
        str(x.get("activity_id_pk") or x.get("activity_pk") or ""): dict(x)
        for x in (impacted_activities or [])
        if str(x.get("activity_id_pk") or x.get("activity_pk") or "")
    }

    for meta in fragnet_rows:
        pk = str(
            meta.get("activity_id_pk")
            or meta.get("activity_pk")
            or meta.get("fragnet_id")
            or ""
        )
        if not pk:
            continue

        calculated = by_pk.get(pk, {})
        merged = dict(meta)
        merged.update(calculated)
        merged.setdefault("activity_id_pk", pk)
        merged.setdefault(
            "activity_id",
            meta.get("activity_id") or meta.get("fragnet_id") or pk,
        )
        merged.setdefault(
            "activity_name",
            meta.get("activity_name") or meta.get("fragnet_name") or pk,
        )
        merged.setdefault(
            "planned_duration_hrs",
            float(
                meta.get("planned_duration_hrs")
                or meta.get("duration_hours")
                or 0
            ),
        )
        by_pk[pk] = merged

    return list(by_pk.values())


# =====================================================================
# PERSISTENCE HELPERS
# =====================================================================

def _require_supabase() -> Client:
    if not supabase_client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase is required for this persisted Engine 2 operation.",
        )
    return supabase_client


# =====================================================================
# AUTHORIZATION HELPERS
# =====================================================================

def _bearer_token(authorization: Optional[str]) -> str:
    """
    Require a Supabase bearer token on protected Delay Analysis routes.

    The service-role client remains backend-only.  The caller's bearer token is
    independently validated before any project-scoped service-role operation.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    return token


def _require_authenticated_user(
    authorization: Optional[str],
) -> str:
    """
    Validate the caller with Supabase Auth and return the authenticated user ID.
    """
    client = _require_supabase()
    token = _bearer_token(authorization)

    try:
        auth_response = client.auth.get_user(token)
        user = getattr(auth_response, "user", None)
        user_id = getattr(user, "id", None)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
        ) from exc

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
        )

    return str(user_id)


def _is_platform_admin(
    *,
    client,
    user_id: str,
) -> bool:
    try:
        response = (
            client.table("user_profiles")
            .select("platform_role")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception:
        return False

    rows = response.data or []
    return bool(
        rows
        and str(rows[0].get("platform_role") or "").upper()
        == "PLATFORM_ADMIN"
    )


def _require_project_access_for_user(
    *,
    user_id: str,
    tenant_id: str,
    project_id: str,
) -> None:
    """
    Authorize an already-authenticated caller against the live project registry.

    Authorization is based on projects + project_users, not on tenant/project IDs
    supplied by the frontend.  Project creators, ACTIVE project members and
    PLATFORM_ADMIN users are permitted.
    """
    client = _require_supabase()

    try:
        project_response = (
            client.table("projects")
            .select("id,tenant_id,created_by")
            .eq("id", project_id)
            .eq("tenant_id", tenant_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to validate project access.",
        ) from exc

    projects = project_response.data or []
    if not projects:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    project = projects[0]
    if str(project.get("created_by") or "") == user_id:
        return

    try:
        membership_response = (
            client.table("project_users")
            .select("role,status")
            .eq("project_id", project_id)
            .eq("user_id", user_id)
            .eq("status", "ACTIVE")
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to validate project membership.",
        ) from exc

    if membership_response.data:
        return

    if _is_platform_admin(client=client, user_id=user_id):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have access to this project.",
    )


def _require_project_access(
    *,
    authorization: Optional[str],
    tenant_id: str,
    project_id: str,
) -> str:
    """
    Validate authentication plus project membership before service-role access.
    """
    user_id = _require_authenticated_user(authorization)
    _require_project_access_for_user(
        user_id=user_id,
        tenant_id=tenant_id,
        project_id=project_id,
    )
    return user_id


def _load_schedule_row(
    *,
    tenant_id: str,
    project_id: str,
    schedule_id: str,
) -> Dict[str, Any]:
    """
    Load one persisted programme safely.

    A missing or already-deleted programme is a normal 404 condition.
    Do not use PostgREST .single() here because zero rows raises PGRST116
    before the application can return a clean not-found response.
    """
    client = _require_supabase()

    try:
        response = (
            client.table("schedules")
            .select("*")
            .eq("id", schedule_id)
            .eq("tenant_id", tenant_id)
            .eq("project_id", project_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to retrieve schedule record: {str(exc)}",
        )

    rows = response.data or []

    if not rows:
        raise HTTPException(
            status_code=404,
            detail="Programme no longer exists or was deleted.",
        )

    return rows[0]


def _load_schedule_parser(
    *,
    tenant_id: str,
    project_id: str,
    schedule_id: str,
) -> tuple[Dict[str, Any], XERParser]:
    client = _require_supabase()
    row = _load_schedule_row(
        tenant_id=tenant_id,
        project_id=project_id,
        schedule_id=schedule_id,
    )

    file_path = row.get("file_path")
    if not file_path:
        raise HTTPException(
            status_code=422,
            detail="Schedule record has no stored XER path.",
        )

    try:
        raw_bytes = (
            client.storage
            .from_(SCHEDULE_STORAGE_BUCKET)
            .download(file_path)
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to download source XER: {str(exc)}",
        )

    parser = XERParser(raw_bytes.decode("utf-8", errors="ignore"))
    parser.parse()
    return row, parser


def _persist_schedule(
    *,
    schedule_id: str,
    tenant_id: str,
    project_id: str,
    file_name: str,
    file_path: str,
    schedule_type: str,
    parser: XERParser,
    source_sha256: Optional[str] = None,
    network_sha256: Optional[str] = None,
    activity_count: Optional[int] = None,
    relationship_count: Optional[int] = None,
    quality_summary: Optional[Dict[str, Any]] = None,
) -> None:
    client = _require_supabase()

    project_meta = _project_metadata(parser)
    calendar_hours = _calendar_hours_per_day_map(parser)

    try:
        schedule_payload = {
            "id": schedule_id,
            "tenant_id": tenant_id,
            "project_id": project_id,
            "file_name": file_name,
            "file_type": "xer",
            "schedule_type": schedule_type,
            "file_path": file_path,
            "data_date": project_meta.get("data_date"),
            "programme_title": (
                project_meta.get("project_name") or file_name
            ),
            "programme_status": "DRAFT",
            "is_current": False,
            "source_sha256": source_sha256,
            "network_sha256": network_sha256,
            "activity_count": activity_count,
            "relationship_count": relationship_count,
            "quality_summary": _json_safe(quality_summary or {}),
            "updated_at": datetime.utcnow().isoformat(),
        }

        # Final strict-JSON sanitation before crossing the Supabase boundary.
        client.table("schedules").insert(
            _json_safe(schedule_payload)
        ).execute()

        tasks: List[Dict[str, Any]] = []

        for row in parser.get_activities().to_dict(orient="records"):
            planned_hours = _optional_float(
                row.get("planned_duration_hrs")
            )
            total_float_hours = _optional_float(
                row.get("total_float_hrs")
            )
            hours_per_day = _activity_hours_per_day(
                row,
                calendar_hours=calendar_hours,
            )

            planned_duration_days = (
                planned_hours / hours_per_day
                if planned_hours is not None and hours_per_day > 0
                else None
            )
            total_float_days = (
                total_float_hours / hours_per_day
                if total_float_hours is not None and hours_per_day > 0
                else None
            )

            tasks.append(
                _json_safe(
                    {
                        "schedule_id": schedule_id,
                        "task_code": str(
                            row.get("activity_id", "") or ""
                        ),
                        "task_name": str(
                            row.get("activity_name", "") or ""
                        ),
                        "wbs_id": str(
                            row.get("wbs_id", "") or ""
                        ),
                        "planned_duration_days": (
                            round(planned_duration_days, 6)
                            if planned_duration_days is not None
                            else None
                        ),
                        "total_float_days": (
                            round(total_float_days, 6)
                            if total_float_days is not None
                            else None
                        ),
                        # Missing P6 float is unknown, not zero/critical.
                        "is_critical": (
                            total_float_hours <= 0.0
                            if total_float_hours is not None
                            else False
                        ),
                    }
                )
            )

        for i in range(0, len(tasks), 500):
            client.table("schedule_tasks").insert(
                tasks[i : i + 500]
            ).execute()

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Schedule was calculated but mandatory database persistence "
                f"failed: {str(exc)}"
            ),
        )

    relationships: List[Dict[str, Any]] = []

    for row in parser.get_relationships().to_dict(orient="records"):
        lag_hours = _optional_float(row.get("lag_hrs"))

        relationships.append(
            _json_safe(
                {
                    "schedule_id": schedule_id,
                    "pred_task_id": str(
                        row.get("predecessor_activity_pk", "") or ""
                    ),
                    "succ_task_id": str(
                        row.get("successor_activity_pk", "") or ""
                    ),
                    "relationship_type": str(
                        row.get("relationship_type", "FS") or "FS"
                    ),
                    # A missing relationship lag is conventionally zero lag.
                    "lag_hours": (
                        round(lag_hours, 6)
                        if lag_hours is not None
                        else 0.0
                    ),
                }
            )
        )

    relationship_warning = None
    if relationships:
        try:
            for i in range(0, len(relationships), 500):
                client.table("schedule_relationships").insert(
                    relationships[i : i + 500]
                ).execute()
        except Exception as exc:
            # Kept non-fatal because older ContractX databases may not yet
            # contain this optional table. The warning is surfaced separately
            # by the API response during C2 migration.
            relationship_warning = str(exc)

    return relationship_warning



def _delete_analysis_record_only(
    *,
    client,
    analysis_id: str,
    tenant_id: str,
    project_id: str,
) -> None:
    """Delete one analysis and analysis-only links. Never delete source programme/XER."""
    try:
        (
            client.table("delay_events")
            .update({"engine2_analysis_id": None})
            .eq("engine2_analysis_id", analysis_id)
            .execute()
        )
    except Exception:
        pass

    try:
        (
            client.table("delay_event_analyses")
            .delete()
            .eq("analysis_id", analysis_id)
            .execute()
        )
    except Exception:
        pass

    (
        client.table("cpm_analyses")
        .delete()
        .eq("id", analysis_id)
        .eq("tenant_id", tenant_id)
        .eq("project_id", project_id)
        .execute()
    )


def _enforce_delay_analysis_retention(
    *,
    client,
    tenant_id: str,
    project_id: str,
) -> List[str]:
    """
    Retain only the latest 3 Delay Analyses per tenant/project.
    A fourth completed analysis deletes only the oldest analysis record and
    analysis-only links. Source programmes and source XER files are untouched.
    """
    response = (
        client.table("cpm_analyses")
        .select("id,created_at")
        .eq("tenant_id", tenant_id)
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )

    rows = response.data or []
    stale_rows = rows[MAX_DELAY_ANALYSES_PER_PROJECT:]
    deleted_ids: List[str] = []

    for row in stale_rows:
        stale_id = str(row.get("id") or "").strip()
        if not stale_id:
            continue
        _delete_analysis_record_only(
            client=client,
            analysis_id=stale_id,
            tenant_id=tenant_id,
            project_id=project_id,
        )
        deleted_ids.append(stale_id)

    return deleted_ids



def _change_count(change_set: Optional[Dict[str, Any]]) -> int:
    if not isinstance(change_set, dict):
        return 0
    return int(change_set.get("added_count", 0) or 0) + int(
        change_set.get("removed_count", 0) or 0
    ) + int(change_set.get("modified_count", 0) or 0)


def _apab_impact_summary(
    comparison: Dict[str, Any],
    logic_changes: Dict[str, Any],
    calendar_changes: Dict[str, Any],
) -> Dict[str, Any]:
    summary = comparison.get("summary") or {}
    return {
        "method_label": "As-Planned vs As-Built",
        "planned_finish": summary.get("baseline_project_finish"),
        "actual_or_current_finish": summary.get(
            "as_built_or_current_project_finish"
        ),
        "completion_variance_calendar_days": summary.get(
            "project_finish_shift_calendar_days"
        ),
        "baseline_activity_count": summary.get("baseline_activity_count", 0),
        "as_built_activity_count": summary.get("as_built_activity_count", 0),
        "matched_activity_count": summary.get("matched_activity_count", 0),
        "later_finish_activity_count": summary.get(
            "later_finish_activity_count", 0
        ),
        "added_activity_count": summary.get("added_activity_count", 0),
        "deleted_or_missing_activity_count": summary.get(
            "deleted_or_missing_activity_count", 0
        ),
        "became_critical_count": summary.get("became_critical_count", 0),
        "left_critical_set_count": summary.get(
            "left_critical_set_count", 0
        ),
        "logic_change_count": _change_count(logic_changes),
        "calendar_change_count": _change_count(calendar_changes),
        "interpretation_note": (
            "The completion variance and activity movements are deterministic "
            "schedule comparison facts. They do not by themselves establish "
            "causation, responsibility, excusability, compensability, "
            "concurrency or contractual entitlement."
        ),
    }


def _window_impact_summary(result_core: Dict[str, Any]) -> Dict[str, Any]:
    summary = result_core.get("summary") or {}
    logic_changes = result_core.get("logic_changes") or {}
    calendar_changes = result_core.get("calendar_changes") or {}

    activities = result_core.get("activities") or []
    slipped = 0
    recovered = 0
    progressed = 0
    constraint_change_count = 0

    for item in activities:
        if not isinstance(item, dict):
            continue
        delta = item.get("delta") or {}
        finish_days = delta.get("finish_calendar_days")
        try:
            finish_days_value = float(finish_days)
            if finish_days_value > 0:
                slipped += 1
            elif finish_days_value < 0:
                recovered += 1
        except (TypeError, ValueError):
            pass

        try:
            if float(delta.get("percent_complete_change") or 0) > 0:
                progressed += 1
        except (TypeError, ValueError):
            pass

        changes = item.get("constraint_changes")
        if isinstance(changes, list):
            constraint_change_count += len(changes)
        elif isinstance(changes, dict):
            constraint_change_count += len(changes)

    return {
        "method_label": "Window Analysis",
        "window_a_finish": summary.get("window_a_finish"),
        "window_b_finish": summary.get("window_b_finish"),
        "completion_movement_calendar_days": summary.get(
            "finish_shift_calendar_days"
        ),
        "window_a_activity_count": summary.get(
            "window_a_activity_count", 0
        ),
        "window_b_activity_count": summary.get(
            "window_b_activity_count", 0
        ),
        "changed_activity_count": summary.get(
            "changed_activity_count", 0
        ),
        "added_activity_count": summary.get(
            "added_activity_count", 0
        ),
        "removed_activity_count": summary.get(
            "removed_activity_count", 0
        ),
        "slipped_activity_count": slipped,
        "recovered_activity_count": recovered,
        "progressed_activity_count": progressed,
        "float_erosion_activity_count": summary.get(
            "float_erosion_activity_count", 0
        ),
        "became_critical_count": summary.get(
            "became_critical_count", 0
        ),
        "logic_change_count": _change_count(logic_changes),
        "calendar_change_count": _change_count(calendar_changes),
        "constraint_change_count": constraint_change_count,
        "interpretation_note": (
            "Window Analysis reports movement between programme updates. "
            "Completion movement is not automatically a delay event or "
            "allocation of responsibility, liability or entitlement."
        ),
    }



def _persist_analysis(
    *,
    analysis_id: str,
    tenant_id: str,
    project_id: str,
    schedule_id: str,
    analysis_type: str,
    result: Dict[str, Any],
    compared_schedule_id: Optional[str] = None,
) -> None:
    client = _require_supabase()

    try:
        client.table("cpm_analyses").insert(
            {
                "id": analysis_id,
                "tenant_id": tenant_id,
                "project_id": project_id,
                "base_schedule_id": schedule_id,
                "compared_schedule_id": compared_schedule_id,
                "analysis_type": analysis_type,
                "results_json": _json_safe(result),
            }
        ).execute()

        _enforce_delay_analysis_retention(
            client=client,
            tenant_id=tenant_id,
            project_id=project_id,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Delay Analysis persistence failed: {str(exc)}",
        )


# =====================================================================
# HEALTH
# =====================================================================

@router.get("/health")
async def engine2_health():
    return {
        "status": "ONLINE",
        "engine": "ContractX Engine 2",
        "version": "4.0",
        "mode": "deterministic_forensic_schedule_analysis",
        "capabilities": [
            "Primavera P6 XER parsing",
            "forensic source fingerprinting",
            "calendarized CPM",
            "weekday and exception calendar handling",
            "constraints",
            "expected finish",
            "retained logic",
            "progress override",
            "longest path",
            "advanced multiple float paths",
            "resource leveling heuristic",
            "DCMA 14-point schedule assessment",
            "ContractX advanced schedule diagnostics",
            "consolidated forensic schedule assessment",
            "as-planned vs as-built",
            "window/update comparison",
            "logic change comparison",
            "constraint change comparison",
            "calendar change comparison",
            "float erosion analysis",
            "critical path shift analysis",
            "single-activity TIA compatibility",
            "multi-activity fragnet TIA",
            "forensic event modelling",
            "network fingerprinting",
            "persisted forensic analyses",
            "xlsx forensic export",
            "impacted XER export",
        ],
        "supabase_connected": bool(supabase_client),
        "disclaimer": _forensic_disclaimer(),
    }



# =====================================================================
# C3. CONSOLIDATED FORENSIC SCHEDULE ASSESSMENT
# =====================================================================

@router.post("/forensic-assessment")
async def forensic_schedule_assessment(
    payload: ForensicAssessmentRequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )
    """
    Produce the single heavy Engine 2 forensic schedule assessment.

    This endpoint consolidates:
      - source/programme identity
      - DCMA 14-point schedule assessment
      - ContractX advanced diagnostics
      - CPM and path analytics
      - schedule-quality exception register
      - deterministic audit/provenance

    It does not create a separate contractual entitlement conclusion.
    """
    schedule_row, parser = _load_schedule_parser(
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
        schedule_id=payload.schedule_id,
    )

    options = _options_from_payload(payload.scheduling_options)
    engine = _build_engine(parser, options)

    try:
        assessment = engine.forensic_schedule_assessment()
    except CPMValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Forensic schedule assessment failed: {str(exc)}",
        )

    parser_quality = parser.schedule_quality_snapshot()
    parser_forensics = parser.forensic_metadata()
    calendar_diagnostics = parser.get_calendar_diagnostics()

    result = {
        "analysis_id": str(uuid.uuid4()),
        "analysis_type": "FORENSIC_SCHEDULE_ASSESSMENT",
        "tenant_id": payload.tenant_id,
        "project_id": payload.project_id,
        "schedule_id": payload.schedule_id,
        "programme": {
            "id": schedule_row.get("id"),
            "programme_title": schedule_row.get("programme_title"),
            "revision_number": schedule_row.get("revision_number"),
            "revision_label": schedule_row.get("revision_label"),
            "programme_status": schedule_row.get("programme_status"),
            "schedule_type": schedule_row.get("schedule_type"),
            "data_date": schedule_row.get("data_date"),
            "file_name": schedule_row.get("file_name"),
            "source_sha256": schedule_row.get("source_sha256"),
            "stored_network_sha256": schedule_row.get("network_sha256"),
            "is_current": schedule_row.get("is_current"),
            "baseline_schedule_id": schedule_row.get("baseline_schedule_id"),
        },
        **assessment,
        "source_integrity": {
            "stored_source_sha256": schedule_row.get("source_sha256"),
            "stored_network_sha256": schedule_row.get("network_sha256"),
            "calculated_network_sha256": assessment.get(
                "schedule_integrity", {}
            ).get("network_fingerprint"),
            "parser_forensic_metadata": parser_forensics,
        },
        "parser_quality": parser_quality,
        "calendar_diagnostics": calendar_diagnostics,
        "disclaimer": _forensic_disclaimer(),
    }

    if payload.persist:
        _persist_analysis(
            analysis_id=result["analysis_id"],
            tenant_id=payload.tenant_id,
            project_id=payload.project_id,
            schedule_id=payload.schedule_id,
            analysis_type="FORENSIC_SCHEDULE_ASSESSMENT",
            result=result,
        )

    return {
        "status": "completed",
        "persisted": payload.persist,
        **_json_safe(result),
    }


# =====================================================================
# 1. UPLOAD + PARSE + CPM
# =====================================================================

@router.post("/upload-schedule")
async def upload_schedule(
    file: UploadFile = File(...),
    tenant_id: str = Form(...),
    project_id: str = Form(...),
    schedule_type: str = Form("baseline"),
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )
    _validate_xer_upload(file)

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded schedule is empty.",
        )

    content = raw_bytes.decode("utf-8", errors="ignore")
    parser = XERParser(content)
    parser.parse()

    try:
        engine = _build_engine(parser)
        summary = engine.schedule()
        quality = engine.schedule_quality_report()
    except CPMValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Schedule network validation failed: {str(exc)}",
        )

    parser_quality = parser.schedule_quality_snapshot()
    forensic_meta = parser.forensic_metadata()

    schedule_id = str(uuid.uuid4())
    safe_name = os.path.basename(file.filename or "programme.xer")
    file_path = (
        f"{SCHEDULE_STORAGE_PREFIX}/{tenant_id}/{project_id}/"
        f"{schedule_id}_{safe_name}"
    )

    client = _require_supabase()

    try:
        client.storage.from_(SCHEDULE_STORAGE_BUCKET).upload(
            path=file_path,
            file=raw_bytes,
            file_options={
                "content-type": "application/octet-stream",
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Raw schedule storage failed: {str(exc)}",
        )

    source_sha256 = parser.source_hash()
    network_sha256 = engine.network_fingerprint()
    # Persist source-programme counts, not reduced CPM graph counts.  The
    # graph may intentionally exclude malformed activities or external links;
    # those are diagnostics, not the source XER record count.
    source_activities_df = parser.get_activities()
    source_relationships_df = parser.get_relationships()
    activity_count = int(len(source_activities_df))
    relationship_count = int(len(source_relationships_df))
    cpm_activity_count = int(summary["network_validation"]["activity_count"])
    cpm_relationship_count = int(summary["network_validation"]["relationship_count"])

    relationship_warning = _persist_schedule(
        schedule_id=schedule_id,
        tenant_id=tenant_id,
        project_id=project_id,
        file_name=safe_name,
        file_path=file_path,
        schedule_type=schedule_type,
        parser=parser,
        source_sha256=source_sha256,
        network_sha256=network_sha256,
        activity_count=activity_count,
        relationship_count=relationship_count,
        quality_summary=quality,
    )

    return {
        "status": "success",
        "schedule_id": schedule_id,
        "file_name": safe_name,
        "schedule_type": schedule_type,
        "project": _project_metadata(parser),
        "source_sha256": source_sha256,
        "network_sha256": network_sha256,
        "parse_warnings": parser.warnings,
        "parser_quality": parser_quality,
        "schedule_quality": quality,
        "calendar_diagnostics": parser.get_calendar_diagnostics(),
        "persistence_warnings": (
            [{"component": "schedule_relationships", "message": relationship_warning}]
            if relationship_warning
            else []
        ),
        "summary": {
            "project_start": summary.get("project_start"),
            "project_finish": summary.get("project_finish"),
            "activity_count": activity_count,
            "relationship_count": relationship_count,
            "cpm_activity_count": cpm_activity_count,
            "cpm_relationship_count": cpm_relationship_count,
            "source_vs_cpm_activity_count_match": (
                activity_count == cpm_activity_count
            ),
            "source_vs_cpm_relationship_count_match": (
                relationship_count
                == (
                    cpm_relationship_count
                    + int(
                        summary["network_validation"].get(
                            "ignored_relationship_count", 0
                        ) or 0
                    )
                )
            ),
            "open_starts": summary["network_validation"]["open_starts"],
            "open_finishes": summary["network_validation"]["open_finishes"],
            "longest_path_count": len(
                summary.get("longest_path", [])
            ),
        },
        "longest_path": summary.get("longest_path", []),
        # This is intentionally a compact upload-response preview only.
        # Programme Viewer uses /programmes/{schedule_id}/viewer and receives
        # the complete source TASK/PROJWBS/TASKPRED datasets.
        "summary_gantt": _summary_gantt(
            summary.get("activities", [])
        ),
        "summary_gantt_is_preview": True,
        "summary_gantt_max_rows": 60,
        "forensic_metadata": forensic_meta,
        "disclaimer": _forensic_disclaimer(),
    }


# =====================================================================
# 2. PROGRAMME REGISTER
# =====================================================================

@router.get("/programmes")
async def list_programmes(
    tenant_id: str,
    project_id: str,
    include_archived: bool = False,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )
    client = _require_supabase()

    try:
        query = (
            client.table("schedules")
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("project_id", project_id)
        )

        if not include_archived:
            query = query.neq("programme_status", "ARCHIVED")

        response = query.order("uploaded_at", desc=True).execute()
        programmes = response.data or []

        return {
            "status": "success",
            "tenant_id": tenant_id,
            "project_id": project_id,
            "count": len(programmes),
            "programmes": programmes,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to list programme register: {str(exc)}",
        )





def _p6_activity_source_order(
    activities_df: pd.DataFrame,
) -> Dict[str, int]:
    """
    Preserve Primavera activity sequence without alphabetic/topological rewrite.

    Preferred order:
      1. TASK.seq_num exposed by the parser as activity_sequence;
      2. exact TASK source row position;
      3. dataframe position as final deterministic fallback.
    """
    order: Dict[str, int] = {}
    if activities_df is None or activities_df.empty:
        return order

    records = activities_df.to_dict(orient="records")
    ranked: List[tuple[float, float, int, str]] = []

    for index, item in enumerate(records):
        pk = str(item.get("activity_id_pk", "") or "").strip()
        if not pk:
            continue

        activity_sequence = _optional_float(item.get("activity_sequence"))
        source_sequence = _optional_float(item.get("source_row_sequence"))

        ranked.append(
            (
                activity_sequence if activity_sequence is not None else float("inf"),
                source_sequence if source_sequence is not None else float(index),
                index,
                pk,
            )
        )

    for position, (_, _, _, pk) in enumerate(sorted(ranked)):
        if pk not in order:
            order[pk] = position

    return order


def _p6_wbs_source_order(parser: XERParser) -> Dict[str, int]:
    """
    Preserve WBS display order using PROJWBS sequence metadata where available.
    Parent/child structure is returned separately by the viewer; this mapping is
    only a stable ordering key and does not reconstruct or flatten the WBS tree.
    """
    order: Dict[str, int] = {}

    try:
        wbs_df = parser.get_wbs()
    except Exception:
        return order

    if wbs_df is None or wbs_df.empty:
        return order

    records = wbs_df.to_dict(orient="records")
    ranked: List[tuple[float, float, int, Dict[str, Any]]] = []

    for index, item in enumerate(records):
        seq = _optional_float(item.get("sequence_number"))
        source_seq = _optional_float(item.get("source_row_sequence"))
        ranked.append(
            (
                seq if seq is not None else float("inf"),
                source_seq if source_seq is not None else float(index),
                index,
                item,
            )
        )

    for position, (_, _, _, item) in enumerate(sorted(ranked)):
        aliases = (
            item.get("wbs_id"),
            item.get("wbs_id_pk"),
            item.get("wbs_code"),
            item.get("wbs_path"),
        )
        for value in aliases:
            key = str(value or "").strip()
            if key and key not in order:
                order[key] = position

    return order


def _viewer_wbs_nodes(parser: XERParser) -> List[Dict[str, Any]]:
    """Return the complete PROJWBS hierarchy for a universal P6 tree viewer."""
    try:
        wbs_df = parser.get_wbs()
    except Exception:
        return []

    if wbs_df is None or wbs_df.empty:
        return []

    nodes: List[Dict[str, Any]] = []
    for source_index, item in enumerate(wbs_df.to_dict(orient="records")):
        sequence = _optional_float(item.get("sequence_number"))
        source_sequence = _optional_float(item.get("source_row_sequence"))

        nodes.append(
            {
                "wbs_id": str(item.get("wbs_id", "") or ""),
                "parent_wbs_id": str(item.get("parent_wbs_id", "") or ""),
                "wbs_code": str(item.get("wbs_code", "") or ""),
                "wbs_name": str(item.get("wbs_name", "") or ""),
                "wbs_path": str(item.get("wbs_path", "") or ""),
                "sequence_number": sequence,
                "source_row_sequence": (
                    int(source_sequence)
                    if source_sequence is not None
                    else source_index
                ),
                "status": str(item.get("status", "") or ""),
            }
        )

    # Do not flatten by path.  Preserve each parent relation and only use source
    # order as a stable API order; the frontend builds the actual tree.
    nodes.sort(key=lambda x: int(x.get("source_row_sequence", 0)))
    return nodes


def _activity_wbs_sequence(
    source: Dict[str, Any],
    *,
    wbs_order: Dict[str, int],
    fallback: int,
) -> int:
    """
    Resolve the original Primavera WBS sequence for an activity without
    rewriting the WBS path.
    """
    for value in (
        source.get("wbs_id"),
        source.get("wbs_id_pk"),
        source.get("wbs_code"),
        source.get("wbs_path"),
    ):
        key = str(value or "").strip()
        if key in wbs_order:
            return wbs_order[key]

    return fallback


def _activity_milestone_flags(
    source: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Expose P6 activity type and milestone semantics to the frontend.

    Supports the upgraded forensic parser's normalized fields while remaining
    backward compatible with raw Primavera TASK type tokens.
    """
    normalized = str(
        source.get("activity_type_normalized")
        or source.get("activity_type")
        or ""
    ).strip().upper()

    raw = str(
        source.get("activity_type_raw")
        or source.get("activity_type")
        or ""
    ).strip().upper()

    is_start = bool(source.get("is_start_milestone")) or normalized in {
        "START_MILESTONE",
        "TT_MILE",
        "TT_MILESTONE",
    } or raw in {
        "TT_MILE",
        "TT_MILESTONE",
    }

    is_finish = bool(source.get("is_finish_milestone")) or normalized in {
        "FINISH_MILESTONE",
        "TT_FINMILE",
        "TT_FINISHMILESTONE",
    } or raw in {
        "TT_FINMILE",
        "TT_FINISHMILESTONE",
    }

    return {
        "activity_type": str(source.get("activity_type", "") or ""),
        "activity_type_raw": str(source.get("activity_type_raw", "") or ""),
        "activity_type_normalized": str(
            source.get("activity_type_normalized", "") or ""
        ),
        "is_start_milestone": is_start,
        "is_finish_milestone": is_finish,
    }


@router.get("/programmes/{schedule_id}/activities")
def get_programme_activities(
    schedule_id: str,
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )
    """
    Complete P6 activity register for selectors and diagnostics.

    This endpoint is source-preserving.  It does not use the CPM engine's
    topological activity order and it does not truncate to summary-gantt rows.
    """
    row, parser = _load_schedule_parser(
        tenant_id=tenant_id,
        project_id=project_id,
        schedule_id=schedule_id,
    )

    activities_df = parser.get_activities()
    activity_order = _p6_activity_source_order(activities_df)
    calendar_hours = _calendar_hours_per_day_map(parser)
    activities: List[Dict[str, Any]] = []

    def iso(value: Any) -> Optional[str]:
        if value is None or pd.isna(value):
            return None
        return pd.Timestamp(value).isoformat()

    if activities_df is not None and not activities_df.empty:
        for source_index, item in enumerate(
            activities_df.to_dict(orient="records")
        ):
            pk = str(item.get("activity_id_pk", "") or "").strip()
            display_pk = pk or f"__source_task_row__{source_index}"

            planned_hours = _optional_float(item.get("planned_duration_hrs"))
            total_float_hours = _optional_float(item.get("total_float_hrs"))
            hpd = _activity_hours_per_day(
                item,
                calendar_hours=calendar_hours,
            )

            start_value = (
                item.get("actual_start")
                or item.get("remaining_start")
                or item.get("early_start")
                or item.get("planned_start")
            )
            finish_value = (
                item.get("actual_finish")
                or item.get("remaining_finish")
                or item.get("early_finish")
                or item.get("planned_finish")
            )

            activities.append(
                {
                    "activity_id_pk": display_pk,
                    "source_activity_id_pk": pk or None,
                    "synthetic_activity_pk": not bool(pk),
                    "activity_id": str(item.get("activity_id", "") or ""),
                    "activity_name": str(item.get("activity_name", "") or ""),
                    "wbs_id": str(item.get("wbs_id", "") or ""),
                    "parent_wbs_id": str(item.get("parent_wbs_id", "") or ""),
                    "wbs_code": str(item.get("wbs_code", "") or ""),
                    "wbs_name": str(item.get("wbs_name", "") or ""),
                    "wbs_path": str(item.get("wbs_path", "") or ""),
                    "wbs_sequence_number": _optional_float(
                        item.get("wbs_sequence_number")
                    ),
                    "wbs_source_row_sequence": _optional_float(
                        item.get("wbs_source_row_sequence")
                    ),
                    "activity_sequence": _optional_float(
                        item.get("activity_sequence")
                    ),
                    "source_row_sequence": int(
                        _optional_float(item.get("source_row_sequence"))
                        or source_index
                    ),
                    "display_sequence": activity_order.get(pk, source_index),
                    "calendar_id": str(item.get("calendar_id", "") or ""),
                    "hours_per_day": hpd,
                    "status": str(item.get("status", "") or ""),
                    **_activity_milestone_flags(item),
                    "original_duration_hours": (
                        round(planned_hours, 2)
                        if planned_hours is not None
                        else None
                    ),
                    "original_duration_days": (
                        round(planned_hours / hpd, 2)
                        if planned_hours is not None and hpd > 0
                        else None
                    ),
                    "start": iso(start_value),
                    "finish": iso(finish_value),
                    "total_float_hours": (
                        round(total_float_hours, 2)
                        if total_float_hours is not None
                        else None
                    ),
                    "total_float_days": (
                        round(total_float_hours / hpd, 2)
                        if total_float_hours is not None and hpd > 0
                        else None
                    ),
                }
            )

    activities.sort(
        key=lambda x: (
            int(x.get("display_sequence", 10**9)),
            int(x.get("source_row_sequence", 10**9)),
        )
    )

    return {
        "schedule_id": schedule_id,
        "programme_title": row.get("programme_title") or row.get("file_name"),
        "activity_count": len(activities),
        "wbs_count": len(_viewer_wbs_nodes(parser)),
        "activities": activities,
    }


@router.get("/programmes/{schedule_id}/viewer")
def get_programme_viewer(
    schedule_id: str,
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )
    """
    Universal, source-preserving Primavera P6 programme viewer dataset.

    Source XER TASK/PROJWBS/TASKPRED data remains authoritative for the
    read-only viewer.  Engine 2 calculated fields are merged only as explicit
    diagnostics (for example longest-path status) and never replace source P6
    dates, duration, float, WBS hierarchy or relationship records.
    """
    row, parser = _load_schedule_parser(
        tenant_id=tenant_id,
        project_id=project_id,
        schedule_id=schedule_id,
    )

    parser_activities = parser.get_activities()
    parser_relationships = parser.get_relationships()
    wbs_nodes = _viewer_wbs_nodes(parser)
    activity_order = _p6_activity_source_order(parser_activities)
    calendar_hours = _calendar_hours_per_day_map(parser)

    summary_by_pk: Dict[str, Dict[str, Any]] = {}
    engine_project_finish = None
    engine_validation: Dict[str, Any] = {}
    engine_warning = None

    try:
        engine = _build_engine(parser)
        summary = engine.schedule()
        engine_project_finish = summary.get("project_finish")
        engine_validation = summary.get("network_validation", {}) or {}
        summary_by_pk = {
            str(item.get("activity_pk", "") or ""): item
            for item in (summary.get("activities", []) or [])
            if str(item.get("activity_pk", "") or "")
        }
    except Exception as exc:
        engine_warning = str(exc)

    def iso(value: Any) -> Optional[str]:
        if value is None or pd.isna(value):
            return None
        try:
            return pd.Timestamp(value).isoformat()
        except Exception:
            return str(value)

    def first_date(item: Dict[str, Any], keys: List[str]) -> Any:
        for key in keys:
            value = item.get(key)
            if value is not None and not pd.isna(value):
                return value
        return None

    rows: List[Dict[str, Any]] = []
    blank_pk_count = 0

    if parser_activities is not None and not parser_activities.empty:
        for source_index, source in enumerate(
            parser_activities.to_dict(orient="records")
        ):
            source_pk = str(source.get("activity_id_pk", "") or "").strip()
            if not source_pk:
                blank_pk_count += 1
            display_pk = source_pk or f"__source_task_row__{source_index}"

            calculated = summary_by_pk.get(source_pk, {}) if source_pk else {}
            status_token = str(source.get("status", "") or "").upper()

            # P6-style current Start/Finish display: actual dates where work has
            # occurred, remaining/early forecast for in-progress work, otherwise
            # the source early/planned dates.  All raw source date fields are
            # also returned separately below for audit/tooltips.
            if "TK_ACTIVE" in status_token or "IN_PROGRESS" in status_token:
                start_value = first_date(
                    source,
                    ["actual_start", "remaining_start", "early_start", "planned_start"],
                )
                finish_value = first_date(
                    source,
                    ["actual_finish", "remaining_finish", "early_finish", "planned_finish"],
                )
            elif "TK_COMPLETE" in status_token or "COMPLETE" in status_token:
                start_value = first_date(
                    source,
                    ["actual_start", "early_start", "planned_start"],
                )
                finish_value = first_date(
                    source,
                    ["actual_finish", "early_finish", "planned_finish"],
                )
            else:
                start_value = first_date(
                    source,
                    ["early_start", "planned_start", "remaining_start"],
                )
                finish_value = first_date(
                    source,
                    ["early_finish", "planned_finish", "remaining_finish"],
                )

            original_hours = _optional_float(source.get("planned_duration_hrs"))
            source_total_float_hours = _optional_float(
                source.get("total_float_hrs")
            )
            hpd = _activity_hours_per_day(
                source,
                calendar_hours=calendar_hours,
            )

            rows.append(
                {
                    "activity_id_pk": display_pk,
                    "source_activity_id_pk": source_pk or None,
                    "synthetic_activity_pk": not bool(source_pk),
                    "activity_id": str(source.get("activity_id", "") or ""),
                    "activity_name": str(source.get("activity_name", "") or ""),
                    "wbs_id": str(source.get("wbs_id", "") or ""),
                    "parent_wbs_id": str(source.get("parent_wbs_id", "") or ""),
                    "wbs_code": str(source.get("wbs_code", "") or ""),
                    "wbs_name": str(source.get("wbs_name", "") or ""),
                    "wbs_path": str(source.get("wbs_path", "") or ""),
                    "wbs_sequence_number": _optional_float(
                        source.get("wbs_sequence_number")
                    ),
                    "wbs_source_row_sequence": _optional_float(
                        source.get("wbs_source_row_sequence")
                    ),
                    "activity_sequence": _optional_float(
                        source.get("activity_sequence")
                    ),
                    "source_row_sequence": int(
                        _optional_float(source.get("source_row_sequence"))
                        or source_index
                    ),
                    "display_sequence": activity_order.get(
                        source_pk, source_index
                    ),
                    "calendar_id": str(source.get("calendar_id", "") or ""),
                    "hours_per_day": hpd,
                    "status": str(source.get("status", "") or ""),
                    **_activity_milestone_flags(source),
                    "original_duration_hours": (
                        round(original_hours, 2)
                        if original_hours is not None
                        else None
                    ),
                    "original_duration_days": (
                        round(original_hours / hpd, 2)
                        if original_hours is not None and hpd > 0
                        else None
                    ),
                    "start": iso(start_value),
                    "finish": iso(finish_value),
                    "planned_start": iso(source.get("planned_start")),
                    "planned_finish": iso(source.get("planned_finish")),
                    "early_start": iso(source.get("early_start")),
                    "early_finish": iso(source.get("early_finish")),
                    "late_start": iso(source.get("late_start")),
                    "late_finish": iso(source.get("late_finish")),
                    "actual_start": iso(source.get("actual_start")),
                    "actual_finish": iso(source.get("actual_finish")),
                    "remaining_start": iso(source.get("remaining_start")),
                    "remaining_finish": iso(source.get("remaining_finish")),
                    "expected_finish": iso(source.get("expected_finish")),
                    "total_float_hours": (
                        round(source_total_float_hours, 2)
                        if source_total_float_hours is not None
                        else None
                    ),
                    "total_float_days": (
                        round(source_total_float_hours / hpd, 2)
                        if source_total_float_hours is not None and hpd > 0
                        else None
                    ),
                    "is_longest_path": bool(
                        calculated.get("is_longest_path")
                    ),
                    "is_critical": (
                        bool(calculated.get("is_critical"))
                        if calculated
                        else (
                            source_total_float_hours <= 0.0
                            if source_total_float_hours is not None
                            else False
                        )
                    ),
                    "cpm_present": bool(calculated),
                }
            )

    # Preserve TASK source order in the flat payload.  WBS hierarchy/order is
    # separately supplied by wbs_nodes and must be constructed by parent_wbs_id.
    rows.sort(
        key=lambda x: (
            int(x.get("display_sequence", 10**9)),
            int(x.get("source_row_sequence", 10**9)),
        )
    )

    relationships: List[Dict[str, Any]] = []
    duplicate_pair_count = 0
    pair_counts: Dict[tuple[str, str], int] = {}

    if parser_relationships is not None and not parser_relationships.empty:
        for source_index, rel in enumerate(
            parser_relationships.to_dict(orient="records")
        ):
            pred = str(rel.get("predecessor_activity_pk", "") or "")
            succ = str(rel.get("successor_activity_pk", "") or "")
            pair = (pred, succ)
            pair_counts[pair] = pair_counts.get(pair, 0) + 1

            lag_hours = _optional_float(rel.get("lag_hrs"))
            relationships.append(
                {
                    "relationship_id": str(
                        rel.get("pred_link_id", "") or f"__rel__{source_index}"
                    ),
                    "predecessor_activity_pk": pred,
                    "successor_activity_pk": succ,
                    "relationship_type": str(
                        rel.get("relationship_type", "FS") or "FS"
                    ).upper(),
                    "lag_hours": (
                        round(lag_hours, 2) if lag_hours is not None else 0.0
                    ),
                    "source_row_sequence": int(
                        _optional_float(rel.get("source_row_sequence"))
                        or source_index
                    ),
                }
            )

        duplicate_pair_count = sum(
            count - 1 for count in pair_counts.values() if count > 1
        )

    # Establish the universal programme display horizon from BOTH project
    # metadata and complete unfiltered source activity dates.  This prevents a
    # sparse late programme (e.g. 2030-2032) from disappearing from the Gantt.
    project_meta = _project_metadata(parser)
    horizon_starts: List[pd.Timestamp] = []
    horizon_finishes: List[pd.Timestamp] = []

    for key in ("planned_start",):
        value = project_meta.get(key)
        if value:
            parsed = pd.to_datetime(value, errors="coerce")
            if pd.notna(parsed):
                horizon_starts.append(pd.Timestamp(parsed))

    for key in ("planned_finish", "scheduled_finish"):
        value = project_meta.get(key)
        if value:
            parsed = pd.to_datetime(value, errors="coerce")
            if pd.notna(parsed):
                horizon_finishes.append(pd.Timestamp(parsed))

    for activity in rows:
        for key in (
            "start",
            "planned_start",
            "early_start",
            "actual_start",
            "remaining_start",
        ):
            value = activity.get(key)
            if value:
                parsed = pd.to_datetime(value, errors="coerce")
                if pd.notna(parsed):
                    horizon_starts.append(pd.Timestamp(parsed))
        for key in (
            "finish",
            "planned_finish",
            "early_finish",
            "actual_finish",
            "remaining_finish",
            "expected_finish",
        ):
            value = activity.get(key)
            if value:
                parsed = pd.to_datetime(value, errors="coerce")
                if pd.notna(parsed):
                    horizon_finishes.append(pd.Timestamp(parsed))

    display_start = min(horizon_starts).isoformat() if horizon_starts else None
    display_finish = (
        max(horizon_finishes).isoformat() if horizon_finishes else None
    )

    source_activity_count = int(len(parser_activities)) if parser_activities is not None else 0
    source_relationship_count = (
        int(len(parser_relationships))
        if parser_relationships is not None
        else 0
    )
    cpm_activity_count = int(engine_validation.get("activity_count", 0) or 0)
    cpm_relationship_count = int(
        engine_validation.get("relationship_count", 0) or 0
    )

    return {
        "schedule_id": schedule_id,
        "programme_title": row.get("programme_title") or row.get("file_name"),
        "baseline_schedule_id": row.get("baseline_schedule_id"),
        "data_date": (
            row.get("data_date").isoformat()
            if hasattr(row.get("data_date"), "isoformat")
            else row.get("data_date")
        ),
        "project": project_meta,
        "programme_start": display_start,
        "programme_finish": display_finish,
        "activity_count": len(rows),
        "relationship_count": len(relationships),
        "wbs_count": len(wbs_nodes),
        "wbs_nodes": wbs_nodes,
        "activities": rows,
        "relationships": relationships,
        "read_only": True,
        "viewer_metadata": {
            "ordering": "P6_TASK_SEQUENCE_WITH_SOURCE_FALLBACK",
            "display_basis": "SOURCE_XER_SCHEDULE_FIELDS",
            "dates_recalculated_for_viewer": False,
            "all_parsed_task_rows_included": len(rows) == source_activity_count,
            "wbs_hierarchy_preserved": True,
            "wbs_as_column_required": False,
            "milestone_semantics_exposed": True,
            "source_activity_count": source_activity_count,
            "source_relationship_count": source_relationship_count,
            "cpm_activity_count": cpm_activity_count,
            "cpm_relationship_count": cpm_relationship_count,
            "blank_activity_pk_count": blank_pk_count,
            "duplicate_relationship_pair_extra_count": duplicate_pair_count,
            "source_vs_cpm_activity_count_match": (
                source_activity_count == cpm_activity_count
            ),
            "source_vs_cpm_relationship_count_match": (
                source_relationship_count
                == (
                    cpm_relationship_count
                    + int(engine_validation.get("ignored_relationship_count", 0) or 0)
                )
            ),
            "engine_project_finish_diagnostic": _json_safe(
                engine_project_finish
            ),
            "engine_network_validation": _json_safe(engine_validation),
            "engine_recalculation_warning": engine_warning,
        },
    }


@router.get("/programmes/{schedule_id}")
async def get_programme(
    schedule_id: str,
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )
    row = _load_schedule_row(
        tenant_id=tenant_id,
        project_id=project_id,
        schedule_id=schedule_id,
    )

    return {
        "status": "success",
        "programme": row,
    }


@router.patch("/programmes/{schedule_id}")
async def update_programme(
    schedule_id: str,
    payload: ProgrammeUpdateRequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )
    client = _require_supabase()

    current = _load_schedule_row(
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
        schedule_id=schedule_id,
    )

    if payload.baseline_schedule_id:
        if payload.baseline_schedule_id == schedule_id:
            raise HTTPException(
                status_code=422,
                detail="A programme cannot reference itself as its baseline.",
            )

        _load_schedule_row(
            tenant_id=payload.tenant_id,
            project_id=payload.project_id,
            schedule_id=payload.baseline_schedule_id,
        )

    changes = payload.model_dump(
        exclude={"tenant_id", "project_id"},
        exclude_unset=True,
    )

    if "programme_title" in changes and changes["programme_title"] is not None:
        changes["programme_title"] = changes["programme_title"].strip()

    if "revision_label" in changes and changes["revision_label"] is not None:
        changes["revision_label"] = changes["revision_label"].strip()

    if changes.get("programme_status") == "ARCHIVED":
        changes["is_current"] = False

    if not changes:
        return {
            "status": "success",
            "programme": current,
            "message": "No programme metadata changes supplied.",
        }

    changes["updated_at"] = datetime.utcnow().isoformat()

    try:
        response = (
            client.table("schedules")
            .update(changes)
            .eq("id", schedule_id)
            .eq("tenant_id", payload.tenant_id)
            .eq("project_id", payload.project_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to update programme register entry: {str(exc)}",
        )

    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=404,
            detail="Programme not found for the requested tenant/project.",
        )

    return {
        "status": "success",
        "programme": rows[0],
    }


@router.post("/programmes/{schedule_id}/set-current")
async def set_current_programme(
    schedule_id: str,
    payload: ProgrammeScopeRequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )
    client = _require_supabase()

    target = _load_schedule_row(
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
        schedule_id=schedule_id,
    )

    if target.get("programme_status") == "ARCHIVED":
        raise HTTPException(
            status_code=422,
            detail="An archived programme cannot be made current.",
        )

    now = datetime.utcnow().isoformat()

    try:
        (
            client.table("schedules")
            .update({"is_current": False, "updated_at": now})
            .eq("tenant_id", payload.tenant_id)
            .eq("project_id", payload.project_id)
            .eq("is_current", True)
            .execute()
        )

        response = (
            client.table("schedules")
            .update({"is_current": True, "updated_at": now})
            .eq("id", schedule_id)
            .eq("tenant_id", payload.tenant_id)
            .eq("project_id", payload.project_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to set current programme: {str(exc)}",
        )

    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=404,
            detail="Programme not found for the requested tenant/project.",
        )

    return {
        "status": "success",
        "programme": rows[0],
        "message": "Current programme updated.",
    }


@router.post("/programmes/{schedule_id}/archive")
async def archive_programme(
    schedule_id: str,
    payload: ProgrammeScopeRequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )
    client = _require_supabase()

    _load_schedule_row(
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
        schedule_id=schedule_id,
    )

    try:
        response = (
            client.table("schedules")
            .update(
                {
                    "programme_status": "ARCHIVED",
                    "is_current": False,
                    "updated_at": datetime.utcnow().isoformat(),
                }
            )
            .eq("id", schedule_id)
            .eq("tenant_id", payload.tenant_id)
            .eq("project_id", payload.project_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to archive programme: {str(exc)}",
        )

    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=404,
            detail="Programme not found for the requested tenant/project.",
        )

    return {
        "status": "success",
        "programme": rows[0],
        "message": "Programme archived.",
    }




@router.delete("/programmes/{schedule_id}")
async def delete_programme(
    schedule_id: str,
    tenant_id: str,
    project_id: str,
    delete_analyses: bool = True,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )
    """
    Permanently delete a programme revision and its raw stored schedule.

    Related CPM analyses can be removed with delete_analyses=True. Delay events
    retain their own records; schedule/analysis references are cleared where
    the schema permits. This is intentionally distinct from Archive.
    """
    client = _require_supabase()

    row = _load_schedule_row(
        tenant_id=tenant_id,
        project_id=project_id,
        schedule_id=schedule_id,
    )

    analysis_rows = []
    try:
        analysis_response = (
            client.table("cpm_analyses")
            .select("id")
            .eq("tenant_id", tenant_id)
            .eq("project_id", project_id)
            .or_(
                f"base_schedule_id.eq.{schedule_id},"
                f"compared_schedule_id.eq.{schedule_id}"
            )
            .execute()
        )
        analysis_rows = analysis_response.data or []
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to inspect programme analysis dependencies: {str(exc)}",
        )

    if analysis_rows and not delete_analyses:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Programme is referenced by {len(analysis_rows)} CPM analysis record(s). "
                "Re-submit with delete_analyses=true to delete those analyses as well."
            ),
        )

    analysis_ids = [str(x.get("id")) for x in analysis_rows if x.get("id")]

    try:
        if analysis_ids:
            (
                client.table("delay_events")
                .update({"engine2_analysis_id": None})
                .in_("engine2_analysis_id", analysis_ids)
                .execute()
            )
            (
                client.table("delay_event_analyses")
                .delete()
                .in_("analysis_id", analysis_ids)
                .execute()
            )
            (
                client.table("cpm_analyses")
                .delete()
                .in_("id", analysis_ids)
                .execute()
            )

        (
            client.table("delay_events")
            .update({"schedule_id": None})
            .eq("schedule_id", schedule_id)
            .execute()
        )

        deleted = (
            client.table("schedules")
            .delete()
            .eq("id", schedule_id)
            .eq("tenant_id", tenant_id)
            .eq("project_id", project_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to delete programme database records: {str(exc)}",
        )

    if not (deleted.data or []):
        raise HTTPException(
            status_code=404,
            detail="Programme not found for the requested tenant/project.",
        )

    storage_warning = None
    file_path = row.get("file_path")
    if file_path:
        try:
            client.storage.from_(SCHEDULE_STORAGE_BUCKET).remove([file_path])
        except Exception as exc:
            storage_warning = (
                "Programme database records were deleted, but raw file cleanup "
                f"failed: {str(exc)}"
            )

    return {
        "status": "success",
        "schedule_id": schedule_id,
        "deleted_analysis_count": len(analysis_ids),
        "storage_path": file_path,
        "storage_warning": storage_warning,
        "message": "Programme deleted permanently.",
    }


# =====================================================================
# 3. AS-PLANNED VS AS-BUILT
# =====================================================================

@router.post("/as-planned-vs-as-built/registered")
async def as_planned_vs_as_built_registered(
    payload: RegisteredApAbRequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )
    baseline_row, baseline_parser = _load_schedule_parser(
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
        schedule_id=payload.baseline_schedule_id,
    )
    as_built_row, as_built_parser = _load_schedule_parser(
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
        schedule_id=payload.as_built_schedule_id,
    )

    comparison = CPMEngine.run_as_planned_vs_as_built(
        baseline_parser.get_activities(),
        as_built_parser.get_activities(),
    )

    analysis_id = str(uuid.uuid4())

    logic_changes = CPMEngine.compare_relationships(
        baseline_parser.get_relationships(),
        as_built_parser.get_relationships(),
    )
    calendar_changes = CPMEngine.compare_calendar_frames(
        baseline_parser.get_calendars(),
        as_built_parser.get_calendars(),
    )

    result = {
        "analysis_id": analysis_id,
        "analysis_type": "AS_PLANNED_VS_AS_BUILT",
        "tenant_id": payload.tenant_id,
        "project_id": payload.project_id,
        "schedule_id": payload.baseline_schedule_id,
        "compared_schedule_id": payload.as_built_schedule_id,
        "baseline": {
            "schedule_id": payload.baseline_schedule_id,
            "file_name": baseline_row.get("file_name"),
            "programme_title": baseline_row.get("programme_title"),
            "revision_label": baseline_row.get("revision_label"),
            "project": _project_metadata(baseline_parser),
            "source_sha256": baseline_parser.source_hash(),
            "parser_quality": baseline_parser.schedule_quality_snapshot(),
            "calendar_diagnostics": baseline_parser.get_calendar_diagnostics(),
        },
        "as_built": {
            "schedule_id": payload.as_built_schedule_id,
            "file_name": as_built_row.get("file_name"),
            "programme_title": as_built_row.get("programme_title"),
            "revision_label": as_built_row.get("revision_label"),
            "project": _project_metadata(as_built_parser),
            "source_sha256": as_built_parser.source_hash(),
            "parser_quality": as_built_parser.schedule_quality_snapshot(),
            "calendar_diagnostics": as_built_parser.get_calendar_diagnostics(),
        },
        "comparison": comparison,
        "gantt_comparison": {
            "method_label": "As Planned vs As Built (AP vs AB)",
            "before_label": "As Planned",
            "after_label": "As Built / Current",
            "before": _gantt_snapshot_from_frame(
                baseline_parser.get_activities(),
                mode="planned",
            ),
            "after": _gantt_snapshot_from_frame(
                as_built_parser.get_activities(),
                mode="actual",
            ),
        },
        "logic_changes": logic_changes,
        "calendar_changes": calendar_changes,
        "impact_summary": _apab_impact_summary(
            comparison,
            logic_changes,
            calendar_changes,
        ),
        "disclaimer": _forensic_disclaimer(),
    }

    if payload.persist:
        _persist_analysis(
            analysis_id=analysis_id,
            tenant_id=payload.tenant_id,
            project_id=payload.project_id,
            schedule_id=payload.baseline_schedule_id,
            compared_schedule_id=payload.as_built_schedule_id,
            analysis_type="AS_PLANNED_VS_AS_BUILT",
            result=result,
        )

    return {
        "status": "completed",
        **_json_safe(result),
    }


@router.post("/as-planned-vs-as-built")
async def as_planned_vs_as_built(
    baseline_file: UploadFile = File(...),
    as_built_file: UploadFile = File(...),

    # Optional now to keep the current Phase-B frontend working.
    # C2 will migrate comparisons to registered programme IDs.
    tenant_id: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    schedule_id: Optional[str] = Form(None),
    authorization: Optional[str] = Header(default=None),
):
    user_id = _require_authenticated_user(authorization)
    if tenant_id and project_id:
        _require_project_access_for_user(
            user_id=user_id,
            tenant_id=tenant_id,
            project_id=project_id,
        )
    baseline_parser = await _parser_from_upload(baseline_file)
    as_built_parser = await _parser_from_upload(as_built_file)

    comparison = CPMEngine.run_as_planned_vs_as_built(
        baseline_parser.get_activities(),
        as_built_parser.get_activities(),
    )

    analysis_id = str(uuid.uuid4())

    logic_changes = CPMEngine.compare_relationships(
        baseline_parser.get_relationships(),
        as_built_parser.get_relationships(),
    )
    calendar_changes = CPMEngine.compare_calendar_frames(
        baseline_parser.get_calendars(),
        as_built_parser.get_calendars(),
    )

    result = {
        "analysis_id": analysis_id,
        "analysis_type": "AS_PLANNED_VS_AS_BUILT",
        "tenant_id": tenant_id,
        "project_id": project_id,
        "schedule_id": schedule_id,
        "baseline": {
            "file_name": baseline_file.filename,
            "project": _project_metadata(baseline_parser),
            "source_sha256": baseline_parser.source_hash(),
            "parser_quality": baseline_parser.schedule_quality_snapshot(),
            "calendar_diagnostics": baseline_parser.get_calendar_diagnostics(),
        },
        "as_built": {
            "file_name": as_built_file.filename,
            "project": _project_metadata(as_built_parser),
            "source_sha256": as_built_parser.source_hash(),
            "parser_quality": as_built_parser.schedule_quality_snapshot(),
            "calendar_diagnostics": as_built_parser.get_calendar_diagnostics(),
        },
        "comparison": comparison,
        "gantt_comparison": {
            "method_label": "As Planned vs As Built (AP vs AB)",
            "before_label": "As Planned",
            "after_label": "As Built / Current",
            "before": _gantt_snapshot_from_frame(
                baseline_parser.get_activities(),
                mode="planned",
            ),
            "after": _gantt_snapshot_from_frame(
                as_built_parser.get_activities(),
                mode="actual",
            ),
        },
        "logic_changes": logic_changes,
        "calendar_changes": calendar_changes,
        "impact_summary": _apab_impact_summary(
            comparison,
            logic_changes,
            calendar_changes,
        ),
        "disclaimer": _forensic_disclaimer(),
    }

    if tenant_id and project_id and schedule_id:
        _persist_analysis(
            analysis_id=analysis_id,
            tenant_id=tenant_id,
            project_id=project_id,
            schedule_id=schedule_id,
            analysis_type="AS_PLANNED_VS_AS_BUILT",
            result=result,
        )

    return {
        "status": "completed",
        **_json_safe(result),
    }


# =====================================================================
# 3. WINDOW / UPDATE ANALYSIS
# =====================================================================

@router.post("/window-analysis/registered")
async def window_analysis_registered(
    payload: RegisteredWindowAnalysisRequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )
    row_a, parser_a = _load_schedule_parser(
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
        schedule_id=payload.window_a_schedule_id,
    )
    row_b, parser_b = _load_schedule_parser(
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
        schedule_id=payload.window_b_schedule_id,
    )

    result_core = CPMEngine.run_window_analysis(
        parser_a.get_activities(),
        parser_b.get_activities(),
        relationships_a=parser_a.get_relationships(),
        relationships_b=parser_b.get_relationships(),
        calendars_a=parser_a.get_calendars(),
        calendars_b=parser_b.get_calendars(),
    )

    analysis_id = str(uuid.uuid4())

    result = {
        "analysis_id": analysis_id,
        "analysis_type": "WINDOW_ANALYSIS",
        "tenant_id": payload.tenant_id,
        "project_id": payload.project_id,
        "schedule_id": payload.window_a_schedule_id,
        "compared_schedule_id": payload.window_b_schedule_id,
        "window_a": {
            "schedule_id": payload.window_a_schedule_id,
            "file_name": row_a.get("file_name"),
            "programme_title": row_a.get("programme_title"),
            "revision_label": row_a.get("revision_label"),
            "project": _project_metadata(parser_a),
            "source_sha256": parser_a.source_hash(),
            "parser_quality": parser_a.schedule_quality_snapshot(),
            "calendar_diagnostics": parser_a.get_calendar_diagnostics(),
        },
        "window_b": {
            "schedule_id": payload.window_b_schedule_id,
            "file_name": row_b.get("file_name"),
            "programme_title": row_b.get("programme_title"),
            "revision_label": row_b.get("revision_label"),
            "project": _project_metadata(parser_b),
            "source_sha256": parser_b.source_hash(),
            "parser_quality": parser_b.schedule_quality_snapshot(),
            "calendar_diagnostics": parser_b.get_calendar_diagnostics(),
        },
        "results": result_core,
        "impact_summary": _window_impact_summary(result_core),
        "gantt_comparison": {
            "method_label": "Window Analysis (Time Slice)",
            "before_label": "Window A",
            "after_label": "Window B",
            "before": _gantt_snapshot_from_frame(
                parser_a.get_activities(),
                mode="window",
            ),
            "after": _gantt_snapshot_from_frame(
                parser_b.get_activities(),
                mode="window",
            ),
        },
        "disclaimer": _forensic_disclaimer(),
    }

    if payload.persist:
        _persist_analysis(
            analysis_id=analysis_id,
            tenant_id=payload.tenant_id,
            project_id=payload.project_id,
            schedule_id=payload.window_a_schedule_id,
            compared_schedule_id=payload.window_b_schedule_id,
            analysis_type="WINDOW_ANALYSIS",
            result=result,
        )

    return {
        "status": "completed",
        **_json_safe(result),
    }


@router.post("/window-analysis")
async def window_analysis(
    window_a_file: UploadFile = File(...),
    window_b_file: UploadFile = File(...),

    tenant_id: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    schedule_id: Optional[str] = Form(None),
    authorization: Optional[str] = Header(default=None),
):
    user_id = _require_authenticated_user(authorization)
    if tenant_id and project_id:
        _require_project_access_for_user(
            user_id=user_id,
            tenant_id=tenant_id,
            project_id=project_id,
        )
    parser_a = await _parser_from_upload(window_a_file)
    parser_b = await _parser_from_upload(window_b_file)

    result_core = CPMEngine.run_window_analysis(
        parser_a.get_activities(),
        parser_b.get_activities(),
        relationships_a=parser_a.get_relationships(),
        relationships_b=parser_b.get_relationships(),
        calendars_a=parser_a.get_calendars(),
        calendars_b=parser_b.get_calendars(),
    )

    analysis_id = str(uuid.uuid4())

    result = {
        "analysis_id": analysis_id,
        "analysis_type": "WINDOW_ANALYSIS",
        "tenant_id": tenant_id,
        "project_id": project_id,
        "schedule_id": schedule_id,
        "window_a": {
            "file_name": window_a_file.filename,
            "project": _project_metadata(parser_a),
            "source_sha256": parser_a.source_hash(),
            "parser_quality": parser_a.schedule_quality_snapshot(),
            "calendar_diagnostics": parser_a.get_calendar_diagnostics(),
        },
        "window_b": {
            "file_name": window_b_file.filename,
            "project": _project_metadata(parser_b),
            "source_sha256": parser_b.source_hash(),
            "parser_quality": parser_b.schedule_quality_snapshot(),
            "calendar_diagnostics": parser_b.get_calendar_diagnostics(),
        },
        "results": result_core,
        "impact_summary": _window_impact_summary(result_core),
        "gantt_comparison": {
            "method_label": "Window Analysis (Time Slice)",
            "before_label": "Window A",
            "after_label": "Window B",
            "before": _gantt_snapshot_from_frame(
                parser_a.get_activities(),
                mode="window",
            ),
            "after": _gantt_snapshot_from_frame(
                parser_b.get_activities(),
                mode="window",
            ),
        },
        "disclaimer": _forensic_disclaimer(),
    }

    if tenant_id and project_id and schedule_id:
        _persist_analysis(
            analysis_id=analysis_id,
            tenant_id=tenant_id,
            project_id=project_id,
            schedule_id=schedule_id,
            analysis_type="WINDOW_ANALYSIS",
            result=result,
        )

    return {
        "status": "completed",
        **_json_safe(result),
    }



def _derive_tia_source_ties_to_replace(
    *,
    parser: XERParser,
    fragnet_activity_ids: List[str],
    insertion_relationships: List[Dict[str, Any]],
    explicit_remove_relationships: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """
    Replace any direct source tie bypassed by an inserted delay fragnet.

    Example:
        source: PRED -> SUCC
        TIA:    PRED -> FRAGNET -> SUCC

    The direct PRED -> SUCC source relationship must be removed from the
    impacted calculation network; otherwise the successor can bypass the
    delay fragnet and the TIA can incorrectly report zero impact.
    """
    fragnet_ids = {str(x).strip() for x in fragnet_activity_ids if str(x).strip()}
    inbound_by_fragnet: Dict[str, List[str]] = {}
    outbound_by_fragnet: Dict[str, List[str]] = {}

    for rel in insertion_relationships:
        pred = str(rel.get("predecessor_activity_pk", "") or "").strip()
        succ = str(rel.get("successor_activity_pk", "") or "").strip()
        if not pred or not succ:
            continue

        if succ in fragnet_ids and pred not in fragnet_ids:
            inbound_by_fragnet.setdefault(succ, []).append(pred)
        if pred in fragnet_ids and succ not in fragnet_ids:
            outbound_by_fragnet.setdefault(pred, []).append(succ)

    replacement_pairs = set()
    for fragnet_id in fragnet_ids:
        for pred in inbound_by_fragnet.get(fragnet_id, []):
            for succ in outbound_by_fragnet.get(fragnet_id, []):
                replacement_pairs.add((pred, succ))

    derived: List[Dict[str, Any]] = []
    relationships_df = parser.get_relationships()
    if relationships_df is not None and not relationships_df.empty:
        for raw in relationships_df.to_dict(orient="records"):
            pred = str(raw.get("predecessor_activity_pk", "") or "").strip()
            succ = str(raw.get("successor_activity_pk", "") or "").strip()
            if (pred, succ) not in replacement_pairs:
                continue

            derived.append(
                {
                    "predecessor_activity_pk": pred,
                    "successor_activity_pk": succ,
                    "relationship_type": str(
                        raw.get("relationship_type", "FS") or "FS"
                    ),
                    "lag_hrs": float(raw.get("lag_hrs", 0) or 0),
                }
            )

    combined = [dict(x) for x in (explicit_remove_relationships or [])] + derived
    unique: List[Dict[str, Any]] = []
    seen = set()

    for rel in combined:
        pred = str(rel.get("predecessor_activity_pk", "") or "").strip()
        succ = str(rel.get("successor_activity_pk", "") or "").strip()
        rel_type = str(rel.get("relationship_type", "FS") or "FS").strip().upper()
        lag = float(rel.get("lag_hrs", 0) or 0)
        key = (pred, succ, rel_type, round(lag, 6))
        if not pred or not succ or key in seen:
            continue
        seen.add(key)
        unique.append(
            {
                "predecessor_activity_pk": pred,
                "successor_activity_pk": succ,
                "relationship_type": rel_type,
                "lag_hrs": lag,
            }
        )

    return unique


# =====================================================================
# 4A. SINGLE-ACTIVITY TIA — BACKWARD COMPATIBILITY
# =====================================================================

@router.post("/time-impact-analysis")
async def time_impact_analysis(
    payload: TIARequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )
    _, parser = _load_schedule_parser(
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
        schedule_id=payload.schedule_id,
    )

    options = _options_from_payload(
        payload.scheduling_options
    )

    try:
        engine = _build_engine(parser, options)
        before = engine.schedule()
        quality = engine.schedule_quality_report()

        fragnet = payload.fragnet

        if fragnet.delay_start_date and fragnet.delay_finish_date:
            # Date-driven TIA: preserve the elapsed event window and let the CPM
            # engine derive P6 working duration from the inherited source calendar.
            single_fragnet_activity = {
                "activity_id_pk": fragnet.fragnet_id,
                "activity_id": fragnet.fragnet_id,
                "activity_name": fragnet.fragnet_name,
                "planned_duration_hrs": fragnet.duration_hours,
                "calendar_id": fragnet.calendar_id,
                "status": "TK_NOTSTART",
                "delay_start_date": fragnet.delay_start_date,
                "delay_finish_date": fragnet.delay_finish_date,
            }

            single_insertions = [
                {
                    "predecessor_activity_pk": fragnet.predecessor_activity_pk,
                    "successor_activity_pk": fragnet.fragnet_id,
                    "relationship_type": fragnet.relationship_type,
                    "lag_hrs": fragnet.lag_hours,
                },
                {
                    "predecessor_activity_pk": fragnet.fragnet_id,
                    "successor_activity_pk": fragnet.successor_activity_pk,
                    "relationship_type": fragnet.relationship_type,
                    "lag_hrs": 0.0,
                },
            ]

            single_removals = _derive_tia_source_ties_to_replace(
                parser=parser,
                fragnet_activity_ids=[fragnet.fragnet_id],
                insertion_relationships=single_insertions,
                explicit_remove_relationships=[],
            )

            tia = engine.run_tia_fragnet(
                fragnet_id=fragnet.fragnet_id,
                fragnet_name=fragnet.fragnet_name,
                fragnet_activities=[single_fragnet_activity],
                fragnet_relationships=[],
                insertion_relationships=single_insertions,
                remove_relationships=single_removals,
                include_schedule_snapshots=True,
            )
        else:
            # Existing duration-only behaviour remains available for backward
            # compatibility with older saved clients/API callers.
            tia = engine.run_tia(
                fragnet_id=fragnet.fragnet_id,
                fragnet_name=fragnet.fragnet_name,
                duration_hours=fragnet.duration_hours,
                predecessor_activity_pk=fragnet.predecessor_activity_pk,
                successor_activity_pk=fragnet.successor_activity_pk,
                relationship_type=fragnet.relationship_type,
                lag_hours=fragnet.lag_hours,
                calendar_id=fragnet.calendar_id,
                include_schedule_snapshots=True,
            )

    except CPMValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"TIA calculation failed: {str(exc)}",
        )

    after_schedule_activities = tia.pop("_after_schedule_activities", [])
    tia.pop("_before_schedule_activities", None)
    impacted_network_activities = tia.pop(
        "_impacted_network_activities",
        after_schedule_activities,
    )
    impacted_network_relationships = tia.pop(
        "_impacted_network_relationships",
        [],
    )

    analysis_id = str(uuid.uuid4())

    result = {
        "analysis_id": analysis_id,
        "analysis_type": "TIME_IMPACT_ANALYSIS",
        "tia_mode": "single_activity_compatibility",
        "schedule_id": payload.schedule_id,
        "tenant_id": payload.tenant_id,
        "project_id": payload.project_id,
        "fragnet": fragnet.model_dump(),
        "source_sha256": parser.source_hash(),
        "network_sha256": engine.network_fingerprint(),
        "schedule_quality": quality,
        "parser_quality": parser.schedule_quality_snapshot(),
        "before": {
            "project_finish": before.get("project_finish"),
            "longest_path": before.get("longest_path", []),
            "summary_gantt": _summary_gantt(
                before.get("activities", [])
            ),
        },
        "after": {
            "project_finish": tia.get("impacted_finish"),
            "longest_path": tia.get(
                "impacted_longest_path", []
            ),
            "summary_gantt": _summary_gantt(
                tia.get(
                    "impacted_activities",
                    tia.get("impacted_longest_path", []),
                )
            ),
        },
        "gantt_comparison": {
            "method_label": "Time Impact Analysis (Single Delay Fragnet)",
            "before_label": "Before Impact",
            "after_label": "After Impact",
            "before": _gantt_snapshot_from_cpm(
                before.get("activities", []),
                parser=parser,
            ),
            "after": _gantt_snapshot_from_cpm(
                after_schedule_activities,
                parser=parser,
                fragnet_activity_pks={fragnet.fragnet_id},
            ),
        },
        "tia_event_window": _tia_event_window_summary(
            activity_pk=fragnet.fragnet_id,
            requested_start=fragnet.delay_start_date,
            requested_finish=fragnet.delay_finish_date,
            after_schedule_activities=after_schedule_activities,
        ),
        "impact": {
            "calendar_elapsed_hours": tia.get(
                "calendar_elapsed_impact_hours"
            ),
            "calendar_elapsed_days": tia.get(
                "calendar_elapsed_impact_days"
            ),
            "critical_path_extended": tia.get(
                "critical_path_extended"
            ),
            "critical_path_shift": tia.get(
                "critical_path_shift"
            ),
        },
        "engine_result": tia,
        "xer_export": {
            "impacted_activities": _json_safe(
                impacted_network_activities or after_schedule_activities
            ),
            "impacted_relationships": _json_safe(
                impacted_network_relationships
                or _single_tia_relationships_for_xer(
                    parser=parser,
                    fragnet=fragnet.model_dump(),
                )
            ),
            "template_activity_pk_by_new_activity": {
                str(fragnet.fragnet_id): str(fragnet.predecessor_activity_pk)
            },
        },
        "scheduling_options": (
            payload.scheduling_options.model_dump()
        ),
        "disclaimer": _forensic_disclaimer(),
    }

    _persist_analysis(
        analysis_id=analysis_id,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
        schedule_id=payload.schedule_id,
        analysis_type="TIME_IMPACT_ANALYSIS",
        result=result,
    )

    return {
        "status": "completed",
        **_json_safe(result),
    }


# =====================================================================
# 4B. MULTI-ACTIVITY FRAGNET TIA
# =====================================================================

@router.post("/time-impact-analysis/fragnet")
def multi_activity_time_impact_analysis(
    payload: MultiActivityTIARequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )
    request_started = time.perf_counter()

    def _tia_stage(label: str, stage_started: float | None = None) -> float:
        now = time.perf_counter()
        if stage_started is None:
            elapsed = now - request_started
            print(
                f"[Delay Analysis][TIA] {label} | total={elapsed:.3f}s",
                flush=True,
            )
        else:
            stage_elapsed = now - stage_started
            total_elapsed = now - request_started
            print(
                f"[Delay Analysis][TIA] {label} | "
                f"stage={stage_elapsed:.3f}s | total={total_elapsed:.3f}s",
                flush=True,
            )
        return now

    print(
        "[Delay Analysis][TIA] REQUEST START "
        f"schedule_id={payload.schedule_id} "
        f"fragnet_id={payload.fragnet_id} "
        f"activities={len(payload.fragnet_activities)} "
        f"insertions={len(payload.insertion_relationships)}",
        flush=True,
    )

    stage_started = time.perf_counter()
    _, parser = _load_schedule_parser(
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
        schedule_id=payload.schedule_id,
    )
    _tia_stage("SCHEDULE LOAD END", stage_started)

    stage_started = time.perf_counter()
    options = _options_from_payload(
        payload.scheduling_options
    )

    _tia_stage("OPTIONS READY", stage_started)

    try:
        stage_started = time.perf_counter()
        engine = _build_engine(parser, options)
        _tia_stage("ENGINE BUILD END", stage_started)

        stage_started = time.perf_counter()
        before = engine.schedule()
        _tia_stage("SOURCE CPM END", stage_started)

        stage_started = time.perf_counter()
        quality = engine.schedule_quality_report()
        _tia_stage("SCHEDULE QUALITY END", stage_started)

        event_dict = (
            payload.event.model_dump()
            if payload.event
            else None
        )

        fragnet_activity_rows = [
            x.model_dump(exclude_none=True)
            for x in payload.fragnet_activities
        ]
        insertion_relationship_rows = [
            x.model_dump(exclude_none=True)
            for x in payload.insertion_relationships
        ]
        explicit_remove_rows = [
            x.model_dump(exclude_none=True)
            for x in payload.remove_relationships
        ]

        stage_started = time.perf_counter()
        effective_remove_relationships = _derive_tia_source_ties_to_replace(
            parser=parser,
            fragnet_activity_ids=[
                str(x.get("activity_id_pk", "") or "")
                for x in fragnet_activity_rows
            ],
            insertion_relationships=insertion_relationship_rows,
            explicit_remove_relationships=explicit_remove_rows,
        )
        _tia_stage("FRAGNET INPUT PREP END", stage_started)

        stage_started = time.perf_counter()
        tia = engine.run_tia_fragnet(
            fragnet_id=payload.fragnet_id,
            fragnet_name=payload.fragnet_name,
            fragnet_activities=fragnet_activity_rows,
            fragnet_relationships=[
                x.model_dump(exclude_none=True)
                for x in payload.fragnet_relationships
            ],
            insertion_relationships=insertion_relationship_rows,
            remove_relationships=effective_remove_relationships,
            event=event_dict,
            include_schedule_snapshots=True,
        )
        _tia_stage("IMPACTED CPM / FRAGNET END", stage_started)

        event_model = None
        if event_dict:
            stage_started = time.perf_counter()
            event_model = engine.build_forensic_event_model(
                event_dict,
                affected_activity_ids=payload.affected_activity_ids,
                impacted_result=tia,
            )
            _tia_stage("FORENSIC EVENT MODEL END", stage_started)

    except CPMValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Multi-activity TIA calculation failed: {str(exc)}",
        )

    stage_started = time.perf_counter()
    after_schedule_activities = tia.pop("_after_schedule_activities", [])
    tia.pop("_before_schedule_activities", None)
    impacted_network_activities = tia.pop(
        "_impacted_network_activities",
        after_schedule_activities,
    )
    impacted_network_relationships = tia.pop(
        "_impacted_network_relationships",
        [],
    )

    analysis_id = str(uuid.uuid4())

    result = {
        "analysis_id": analysis_id,
        "analysis_type": "TIME_IMPACT_ANALYSIS",
        "tia_mode": "multi_activity_fragnet",
        "schedule_id": payload.schedule_id,
        "tenant_id": payload.tenant_id,
        "project_id": payload.project_id,
        "fragnet_id": payload.fragnet_id,
        "fragnet_name": payload.fragnet_name,
        "fragnet": {
            "activities": [
                x.model_dump(exclude_none=True)
                for x in payload.fragnet_activities
            ],
            "relationships": [
                x.model_dump(exclude_none=True)
                for x in payload.fragnet_relationships
            ],
            "insertion_relationships": [
                x.model_dump(exclude_none=True)
                for x in payload.insertion_relationships
            ],
            "remove_relationships": effective_remove_relationships,
        },
        "network_change": {
            "replacement_mode": "INSERT_BETWEEN_SOURCE_ACTIVITIES",
            "source_relationships_removed": effective_remove_relationships,
            "source_relationships_removed_count": len(
                effective_remove_relationships
            ),
            "fragnet_relationships_added": insertion_relationship_rows,
            "fragnet_relationships_added_count": len(
                insertion_relationship_rows
            ),
            "fragnet_activity_count": len(fragnet_activity_rows),
            "source_direct_tie_replacement": bool(
                effective_remove_relationships
            ),
        },
        "event": (
            payload.event.model_dump()
            if payload.event
            else None
        ),
        "forensic_event_model": event_model,
        "source_sha256": parser.source_hash(),
        "network_sha256": engine.network_fingerprint(),
        "schedule_quality": quality,
        "parser_quality": parser.schedule_quality_snapshot(),
        "calendar_diagnostics": parser.get_calendar_diagnostics(),
        "before": {
            "project_finish": before.get("project_finish"),
            "longest_path": before.get("longest_path", []),
            "summary_gantt": _summary_gantt(
                before.get("activities", [])
            ),
        },
        "after": {
            "project_finish": tia.get("impacted_finish"),
            "longest_path": tia.get(
                "impacted_longest_path", []
            ),
            "summary_gantt": _summary_gantt(
                tia.get(
                    "impacted_activities",
                    tia.get("impacted_longest_path", []),
                )
            ),
        },
        "tia_event_windows": [
            _tia_event_window_summary(
                activity_pk=str(activity.activity_id_pk),
                requested_start=activity.delay_start_date,
                requested_finish=activity.delay_finish_date,
                after_schedule_activities=after_schedule_activities,
            )
            for activity in payload.fragnet_activities
        ],
        "gantt_comparison": {
            "method_label": "Time Impact Analysis (Multi Delay Fragnet)",
            "before_label": "Before Impact",
            "after_label": "After Impact",
            "before": _gantt_snapshot_from_cpm(
                before.get("activities", []),
                parser=parser,
            ),
            "after": _gantt_snapshot_from_cpm(
                after_schedule_activities,
                parser=parser,
                fragnet_activity_pks={
                    str(x.activity_id_pk)
                    for x in payload.fragnet_activities
                },
            ),
        },
        "impact": {
            "calendar_elapsed_hours": tia.get(
                "calendar_elapsed_impact_hours"
            ),
            "calendar_elapsed_days": tia.get(
                "calendar_elapsed_impact_days"
            ),
            "critical_path_extended": tia.get(
                "critical_path_extended"
            ),
            "critical_path_shift": tia.get(
                "critical_path_shift"
            ),
        },
        "engine_result": tia,
        "xer_export": {
            "impacted_activities": _json_safe(
                impacted_network_activities or after_schedule_activities
            ),
            "impacted_relationships": _json_safe(
                impacted_network_relationships
                or _multi_tia_relationships_for_xer(
                    parser=parser,
                    fragnet={
                        "relationships": [
                            x.model_dump(exclude_none=True)
                            for x in payload.fragnet_relationships
                        ],
                        "insertion_relationships": [
                            x.model_dump(exclude_none=True)
                            for x in payload.insertion_relationships
                        ],
                        "remove_relationships": [
                            x.model_dump(exclude_none=True)
                            for x in payload.remove_relationships
                        ],
                    },
                )
            ),
            "template_activity_pk_by_new_activity": _template_map_for_xer(
                {
                    "tia_mode": "multi_activity_fragnet",
                    "fragnet": {
                        "activities": [
                            x.model_dump(exclude_none=True)
                            for x in payload.fragnet_activities
                        ],
                        "insertion_relationships": [
                            x.model_dump(exclude_none=True)
                            for x in payload.insertion_relationships
                        ],
                    },
                }
            ),
        },
        "scheduling_options": (
            payload.scheduling_options.model_dump()
        ),
        "disclaimer": _forensic_disclaimer(),
    }

    _tia_stage("RESULT ASSEMBLY END", stage_started)

    stage_started = time.perf_counter()
    print("[Delay Analysis][TIA] PERSISTENCE START", flush=True)
    _persist_analysis(
        analysis_id=analysis_id,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
        schedule_id=payload.schedule_id,
        analysis_type="TIME_IMPACT_ANALYSIS",
        result=result,
    )
    _tia_stage("PERSISTENCE END", stage_started)
    _tia_stage("REQUEST END")

    return {
        "status": "completed",
        **_json_safe(result),
    }


# =====================================================================
# 5. FORENSIC EVENT MODEL
# =====================================================================

@router.post("/forensic-event/model")
async def forensic_event_model(
    payload: ForensicEventModelRequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )
    _, parser = _load_schedule_parser(
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
        schedule_id=payload.schedule_id,
    )

    try:
        engine = _build_engine(
            parser,
            _options_from_payload(payload.scheduling_options),
        )
        summary = engine.schedule()

        model = engine.build_forensic_event_model(
            payload.event.model_dump(),
            affected_activity_ids=payload.affected_activity_ids,
        )

    except CPMValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Forensic event modelling failed: {str(exc)}",
        )

    analysis_id = str(uuid.uuid4())

    result = {
        "analysis_id": analysis_id,
        "analysis_type": "FORENSIC_EVENT_MODEL",
        "schedule_id": payload.schedule_id,
        "tenant_id": payload.tenant_id,
        "project_id": payload.project_id,
        "event": payload.event.model_dump(),
        "event_model": model,
        "project_finish": summary.get("project_finish"),
        "longest_path": summary.get("longest_path", []),
        "source_sha256": parser.source_hash(),
        "network_sha256": engine.network_fingerprint(),
        "schedule_quality": engine.schedule_quality_report(),
        "parser_quality": parser.schedule_quality_snapshot(),
        "disclaimer": _forensic_disclaimer(),
    }

    _persist_analysis(
        analysis_id=analysis_id,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
        schedule_id=payload.schedule_id,
        analysis_type="FORENSIC_EVENT_MODEL",
        result=result,
    )

    return {
        "status": "completed",
        **_json_safe(result),
    }





@router.get("/analyses")
async def list_delay_analyses(
    tenant_id: str,
    project_id: str,
    limit: int = MAX_DELAY_ANALYSES_PER_PROJECT,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )
    client = _require_supabase()
    safe_limit = min(max(int(limit or 1), 1), MAX_DELAY_ANALYSES_PER_PROJECT)

    try:
        response = (
            client.table("cpm_analyses")
            .select(
                "id,tenant_id,project_id,base_schedule_id,"
                "compared_schedule_id,analysis_type,created_at,results_json"
            )
            .eq("tenant_id", tenant_id)
            .eq("project_id", project_id)
            .order("created_at", desc=True)
            .limit(safe_limit)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to load recent Delay Analyses: {str(exc)}",
        )

    analyses = []
    for row in response.data or []:
        result = row.get("results_json") or {}
        fragnet = result.get("fragnet") or {}
        analyses.append(
            {
                "analysis_id": str(row.get("id") or ""),
                "analysis_type": row.get("analysis_type") or result.get("analysis_type"),
                "created_at": row.get("created_at"),
                "schedule_id": row.get("base_schedule_id") or result.get("schedule_id"),
                "compared_schedule_id": row.get("compared_schedule_id"),
                "tia_mode": result.get("tia_mode"),
                "fragnet_id": result.get("fragnet_id") or fragnet.get("fragnet_id"),
                "fragnet_name": result.get("fragnet_name") or fragnet.get("fragnet_name"),
                "before_finish": (result.get("before") or {}).get("project_finish"),
                "after_finish": (result.get("after") or {}).get("project_finish"),
                "impact_days": (result.get("impact") or {}).get("calendar_elapsed_days"),
                "status": result.get("status") or "completed",
            }
        )

    return {
        "status": "success",
        "retention_limit": MAX_DELAY_ANALYSES_PER_PROJECT,
        "count": len(analyses),
        "analyses": analyses,
        "retention_message": (
            "ContractX stores the latest 3 Delay Analyses for this project. "
            "When a fourth analysis is completed, the oldest stored analysis is "
            "automatically deleted. Save required XLSX/XER outputs to your own "
            "system before running additional analyses. Source programmes are "
            "never automatically deleted."
        ),
    }


@router.get("/analysis/{analysis_id}")
async def get_delay_analysis(
    analysis_id: str,
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )
    client = _require_supabase()

    try:
        row = (
            client.table("cpm_analyses")
            .select("*")
            .eq("id", analysis_id)
            .eq("tenant_id", tenant_id)
            .eq("project_id", project_id)
            .single()
            .execute()
        ).data
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to retrieve Delay Analysis: {str(exc)}",
        )

    if not row:
        raise HTTPException(
            status_code=404,
            detail="Delay Analysis not found for the requested project.",
        )

    return {
        "status": "success",
        "analysis_id": analysis_id,
        "analysis_type": row.get("analysis_type"),
        "created_at": row.get("created_at"),
        "result": _json_safe(row.get("results_json") or {}),
    }


@router.delete("/analysis/{analysis_id}")
async def delete_analysis(
    analysis_id: str,
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )
    """
    Permanently remove one persisted Engine 2 analysis.

    For TIA this removes the server-side impacted calculation/result used for
    future XLSX/XER regeneration. The original source programme is preserved.
    """
    client = _require_supabase()

    try:
        row = (
            client.table("cpm_analyses")
            .select("id,analysis_type,base_schedule_id")
            .eq("id", analysis_id)
            .eq("tenant_id", tenant_id)
            .eq("project_id", project_id)
            .single()
            .execute()
        ).data
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to inspect Engine 2 analysis: {str(exc)}",
        )

    if not row:
        raise HTTPException(
            status_code=404,
            detail="Analysis not found for the requested tenant/project.",
        )

    try:
        (
            client.table("delay_events")
            .update({"engine2_analysis_id": None})
            .eq("engine2_analysis_id", analysis_id)
            .execute()
        )
        (
            client.table("delay_event_analyses")
            .delete()
            .eq("analysis_id", analysis_id)
            .execute()
        )
        deleted = (
            client.table("cpm_analyses")
            .delete()
            .eq("id", analysis_id)
            .eq("tenant_id", tenant_id)
            .eq("project_id", project_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to delete Engine 2 analysis: {str(exc)}",
        )

    if not (deleted.data or []):
        raise HTTPException(
            status_code=404,
            detail="Analysis could not be deleted or is no longer available.",
        )

    return {
        "status": "success",
        "analysis_id": analysis_id,
        "analysis_type": row.get("analysis_type"),
        "source_schedule_id": row.get("base_schedule_id"),
        "source_programme_deleted": False,
        "message": (
            "Impacted analysis deleted permanently. "
            "The source programme remains unchanged."
        ),
    }


# =====================================================================
# 6A. IMPACTED XER EXPORT
# =====================================================================

@router.post("/analysis/export-xer")
async def export_impacted_xer(
    payload: XERExportRequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )
    """
    Export a persisted Time Impact Analysis as a source-preserving Primavera XER.

    The file is intended for P6 import/reschedule/regression validation and is
    not represented as byte-for-byte Oracle P6 export equivalence.
    """
    client = _require_supabase()

    try:
        analysis_row = (
            client.table("cpm_analyses")
            .select("*")
            .eq("id", payload.analysis_id)
            .eq("tenant_id", payload.tenant_id)
            .eq("project_id", payload.project_id)
            .single()
            .execute()
        ).data
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to retrieve TIA analysis for XER export: {str(exc)}",
        )

    if not analysis_row:
        raise HTTPException(
            status_code=404,
            detail="Analysis not found for the requested tenant/project.",
        )

    analysis = analysis_row.get("results_json") or {}
    analysis_type = str(
        analysis_row.get("analysis_type")
        or analysis.get("analysis_type")
        or ""
    ).upper()

    if analysis_type != "TIME_IMPACT_ANALYSIS":
        raise HTTPException(
            status_code=409,
            detail="Impacted XER export is available only for Time Impact Analysis.",
        )

    schedule_id = str(
        analysis_row.get("base_schedule_id")
        or analysis.get("schedule_id")
        or ""
    )
    if not schedule_id:
        raise HTTPException(
            status_code=422,
            detail="TIA analysis does not contain a base schedule reference.",
        )

    schedule_row, source_xer_content = _load_source_xer_content(
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
        schedule_id=schedule_id,
    )
    _, parser = _load_schedule_parser(
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
        schedule_id=schedule_id,
    )

    xer_data = analysis.get("xer_export") or {}

    impacted_activities = list(
        xer_data.get("impacted_activities")
        or analysis.get("engine_result", {}).get("_impacted_network_activities")
        or analysis.get("gantt_comparison", {}).get("after")
        or []
    )
    impacted_activities = _merge_fragnet_metadata_into_impacted(
        impacted_activities,
        analysis,
    )

    # RC1 regression safeguard:
    # Older saved TIA analyses can contain the inserted fragnet/network but not
    # recalculated CPM early/late/float fields. Exporting such a snapshot would
    # preserve stale source-programme float and create a misleading impacted XER.
    if impacted_activities:
        has_calculated_cpm_snapshot = any(
            item.get("early_start") is not None
            or item.get("early_finish") is not None
            or item.get("late_start") is not None
            or item.get("late_finish") is not None
            or item.get("total_float_hours") is not None
            for item in impacted_activities
        )
        if not has_calculated_cpm_snapshot:
            raise HTTPException(
                status_code=409,
                detail=(
                    "This saved TIA predates the final impacted-XER CPM snapshot fix. "
                    "Re-run the same TIA once, then export the new impacted XER. "
                    "The source programme remains unchanged."
                ),
            )

    impacted_relationships = list(
        xer_data.get("impacted_relationships")
        or analysis.get("engine_result", {}).get("_impacted_network_relationships")
        or []
    )

    if not impacted_relationships:
        if analysis.get("tia_mode") == "single_activity_compatibility":
            impacted_relationships = _single_tia_relationships_for_xer(
                parser=parser,
                fragnet=analysis.get("fragnet") or {},
            )
        elif analysis.get("tia_mode") == "multi_activity_fragnet":
            impacted_relationships = _multi_tia_relationships_for_xer(
                parser=parser,
                fragnet=analysis.get("fragnet") or {},
            )

    if not impacted_activities:
        raise HTTPException(
            status_code=409,
            detail=(
                "This TIA result does not contain the impacted activity network "
                "required for XER export. Re-run the TIA, then export again."
            ),
        )

    if not impacted_relationships:
        raise HTTPException(
            status_code=409,
            detail=(
                "This TIA result does not contain the impacted relationship network "
                "required for XER export. Re-run the TIA, then export again."
            ),
        )

    template_map = dict(
        xer_data.get("template_activity_pk_by_new_activity")
        or _template_map_for_xer(analysis)
    )

    try:
        write_result = build_impacted_xer(
            source_xer_content=source_xer_content,
            impacted_activities=impacted_activities,
            impacted_relationships=impacted_relationships,
            template_activity_pk_by_new_activity=template_map,
            write_calculated_dates=payload.write_calculated_dates,
        )
    except XERWriterError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Impacted XER generation failed: {str(exc)}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Impacted XER generation failed unexpectedly: {str(exc)}",
        )

    base_name = str(
        schedule_row.get("programme_title")
        or schedule_row.get("file_name")
        or "programme"
    )
    safe_base = re.sub(r"[^A-Za-z0-9._-]+", "_", base_name).strip("._")
    if not safe_base:
        safe_base = "programme"
    if safe_base.lower().endswith(".xer"):
        safe_base = safe_base[:-4]

    filename = f"{safe_base}_ContractX_Impacted_{payload.analysis_id[:8]}.xer"

    return StreamingResponse(
        io.BytesIO(write_result.content.encode("utf-8")),
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-ContractX-Analysis-ID": payload.analysis_id,
            "X-ContractX-Added-Activities": str(
                write_result.added_activity_count
            ),
            "X-ContractX-Relationship-Count": str(
                write_result.relationship_count
            ),
        },
    )


# =====================================================================
# 6. ANALYSIS XLSX EXPORT
# =====================================================================

def _flatten_dict(
    data: Dict[str, Any],
    *,
    prefix: str = "",
) -> List[List[Any]]:
    rows: List[List[Any]] = []

    for key, value in data.items():
        path = f"{prefix}.{key}" if prefix else str(key)

        if isinstance(value, dict):
            rows.extend(_flatten_dict(value, prefix=path))
        elif isinstance(value, list):
            if all(not isinstance(x, (dict, list)) for x in value):
                rows.append([path, ", ".join(str(x) for x in value)])
            else:
                rows.append([path, f"[{len(value)} item(s)]"])
        else:
            rows.append([path, value])

    return rows


def _write_list_sheet(ws, rows: List[Any]) -> None:
    if not rows:
        ws.append(["No data"])
        return

    dict_rows = [x for x in rows if isinstance(x, dict)]
    if len(dict_rows) != len(rows):
        ws.append(["Value"])
        for item in rows:
            ws.append([
                json.dumps(
                    _json_safe(item),
                    ensure_ascii=False,
                )
            ])
        return

    headers: List[str] = []
    seen = set()

    for row in dict_rows:
        for key in row.keys():
            if key not in seen:
                seen.add(key)
                headers.append(str(key))

    ws.append(headers)

    for row in dict_rows:
        ws.append(
            [
                (
                    json.dumps(
                        _json_safe(row.get(header)),
                        ensure_ascii=False,
                    )
                    if isinstance(
                        row.get(header),
                        (dict, list),
                    )
                    else _json_safe(row.get(header))
                )
                for header in headers
            ]
        )


@router.post("/analysis/export")
async def export_analysis(
    payload: AnalysisExportRequest,
    authorization: Optional[str] = Header(default=None),
):
    user_id = _require_authenticated_user(authorization)

    if payload.format.lower() != "xlsx":
        raise HTTPException(
            status_code=400,
            detail="Engine 2 supports professional forensic Gantt export in XLSX format.",
        )

    client = _require_supabase()

    try:
        query = (
            client.table("cpm_analyses")
            .select("*")
            .eq("id", payload.analysis_id)
        )

        if payload.tenant_id and payload.project_id:
            query = (
                query
                .eq("tenant_id", payload.tenant_id)
                .eq("project_id", payload.project_id)
            )

        result = query.single().execute()
        analysis_row = result.data

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to retrieve analysis: {str(exc)}",
        )

    if not analysis_row:
        raise HTTPException(
            status_code=404,
            detail="Analysis not found.",
        )

    analysis_tenant_id = str(
        payload.tenant_id
        or analysis_row.get("tenant_id")
        or ""
    ).strip()
    analysis_project_id = str(
        payload.project_id
        or analysis_row.get("project_id")
        or ""
    ).strip()

    if not analysis_tenant_id or not analysis_project_id:
        raise HTTPException(
            status_code=409,
            detail="Analysis security scope is incomplete.",
        )

    _require_project_access_for_user(
        user_id=user_id,
        tenant_id=analysis_tenant_id,
        project_id=analysis_project_id,
    )

    analysis = analysis_row.get("results_json") or {}

    if not analysis.get("gantt_comparison"):
        raise HTTPException(
            status_code=409,
            detail=(
                "This analysis was created before the professional Gantt XLSX "
                "dataset was introduced. Re-run the analysis, then export again."
            ),
        )

    programme_title = "Programme"
    project_title = ""

    base_schedule_id = (
        analysis_row.get("base_schedule_id")
        or analysis.get("schedule_id")
    )
    if base_schedule_id:
        try:
            schedule_row = (
                client.table("schedules")
                .select("programme_title,file_name")
                .eq("id", base_schedule_id)
                .single()
                .execute()
            ).data or {}
            programme_title = (
                schedule_row.get("programme_title")
                or schedule_row.get("file_name")
                or programme_title
            )
        except Exception:
            pass

    project_id = analysis_row.get("project_id") or analysis.get("project_id")
    if project_id:
        try:
            project_row = (
                client.table("projects")
                .select("project_name,project_code")
                .eq("id", project_id)
                .single()
                .execute()
            ).data or {}
            project_title = (
                project_row.get("project_name")
                or project_row.get("project_code")
                or ""
            )
        except Exception:
            pass

    try:
        buffer = build_forensic_gantt_xlsx(
            analysis=analysis,
            programme_title=programme_title,
            project_title=project_title,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Professional Gantt XLSX export failed: {str(exc)}",
        )

    method = (
        (analysis.get("gantt_comparison") or {}).get("method_label")
        or analysis.get("analysis_type")
        or "Forensic_Analysis"
    )
    safe_method = "".join(
        ch if ch.isalnum() or ch in ("_", "-") else "_"
        for ch in str(method)
    )
    filename = (
        f"ContractX_{safe_method}_"
        f"{payload.analysis_id[:8]}.xlsx"
    )

    return StreamingResponse(
        buffer,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": (
                f'attachment; filename="{filename}"'
            )
        },
    )

