"""Dashboard days and months follow hospital time (Africa/Nairobi), not UTC."""

from datetime import date, time, timedelta, timezone

from app.admin.service import dashboard_summary
from app.common.enums import AppointmentSource, AppointmentStatus
from app.common.time import hospital_local_datetime
from app.extensions import db
from tests.test_admin_views import _create_appointment

DAY = date(2026, 3, 10)


def _utc(day, hour, minute=0):
    # Stored in UTC like the app does; 00:30 Nairobi is 21:30 UTC the day before.
    return hospital_local_datetime(day, time(hour, minute)).astimezone(timezone.utc)


def test_early_morning_appointment_counts_as_today(app, ids):
    early = _create_appointment(
        ids,
        scheduled_start=_utc(DAY, 0, 30),
        scheduled_end=_utc(DAY, 1),
        status=AppointmentStatus.SCHEDULED,
        source=AppointmentSource.RECEPTION,
    )
    _create_appointment(  # 23:30 the evening before: yesterday, not today
        ids,
        scheduled_start=_utc(DAY - timedelta(days=1), 23, 30),
        scheduled_end=_utc(DAY, 0),
        status=AppointmentStatus.SCHEDULED,
        source=AppointmentSource.RECEPTION,
    )
    db.session.commit()

    summary = dashboard_summary(today=DAY)
    cards = summary["stat_cards"] if "stat_cards" in summary else summary["stats"]
    assert cards["appointments_today"]["value"] == 1
    schedule_ids = [item["id"] for item in summary["today_schedule"]]
    assert schedule_ids == [str(early.id)]


def test_month_revenue_uses_the_hospital_month(app, ids, client, tokens):
    from app.billing.models import Transaction
    from tests.helpers import create_invoice_flow

    _, _, invoice = create_invoice_flow(client, tokens, ids)
    # 00:30 on 1 March in Nairobi is still 28 February in UTC.
    first_of_month = date(2026, 3, 1)
    from uuid import UUID

    from app.common.enums import PaymentMethod, TransactionStatus

    transaction = Transaction(
        invoice_id=UUID(invoice["id"]),
        method=PaymentMethod.CASH,
        amount_minor=12345,
        currency="KES",
        status=TransactionStatus.SUCCESS,
        reference="EARLY-MARCH",
        paid_at=_utc(first_of_month, 0, 30),
    )
    db.session.add(transaction)
    db.session.commit()

    summary = dashboard_summary(today=DAY)
    split = {row["method"]: row["amount_minor"] for row in summary["payment_split"]}
    assert split["CASH"] >= 12345
    march = [row for row in summary["revenue_trend"]["by_method"] if row["month"] == "2026-03"]
    assert march and march[0]["CASH"] >= 12345
