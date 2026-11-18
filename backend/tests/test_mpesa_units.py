"""Daraja amounts are whole shillings; MediFlow stores minor units (cents)."""

from app.billing.models import Transaction
from app.integrations import mpesa
from tests.helpers import auth, create_invoice_flow


def test_conversion_helpers():
    assert mpesa.minor_to_shillings(500000) == 5000
    assert mpesa.shillings_to_minor(5000) == 500000
    assert mpesa.shillings_to_minor("5000.00") == 500000
    assert mpesa.shillings_to_minor(1.5) == 150


def test_daraja_stk_push_sends_whole_shillings(app, monkeypatch):
    sent = {}

    class Response:
        status_code = 200

        def __init__(self, body):
            self._body = body

        def json(self):
            return self._body

    def fake_post(url, json=None, headers=None, timeout=None):
        sent["payload"] = json
        return Response(
            {"ResponseCode": "0", "CheckoutRequestID": "ws_CO_1", "MerchantRequestID": "MR_1"}
        )

    monkeypatch.setattr(mpesa.requests, "post", fake_post)
    monkeypatch.setattr(mpesa.DarajaMpesaGateway, "_token", lambda self: "token")
    app.config.update(
        MPESA_SHORTCODE="174379",
        MPESA_PASSKEY="passkey",
        MPESA_BASE_URL="https://sandbox.example",
        MPESA_CALLBACK_URL="https://example.test/callback",
    )
    with app.app_context():
        mpesa.DarajaMpesaGateway().stk_push("0700000005", 500000, "INV-1", "Payment")
    assert sent["payload"]["Amount"] == 5000


def test_payment_intent_rejects_fractional_shillings(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    response = client.post(
        f"/api/v1/invoices/{invoice['id']}/payment-intents",
        json={"amount_minor": 100050, "phone": "0700000005"},
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 400


def test_callback_amount_in_shillings_settles_the_invoice(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    intent = client.post(
        f"/api/v1/invoices/{invoice['id']}/payment-intents",
        json={"amount_minor": invoice["total_minor"], "phone": "0700000005"},
        headers=auth(tokens["reception"]),
    ).get_json()["data"]
    client.post(
        "/api/v1/webhooks/mpesa/daraja",
        json={
            "Body": {
                "stkCallback": {
                    "CheckoutRequestID": intent["checkout_request_id"],
                    "ResultCode": 0,
                    "CallbackMetadata": {
                        "Item": [
                            {"Name": "Amount", "Value": invoice["total_minor"] / 100},
                            {"Name": "MpesaReceiptNumber", "Value": "QKUNITS01"},
                        ]
                    },
                }
            }
        },
    )
    transaction = Transaction.query.filter_by(reference="QKUNITS01").one()
    assert transaction.amount_minor == invoice["total_minor"]
    assert transaction.status.value == "SUCCESS"
    updated = client.get(
        f"/api/v1/invoices/{invoice['id']}", headers=auth(tokens["cashier"])
    ).get_json()["data"]
    assert updated["status"] == "PAID"
