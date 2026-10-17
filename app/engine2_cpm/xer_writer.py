from __future__ import annotations

"""
ContractX Engine 2 - Impacted XER Writer
----------------------------------------
Source-preserving Primavera P6 XER writer for forensic impact scenarios.

Design:
- Preserve the original XER structure and all non-TASK/TASKPRED tables.
- Update calculated fields for existing TASK rows from the impacted network.
- Add synthetic fragnet TASK rows using a source activity as structural template.
- Preserve every existing P6 calendar reference exactly as found in the source XER.
- Preserve every existing P6 WBS hierarchy record exactly as found in the source XER.
- Synthetic fragnet activities inherit the valid P6 calendar ID and WBS ID from their
  source template activity; ContractX never writes its internal "24H" calendar token
  into TASK.clndr_id and never creates or modifies CALENDAR / PROJWBS records.
- Reconstruct the modelled local TASKPRED network so the exported XER carries
  the same logic used by Engine 2.
- Keep an explicit synthetic-ID -> numeric P6 task_id mapping for auditability.

Important:
This writer does not claim byte-for-byte Oracle P6 export equivalence. It emits
a structurally compatible XER intended to be imported/rescheduled in P6 and
validated against the Engine 2 impact result.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Tuple


class XERWriterError(ValueError):
    pass


@dataclass
class XERWriteResult:
    content: str
    activity_id_map: Dict[str, str]
    relationship_count: int
    added_activity_count: int


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def _dt(value: Any) -> Optional[datetime]:
    if value is None or str(value).strip() == "":
        return None
    if isinstance(value, datetime):
        return value
    try:
        from pandas import to_datetime, Timestamp
        parsed = to_datetime(value, errors="coerce")
        if str(parsed) == "NaT":
            return None
        return Timestamp(parsed).to_pydatetime()
    except Exception:
        return None


def _fmt_date(value: Any) -> str:
    parsed = _dt(value)
    if parsed is None:
        return ""
    return parsed.strftime("%Y-%m-%d %H:%M")


def _rel_to_p6(value: Any) -> str:
    token = str(value or "FS").strip().upper()
    return {
        "FS": "PR_FS",
        "PR_FS": "PR_FS",
        "SS": "PR_SS",
        "PR_SS": "PR_SS",
        "FF": "PR_FF",
        "PR_FF": "PR_FF",
        "SF": "PR_SF",
        "PR_SF": "PR_SF",
    }.get(token, "PR_FS")


def _activity_type_to_p6(value: Any) -> str:
    token = str(value or "TT_Task").strip().upper()
    return {
        "TT_TASK": "TT_Task",
        "TASK_DEPENDENT": "TT_Task",
        "TT_RSRC": "TT_Rsrc",
        "RESOURCE_DEPENDENT": "TT_Rsrc",
        "TT_LOE": "TT_LOE",
        "LEVEL_OF_EFFORT": "TT_LOE",
        "TT_MILE": "TT_Mile",
        "START_MILESTONE": "TT_Mile",
        "TT_FINMILE": "TT_FinMile",
        "FINISH_MILESTONE": "TT_FinMile",
        "TT_WBS": "TT_WBS",
        "WBS_SUMMARY": "TT_WBS",
    }.get(token, str(value or "TT_Task"))


class ImpactedXERWriter:
    def __init__(self, source_xer_content: str):
        if not source_xer_content or "%T\tTASK" not in source_xer_content:
            raise XERWriterError("Source XER content does not contain a TASK table.")
        self.source = source_xer_content
        self.lines = source_xer_content.splitlines()

    def _table_sections(self) -> Dict[str, Tuple[int, int, List[str], List[List[str]]]]:
        sections: Dict[str, Tuple[int, int, List[str], List[List[str]]]] = {}
        current = None
        start = None
        fields: List[str] = []
        rows: List[List[str]] = []

        def flush(end_idx: int):
            nonlocal current, start, fields, rows
            if current is not None and start is not None:
                sections[current] = (start, end_idx, list(fields), list(rows))

        for idx, line in enumerate(self.lines):
            parts = line.split("\t")
            tag = parts[0] if parts else ""
            if tag == "%T":
                flush(idx)
                current = parts[1] if len(parts) > 1 else ""
                start = idx
                fields = []
                rows = []
            elif tag == "%F" and current is not None:
                fields = parts[1:]
            elif tag == "%R" and current is not None:
                values = parts[1:]
                if fields:
                    values = values[:len(fields)] + [""] * max(0, len(fields) - len(values))
                rows.append(values)
            elif tag == "%E":
                flush(idx)
                break

        if current is not None and current not in sections:
            flush(len(self.lines))

        return sections

    @staticmethod
    def _record(fields: List[str], values: List[str]) -> Dict[str, str]:
        return dict(zip(fields, values))

    @staticmethod
    def _values(fields: List[str], record: Dict[str, Any]) -> List[str]:
        return [_as_text(record.get(f, "")) for f in fields]

    @staticmethod
    def _max_numeric(values: Iterable[Any], default: int = 0) -> int:
        result = default
        for value in values:
            try:
                result = max(result, int(str(value).strip()))
            except Exception:
                pass
        return result

    def build(
        self,
        *,
        impacted_activities: List[Dict[str, Any]],
        impacted_relationships: List[Dict[str, Any]],
        template_activity_pk_by_new_activity: Optional[Dict[str, str]] = None,
        write_calculated_dates: bool = True,
    ) -> XERWriteResult:
        sections = self._table_sections()
        if "TASK" not in sections:
            raise XERWriterError("TASK table missing from source XER.")
        if "TASKPRED" not in sections:
            raise XERWriterError("TASKPRED table missing from source XER.")

        task_start, task_end, task_fields, task_rows = sections["TASK"]
        pred_start, pred_end, pred_fields, pred_rows = sections["TASKPRED"]

        raw_tasks = [self._record(task_fields, row) for row in task_rows]
        raw_by_id = {str(r.get("task_id", "")).strip(): r for r in raw_tasks}
        existing_ids = set(raw_by_id)

        # Source-calendar integrity set. ContractX does not create, replace,
        # remap or edit P6 calendars during impacted-XER export.
        source_calendar_ids = set()
        if "CALENDAR" in sections:
            _, _, calendar_fields, calendar_rows = sections["CALENDAR"]
            if "clndr_id" in calendar_fields:
                for row in calendar_rows:
                    record = self._record(calendar_fields, row)
                    calendar_id = str(record.get("clndr_id", "") or "").strip()
                    if calendar_id:
                        source_calendar_ids.add(calendar_id)

        # Source-WBS integrity set. ContractX does not create, replace, remap
        # or edit the P6 WBS hierarchy during impacted-XER export.
        source_wbs_ids = set()
        wbs_project_by_id: Dict[str, str] = {}
        if "PROJWBS" in sections:
            _, _, wbs_fields, wbs_rows = sections["PROJWBS"]
            for row in wbs_rows:
                record = self._record(wbs_fields, row)
                wbs_id = str(record.get("wbs_id", "") or "").strip()
                proj_id = str(record.get("proj_id", "") or "").strip()
                if wbs_id:
                    source_wbs_ids.add(wbs_id)
                    wbs_project_by_id[wbs_id] = proj_id

        source_project_ids = set()
        if "PROJECT" in sections:
            _, _, project_fields, project_rows = sections["PROJECT"]
            if "proj_id" in project_fields:
                for row in project_rows:
                    record = self._record(project_fields, row)
                    proj_id = str(record.get("proj_id", "") or "").strip()
                    if proj_id:
                        source_project_ids.add(proj_id)

        impacted_by_pk = {
            str(item.get("activity_id_pk") or item.get("activity_pk") or "").strip(): item
            for item in impacted_activities
            if str(item.get("activity_id_pk") or item.get("activity_pk") or "").strip()
        }

        max_task_id = self._max_numeric(existing_ids, 0)
        p6_id_map: Dict[str, str] = {}
        for pk in impacted_by_pk:
            if pk in existing_ids:
                p6_id_map[pk] = pk
            else:
                max_task_id += 1
                p6_id_map[pk] = str(max_task_id)

        template_activity_pk_by_new_activity = template_activity_pk_by_new_activity or {}

        def apply_calculated_fields(rec: Dict[str, Any], item: Dict[str, Any]) -> None:
            if "task_code" in task_fields:
                rec["task_code"] = _as_text(
                    item.get("activity_id") or item.get("activity_code") or rec.get("task_code")
                )
            if "task_name" in task_fields:
                rec["task_name"] = _as_text(item.get("activity_name") or rec.get("task_name"))
            # IMPORTANT: never overwrite TASK.clndr_id from Engine 2 metadata.
            # Engine 2 may use an internal "24H" calendar for deterministic
            # calendar-day TIA calculations, but "24H" is not a Primavera P6
            # clndr_id. Existing TASK rows keep their original source clndr_id;
            # synthetic fragnet rows inherit the source template's clndr_id.
            # Existing TASK rows keep their original source WBS assignment.
            # Synthetic fragnet rows receive WBS from the chosen source template
            # before this helper is called. Engine 2 synthetic metadata must not
            # overwrite that P6 foreign-key assignment.
            if "task_type" in task_fields:
                rec["task_type"] = _activity_type_to_p6(
                    item.get("activity_type_raw")
                    or item.get("activity_type")
                    or rec.get("task_type")
                )
            if "status_code" in task_fields and item.get("status") is not None:
                rec["status_code"] = _as_text(item.get("status"))
            if "target_drtn_hr_cnt" in task_fields:
                rec["target_drtn_hr_cnt"] = _as_text(
                    item.get("planned_duration_hrs", item.get("duration_hours", rec.get("target_drtn_hr_cnt", "0")))
                )
            if "remain_drtn_hr_cnt" in task_fields:
                rec["remain_drtn_hr_cnt"] = _as_text(
                    item.get("remaining_duration_hrs", item.get("duration_hours", rec.get("remain_drtn_hr_cnt", "0")))
                )

            if write_calculated_dates:
                date_map = {
                    "early_start_date": item.get("early_start"),
                    "early_end_date": item.get("early_finish"),
                    "late_start_date": item.get("late_start"),
                    "late_end_date": item.get("late_finish"),
                }
                for field, value in date_map.items():
                    if field in task_fields and value is not None:
                        rec[field] = _fmt_date(value)

                if "total_float_hr_cnt" in task_fields and item.get("total_float_hours") is not None:
                    rec["total_float_hr_cnt"] = _as_text(item.get("total_float_hours"))
                if "free_float_hr_cnt" in task_fields and item.get("free_float_hours") is not None:
                    rec["free_float_hr_cnt"] = _as_text(item.get("free_float_hours"))

            if "cstr_type" in task_fields and item.get("primary_constraint_type") is not None:
                rec["cstr_type"] = _as_text(
                    item.get("primary_constraint_type_raw")
                    or item.get("primary_constraint_type")
                )
            if "cstr_date" in task_fields and item.get("primary_constraint_date") is not None:
                rec["cstr_date"] = _fmt_date(item.get("primary_constraint_date"))
            if "cstr_type2" in task_fields and item.get("secondary_constraint_type") is not None:
                rec["cstr_type2"] = _as_text(
                    item.get("secondary_constraint_type_raw")
                    or item.get("secondary_constraint_type")
                )
            if "cstr_date2" in task_fields and item.get("secondary_constraint_date") is not None:
                rec["cstr_date2"] = _fmt_date(item.get("secondary_constraint_date"))

        # Update existing rows in source order.
        new_task_records: List[Dict[str, Any]] = []
        for raw in raw_tasks:
            rec = dict(raw)
            pk = str(raw.get("task_id", "")).strip()
            item = impacted_by_pk.get(pk)
            if item:
                apply_calculated_fields(rec, item)
            new_task_records.append(rec)

        # Add synthetic fragnet activities.
        added_count = 0
        for pk, item in impacted_by_pk.items():
            if pk in existing_ids:
                continue

            template_pk = str(template_activity_pk_by_new_activity.get(pk, "")).strip()
            template = raw_by_id.get(template_pk)
            if template is None and raw_tasks:
                template = raw_tasks[0]
            if template is None:
                template = {f: "" for f in task_fields}

            rec = dict(template)
            rec["task_id"] = p6_id_map[pk]

            # The synthetic fragnet inherits project/WBS/calendar foreign keys
            # from the chosen source template activity. This keeps the new TASK
            # inside the same valid Primavera project/WBS/calendar structure.
            inherited_project_id = str(
                template.get("proj_id", "") or ""
            ).strip()
            inherited_wbs_id = str(
                template.get("wbs_id", "") or ""
            ).strip()
            inherited_calendar_id = str(
                template.get("clndr_id", "") or ""
            ).strip()

            if "proj_id" in task_fields:
                if not inherited_project_id:
                    raise XERWriterError(
                        f"Synthetic fragnet activity {pk} cannot be exported because "
                        "its source template activity has no Primavera project ID."
                    )
                if (
                    source_project_ids
                    and inherited_project_id not in source_project_ids
                ):
                    raise XERWriterError(
                        f"Synthetic fragnet activity {pk} inherited Primavera "
                        f"project ID {inherited_project_id}, but that project "
                        "does not exist in the source XER PROJECT table."
                    )
                rec["proj_id"] = inherited_project_id

            if "wbs_id" in task_fields:
                if not inherited_wbs_id:
                    raise XERWriterError(
                        f"Synthetic fragnet activity {pk} cannot be exported because "
                        "its source template activity has no Primavera WBS ID."
                    )
                if source_wbs_ids and inherited_wbs_id not in source_wbs_ids:
                    raise XERWriterError(
                        f"Synthetic fragnet activity {pk} inherited Primavera "
                        f"WBS ID {inherited_wbs_id}, but that WBS does not exist "
                        "in the source XER PROJWBS table."
                    )
                wbs_project_id = wbs_project_by_id.get(inherited_wbs_id, "")
                if (
                    wbs_project_id
                    and inherited_project_id
                    and wbs_project_id != inherited_project_id
                ):
                    raise XERWriterError(
                        f"Synthetic fragnet activity {pk} inherited WBS ID "
                        f"{inherited_wbs_id} from project {wbs_project_id}, "
                        f"but its template project is {inherited_project_id}."
                    )
                rec["wbs_id"] = inherited_wbs_id

            if "clndr_id" in task_fields:
                # Do not use item["calendar_id"] here because that value can
                # legitimately be ContractX's internal "24H" token.
                if not inherited_calendar_id:
                    raise XERWriterError(
                        f"Synthetic fragnet activity {pk} cannot be exported because "
                        "its source template activity has no Primavera calendar ID."
                    )

                if (
                    source_calendar_ids
                    and inherited_calendar_id not in source_calendar_ids
                ):
                    raise XERWriterError(
                        f"Synthetic fragnet activity {pk} inherited Primavera "
                        f"calendar ID {inherited_calendar_id}, but that calendar "
                        "does not exist in the source XER CALENDAR table."
                    )

                rec["clndr_id"] = inherited_calendar_id

            # Clear source-specific progress/actual fields inherited from template.
            for field in (
                "act_start_date",
                "act_end_date",
                "restart_date",
                "reend_date",
                "phys_complete_pct",
                "complete_pct",
                "act_work_qty",
                "act_equip_qty",
                "act_reg_cost",
            ):
                if field in rec:
                    rec[field] = ""

            apply_calculated_fields(rec, item)

            # For new impact activities, planned dates may be populated from the
            # calculated scenario so the imported XER is immediately inspectable.
            if "target_start_date" in task_fields:
                rec["target_start_date"] = _fmt_date(
                    item.get("early_start") or item.get("planned_start")
                )
            if "target_end_date" in task_fields:
                rec["target_end_date"] = _fmt_date(
                    item.get("early_finish") or item.get("planned_finish")
                )

            new_task_records.append(rec)
            added_count += 1

        # Rebuild the modelled relationship network using a source TASKPRED row
        # only as a structural template. Preserve project IDs when available.
        pred_template = (
            self._record(pred_fields, pred_rows[0])
            if pred_rows
            else {f: "" for f in pred_fields}
        )
        max_pred_id = self._max_numeric(
            (self._record(pred_fields, r).get("task_pred_id") for r in pred_rows),
            0,
        )

        # Existing project-id lookup from task rows.
        project_by_task = {
            str(r.get("task_id", "")).strip(): _as_text(r.get("proj_id"))
            for r in raw_tasks
        }

        new_pred_records: List[Dict[str, Any]] = []
        for rel in impacted_relationships:
            pred_pk = str(
                rel.get("predecessor_activity_pk")
                or rel.get("pred")
                or ""
            ).strip()
            succ_pk = str(
                rel.get("successor_activity_pk")
                or rel.get("succ")
                or ""
            ).strip()
            if not pred_pk or not succ_pk:
                continue
            if pred_pk not in p6_id_map or succ_pk not in p6_id_map:
                continue

            max_pred_id += 1
            rec = dict(pred_template)
            if "task_pred_id" in pred_fields:
                rec["task_pred_id"] = str(max_pred_id)
            if "pred_task_id" in pred_fields:
                rec["pred_task_id"] = p6_id_map[pred_pk]
            if "task_id" in pred_fields:
                rec["task_id"] = p6_id_map[succ_pk]
            if "pred_type" in pred_fields:
                rec["pred_type"] = _rel_to_p6(
                    rel.get("relationship_type") or rel.get("rel_type")
                )
            if "lag_hr_cnt" in pred_fields:
                rec["lag_hr_cnt"] = _as_text(
                    rel.get("lag_hrs", rel.get("lag_hours", 0.0))
                )

            succ_proj = project_by_task.get(p6_id_map[succ_pk], "")
            pred_proj = project_by_task.get(p6_id_map[pred_pk], "")
            if not succ_proj:
                # Synthetic activity: infer project from the first source task.
                succ_proj = _as_text(raw_tasks[0].get("proj_id")) if raw_tasks else ""
            if not pred_proj:
                pred_proj = _as_text(raw_tasks[0].get("proj_id")) if raw_tasks else ""

            if "proj_id" in pred_fields:
                rec["proj_id"] = succ_proj
            if "pred_proj_id" in pred_fields:
                rec["pred_proj_id"] = pred_proj
            new_pred_records.append(rec)

        # Final project/WBS/calendar foreign-key validation.
        if "proj_id" in task_fields and source_project_ids:
            invalid_project_refs = []
            for rec in new_task_records:
                task_id = str(rec.get("task_id", "") or "").strip()
                proj_id = str(rec.get("proj_id", "") or "").strip()
                if proj_id and proj_id not in source_project_ids:
                    invalid_project_refs.append((task_id, proj_id))
            if invalid_project_refs:
                sample = ", ".join(
                    f"TASK {task_id} -> PROJECT {proj_id}"
                    for task_id, proj_id in invalid_project_refs[:5]
                )
                raise XERWriterError(
                    "Impacted XER contains invalid Primavera project reference(s): "
                    + sample
                )

        if "wbs_id" in task_fields and source_wbs_ids:
            invalid_wbs_refs = []
            blank_synthetic_wbs = []
            synthetic_p6_ids = {
                p6_id_map[pk]
                for pk in impacted_by_pk
                if pk not in existing_ids
            }

            for rec in new_task_records:
                task_id = str(rec.get("task_id", "") or "").strip()
                wbs_id = str(rec.get("wbs_id", "") or "").strip()

                if task_id in synthetic_p6_ids and not wbs_id:
                    blank_synthetic_wbs.append(task_id)
                elif wbs_id and wbs_id not in source_wbs_ids:
                    invalid_wbs_refs.append((task_id, wbs_id))

                if wbs_id and wbs_id in wbs_project_by_id:
                    task_proj_id = str(rec.get("proj_id", "") or "").strip()
                    wbs_proj_id = wbs_project_by_id.get(wbs_id, "")
                    if task_proj_id and wbs_proj_id and task_proj_id != wbs_proj_id:
                        invalid_wbs_refs.append(
                            (task_id, f"{wbs_id} (belongs to PROJECT {wbs_proj_id})")
                        )

            if blank_synthetic_wbs:
                raise XERWriterError(
                    "Impacted XER contains synthetic Primavera TASK row(s) with "
                    "no WBS assignment: " + ", ".join(blank_synthetic_wbs[:5])
                )

            if invalid_wbs_refs:
                sample = ", ".join(
                    f"TASK {task_id} -> WBS {wbs_id}"
                    for task_id, wbs_id in invalid_wbs_refs[:5]
                )
                raise XERWriterError(
                    "Impacted XER contains invalid Primavera WBS reference(s): "
                    + sample
                )

        # Existing P6 calendars remain untouched; every TASK row must reference
        # an existing source calendar where the source XER exposes CALENDAR.
        if "clndr_id" in task_fields and source_calendar_ids:
            invalid_calendar_refs = []
            for rec in new_task_records:
                task_id = str(rec.get("task_id", "") or "").strip()
                calendar_id = str(rec.get("clndr_id", "") or "").strip()
                if calendar_id and calendar_id not in source_calendar_ids:
                    invalid_calendar_refs.append((task_id, calendar_id))

            if invalid_calendar_refs:
                sample = ", ".join(
                    f"TASK {task_id} -> CALENDAR {calendar_id}"
                    for task_id, calendar_id in invalid_calendar_refs[:5]
                )
                raise XERWriterError(
                    "Impacted XER contains invalid Primavera calendar reference(s): "
                    + sample
                )

        task_block = [
            "%T\tTASK",
            "%F\t" + "\t".join(task_fields),
            *("%R\t" + "\t".join(self._values(task_fields, r)) for r in new_task_records),
        ]
        pred_block = [
            "%T\tTASKPRED",
            "%F\t" + "\t".join(pred_fields),
            *("%R\t" + "\t".join(self._values(pred_fields, r)) for r in new_pred_records),
        ]

        # Replace tables from bottom to top so line indices remain stable.
        output_lines = list(self.lines)
        replacements = [
            (task_start, task_end, task_block),
            (pred_start, pred_end, pred_block),
        ]
        for start, end, block in sorted(replacements, key=lambda x: x[0], reverse=True):
            output_lines[start:end] = block

        content = "\r\n".join(output_lines)
        if not content.endswith("\r\n"):
            content += "\r\n"

        return XERWriteResult(
            content=content,
            activity_id_map=p6_id_map,
            relationship_count=len(new_pred_records),
            added_activity_count=added_count,
        )


def build_impacted_xer(
    *,
    source_xer_content: str,
    impacted_activities: List[Dict[str, Any]],
    impacted_relationships: List[Dict[str, Any]],
    template_activity_pk_by_new_activity: Optional[Dict[str, str]] = None,
    write_calculated_dates: bool = True,
) -> XERWriteResult:
    return ImpactedXERWriter(source_xer_content).build(
        impacted_activities=impacted_activities,
        impacted_relationships=impacted_relationships,
        template_activity_pk_by_new_activity=template_activity_pk_by_new_activity,
        write_calculated_dates=write_calculated_dates,
    )