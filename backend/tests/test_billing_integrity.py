"""Money-integrity guards: row locking, callback checks, void rules, idempotency."""

from uuid import uuid4

from sqlalchemy.dialects import postgresql

from app.billing.service import invoice_lock_query
from tests.helpers import auth, create_invoice_flow


def test_invoice_lock_query_uses_select_for_update_on_postgres(app):
    with app.app_context():
        statement = invoice_lock_query(uuid4()).statement
        sql = str(statement.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in sql


def test_second_payment_cannot_exceed_balance(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    total = invoice["total_minor"]
    first = client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={"method": "CASH", "amount_minor": total - 100},
        headers=auth(tokens["cashier"]),
    )
    assert first.status_code == 201, first.get_json()
    second = client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={"method": "CARD", "amount_minor": 200},
        headers=auth(tokens["cashier"]),
    )
    assert second.status_code == 400
    updated = client.get(
        f"/api/v1/invoices/{invoice['id']}", headers=auth(tokens["cashier"])
    ).get_json()["data"]
    assert updated["balance_minor"] == 100
    assert updated["status"] == "PARTIALLY_PAID"


def _stk_intent(client, tokens, invoice, amount, key):
    response = client.post(
        f"/api/v1/invoices/{invoice['id']}/payment-intents",
        json={"amount_minor": amount, "phone": "0700000005"},
        headers={**auth(tokens["reception"]), "Idempotency-Key": key},
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]


def _stk_callback(client, intent, amount, receipt):
    payload = {
        "Body": {
            "stkCallback": {
                "CheckoutRequestID": intent["checkout_request_id"],
                "ResultCode": 0,
                "ResultDesc": "Success",
                "CallbackMetadata": {
                    "Item": [
                        {"Name": "Amount", "Value": amount},
                        {"Name": "MpesaReceiptNumber", "Value": receipt},
                    ]
                },
            }
        }
    }
    response = client.post("/api/v1/webhooks/mpesa/daraja", json=payload)
    assert response.status_code == 200
    return response


def _void_invoice(client, tokens, invoice_id):
    request = client.post(
        f"/api/v1/invoices/{invoice_id}/void-requests",
        json={"reason": "Issued in error"},
        headers=auth(tokens["reception"]),
    )
    assert request.status_code == 201, request.get_json()
    return client.post(
        f"/api/v1/void-requests/{request.get_json()['data']['id']}/decision",
        json={"approve": True, "reason": "Verified"},
        headers=auth(tokens["admin"]),
    )


def _reconciliation(client, tokens):
    return client.get("/api/v1/billing/reconciliation", headers=auth(tokens["cashier"])).get_json()[
        "data"
    ]


def _invoice(client, tokens, invoice_id):
    return client.get(f"/api/v1/invoices/{invoice_id}", headers=auth(tokens["cashier"])).get_json()[
        "data"
    ]


def test_mpesa_callback_after_void_is_parked_for_reconciliation(client, tokens, ids):
    from app.notifications.models import Notification

    _, _, invoice = create_invoice_flow(client, tokens, ids)
    intent = _stk_intent(client, tokens, invoice, invoice["total_minor"], "void-race")
    assert _void_invoice(client, tokens, invoice["id"]).status_code == 200

    _stk_callback(client, intent, invoice["total_minor"], "QKVOID001")

    updated = _invoice(client, tokens, invoice["id"])
    assert updated["status"] == "VOIDED"
    assert updated["amount_paid_minor"] == 0
    queue = _reconciliation(client, tokens)
    parked = [item for item in queue["transactions"] if item["reference"] == "QKVOID001"]
    assert len(parked) == 1
    assert parked[0]["status"] == "UNCONFIRMED"
    assert "voided" in parked[0]["notes"]
    assert any(item["id"] == intent["id"] for item in queue["payment_intents"])
    assert Notification.query.filter_by(template_key="mpesa_failed_alert").count() >= 1


def test_mpesa_callback_amount_mismatch_is_not_applied(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    intent = _stk_intent(client, tokens, invoice, 100_000, "mismatch")
    _stk_callback(client, intent, 90_000, "QKMISMATCH")

    updated = _invoice(client, tokens, invoice["id"])
    assert updated["amount_paid_minor"] == 0
    assert updated["status"] == "ISSUED"
    parked = [
        item
        for item in _reconciliation(client, tokens)["transactions"]
        if item["reference"] == "QKMISMATCH"
    ]
    assert parked and "does not match" in parked[0]["notes"]


def test_second_mpesa_callback_cannot_overpay(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    total = invoice["total_minor"]
    first = _stk_intent(client, tokens, invoice, total, "double-1")
    second = _stk_intent(client, tokens, invoice, total, "double-2")
    _stk_callback(client, first, total, "QKDOUBLE1")
    _stk_callback(client, second, total, "QKDOUBLE2")

    updated = _invoice(client, tokens, invoice["id"])
    assert updated["status"] == "PAID"
    assert updated["amount_paid_minor"] == total
    assert updated["balance_minor"] == 0
    parked = [
        item
        for item in _reconciliation(client, tokens)["transactions"]
        if item["reference"] == "QKDOUBLE2"
    ]
    assert parked and "exceeds outstanding balance" in parked[0]["notes"]


def test_parked_callback_is_idempotent(client, tokens, ids):
    from app.billing.models import Transaction

    _, _, invoice = create_invoice_flow(client, tokens, ids)
    intent = _stk_intent(client, tokens, invoice, 100_000, "replay")
    _stk_callback(client, intent, 90_000, "QKREPLAY")
    _stk_callback(client, intent, 90_000, "QKREPLAY")
    assert Transaction.query.filter_by(reference="QKREPLAY").count() == 1
