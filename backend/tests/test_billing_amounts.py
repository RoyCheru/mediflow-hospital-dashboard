"""Phase B: correct invoice amounts, payer reassignment and discounts."""

from datetime import timedelta
from uuid import UUID

from app.common.base import utcnow
from app.extensions import db
from app.scheduling.models import ServicePrice
from tests.helpers import auth, create_invoice_flow, create_visit_flow


def _invoice_for(client, tokens, visit_id, body=None):
    return client.post(
        f"/api/v1/visits/{visit_id}/invoices",
        json=body or {},
        headers=auth(tokens["reception"]),
    )


def test_default_invoice_bills_the_consultation_once_from_the_price_list(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    assert len(invoice["lines"]) == 1
    line = invoice["lines"][0]
    assert line["description"] == "General consultation"
    assert line["service_id"] == str(ids["service_id"])
    assert line["unit_price_minor"] == 500000
    assert invoice["total_minor"] == 500000


def test_doctor_fee_is_the_default_price_when_the_service_has_no_price(client, tokens, ids):
    price = ServicePrice.query.filter_by(service_id=ids["service_id"]).one()
    price.effective_to = utcnow() - timedelta(seconds=1)
    db.session.commit()

    _, visit = create_visit_flow(client, tokens, ids)
    response = _invoice_for(client, tokens, visit["id"])
    assert response.status_code == 201, response.get_json()
    invoice = response.get_json()["data"]
    assert len(invoice["lines"]) == 1
    assert invoice["lines"][0]["service_id"] == str(ids["service_id"])
    assert invoice["lines"][0]["unit_price_minor"] == 250000  # doctor's consultation fee
    assert invoice["total_minor"] == 250000


def test_explicit_items_are_billed_as_given(client, tokens, ids):
    _, visit = create_visit_flow(client, tokens, ids)
    response = _invoice_for(
        client,
        tokens,
        visit["id"],
        {"items": [{"description": "Dressing", "quantity": 2, "unit_price_minor": 30000}]},
    )
    assert response.status_code == 201, response.get_json()
    invoice = response.get_json()["data"]
    assert [line["description"] for line in invoice["lines"]] == ["Dressing"]
    assert invoice["total_minor"] == 60000
    assert UUID(invoice["id"])
