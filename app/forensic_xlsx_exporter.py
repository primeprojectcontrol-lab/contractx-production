from __future__ import annotations



import io

from datetime import datetime, timedelta

from typing import Any, Dict, Iterable, List, Optional, Tuple



import xlsxwriter



EXPORTER_BUILD = "Engine 2 - Enterprise V3.1 - Method-Specific Workbook"





# ==============================================================================

# Helper Utilities & Parsing Functions

# ==============================================================================



def _dt(value: Any) -> Optional[datetime]:

    """Parse string/datetime objects into a clean timezone-naive datetime object."""

    if not value:

        return None

    if isinstance(value, datetime):

        return value.replace(tzinfo=None)

    try:

        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)

    except Exception:

        return None





def _num(value: Any, default: float = 0.0) -> float:

    """Safe numeric conversion for floats/durations."""

    try:

        if value is None:

            return default

        return float(value)

    except Exception:

        return default





def _safe_sheet_name(value: str) -> str:

    """Ensure worksheet name conforms to Excel 31-character limit and valid characters."""

    bad = "[]:*?/\\\\"

    result = "".join("_" if ch in bad else ch for ch in value)

    return result[:31] or "Sheet"





def _finish_variance_days(after_item: Dict[str, Any], before_dict: Dict[str, Dict[str, Any]]) -> Optional[float]:

    """Calculate finish date variance in calendar days (After Finish - Before Finish)."""

    a_id = after_item.get("activity_id") or after_item.get("activity_id_pk")

    b_item = before_dict.get(a_id)

    if not b_item:

        return None

    a_fin = _dt(after_item.get("finish"))

    b_fin = _dt(b_item.get("finish"))

    if not a_fin or not b_fin:

        return None

    return float((a_fin - b_fin).days)





def _start_variance_days(after_item: Dict[str, Any], before_dict: Dict[str, Dict[str, Any]]) -> Optional[float]:

    """Calculate start date variance in calendar days (After Start - Before Start)."""

    a_id = after_item.get("activity_id") or after_item.get("activity_id_pk")

    b_item = before_dict.get(a_id)

    if not b_item:

        return None

    a_str = _dt(after_item.get("start"))

    b_str = _dt(b_item.get("start"))

    if not a_str or not b_str:

        return None

    return float((a_str - b_str).days)





def _timeline_periods(

    rows: Iterable[Dict[str, Any]],

) -> Tuple[str, List[Tuple[datetime, datetime, str]]]:

    """

    Dynamically calculate Gantt timeline grid resolution (Day, Week, or Month)

    based on the total calendar span of all schedule activities.

    """

    dates: List[datetime] = []

    for row in rows:

        start = _dt(row.get("start") or row.get("as_planned_start") or row.get("actual_start"))

        finish = _dt(row.get("finish") or row.get("as_planned_finish") or row.get("actual_finish"))

        if start:

            dates.append(start)

        if finish:

            dates.append(finish)



    if not dates:

        start = datetime.now()

        end = start + timedelta(days=30)

    else:

        start = min(dates)

        end = max(dates)



    start = datetime(start.year, start.month, start.day)

    end = datetime(end.year, end.month, end.day)

    span_days = max((end - start).days, 1)



    periods: List[Tuple[datetime, datetime, str]] = []



    if span_days <= 120:

        mode = "day"

        cursor = start

        while cursor <= end:

            nxt = cursor + timedelta(days=1)

            periods.append((cursor, nxt, cursor.strftime("%d-%b")))

            cursor = nxt

    elif span_days <= 900:

        mode = "week"

        cursor = start - timedelta(days=start.weekday())

        while cursor <= end:

            nxt = cursor + timedelta(days=7)

            periods.append((cursor, nxt, cursor.strftime("%d-%b")))

            cursor = nxt

    else:

        mode = "month"

        cursor = datetime(start.year, start.month, 1)

        while cursor <= end:

            if cursor.month == 12:

                nxt = datetime(cursor.year + 1, 1, 1)

            else:

                nxt = datetime(cursor.year, cursor.month + 1, 1)

            periods.append((cursor, nxt, cursor.strftime("%b-%y")))

            cursor = nxt



    return mode, periods





def _bar_overlaps(row: Dict[str, Any], period_start: datetime, period_end: datetime) -> bool:

    """Determine if an activity's start/finish span overlaps with a timeline column period."""

    start = _dt(row.get("start") or row.get("as_planned_start") or row.get("actual_start"))

    finish = _dt(row.get("finish") or row.get("as_planned_finish") or row.get("actual_finish"))

    if not start or not finish:

        return False

    if finish < start:

        start, finish = finish, start

    return start < period_end and finish >= period_start





# ==============================================================================

# Main Export Engine Function

# ==============================================================================



