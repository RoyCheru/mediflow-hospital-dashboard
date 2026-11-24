"""Admin report, audit and visit date filters: hospital days, and 400 on bad input."""

from datetime import date, time, timezone
from uuid import UUID

import pytest

from app.common.enums import PaymentMethod, TransactionStatus
from app.common.time import hospital_local_datetime
from app.extensions import db
from tests.helpers import auth, create_invoice_flow


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/reports/revenue?start_date=31-12-2026",
        "/api/v1/reports/claims?end_date=yesterday",
        "/api/v1/reports/doctor-workload?start_date=2026/01/01",
        "/api/v1/reports/no-shows?end_date=x",
        "/api/v1/admin/audit-events?start_date=01-01-2026",
        "/api/v1/admin/visits?date_from=2026-13-01",
    ],
)
def test_malformed_dates_return_400_not_500(client, tokens, path):
    response = client.get(path, headers=auth(tokens["admin"]))
    assert response.status_code == 400, response.get_json()
    assert response.get_json()["error"]["message"] == "Invalid date"


def test_revenue_report_counts_an_early_morning_payment_on_its_hospital_day(client, tokens, ids):
    from app.billing.models import Transaction

    _, _, invoice = create_invoice_flow(client, tokens, ids)
    day = date(2026, 4, 2)
    # 01:00 in Nairobi is 22:00 UTC on 1 April: it belongs to 2 April.
    paid_at = hospital_local_datetime(day, time(1, 0)).astimezone(timezone.utc)
    db.session.add(
        Transaction(
            invoice_id=UUID(invoice["id"]),
            method=PaymentMethod.CASH,
            amount_minor=4321,
            currency="KES",
            status=TransactionStatus.SUCCESS,
            reference="EARLY-APRIL",
            paid_at=paid_at,
        )
    )
    db.session.commit()

    def total(start, end):
        response = client.get(
            f"/api/v1/reports/revenue?start_date={start}&end_date={end}",
            headers=auth(tokens["admin"]),
        )
        assert response.status_code == 200
        return response.get_json()["data"]["total_minor"]

    assert total("2026-04-02", "2026-04-02") == 4321
    assert total("2026-04-01", "2026-04-01") == 0
