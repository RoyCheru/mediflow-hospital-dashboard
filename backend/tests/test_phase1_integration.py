from app.common.time import hospital_today
from tests.helpers import auth, create_invoice_flow


def test_pending_approvals_include_discount_requests(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    requested = client.post(
        f"/api/v1/invoices/{invoice['id']}/discount",
        json={"amount_minor": 50001, "reason": "Phase 1 audit discount"},
        headers=auth(tokens["cashier"]),
    )
    assert requested.status_code == 200, requested.get_json()

    response = client.get(
        "/api/v1/admin/dashboard/pending-approvals",
        headers=auth(tokens["admin"]),
    )
    assert response.status_code == 200, response.get_json()
    data = response.get_json()["data"]
    assert any(item["id"] == invoice["id"] for item in data["discount_requests"])

    filtered = client.get(
        "/api/v1/invoices?discount_status=PENDING_APPROVAL",
        headers=auth(tokens["cashier"]),
    )
    assert filtered.status_code == 200, filtered.get_json()
    assert any(item["id"] == invoice["id"] for item in filtered.get_json()["data"]["items"])


def test_invoice_totals_exclude_voided_invoices(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    request = client.post(
        f"/api/v1/invoices/{invoice['id']}/void-requests",
        json={"reason": "Phase 1 void"},
        headers=auth(tokens["cashier"]),
    )
    assert request.status_code == 201, request.get_json()
    decision = client.post(
        f"/api/v1/void-requests/{request.get_json()['data']['id']}/decision",
        json={"approve": True, "reason": "Verified"},
        headers=auth(tokens["admin"]),
    )
    assert decision.status_code == 200, decision.get_json()

    totals = client.get(
        "/api/v1/admin/dashboard/invoice-totals",
        headers=auth(tokens["admin"]),
    )
    assert totals.status_code == 200, totals.get_json()
    assert "VOIDED" not in totals.get_json()["data"]


def test_cash_expected_nets_completed_cash_refunds(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    payment = client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={"method": "CASH", "amount_minor": 500000, "tendered_minor": 500000},
        headers=auth(tokens["cashier"]),
    )
    assert payment.status_code == 201, payment.get_json()
    transaction_id = payment.get_json()["data"]["id"]

    refund = client.post(
        f"/api/v1/transactions/{transaction_id}/refund-requests",
        json={"amount_minor": 500000, "reason": "Phase 1 refund"},
        headers=auth(tokens["cashier"]),
    )
    assert refund.status_code == 201, refund.get_json()
    decision = client.post(
        f"/api/v1/refunds/{refund.get_json()['data']['id']}/decision",
        json={"approve": True, "reason": "Verified"},
        headers=auth(tokens["admin"]),
    )
    assert decision.status_code == 200, decision.get_json()

    summary = client.get(
        f"/api/v1/billing/cash-summary?date={hospital_today().isoformat()}",
        headers=auth(tokens["cashier"]),
    )
    assert summary.status_code == 200, summary.get_json()
    assert summary.get_json()["data"]["cash_expected_minor"] == 0
