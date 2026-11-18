"""Phase B: correct invoice amounts, payer reassignment and discounts."""

from datetime import timedelta
from uuid import UUID

from app.common.base import utcnow
from app.extensions import db
from app.scheduling.models import ServicePrice
from tests.helpers import auth, complete_visit, create_invoice_flow, create_visit_flow


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
    complete_visit(client, tokens, visit["id"])
    response = _invoice_for(client, tokens, visit["id"])
    assert response.status_code == 201, response.get_json()
    invoice = response.get_json()["data"]
    assert len(invoice["lines"]) == 1
    assert invoice["lines"][0]["service_id"] == str(ids["service_id"])
    assert invoice["lines"][0]["unit_price_minor"] == 250000  # doctor's consultation fee
    assert invoice["total_minor"] == 250000


def test_explicit_items_are_billed_as_given(client, tokens, ids):
    _, visit = create_visit_flow(client, tokens, ids)
    complete_visit(client, tokens, visit["id"])
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


def test_open_visit_cannot_be_invoiced(client, tokens, ids):
    _, visit = create_visit_flow(client, tokens, ids)
    response = _invoice_for(client, tokens, visit["id"])
    assert response.status_code == 409
    assert response.get_json()["error"]["details"]["visit_id"] == visit["id"]


def test_amending_a_completed_visit_is_allowed_and_audited(client, tokens, ids):
    from app.audit.models import AuditLog

    _, visit, invoice = create_invoice_flow(client, tokens, ids)
    response = client.patch(
        f"/api/v1/visits/{visit['id']}",
        json={"diagnosis": "Acute bronchitis"},
        headers=auth(tokens["doctor"]),
    )
    assert response.status_code == 200, response.get_json()
    entry = AuditLog.query.filter_by(action="visit.amend_after_completion").one()
    assert entry.after["fields"] == ["diagnosis"]
    assert entry.after["invoice_id"] == invoice["id"]
    assert "Acute bronchitis" not in str(entry.after)
    # Charges are unaffected by clinical amendments.
    unchanged = client.get(
        f"/api/v1/invoices/{invoice['id']}", headers=auth(tokens["cashier"])
    ).get_json()["data"]
    assert unchanged["total_minor"] == invoice["total_minor"]


def _eligibility(client, tokens, invoice_id, member):
    return client.post(
        f"/api/v1/invoices/{invoice_id}/claims/eligibility-check",
        json={"member_reference": member},
        headers=auth(tokens["reception"]),
    )


def _allocations(client, tokens, invoice_id):
    invoice = client.get(
        f"/api/v1/invoices/{invoice_id}", headers=auth(tokens["cashier"])
    ).get_json()["data"]
    return invoice, {
        item["payer"]: item for item in invoice["allocations"] if item["status"] != "VOIDED"
    }


def test_inactive_sha_converts_the_invoice_to_self_pay(client, tokens, ids):
    from app.audit.models import AuditLog

    _, _, invoice = create_invoice_flow(client, tokens, ids)
    check = _eligibility(client, tokens, invoice["id"], "SHA-DEMO-INACTIVE")
    assert check.status_code == 201
    assert check.get_json()["data"]["next_action"] == "choose_payment_method"

    updated, active = _allocations(client, tokens, invoice["id"])
    assert updated["primary_method"] == "SELF_PAY"
    assert set(active) == {"PATIENT"}
    assert active["PATIENT"]["amount_minor"] == invoice["total_minor"]
    assert AuditLog.query.filter_by(action="invoice.self_pay_conversion").count() == 1


