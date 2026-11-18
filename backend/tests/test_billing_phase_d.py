"""Phase D: draft encounter bills, line edits and finalization."""

from uuid import UUID

from app.billing.models import Invoice
from app.common.enums import InvoiceStatus
from app.extensions import db
from tests.helpers import auth, book_appointment, complete_visit


def _check_in(client, tokens, ids):
    appointment = book_appointment(client, tokens, ids)
    response = client.post(
        f"/api/v1/appointments/{appointment['id']}/check-in",
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 200, response.get_json()
    return appointment, response.get_json()["data"]


def _drafts(appointment_id):
    return (
        Invoice.query.filter_by(
            appointment_id=UUID(str(appointment_id)), status=InvoiceStatus.DRAFT
        )
        .order_by(Invoice.created_at)
        .all()
    )


def _invoice(client, tokens, invoice_id):
    response = client.get(f"/api/v1/invoices/{invoice_id}", headers=auth(tokens["cashier"]))
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]


def _visit_flow(client, tokens, ids):
    appointment, _ = _check_in(client, tokens, ids)
    response = client.post(
        f"/api/v1/appointments/{appointment['id']}/visits",
        json={"presenting_complaint": "Cough"},
        headers=auth(tokens["doctor"]),
    )
    assert response.status_code == 201, response.get_json()
    visit = response.get_json()["data"]
    complete_visit(client, tokens, visit["id"])
    return appointment, visit


def test_check_in_creates_one_numberless_draft(client, tokens, ids):
    appointment, _ = _check_in(client, tokens, ids)

    drafts = _drafts(appointment["id"])
    assert len(drafts) == 1
    draft = drafts[0]
    assert draft.invoice_number is None
    assert draft.finalized_at is None
    assert draft.visit_id is None
    assert draft.total_minor == 500000
    assert [line.description for line in draft.lines] == ["General consultation"]

    # Repeating check-in is a no-op and never creates a second draft.
    again = client.post(
        f"/api/v1/appointments/{appointment['id']}/check-in",
        headers=auth(tokens["reception"]),
    )
    assert again.status_code == 200
    assert len(_drafts(appointment["id"])) == 1


