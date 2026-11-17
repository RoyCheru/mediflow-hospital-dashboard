"""Money-integrity guards: row locking, callback checks, void rules, idempotency."""

from uuid import UUID, uuid4

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


def test_void_refused_while_payments_remain_until_refunded(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    payment = client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={"method": "CASH", "amount_minor": 100_000},
        headers=auth(tokens["cashier"]),
    )
    assert payment.status_code == 201, payment.get_json()

    refused = client.post(
        f"/api/v1/invoices/{invoice['id']}/void-requests",
        json={"reason": "Wrong patient"},
        headers=auth(tokens["reception"]),
    )
    assert refused.status_code == 409
    assert refused.get_json()["error"]["details"]["net_paid_minor"] == 100_000

    refund = client.post(
        f"/api/v1/transactions/{payment.get_json()['data']['id']}/refund-requests",
        json={"amount_minor": 100_000, "reason": "Wrong patient"},
        headers=auth(tokens["cashier"]),
    )
    assert refund.status_code == 201, refund.get_json()
    decided = client.post(
        f"/api/v1/refunds/{refund.get_json()['data']['id']}/decision",
        json={"approve": True},
        headers=auth(tokens["admin"]),
    )
    assert decided.status_code == 200, decided.get_json()

    assert _void_invoice(client, tokens, invoice["id"]).status_code == 200
    assert _invoice(client, tokens, invoice["id"])["status"] == "VOIDED"


def test_void_approval_rechecks_money_received_after_request(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    request = client.post(
        f"/api/v1/invoices/{invoice['id']}/void-requests",
        json={"reason": "Duplicate"},
        headers=auth(tokens["reception"]),
    )
    assert request.status_code == 201
    paid = client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={"method": "CASH", "amount_minor": 50_000},
        headers=auth(tokens["cashier"]),
    )
    assert paid.status_code == 201
    decision = client.post(
        f"/api/v1/void-requests/{request.get_json()['data']['id']}/decision",
        json={"approve": True, "reason": "ok"},
        headers=auth(tokens["admin"]),
    )
    assert decision.status_code == 409
    assert _invoice(client, tokens, invoice["id"])["status"] == "PARTIALLY_PAID"


def test_void_refused_while_sha_claim_is_open(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    claim = client.post(
        f"/api/v1/invoices/{invoice['id']}/claims",
        json={"member_reference": "SHA-DEMO-ACTIVE", "amount_minor": 100_000},
        headers=auth(tokens["reception"]),
    )
    assert claim.status_code == 201, claim.get_json()
    refused = client.post(
        f"/api/v1/invoices/{invoice['id']}/void-requests",
        json={"reason": "Duplicate"},
        headers=auth(tokens["reception"]),
    )
    assert refused.status_code == 409
    assert refused.get_json()["error"]["details"]["open_claim_ids"] == [
        claim.get_json()["data"]["id"]
    ]


def _claim(client, tokens, invoice_id, amount):
    return client.post(
        f"/api/v1/invoices/{invoice_id}/claims",
        json={"member_reference": "SHA-DEMO-ACTIVE", "amount_minor": amount},
        headers=auth(tokens["reception"]),
    )


def test_claim_cannot_exceed_balance_after_partial_payment(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    paid = client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={"method": "CASH", "amount_minor": 100_000},
        headers=auth(tokens["cashier"]),
    )
    assert paid.status_code == 201
    balance = invoice["total_minor"] - 100_000

    too_much = _claim(client, tokens, invoice["id"], invoice["total_minor"])
    assert too_much.status_code == 400
    assert too_much.get_json()["error"]["details"]["balance_minor"] == balance

    exact = _claim(client, tokens, invoice["id"], balance)
    assert exact.status_code == 201, exact.get_json()


def test_second_open_claim_on_same_invoice_is_refused(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    assert _claim(client, tokens, invoice["id"], 100_000).status_code == 201
    second = _claim(client, tokens, invoice["id"], 100_000)
    assert second.status_code == 409


def test_resubmitted_claim_is_capped_at_balance(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    claim = _claim(client, tokens, invoice["id"], 200_000).get_json()["data"]
    rejected = client.post(
        f"/api/v1/claims/{claim['id']}/status",
        json={"status": "REJECTED", "rejection_reason": "Missing documents"},
        headers=auth(tokens["admin"]),
    )
    assert rejected.status_code == 200, rejected.get_json()
    too_much = client.post(
        f"/api/v1/claims/{claim['id']}/resubmissions",
        json={"amount_minor": invoice["total_minor"] + 1, "note": "retry"},
        headers=auth(tokens["admin"]),
    )
    assert too_much.status_code == 400
    ok = client.post(
        f"/api/v1/claims/{claim['id']}/resubmissions",
        json={"amount_minor": 200_000, "note": "Documents attached"},
        headers=auth(tokens["admin"]),
    )
    assert ok.status_code == 201, ok.get_json()


def test_cash_payment_with_idempotency_key_is_recorded_once(client, tokens, ids):
    from app.billing.models import Transaction

    _, _, invoice = create_invoice_flow(client, tokens, ids)
    headers = {**auth(tokens["cashier"]), "Idempotency-Key": "cash-dbl-click"}
    body = {"method": "CASH", "amount_minor": 100_000, "tendered_minor": 100_000}
    first = client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions", json=body, headers=headers
    )
    replay = client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions", json=body, headers=headers
    )
    assert first.status_code == 201, first.get_json()
    assert replay.status_code == 201
    assert replay.get_json() == first.get_json()
    assert Transaction.query.filter_by(invoice_id=UUID(invoice["id"])).count() == 1
    assert _invoice(client, tokens, invoice["id"])["amount_paid_minor"] == 100_000

    changed = client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={**body, "amount_minor": 50_000},
        headers=headers,
    )
    assert changed.status_code == 409