def build_forensic_gantt_xlsx(

    *,

    analysis: Dict[str, Any],

    programme_title: str,

    project_title: str = "",

) -> io.BytesIO:

    """

    Constructs an enterprise-grade forensic schedule analysis workbook supporting

    As-Planned vs. As-Built, Window Analysis, and Multi-Event Time Impact Analysis.

    """



    # ------------------------------------------------------------------

    # Data Payload Extraction

    # ------------------------------------------------------------------

    comparison = analysis.get("gantt_comparison") or {}

    before_rows = list(comparison.get("before") or analysis.get("as_planned_rows") or [])

    after_rows = list(comparison.get("after") or analysis.get("as_built_rows") or [])

    before_by_key = {r.get("activity_id") or r.get("activity_id_pk"): r for r in before_rows}



    if not before_rows and not after_rows:

        raise ValueError("This analysis does not contain the canonical Gantt comparison dataset.")



    before_label = str(comparison.get("before_label") or "Before Impact / As-Planned")

    after_label = str(comparison.get("after_label") or "After Impact / As-Built")

    method_label = str(

        comparison.get("method_label") 

        or analysis.get("analysis_type") 

        or "Forensic Schedule Analysis (AP vs AB / Window / Multi-TIA)"

    )



    windows_data = list(analysis.get("windows") or analysis.get("window_list") or [])

    fragnets_data = list(analysis.get("fragnets") or analysis.get("delay_events") or [])



    # ------------------------------------------------------------------

    # Method-aware workbook composition.

    # Only methodology-specific sheets are created for the method actually run.

    # ------------------------------------------------------------------

    method_token = " ".join(

        str(value or "")

        for value in (

            analysis.get("analysis_type"),

            comparison.get("method_label"),

            method_label,

        )

    ).upper()



    is_window_analysis = (

        "WINDOW" in method_token

        or "TIME SLICE" in method_token

    )

    is_ap_ab = (

        "AS-PLANNED" in method_token

        or "AS PLANNED" in method_token

        or "AP VS AB" in method_token

        or "AP/AB" in method_token

        or "AS-BUILT" in method_token

        or "AS BUILT" in method_token

    )

    is_multi_tia = (

        ("MULTI" in method_token and "TIA" in method_token)

        or "MULTI-EVENT TIME IMPACT" in method_token

        or "MULTI EVENT TIME IMPACT" in method_token

    )

    is_single_tia = (

        ("TIME IMPACT" in method_token or "TIA" in method_token)

        and not is_multi_tia

        and not is_window_analysis

        and not is_ap_ab

    )

    is_tia = is_single_tia or is_multi_tia

    raw_data_date = analysis.get("data_date") or analysis.get("analysis_date")

    data_date = _dt(raw_data_date)



   
    # ------------------------------------------------------------------
    # TIA fragnet presentation normalisation
    # ------------------------------------------------------------------
    # Engine 2 represents calendar-day delay fragnets internally as
    # planned_duration_hrs = entered_calendar_days * 24.
    #
    # Workbook presentation must show the entered calendar-day duration,
    # not reinterpret those hours as 8-hour working days.
    fragnet_duration_days_by_pk: Dict[str, float] = {}

    fragnet_payload = analysis.get("fragnet") or {}
    fragnet_activities = list(fragnet_payload.get("activities") or [])

    for frag_activity in fragnet_activities:
        frag_pk = str(
            frag_activity.get("activity_id_pk")
            or frag_activity.get("activity_id")
            or ""
        ).strip()

        duration_hours = frag_activity.get("planned_duration_hrs")
        calendar_token = str(
            frag_activity.get("calendar_id") or ""
        ).strip().upper()

        if frag_pk and duration_hours is not None and calendar_token == "24H":
            try:
                fragnet_duration_days_by_pk[frag_pk] = round(
                    float(duration_hours) / 24.0,
                    2,
                )
            except (TypeError, ValueError):
                pass

    def _display_duration_days(item: Dict[str, Any]) -> Optional[float]:
        """Return user-facing duration in the appropriate day basis."""
        if item.get("is_fragnet"):
            frag_key = str(
                item.get("activity_id_pk")
                or item.get("activity_id")
                or ""
            ).strip()
            if frag_key in fragnet_duration_days_by_pk:
                return fragnet_duration_days_by_pk[frag_key]

        value = item.get("original_duration_days")
        if value is None:
            value = item.get("planned_duration_days")
        if value is None:
            return None
        return _num(value)

    def _display_total_float_days(item: Dict[str, Any]) -> Optional[float]:
        """
        Suppress synthetic-fragnet Total Float in Excel presentation.

        Engine 2 still calculates and retains the value internally. The omission
        is presentation-only because the synthetic fragnet uses a calendar-day
        basis while source activities can use working calendars.
        """
        if item.get("is_fragnet"):
            return None

        value = item.get("total_float_days")
        if value is None:
            return None
        return _num(value)

    all_rows = before_rows + after_rows

    scale_mode, periods = _timeline_periods(all_rows)



    DISCLAIMER_TEXT = (

        "Disclaimer: The ContractX output is based on AI assessment and CPM deterministic "

        "calculations and requires expert human review and validation."

    )



    buffer = io.BytesIO()

    workbook = xlsxwriter.Workbook(buffer, {"in_memory": True})



    # ------------------------------------------------------------------

    # Centralized Color Palette & Workbook Formats

    # ------------------------------------------------------------------

    gold = "#D8A84E"

    dark = "#17202A"

    dark2 = "#25313D"

    border = "#D7DCE1"

    pale = "#F4F6F8"

    white = "#FFFFFF"

    blue = "#4F8FB8"

    blue2 = "#7EA9C4"

    red = "#D9534F"

    goldbar = "#D8A84E"

    dd_bg = "#FFF0F0"

    green_bg = "#E8F8F5"

    red_bg = "#FDEDEC"



    fmt_title = workbook.add_format({"bold": True, "font_size": 18, "font_color": dark, "valign": "vcenter"})

    fmt_brand = workbook.add_format({"bold": True, "font_size": 16, "font_color": dark})

    fmt_brand_x = workbook.add_format({"bold": True, "font_size": 16, "font_color": gold})

    fmt_meta_label = workbook.add_format({"bold": True, "font_color": dark2, "font_size": 9})

    fmt_meta_value = workbook.add_format({"font_color": dark2, "font_size": 9})

    fmt_section = workbook.add_format({"bold": True, "font_size": 11, "font_color": white, "bg_color": dark, "valign": "vcenter"})

    fmt_header = workbook.add_format({"bold": True, "font_size": 8, "font_color": white, "bg_color": dark2, "border": 1, "border_color": dark2, "align": "center", "valign": "vcenter", "text_wrap": True})



    fmt_text = workbook.add_format({"font_size": 8, "font_color": dark, "border": 1, "border_color": border, "valign": "vcenter"})

    fmt_text_wrap = workbook.add_format({"font_size": 8, "font_color": dark, "border": 1, "border_color": border, "valign": "vcenter", "text_wrap": True})

    fmt_number = workbook.add_format({"font_size": 8, "font_color": dark, "border": 1, "border_color": border, "num_format": "0.00", "align": "right", "valign": "vcenter"})

    fmt_date = workbook.add_format({"font_size": 8, "font_color": dark, "border": 1, "border_color": border, "num_format": "dd-mmm-yy", "align": "center", "valign": "vcenter"})

    fmt_variance = workbook.add_format({"font_size": 8, "font_color": dark, "border": 1, "border_color": border, "num_format": "+0;-0;0", "align": "center", "valign": "vcenter"})



    fmt_var_pos = workbook.add_format({"font_size": 8, "font_color": "#922B21", "bg_color": red_bg, "border": 1, "border_color": border, "num_format": "+0;-0;0", "align": "center", "valign": "vcenter", "bold": True})

    fmt_var_neg = workbook.add_format({"font_size": 8, "font_color": "#117864", "bg_color": green_bg, "border": 1, "border_color": border, "num_format": "+0;-0;0", "align": "center", "valign": "vcenter", "bold": True})



    fmt_wbs = workbook.add_format({"bold": True, "font_size": 8, "font_color": dark, "bg_color": "#EAECEE", "border": 1, "border_color": border, "valign": "vcenter"})



    fmt_timeline_header = workbook.add_format({"bold": True, "font_size": 7, "font_color": dark2, "bg_color": pale, "border": 1, "border_color": border, "rotation": 90 if scale_mode == "day" else 0, "align": "center", "valign": "vcenter"})

    fmt_blank_timeline = workbook.add_format({"bg_color": white, "border": 1, "border_color": "#EDF0F2"})

    fmt_dd_timeline = workbook.add_format({"bg_color": dd_bg, "border": 1, "border_color": "#EDF0F2", "right": 2, "right_color": red})



    fmt_bar_before = workbook.add_format({"bg_color": blue, "border": 1, "border_color": blue})

    fmt_bar_after = workbook.add_format({"bg_color": blue2, "border": 1, "border_color": blue2})

    fmt_bar_fragnet = workbook.add_format({"bg_color": red, "border": 1, "border_color": red})

    fmt_bar_longest = workbook.add_format({"bg_color": goldbar, "border": 1, "border_color": goldbar})

    fmt_bar_critical = workbook.add_format({"bg_color": "#C77C54", "border": 1, "border_color": "#C77C54"})



    fmt_legend = workbook.add_format({"font_size": 8, "font_color": dark2, "valign": "vcenter"})

    fmt_disclaimer = workbook.add_format({"font_size": 10, "bold": True, "font_color": red, "italic": True, "valign": "vcenter"})



    # KPI Metric Card Styles

    fmt_kpi_card_num = workbook.add_format({"bold": True, "font_size": 16, "font_color": dark, "bg_color": pale, "align": "center", "valign": "vcenter", "border": 1, "border_color": border})

    fmt_kpi_card_lbl = workbook.add_format({"bold": True, "font_size": 8, "font_color": dark2, "bg_color": "#E5E8E8", "align": "center", "valign": "vcenter", "border": 1, "border_color": border})



    impact = analysis.get("impact") or {}

    comp_summary = (analysis.get("comparison") or {}).get("summary") or {}

    delay_days = impact.get("calendar_elapsed_days") if impact.get("calendar_elapsed_days") is not None else comp_summary.get("project_finish_shift_calendar_days")



    # ==============================================================================

    # SHEET 01: Executive Summary

    # ==============================================================================

    ws_exec = workbook.add_worksheet("01_Executive_Summary")

    ws_exec.hide_gridlines(2)

    ws_exec.set_column("A:A", 24)

    ws_exec.set_column("B:B", 40)

    ws_exec.set_column("C:C", 20)

    ws_exec.set_column("D:D", 25)

    ws_exec.set_column("E:E", 25)



    ws_exec.write_rich_string(1, 0, fmt_brand, "Contract", fmt_brand_x, "X", fmt_brand, ".co")

    ws_exec.write(2, 0, "Forensic Schedule Analysis - Executive Dashboard", fmt_title)



    # Key Metric Cards

    cards = [

        ("TOTAL PROJECT DELAY", f"{_num(delay_days):+.0f} Days" if delay_days is not None else "N/A"),

        ("EVALUATED WINDOWS", f"{len(windows_data)}" if windows_data else "N/A (AP/AB)"),

        ("ISOLATED FRAGNETS", f"{len(fragnets_data)}" if fragnets_data else "N/A"),

        ("DATA DATE", data_date.strftime("%d-%b-%Y") if data_date else "N/A"),

    ]

    for idx, (label, val) in enumerate(cards):

        col_idx = idx + 1

        ws_exec.write(4, col_idx, val, fmt_kpi_card_num)

        ws_exec.write(5, col_idx, label, fmt_kpi_card_lbl)



    # Metadata Details Table

    summary_data = [

        ("Project Title:", project_title or analysis.get("project_id") or "—"),

        ("Programme Name:", programme_title or "—"),

        ("Forensic Methodology:", method_label),

        ("Analysis Identifier:", analysis.get("analysis_id") or "—"),

        ("Report Export Date:", datetime.now().strftime("%d-%b-%Y %H:%M")),

        ("Baseline Schedule Ref:", comparison.get("before_label") or "As-Planned Baseline"),

        ("Impacted Schedule Ref:", comparison.get("after_label") or "As-Built / Impacted Update"),

    ]



    ws_exec.merge_range(7, 0, 7, 4, "Project & Analysis Parameters", fmt_section)

    for r, (label, val) in enumerate(summary_data, start=8):

        ws_exec.write(r, 0, label, fmt_meta_label)

        ws_exec.write_string(r, 1, str(val), fmt_meta_value)



    # Executive Responsibility Breakdown

    ws_exec.merge_range(16, 0, 16, 4, "Delay Responsibility Summary", fmt_section)

    resp_headers = ["Responsibility Category", "Attributable Days", "% of Total Delay", "Excusable", "Compensable"]

    for c, h in enumerate(resp_headers):

        ws_exec.write(17, c, h, fmt_header)



    resp_rows = [

        ("Employer / Client Delay", analysis.get("employer_delay_days", 0.0), "Yes", "Yes"),

        ("Contractor Delay", analysis.get("contractor_delay_days", 0.0), "No", "No"),

        ("Third Party / Force Majeure", analysis.get("third_party_delay_days", 0.0), "Yes", "No"),

        ("Concurrent Delay", analysis.get("concurrent_delay_days", 0.0), "Yes", "No"),

    ]



    tot_d = _num(delay_days, 1.0) if _num(delay_days) != 0 else 1.0

    for idx, (cat, days, exc, comp) in enumerate(resp_rows, start=18):

        d_val = _num(days)

        pct = (d_val / tot_d) if delay_days else 0.0

        ws_exec.write(idx, 0, cat, fmt_text)

        ws_exec.write_number(idx, 1, d_val, fmt_number)

        ws_exec.write_number(idx, 2, pct, workbook.add_format({"num_format": "0.0%", "border": 1, "border_color": border, "align": "right", "font_size": 8}))

        ws_exec.write(idx, 3, exc, fmt_text)

        ws_exec.write(idx, 4, comp, fmt_text)



    ws_exec.merge_range(24, 0, 24, 4, DISCLAIMER_TEXT, fmt_disclaimer)



    # ==============================================================================

    # METHOD-SPECIFIC DETAIL SHEETS

    # ==============================================================================

    # Only the method actually run gets its specialist detail sheet.

    # Single TIA does NOT receive Window / Multi-Event / AP-vs-AB sheets.

    # The sheet numbering below is deliberately dynamic.

    next_sheet_no = 2



    if is_window_analysis:

        ws_win = workbook.add_worksheet(f"{next_sheet_no:02d}_Window_Analysis")

        next_sheet_no += 1

        ws_win.hide_gridlines(2)

        ws_win.freeze_panes(2, 0)



        win_cols = [

            ("Window ID", 14),

            ("Window Name", 32),

            ("Start Date", 13),

            ("End Date", 13),

            ("Baseline Update Ref", 25),

            ("Pre-Window Finish", 14),

            ("Post-Window Finish", 14),

            ("Window Variance (d)", 15),

            ("Excusable (d)", 13),

            ("Non-Excusable (d)", 15),

            ("Primary Driving Activity", 30),

            ("Responsible Party", 20),

        ]



        for c, (h_name, width) in enumerate(win_cols):

            ws_win.set_column(c, c, width)

            ws_win.write(0, c, h_name, fmt_header)



        if windows_data:

            for idx, w_item in enumerate(windows_data, start=1):

                ws_win.write(idx, 0, w_item.get("window_id") or f"WIN-{idx:02d}", fmt_text)

                ws_win.write(idx, 1, w_item.get("window_name") or f"Analysis Window {idx}", fmt_text_wrap)



                ws_start = _dt(w_item.get("start_date"))

                ws_end = _dt(w_item.get("end_date"))

                if ws_start:

                    ws_win.write_datetime(idx, 2, ws_start, fmt_date)

                else:

                    ws_win.write(idx, 2, "—", fmt_text)



                if ws_end:

                    ws_win.write_datetime(idx, 3, ws_end, fmt_date)

                else:

                    ws_win.write(idx, 3, "—", fmt_text)



                ws_win.write(idx, 4, w_item.get("baseline_ref") or "—", fmt_text)



                p_pre = _dt(w_item.get("pre_finish"))

                p_post = _dt(w_item.get("post_finish"))

                if p_pre:

                    ws_win.write_datetime(idx, 5, p_pre, fmt_date)

                else:

                    ws_win.write(idx, 5, "—", fmt_text)



                if p_post:

                    ws_win.write_datetime(idx, 6, p_post, fmt_date)

                else:

                    ws_win.write(idx, 6, "—", fmt_text)



                var_d = _num(w_item.get("variance_days"))

                ws_win.write_number(

                    idx,

                    7,

                    var_d,

                    fmt_var_pos if var_d > 0 else fmt_var_neg if var_d < 0 else fmt_variance,

                )

                ws_win.write_number(idx, 8, _num(w_item.get("excusable_days")), fmt_number)

                ws_win.write_number(idx, 9, _num(w_item.get("non_excusable_days")), fmt_number)

                ws_win.write(idx, 10, w_item.get("primary_driver") or "—", fmt_text_wrap)

                ws_win.write(idx, 11, w_item.get("responsibility") or "—", fmt_text)

        else:

            ws_win.merge_range(

                1,

                0,

                2,

                11,

                "Window Analysis was selected, but no window dataset was returned for this run.",

                fmt_text_wrap,

            )



    if is_multi_tia:

        ws_tia = workbook.add_worksheet(f"{next_sheet_no:02d}_Multi_Event_TIA")

        next_sheet_no += 1

        ws_tia.hide_gridlines(2)

        ws_tia.freeze_panes(2, 0)



        tia_cols = [

            ("Fragnet ID", 14),

            ("Fragnet / Delay Event Name", 35),

            ("Insertion Date", 13),

            ("Responsible Party", 20),

            ("Classification", 24),

            ("Pre-Impact Finish", 14),

            ("Post-Impact Finish", 14),

            ("Net Delay Impact (d)", 18),

            ("Cumulative Shift (d)", 18),

            ("Critical Path Driver", 30),

        ]



        for c, (h_name, width) in enumerate(tia_cols):

            ws_tia.set_column(c, c, width)

            ws_tia.write(0, c, h_name, fmt_header)



        if fragnets_data:

            cum_shift = 0.0

            for idx, f_item in enumerate(fragnets_data, start=1):

                net_d = _num(f_item.get("net_impact_days") or f_item.get("delay_days"))

                cum_shift += net_d



                ws_tia.write(idx, 0, f_item.get("fragnet_id") or f"FRG-{idx:02d}", fmt_text)

                ws_tia.write(idx, 1, f_item.get("fragnet_name") or f"Delay Event {idx}", fmt_text_wrap)



                ins_dt = _dt(f_item.get("insertion_date"))

                if ins_dt:

                    ws_tia.write_datetime(idx, 2, ins_dt, fmt_date)

                else:

                    ws_tia.write(idx, 2, "—", fmt_text)



                ws_tia.write(idx, 3, f_item.get("responsibility") or "Unassigned", fmt_text)

                ws_tia.write(idx, 4, f_item.get("classification") or "Unassigned", fmt_text)



                f_pre = _dt(f_item.get("pre_impact_finish"))

                f_post = _dt(f_item.get("post_impact_finish"))

                if f_pre:

                    ws_tia.write_datetime(idx, 5, f_pre, fmt_date)

                else:

                    ws_tia.write(idx, 5, "—", fmt_text)



                if f_post:

                    ws_tia.write_datetime(idx, 6, f_post, fmt_date)

                else:

                    ws_tia.write(idx, 6, "—", fmt_text)



                ws_tia.write_number(

                    idx,

                    7,

                    net_d,

                    fmt_var_pos if net_d > 0 else fmt_variance,

                )

                ws_tia.write_number(idx, 8, cum_shift, fmt_number)

                ws_tia.write(idx, 9, f_item.get("affected_activity") or "—", fmt_text_wrap)

        else:

            ws_tia.merge_range(

                1,

                0,

                2,

                9,

                "Multi-Event TIA was selected, but no fragnet dataset was returned for this run.",

                fmt_text_wrap,

            )



    if is_ap_ab:

        ws_var = workbook.add_worksheet(f"{next_sheet_no:02d}_AP_vs_AB_Variance")

        next_sheet_no += 1

        ws_var.hide_gridlines(2)

        ws_var.freeze_panes(1, 0)



        var_cols = [

            ("Activity ID", 14),

            ("Activity Name", 38),

            ("WBS Path", 25),

            ("Planned Start", 12),

            ("Actual Start", 12),

            ("Start Var (d)", 12),

            ("Planned Finish", 12),

            ("Actual Finish", 12),

            ("Finish Var (d)", 12),

            ("Planned Dur (d)", 13),

            ("Actual Dur (d)", 13),

            ("Dur Var (d)", 12),

            ("Planned TF (d)", 12),

            ("Actual TF (d)", 12),

        ]



        for c, (h_name, width) in enumerate(var_cols):

            ws_var.set_column(c, c, width)

            ws_var.write(0, c, h_name, fmt_header)



        v_row = 1

        for a_item in after_rows:

            a_id = a_item.get("activity_id") or a_item.get("activity_id_pk")

            b_item = before_by_key.get(a_id) or {}



            ws_var.write(v_row, 0, a_id or "—", fmt_text)

            ws_var.write(v_row, 1, a_item.get("activity_name") or "—", fmt_text_wrap)

            ws_var.write(v_row, 2, a_item.get("wbs_path") or "—", fmt_text)



            p_str, a_str = _dt(b_item.get("start")), _dt(a_item.get("start"))

            p_fin, a_fin = _dt(b_item.get("finish")), _dt(a_item.get("finish"))



            if p_str:

                ws_var.write_datetime(v_row, 3, p_str, fmt_date)

            else:

                ws_var.write(v_row, 3, "—", fmt_text)



            if a_str:

                ws_var.write_datetime(v_row, 4, a_str, fmt_date)

            else:

                ws_var.write(v_row, 4, "—", fmt_text)



            s_var = _start_variance_days(a_item, before_by_key)

            if s_var is not None:

                ws_var.write_number(

                    v_row,

                    5,

                    s_var,

                    fmt_var_pos if s_var > 0 else fmt_var_neg if s_var < 0 else fmt_variance,

                )

            else:

                ws_var.write(v_row, 5, "—", fmt_text)



            if p_fin:

                ws_var.write_datetime(v_row, 6, p_fin, fmt_date)

            else:

                ws_var.write(v_row, 6, "—", fmt_text)



            if a_fin:

                ws_var.write_datetime(v_row, 7, a_fin, fmt_date)

            else:

                ws_var.write(v_row, 7, "—", fmt_text)



            f_var = _finish_variance_days(a_item, before_by_key)

            if f_var is not None:

                ws_var.write_number(

                    v_row,

                    8,

                    f_var,

                    fmt_var_pos if f_var > 0 else fmt_var_neg if f_var < 0 else fmt_variance,

                )

            else:

                ws_var.write(v_row, 8, "—", fmt_text)



            p_dur = _num(b_item.get("original_duration_days"))

            a_dur = _num(a_item.get("original_duration_days"))

            ws_var.write_number(v_row, 9, p_dur, fmt_number)

            ws_var.write_number(v_row, 10, a_dur, fmt_number)

            ws_var.write_number(v_row, 11, a_dur - p_dur, fmt_variance)

            ws_var.write_number(v_row, 12, _num(b_item.get("total_float_days")), fmt_number)

            ws_var.write_number(v_row, 13, _num(a_item.get("total_float_days")), fmt_number)

            v_row += 1



    # ==============================================================================

    # Modular Gantt Construction Engine

    # ==============================================================================

    def _render_gantt_sheet(
        sheet_name: str,
        title: str,
        b_data: List[Dict],
        a_data: List[Dict],
        group_wbs: bool = True,
        hide_duration_and_float: bool = False,
    ):

        ws = workbook.add_worksheet(sheet_name)

        ws.hide_gridlines(2)

        ws.set_landscape()

        ws.fit_to_pages(1, 0)



        if group_wbs:

            ws.freeze_panes(10, 6)

            ws.set_column("A:A", 24)

            ws.set_column("B:B", 38)

            ws.set_column("C:C", 11)

            ws.set_column("D:E", 13)

            ws.set_column("F:F", 10)

            timeline_start = 6

            if hide_duration_and_float:
                ws.set_column("C:C", 0, None, {"hidden": True})
                ws.set_column("F:F", 0, None, {"hidden": True})

        else:

            # Longest Path: continuous driving sequence.

            # WBS is intentionally removed from this worksheet.

            ws.freeze_panes(10, 6)

            ws.set_column("A:A", 14)   # Activity ID

            ws.set_column("B:B", 38)   # Activity Name

            ws.set_column("C:C", 11)   # Orig. Dur.

            ws.set_column("D:E", 13)   # Start / Finish

            ws.set_column("F:F", 10)   # Total Float

            timeline_start = 6

            if hide_duration_and_float:
                ws.set_column("C:C", 0, None, {"hidden": True})
                ws.set_column("F:F", 0, None, {"hidden": True})



        timeline_end = timeline_start + max(len(periods), 1) - 1

        if periods:

            ws.set_column(timeline_start, timeline_end, 3.6 if scale_mode == "day" else 5.5)



        ws.write_rich_string(0, 0, fmt_brand, "Contract", fmt_brand_x, "X", fmt_brand, ".co")

        ws.merge_range(1, 0, 1, min(timeline_end, 12), title, fmt_title)



        ws.write(3, 0, "Project", fmt_meta_label)

        ws.write(3, 1, project_title or "—", fmt_meta_value)

        ws.write(4, 0, "Programme", fmt_meta_label)

        ws.write(4, 1, programme_title or "—", fmt_meta_value)

        ws.write(3, 3, "Data Date Indicator", fmt_meta_label)

        ws.write(3, 4, data_date.strftime("%d-%b-%Y") if data_date else "—", fmt_meta_value)



        # Swatch Legend

        legend_items = [("Before / Baseline", fmt_bar_before), ("After / As-Built", fmt_bar_after), ("Fragnet / Event", fmt_bar_fragnet), ("Longest Path", fmt_bar_longest), ("Critical Path", fmt_bar_critical)]

        col = 0

        for lbl, swatch in legend_items:

            ws.write_blank(7, col, None, swatch)

            ws.write(7, col + 1, lbl, fmt_legend)

            col += 2



        def _draw_gantt_section(r_cursor: int, sec_title: str, r_data: List[Dict], base_fmt):

            ws.merge_range(r_cursor, 0, r_cursor, timeline_end, sec_title, fmt_section)

            r_cursor += 1



            headers = (
                ["Activity ID", "Activity Name", "", "Start", "Finish", ""]
                if hide_duration_and_float
                else ["Activity ID", "Activity Name", "Orig. Dur.", "Start", "Finish", "Total Float"]
            )

            for c, h in enumerate(headers):

                ws.write(r_cursor, c, h, fmt_header)



            for offset, (_, _, label) in enumerate(periods):

                ws.write(r_cursor, timeline_start + offset, label, fmt_timeline_header)

            r_cursor += 1



            if group_wbs:

                # WBS Hierarchical Outline Grouping

                wbs_map: Dict[str, List[Dict]] = {}

                for r in r_data:

                    w = r.get("wbs_path") or r.get("wbs_code") or "Unassigned WBS"

                    if w not in wbs_map: wbs_map[w] = []

                    wbs_map[w].append(r)



                for w in sorted(wbs_map.keys()):

                    ws.write(r_cursor, 0, w, fmt_wbs)

                    for c in range(1, timeline_end + 1):

                        ws.write_blank(r_cursor, c, None, fmt_wbs)

                    ws.set_row(r_cursor, 18, None, {"level": 0})

                    r_cursor += 1



                    sub_items = sorted(wbs_map[w], key=lambda x: (_dt(x.get("start")) or datetime.max, x.get("activity_id") or ""))

                    for item in sub_items:

                        ws.write(r_cursor, 0, item.get("activity_id") or "—", fmt_text)

                        ws.write(r_cursor, 1, item.get("activity_name") or "—", fmt_text_wrap)

                        duration_days = _display_duration_days(item)
                        if duration_days is None:
                            ws.write(r_cursor, 2, "—", fmt_text)
                        else:
                            ws.write_number(r_cursor, 2, duration_days, fmt_number)

                        s, f = _dt(item.get("start")), _dt(item.get("finish"))

                        ws.write_datetime(r_cursor, 3, s, fmt_date) if s else ws.write(r_cursor, 3, "—", fmt_text)

                        ws.write_datetime(r_cursor, 4, f, fmt_date) if f else ws.write(r_cursor, 4, "—", fmt_text)

                        total_float_days = _display_total_float_days(item)
                        if total_float_days is None:
                            ws.write(r_cursor, 5, "—", fmt_text)
                        else:
                            ws.write_number(r_cursor, 5, total_float_days, fmt_number)



                        for offset, (p_start, p_end, _) in enumerate(periods):

                            is_dd = data_date and p_start <= data_date < p_end

                            bg_fmt = fmt_dd_timeline if is_dd else fmt_blank_timeline

                            if _bar_overlaps(item, p_start, p_end):

                                bg_fmt = fmt_bar_fragnet if item.get("is_fragnet") else fmt_bar_longest if item.get("is_longest_path") else fmt_bar_critical if (item.get("is_critical") or _num(item.get("total_float_days")) <= 0) else base_fmt

                            ws.write_blank(r_cursor, timeline_start + offset, None, bg_fmt)

                        ws.set_row(r_cursor, 16, None, {"level": 1, "hidden": False})

                        r_cursor += 1

            else:

                # Longest Path: single continuous chronological driving sequence.

                # No WBS column, no WBS parent rows and no WBS sorting.

                flat_items = sorted(

                    r_data,

                    key=lambda x: (

                        _dt(x.get("start")) or datetime.max,

                        _dt(x.get("finish")) or datetime.max,

                        str(x.get("activity_id") or x.get("activity_id_pk") or ""),

                    ),

                )

                for item in flat_items:

                    ws.write(r_cursor, 0, item.get("activity_id") or item.get("activity_id_pk") or "—", fmt_text)

                    ws.write(r_cursor, 1, item.get("activity_name") or "—", fmt_text_wrap)

                    duration_days = _display_duration_days(item)
                    if duration_days is None:
                        ws.write(r_cursor, 2, "—", fmt_text)
                    else:
                        ws.write_number(r_cursor, 2, duration_days, fmt_number)

                    s, f = _dt(item.get("start")), _dt(item.get("finish"))

                    ws.write_datetime(r_cursor, 3, s, fmt_date) if s else ws.write(r_cursor, 3, "—", fmt_text)

                    ws.write_datetime(r_cursor, 4, f, fmt_date) if f else ws.write(r_cursor, 4, "—", fmt_text)

                    total_float_days = _display_total_float_days(item)
                    if total_float_days is None:
                        ws.write(r_cursor, 5, "—", fmt_text)
                    else:
                        ws.write_number(r_cursor, 5, total_float_days, fmt_number)



                    for offset, (p_start, p_end, _) in enumerate(periods):

                        is_dd = data_date and p_start <= data_date < p_end

                        bg_fmt = fmt_dd_timeline if is_dd else fmt_blank_timeline

                        if _bar_overlaps(item, p_start, p_end):

                            bg_fmt = fmt_bar_fragnet if item.get("is_fragnet") else fmt_bar_longest if item.get("is_longest_path") else fmt_bar_critical if (item.get("is_critical") or _num(item.get("total_float_days")) <= 0) else base_fmt

                        ws.write_blank(r_cursor, timeline_start + offset, None, bg_fmt)

                    ws.set_row(r_cursor, 18)

                    r_cursor += 1



            return r_cursor



        r_curr = 9

        if b_data: r_curr = _draw_gantt_section(r_curr, before_label, b_data, fmt_bar_before) + 2

        if a_data: r_curr = _draw_gantt_section(r_curr, after_label, a_data, fmt_bar_after)



    # ==============================================================================

    # COMMON VISUAL GANTT SHEETS

    # ==============================================================================

    _render_gantt_sheet(

        f"{next_sheet_no:02d}_Full_Schedule",

        f"{method_label} - Full Schedule",

        before_rows,

        after_rows,

        group_wbs=True,

    )

    next_sheet_no += 1



    b_longest = [r for r in before_rows if r.get("is_longest_path")]

    a_longest = [r for r in after_rows if r.get("is_longest_path")]

    if b_longest or a_longest:

        _render_gantt_sheet(

            f"{next_sheet_no:02d}_Longest_Path",

            "Longest Path Variance Analysis (Continuous Driving Sequence)",

            b_longest,

            a_longest,

            group_wbs=False,

        )

        next_sheet_no += 1



    b_crit = [

        r for r in before_rows

        if r.get("is_critical") or _num(r.get("total_float_days")) <= 0

    ]

    a_crit = [

        r for r in after_rows

        if r.get("is_critical") or _num(r.get("total_float_days")) <= 0

    ]

    if b_crit or a_crit:

        _render_gantt_sheet(

            f"{next_sheet_no:02d}_Critical_Path",

            "Critical Path Variance Analysis",

            b_crit,

            a_crit,

            group_wbs=True,
            hide_duration_and_float=True,

        )

        next_sheet_no += 1



    # Delay Fragnet is a TIA-specific deliverable.

    if is_tia:

        b_frag = [r for r in before_rows if r.get("is_fragnet")]

        a_frag = [r for r in after_rows if r.get("is_fragnet")]

        if b_frag or a_frag:

            _render_gantt_sheet(

                f"{next_sheet_no:02d}_Delay_Fragnet",

                "Delay Fragnet Isolation",

                b_frag,

                a_frag,

                group_wbs=True,

            )

            next_sheet_no += 1



    # ==============================================================================

    # GRANULAR ACTIVITY DETAIL

    # ==============================================================================

    detail = workbook.add_worksheet(f"{next_sheet_no:02d}_Activity_Detail")

    next_sheet_no += 1

    detail.hide_gridlines(2)

    detail.freeze_panes(1, 0)

    detail.set_column("A:A", 22)

    detail.set_column("B:B", 26)

    detail.set_column("C:C", 14)

    detail.set_column("D:D", 38)

    detail.set_column("E:E", 12)

    detail.set_column("F:G", 14)

    detail.set_column("H:I", 12)

    detail.set_column("J:L", 13)



    detail_headers = ["Phase", "WBS Path", "Activity ID", "Activity Name", "Orig. Dur. (d)", "Start", "Finish", "Total Float (d)", "Finish Variance", "Longest Path", "Critical", "Delay Fragnet"]

    for c, h in enumerate(detail_headers):

        detail.write(0, c, h, fmt_header)



    rr = 1

    for phase_key, phase_label, rows in [("before", before_label, before_rows), ("after", after_label, after_rows)]:

        ordered_rows = sorted(rows, key=lambda r: (str(r.get("wbs_path") or "Z_UNASSIGNED"), _dt(r.get("start")) or datetime.max, str(r.get("activity_id") or "")))

        for item in ordered_rows:

            is_fragnet = item.get("is_fragnet")

            detail.write(rr, 0, phase_label, fmt_text)

            detail.write(rr, 1, item.get("wbs_path") or "—", fmt_text)

            detail.write(rr, 2, item.get("activity_id") or "—", fmt_text)

            detail.write(rr, 3, item.get("activity_name") or "—", fmt_text_wrap)

            detail_duration_days = _display_duration_days(item)
            if detail_duration_days is None:
                detail.write(rr, 4, "—", fmt_text)
            else:
                detail.write_number(rr, 4, detail_duration_days, fmt_number)

            start, finish = _dt(item.get("start")), _dt(item.get("finish"))



            if start: detail.write_datetime(rr, 5, start, fmt_date)

            else: detail.write(rr, 5, "—", fmt_text)



            if finish: detail.write_datetime(rr, 6, finish, fmt_date)

            else: detail.write(rr, 6, "—", fmt_text)



            detail_float_days = _display_total_float_days(item)
            if detail_float_days is None:
                detail.write(rr, 7, "—", fmt_text)
            else:
                detail.write_number(rr, 7, detail_float_days, fmt_number)



            variance = _finish_variance_days(item, before_by_key) if phase_key == "after" else None

            if variance is None: detail.write(rr, 8, "—", fmt_text)

            else: detail.write_number(rr, 8, variance, fmt_variance)



            detail.write(rr, 9, "Yes" if item.get("is_longest_path") else "No", fmt_text)

            detail.write(rr, 10, "Yes" if item.get("is_critical") or _num(item.get("total_float_days")) <= 0 else "No", fmt_text)

            detail.write(rr, 11, "Yes" if is_fragnet else "No", fmt_text)

            rr += 1



    # ==============================================================================

    # SHEET 10: Methodology & Audit Trail

    # ==============================================================================

    methodology = workbook.add_worksheet(f"{next_sheet_no:02d}_Methodology")

    methodology.hide_gridlines(2)

    methodology.set_column("A:A", 30)

    methodology.set_column("B:B", 100)

    methodology.write(0, 0, "Audit Parameter", fmt_header)

    methodology.write(0, 1, "Specification & Protocol Rule", fmt_header)



    method_rows = [

        ("Exporter Version", EXPORTER_BUILD),

        (

            "Workbook Composition",

            "Method-specific: Window sheet only for Window Analysis; Multi-Event TIA sheet only for Multi-Event TIA; "

            "AP vs AB variance sheet only for AP vs AB; Delay Fragnet sheet only for TIA methods."

        ),

        ("Forensic Methodology", method_label),

        ("Programme Identifier", programme_title),

        ("Project Identifier", project_title or analysis.get("project_id") or "—"),

        ("Analysis Identifier", analysis.get("analysis_id") or "—"),

        ("Timeline Grid Resolution", scale_mode),

        (

            "WBS Hierarchy Protocol",

            "WBS headers are rendered as parent outline rows. Child activities sit under parent rows "

            "and utilize Excel outline level controls (+/-) for collapsible grouping.",

        ),

        (

            "Longest Path Protocol",

            "06_Longest_Path removes WBS completely (no WBS column, no WBS header rows and no WBS sorting) and presents a single continuous sequence ordered Start -> Finish -> Activity ID.",

        ),

        (

            "Data Date Protocol",

            "The Data Date column is automatically identified and highlighted with a red outline marker across all Gantt chart grids.",

        ),

        (

            "Finish Variance Metric",

            "After Finish date minus matching Before Finish date in calendar days.",

        ),

        (

            "Critical Path Metric",

            "Activity is marked Critical if CPM calculation sets is_critical=True or Total Float <= 0 days.",

        ),

        (

            "TIA Fragnet Presentation",

            "Synthetic TIA fragnet duration is displayed using the entered calendar-day basis (internal 24H duration divided by 24). "
            "Synthetic-fragnet Total Float is not displayed because it is not directly comparable to source-activity working-calendar day values.",

        ),

        (

            "Calculation Authority",

            "ContractX Engine 2 deterministic schedule calculation. CPM network math is performed in Python; Excel acts as the visual forensic deliverable.",

        ),

        ("AI Validation Disclaimer", DISCLAIMER_TEXT),

    ]



    for row_no, (field, value) in enumerate(method_rows, start=1):

        methodology.write(row_no, 0, field, fmt_text)

        methodology.write(row_no, 1, str(value), fmt_text_wrap)



    workbook.close()

    buffer.seek(0)

    return buffer
