from tests.helpers import auth, create_invoice_flow, create_visit_flow


def _create_claim(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    eligibility = client.post(
        f"/api/v1/invoices/{invoice['id']}/claims/eligibility-check",
        json={"member_reference": "SHA-DEMO-ACTIVE"},
        headers=auth(tokens["reception"]),
    )
    assert eligibility.status_code == 201, eligibility.get_json()
    claim = client.post(
        f"/api/v1/invoices/{invoice['id']}/claims",
        json={
            "eligibility_check_id": eligibility.get_json()["data"]["id"],
            "amount_minor": 500000,
        },
        headers=auth(tokens["reception"]),
    )
    assert claim.status_code == 201, claim.get_json()
    return invoice, claim.get_json()["data"]


def test_dashboard_summary_is_admin_only(client, tokens):
    response = client.get("/api/v1/admin/dashboard/summary", headers=auth(tokens["admin"]))
    assert response.status_code == 200, response.get_json()
    data = response.get_json()["data"]
    assert set(data) >= {
        "stats",
        "revenue_trend",
        "payment_split",
        "today_schedule",
        "recent_claims",
        "recent_audit",
    }
    assert "total_patients" in data["stats"]

    assert (
        client.get("/api/v1/admin/dashboard/summary", headers=auth(tokens["reception"])).status_code
        == 403
    )
    assert client.get("/api/v1/admin/dashboard/summary").status_code == 401


def test_invoice_filters_validation_and_names(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    number = invoice["invoice_number"]

    listed = client.get(
        f"/api/v1/invoices?q={number}&status=ISSUED&sort=-created_at",
        headers=auth(tokens["admin"]),
    )
    assert listed.status_code == 200, listed.get_json()
    payload = listed.get_json()["data"]
    assert payload["meta"]["total"] == 1
    assert payload["items"][0]["invoice_number"] == number
    assert payload["items"][0]["patient_name"] == "Pam Patient"

    invalid = client.get("/api/v1/invoices?sort=not-a-column", headers=auth(tokens["admin"]))
    assert invalid.status_code == 400
    assert invalid.get_json()["error"]["code"] == "BAD_REQUEST"

    assert client.get("/api/v1/invoices").status_code == 401


def test_claims_filters_and_aging_bucket(client, tokens, ids):
    _, claim = _create_claim(client, tokens, ids)

    by_search = client.get(f"/api/v1/claims?q={claim['id'][:8]}", headers=auth(tokens["admin"]))
    assert by_search.status_code == 200, by_search.get_json()
    assert any(item["id"] == claim["id"] for item in by_search.get_json()["data"]["items"])

    current = client.get("/api/v1/claims?aging_bucket=current", headers=auth(tokens["admin"]))
    assert current.status_code == 200
    assert "items" in current.get_json()["data"]

    assert client.get("/api/v1/claims").status_code == 401


def test_void_refund_and_transaction_lists(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    void = client.post(
        f"/api/v1/invoices/{invoice['id']}/void-requests",
        json={"reason": "Billed in error"},
        headers=auth(tokens["reception"]),
    )
    assert void.status_code == 201, void.get_json()

    voids = client.get(
        "/api/v1/billing/void-requests?status=PENDING", headers=auth(tokens["admin"])
    )
    assert voids.status_code == 200
    assert voids.get_json()["data"]["meta"]["total"] == 1
    assert voids.get_json()["data"]["items"][0]["invoice_number"] == invoice["invoice_number"]

    payment = client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={"method": "CASH", "amount_minor": 500000, "tendered_minor": 500000},
        headers=auth(tokens["cashier"]),
    )
    assert payment.status_code == 201, payment.get_json()
    transaction = payment.get_json()["data"]

    refund = client.post(
        f"/api/v1/transactions/{transaction['id']}/refund-requests",
        json={
            "transaction_id": transaction["id"],
            "amount_minor": 100000,
            "reason": "Overpayment",
        },
        headers=auth(tokens["cashier"]),
    )
    assert refund.status_code == 201, refund.get_json()

    refunds = client.get("/api/v1/billing/refunds?status=PENDING", headers=auth(tokens["admin"]))
    assert refunds.status_code == 200
    assert refunds.get_json()["data"]["meta"]["total"] == 1

    transactions = client.get(
        "/api/v1/billing/transactions?method=CASH", headers=auth(tokens["admin"])
    )
    assert transactions.status_code == 200
    assert transactions.get_json()["data"]["meta"]["total"] == 1
    transaction_item = transactions.get_json()["data"]["items"][0]
    assert transaction_item["invoice_number"] == invoice["invoice_number"]

    assert client.get("/api/v1/billing/void-requests").status_code == 401


def test_audit_search_and_rbac(client, tokens):
    response = client.get(
        "/api/v1/admin/audit-events?q=login&sort=-created_at", headers=auth(tokens["admin"])
    )
    assert response.status_code == 200, response.get_json()
    items = response.get_json()["data"]["items"]
    assert items
    assert any("login" in item["action"] for item in items)
    assert items[0]["actor_name"]

    assert (
        client.get("/api/v1/admin/audit-events", headers=auth(tokens["doctor"])).status_code == 403
    )
    assert client.get("/api/v1/admin/audit-events").status_code == 401


def test_admin_visits_and_ai_interaction_lists(client, tokens, ids):
    create_visit_flow(client, tokens, ids)
    visits = client.get("/api/v1/admin/visits", headers=auth(tokens["admin"]))
    assert visits.status_code == 200, visits.get_json()
    assert visits.get_json()["data"]["meta"]["total"] >= 1
    assert visits.get_json()["data"]["items"][0]["patient_name"]

    triage = client.post("/api/v1/ai/triage", json={"symptoms": "fever and cough"})
    assert triage.status_code == 200, triage.get_json()

    interactions = client.get("/api/v1/admin/ai-interactions", headers=auth(tokens["admin"]))
    assert interactions.status_code == 200, interactions.get_json()
    assert interactions.get_json()["data"]["meta"]["total"] >= 1

    assert client.get("/api/v1/admin/visits", headers=auth(tokens["reception"])).status_code == 403
    assert (
        client.get("/api/v1/admin/ai-interactions", headers=auth(tokens["patient"])).status_code
        == 403
    )


def test_report_exports_list_is_admin_only(client, tokens):
    response = client.get("/api/v1/reports/exports", headers=auth(tokens["admin"]))
    assert response.status_code == 200
    assert "items" in response.get_json()["data"]
    assert client.get("/api/v1/reports/exports", headers=auth(tokens["cashier"])).status_code == 403
    assert client.get("/api/v1/reports/exports").status_code == 401
