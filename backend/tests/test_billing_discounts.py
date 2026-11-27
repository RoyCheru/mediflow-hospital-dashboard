"""Discount rules. A finalized invoice is immutable (BIL-17), so every discount on
it is an adjustment that waits for approval by a different admin."""

from uuid import UUID

from app.audit.models import AuditLog
from app.notifications.models import Notification
from tests.helpers import (
    auth,
    create_invoice_flow,
    create_visit_flow,
)


def _discount(client, tokens, invoice_id, amount, role="cashier", reason="Staff family rate"):
    return client.post(
        f"/api/v1/invoices/{invoice_id}/discount",
        json={"amount_minor": amount, "reason": reason},
        headers=auth(tokens[role]),
    )


def _decide(client, tokens, invoice_id, approve, role="admin"):
    return client.post(
        f"/api/v1/invoices/{invoice_id}/discount/decision",
        json={"approve": approve, "reason": "Reviewed"},
        headers=auth(tokens[role]),
    )


def test_every_discount_on_a_finalized_invoice_waits_for_approval(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)  # subtotal 500000
    small = _discount(client, tokens, invoice["id"], 25000, reason="Loyalty")  # 5%: was auto
    assert small.status_code == 200, small.get_json()
    data = small.get_json()["data"]
    assert data["discount_status"] == "PENDING_APPROVAL"
    assert data["total_minor"] == 500000  # unchanged until approved
    assert AuditLog.query.filter_by(action="invoice.discount_request").count() == 1

    approved = _decide(client, tokens, invoice["id"], True)
    data = approved.get_json()["data"]
    assert data["discount_status"] == "APPLIED"
    assert data["total_minor"] == data["balance_minor"] == 475000
    assert data["discount_reason"] == "Loyalty"


def test_no_discount_on_a_draft(client, tokens, ids):
    from app.billing.models import Invoice

    _, visit = create_visit_flow(client, tokens, ids)
    draft = Invoice.query.filter_by(visit_id=UUID(visit["id"])).one()
    assert _discount(client, tokens, str(draft.id), 1000).status_code == 409


def test_discount_above_ten_percent_waits_for_admin_approval(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    pending = _discount(client, tokens, invoice["id"], 50001)
    assert pending.status_code == 200, pending.get_json()
    data = pending.get_json()["data"]
    assert data["discount_status"] == "PENDING_APPROVAL"
    assert data["discount_requested_minor"] == 50001
    assert data["total_minor"] == 500000  # not applied yet
    assert Notification.query.filter_by(template_key="discount_approval_alert").count() >= 1

    assert _discount(client, tokens, invoice["id"], 1000).status_code == 409  # one at a time
    assert _decide(client, tokens, invoice["id"], True, role="cashier").status_code == 403
    approved = _decide(client, tokens, invoice["id"], True)
    assert approved.status_code == 200, approved.get_json()
    data = approved.get_json()["data"]
    assert data["discount_status"] == "APPLIED"
    assert data["total_minor"] == 449999
    entry = AuditLog.query.filter_by(action="invoice.discount_decision").one()
    assert entry.after["approved"] is True


def test_requester_cannot_approve_their_own_discount(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    assert _discount(client, tokens, invoice["id"], 200000, role="admin").status_code == 200
    assert _decide(client, tokens, invoice["id"], True).status_code == 409


def test_rejected_discount_leaves_the_total_unchanged(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    _discount(client, tokens, invoice["id"], 200000)
    rejected = _decide(client, tokens, invoice["id"], False)
    assert rejected.status_code == 200
    data = rejected.get_json()["data"]
    assert data["discount_status"] == "REJECTED"
    assert data["total_minor"] == 500000
    assert data["discount_minor"] == 0


def test_discount_cannot_leave_the_invoice_overpaid(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={"method": "CASH", "amount_minor": 480000},
        headers=auth(tokens["cashier"]),
    )
    response = _discount(client, tokens, invoice["id"], 30000)
    assert response.status_code == 409
    assert response.get_json()["error"]["details"]["net_paid_minor"] == 480000


def test_discount_is_refused_while_a_claim_is_open(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    client.post(
        f"/api/v1/invoices/{invoice['id']}/claims",
        json={"member_reference": "SHA-DEMO-ACTIVE"},
        headers=auth(tokens["reception"]),
    )
    assert _discount(client, tokens, invoice["id"], 10000).status_code == 409


def test_discount_rebalances_the_patient_share(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    client.post(
        f"/api/v1/invoices/{invoice['id']}/claims/eligibility-check",
        json={"member_reference": "SHA-DEMO-INACTIVE"},
        headers=auth(tokens["reception"]),
    )  # self-pay conversion: patient owes the full total
    assert _discount(client, tokens, invoice["id"], 25000).status_code == 200
    response = _decide(client, tokens, invoice["id"], True)
    assert response.status_code == 200, response.get_json()
    data = response.get_json()["data"]
    patient = [
        a for a in data["allocations"] if a["payer"] == "PATIENT" and a["status"] != "VOIDED"
    ]
    assert patient[0]["amount_minor"] == 475000


def test_full_discount_settles_the_invoice(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    _discount(client, tokens, invoice["id"], 500000, reason="Charity case")
    approved = _decide(client, tokens, invoice["id"], True)
    assert approved.status_code == 200
    data = approved.get_json()["data"]
    assert data["total_minor"] == 0
    assert data["status"] == "PAID"


def test_discount_reason_is_required_on_request(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    response = client.post(
        f"/api/v1/invoices/{invoice['id']}/discount",
        json={"amount_minor": 1000},
        headers=auth(tokens["cashier"]),
    )
    assert response.status_code == 422
