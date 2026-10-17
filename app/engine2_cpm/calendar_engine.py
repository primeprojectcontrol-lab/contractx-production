from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Dict, Iterable, List, Optional, Tuple


Interval = Tuple[time, time]


@dataclass
class WorkCalendar:
    calendar_id: str
    name: str = ""
    weekly_intervals: Dict[int, List[Interval]] = field(default_factory=dict)
    holidays: set[date] = field(default_factory=set)
    exceptions: Dict[date, List[Interval]] = field(default_factory=dict)

    @classmethod
    def standard_8h(cls, calendar_id: str = "DEFAULT", name: str = "5d x 8h"):
        intervals = {
            0: [(time(8, 0), time(12, 0)), (time(13, 0), time(17, 0))],
            1: [(time(8, 0), time(12, 0)), (time(13, 0), time(17, 0))],
            2: [(time(8, 0), time(12, 0)), (time(13, 0), time(17, 0))],
            3: [(time(8, 0), time(12, 0)), (time(13, 0), time(17, 0))],
            4: [(time(8, 0), time(12, 0)), (time(13, 0), time(17, 0))],
        }
        return cls(calendar_id=calendar_id, name=name, weekly_intervals=intervals)

    @classmethod
    def continuous_24h(cls, calendar_id: str = "24H", name: str = "24x7"):
        intervals = {i: [(time(0, 0), time(23, 59, 59, 999999))] for i in range(7)}
        return cls(calendar_id=calendar_id, name=name, weekly_intervals=intervals)

    def intervals_for_date(self, d: date) -> List[Interval]:
        if d in self.exceptions:
            return self.exceptions[d]
        if d in self.holidays:
            return []
        return self.weekly_intervals.get(d.weekday(), [])

    def is_working_time(self, dt: datetime) -> bool:
        for start, end in self.intervals_for_date(dt.date()):
            if start <= dt.time() < end:
                return True
        return False

    def next_work_time(self, dt: datetime) -> datetime:
        current = dt
        for _ in range(3700):
            intervals = self.intervals_for_date(current.date())
            for start, end in intervals:
                start_dt = datetime.combine(current.date(), start)
                end_dt = datetime.combine(current.date(), end)
                if current <= start_dt:
                    return start_dt
                if start_dt <= current < end_dt:
                    return current
            current = datetime.combine(current.date() + timedelta(days=1), time(0, 0))
        raise RuntimeError("Unable to locate next working period.")

    def previous_work_time(self, dt: datetime) -> datetime:
        current = dt
        for _ in range(3700):
            intervals = list(reversed(self.intervals_for_date(current.date())))
            for start, end in intervals:
                start_dt = datetime.combine(current.date(), start)
                end_dt = datetime.combine(current.date(), end)
                if current >= end_dt:
                    return end_dt
                if start_dt < current <= end_dt:
                    return current
            prev_date = current.date() - timedelta(days=1)
            current = datetime.combine(prev_date, time(23, 59, 59, 999999))
        raise RuntimeError("Unable to locate previous working period.")

    def add_work_hours(self, start: datetime, hours: float) -> datetime:
        if hours < 0:
            return self.subtract_work_hours(start, -hours)
        if hours == 0:
            return self.next_work_time(start)

        remaining = hours * 3600.0
        current = self.next_work_time(start)

        while remaining > 1e-6:
            intervals = self.intervals_for_date(current.date())
            progressed = False

            for interval_start, interval_end in intervals:
                start_dt = datetime.combine(current.date(), interval_start)
                end_dt = datetime.combine(current.date(), interval_end)

                if current < start_dt:
                    current = start_dt

                if start_dt <= current < end_dt:
                    available = (end_dt - current).total_seconds()
                    consume = min(available, remaining)
                    current += timedelta(seconds=consume)
                    remaining -= consume
                    progressed = True
                    if remaining <= 1e-6:
                        return current

            if remaining > 1e-6:
                current = self.next_work_time(
                    datetime.combine(current.date() + timedelta(days=1), time(0, 0))
                )
            elif not progressed:
                current = self.next_work_time(current + timedelta(seconds=1))

        return current

    def subtract_work_hours(self, finish: datetime, hours: float) -> datetime:
        if hours < 0:
            return self.add_work_hours(finish, -hours)
        if hours == 0:
            return self.previous_work_time(finish)

        remaining = hours * 3600.0
        current = self.previous_work_time(finish)

        while remaining > 1e-6:
            intervals = list(reversed(self.intervals_for_date(current.date())))
            progressed = False

            for interval_start, interval_end in intervals:
                start_dt = datetime.combine(current.date(), interval_start)
                end_dt = datetime.combine(current.date(), interval_end)

                if current > end_dt:
                    current = end_dt

                if start_dt < current <= end_dt:
                    available = (current - start_dt).total_seconds()
                    consume = min(available, remaining)
                    current -= timedelta(seconds=consume)
                    remaining -= consume
                    progressed = True
                    if remaining <= 1e-6:
                        return current

            if remaining > 1e-6:
                prev = current.date() - timedelta(days=1)
                current = self.previous_work_time(
                    datetime.combine(prev, time(23, 59, 59, 999999))
                )
            elif not progressed:
                current = self.previous_work_time(current - timedelta(seconds=1))

        return current

    def work_hours_between(self, start: datetime, finish: datetime) -> float:
        if finish == start:
            return 0.0
        if finish < start:
            return -self.work_hours_between(finish, start)

        total = 0.0
        current_date = start.date()
        while current_date <= finish.date():
            for interval_start, interval_end in self.intervals_for_date(current_date):
                a = max(start, datetime.combine(current_date, interval_start))
                b = min(finish, datetime.combine(current_date, interval_end))
                if b > a:
                    total += (b - a).total_seconds() / 3600.0
            current_date += timedelta(days=1)
        return total


class CalendarRegistry:
    def __init__(
        self,
        calendars: Optional[Dict[str, WorkCalendar]] = None,
        default_calendar_id: str = "DEFAULT",
    ):
        self.calendars = calendars or {}
        self.default_calendar_id = default_calendar_id

        if default_calendar_id not in self.calendars:
            self.calendars[default_calendar_id] = WorkCalendar.standard_8h(default_calendar_id)
        if "24H" not in self.calendars:
            self.calendars["24H"] = WorkCalendar.continuous_24h()

    def get(self, calendar_id: Optional[str]) -> WorkCalendar:
        if calendar_id and str(calendar_id) in self.calendars:
            return self.calendars[str(calendar_id)]
        return self.calendars[self.default_calendar_id]
