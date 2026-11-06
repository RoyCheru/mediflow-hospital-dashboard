from tests.helpers import auth, create_invoice_flow


def test_revenue_report_after_payment(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={"method": "CASH", "amount_minor": 500000, "tendered_minor": 500000},
        headers=auth(tokens["cashier"]),
    )
    response = client.get(
        "/api/v1/reports/revenue",
        headers=auth(tokens["admin"]),
    )
    assert response.status_code == 200, response.get_json()
    data = response.get_json()["data"]
    assert data["total_minor"] == 500000
    assert data["groups"][0]["key"] == "CASH"


def test_doctor_sees_only_own_stats(client, tokens, ids):
    create_invoice_flow(client, tokens, ids)
    response = client.get(
        "/api/v1/reports/my-stats",
        headers=auth(tokens["doctor"]),
    )
    assert response.status_code == 200
    assert response.get_json()["data"]["patients_seen"] == 1

    denied = client.get("/api/v1/reports/revenue", headers=auth(tokens["doctor"]))
    assert denied.status_code == 403


def test_report_export_creation(client, tokens):
    response = client.post(
        "/api/v1/reports/exports",
        json={
            "report_key": "revenue",
            "format": "CSV",
            "parameters": {},
        },
        headers=auth(tokens["admin"]),
    )
    assert response.status_code == 201, response.get_json()
    assert response.get_json()["data"]["status"] == "QUEUED"
