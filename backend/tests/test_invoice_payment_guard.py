"""BIL-16 / BIL-17: payments only on finalized invoices of completed visits;
invoices finalize only when the visit is completed.

Step 1 (confirmation): tests marked ``confirmed_bug`` describe the required
behaviour and fail on the code as found (strict xfail). The fix removes the
markers.
"""

import uuid
from uuid import UUID

import pytest

from app.billing.models import Invoice
from app.common.enums import InvoiceStatus
from app.extensions import db
from tests.helpers import auth, book_appointment

confirmed_bug = pytest.mark.xfail(strict=True, reason="confirmed bug (BIL-16/17), fixed in step 2")

BILLING_ROLES = ("reception", "cashier", "admin")


def _open_visit(client, tokens, ids):
    """Checked-in patient with a consultation in progress and its draft bill."""
    appointment = book_appointment(client, tokens, ids)
    client.post(
        f"/api/v1/appointments/{appointment['id']}/check-in", headers=auth(tokens["reception"])
    )
    visit = client.post(
        f"/api/v1/appointments/{appointment['id']}/visits",
        json={"presenting_complaint": "Cough"},
        headers=auth(tokens["doctor"]),
    ).get_json()["data"]
    draft = Invoice.query.filter_by(appointment_id=UUID(appointment["id"])).one()
    return appointment, visit, draft


def _numbered_but_visit_open(client, tokens, ids):
    """The state of INV-2026-000018 in the dev data: a finalized invoice whose
    visit is not completed (reachable today through direct finalize)."""
    appointment, visit, draft = _open_visit(client, tokens, ids)
    draft.status = InvoiceStatus.ISSUED
    draft.invoice_number = f"INV-TEST-{uuid.uuid4().hex[:6]}"
    db.session.commit()
    return appointment, visit, draft


# --- Payments on drafts (already refused; evidence) --------------------------------


def test_draft_invoice_refuses_cash_stk_and_claims_today(client, tokens, ids):
    _, _, draft = _open_visit(client, tokens, ids)
    cash = client.post(
        f"/api/v1/invoices/{draft.id}/transactions",
        json={"method": "CASH", "amount_minor": 1000},
        headers=auth(tokens["cashier"]),
    )
    stk = client.post(
        f"/api/v1/invoices/{draft.id}/payment-intents",
        json={"amount_minor": 1000, "phone": "0712345678"},
        headers=auth(tokens["cashier"]),
    )
    claim = client.post(
        f"/api/v1/invoices/{draft.id}/claims",
        json={"sha_member_reference": "SHA-DEMO-ACTIVE", "amount_minor": 1000},
        headers=auth(tokens["reception"]),
    )
    assert (cash.status_code, stk.status_code, claim.status_code) == (409, 409, 409)


@confirmed_bug
def test_rejections_use_the_invoice_not_payable_code(client, tokens, ids):
    _, _, draft = _open_visit(client, tokens, ids)
    cash = client.post(
        f"/api/v1/invoices/{draft.id}/transactions",
        json={"method": "CASH", "amount_minor": 1000},
        headers=auth(tokens["cashier"]),
    )
    assert cash.get_json()["error"]["code"] == "INVOICE_NOT_PAYABLE"


