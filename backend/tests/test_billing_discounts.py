"""Discount reason and approval rules (above 10% or above KES 1,000 needs an admin)."""

from app.audit.models import AuditLog
from app.notifications.models import Notification
from tests.helpers import (
    auth,
    complete_visit,
    create_invoice_flow,
    create_visit_flow,
    priced_service,
)


def _new_invoice(client, tokens, ids, body):
    _, visit = create_visit_flow(client, tokens, ids)
    complete_visit(client, tokens, visit["id"])
    return client.post(
        f"/api/v1/visits/{visit['id']}/invoices", json=body, headers=auth(tokens["reception"])
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


def test_discount_at_creation_requires_a_reason(client, tokens, ids):
    response = _new_invoice(client, tokens, ids, {"discount_minor": 10000})
    assert response.status_code == 400


def test_small_discount_is_applied_immediately_and_audited(client, tokens, ids):
    response = _new_invoice(
        client, tokens, ids, {"discount_minor": 25000, "discount_reason": "Loyalty"}
    )
    assert response.status_code == 201, response.get_json()
    invoice = response.get_json()["data"]
    assert invoice["discount_status"] == "APPLIED"
    assert invoice["discount_minor"] == 25000
    assert invoice["total_minor"] == 475000
    assert invoice["balance_minor"] == 475000
    assert invoice["discount_reason"] == "Loyalty"
    assert AuditLog.query.filter_by(action="invoice.discount_apply").count() == 1


def test_exactly_ten_percent_is_not_above_the_threshold(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)  # subtotal 500000
    response = _discount(client, tokens, invoice["id"], 50000)
    assert response.status_code == 200, response.get_json()
    assert response.get_json()["data"]["discount_status"] == "APPLIED"


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


def test_discount_above_kes_1000_needs_approval_even_under_ten_percent(client, tokens, ids):
    response = _new_invoice(
        client,
        tokens,
        ids,
        {
            "items": [
                {
                    "service_id": str(
                        priced_service(ids, "PROC-MINOR", "Minor procedure", 2000000).id
                    )
                }
            ],
            "discount_minor": 150000,  # 7.5% but above KES 1,000
            "discount_reason": "Hardship",
        },
    )
    assert response.status_code == 201, response.get_json()
    invoice = response.get_json()["data"]
    assert invoice["discount_status"] == "PENDING_APPROVAL"
    assert invoice["total_minor"] == 2000000


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
    response = _discount(client, tokens, invoice["id"], 25000)
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
