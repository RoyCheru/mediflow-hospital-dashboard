from uuid import UUID

from app.analytics import service as analytics_service
from app.analytics.models import ReportExport
from app.extensions import db
from tests.helpers import auth, create_invoice_flow


def test_report_pdf_export_downloads_as_a_pdf(client, tokens):
    created = client.post(
        "/api/v1/reports/exports",
        json={"report_key": "revenue", "format": "PDF"},
        headers=auth(tokens["admin"]),
    )
    assert created.status_code == 201, created.get_json()
    export = db.session.get(ReportExport, UUID(created.get_json()["data"]["id"]))
    analytics_service.build_export(export)

    response = client.get(
        f"/api/v1/reports/exports/{export.id}/download",
        headers=auth(tokens["admin"]),
    )
    assert response.status_code == 200
    assert response.mimetype == "application/pdf"
    assert response.data.startswith(b"%PDF-1.4")


def test_invoice_and_receipt_documents_are_pdf(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    invoice_pdf = client.get(
        f"/api/v1/invoices/{invoice['id']}/pdf",
        headers=auth(tokens["cashier"]),
    )
    assert invoice_pdf.status_code == 200
    assert invoice_pdf.mimetype == "application/pdf"
    assert invoice_pdf.data.startswith(b"%PDF-1.4")

    payment = client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={"method": "CASH", "amount_minor": 500000, "tendered_minor": 500000},
        headers=auth(tokens["cashier"]),
    )
    receipt = client.get(
        f"/api/v1/transactions/{payment.get_json()['data']['id']}/receipt",
        headers=auth(tokens["cashier"]),
    )
    assert receipt.status_code == 200
    assert receipt.mimetype == "application/pdf"
    assert receipt.data.startswith(b"%PDF-1.4")


def test_manual_payment_intent_resolution_settles_the_invoice(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    intent = client.post(
        f"/api/v1/invoices/{invoice['id']}/payment-intents",
        json={"amount_minor": 500000, "phone": "0700000005"},
        headers={**auth(tokens["cashier"]), "Idempotency-Key": "phase3-intent"},
    )
    assert intent.status_code == 201, intent.get_json()
    intent_id = intent.get_json()["data"]["id"]
    resolved = client.post(
        f"/api/v1/billing/payment-intents/{intent_id}/resolve",
        json={"resolution": "SUCCESS", "notes": "Confirmed from statement"},
        headers=auth(tokens["cashier"]),
    )
    assert resolved.status_code == 200, resolved.get_json()
    assert resolved.get_json()["data"]["status"] == "SUCCESS"

    updated = client.get(
        f"/api/v1/invoices/{invoice['id']}",
        headers=auth(tokens["cashier"]),
    )
    assert updated.get_json()["data"]["status"] == "PAID"


def test_refund_requests_are_idempotent(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    payment = client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={"method": "CASH", "amount_minor": 500000, "tendered_minor": 500000},
        headers={**auth(tokens["cashier"]), "Idempotency-Key": "phase3-payment"},
    )
    assert payment.status_code == 201, payment.get_json()
    transaction_id = payment.get_json()["data"]["id"]
    body = {"amount_minor": 100000, "reason": "Phase 3 idempotency"}
    headers = {**auth(tokens["cashier"]), "Idempotency-Key": "phase3-refund"}
    first = client.post(
        f"/api/v1/transactions/{transaction_id}/refund-requests",
        json=body,
        headers=headers,
    )
    second = client.post(
        f"/api/v1/transactions/{transaction_id}/refund-requests",
        json=body,
        headers=headers,
    )
    assert first.status_code == second.status_code == 201
    assert first.get_json() == second.get_json()


def test_authenticated_user_can_update_own_profile(client, tokens):
    response = client.patch(
        "/api/v1/auth/me",
        json={"first_name": "Grace", "last_name": "Updated", "phone": "0700000003"},
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 200, response.get_json()
    assert response.get_json()["data"]["last_name"] == "Updated"