def test_claim_on_exhausted_cover_returns_next_action_and_keeps_conversion(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    response = client.post(
        f"/api/v1/invoices/{invoice['id']}/claims",
        json={"member_reference": "SHA-DEMO-EXHAUSTED"},
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 409
    details = response.get_json()["error"]["details"]
    assert details["next_action"] == "choose_payment_method"
    assert details["status"] == "LIMIT_EXHAUSTED"
    # The conversion was committed even though the request failed.
    _, active = _allocations(client, tokens, invoice["id"])
    assert active["PATIENT"]["amount_minor"] == invoice["total_minor"]


def test_active_cover_claims_the_balance_with_no_patient_share(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    check = _eligibility(client, tokens, invoice["id"], "SHA-DEMO-ACTIVE").get_json()["data"]
    assert check["next_action"] == "create_claim"
    claim = client.post(
        f"/api/v1/invoices/{invoice['id']}/claims",
        json={"eligibility_check_id": check["id"]},
        headers=auth(tokens["reception"]),
    )
    assert claim.status_code == 201, claim.get_json()
    assert claim.get_json()["data"]["claimed_amount_minor"] == invoice["total_minor"]
    _, active = _allocations(client, tokens, invoice["id"])
    assert set(active) == {"SHA"}


def test_claim_is_capped_at_remaining_cover_and_rest_becomes_co_pay(
    client, tokens, ids, monkeypatch
):
    from app.claims import service as claims_service
    from app.integrations.sha import SimulatedShaGateway

    class LimitedCover(SimulatedShaGateway):
        def verify_member(self, member_reference, patient_context=None):
            result = super().verify_member(member_reference, patient_context)
            return {**result, "coverage_limit_minor": 350000, "consumed_minor": 150000}

    monkeypatch.setattr(claims_service, "get_sha_gateway", lambda: LimitedCover())
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    claim = client.post(
        f"/api/v1/invoices/{invoice['id']}/claims",
        json={"member_reference": "SHA-DEMO-ACTIVE"},
        headers=auth(tokens["reception"]),
    )
    assert claim.status_code == 201, claim.get_json()
    assert claim.get_json()["data"]["claimed_amount_minor"] == 200000  # 350000 - 150000

    _, active = _allocations(client, tokens, invoice["id"])
    assert active["SHA"]["amount_minor"] == 200000
    assert active["PATIENT"]["amount_minor"] == invoice["total_minor"] - 200000
    assert sum(item["amount_minor"] for item in active.values()) == invoice["total_minor"]


def test_partial_claim_assigns_the_remainder_to_the_patient(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    claim = client.post(
        f"/api/v1/invoices/{invoice['id']}/claims",
        json={"member_reference": "SHA-DEMO-ACTIVE", "amount_minor": 300000},
        headers=auth(tokens["reception"]),
    )
    assert claim.status_code == 201, claim.get_json()
    _, active = _allocations(client, tokens, invoice["id"])
    assert active["SHA"]["amount_minor"] == 300000
    assert active["PATIENT"]["amount_minor"] == invoice["total_minor"] - 300000
    assert active["PATIENT"]["status"] == "PENDING"


def _submit_claim(client, tokens, invoice_id, amount=None):
    body = {"member_reference": "SHA-DEMO-ACTIVE"}
    if amount is not None:
        body["amount_minor"] = amount
    response = client.post(
        f"/api/v1/invoices/{invoice_id}/claims", json=body, headers=auth(tokens["reception"])
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]


def _move_claim(client, tokens, claim_id, status, **extra):
    return client.post(
        f"/api/v1/claims/{claim_id}/status",
        json={"status": status, **extra},
        headers=auth(tokens["admin"]),
    )


def test_rejected_claim_moves_the_whole_amount_to_the_patient(client, tokens, ids):
    from app.audit.models import AuditLog
    from app.notifications.models import Notification

    _, _, invoice = create_invoice_flow(client, tokens, ids)
    claim = _submit_claim(client, tokens, invoice["id"])
    rejected = _move_claim(client, tokens, claim["id"], "REJECTED", rejection_reason="Not covered")
    assert rejected.status_code == 200, rejected.get_json()

    _, active = _allocations(client, tokens, invoice["id"])
    assert set(active) == {"PATIENT"}
    assert active["PATIENT"]["amount_minor"] == invoice["total_minor"]
    assert Notification.query.filter_by(template_key="claim_patient_share_alert").count() >= 1
    assert AuditLog.query.filter_by(action="invoice.patient_share_increase").count() == 1


def test_partial_approval_shortfall_is_owed_by_the_patient_until_paid(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    total = invoice["total_minor"]
    claim = _submit_claim(client, tokens, invoice["id"])
    assert _move_claim(client, tokens, claim["id"], "UNDER_REVIEW").status_code == 200
    approved = _move_claim(
        client, tokens, claim["id"], "APPROVED", approved_amount_minor=total - 100000
    )
    assert approved.status_code == 200, approved.get_json()

    _, active = _allocations(client, tokens, invoice["id"])
    assert active["SHA"]["amount_minor"] == total - 100000
    assert active["PATIENT"]["amount_minor"] == 100000

    assert _move_claim(client, tokens, claim["id"], "PAID").status_code == 200
    updated, active = _allocations(client, tokens, invoice["id"])
    assert updated["status"] == "PARTIALLY_PAID"
    assert updated["balance_minor"] == 100000
    assert active["SHA"]["status"] == "PAID"
    assert active["PATIENT"]["status"] == "PENDING"

    paid = client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={"method": "CASH", "amount_minor": 100000},
        headers=auth(tokens["cashier"]),
    )
    assert paid.status_code == 201, paid.get_json()
    updated, _ = _allocations(client, tokens, invoice["id"])
    assert updated["status"] == "PAID"


def test_approved_amount_cannot_exceed_claimed(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    claim = _submit_claim(client, tokens, invoice["id"], amount=200000)
    response = _move_claim(client, tokens, claim["id"], "APPROVED", approved_amount_minor=300000)
    assert response.status_code == 400


def test_resubmitted_claim_takes_the_share_back_from_the_patient(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    claim = _submit_claim(client, tokens, invoice["id"])
    _move_claim(client, tokens, claim["id"], "REJECTED", rejection_reason="Missing documents")
    resubmitted = client.post(
        f"/api/v1/claims/{claim['id']}/resubmissions",
        json={"note": "Documents attached"},
        headers=auth(tokens["admin"]),
    )
    assert resubmitted.status_code == 201, resubmitted.get_json()
    _, active = _allocations(client, tokens, invoice["id"])
    assert set(active) == {"SHA"}
    assert active["SHA"]["amount_minor"] == invoice["total_minor"]
