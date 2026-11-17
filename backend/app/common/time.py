from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from flask import current_app

from app.common.base import utcnow


def hospital_timezone_name() -> str:
    return current_app.config.get("HOSPITAL_TIMEZONE", "Africa/Nairobi")


def hospital_tz() -> ZoneInfo:
    return ZoneInfo(hospital_timezone_name())


def hospital_today(now: datetime | None = None) -> date:
    return (now or utcnow()).astimezone(hospital_tz()).date()


def hospital_day_bounds(target_date: date) -> tuple[datetime, datetime]:
    tz = hospital_tz()
    start_local = datetime.combine(target_date, time.min, tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def hospital_local_datetime(target_date: date, local_time: time) -> datetime:
    return datetime.combine(target_date, local_time, tzinfo=hospital_tz())