def test_payment_intent_replay_keeps_response_envelope(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    headers = {**auth(tokens["reception"]), "Idempotency-Key": "stk-replay"}
    body = {"amount_minor": 100_000, "phone": "0700000005"}
    first = client.post(
        f"/api/v1/invoices/{invoice['id']}/payment-intents", json=body, headers=headers
    )
    replay = client.post(
        f"/api/v1/invoices/{invoice['id']}/payment-intents", json=body, headers=headers
    )
    assert first.status_code == replay.status_code == 201
    assert replay.get_json() == first.get_json()
    assert "data" in replay.get_json()


def test_cash_totals_use_the_hospital_business_day(client, tokens, ids):
    from datetime import date, datetime, timezone

    from app.billing.models import Transaction
    from app.extensions import db

    _, _, invoice = create_invoice_flow(client, tokens, ids)
    # 22:30 UTC on 2030-03-04 is 01:30 on 2030-03-05 in Africa/Nairobi.
    db.session.add(
        Transaction(
            invoice_id=UUID(invoice["id"]),
            method="CASH",
            amount_minor=70_000,
            status="SUCCESS",
            reference="CASH-NIGHT-SHIFT",
            paid_at=datetime(2030, 3, 4, 22, 30, tzinfo=timezone.utc),
        )
    )
    db.session.commit()

    def expected(day):
        response = client.get(
            f"/api/v1/billing/cash-summary?date={day.isoformat()}",
            headers=auth(tokens["cashier"]),
        )
        assert response.status_code == 200, response.get_json()
        return response.get_json()["data"]["cash_expected_minor"]

    assert expected(date(2030, 3, 4)) == 0
    assert expected(date(2030, 3, 5)) == 70_000

    logged = client.post(
        "/api/v1/billing/cash-reconciliations",
        json={"business_date": "2030-03-05", "counted_cash_minor": 70_000},
        headers=auth(tokens["cashier"]),
    )
    assert logged.status_code == 201, logged.get_json()
    assert logged.get_json()["data"]["status"] == "BALANCED"


def test_invoice_list_date_filter_uses_hospital_day(client, tokens, ids):
    from datetime import datetime, timezone

    from app.billing.models import Invoice
    from app.extensions import db

    _, _, invoice = create_invoice_flow(client, tokens, ids)
    row = db.session.get(Invoice, UUID(invoice["id"]))
    # 21:30 UTC on 2030-03-04 is 00:30 on 2030-03-05 in Africa/Nairobi.
    row.created_at = datetime(2030, 3, 4, 21, 30, tzinfo=timezone.utc)
    db.session.commit()

    def listed(day):
        response = client.get(
            f"/api/v1/invoices?date_from={day}&date_to={day}",
            headers=auth(tokens["cashier"]),
        )
        assert response.status_code == 200, response.get_json()
        return {item["id"] for item in response.get_json()["data"]["items"]}

    assert invoice["id"] not in listed("2030-03-04")
    assert invoice["id"] in listed("2030-03-05")
    bad = client.get("/api/v1/invoices?date_from=nope", headers=auth(tokens["cashier"]))
    assert bad.status_code == 400
