from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class ProgressMode(str, Enum):
    RETAINED_LOGIC = "retained_logic"
    PROGRESS_OVERRIDE = "progress_override"
    ACTUAL_DATES = "actual_dates"


class FloatMode(str, Enum):
    START_FLOAT = "start_float"
    FINISH_FLOAT = "finish_float"
    SMALLEST = "smallest"


class CriticalMode(str, Enum):
    TOTAL_FLOAT = "total_float"
    LONGEST_PATH = "longest_path"


class LagCalendarMode(str, Enum):
    PREDECESSOR = "predecessor"
    SUCCESSOR = "successor"
    PROJECT_DEFAULT = "project_default"
    HOURS_24 = "24_hour"


class MultipleFloatPathMode(str, Enum):
    TOTAL_FLOAT = "total_float"
    FREE_FLOAT = "free_float"


@dataclass
class SchedulingOptions:
    progress_mode: ProgressMode = ProgressMode.RETAINED_LOGIC
    float_mode: FloatMode = FloatMode.FINISH_FLOAT
    critical_mode: CriticalMode = CriticalMode.LONGEST_PATH
    lag_calendar_mode: LagCalendarMode = LagCalendarMode.PREDECESSOR

    use_expected_finish_dates: bool = True
    make_open_ended_critical: bool = False
    ignore_external_relationships: bool = True

    calculate_multiple_float_paths: bool = True
    multiple_float_path_mode: MultipleFloatPathMode = MultipleFloatPathMode.FREE_FLOAT
    multiple_float_path_count: int = 5
    multiple_float_path_end_activity: Optional[str] = None

    level_resources: bool = False
    preserve_scheduled_early_late_dates: bool = True

    total_float_threshold_hours: float = 0.0
