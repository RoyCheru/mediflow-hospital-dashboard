"""Webhook authentication: SHA claim-status (HMAC) and M-Pesa (URL token)."""

import hashlib
import hmac
import json

from tests.helpers import auth, create_invoice_flow
from tests.test_billing_integrity import _stk_intent


def _sha_claim(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    response = client.post(
        f"/api/v1/invoices/{invoice['id']}/claims",
        json={"sha_member_reference": "SHA-DEMO-ACTIVE", "amount_minor": 100000},
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]


def _post_sha(client, body, signature=None):
    raw = json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if signature is not None:
        headers["X-SHA-Signature"] = signature
    return client.post("/api/v1/webhooks/sha/claim-status", data=raw, headers=headers), raw


def test_sha_callback_is_refused_without_a_configured_secret(client, tokens, ids):
    claim = _sha_claim(client, tokens, ids)
    response, _ = _post_sha(
        client, {"claim_reference": claim["external_reference"], "status": "approved"}, "x"
    )
    assert response.status_code == 401


def test_sha_callback_requires_a_valid_signature(client, tokens, ids, app):
    app.config["SHA_CALLBACK_SECRET"] = "sha-test-secret"
    claim = _sha_claim(client, tokens, ids)
    body = {
        "claim_reference": claim["external_reference"],
        "status": "approved",
        "approved_amount_minor": 999999999,
    }
    unsigned, _ = _post_sha(client, body)
    assert unsigned.status_code == 401
    forged, _ = _post_sha(client, body, "0" * 64)
    assert forged.status_code == 401
    claim_now = client.get(f"/api/v1/claims/{claim['id']}", headers=auth(tokens["admin"]))
    assert claim_now.get_json()["data"]["status"] == claim["status"]

    raw = json.dumps({"claim_reference": claim["external_reference"], "status": "under_review"})
    signature = hmac.new(b"sha-test-secret", raw.encode(), hashlib.sha256).hexdigest()
    signed = client.post(
        "/api/v1/webhooks/sha/claim-status",
        data=raw,
        headers={"Content-Type": "application/json", "X-SHA-Signature": signature},
    )
    assert signed.status_code == 200, signed.get_json()
    assert signed.get_json()["data"]["status"] == "UNDER_REVIEW"


def _mpesa_callback(client, intent, amount_minor, receipt, token=None):
    url = "/api/v1/webhooks/mpesa/daraja" + (f"?token={token}" if token is not None else "")
    return client.post(
        url,
        json={
            "Body": {
                "stkCallback": {
                    "CheckoutRequestID": intent["checkout_request_id"],
                    "ResultCode": 0,
                    "ResultDesc": "Success",
                    "CallbackMetadata": {
                        "Item": [
                            {"Name": "Amount", "Value": amount_minor // 100},
                            {"Name": "MpesaReceiptNumber", "Value": receipt},
                        ]
                    },
                }
            }
        },
    )


def test_mpesa_callback_token_is_required_once_a_secret_is_set(client, tokens, ids, app):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    intent = _stk_intent(client, tokens, invoice, invoice["total_minor"], "token-check")
    app.config["MPESA_CALLBACK_SECRET"] = "mpesa-test-secret"

    assert _mpesa_callback(client, intent, invoice["total_minor"], "QKFORGED1").status_code == 401
    wrong = _mpesa_callback(client, intent, invoice["total_minor"], "QKFORGED2", token="nope")
    assert wrong.status_code == 401
    paid = client.get(f"/api/v1/invoices/{invoice['id']}", headers=auth(tokens["cashier"]))
    assert paid.get_json()["data"]["amount_paid_minor"] == 0

    ok = _mpesa_callback(
        client, intent, invoice["total_minor"], "QKREAL1", token="mpesa-test-secret"
    )
    assert ok.status_code == 200
    paid = client.get(f"/api/v1/invoices/{invoice['id']}", headers=auth(tokens["cashier"]))
    assert paid.get_json()["data"]["amount_paid_minor"] == invoice["total_minor"]


def test_live_mpesa_mode_refuses_callbacks_without_a_secret(app):
    from app.integrations.mpesa import DarajaMpesaGateway, callback_url_with_token

    with app.test_request_context():
        app.config["MPESA_CALLBACK_SECRET"] = ""
        assert DarajaMpesaGateway().verify_callback({}, {}, {"token": ""}) is False
        app.config["MPESA_CALLBACK_SECRET"] = "s3cret"
        assert DarajaMpesaGateway().verify_callback({}, {}, {"token": "s3cret"}) is True
        assert (
            callback_url_with_token("https://api.example.com/mpesa?x=1")
            == "https://api.example.com/mpesa?x=1&token=s3cret"
        )