@confirmed_bug
def test_payer_allocation_is_refused_on_a_draft(client, tokens, ids):
    _, _, draft = _open_visit(client, tokens, ids)
    response = client.post(
        f"/api/v1/invoices/{draft.id}/allocations",
        json={"payer": "SHA", "amount_minor": 1000},
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 409


# --- Payments on invoices whose visit is not completed -----------------------------


@confirmed_bug
def test_no_cash_payment_while_the_visit_is_open(client, tokens, ids):
    _, _, invoice = _numbered_but_visit_open(client, tokens, ids)
    response = client.post(
        f"/api/v1/invoices/{invoice.id}/transactions",
        json={"method": "CASH", "amount_minor": 1000},
        headers=auth(tokens["cashier"]),
    )
    assert response.status_code == 409


@confirmed_bug
def test_no_stk_push_while_the_visit_is_open(client, tokens, ids):
    _, _, invoice = _numbered_but_visit_open(client, tokens, ids)
    response = client.post(
        f"/api/v1/invoices/{invoice.id}/payment-intents",
        json={"amount_minor": 1000, "phone": "0712345678"},
        headers={**auth(tokens["cashier"]), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert response.status_code == 409


@confirmed_bug
def test_no_sha_claim_while_the_visit_is_open(client, tokens, ids):
    _, _, invoice = _numbered_but_visit_open(client, tokens, ids)
    response = client.post(
        f"/api/v1/invoices/{invoice.id}/claims",
        json={"sha_member_reference": "SHA-DEMO-ACTIVE", "amount_minor": 1000},
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 409


# --- Direct finalization ------------------------------------------------------------


@confirmed_bug
@pytest.mark.parametrize("role", BILLING_ROLES)
def test_billing_roles_cannot_finalize_an_invoice_directly(client, tokens, ids, role):
    _, _, draft = _open_visit(client, tokens, ids)
    response = client.post(f"/api/v1/invoices/{draft.id}/finalize", headers=auth(tokens[role]))
    assert response.status_code == 403
    assert db.session.get(Invoice, draft.id).status == InvoiceStatus.DRAFT


@confirmed_bug
@pytest.mark.parametrize("role", BILLING_ROLES)
def test_billing_roles_cannot_finalize_through_the_visit_endpoints(client, tokens, ids, role):
    _, visit, _ = _open_visit(client, tokens, ids)
    client.post(f"/api/v1/visits/{visit['id']}/complete", headers=auth(tokens["doctor"]))
    for path in (f"/visits/{visit['id']}/invoices/finalize", f"/visits/{visit['id']}/invoices"):
        response = client.post(f"/api/v1{path}", json={}, headers=auth(tokens[role]))
        assert response.status_code == 403, (path, response.get_json())


# --- Finalization on visit completion -----------------------------------------------


@confirmed_bug
def test_completing_the_visit_finalizes_the_invoice(client, tokens, ids):
    _, visit, draft = _open_visit(client, tokens, ids)
    assert draft.invoice_number is None
    response = client.post(f"/api/v1/visits/{visit['id']}/complete", headers=auth(tokens["doctor"]))
    assert response.status_code == 200
    db.session.expire_all()
    invoice = db.session.get(Invoice, draft.id)
    assert invoice.status == InvoiceStatus.ISSUED
    assert invoice.invoice_number and invoice.finalized_at


# --- Immutability ---------------------------------------------------------------------


@confirmed_bug
def test_a_discount_cannot_change_a_finalized_invoice_without_approval(client, tokens, ids):
    _, visit, draft = _open_visit(client, tokens, ids)
    client.post(f"/api/v1/visits/{visit['id']}/complete", headers=auth(tokens["doctor"]))
    client.post(
        f"/api/v1/visits/{visit['id']}/invoices/finalize", json={}, headers=auth(tokens["doctor"])
    )
    response = client.post(
        f"/api/v1/invoices/{draft.id}/discount",
        json={"amount_minor": 1000, "reason": "Goodwill"},  # small: auto-applied today
        headers=auth(tokens["cashier"]),
    )
    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["discount_status"] == "PENDING_APPROVAL"
    assert data["total_minor"] == 500000


# --- Cancelled appointments ------------------------------------------------------------


@confirmed_bug
def test_cancelling_a_checked_in_appointment_voids_its_draft(client, tokens, ids):
    appointment = book_appointment(client, tokens, ids)
    client.post(
        f"/api/v1/appointments/{appointment['id']}/check-in", headers=auth(tokens["reception"])
    )
    client.post(
        f"/api/v1/appointments/{appointment['id']}/cancel",
        json={"reason": "Left before being seen"},
        headers=auth(tokens["reception"]),
    )
    draft = Invoice.query.filter_by(appointment_id=UUID(appointment["id"])).one()
    assert draft.status == InvoiceStatus.VOIDED


# --- Audit ---------------------------------------------------------------------------------


@confirmed_bug
def test_rejected_payment_attempts_are_audited(client, tokens, ids):
    from app.audit.models import AuditLog

    _, _, draft = _open_visit(client, tokens, ids)
    client.post(
        f"/api/v1/invoices/{draft.id}/transactions",
        json={"method": "CASH", "amount_minor": 1000},
        headers=auth(tokens["cashier"]),
    )
    entry = AuditLog.query.filter_by(action="invoice.payment_rejected").one()
    assert entry.entity_id == draft.id
