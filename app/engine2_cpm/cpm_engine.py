from __future__ import annotations



from dataclasses import dataclass

from datetime import datetime, timedelta

import copy
import hashlib

import json

from typing import Any, Dict, List, Optional, Tuple



import networkx as nx

import pandas as pd



from .calendar_engine import CalendarRegistry, WorkCalendar

from .scheduling_options import (

    CriticalMode,

    FloatMode,

    LagCalendarMode,

    MultipleFloatPathMode,

    ProgressMode,

    SchedulingOptions,

)





class CPMValidationError(ValueError):

    pass





@dataclass

class ActivityState:

    duration_hours: float

    early_start: Optional[datetime] = None

    early_finish: Optional[datetime] = None

    late_start: Optional[datetime] = None

    late_finish: Optional[datetime] = None

    total_float_hours: float = 0.0

    free_float_hours: float = 0.0

    is_longest_path: bool = False

    float_path: Optional[int] = None

    float_path_order: Optional[int] = None





class CPMEngine:

    """

    ContractX Engine 2 v5: forensic P6-fidelity deterministic scheduler.



    Supported:

      * Multiple calendars / holidays / exceptions via CalendarRegistry

      * Calendarized forward/backward pass

      * FS / SS / FF / SF relationships and lag

      * Lag-calendar options

      * Primary/secondary constraints

      * Expected Finish

      * Retained Logic / Progress Override / Actual Dates modes

      * Longest-path tracing

      * Total-float or longest-path criticality

      * Multiple float paths

      * Resource-leveling heuristic

      * Deterministic TIA via network recalculation



    It intentionally remains auditable Python rather than using an LLM.

    """



    REL_MAP = {

        "FS": "FS", "PR_FS": "FS",

        "SS": "SS", "PR_SS": "SS",

        "FF": "FF", "PR_FF": "FF",

        "SF": "SF", "PR_SF": "SF",

    }



    # Primavera P6 raw constraint codes plus normalized/backward-compatible aliases.
    # Raw tokens are retained because forensic traceability requires us to preserve
    # what was actually present in the XER.
    START_NO_EARLIER = {
        "CS_SNET",
        "CS_MSO",
        "MSO",
        "START_ON_OR_AFTER",
        "START_NO_EARLIER_THAN",
    }
    START_NO_LATER = {
        "CS_SNLT",
        "CS_MEO",
        "MEO",
        "START_ON_OR_BEFORE",
        "START_NO_LATER_THAN",
    }
    FINISH_NO_EARLIER = {
        "CS_FNET",
        "CF_MSO",
        "FINISH_ON_OR_AFTER",
        "FINISH_NO_EARLIER_THAN",
    }
    FINISH_NO_LATER = {
        "CS_FNLT",
        "CF_MEO",
        "FINISH_ON_OR_BEFORE",
        "FINISH_NO_LATER_THAN",
    }
    MUST_START = {
        "CS_MSTO",
        "CS_MAN",
        "MANDATORY_START",
        "MUST_START_ON",
    }
    MUST_FINISH = {
        "CS_MFIN",
        "CF_MAN",
        "MANDATORY_FINISH",
        "MUST_FINISH_ON",
    }
    AS_LATE_AS_POSSIBLE = {
        "CS_ALAP",
        "ALAP",
        "AS_LATE_AS_POSSIBLE",
    }

    # Primavera / normalized activity type semantics.
    START_MILESTONE_TYPES = {
        "TT_MILE",
        "START_MILESTONE",
        "START MILESTONE",
        "MILESTONE_START",
    }
    FINISH_MILESTONE_TYPES = {
        "TT_FINMILE",
        "FINISH_MILESTONE",
        "FINISH MILESTONE",
        "MILESTONE_FINISH",
    }



    def __init__(

        self,

        activities_df: pd.DataFrame,

        relationships_df: pd.DataFrame,

        *,

        calendars: Optional[CalendarRegistry] = None,

        options: Optional[SchedulingOptions] = None,

        data_date: Optional[datetime] = None,

        project_start: Optional[datetime] = None,

        project_finish_constraint: Optional[datetime] = None,

        resources_df: Optional[pd.DataFrame] = None,

        assignments_df: Optional[pd.DataFrame] = None,

    ):

        self.activities_df = activities_df.copy()

        self.relationships_df = relationships_df.copy()

        self.calendars = calendars or CalendarRegistry()

        self.options = options or SchedulingOptions()

        self.data_date = pd.Timestamp(data_date).to_pydatetime() if data_date is not None else None

        self.project_start = (

            pd.Timestamp(project_start).to_pydatetime()

            if project_start is not None

            else self._derive_project_start()

        )

        self.project_finish_constraint = (

            pd.Timestamp(project_finish_constraint).to_pydatetime()

            if project_finish_constraint is not None

            else None

        )

        self.resources_df = resources_df.copy() if resources_df is not None else pd.DataFrame()

        self.assignments_df = assignments_df.copy() if assignments_df is not None else pd.DataFrame()



        # Primavera can legitimately contain more than one relationship
        # between the same predecessor/successor activity pair (for example SS
        # and FF with different lags).  A DiGraph silently overwrites one of
        # those links.  MultiDiGraph preserves every source TASKPRED row.
        self.graph = nx.MultiDiGraph()

        self.states: Dict[str, ActivityState] = {}

        self.project_finish: Optional[datetime] = None
        self.project_finish_node: Optional[str] = None

        # Forensic/audit state. These do not change the CPM calculation itself.
        self.ignored_relationships: List[Dict[str, Any]] = []
        self._multiple_float_paths: List[Dict[str, Any]] = []



        self._build_graph()

        self.validate_network()



    @staticmethod

    def _float(value: Any, default: float = 0.0) -> float:

        try:

            if value is None or pd.isna(value) or str(value).strip() == "":

                return default

            return float(value)

        except Exception:

            return default



    @staticmethod

    def _dt(value: Any) -> Optional[datetime]:

        if value is None or pd.isna(value) or str(value).strip() == "":

            return None

        parsed = pd.to_datetime(value, errors="coerce")

        return None if pd.isna(parsed) else pd.Timestamp(parsed).to_pydatetime()



    def _derive_project_start(self) -> datetime:

        candidates = []

        for col in ("planned_start", "early_start", "actual_start"):

            if col in self.activities_df:

                values = pd.to_datetime(self.activities_df[col], errors="coerce").dropna()

                if not values.empty:

                    candidates.append(values.min().to_pydatetime())

        return min(candidates) if candidates else datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)



    def _calendar_for(self, node: str) -> WorkCalendar:

        return self.calendars.get(self.graph.nodes[node].get("calendar_id"))



    @classmethod
    def _normalized_activity_type(cls, value: Any) -> str:
        return str(value or "").strip().upper()

    @classmethod
    def _is_start_milestone_type(cls, value: Any) -> bool:
        return cls._normalized_activity_type(value) in cls.START_MILESTONE_TYPES

    @classmethod
    def _is_finish_milestone_type(cls, value: Any) -> bool:
        return cls._normalized_activity_type(value) in cls.FINISH_MILESTONE_TYPES

    def _is_start_milestone(self, node: str) -> bool:
        return self._is_start_milestone_type(
            self.graph.nodes[node].get("activity_type")
        )

    def _is_finish_milestone(self, node: str) -> bool:
        return self._is_finish_milestone_type(
            self.graph.nodes[node].get("activity_type")
        )

    def _milestone_seed_date(self, node: str) -> Optional[datetime]:
        """
        Safe fallback only for an OPEN milestone.

        A milestone with valid predecessors remains relationship-driven.
        This fallback prevents an unlinked P6 milestone from being parked at
        project start merely because its duration is zero.
        """
        data = self.graph.nodes[node]

        if self._is_start_milestone(node):
            return (
                data.get("planned_start")
                or data.get("remaining_start")
                or data.get("actual_start")
            )

        if self._is_finish_milestone(node):
            return (
                data.get("planned_finish")
                or data.get("remaining_finish")
                or data.get("expected_finish")
                or data.get("actual_finish")
            )

        return None

    def _forward_seed_bound(self, node: str) -> datetime:
        cal = self._calendar_for(node)

        # Normal activities start from the project start floor.
        if self.graph.in_degree(node) > 0:
            return cal.next_work_time(self.project_start)

        # Open milestones should retain their own programme date when present.
        milestone_seed = self._milestone_seed_date(node)
        if milestone_seed is not None:
            return cal.next_work_time(milestone_seed)

        return cal.next_work_time(self.project_start)

    def _select_project_finish_node(self) -> Optional[str]:
        """
        Prefer a terminal Finish Milestone as the contractual/project endpoint.
        Fall back to terminal activities, then to the latest calculated activity.
        """
        if not self.states:
            return None

        terminal_finish_milestones = [
            n
            for n in self.states
            if self.graph.out_degree(n) == 0
            and self._is_finish_milestone(n)
            and self.states[n].early_finish is not None
        ]
        if terminal_finish_milestones:
            return max(
                terminal_finish_milestones,
                key=lambda n: self.states[n].early_finish,
            )

        terminal_nodes = [
            n
            for n in self.states
            if self.graph.out_degree(n) == 0
            and self.states[n].early_finish is not None
        ]
        if terminal_nodes:
            return max(
                terminal_nodes,
                key=lambda n: self.states[n].early_finish,
            )

        return max(
            self.states,
            key=lambda n: self.states[n].early_finish or datetime.min,
        )

    def _duration(self, row: pd.Series) -> float:

        status = str(row.get("status", "")).upper()
        activity_type = row.get("activity_type")

        # P6 Start/Finish Milestones are always zero-duration network nodes.
        if (
            self._is_start_milestone_type(activity_type)
            or self._is_finish_milestone_type(activity_type)
        ):
            return 0.0

        rem = self._float(row.get("remaining_duration_hrs"), -1)

        planned = self._float(row.get("planned_duration_hrs"), 0)



        if status in {"TK_COMPLETE", "COMPLETE"}:

            return 0.0



        if rem >= 0 and status not in {"TK_NOTSTART", "NOT_STARTED"}:

            return rem

        return planned



    def _build_graph(self):

        if self.activities_df.empty:

            raise CPMValidationError("No activities supplied.")



        for _, row in self.activities_df.iterrows():

            pk = str(row.get("activity_id_pk", "")).strip()

            if not pk:

                continue



            self.graph.add_node(

                pk,

                activity_id=str(row.get("activity_id", pk)),

                activity_name=str(row.get("activity_name", "")),

                duration_hours=self._duration(row),

                calendar_id=str(row.get("calendar_id", "")),

                activity_type=str(row.get("activity_type", "")),
                activity_type_raw=str(
                    row.get("activity_type_raw", row.get("activity_type", "")) or ""
                ),
                activity_type_normalized=str(
                    row.get("activity_type_normalized", "") or ""
                ),
                wbs_id=str(row.get("wbs_id", "") or ""),
                parent_wbs_id=str(row.get("parent_wbs_id", "") or ""),
                wbs_code=str(row.get("wbs_code", "") or ""),
                wbs_name=str(row.get("wbs_name", "") or ""),
                wbs_path=str(row.get("wbs_path", "") or ""),
                wbs_sequence_number=self._float(
                    row.get("wbs_sequence_number"), float("nan")
                ),
                wbs_source_row_sequence=self._float(
                    row.get("wbs_source_row_sequence"), float("nan")
                ),
                activity_sequence=self._float(
                    row.get("activity_sequence"), float("nan")
                ),
                source_row_sequence=self._float(
                    row.get("source_row_sequence"), float("nan")
                ),

                status=str(row.get("status", "")),

                planned_start=self._dt(row.get("planned_start")),

                planned_finish=self._dt(row.get("planned_finish")),

                actual_start=self._dt(row.get("actual_start")),

                actual_finish=self._dt(row.get("actual_finish")),

                remaining_start=self._dt(row.get("remaining_start")),

                remaining_finish=self._dt(row.get("remaining_finish")),

                expected_finish=self._dt(row.get("expected_finish")),

                primary_constraint_type=str(row.get("primary_constraint_type", "") or "").upper(),
                primary_constraint_type_raw=str(
                    row.get(
                        "primary_constraint_type_raw",
                        row.get("primary_constraint_type", ""),
                    ) or ""
                ),
                primary_constraint_date=self._dt(row.get("primary_constraint_date")),

                secondary_constraint_type=str(row.get("secondary_constraint_type", "") or "").upper(),
                secondary_constraint_type_raw=str(
                    row.get(
                        "secondary_constraint_type_raw",
                        row.get("secondary_constraint_type", ""),
                    ) or ""
                ),
                secondary_constraint_date=self._dt(row.get("secondary_constraint_date")),

            )



        for _, row in self.relationships_df.iterrows():

            pred = str(row.get("predecessor_activity_pk", "")).strip()

            succ = str(row.get("successor_activity_pk", "")).strip()

            if pred not in self.graph or succ not in self.graph:

                if self.options.ignore_external_relationships:
                    self.ignored_relationships.append(
                        {
                            "predecessor_activity_pk": pred,
                            "successor_activity_pk": succ,
                            "relationship_type": str(
                                row.get("relationship_type", "FS")
                            ).upper(),
                            "lag_hours": self._float(row.get("lag_hrs"), 0.0),
                            "reason": "external_or_orphan_relationship",
                        }
                    )
                    continue

                raise CPMValidationError(f"External/orphan relationship: {pred} -> {succ}")



            rel = self.REL_MAP.get(str(row.get("relationship_type", "FS")).upper(), "FS")

            edge_key = str(row.get("pred_link_id", "") or "").strip() or None
            edge_kwargs = {
                "rel_type": rel,
                "lag_hours": self._float(row.get("lag_hrs"), 0.0),
                "pred_link_id": str(row.get("pred_link_id", "") or ""),
                "source_row_sequence": self._float(
                    row.get("source_row_sequence"), float("nan")
                ),
            }

            if edge_key is not None:
                # Use the P6 relationship primary key where available so
                # duplicate predecessor/successor relationship pairs remain
                # individually addressable and auditable.
                self.graph.add_edge(pred, succ, key=edge_key, **edge_kwargs)
            else:
                self.graph.add_edge(pred, succ, **edge_kwargs)



    def validate_network(self) -> Dict[str, Any]:

        cycles = list(nx.simple_cycles(self.graph))

        if cycles:

            raise CPMValidationError(f"Network contains logic cycles: {cycles[:5]}")



        source_activity_count = int(len(self.activities_df))
        source_relationship_count = int(len(self.relationships_df))

        return {
            "activity_count": self.graph.number_of_nodes(),
            "relationship_count": self.graph.number_of_edges(),
            "source_activity_count": source_activity_count,
            "source_relationship_count": source_relationship_count,
            "activity_count_match": (
                self.graph.number_of_nodes() == source_activity_count
            ),
            "relationship_count_match": (
                self.graph.number_of_edges()
                + len(self.ignored_relationships)
                == source_relationship_count
            ),
            "ignored_relationship_count": len(self.ignored_relationships),
            "open_starts": [
                n for n in self.graph if self.graph.in_degree(n) == 0
            ],
            "open_finishes": [
                n for n in self.graph if self.graph.out_degree(n) == 0
            ],
        }



    def _lag_calendar(self, pred: str, succ: str) -> WorkCalendar:

        mode = self.options.lag_calendar_mode

        if mode == LagCalendarMode.SUCCESSOR:

            return self._calendar_for(succ)

        if mode == LagCalendarMode.PROJECT_DEFAULT:

            return self.calendars.get(None)

        if mode == LagCalendarMode.HOURS_24:

            return self.calendars.get("24H")

        return self._calendar_for(pred)



    def _apply_lag(self, base: datetime, hours: float, pred: str, succ: str) -> datetime:

        cal = self._lag_calendar(pred, succ)

        return cal.add_work_hours(base, hours) if hours >= 0 else cal.subtract_work_hours(base, -hours)



    def _edge_records(self, pred: str, succ: str) -> List[Dict[str, Any]]:
        """Return every relationship between a predecessor/successor pair."""
        data = self.graph.get_edge_data(pred, succ, default={})
        if not data:
            return []

        # MultiDiGraph: {edge_key: {attributes...}}
        if isinstance(self.graph, nx.MultiDiGraph):
            return [dict(attrs) for attrs in data.values()]

        # Backward compatibility if a graph is injected/replaced in tests.
        return [dict(data)]

    def _relationship_start_bound_for_edge(
        self,
        pred: str,
        succ: str,
        edge: Dict[str, Any],
    ) -> datetime:
        p = self.states[pred]
        succ_cal = self._calendar_for(succ)

        rel = str(edge.get("rel_type", "FS") or "FS").upper()
        lag = self._float(edge.get("lag_hours"), 0.0)

        if rel == "FS":
            return self._apply_lag(p.early_finish, lag, pred, succ)
        if rel == "SS":
            return self._apply_lag(p.early_start, lag, pred, succ)
        if rel == "FF":
            bound_finish = self._apply_lag(p.early_finish, lag, pred, succ)
            return succ_cal.subtract_work_hours(
                bound_finish,
                self.states[succ].duration_hours,
            )

        # SF
        bound_finish = self._apply_lag(p.early_start, lag, pred, succ)
        return succ_cal.subtract_work_hours(
            bound_finish,
            self.states[succ].duration_hours,
        )

    def _relationship_start_bound(self, pred: str, succ: str) -> datetime:
        """
        Tightest successor-start bound across every P6 relationship between
        this predecessor/successor pair.

        With multiple relationships, the successor must satisfy all of them,
        therefore the maximum start bound is controlling.
        """
        edges = self._edge_records(pred, succ)
        if not edges:
            raise CPMValidationError(
                f"Relationship not found in graph: {pred} -> {succ}"
            )
        return max(
            self._relationship_start_bound_for_edge(pred, succ, edge)
            for edge in edges
        )


    def _constraint_semantic(self, ctype: Any) -> str:
        token = str(ctype or "").strip().upper()
        if token in self.START_NO_EARLIER:
            return "START_NO_EARLIER"
        if token in self.START_NO_LATER:
            return "START_NO_LATER"
        if token in self.FINISH_NO_EARLIER:
            return "FINISH_NO_EARLIER"
        if token in self.FINISH_NO_LATER:
            return "FINISH_NO_LATER"
        if token in self.MUST_START:
            return "MUST_START"
        if token in self.MUST_FINISH:
            return "MUST_FINISH"
        if token in self.AS_LATE_AS_POSSIBLE:
            return "AS_LATE_AS_POSSIBLE"
        return "UNMAPPED" if token else "NONE"

    def _constraint_diagnostics_for(self, node: str) -> List[Dict[str, Any]]:
        data = self.graph.nodes[node]
        out: List[Dict[str, Any]] = []
        for position, type_field, date_field, raw_field in (
            (
                "primary",
                "primary_constraint_type",
                "primary_constraint_date",
                "primary_constraint_type_raw",
            ),
            (
                "secondary",
                "secondary_constraint_type",
                "secondary_constraint_date",
                "secondary_constraint_type_raw",
            ),
        ):
            ctype = data.get(type_field)
            cdate = data.get(date_field)
            if not ctype and not cdate:
                continue
            out.append(
                {
                    "position": position,
                    "raw_type": data.get(raw_field) or ctype,
                    "normalized_type": ctype,
                    "semantic": self._constraint_semantic(ctype),
                    "date": cdate.isoformat() if cdate else None,
                }
            )
        return out

    def _apply_forward_constraints(self, node: str, start: datetime, finish: datetime) -> Tuple[datetime, datetime]:

        data = self.graph.nodes[node]

        cal = self._calendar_for(node)

        duration = self.states[node].duration_hours



        constraints = [

            (data.get("primary_constraint_type"), data.get("primary_constraint_date")),

            (data.get("secondary_constraint_type"), data.get("secondary_constraint_date")),

        ]



        for ctype, cdate in constraints:

            if not ctype or not cdate:

                continue

            if ctype in self.START_NO_EARLIER:

                start = max(start, cal.next_work_time(cdate))

                finish = cal.add_work_hours(start, duration)

            elif ctype in self.FINISH_NO_EARLIER:

                if finish < cdate:

                    finish = cal.next_work_time(cdate)

                    start = cal.subtract_work_hours(finish, duration)

            elif ctype in self.MUST_START:

                start = cal.next_work_time(cdate)

                finish = cal.add_work_hours(start, duration)

            elif ctype in self.MUST_FINISH:

                finish = cal.previous_work_time(cdate)

                start = cal.subtract_work_hours(finish, duration)



        if self.options.use_expected_finish_dates and data.get("expected_finish"):

            expected = data["expected_finish"]

            if expected > finish:

                finish = cal.next_work_time(expected)

                start = cal.subtract_work_hours(finish, duration)



        return start, finish



    def _progress_adjustment(self, node: str, start: datetime, finish: datetime) -> Tuple[datetime, datetime]:

        data = self.graph.nodes[node]

        cal = self._calendar_for(node)

        actual_start = data.get("actual_start")

        actual_finish = data.get("actual_finish")

        status = data.get("status", "").upper()

        duration = self.states[node].duration_hours



        if actual_finish:

            return actual_finish, actual_finish



        if self.options.progress_mode == ProgressMode.ACTUAL_DATES and actual_start:

            start = actual_start

            finish = cal.add_work_hours(max(start, self.data_date or start), duration)

            return start, finish



        if actual_start:

            if self.options.progress_mode == ProgressMode.PROGRESS_OVERRIDE:

                anchor = max(self.data_date or actual_start, actual_start)

                return actual_start, cal.add_work_hours(anchor, duration)



            # Retained Logic: actual start is honored, remaining work cannot begin

            # before both data date and predecessor-driven remaining start.

            anchor = max(start, self.data_date or start)

            return actual_start, cal.add_work_hours(anchor, duration)



        if self.data_date and status not in {"TK_COMPLETE", "COMPLETE"}:

            start = max(start, cal.next_work_time(self.data_date))

            finish = cal.add_work_hours(start, duration)



        return start, finish



    def schedule(self) -> Dict[str, Any]:

        topo = list(nx.topological_sort(self.graph))

        self.states = {

            n: ActivityState(duration_hours=self._float(self.graph.nodes[n]["duration_hours"]))

            for n in topo

        }



        # Forward pass

        for node in topo:

            cal = self._calendar_for(node)

            bounds = [self._forward_seed_bound(node)]



            for pred in self.graph.predecessors(node):

                bounds.append(self._relationship_start_bound(pred, node))



            start = max(bounds)

            finish = cal.add_work_hours(start, self.states[node].duration_hours)

            start, finish = self._apply_forward_constraints(node, start, finish)

            start, finish = self._progress_adjustment(node, start, finish)



            self.states[node].early_start = start

            self.states[node].early_finish = finish



        self.project_finish_node = self._select_project_finish_node()
        self.project_finish = (
            self.states[self.project_finish_node].early_finish
            if self.project_finish_node is not None
            else None
        )

        if self.project_finish is None:
            self.project_finish = max(
                s.early_finish
                for s in self.states.values()
                if s.early_finish is not None
            )

        late_anchor = self.project_finish_constraint or self.project_finish



        # Backward pass

        for node in reversed(topo):

            state = self.states[node]

            cal = self._calendar_for(node)



            if self.graph.out_degree(node) == 0:

                lf = late_anchor

            else:

                candidates = []

                for succ in self.graph.successors(node):

                    s = self.states[succ]
                    lag_cal = self._lag_calendar(node, succ)

                    # Every parallel P6 relationship constrains the predecessor
                    # backward pass independently.  The minimum permissible
                    # late finish across all outgoing links controls.
                    for edge in self._edge_records(node, succ):
                        rel = str(edge.get("rel_type", "FS") or "FS").upper()
                        lag = self._float(edge.get("lag_hours"), 0.0)

                        if rel == "FS":
                            candidates.append(
                                lag_cal.subtract_work_hours(s.late_start, lag)
                            )
                        elif rel == "SS":
                            pred_ls = lag_cal.subtract_work_hours(
                                s.late_start, lag
                            )
                            candidates.append(
                                cal.add_work_hours(
                                    pred_ls,
                                    state.duration_hours,
                                )
                            )
                        elif rel == "FF":
                            candidates.append(
                                lag_cal.subtract_work_hours(s.late_finish, lag)
                            )
                        else:  # SF
                            pred_ls = lag_cal.subtract_work_hours(
                                s.late_finish, lag
                            )
                            candidates.append(
                                cal.add_work_hours(
                                    pred_ls,
                                    state.duration_hours,
                                )
                            )



                lf = min(candidates)



            # Backward-side no-later-than constraints

            data = self.graph.nodes[node]

            for ctype, cdate in (

                (data.get("primary_constraint_type"), data.get("primary_constraint_date")),

                (data.get("secondary_constraint_type"), data.get("secondary_constraint_date")),

            ):

                if not ctype or not cdate:

                    continue

                if ctype in self.FINISH_NO_LATER or ctype in self.MUST_FINISH:

                    lf = min(lf, cdate)



            state.late_finish = cal.previous_work_time(lf)

            state.late_start = cal.subtract_work_hours(state.late_finish, state.duration_hours)



            for ctype, cdate in (

                (data.get("primary_constraint_type"), data.get("primary_constraint_date")),

                (data.get("secondary_constraint_type"), data.get("secondary_constraint_date")),

            ):

                if not ctype or not cdate:

                    continue

                if ctype in self.START_NO_LATER or ctype in self.MUST_START:

                    state.late_start = min(state.late_start, cdate)

                    state.late_finish = cal.add_work_hours(state.late_start, state.duration_hours)



        self._calculate_float()

        self._mark_longest_path()



        if self.options.calculate_multiple_float_paths:

            self._calculate_multiple_float_paths()



        if self.options.level_resources and not self.assignments_df.empty:

            self._resource_level_forward()

            if not self.options.preserve_scheduled_early_late_dates:

                # Re-run after leveling anchor changes.

                return self.schedule_without_level_recursion()



        return self.summary()



    def schedule_without_level_recursion(self):

        old = self.options.level_resources

        self.options.level_resources = False

        try:

            return self.schedule()

        finally:

            self.options.level_resources = old



    def _calculate_float(self):

        for node, state in self.states.items():

            cal = self._calendar_for(node)

            start_float = cal.work_hours_between(state.early_start, state.late_start)

            finish_float = cal.work_hours_between(state.early_finish, state.late_finish)



            if self.options.float_mode == FloatMode.START_FLOAT:

                state.total_float_hours = start_float

            elif self.options.float_mode == FloatMode.SMALLEST:

                state.total_float_hours = min(start_float, finish_float)

            else:

                state.total_float_hours = finish_float



            ff_candidates = []

            for succ in self.graph.successors(node):

                s = self.states[succ]

                for edge in self._edge_records(node, succ):
                    rel = str(edge.get("rel_type", "FS") or "FS").upper()
                    lag = self._float(edge.get("lag_hours"), 0.0)

                    if rel == "FS":
                        base = self._apply_lag(
                            state.early_finish, lag, node, succ
                        )
                        ff = cal.work_hours_between(base, s.early_start)
                    elif rel == "SS":
                        base = self._apply_lag(
                            state.early_start, lag, node, succ
                        )
                        ff = cal.work_hours_between(base, s.early_start)
                    elif rel == "FF":
                        base = self._apply_lag(
                            state.early_finish, lag, node, succ
                        )
                        ff = cal.work_hours_between(base, s.early_finish)
                    else:
                        base = self._apply_lag(
                            state.early_start, lag, node, succ
                        )
                        ff = cal.work_hours_between(base, s.early_finish)

                    ff_candidates.append(ff)



            state.free_float_hours = min(ff_candidates) if ff_candidates else state.total_float_hours



    def _is_driving(self, pred: str, succ: str) -> bool:

        bound = self._relationship_start_bound(pred, succ)

        return abs((bound - self.states[succ].early_start).total_seconds()) < 1.0



    def _mark_longest_path(self):

        for s in self.states.values():

            s.is_longest_path = False



        terminal = (
            self.project_finish_node
            if self.project_finish_node in self.states
            else max(
                self.states,
                key=lambda n: self.states[n].early_finish or datetime.min,
            )
        )



        stack = [terminal]

        visited = set()



        while stack:

            node = stack.pop()

            if node in visited:

                continue

            visited.add(node)

            self.states[node].is_longest_path = True



            for pred in self.graph.predecessors(node):

                if self._is_driving(pred, node):

                    stack.append(pred)



    def extract_longest_path(self) -> List[Dict[str, Any]]:

        self._ensure_scheduled()

        nodes = [n for n, s in self.states.items() if s.is_longest_path]

        nodes.sort(key=lambda n: self.states[n].early_start)

        return [self._activity_result(n) for n in nodes]



    def _relationship_gap_hours(self, pred: str, succ: str) -> float:
        """
        Working-time gap between the predecessor-driven relationship bound and
        the successor's calculated early start.

        A value close to zero means the relationship is driving. Positive values
        indicate available relationship gap. Negative values indicate an
        over-constrained/inconsistent condition and are retained for diagnostics.
        """
        self._ensure_scheduled()
        bound = self._relationship_start_bound(pred, succ)
        succ_start = self.states[succ].early_start
        if succ_start is None:
            return 0.0
        cal = self._calendar_for(succ)
        return cal.work_hours_between(bound, succ_start)

    def _path_metric(self, path: List[str]) -> Tuple[float, float, float, int]:
        """
        Deterministic forensic path ranking.

        Lower is better:
          1. sum of positive relationship gaps
          2. sum of positive free float
          3. sum of absolute total float
          4. longer paths preferred as a final tie-breaker
        """
        if not path:
            return (float("inf"), float("inf"), float("inf"), 0)

        gap_score = 0.0
        for pred, succ in zip(path, path[1:]):
            if self.graph.has_edge(pred, succ):
                gap_score += max(0.0, self._relationship_gap_hours(pred, succ))

        free_float_score = sum(
            max(0.0, self.states[n].free_float_hours)
            for n in path
            if n in self.states
        )
        total_float_score = sum(
            abs(self.states[n].total_float_hours)
            for n in path
            if n in self.states
        )

        if (
            self.options.multiple_float_path_mode
            == MultipleFloatPathMode.TOTAL_FLOAT
        ):
            selected_float_score = total_float_score
            secondary_float_score = free_float_score
        else:
            selected_float_score = free_float_score
            secondary_float_score = total_float_score

        return (
            round(gap_score, 6),
            round(selected_float_score, 6),
            round(secondary_float_score, 6),
            -len(path),
        )

    def _beam_paths_to_target(self, target: str, limit: int) -> List[List[str]]:
        """
        Generate ranked predecessor chains without enumerating every simple path.

        This works across multiple open starts and scales better than
        networkx.all_simple_paths for large P6 schedules.
        """
        if target not in self.graph:
            return []

        beam_width = max(20, limit * 8)
        active: List[List[str]] = [[target]]
        completed: List[List[str]] = []

        for _ in range(max(1, self.graph.number_of_nodes())):
            expanded: List[List[str]] = []

            for reverse_path in active:
                current = reverse_path[-1]
                preds = list(self.graph.predecessors(current))

                if not preds:
                    completed.append(list(reversed(reverse_path)))
                    continue

                preds.sort(
                    key=lambda n: (
                        max(0.0, self._relationship_gap_hours(n, current)),
                        max(0.0, self.states[n].free_float_hours),
                        abs(self.states[n].total_float_hours),
                        -(self.states[n].early_finish.timestamp()
                          if self.states[n].early_finish else 0.0),
                        str(n),
                    )
                )

                for pred in preds[:beam_width]:
                    if pred in reverse_path:
                        continue
                    expanded.append(reverse_path + [pred])

            if not expanded:
                break

            expanded.sort(
                key=lambda rp: self._path_metric(list(reversed(rp)))
            )
            active = expanded[:beam_width]

        for reverse_path in active:
            if reverse_path:
                completed.append(list(reversed(reverse_path)))

        unique: List[List[str]] = []
        seen = set()
        for path in sorted(completed, key=self._path_metric):
            key = tuple(path)
            if key in seen:
                continue
            seen.add(key)
            unique.append(path)
            if len(unique) >= limit:
                break
        return unique

    def _calculate_multiple_float_paths(self) -> None:
        """
        Assign and rank multiple float paths without enumerating every simple path.

        The implementation preserves the V5 multi-terminal beam-search behaviour
        while also accepting the reference implementation's optional
        ``multiple_float_path_target_node`` alias.  The existing public
        ``multiple_float_path_end_activity`` option remains authoritative for the
        ContractX API.  When no explicit target is supplied, the calculated
        project finish node is prioritised but other terminal activities remain
        eligible so multi-finish/open-end P6 networks are not silently reduced to
        a single chain.
        """
        # Reset float-path assignments across the calculated network.
        for state in self.states.values():
            state.float_path = None
            state.float_path_order = None

        requested = max(
            1,
            int(getattr(self.options, "multiple_float_path_count", 10) or 10),
        )

        # Backward/alternate option compatibility from the supplied reference.
        reference_target = getattr(
            self.options,
            "multiple_float_path_target_node",
            None,
        )
        configured_target = getattr(
            self.options,
            "multiple_float_path_end_activity",
            None,
        )
        explicit_target = reference_target or configured_target

        if explicit_target and explicit_target in self.graph:
            targets = [explicit_target]
        else:
            terminal_nodes = [
                n
                for n in self.graph
                if self.graph.out_degree(n) == 0
            ]

            targets = sorted(
                terminal_nodes,
                key=lambda n: (
                    -(self.states[n].early_finish.timestamp()
                      if self.states[n].early_finish else 0.0),
                    self.states[n].total_float_hours,
                    str(n),
                ),
            )

            # Preserve V5's multi-terminal coverage, but prioritise the
            # calculated project finish node when it is a valid terminal.
            project_finish_target = getattr(
                self,
                "project_finish_node",
                None,
            )
            if (
                project_finish_target
                and project_finish_target in self.graph
                and project_finish_target in targets
            ):
                targets = [
                    project_finish_target,
                    *[
                        n for n in targets
                        if n != project_finish_target
                    ],
                ]

        candidate_paths: List[List[str]] = []
        per_target_limit = max(
            requested,
            min(requested * 3, 30),
        )

        # Beam search supports multiple open starts and avoids the exponential
        # cost of networkx.all_simple_paths on large Primavera programmes.
        for target in targets[: max(requested, 5)]:
            candidate_paths.extend(
                self._beam_paths_to_target(
                    target,
                    per_target_limit,
                )
            )

        if not candidate_paths and self.states:
            fallback_target = (
                getattr(self, "project_finish_node", None)
                if getattr(self, "project_finish_node", None) in self.states
                else None
            )
            if fallback_target is None:
                fallback_target = max(
                    self.states,
                    key=lambda n: self.states[n].early_finish
                    or datetime.min,
                )

            candidate_paths = [
                self._trace_ranked_path(
                    fallback_target,
                    rank,
                )
                for rank in range(requested)
            ]

        # Deduplicate while retaining deterministic forensic ranking.
        unique_paths: List[List[str]] = []
        seen = set()

        for path in sorted(
            [p for p in candidate_paths if p],
            key=self._path_metric,
        ):
            key = tuple(path)
            if key in seen:
                continue

            seen.add(key)
            unique_paths.append(path)

            if len(unique_paths) >= requested:
                break

        self._multiple_float_paths = []

        for path_no, path in enumerate(
            unique_paths,
            start=1,
        ):
            metric = self._path_metric(path)

            path_result = {
                "path_number": path_no,
                "target_activity_pk": (
                    path[-1]
                    if path
                    else None
                ),
                # Retain the complete ranking metric for auditability while
                # preserving the existing individual metric fields.
                "metric": metric,
                "relationship_gap_hours": metric[0],
                "aggregate_free_float_hours": metric[1],
                "aggregate_abs_total_float_hours": metric[2],
                "activity_count": len(path),
                "activities": [],
            }

            for order, node in enumerate(
                path,
                start=1,
            ):
                state = self.states[node]

                # If an activity belongs to several candidate paths, retain its
                # primary (lowest-numbered) path assignment.
                if (
                    state.float_path is None
                    or path_no < state.float_path
                ):
                    state.float_path = path_no
                    state.float_path_order = order

                item = self._activity_result(node)
                item["path_order"] = order
                path_result["activities"].append(item)

            self._multiple_float_paths.append(
                path_result
            )

    def _trace_ranked_path(self, target: str, rank: int) -> List[str]:
        """
        Backward-compatible ranked predecessor trace used as a fallback.
        """
        if target not in self.graph:
            return []

        path = [target]
        current = target

        while self.graph.in_degree(current):
            preds = list(self.graph.predecessors(current))
            preds.sort(
                key=lambda n: (
                    max(0.0, self._relationship_gap_hours(n, current)),
                    self.states[n].free_float_hours,
                    self.states[n].total_float_hours,
                    -(self.states[n].early_finish.timestamp()
                      if self.states[n].early_finish else 0.0),
                    str(n),
                )
            )
            pick = preds[min(rank, len(preds) - 1)]
            if pick in path:
                break
            path.append(pick)
            current = pick

        return list(reversed(path))


    def _resource_level_forward(self):

        """

        Deterministic serial forward-leveling heuristic.



        Uses resource assignment units/hour and resource max units/hour.

        It delays activities until each assigned resource has sufficient capacity.

        This is intentionally transparent and auditable; it does not claim byte-for-byte

        parity with Oracle's proprietary priority/leveling implementation.

        """

        if self.resources_df.empty or self.assignments_df.empty:

            return



        capacities = {

            str(r.get("resource_id")): self._float(r.get("max_units_per_hour"), 0.0)

            for _, r in self.resources_df.iterrows()

        }

        bookings: Dict[str, List[Tuple[datetime, datetime, float]]] = {}



        order = sorted(self.states, key=lambda n: self.states[n].early_start)

        for node in order:

            assigns = self.assignments_df[

                self.assignments_df["activity_id_pk"].astype(str) == str(node)

            ]

            if assigns.empty:

                continue



            state = self.states[node]

            cal = self._calendar_for(node)

            candidate = state.early_start



            for _ in range(10000):

                finish = cal.add_work_hours(candidate, state.duration_hours)

                conflict_end = None



                for _, a in assigns.iterrows():

                    rid = str(a.get("resource_id"))

                    demand = self._float(a.get("units_per_hour"), 0.0)

                    cap = capacities.get(rid, 0.0)

                    if cap <= 0:

                        continue



                    for booked_start, booked_finish, booked_demand in bookings.get(rid, []):

                        overlaps = candidate < booked_finish and finish > booked_start

                        if overlaps and demand + booked_demand > cap:

                            conflict_end = max(conflict_end, booked_finish) if conflict_end else booked_finish



                if conflict_end is None:

                    state.early_start = candidate

                    state.early_finish = finish

                    for _, a in assigns.iterrows():

                        rid = str(a.get("resource_id"))

                        demand = self._float(a.get("units_per_hour"), 0.0)

                        bookings.setdefault(rid, []).append((candidate, finish, demand))

                    break



                candidate = cal.next_work_time(conflict_end)



        self.project_finish = max(s.early_finish for s in self.states.values())



    @staticmethod
    def _date_value(value: Any) -> Optional[datetime]:
        if value is None or pd.isna(value) or str(value).strip() == "":
            return None
        parsed = pd.to_datetime(value, errors="coerce")
        if pd.isna(parsed):
            return None
        return pd.Timestamp(parsed).to_pydatetime()

    @staticmethod
    def _activity_key(row: pd.Series) -> str:
        for field in ("activity_id", "activity_id_pk", "task_code", "task_id"):
            value = row.get(field)
            if value is not None and not pd.isna(value) and str(value).strip():
                return str(value).strip()
        return ""

    @staticmethod
    def _elapsed_hours(a: Optional[datetime], b: Optional[datetime]) -> Optional[float]:
        if a is None or b is None:
            return None
        return (b - a).total_seconds() / 3600.0

    @staticmethod
    def _row_float(row: pd.Series, field: str) -> Optional[float]:
        value = row.get(field)
        if value is None or pd.isna(value) or str(value).strip() == "":
            return None
        try:
            return float(value)
        except Exception:
            return None

    @classmethod
    def run_as_planned_vs_as_built(
        cls,
        baseline_df: pd.DataFrame,
        as_built_df: pd.DataFrame,
        *,
        hours_per_day: float = 24.0,
    ) -> Dict[str, Any]:
        """
        Deterministic activity-level As-Planned vs As-Built comparison.

        This method reports schedule facts. It does not determine contractual
        entitlement, responsibility, excusability, compensability or concurrency.
        """
        baseline_df = baseline_df.copy() if baseline_df is not None else pd.DataFrame()
        as_built_df = as_built_df.copy() if as_built_df is not None else pd.DataFrame()

        def indexed(df: pd.DataFrame) -> Dict[str, pd.Series]:
            result: Dict[str, pd.Series] = {}
            for _, row in df.iterrows():
                key = cls._activity_key(row)
                if key and key not in result:
                    result[key] = row
            return result

        baseline = indexed(baseline_df)
        as_built = indexed(as_built_df)
        keys = sorted(set(baseline) | set(as_built))

        findings: List[Dict[str, Any]] = []
        added = deleted = matched = 0
        delayed_finish_count = 0
        critical_to_noncritical = 0
        noncritical_to_critical = 0

        baseline_project_finish: Optional[datetime] = None
        actual_project_finish: Optional[datetime] = None

        for key in keys:
            b = baseline.get(key)
            a = as_built.get(key)

            if b is None:
                added += 1
                findings.append(
                    {
                        "activity_key": key,
                        "classification": "ADDED",
                        "activity_id": a.get("activity_id", key) if a is not None else key,
                        "activity_name": a.get("activity_name", "") if a is not None else "",
                    }
                )
                continue

            if a is None:
                deleted += 1
                findings.append(
                    {
                        "activity_key": key,
                        "classification": "DELETED_OR_NOT_IN_AS_BUILT",
                        "activity_id": b.get("activity_id", key),
                        "activity_name": b.get("activity_name", ""),
                    }
                )
                continue

            matched += 1

            planned_start = cls._date_value(
                b.get("planned_start", b.get("early_start"))
            )
            planned_finish = cls._date_value(
                b.get("planned_finish", b.get("early_finish"))
            )
            actual_start = cls._date_value(
                a.get("actual_start", a.get("early_start"))
            )
            actual_finish = cls._date_value(
                a.get(
                    "actual_finish",
                    a.get("remaining_finish", a.get("early_finish")),
                )
            )

            if planned_finish and (
                baseline_project_finish is None
                or planned_finish > baseline_project_finish
            ):
                baseline_project_finish = planned_finish

            if actual_finish and (
                actual_project_finish is None
                or actual_finish > actual_project_finish
            ):
                actual_project_finish = actual_finish

            start_variance_hours = cls._elapsed_hours(
                planned_start, actual_start
            )
            finish_variance_hours = cls._elapsed_hours(
                planned_finish, actual_finish
            )

            if finish_variance_hours is not None and finish_variance_hours > 0:
                delayed_finish_count += 1

            b_float = cls._row_float(b, "total_float_hrs")
            a_float = cls._row_float(a, "total_float_hrs")
            float_change = (
                a_float - b_float
                if a_float is not None and b_float is not None
                else None
            )

            b_critical = b_float is not None and b_float <= 0.0
            a_critical = a_float is not None and a_float <= 0.0

            if b_critical and not a_critical:
                critical_to_noncritical += 1
            if not b_critical and a_critical:
                noncritical_to_critical += 1

            flags: List[str] = []
            if finish_variance_hours is not None and finish_variance_hours > 0:
                flags.append("FINISHED_OR_FORECAST_LATER_THAN_BASELINE")
            if float_change is not None and float_change < 0:
                flags.append("FLOAT_EROSION")
            if not b_critical and a_critical:
                flags.append("BECAME_CRITICAL")
            if b_critical and not a_critical:
                flags.append("LEFT_CRITICAL_SET")

            findings.append(
                {
                    "activity_key": key,
                    "classification": "MATCHED",
                    "activity_id": a.get("activity_id", b.get("activity_id", key)),
                    "activity_name": a.get(
                        "activity_name", b.get("activity_name", "")
                    ),
                    "baseline": {
                        "planned_start": (
                            planned_start.isoformat()
                            if planned_start else None
                        ),
                        "planned_finish": (
                            planned_finish.isoformat()
                            if planned_finish else None
                        ),
                        "total_float_hours": b_float,
                        "critical_by_total_float": b_critical,
                        "status": b.get("status"),
                    },
                    "as_built_or_current": {
                        "actual_or_forecast_start": (
                            actual_start.isoformat()
                            if actual_start else None
                        ),
                        "actual_or_forecast_finish": (
                            actual_finish.isoformat()
                            if actual_finish else None
                        ),
                        "total_float_hours": a_float,
                        "critical_by_total_float": a_critical,
                        "status": a.get("status"),
                    },
                    "variance": {
                        "start_calendar_hours": start_variance_hours,
                        "start_calendar_days": (
                            start_variance_hours / hours_per_day
                            if start_variance_hours is not None
                            and hours_per_day
                            else None
                        ),
                        "finish_calendar_hours": finish_variance_hours,
                        "finish_calendar_days": (
                            finish_variance_hours / hours_per_day
                            if finish_variance_hours is not None
                            and hours_per_day
                            else None
                        ),
                        "total_float_change_hours": float_change,
                    },
                    "forensic_flags": flags,
                }
            )

        project_finish_shift_hours = cls._elapsed_hours(
            baseline_project_finish, actual_project_finish
        )

        return {
            "method": "AS_PLANNED_VS_AS_BUILT",
            "methodology_note": (
                "Deterministic activity-level comparison. Results are schedule "
                "facts and are not a legal or contractual entitlement opinion."
            ),
            "summary": {
                "baseline_activity_count": len(baseline),
                "as_built_activity_count": len(as_built),
                "matched_activity_count": matched,
                "added_activity_count": added,
                "deleted_or_missing_activity_count": deleted,
                "later_finish_activity_count": delayed_finish_count,
                "became_critical_count": noncritical_to_critical,
                "left_critical_set_count": critical_to_noncritical,
                "baseline_project_finish": (
                    baseline_project_finish.isoformat()
                    if baseline_project_finish else None
                ),
                "as_built_or_current_project_finish": (
                    actual_project_finish.isoformat()
                    if actual_project_finish else None
                ),
                "project_finish_shift_calendar_hours": project_finish_shift_hours,
                "project_finish_shift_calendar_days": (
                    project_finish_shift_hours / hours_per_day
                    if project_finish_shift_hours is not None
                    and hours_per_day
                    else None
                ),
            },
            "findings": findings,
        }

    @classmethod
    def run_window_analysis(
        cls,
        window_a_df: pd.DataFrame,
        window_b_df: pd.DataFrame,
        *,
        relationships_a: Optional[pd.DataFrame] = None,
        relationships_b: Optional[pd.DataFrame] = None,
        calendars_a: Optional[pd.DataFrame] = None,
        calendars_b: Optional[pd.DataFrame] = None,
        hours_per_day: float = 24.0,
    ) -> Dict[str, Any]:
        """
        Deterministic update-to-update/window comparison.

        The method reports progress, forecast, float, constraint, logic and
        calendar deltas when the relevant datasets are supplied.
        """
        a_df = window_a_df.copy() if window_a_df is not None else pd.DataFrame()
        b_df = window_b_df.copy() if window_b_df is not None else pd.DataFrame()

        def indexed(df: pd.DataFrame) -> Dict[str, pd.Series]:
            out: Dict[str, pd.Series] = {}
            for _, row in df.iterrows():
                key = cls._activity_key(row)
                if key and key not in out:
                    out[key] = row
            return out

        a_map = indexed(a_df)
        b_map = indexed(b_df)
        keys = sorted(set(a_map) | set(b_map))

        activities: List[Dict[str, Any]] = []
        added = deleted = changed = 0
        float_erosion_count = became_critical_count = 0

        a_finish: Optional[datetime] = None
        b_finish: Optional[datetime] = None

        for key in keys:
            a = a_map.get(key)
            b = b_map.get(key)

            if a is None:
                added += 1
                activities.append(
                    {
                        "activity_key": key,
                        "classification": "ADDED_IN_WINDOW_B",
                        "activity_id": b.get("activity_id", key) if b is not None else key,
                        "activity_name": b.get("activity_name", "") if b is not None else "",
                    }
                )
                continue

            if b is None:
                deleted += 1
                activities.append(
                    {
                        "activity_key": key,
                        "classification": "REMOVED_IN_WINDOW_B",
                        "activity_id": a.get("activity_id", key),
                        "activity_name": a.get("activity_name", ""),
                    }
                )
                continue

            a_start = cls._date_value(
                a.get("remaining_start", a.get("early_start", a.get("planned_start")))
            )
            b_start = cls._date_value(
                b.get("remaining_start", b.get("early_start", b.get("planned_start")))
            )
            a_end = cls._date_value(
                a.get("remaining_finish", a.get("early_finish", a.get("planned_finish")))
            )
            b_end = cls._date_value(
                b.get("remaining_finish", b.get("early_finish", b.get("planned_finish")))
            )

            if a_end and (a_finish is None or a_end > a_finish):
                a_finish = a_end
            if b_end and (b_finish is None or b_end > b_finish):
                b_finish = b_end

            start_shift = cls._elapsed_hours(a_start, b_start)
            finish_shift = cls._elapsed_hours(a_end, b_end)

            a_float = cls._row_float(a, "total_float_hrs")
            b_float = cls._row_float(b, "total_float_hrs")
            float_change = (
                b_float - a_float
                if a_float is not None and b_float is not None
                else None
            )

            a_critical = a_float is not None and a_float <= 0.0
            b_critical = b_float is not None and b_float <= 0.0

            if float_change is not None and float_change < 0:
                float_erosion_count += 1
            if not a_critical and b_critical:
                became_critical_count += 1

            constraint_changes = []
            for prefix in ("primary", "secondary"):
                type_field = f"{prefix}_constraint_type"
                date_field = f"{prefix}_constraint_date"
                a_type = str(a.get(type_field, "") or "")
                b_type = str(b.get(type_field, "") or "")
                a_date = cls._date_value(a.get(date_field))
                b_date = cls._date_value(b.get(date_field))
                if a_type != b_type or a_date != b_date:
                    constraint_changes.append(
                        {
                            "constraint": prefix,
                            "from_type": a_type or None,
                            "to_type": b_type or None,
                            "from_date": a_date.isoformat() if a_date else None,
                            "to_date": b_date.isoformat() if b_date else None,
                        }
                    )

            a_remaining = cls._row_float(a, "remaining_duration_hrs")
            b_remaining = cls._row_float(b, "remaining_duration_hrs")
            remaining_change = (
                b_remaining - a_remaining
                if a_remaining is not None and b_remaining is not None
                else None
            )

            a_pct = cls._row_float(a, "percent_complete")
            b_pct = cls._row_float(b, "percent_complete")
            progress_change = (
                b_pct - a_pct
                if a_pct is not None and b_pct is not None
                else None
            )

            flags: List[str] = []
            if finish_shift is not None and finish_shift > 0:
                flags.append("FORECAST_FINISH_MOVED_LATER")
            if float_change is not None and float_change < 0:
                flags.append("FLOAT_EROSION")
            if not a_critical and b_critical:
                flags.append("BECAME_CRITICAL")
            if constraint_changes:
                flags.append("CONSTRAINT_CHANGED")
            if remaining_change is not None and remaining_change > 0:
                flags.append("REMAINING_DURATION_INCREASED")

            if flags:
                changed += 1

            activities.append(
                {
                    "activity_key": key,
                    "classification": "MATCHED",
                    "activity_id": b.get("activity_id", a.get("activity_id", key)),
                    "activity_name": b.get(
                        "activity_name", a.get("activity_name", "")
                    ),
                    "window_a": {
                        "start": a_start.isoformat() if a_start else None,
                        "finish": a_end.isoformat() if a_end else None,
                        "total_float_hours": a_float,
                        "status": a.get("status"),
                        "percent_complete": a_pct,
                        "remaining_duration_hours": a_remaining,
                    },
                    "window_b": {
                        "start": b_start.isoformat() if b_start else None,
                        "finish": b_end.isoformat() if b_end else None,
                        "total_float_hours": b_float,
                        "status": b.get("status"),
                        "percent_complete": b_pct,
                        "remaining_duration_hours": b_remaining,
                    },
                    "delta": {
                        "start_calendar_hours": start_shift,
                        "finish_calendar_hours": finish_shift,
                        "finish_calendar_days": (
                            finish_shift / hours_per_day
                            if finish_shift is not None and hours_per_day
                            else None
                        ),
                        "total_float_change_hours": float_change,
                        "remaining_duration_change_hours": remaining_change,
                        "percent_complete_change": progress_change,
                    },
                    "constraint_changes": constraint_changes,
                    "forensic_flags": flags,
                }
            )

        finish_shift_hours = cls._elapsed_hours(a_finish, b_finish)

        result: Dict[str, Any] = {
            "method": "WINDOW_ANALYSIS",
            "methodology_note": (
                "Deterministic update-to-update comparison. Results identify "
                "schedule movement and data changes; they do not assign legal "
                "responsibility or entitlement."
            ),
            "summary": {
                "window_a_activity_count": len(a_map),
                "window_b_activity_count": len(b_map),
                "added_activity_count": added,
                "removed_activity_count": deleted,
                "changed_activity_count": changed,
                "float_erosion_activity_count": float_erosion_count,
                "became_critical_count": became_critical_count,
                "window_a_finish": a_finish.isoformat() if a_finish else None,
                "window_b_finish": b_finish.isoformat() if b_finish else None,
                "finish_shift_calendar_hours": finish_shift_hours,
                "finish_shift_calendar_days": (
                    finish_shift_hours / hours_per_day
                    if finish_shift_hours is not None and hours_per_day
                    else None
                ),
            },
            "activities": activities,
        }

        if relationships_a is not None and relationships_b is not None:
            result["logic_changes"] = cls.compare_relationships(
                relationships_a, relationships_b
            )

        if calendars_a is not None and calendars_b is not None:
            result["calendar_changes"] = cls.compare_calendar_frames(
                calendars_a, calendars_b
            )

        return result

    @classmethod
    def compare_relationships(
        cls,
        relationships_a: pd.DataFrame,
        relationships_b: pd.DataFrame,
    ) -> Dict[str, Any]:
        def rows(df: pd.DataFrame) -> Dict[Tuple[str, str], Dict[str, Any]]:
            out: Dict[Tuple[str, str], Dict[str, Any]] = {}
            if df is None or df.empty:
                return out
            for _, row in df.iterrows():
                pred = str(row.get("predecessor_activity_pk", "") or "").strip()
                succ = str(row.get("successor_activity_pk", "") or "").strip()
                if not pred or not succ:
                    continue
                out[(pred, succ)] = {
                    "predecessor_activity_pk": pred,
                    "successor_activity_pk": succ,
                    "relationship_type": str(
                        row.get("relationship_type", "FS") or "FS"
                    ).upper(),
                    "lag_hours": cls._row_float(row, "lag_hrs") or 0.0,
                }
            return out

        a = rows(relationships_a)
        b = rows(relationships_b)
        keys = sorted(set(a) | set(b))

        added: List[Dict[str, Any]] = []
        removed: List[Dict[str, Any]] = []
        modified: List[Dict[str, Any]] = []

        for key in keys:
            if key not in a:
                added.append(b[key])
                continue
            if key not in b:
                removed.append(a[key])
                continue
            if (
                a[key]["relationship_type"] != b[key]["relationship_type"]
                or abs(a[key]["lag_hours"] - b[key]["lag_hours"]) > 1e-9
            ):
                modified.append(
                    {
                        "predecessor_activity_pk": key[0],
                        "successor_activity_pk": key[1],
                        "from": a[key],
                        "to": b[key],
                    }
                )

        return {
            "added_count": len(added),
            "removed_count": len(removed),
            "modified_count": len(modified),
            "added": added,
            "removed": removed,
            "modified": modified,
        }

    @classmethod
    def compare_calendar_frames(
        cls,
        calendars_a: pd.DataFrame,
        calendars_b: pd.DataFrame,
    ) -> Dict[str, Any]:
        def frame_map(df: pd.DataFrame) -> Dict[str, Dict[str, Any]]:
            out: Dict[str, Dict[str, Any]] = {}
            if df is None or df.empty:
                return out
            for _, row in df.iterrows():
                cid = str(row.get("calendar_id", "") or "").strip()
                if not cid:
                    continue
                out[cid] = {
                    "calendar_id": cid,
                    "calendar_name": str(row.get("calendar_name", "") or ""),
                    "hours_per_day": cls._row_float(row, "hours_per_day"),
                    "hours_per_week": cls._row_float(row, "hours_per_week"),
                    "base_calendar_id": str(
                        row.get("base_calendar_id", "") or ""
                    ) or None,
                    "calendar_data": str(row.get("calendar_data", "") or ""),
                }
            return out

        a = frame_map(calendars_a)
        b = frame_map(calendars_b)
        keys = sorted(set(a) | set(b))
        added, removed, modified = [], [], []

        for cid in keys:
            if cid not in a:
                added.append(b[cid])
            elif cid not in b:
                removed.append(a[cid])
            elif a[cid] != b[cid]:
                modified.append(
                    {
                        "calendar_id": cid,
                        "from": a[cid],
                        "to": b[cid],
                    }
                )

        return {
            "added_count": len(added),
            "removed_count": len(removed),
            "modified_count": len(modified),
            "added": added,
            "removed": removed,
            "modified": modified,
        }

    @staticmethod
    def critical_path_shift(
        before_summary: Dict[str, Any],
        after_summary: Dict[str, Any],
    ) -> Dict[str, Any]:
        def path_ids(summary: Dict[str, Any]) -> List[str]:
            result = []
            for item in summary.get("longest_path", []) or []:
                value = item.get("activity_id") or item.get("activity_pk")
                if value is not None:
                    result.append(str(value))
            return result

        before = path_ids(before_summary)
        after = path_ids(after_summary)
        bset, aset = set(before), set(after)

        return {
            "before_path": before,
            "after_path": after,
            "retained_activities": [x for x in after if x in bset],
            "entered_path": [x for x in after if x not in bset],
            "exited_path": [x for x in before if x not in aset],
            "path_changed": before != after,
        }

    def _export_network_frames(self) -> Tuple[pd.DataFrame, pd.DataFrame]:
        activities = []
        for n, d in self.graph.nodes(data=True):
            activities.append(
                {
                    "activity_id_pk": n,
                    "activity_id": d.get("activity_id"),
                    "activity_name": d.get("activity_name"),
                    "planned_duration_hrs": d.get("duration_hours", 0.0),
                    "remaining_duration_hrs": d.get("duration_hours", 0.0),
                    "calendar_id": d.get("calendar_id"),
                    "activity_type": d.get("activity_type"),
                    "activity_type_raw": d.get("activity_type_raw"),
                    "activity_type_normalized": d.get("activity_type_normalized"),
                    "wbs_id": d.get("wbs_id"),
                    "wbs_path": d.get("wbs_path"),
                    "status": d.get("status"),
                    "planned_start": d.get("planned_start"),
                    "planned_finish": d.get("planned_finish"),
                    "actual_start": d.get("actual_start"),
                    "actual_finish": d.get("actual_finish"),
                    "remaining_start": d.get("remaining_start"),
                    "remaining_finish": d.get("remaining_finish"),
                    "expected_finish": d.get("expected_finish"),
                    "primary_constraint_type": d.get(
                        "primary_constraint_type"
                    ),
                    "primary_constraint_type_raw": d.get(
                        "primary_constraint_type_raw"
                    ),
                    "primary_constraint_date": d.get(
                        "primary_constraint_date"
                    ),
                    "secondary_constraint_type": d.get(
                        "secondary_constraint_type"
                    ),
                    "secondary_constraint_type_raw": d.get(
                        "secondary_constraint_type_raw"
                    ),
                    "secondary_constraint_date": d.get(
                        "secondary_constraint_date"
                    ),
                }
            )

        relationships = []
        for pred, succ, edge in self.graph.edges(data=True):
            relationships.append(
                {
                    "predecessor_activity_pk": pred,
                    "successor_activity_pk": succ,
                    "relationship_type": edge.get("rel_type", "FS"),
                    "lag_hrs": edge.get("lag_hours", 0.0),
                }
            )

        return pd.DataFrame(activities), pd.DataFrame(relationships)

    @staticmethod
    def _is_date_only_value(value: Any) -> bool:
        """
        True when the supplied forensic event boundary is a calendar date rather
        than a timestamp.

        ContractX treats a date-only finish as inclusive. Therefore an event
        entered as 2026-04-01 to 2026-04-30 represents the complete 30-calendar-
        day window, including all P6 working periods on 30 April.
        """
        if value is None:
            return False
        if isinstance(value, datetime):
            return False

        token = str(value).strip()
        if not token:
            return False

        # ISO / common date forms without an explicit clock component.
        return (
            "T" not in token
            and ":" not in token
            and len(token) <= 10
        )

    def _resolve_tia_fragnet_calendar(
        self,
        raw: Dict[str, Any],
        insertion_relationships: Optional[List[Dict[str, Any]]],
    ) -> str:
        """
        Resolve a TIA fragnet onto an existing source Primavera P6 calendar.

        Priority:
          1. explicit valid source calendar supplied on the fragnet;
          2. first valid source predecessor calendar tied into the fragnet;
          3. source programme default calendar.

        The internal ContractX "24H" calendar is deliberately not selected for
        the exported/scheduled fragnet when a source P6 calendar is available.
        """
        requested = str(raw.get("calendar_id") or "").strip()
        known = getattr(self.calendars, "calendars", {}) or {}

        if (
            requested
            and requested != "24H"
            and requested in known
        ):
            return requested

        fragnet_pk = str(
            raw.get("activity_id_pk")
            or raw.get("fragnet_activity_id")
            or raw.get("activity_id")
            or ""
        ).strip()

        for rel in insertion_relationships or []:
            pred = str(
                rel.get("predecessor_activity_pk")
                or rel.get("predecessor")
                or rel.get("pred")
                or ""
            ).strip()
            succ = str(
                rel.get("successor_activity_pk")
                or rel.get("successor")
                or rel.get("succ")
                or ""
            ).strip()

            # Only source -> fragnet ties can provide the inherited source calendar.
            if succ != fragnet_pk or pred not in self.graph:
                continue

            candidate = str(
                self.graph.nodes[pred].get("calendar_id") or ""
            ).strip()
            if (
                candidate
                and candidate != "24H"
                and candidate in known
            ):
                return candidate

        default_id = str(self.calendars.default_calendar_id or "").strip()
        if default_id:
            return default_id

        return requested or "DEFAULT"

    def _tia_window_working_hours(
        self,
        *,
        calendar_id: str,
        start_value: Any,
        finish_value: Any,
    ) -> Tuple[float, datetime, datetime]:
        """
        Convert a forensic calendar-date event window into P6 working hours.

        Example:
            start  = 2026-04-01
            finish = 2026-04-30

        The event remains the elapsed calendar window 1-Apr through 30-Apr.
        The fragnet duration written into the CPM/P6 network is the amount of
        working time available inside that same window under the inherited P6
        calendar. Non-working days/holidays therefore do not stretch a 30-day
        event into 30 P6 working days.

        A date-only finish is inclusive. Internally, the calculation uses the
        next midnight as the exclusive upper bound so all working intervals on
        the stated finish date are counted.
        """
        start_dt = self._dt(start_value)
        finish_dt = self._dt(finish_value)

        if start_dt is None or finish_dt is None:
            raise CPMValidationError(
                "TIA delay window requires valid start and finish dates."
            )

        if finish_dt < start_dt:
            raise CPMValidationError(
                "TIA delay window finish cannot be earlier than its start."
            )

        cal = self.calendars.get(calendar_id)

        # Date-only start means the full first calendar date is eligible.
        calculation_start = start_dt

        # Date-only finish is inclusive: count all P6 working periods on that date.
        if self._is_date_only_value(finish_value):
            calculation_finish = (
                finish_dt.replace(hour=0, minute=0, second=0, microsecond=0)
                + timedelta(days=1)
            )
        else:
            calculation_finish = finish_dt

        working_hours = cal.work_hours_between(
            calculation_start,
            calculation_finish,
        )

        if working_hours < 0:
            raise CPMValidationError(
                "TIA delay window produced a negative P6 working duration."
            )

        return working_hours, start_dt, finish_dt

    def _prepare_tia_fragnet_activity(
        self,
        raw: Dict[str, Any],
        *,
        insertion_relationships: Optional[List[Dict[str, Any]]],
    ) -> Dict[str, Any]:
        """
        Prepare one fragnet activity without changing legacy TIA behaviour.

        If delay_start_date + delay_finish_date are supplied, those dates are
        authoritative for the elapsed event window and P6 working duration is
        derived from the inherited source calendar.

        If the dates are not supplied, the existing planned_duration_hrs /
        duration_hours behaviour remains untouched.
        """
        item = dict(raw)

        calendar_id = self._resolve_tia_fragnet_calendar(
            item,
            insertion_relationships,
        )
        item["calendar_id"] = calendar_id

        delay_start = (
            item.get("delay_start_date")
            or item.get("event_start_date")
        )
        delay_finish = (
            item.get("delay_finish_date")
            or item.get("event_finish_date")
        )

        # Do not partially infer an event window.
        if (delay_start is None) != (delay_finish is None):
            raise CPMValidationError(
                "TIA delay window requires both start and finish dates."
            )

        if delay_start is not None and delay_finish is not None:
            working_hours, start_dt, finish_dt = (
                self._tia_window_working_hours(
                    calendar_id=calendar_id,
                    start_value=delay_start,
                    finish_value=delay_finish,
                )
            )

            # These are the P6 duration fields used by the CPM calculation/export.
            item["planned_duration_hrs"] = working_hours
            item["remaining_duration_hrs"] = working_hours

            # Retain the forensic event window explicitly for audit/export layers.
            item["delay_start_date"] = start_dt
            item["delay_finish_date"] = finish_dt

            # The event may not start before the stated first day. Existing
            # predecessor logic can still drive it later if the network requires it.
            if not item.get("primary_constraint_type"):
                item["primary_constraint_type"] = "CS_SNET"
                item["primary_constraint_type_raw"] = "CS_SNET"
                item["primary_constraint_date"] = start_dt

            # Retain source-style planned dates as metadata for the inserted row.
            if item.get("planned_start") is None:
                item["planned_start"] = start_dt
            if item.get("planned_finish") is None:
                item["planned_finish"] = finish_dt

        return item

    @staticmethod
    def _normalize_fragnet_activity(
        raw: Dict[str, Any],
        *,
        default_calendar_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        pk = str(
            raw.get("activity_id_pk")
            or raw.get("fragnet_activity_id")
            or raw.get("activity_id")
            or ""
        ).strip()
        if not pk:
            raise CPMValidationError(
                "Each fragnet activity requires activity_id_pk, "
                "fragnet_activity_id or activity_id."
            )

        duration = raw.get(
            "planned_duration_hrs",
            raw.get("duration_hours", raw.get("duration_hrs", 0.0)),
        )
        try:
            duration = float(duration or 0.0)
        except Exception as exc:
            raise CPMValidationError(
                f"Fragnet activity {pk} has an invalid duration."
            ) from exc

        if duration < 0:
            raise CPMValidationError(
                f"Fragnet activity {pk} cannot have a negative duration."
            )

        return {
            "activity_id_pk": pk,
            "activity_id": str(raw.get("activity_id") or pk),
            "activity_name": str(
                raw.get("activity_name")
                or raw.get("fragnet_activity_name")
                or pk
            ),
            "planned_duration_hrs": duration,
            "remaining_duration_hrs": duration,
            "calendar_id": str(
                raw.get("calendar_id") or default_calendar_id or ""
            ),
            "activity_type": str(raw.get("activity_type") or "TT_Task"),
            "activity_type_raw": str(raw.get("activity_type_raw") or raw.get("activity_type") or "TT_Task"),
            "activity_type_normalized": str(raw.get("activity_type_normalized") or "TASK_DEPENDENT"),
            "wbs_id": str(raw.get("wbs_id") or ""),
            "wbs_path": str(raw.get("wbs_path") or ""),
            "status": str(raw.get("status") or "TK_NOTSTART"),
            "planned_start": raw.get("planned_start"),
            "planned_finish": raw.get("planned_finish"),
            "actual_start": raw.get("actual_start"),
            "actual_finish": raw.get("actual_finish"),
            "expected_finish": raw.get("expected_finish"),
            "primary_constraint_type": raw.get(
                "primary_constraint_type"
            ),
            "primary_constraint_date": raw.get(
                "primary_constraint_date"
            ),
            "secondary_constraint_type": raw.get(
                "secondary_constraint_type"
            ),
            "secondary_constraint_date": raw.get(
                "secondary_constraint_date"
            ),
        }

    @staticmethod
    def _normalize_fragnet_relationship(raw: Dict[str, Any]) -> Dict[str, Any]:
        pred = str(
            raw.get("predecessor_activity_pk")
            or raw.get("predecessor")
            or raw.get("pred")
            or ""
        ).strip()
        succ = str(
            raw.get("successor_activity_pk")
            or raw.get("successor")
            or raw.get("succ")
            or ""
        ).strip()

        if not pred or not succ:
            raise CPMValidationError(
                "Each fragnet relationship requires predecessor and successor."
            )

        rel = str(
            raw.get("relationship_type")
            or raw.get("rel_type")
            or "FS"
        ).upper()

        if rel not in {"FS", "SS", "FF", "SF", "PR_FS", "PR_SS", "PR_FF", "PR_SF"}:
            raise CPMValidationError(
                f"Unsupported fragnet relationship type: {rel}"
            )

        try:
            lag = float(raw.get("lag_hrs", raw.get("lag_hours", 0.0)) or 0.0)
        except Exception as exc:
            raise CPMValidationError(
                f"Invalid lag for fragnet relationship {pred} -> {succ}."
            ) from exc

        return {
            "predecessor_activity_pk": pred,
            "successor_activity_pk": succ,
            "relationship_type": rel,
            "lag_hrs": lag,
        }

    def run_tia_fragnet(
        self,
        *,
        fragnet_id: str,
        fragnet_name: str,
        fragnet_activities: List[Dict[str, Any]],
        fragnet_relationships: Optional[List[Dict[str, Any]]] = None,
        insertion_relationships: Optional[List[Dict[str, Any]]] = None,
        remove_relationships: Optional[List[Dict[str, Any]]] = None,
        event: Optional[Dict[str, Any]] = None,
        effective_date: Optional[datetime] = None,
        include_schedule_snapshots: bool = False,
    ) -> Dict[str, Any]:
        """
        Multi-activity deterministic Time Impact Analysis.

        The impacted network is built from a copy of the source schedule,
        selected original ties may be removed, and a validated multi-activity
        fragnet is inserted before recalculation.
        """
        self._ensure_scheduled()
        before = self.summary()
        baseline_finish = self.project_finish

        activities_df, relationships_df = self._export_network_frames()
        existing_nodes = set(activities_df["activity_id_pk"].astype(str))

        prepared_fragnet_activities = [
            self._prepare_tia_fragnet_activity(
                item,
                insertion_relationships=insertion_relationships,
            )
            for item in fragnet_activities
        ]

        normalized_activities = [
            self._normalize_fragnet_activity(
                item,
                default_calendar_id=(
                    str(self.calendars.default_calendar_id)
                    if self.calendars.default_calendar_id else None
                ),
            )
            for item in prepared_fragnet_activities
        ]

        # Preserve the forensic delay-window metadata after normalization.
        prepared_by_pk = {
            str(
                item.get("activity_id_pk")
                or item.get("fragnet_activity_id")
                or item.get("activity_id")
                or ""
            ): item
            for item in prepared_fragnet_activities
        }
        for item in normalized_activities:
            prepared = prepared_by_pk.get(
                str(item.get("activity_id_pk") or ""),
                {},
            )
            for field in (
                "delay_start_date",
                "delay_finish_date",
                "primary_constraint_type_raw",
            ):
                if field in prepared:
                    item[field] = prepared.get(field)

        new_ids = [str(x["activity_id_pk"]) for x in normalized_activities]

        # Effective Date is modelled as a Start-On-or-After bound on fragnet
        # entry activities, not as an artificial hard constraint on every fragnet
        # activity. Internal fragnet logic remains responsible for downstream dates.
        if effective_date is not None and normalized_activities:
            effective_dt = self._dt(effective_date)
            internal_pred_ids = {
                str(rel.get("successor_activity_pk"))
                for rel in (fragnet_relationships or [])
                if str(rel.get("predecessor_activity_pk")) in set(new_ids)
                and str(rel.get("successor_activity_pk")) in set(new_ids)
            }
            for item in normalized_activities:
                item_id = str(item["activity_id_pk"])
                if item_id not in internal_pred_ids:
                    if not item.get("primary_constraint_type"):
                        item["primary_constraint_type"] = "CS_SNET"
                        item["primary_constraint_type_raw"] = "CS_SNET"
                        item["primary_constraint_date"] = effective_dt

        if len(new_ids) != len(set(new_ids)):
            raise CPMValidationError(
                "Fragnet activity identifiers must be unique."
            )

        conflicts = sorted(set(new_ids) & existing_nodes)
        if conflicts:
            raise CPMValidationError(
                "Fragnet activity identifiers already exist in the source "
                f"schedule: {conflicts[:10]}"
            )

        normalized_relationships = [
            self._normalize_fragnet_relationship(item)
            for item in (fragnet_relationships or [])
        ]
        normalized_insertions = [
            self._normalize_fragnet_relationship(item)
            for item in (insertion_relationships or [])
        ]
        normalized_removals = [
            self._normalize_fragnet_relationship(item)
            for item in (remove_relationships or [])
        ]

        if normalized_removals:
            removal_keys = {
                (
                    x["predecessor_activity_pk"],
                    x["successor_activity_pk"],
                )
                for x in normalized_removals
            }
            relationships_df = relationships_df[
                ~relationships_df.apply(
                    lambda row: (
                        str(row.get("predecessor_activity_pk")),
                        str(row.get("successor_activity_pk")),
                    ) in removal_keys,
                    axis=1,
                )
            ].copy()

        all_nodes = existing_nodes | set(new_ids)
        for rel in normalized_relationships + normalized_insertions:
            pred = rel["predecessor_activity_pk"]
            succ = rel["successor_activity_pk"]
            if pred not in all_nodes or succ not in all_nodes:
                raise CPMValidationError(
                    "Fragnet relationship references an unknown activity: "
                    f"{pred} -> {succ}"
                )

        impacted_activities = pd.concat(
            [activities_df, pd.DataFrame(normalized_activities)],
            ignore_index=True,
            sort=False,
        )
        impacted_relationships = pd.concat(
            [
                relationships_df,
                pd.DataFrame(
                    normalized_relationships + normalized_insertions
                ),
            ],
            ignore_index=True,
            sort=False,
        )

        impacted = CPMEngine(
            impacted_activities,
            impacted_relationships,
            calendars=self.calendars,
            options=self.options,
            data_date=self.data_date,
            project_start=self.project_start,
            project_finish_constraint=self.project_finish_constraint,
            resources_df=self.resources_df,
            assignments_df=self.assignments_df,
        )
        after = impacted.schedule()

        impact_hours = (
            (impacted.project_finish - baseline_finish).total_seconds() / 3600.0
            if impacted.project_finish and baseline_finish
            else None
        )

        path_shift = self.critical_path_shift(before, after)

        affected = []
        after_by_pk = {
            str(item.get("activity_pk")): item
            for item in after.get("activities", [])
        }
        for fragnet_activity_id in new_ids:
            if fragnet_activity_id in after_by_pk:
                affected.append(after_by_pk[fragnet_activity_id])

        result = {
            "analysis_type": "TIME_IMPACT_ANALYSIS",
            "fragnet_id": fragnet_id,
            "fragnet_name": fragnet_name,
            "event": event or {},
            "effective_date": (
                self._dt(effective_date).isoformat()
                if effective_date is not None and self._dt(effective_date)
                else None
            ),
            "baseline_finish": (
                baseline_finish.isoformat()
                if baseline_finish else None
            ),
            "impacted_finish": (
                impacted.project_finish.isoformat()
                if impacted.project_finish else None
            ),
            "calendar_elapsed_impact_hours": impact_hours,
            "calendar_elapsed_impact_days": (
                impact_hours / 24.0 if impact_hours is not None else None
            ),
            "critical_path_extended": (
                impacted.project_finish > baseline_finish
                if impacted.project_finish and baseline_finish
                else False
            ),
            "impacted_longest_path": after.get("longest_path", []),
            "critical_path_shift": path_shift,
            "fragnet": {
                "activity_count": len(normalized_activities),
                "relationship_count": len(normalized_relationships),
                "insertion_relationship_count": len(normalized_insertions),
                "removed_source_relationship_count": len(normalized_removals),
                "activities": normalized_activities,
                "internal_relationships": normalized_relationships,
                "insertion_relationships": normalized_insertions,
                "removed_relationships": normalized_removals,
                "calculated_activities": affected,
            },
            "before": {
                "project_finish": before.get("project_finish"),
                "longest_path": before.get("longest_path", []),
                "multiple_float_paths": before.get(
                    "multiple_float_paths", []
                ),
                "quality": before.get("quality", {}),
            },
            "after": {
                "project_finish": after.get("project_finish"),
                "longest_path": after.get("longest_path", []),
                "multiple_float_paths": after.get(
                    "multiple_float_paths", []
                ),
                "quality": after.get("quality", {}),
            },
            "forensic_statement": (
                "This result quantifies the deterministic schedule impact of "
                "the inserted fragnet. It does not determine contractual "
                "entitlement, excusability, compensability, responsibility "
                "or legal concurrency."
            ),
            "source_network_fingerprint": self.network_fingerprint(),
            "impacted_network_fingerprint": impacted.network_fingerprint(),
        }

        if include_schedule_snapshots:
            # Export-only payload.
            #
            # Preserve the impacted network metadata used for XER reconstruction,
            # then overlay the recalculated CPM activity state. This is essential:
            # the XER writer needs recalculated early/late dates and total/free
            # float, not only the inserted fragnet and revised relationships.
            result["_before_schedule_activities"] = before.get("activities", [])
            result["_after_schedule_activities"] = after.get("activities", [])

            (
                impacted_network_activities_df,
                impacted_network_relationships_df,
            ) = impacted._export_network_frames()

            calculated_by_pk = {
                str(
                    item.get("activity_pk")
                    or item.get("activity_id_pk")
                    or ""
                ): item
                for item in after.get("activities", [])
            }

            impacted_export_activities: List[Dict[str, Any]] = []
            for raw_activity in impacted_network_activities_df.to_dict("records"):
                pk = str(
                    raw_activity.get("activity_id_pk")
                    or raw_activity.get("activity_pk")
                    or ""
                )

                merged_activity = dict(raw_activity)
                calculated = calculated_by_pk.get(pk)

                if calculated:
                    # Calculated fields are authoritative for impacted XER dates
                    # and float. Source/P6 metadata remains in merged_activity.
                    merged_activity.update(calculated)
                    merged_activity["activity_id_pk"] = pk
                    merged_activity.pop("activity_pk", None)

                impacted_export_activities.append(merged_activity)

            result["_impacted_network_activities"] = impacted_export_activities
            result["_impacted_network_relationships"] = (
                impacted_network_relationships_df.to_dict("records")
            )

        return result

    def run_tia_event(
        self,
        *,
        event_id: str,
        event_name: str,
        duration_hours: float,
        effective_date: Optional[datetime],
        predecessor_activity_pks: List[str],
        successor_activity_pks: List[str],
        relationship_type: str = "FS",
        lag_hours: float = 0.0,
        calendar_id: Optional[str] = None,
        event: Optional[Dict[str, Any]] = None,
        include_schedule_snapshots: bool = False,
    ) -> Dict[str, Any]:
        """
        UI-oriented single-row TIA event wrapper supporting multiple predecessor
        and successor tie-ins. The underlying calculation is still the full
        run_tia_fragnet() network recalculation.
        """
        preds = [str(x).strip() for x in predecessor_activity_pks if str(x).strip()]
        succs = [str(x).strip() for x in successor_activity_pks if str(x).strip()]
        if not preds:
            raise CPMValidationError("TIA event requires at least one predecessor.")
        if not succs:
            raise CPMValidationError("TIA event requires at least one successor.")

        for node in preds + succs:
            if node not in self.graph:
                raise CPMValidationError(
                    f"TIA tie-in references unknown source activity: {node}"
                )

        inherited_calendar = (
            calendar_id
            or self.graph.nodes[preds[0]].get("calendar_id")
            or self.calendars.default_calendar_id
        )
        inherited_wbs_id = self.graph.nodes[preds[0]].get("wbs_id")
        inherited_wbs_path = self.graph.nodes[preds[0]].get("wbs_path")

        insertions: List[Dict[str, Any]] = []
        for pred in preds:
            insertions.append(
                {
                    "predecessor_activity_pk": pred,
                    "successor_activity_pk": event_id,
                    "relationship_type": relationship_type,
                    "lag_hrs": lag_hours,
                }
            )
        for succ in succs:
            insertions.append(
                {
                    "predecessor_activity_pk": event_id,
                    "successor_activity_pk": succ,
                    "relationship_type": relationship_type,
                    "lag_hrs": 0.0,
                }
            )

        # Source ties are not automatically removed for multiple tie-ins. That
        # decision must be explicit because removing existing logic can materially
        # change forensic results.
        return self.run_tia_fragnet(
            fragnet_id=event_id,
            fragnet_name=event_name,
            fragnet_activities=[
                {
                    "activity_id_pk": event_id,
                    "activity_id": event_id,
                    "activity_name": event_name,
                    "planned_duration_hrs": duration_hours,
                    "calendar_id": inherited_calendar,
                    "wbs_id": inherited_wbs_id,
                    "wbs_path": inherited_wbs_path,
                    "activity_type": "TT_Task",
                    "status": "TK_NOTSTART",
                }
            ],
            fragnet_relationships=[],
            insertion_relationships=insertions,
            remove_relationships=[],
            event=event,
            effective_date=effective_date,
            include_schedule_snapshots=include_schedule_snapshots,
        )


    def run_tia(
        self,
        *,
        fragnet_id: str,
        fragnet_name: str,
        duration_hours: float,
        predecessor_activity_pk: str,
        successor_activity_pk: str,
        relationship_type: str = "FS",
        lag_hours: float = 0.0,
        calendar_id: Optional[str] = None,
        include_schedule_snapshots: bool = False,
    ) -> Dict[str, Any]:
        """
        Backward-compatible single-activity TIA wrapper.

        New forensic workflows should call run_tia_fragnet() so an event can
        contain multiple activities and internal/tie-in logic.
        """
        return self.run_tia_fragnet(
            fragnet_id=fragnet_id,
            fragnet_name=fragnet_name,
            fragnet_activities=[
                {
                    "activity_id_pk": fragnet_id,
                    "activity_id": fragnet_id,
                    "activity_name": fragnet_name,
                    "planned_duration_hrs": duration_hours,
                    "calendar_id": (
                        (
                            calendar_id
                            if calendar_id
                            and str(calendar_id) != "24H"
                            else None
                        )
                        or self.graph.nodes[
                            predecessor_activity_pk
                        ].get("calendar_id")
                        or self.calendars.default_calendar_id
                    ),
                    "status": "TK_NOTSTART",
                }
            ],
            fragnet_relationships=[],
            insertion_relationships=[
                {
                    "predecessor_activity_pk": predecessor_activity_pk,
                    "successor_activity_pk": fragnet_id,
                    "relationship_type": relationship_type,
                    "lag_hrs": lag_hours,
                },
                {
                    "predecessor_activity_pk": fragnet_id,
                    "successor_activity_pk": successor_activity_pk,
                    "relationship_type": relationship_type,
                    "lag_hrs": 0.0,
                },
            ],
            remove_relationships=[
                {
                    "predecessor_activity_pk": predecessor_activity_pk,
                    "successor_activity_pk": successor_activity_pk,
                    "relationship_type": relationship_type,
                    "lag_hrs": 0.0,
                }
            ],
            include_schedule_snapshots=include_schedule_snapshots,
        )


    def network_fingerprint(self) -> str:
        """
        SHA-256 fingerprint of the normalized calculation network and options.
        Useful for reproducibility/audit trails; it is not a file hash.
        """
        nodes = []
        for node, data in sorted(
            self.graph.nodes(data=True),
            key=lambda x: str(x[0]),
        ):
            nodes.append(
                {
                    "activity_id_pk": str(node),
                    "activity_id": data.get("activity_id"),
                    "activity_name": data.get("activity_name"),
                    "duration_hours": data.get("duration_hours"),
                    "calendar_id": data.get("calendar_id"),
                    "status": data.get("status"),
                    "planned_start": str(data.get("planned_start") or ""),
                    "planned_finish": str(data.get("planned_finish") or ""),
                    "actual_start": str(data.get("actual_start") or ""),
                    "actual_finish": str(data.get("actual_finish") or ""),
                    "expected_finish": str(
                        data.get("expected_finish") or ""
                    ),
                    "primary_constraint_type": data.get(
                        "primary_constraint_type"
                    ),
                    "primary_constraint_date": str(
                        data.get("primary_constraint_date") or ""
                    ),
                    "secondary_constraint_type": data.get(
                        "secondary_constraint_type"
                    ),
                    "secondary_constraint_date": str(
                        data.get("secondary_constraint_date") or ""
                    ),
                }
            )

        edges = []
        for pred, succ, data in sorted(
            self.graph.edges(data=True),
            key=lambda x: (str(x[0]), str(x[1])),
        ):
            edges.append(
                {
                    "pred": str(pred),
                    "succ": str(succ),
                    "pred_link_id": data.get("pred_link_id"),
                    "type": data.get("rel_type"),
                    "lag_hours": data.get("lag_hours"),
                }
            )

        payload = {
            "nodes": nodes,
            "edges": edges,
            "data_date": (
                self.data_date.isoformat()
                if self.data_date else None
            ),
            "project_start": (
                self.project_start.isoformat()
                if self.project_start else None
            ),
            "project_finish_constraint": (
                self.project_finish_constraint.isoformat()
                if self.project_finish_constraint else None
            ),
            "options": {
                "progress_mode": self.options.progress_mode.value,
                "float_mode": self.options.float_mode.value,
                "critical_mode": self.options.critical_mode.value,
                "lag_calendar_mode": self.options.lag_calendar_mode.value,
                "use_expected_finish_dates": (
                    self.options.use_expected_finish_dates
                ),
                "make_open_ended_critical": (
                    self.options.make_open_ended_critical
                ),
                "ignore_external_relationships": (
                    self.options.ignore_external_relationships
                ),
                "calculate_multiple_float_paths": (
                    self.options.calculate_multiple_float_paths
                ),
                "multiple_float_path_mode": (
                    self.options.multiple_float_path_mode.value
                ),
                "multiple_float_path_count": (
                    self.options.multiple_float_path_count
                ),
                "multiple_float_path_end_activity": (
                    self.options.multiple_float_path_end_activity
                ),
                "level_resources": self.options.level_resources,
                "total_float_threshold_hours": (
                    self.options.total_float_threshold_hours
                ),
            },
        }
        encoded = json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        ).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def schedule_quality_report(self) -> Dict[str, Any]:
        self._ensure_scheduled()

        open_starts = [
            n for n in self.graph
            if self.graph.in_degree(n) == 0
        ]
        open_finishes = [
            n for n in self.graph
            if self.graph.out_degree(n) == 0
        ]

        negative_lags = []
        positive_lags = []
        non_fs_relationships = []
        for pred, succ, edge in self.graph.edges(data=True):
            lag = self._float(edge.get("lag_hours"), 0.0)
            item = {
                "predecessor_activity_pk": pred,
                "successor_activity_pk": succ,
                "relationship_type": edge.get("rel_type"),
                "lag_hours": lag,
            }
            if lag < 0:
                negative_lags.append(item)
            elif lag > 0:
                positive_lags.append(item)
            if edge.get("rel_type") != "FS":
                non_fs_relationships.append(item)

        constrained = []
        unmapped_constraints = []
        alap_constraints = []
        zero_duration = []
        negative_float = []
        actual_finish_without_start = []
        actual_dates_after_data_date = []

        for node, data in self.graph.nodes(data=True):
            state = self.states[node]
            constraint_types = [
                data.get("primary_constraint_type"),
                data.get("secondary_constraint_type"),
            ]
            if any(x for x in constraint_types if x):
                constrained.append(node)
                for ctype in constraint_types:
                    semantic = self._constraint_semantic(ctype)
                    if semantic == "UNMAPPED":
                        unmapped_constraints.append(
                            {"activity_pk": node, "constraint_type": ctype}
                        )
                    elif semantic == "AS_LATE_AS_POSSIBLE":
                        alap_constraints.append(
                            {"activity_pk": node, "constraint_type": ctype}
                        )
            if self._float(data.get("duration_hours"), 0.0) == 0.0:
                zero_duration.append(node)
            if state.total_float_hours < 0:
                negative_float.append(node)
            if data.get("actual_finish") and not data.get("actual_start"):
                actual_finish_without_start.append(node)
            if self.data_date:
                for field in ("actual_start", "actual_finish"):
                    value = data.get(field)
                    if value and value > self.data_date:
                        actual_dates_after_data_date.append(
                            {
                                "activity_pk": node,
                                "field": field,
                                "date": value.isoformat(),
                            }
                        )

        score = 100
        deductions = {
            "open_starts": min(len(open_starts), 10),
            "open_finishes": min(len(open_finishes), 10),
            "negative_lags": min(len(negative_lags) * 2, 10),
            "ignored_external_relationships": min(
                len(self.ignored_relationships) * 2, 10
            ),
            "actual_finish_without_start": min(
                len(actual_finish_without_start) * 3, 15
            ),
        }
        score = max(0, score - sum(deductions.values()))

        return {
            "quality_score": score,
            "quality_score_note": (
                "Diagnostic score for review prioritisation only; it is not "
                "a contractual or industry certification."
            ),
            "open_starts": open_starts,
            "open_finishes": open_finishes,
            "open_start_count": len(open_starts),
            "open_finish_count": len(open_finishes),
            "negative_lag_count": len(negative_lags),
            "negative_lags": negative_lags,
            "positive_lag_count": len(positive_lags),
            "non_fs_relationship_count": len(non_fs_relationships),
            "constraint_activity_count": len(constrained),
            "constrained_activity_pks": constrained,
            "unmapped_constraint_count": len(unmapped_constraints),
            "unmapped_constraints": unmapped_constraints,
            "alap_constraint_count": len(alap_constraints),
            "alap_constraints": alap_constraints,
            "alap_note": (
                "ALAP constraints are detected and disclosed. Exact P6 ALAP "
                "date placement remains subject to regression validation before "
                "being claimed as P6-equivalent."
            ),
            "zero_duration_activity_count": len(zero_duration),
            "negative_float_activity_count": len(negative_float),
            "negative_float_activity_pks": negative_float,
            "ignored_external_relationship_count": len(
                self.ignored_relationships
            ),
            "ignored_external_relationships": self.ignored_relationships,
            "actual_finish_without_start_count": len(
                actual_finish_without_start
            ),
            "actual_finish_without_start": actual_finish_without_start,
            "actual_dates_after_data_date_count": len(
                actual_dates_after_data_date
            ),
            "actual_dates_after_data_date": actual_dates_after_data_date,
            "deductions": deductions,
        }


    def dcma_14_point_assessment(
        self,
        *,
        workday_hours: float = 8.0,
        high_float_days: float = 44.0,
        high_duration_days: float = 44.0,
        critical_path_test_hours: float = 600.0,
    ) -> Dict[str, Any]:
        """
        Deterministic DCMA-style 14-point schedule assessment.

        Important:
        - This is an auditable ContractX implementation of the commonly used
          DCMA 14-point framework.
        - Metrics that require an approved baseline, contractual resource
          loading requirement, or a project finish constraint are reported as
          NOT_ASSESSED when the supplied programme does not support a defensible
          calculation.
        - Results are schedule-quality diagnostics, not contractual findings.
        """
        self._ensure_scheduled()

        eps = 1e-9
        total_activities = len(self.graph)
        total_relationships = self.graph.number_of_edges()
        high_float_hours = float(high_float_days) * float(workday_hours)
        high_duration_hours = float(high_duration_days) * float(workday_hours)

        def pct(num: int, den: int) -> Optional[float]:
            if den <= 0:
                return None
            return round((float(num) / float(den)) * 100.0, 4)

        def metric(
            number: int,
            name: str,
            *,
            numerator: Optional[float],
            denominator: Optional[float],
            value: Optional[float],
            unit: str,
            comparator: Optional[str],
            threshold: Optional[float],
            status: str,
            findings: Optional[List[Any]] = None,
            methodology_note: Optional[str] = None,
        ) -> Dict[str, Any]:
            return {
                "point": number,
                "name": name,
                "numerator": numerator,
                "denominator": denominator,
                "value": value,
                "unit": unit,
                "comparator": comparator,
                "threshold": threshold,
                "status": status,
                "findings": findings or [],
                "methodology_note": methodology_note,
            }

        def status_le(value: Optional[float], threshold: float) -> str:
            if value is None:
                return "NOT_ASSESSED"
            return "PASS" if value <= threshold + eps else "FAIL"

        def status_ge(value: Optional[float], threshold: float) -> str:
            if value is None:
                return "NOT_ASSESSED"
            return "PASS" if value + eps >= threshold else "FAIL"

        # ------------------------------------------------------------------
        # 1. Logic
        # ------------------------------------------------------------------
        # A defensible single-network implementation treats an activity as
        # open-ended when it lacks a predecessor or successor. The unavoidable
        # project start/finish endpoints are retained in the finding set rather
        # than silently excluded.
        open_logic = []
        for node in self.graph.nodes:
            if self.graph.in_degree(node) == 0 or self.graph.out_degree(node) == 0:
                open_logic.append(
                    {
                        "activity_pk": node,
                        "missing_predecessor": self.graph.in_degree(node) == 0,
                        "missing_successor": self.graph.out_degree(node) == 0,
                    }
                )
        logic_pct = pct(len(open_logic), total_activities)
        m1 = metric(
            1,
            "Logic",
            numerator=len(open_logic),
            denominator=total_activities,
            value=logic_pct,
            unit="percent",
            comparator="<=",
            threshold=5.0,
            status=status_le(logic_pct, 5.0),
            findings=open_logic,
            methodology_note=(
                "Activities missing at least one predecessor or successor. "
                "Project start/finish endpoints remain visible for analyst review."
            ),
        )

        # ------------------------------------------------------------------
        # 2. Leads / 3. Lags / 4. Relationship types
        # ------------------------------------------------------------------
        leads = []
        lags = []
        non_fs = []
        fs_count = 0
        for pred, succ, edge in self.graph.edges(data=True):
            lag = self._float(edge.get("lag_hours"), 0.0)
            rel_type = str(edge.get("rel_type") or "FS").upper()
            finding = {
                "predecessor_activity_pk": pred,
                "successor_activity_pk": succ,
                "relationship_type": rel_type,
                "lag_hours": lag,
            }
            if lag < 0:
                leads.append(finding)
            elif lag > 0:
                lags.append(finding)
            if rel_type == "FS":
                fs_count += 1
            else:
                non_fs.append(finding)

        leads_pct = pct(len(leads), total_relationships)
        lags_pct = pct(len(lags), total_relationships)
        fs_pct = pct(fs_count, total_relationships)

        m2 = metric(
            2, "Leads",
            numerator=len(leads), denominator=total_relationships,
            value=leads_pct, unit="percent", comparator="<=", threshold=0.0,
            status=status_le(leads_pct, 0.0), findings=leads,
            methodology_note="Negative relationship lag is treated as a lead."
        )
        m3 = metric(
            3, "Lags",
            numerator=len(lags), denominator=total_relationships,
            value=lags_pct, unit="percent", comparator="<=", threshold=5.0,
            status=status_le(lags_pct, 5.0), findings=lags,
            methodology_note="Positive relationship lag as a percentage of all relationships."
        )
        m4 = metric(
            4, "Relationship Types",
            numerator=fs_count, denominator=total_relationships,
            value=fs_pct, unit="percent_fs", comparator=">=", threshold=90.0,
            status=status_ge(fs_pct, 90.0), findings=non_fs,
            methodology_note="Finish-to-Start relationships as a percentage of all relationships."
        )

        # ------------------------------------------------------------------
        # 5. Hard constraints
        # ------------------------------------------------------------------
        hard_constraint_nodes = []
        hard_types = self.MUST_START | self.MUST_FINISH
        for node, data in self.graph.nodes(data=True):
            types = [
                str(data.get("primary_constraint_type") or "").upper(),
                str(data.get("secondary_constraint_type") or "").upper(),
            ]
            if any(t in hard_types for t in types if t):
                hard_constraint_nodes.append(
                    {
                        "activity_pk": node,
                        "primary_constraint_type": data.get("primary_constraint_type"),
                        "secondary_constraint_type": data.get("secondary_constraint_type"),
                    }
                )
        hard_pct = pct(len(hard_constraint_nodes), total_activities)
        m5 = metric(
            5, "Hard Constraints",
            numerator=len(hard_constraint_nodes), denominator=total_activities,
            value=hard_pct, unit="percent", comparator="<=", threshold=5.0,
            status=status_le(hard_pct, 5.0), findings=hard_constraint_nodes,
            methodology_note="Mandatory/Must Start and Mandatory/Must Finish constraints."
        )

        # ------------------------------------------------------------------
        # 6. High float / 7. Negative float / 8. High duration
        # ------------------------------------------------------------------
        high_float = []
        negative_float = []
        high_duration = []
        for node, state in self.states.items():
            data = self.graph.nodes[node]
            if state.total_float_hours > high_float_hours:
                high_float.append(
                    {
                        "activity_pk": node,
                        "total_float_hours": state.total_float_hours,
                        "threshold_hours": high_float_hours,
                    }
                )
            if state.total_float_hours < 0:
                negative_float.append(
                    {
                        "activity_pk": node,
                        "total_float_hours": state.total_float_hours,
                    }
                )
            duration = self._float(data.get("duration_hours"), state.duration_hours)
            if duration > high_duration_hours:
                high_duration.append(
                    {
                        "activity_pk": node,
                        "duration_hours": duration,
                        "threshold_hours": high_duration_hours,
                    }
                )

        high_float_pct = pct(len(high_float), total_activities)
        neg_float_pct = pct(len(negative_float), total_activities)
        high_duration_pct = pct(len(high_duration), total_activities)

        m6 = metric(
            6, "High Float",
            numerator=len(high_float), denominator=total_activities,
            value=high_float_pct, unit="percent", comparator="<=", threshold=5.0,
            status=status_le(high_float_pct, 5.0), findings=high_float,
            methodology_note=f"High float threshold = {high_float_days:g} working days."
        )
        m7 = metric(
            7, "Negative Float",
            numerator=len(negative_float), denominator=total_activities,
            value=neg_float_pct, unit="percent", comparator="<=", threshold=0.0,
            status=status_le(neg_float_pct, 0.0), findings=negative_float,
            methodology_note="Calculated total float below zero."
        )
        m8 = metric(
            8, "High Duration",
            numerator=len(high_duration), denominator=total_activities,
            value=high_duration_pct, unit="percent", comparator="<=", threshold=5.0,
            status=status_le(high_duration_pct, 5.0), findings=high_duration,
            methodology_note=f"High duration threshold = {high_duration_days:g} working days."
        )

        # ------------------------------------------------------------------
        # 9. Invalid dates
        # ------------------------------------------------------------------
        invalid_dates = []
        for node, data in self.graph.nodes(data=True):
            actual_start = data.get("actual_start")
            actual_finish = data.get("actual_finish")
            if actual_finish and not actual_start:
                invalid_dates.append(
                    {
                        "activity_pk": node,
                        "issue": "ACTUAL_FINISH_WITHOUT_ACTUAL_START",
                        "date": actual_finish.isoformat(),
                    }
                )
            if self.data_date:
                for field in ("actual_start", "actual_finish"):
                    value = data.get(field)
                    if value and value > self.data_date:
                        invalid_dates.append(
                            {
                                "activity_pk": node,
                                "issue": f"{field.upper()}_AFTER_DATA_DATE",
                                "date": value.isoformat(),
                                "data_date": self.data_date.isoformat(),
                            }
                        )
        invalid_pct = pct(len({x["activity_pk"] for x in invalid_dates}), total_activities)
        m9 = metric(
            9, "Invalid Dates",
            numerator=len({x["activity_pk"] for x in invalid_dates}),
            denominator=total_activities,
            value=invalid_pct, unit="percent", comparator="<=", threshold=0.0,
            status=status_le(invalid_pct, 0.0), findings=invalid_dates,
            methodology_note=(
                "Flags actual finish without actual start and actual dates after "
                "the schedule data date."
            ),
        )

        # ------------------------------------------------------------------
        # 10. Resources
        # ------------------------------------------------------------------
        resource_metric_status = "NOT_ASSESSED"
        unresourced = []
        resource_pct = None
        assigned_activity_ids = set()
        if self.assignments_df is not None and not self.assignments_df.empty:
            for col in ("activity_id_pk", "task_id", "activity_pk"):
                if col in self.assignments_df.columns:
                    assigned_activity_ids = {
                        str(x) for x in self.assignments_df[col].dropna().astype(str).tolist()
                    }
                    break
            if assigned_activity_ids:
                for node in self.graph.nodes:
                    data = self.graph.nodes[node]
                    activity_id = str(data.get("activity_id") or "")
                    if str(node) not in assigned_activity_ids and activity_id not in assigned_activity_ids:
                        unresourced.append(node)
                resource_pct = pct(len(unresourced), total_activities)
                resource_metric_status = "REVIEW"
        m10 = metric(
            10, "Resources",
            numerator=len(unresourced) if resource_pct is not None else None,
            denominator=total_activities if resource_pct is not None else None,
            value=resource_pct,
            unit="percent_unresourced",
            comparator=None,
            threshold=None,
            status=resource_metric_status,
            findings=unresourced,
            methodology_note=(
                "Resource loading is reported for analyst review. ContractX does "
                "not impose a pass/fail threshold because resource-loading "
                "requirements are project/contract specific."
            ),
        )

        # ------------------------------------------------------------------
        # 11. Missed tasks / 14. BEI
        # ------------------------------------------------------------------
        missed = []
        baseline_due = []
        baseline_completed = []
        if self.data_date:
            for node, data in self.graph.nodes(data=True):
                planned_finish = data.get("planned_finish")
                actual_finish = data.get("actual_finish")
                if planned_finish and planned_finish <= self.data_date:
                    baseline_due.append(node)
                    if actual_finish and actual_finish <= self.data_date:
                        baseline_completed.append(node)
                    else:
                        missed.append(
                            {
                                "activity_pk": node,
                                "planned_finish": planned_finish.isoformat(),
                                "actual_finish": actual_finish.isoformat() if actual_finish else None,
                            }
                        )

        missed_pct = pct(len(missed), len(baseline_due)) if baseline_due else None
        m11 = metric(
            11, "Missed Tasks",
            numerator=len(missed) if baseline_due else None,
            denominator=len(baseline_due) if baseline_due else None,
            value=missed_pct, unit="percent", comparator="<=", threshold=5.0,
            status=status_le(missed_pct, 5.0), findings=missed,
            methodology_note=(
                "Uses planned_finish as the baseline reference available in the "
                "supplied programme. If planned dates are not the approved "
                "baseline, analyst review is required."
            ),
        )

        # ------------------------------------------------------------------
        # 12. Critical Path Test
        # ------------------------------------------------------------------
        cp_test: Dict[str, Any] = {
            "test_hours": critical_path_test_hours,
            "tested_activity_pk": None,
            "original_project_finish": self.project_finish.isoformat() if self.project_finish else None,
            "test_project_finish": None,
            "measured_shift_work_hours": None,
        }
        cp_test_status = "NOT_ASSESSED"
        longest_path = self.extract_longest_path()
        if longest_path and self.project_finish:
            # Prefer the final non-complete activity on the longest path.
            candidates = []
            for item in longest_path:
                node = item.get("activity_pk") if isinstance(item, dict) else item
                if node is None or node not in self.graph:
                    continue
                status_value = str(self.graph.nodes[node].get("status") or "").upper()
                if status_value not in {"TK_COMPLETE", "COMPLETE"}:
                    candidates.append(str(node))
            if candidates and "activity_id_pk" in self.activities_df.columns:
                target = candidates[-1]
                clone_df = self.activities_df.copy(deep=True)
                mask = clone_df["activity_id_pk"].astype(str) == str(target)
                if mask.any():
                    for duration_col in ("remaining_duration_hrs", "planned_duration_hrs"):
                        if duration_col in clone_df.columns:
                            clone_df.loc[mask, duration_col] = (
                                pd.to_numeric(clone_df.loc[mask, duration_col], errors="coerce").fillna(0)
                                + float(critical_path_test_hours)
                            )
                    try:
                        test_engine = CPMEngine(
                            activities_df=clone_df,
                            relationships_df=self.relationships_df.copy(deep=True),
                            calendars=copy.deepcopy(self.calendars),
                            options=copy.deepcopy(self.options),
                            data_date=self.data_date,
                            project_start=self.project_start,
                            project_finish_constraint=self.project_finish_constraint,
                            resources_df=self.resources_df.copy(deep=True),
                            assignments_df=self.assignments_df.copy(deep=True),
                        )
                        test_engine.schedule()
                        cp_test["tested_activity_pk"] = target
                        cp_test["test_project_finish"] = (
                            test_engine.project_finish.isoformat()
                            if test_engine.project_finish else None
                        )
                        if test_engine.project_finish and self.project_finish:
                            cal = self._calendar_for(target)
                            shift = cal.work_hours_between(
                                self.project_finish,
                                test_engine.project_finish,
                            )
                            cp_test["measured_shift_work_hours"] = shift
                            ratio = shift / float(critical_path_test_hours) if critical_path_test_hours else 0.0
                            cp_test["response_ratio"] = ratio
                            cp_test_status = "PASS" if ratio >= 0.95 else "FAIL"
                    except Exception as exc:
                        cp_test["error"] = str(exc)
        m12 = metric(
            12, "Critical Path Test",
            numerator=cp_test.get("measured_shift_work_hours"),
            denominator=critical_path_test_hours,
            value=cp_test.get("response_ratio"),
            unit="response_ratio",
            comparator=">=",
            threshold=0.95,
            status=cp_test_status,
            findings=[cp_test],
            methodology_note=(
                "Adds a deterministic test duration to a non-complete longest-path "
                "activity and measures the resulting project-finish movement."
            ),
        )

        # ------------------------------------------------------------------
        # 13. Critical Path Length Index (CPLI)
        # ------------------------------------------------------------------
        cpli = None
        cpli_status = "NOT_ASSESSED"
        cpli_detail: Dict[str, Any] = {}
        if self.project_finish_constraint and self.project_finish and longest_path:
            path_hours = 0.0
            for item in longest_path:
                node = item.get("activity_pk") if isinstance(item, dict) else item
                if node in self.states:
                    path_hours += max(0.0, self.states[node].duration_hours)
            terminal = longest_path[-1]
            terminal_node = terminal.get("activity_pk") if isinstance(terminal, dict) else terminal
            total_float_hours = (
                self.states[terminal_node].total_float_hours
                if terminal_node in self.states else 0.0
            )
            if path_hours > 0:
                cpli = (path_hours + total_float_hours) / path_hours
                cpli_status = status_ge(cpli, 0.95)
                cpli_detail = {
                    "critical_path_length_hours": path_hours,
                    "terminal_total_float_hours": total_float_hours,
                    "project_finish_constraint": self.project_finish_constraint.isoformat(),
                }
        m13 = metric(
            13, "Critical Path Length Index (CPLI)",
            numerator=(cpli_detail.get("critical_path_length_hours", 0.0) + cpli_detail.get("terminal_total_float_hours", 0.0))
                if cpli is not None else None,
            denominator=cpli_detail.get("critical_path_length_hours") if cpli is not None else None,
            value=round(cpli, 6) if cpli is not None else None,
            unit="index", comparator=">=", threshold=0.95,
            status=cpli_status,
            findings=[cpli_detail] if cpli_detail else [],
            methodology_note=(
                "CPLI is only assessed when a project finish constraint is supplied; "
                "otherwise it is not treated as meaningful."
            ),
        )

        bei = (
            float(len(baseline_completed)) / float(len(baseline_due))
            if baseline_due else None
        )
        m14 = metric(
            14, "Baseline Execution Index (BEI)",
            numerator=len(baseline_completed) if baseline_due else None,
            denominator=len(baseline_due) if baseline_due else None,
            value=round(bei, 6) if bei is not None else None,
            unit="index", comparator=">=", threshold=0.95,
            status=status_ge(bei, 0.95),
            findings=missed,
            methodology_note=(
                "Activities planned to finish on/before the data date are compared "
                "with activities actually finished on/before the data date. The "
                "planned_finish field must represent the accepted baseline for a "
                "strict baseline execution interpretation."
            ),
        )

        metrics = [m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14]
        assessed = [m for m in metrics if m["status"] not in {"NOT_ASSESSED", "REVIEW"}]
        passed = [m for m in assessed if m["status"] == "PASS"]
        failed = [m for m in assessed if m["status"] == "FAIL"]

        return {
            "framework": "DCMA 14-Point Schedule Assessment",
            "implementation": "ContractX deterministic auditable implementation",
            "assessment_scope": {
                "activity_count": total_activities,
                "relationship_count": total_relationships,
                "data_date": self.data_date.isoformat() if self.data_date else None,
                "workday_hours": workday_hours,
                "high_float_days": high_float_days,
                "high_duration_days": high_duration_days,
                "critical_path_test_hours": critical_path_test_hours,
            },
            "summary": {
                "points_total": 14,
                "points_assessed": len(assessed),
                "points_passed": len(passed),
                "points_failed": len(failed),
                "points_not_assessed_or_review": 14 - len(assessed),
                "failed_points": [m["point"] for m in failed],
                "overall_status": (
                    "REVIEW_REQUIRED" if failed else
                    "PASS_WITH_LIMITATIONS" if len(assessed) < 14 else
                    "PASS"
                ),
            },
            "metrics": metrics,
            "limitations": [
                (
                    "DCMA-style thresholds are schedule-quality screening criteria; "
                    "they are not contractual entitlement tests."
                ),
                (
                    "Missed Tasks and BEI depend on planned_finish representing a "
                    "defensible approved baseline."
                ),
                (
                    "Resource loading is reported for review rather than forced into "
                    "a universal pass/fail criterion."
                ),
                (
                    "CPLI is not assessed without a project finish constraint."
                ),
            ],
        }

    def forensic_schedule_assessment(self) -> Dict[str, Any]:
        """
        Single heavy Engine 2 schedule assessment object.

        This deliberately consolidates schedule integrity, DCMA-style checks,
        CPM/path analytics and ContractX advanced diagnostics into one report
        payload rather than creating separate product deliverables.
        """
        schedule_result = self.schedule()
        quality = self.schedule_quality_report()
        dcma = self.dcma_14_point_assessment()

        path_activities = [
            a for a in schedule_result.get("activities", [])
            if a.get("is_longest_path") or a.get("float_path") is not None
        ]

        exception_activity_pks = set()
        for key in (
            "open_starts",
            "open_finishes",
            "constrained_activity_pks",
            "negative_float_activity_pks",
            "actual_finish_without_start",
        ):
            value = quality.get(key, [])
            for item in value:
                if isinstance(item, dict):
                    pk = item.get("activity_pk")
                else:
                    pk = item
                if pk is not None:
                    exception_activity_pks.add(str(pk))

        exception_activities = [
            a for a in schedule_result.get("activities", [])
            if str(a.get("activity_pk")) in exception_activity_pks
        ]

        return {
            "report_type": "FORENSIC_SCHEDULE_ASSESSMENT",
            "engine_version": "4.1-heavy-deliverable",
            "calculation_mode": "deterministic",
            "executive_summary": {
                "project_start": schedule_result.get("project_start"),
                "project_finish": schedule_result.get("project_finish"),
                "data_date": schedule_result.get("data_date"),
                "network_fingerprint": schedule_result.get("network_fingerprint"),
                "activity_count": len(schedule_result.get("activities", [])),
                "relationship_count": self.graph.number_of_edges(),
                "dcma_status": dcma.get("summary", {}).get("overall_status"),
                "dcma_failed_points": dcma.get("summary", {}).get("failed_points", []),
                "quality_score": quality.get("quality_score"),
            },
            "schedule_integrity": {
                "network_validation": schedule_result.get("network_validation"),
                "network_fingerprint": schedule_result.get("network_fingerprint"),
                "scheduling_options": schedule_result.get("scheduling_options"),
            },
            "dcma_14_point": dcma,
            "advanced_diagnostics": quality,
            "cpm_and_path_analysis": {
                "longest_path": schedule_result.get("longest_path", []),
                "multiple_float_paths": schedule_result.get("multiple_float_paths", []),
                "path_activities": path_activities,
            },
            "exception_activity_register": exception_activities,
            "audit": {
                "deterministic": True,
                "llm_used_for_cpm_arithmetic": False,
                "network_fingerprint": schedule_result.get("network_fingerprint"),
            },
            "limitations": [
                (
                    "This assessment reports deterministic schedule facts and "
                    "schedule-quality findings only."
                ),
                (
                    "Entitlement, responsibility, excusability, compensability, "
                    "concurrency, damages and legal liability require separate "
                    "contract/legal/evidence analysis."
                ),
            ],
        }

    def build_forensic_event_model(
        self,
        event: Dict[str, Any],
        *,
        affected_activity_ids: Optional[List[str]] = None,
        impacted_result: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Build a schedule-fact event record without making a legal entitlement
        or responsibility determination.
        """
        self._ensure_scheduled()
        requested = {
            str(x) for x in (affected_activity_ids or [])
        }

        affected = []
        for node, data in self.graph.nodes(data=True):
            activity_id = str(data.get("activity_id") or "")
            if requested and (
                str(node) not in requested
                and activity_id not in requested
            ):
                continue

            state = self.states[node]
            affected.append(
                {
                    "activity_pk": node,
                    "activity_id": data.get("activity_id"),
                    "activity_name": data.get("activity_name"),
                    "is_longest_path": state.is_longest_path,
                    "total_float_hours": state.total_float_hours,
                    "free_float_hours": state.free_float_hours,
                    "early_start": (
                        state.early_start.isoformat()
                        if state.early_start else None
                    ),
                    "early_finish": (
                        state.early_finish.isoformat()
                        if state.early_finish else None
                    ),
                }
            )

        return {
            "event_id": event.get("event_id"),
            "event_title": event.get("event_title")
                or event.get("title"),
            "description": event.get("description"),
            "event_start": event.get("event_start"),
            "event_end": event.get("event_end"),
            "notice_date": event.get("notice_date"),
            "cause_category": event.get("cause_category"),
            "responsibility_category": event.get(
                "responsibility_category"
            ),
            "delay_type": event.get("delay_type"),
            "mitigation": event.get("mitigation"),
            "evidence_refs": event.get("evidence_refs", []),
            "affected_activities": affected,
            "affected_activity_count": len(affected),
            "tia_result": impacted_result,
            "schedule_fact_statement": (
                "Event modelling records schedule facts and evidence links. "
                "Contractual entitlement, responsibility, compensability and "
                "legal concurrency require separate contract/legal analysis."
            ),
        }


    def _ensure_scheduled(self) -> None:
        """Ensure schedule() has been run prior to querying calculated states."""
        if not self.states:
            self.schedule()



    def _activity_result(self, node: str) -> Dict[str, Any]:
        s = self.states[node]
        d = self.graph.nodes[node]

        if self.options.critical_mode == CriticalMode.LONGEST_PATH:
            critical = s.is_longest_path
        else:
            critical = (
                s.total_float_hours
                <= self.options.total_float_threshold_hours
            )

        if self.options.make_open_ended_critical and (
            self.graph.in_degree(node) == 0
            or self.graph.out_degree(node) == 0
        ):
            critical = True

        driving_predecessors = []
        for pred in self.graph.predecessors(node):
            gap = self._relationship_gap_hours(pred, node)
            if abs(gap) < 1e-6:
                driving_predecessors.append(pred)

        return {
            "activity_pk": node,
            "activity_id": d.get("activity_id"),
            "activity_name": d.get("activity_name"),
            "activity_type": d.get("activity_type"),
            "activity_type_raw": d.get("activity_type_raw"),
            "activity_type_normalized": d.get("activity_type_normalized"),
            "wbs_id": d.get("wbs_id"),
            "parent_wbs_id": d.get("parent_wbs_id"),
            "wbs_code": d.get("wbs_code"),
            "wbs_name": d.get("wbs_name"),
            "wbs_path": d.get("wbs_path"),
            "wbs_sequence_number": d.get("wbs_sequence_number"),
            "wbs_source_row_sequence": d.get("wbs_source_row_sequence"),
            "activity_sequence": d.get("activity_sequence"),
            "source_row_sequence": d.get("source_row_sequence"),
            "is_start_milestone": self._is_start_milestone(node),
            "is_finish_milestone": self._is_finish_milestone(node),
            "is_terminal_activity": self.graph.out_degree(node) == 0,
            "is_project_finish_node": node == self.project_finish_node,
            "status": d.get("status"),
            "calendar_id": d.get("calendar_id"),
            "duration_hours": s.duration_hours,
            "early_start": (
                s.early_start.isoformat()
                if s.early_start else None
            ),
            "early_finish": (
                s.early_finish.isoformat()
                if s.early_finish else None
            ),
            "late_start": (
                s.late_start.isoformat()
                if s.late_start else None
            ),
            "late_finish": (
                s.late_finish.isoformat()
                if s.late_finish else None
            ),
            "total_float_hours": s.total_float_hours,
            "free_float_hours": s.free_float_hours,
            "is_critical": critical,
            "is_longest_path": s.is_longest_path,
            "float_path": s.float_path,
            "float_path_order": s.float_path_order,
            "predecessor_count": self.graph.in_degree(node),
            "successor_count": self.graph.out_degree(node),
            "driving_predecessor_pks": driving_predecessors,
            "planned_start": (
                d.get("planned_start").isoformat()
                if d.get("planned_start") else None
            ),
            "planned_finish": (
                d.get("planned_finish").isoformat()
                if d.get("planned_finish") else None
            ),
            "actual_start": (
                d.get("actual_start").isoformat()
                if d.get("actual_start") else None
            ),
            "actual_finish": (
                d.get("actual_finish").isoformat()
                if d.get("actual_finish") else None
            ),
            "expected_finish": (
                d.get("expected_finish").isoformat()
                if d.get("expected_finish") else None
            ),
            "primary_constraint_type": d.get(
                "primary_constraint_type"
            ),
            "primary_constraint_date": (
                d.get("primary_constraint_date").isoformat()
                if d.get("primary_constraint_date") else None
            ),
            "secondary_constraint_type": d.get(
                "secondary_constraint_type"
            ),
            "secondary_constraint_date": (
                d.get("secondary_constraint_date").isoformat()
                if d.get("secondary_constraint_date") else None
            ),
            "constraint_diagnostics": self._constraint_diagnostics_for(node),
        }


    def activity_results(self) -> List[Dict[str, Any]]:

        self._ensure_scheduled()

        return [self._activity_result(n) for n in nx.topological_sort(self.graph)]



    def summary(self) -> Dict[str, Any]:
        self._ensure_scheduled()
        return {
            "engine_version": "5.0-forensic-p6-fidelity",
            "calculation_mode": "deterministic",
            "project_start": self.project_start.isoformat(),
            "project_finish": (
                self.project_finish.isoformat()
                if self.project_finish else None
            ),
            "project_finish_activity_pk": self.project_finish_node,
            "project_finish_activity_id": (
                self.graph.nodes[self.project_finish_node].get("activity_id")
                if self.project_finish_node in self.graph
                else None
            ),
            "data_date": (
                self.data_date.isoformat()
                if self.data_date else None
            ),
            "network_validation": self.validate_network(),
            "quality": self.schedule_quality_report(),
            "longest_path": self.extract_longest_path(),
            "multiple_float_paths": self._multiple_float_paths,
            "activities": self.activity_results(),
            "network_fingerprint": self.network_fingerprint(),
            "scheduling_options": {
                "progress_mode": self.options.progress_mode.value,
                "float_mode": self.options.float_mode.value,
                "critical_mode": self.options.critical_mode.value,
                "lag_calendar_mode": (
                    self.options.lag_calendar_mode.value
                ),
                "use_expected_finish_dates": (
                    self.options.use_expected_finish_dates
                ),
                "make_open_ended_critical": (
                    self.options.make_open_ended_critical
                ),
                "ignore_external_relationships": (
                    self.options.ignore_external_relationships
                ),
                "calculate_multiple_float_paths": (
                    self.options.calculate_multiple_float_paths
                ),
                "multiple_float_path_mode": (
                    self.options.multiple_float_path_mode.value
                ),
                "multiple_float_path_count": (
                    self.options.multiple_float_path_count
                ),
                "multiple_float_path_end_activity": (
                    self.options.multiple_float_path_end_activity
                ),
                "level_resources": self.options.level_resources,
                "preserve_scheduled_early_late_dates": (
                    self.options.preserve_scheduled_early_late_dates
                ),
                "total_float_threshold_hours": (
                    self.options.total_float_threshold_hours
                ),
            },
            "forensic_output_notes": [
                (
                    "Engine calculations are deterministic and auditable; "
                    "no LLM is used for CPM arithmetic."
                ),
                (
                    "Schedule findings do not by themselves determine "
                    "contractual entitlement, responsibility, compensability, "
                    "excusability or legal concurrency."
                ),
                (
                    "Calendar accuracy depends on the calendar definitions "
                    "supplied by the parser/registry."
                ),
            ],
        }