def test_walk_in_creates_a_draft(client, tokens, ids):
    response = client.post(
        "/api/v1/appointments/walk-in",
        json={
            "patient_id": str(ids["patient_id"]),
            "doctor_id": str(ids["doctor_id"]),
            "service_id": str(ids["service_id"]),
        },
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 201, response.get_json()
    appointment_id = response.get_json()["data"]["id"]
    drafts = _drafts(appointment_id)
    assert len(drafts) == 1
    assert drafts[0].appointment_id is not None


def test_line_endpoints_only_work_while_draft(client, tokens, ids):
    _, visit = _visit_flow(client, tokens, ids)
    draft = _drafts(visit["appointment_id"])[0]

    added = client.post(
        f"/api/v1/invoices/{draft.id}/lines",
        json={"description": "Dressing", "quantity": 2, "unit_price_minor": 30000},
        headers=auth(tokens["cashier"]),
    )
    assert added.status_code == 201, added.get_json()
    invoice = added.get_json()["data"]
    assert invoice["subtotal_minor"] == 560000
    assert invoice["total_minor"] == 560000
    dressing = next(line for line in invoice["lines"] if line["description"] == "Dressing")

    removed = client.delete(
        f"/api/v1/invoices/{draft.id}/lines/{dressing['id']}",
        headers=auth(tokens["cashier"]),
    )
    assert removed.status_code == 200, removed.get_json()
    assert removed.get_json()["data"]["subtotal_minor"] == 500000

    finalized = client.post(
        f"/api/v1/invoices/{draft.id}/finalize",
        headers=auth(tokens["cashier"]),
    )
    assert finalized.status_code == 200, finalized.get_json()
    final = finalized.get_json()["data"]
    assert final["invoice_number"].startswith("INV-")
    assert final["status"] == "ISSUED"
    assert final["finalized_at"]

    blocked_add = client.post(
        f"/api/v1/invoices/{draft.id}/lines",
        json={"description": "Late line", "unit_price_minor": 1000},
        headers=auth(tokens["cashier"]),
    )
    assert blocked_add.status_code == 409
    blocked_remove = client.delete(
        f"/api/v1/invoices/{draft.id}/lines/{final['lines'][0]['id']}",
        headers=auth(tokens["cashier"]),
    )
    assert blocked_remove.status_code == 409


def test_finalize_is_idempotent_and_locks_the_invoice(client, tokens, ids):
    _, visit = _visit_flow(client, tokens, ids)
    draft = _drafts(visit["appointment_id"])[0]

    first = client.post(f"/api/v1/invoices/{draft.id}/finalize", headers=auth(tokens["cashier"]))
    assert first.status_code == 200, first.get_json()
    number = first.get_json()["data"]["invoice_number"]

    second = client.post(f"/api/v1/invoices/{draft.id}/finalize", headers=auth(tokens["cashier"]))
    assert second.status_code == 409
    assert second.get_json()["error"]["details"]["invoice_number"] == number


def test_finalize_recalculates_discounts_and_co_pay_shares(client, tokens, ids):
    _, visit = _visit_flow(client, tokens, ids)
    draft = _drafts(visit["appointment_id"])[0]

    discount = client.post(
        f"/api/v1/invoices/{draft.id}/discount",
        json={"amount_minor": 25000, "reason": "Loyalty"},
        headers=auth(tokens["cashier"]),
    )
    assert discount.status_code == 200, discount.get_json()
    assert discount.get_json()["data"]["status"] == "DRAFT"
    assert discount.get_json()["data"]["total_minor"] == 475000

    finalized = client.post(
        f"/api/v1/invoices/{draft.id}/finalize", headers=auth(tokens["cashier"])
    )
    assert finalized.status_code == 200, finalized.get_json()
    invoice = finalized.get_json()["data"]
    assert invoice["discount_minor"] == 25000
    assert invoice["subtotal_minor"] == 500000
    assert invoice["total_minor"] == 475000
    assert invoice["balance_minor"] == 475000


def test_payments_and_claims_are_refused_on_a_draft(client, tokens, ids):
    _, visit = _visit_flow(client, tokens, ids)
    draft = _drafts(visit["appointment_id"])[0]

    payment = client.post(
        f"/api/v1/invoices/{draft.id}/transactions",
        json={"method": "CASH", "amount_minor": 500000},
        headers=auth(tokens["cashier"]),
    )
    assert payment.status_code == 409
    assert "Finalize" in payment.get_json()["error"]["message"]

    intent = client.post(
        f"/api/v1/invoices/{draft.id}/payment-intents",
        json={"amount_minor": 500000, "phone": "0700000005"},
        headers=auth(tokens["cashier"]),
    )
    assert intent.status_code == 409

    claim = client.post(
        f"/api/v1/invoices/{draft.id}/claims",
        json={"member_reference": "SHA-DEMO-ACTIVE"},
        headers=auth(tokens["reception"]),
    )
    assert claim.status_code == 409


def test_legacy_create_invoice_finalizes_the_existing_draft(client, tokens, ids):
    appointment, visit = _visit_flow(client, tokens, ids)
    draft = _drafts(appointment["id"])[0]

    response = client.post(
        f"/api/v1/visits/{visit['id']}/invoices",
        json={},
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 201, response.get_json()
    invoice = response.get_json()["data"]
    assert invoice["id"] == str(draft.id)
    assert invoice["invoice_number"].startswith("INV-")
    assert invoice["status"] == "ISSUED"
    assert invoice["visit_id"] == visit["id"]
    assert _drafts(appointment["id"]) == []


def test_finalize_by_visit_creates_a_draft_when_missing(client, tokens, ids):
    appointment, visit = _visit_flow(client, tokens, ids)
    draft = _drafts(appointment["id"])[0]
    db.session.delete(draft)
    db.session.commit()
    assert _drafts(appointment["id"]) == []

    response = client.post(
        f"/api/v1/visits/{visit['id']}/invoices/finalize",
        json={},
        headers=auth(tokens["cashier"]),
    )
    assert response.status_code == 201, response.get_json()
    invoice = response.get_json()["data"]
    assert invoice["invoice_number"].startswith("INV-")
    assert invoice["visit_id"] == visit["id"]
    assert invoice["appointment_id"] == appointment["id"]
    assert invoice["total_minor"] == 500000


def test_ready_to_bill_keeps_drafts_until_finalized(client, tokens, ids):
    appointment, visit = _visit_flow(client, tokens, ids)
    ready = client.get(
        "/api/v1/billing/ready-to-bill", headers=auth(tokens["reception"])
    ).get_json()["data"]["items"]
    row = next(item for item in ready if item["visit_id"] == visit["id"])
    assert row["draft_invoice_id"] == str(_drafts(appointment["id"])[0].id)

    client.post(
        f"/api/v1/invoices/{row['draft_invoice_id']}/finalize",
        headers=auth(tokens["cashier"]),
    )
    ready = client.get(
        "/api/v1/billing/ready-to-bill", headers=auth(tokens["reception"])
    ).get_json()["data"]["items"]
    assert visit["id"] not in {item["visit_id"] for item in ready}
