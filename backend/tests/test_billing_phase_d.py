"""Phase D: draft encounter bills, line edits and finalization."""

from uuid import UUID

from app.billing.models import Invoice
from app.common.enums import InvoiceStatus
from app.extensions import db
from tests.helpers import auth, book_appointment, complete_visit, priced_service


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


def _open_visit(client, tokens, ids):
    """Checked in and in consultation: the bill is a draft."""
    appointment, _ = _check_in(client, tokens, ids)
    response = client.post(
        f"/api/v1/appointments/{appointment['id']}/visits",
        json={"presenting_complaint": "Cough"},
        headers=auth(tokens["doctor"]),
    )
    assert response.status_code == 201, response.get_json()
    return appointment, response.get_json()["data"]


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


def test_doctor_edits_lines_while_draft_and_completion_locks_them(client, tokens, ids):
    _, visit = _open_visit(client, tokens, ids)
    draft = _drafts(visit["appointment_id"])[0]
    dressing_service = priced_service(ids, "PROC-DRESS", "Dressing", 30000)
    lines_url = f"/api/v1/invoices/{draft.id}/lines"

    # The billing desk sees drafts read-only.
    assert (
        client.post(
            lines_url,
            json={"service_id": str(dressing_service.id)},
            headers=auth(tokens["cashier"]),
        ).status_code
        == 403
    )

    added = client.post(
        lines_url,
        json={"service_id": str(dressing_service.id), "quantity": 2},
        headers=auth(tokens["doctor"]),
    )
    assert added.status_code == 201, added.get_json()
    invoice = added.get_json()["data"]
    assert invoice["subtotal_minor"] == invoice["total_minor"] == 560000
    dressing = next(line for line in invoice["lines"] if line["description"] == "Dressing")
    removed = client.delete(f"{lines_url}/{dressing['id']}", headers=auth(tokens["doctor"]))
    assert removed.status_code == 200, removed.get_json()
    assert removed.get_json()["data"]["subtotal_minor"] == 500000

    final = complete_visit(client, tokens, visit["id"])["invoice"]
    assert final["id"] == str(draft.id)
    assert final["invoice_number"].startswith("INV-")
    assert final["status"] == "ISSUED" and final["finalized_at"]

    # Finalized: immutable for the doctor (409); billing roles never edit lines (403).
    for role, expected in (("doctor", 409), ("cashier", 403)):
        blocked_add = client.post(
            lines_url, json={"service_id": str(dressing_service.id)}, headers=auth(tokens[role])
        )
        assert blocked_add.status_code == expected, role
        blocked_remove = client.delete(
            f"{lines_url}/{final['lines'][0]['id']}", headers=auth(tokens[role])
        )
        assert blocked_remove.status_code == expected, role


def test_completing_again_never_renumbers_the_invoice(client, tokens, ids):
    _, visit = _open_visit(client, tokens, ids)
    first = complete_visit(client, tokens, visit["id"])["invoice"]
    second = complete_visit(client, tokens, visit["id"])["invoice"]
    assert second["id"] == first["id"]
    assert second["invoice_number"] == first["invoice_number"]
    assert Invoice.query.filter_by(visit_id=UUID(visit["id"])).count() == 1


def test_completion_recalculates_totals_and_co_pay_shares(client, tokens, ids):
    from app.common.enums import AllocationPayer, AllocationStatus
    from app.patients.models import PatientProfile

    patient = PatientProfile.query.get(ids["patient_id"])
    patient.sha_number = "SHA-DEMO-INACTIVE"  # check-in converts the draft to self-pay
    db.session.commit()
    appointment, visit = _open_visit(client, tokens, ids)
    final = complete_visit(client, tokens, visit["id"])["invoice"]
    assert final["subtotal_minor"] == final["total_minor"] == final["balance_minor"] == 500000

    invoice = db.session.get(Invoice, UUID(final["id"]))
    patient_share = [
        item
        for item in invoice.allocations
        if item.payer == AllocationPayer.PATIENT and item.status != AllocationStatus.VOIDED
    ]
    assert [item.amount_minor for item in patient_share] == [500000]

    # A discount on the finalized invoice is an adjustment that waits for approval.
    discount = client.post(
        f"/api/v1/invoices/{final['id']}/discount",
        json={"amount_minor": 25000, "reason": "Loyalty"},
        headers=auth(tokens["cashier"]),
    )
    assert discount.status_code == 200, discount.get_json()
    assert discount.get_json()["data"]["discount_status"] == "PENDING_APPROVAL"
    assert discount.get_json()["data"]["total_minor"] == 500000


def test_payments_and_claims_are_refused_on_a_draft(client, tokens, ids):
    _, visit = _open_visit(client, tokens, ids)
    draft = _drafts(visit["appointment_id"])[0]

    payment = client.post(
        f"/api/v1/invoices/{draft.id}/transactions",
        json={"method": "CASH", "amount_minor": 500000},
        headers=auth(tokens["cashier"]),
    )
    assert payment.status_code == 409
    assert payment.get_json()["error"]["code"] == "INVOICE_NOT_PAYABLE"
    assert "Awaiting visit completion" in payment.get_json()["error"]["message"]

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


def test_legacy_create_invoice_endpoint_is_refused(client, tokens, ids):
    appointment, visit = _open_visit(client, tokens, ids)
    response = client.post(
        f"/api/v1/visits/{visit['id']}/invoices",
        json={},
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 403
    assert len(_drafts(appointment["id"])) == 1


def test_completion_creates_the_draft_when_missing(client, tokens, ids):
    appointment, visit = _open_visit(client, tokens, ids)
    draft = _drafts(appointment["id"])[0]
    from app.claims.models import EligibilityCheck

    # The check-in eligibility check references the draft (enforced on Postgres).
    EligibilityCheck.query.filter_by(invoice_id=draft.id).update({"invoice_id": None})
    db.session.delete(draft)
    db.session.commit()
    assert _drafts(appointment["id"]) == []

    invoice = complete_visit(client, tokens, visit["id"])["invoice"]
    assert invoice["invoice_number"].startswith("INV-")
    assert invoice["visit_id"] == visit["id"]
    assert invoice["appointment_id"] == appointment["id"]
    assert invoice["total_minor"] == 500000


def test_ready_to_bill_lists_only_completed_visits_left_in_draft(client, tokens, ids):
    from app.clinical_records.models import Visit
    from app.common.base import utcnow

    # A normal completion finalizes the bill, so the visit is not on the list.
    _, done = _open_visit(client, tokens, ids)
    complete_visit(client, tokens, done["id"])
    # Legacy data: a visit completed before BIL-17 whose bill stayed a draft.
    legacy_appointment = book_appointment(client, tokens, ids, start="2030-01-08T10:00:00+00:00")
    client.post(
        f"/api/v1/appointments/{legacy_appointment['id']}/check-in",
        headers=auth(tokens["reception"]),
    )
    legacy_visit = client.post(
        f"/api/v1/appointments/{legacy_appointment['id']}/visits",
        json={},
        headers=auth(tokens["doctor"]),
    ).get_json()["data"]
    db.session.get(Visit, UUID(legacy_visit["id"])).completed_at = utcnow()
    db.session.commit()

    ready = client.get(
        "/api/v1/billing/ready-to-bill", headers=auth(tokens["reception"])
    ).get_json()["data"]["items"]
    ids_on_list = {item["visit_id"] for item in ready}
    assert done["id"] not in ids_on_list
    row = next(item for item in ready if item["visit_id"] == legacy_visit["id"])
    assert row["draft_invoice_id"] == str(_drafts(legacy_appointment["id"])[0].id)
