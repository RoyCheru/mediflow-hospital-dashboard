from tests.helpers import auth, create_invoice_flow


def test_cash_payment_updates_invoice(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    assert invoice["total_minor"] == 500000
    assert invoice["status"] == "ISSUED"

    payment = client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={
            "method": "CASH",
            "amount_minor": 500000,
            "tendered_minor": 600000,
        },
        headers=auth(tokens["cashier"]),
    )
    assert payment.status_code == 201, payment.get_json()
    transaction = payment.get_json()["data"]
    assert transaction["change_minor"] == 100000
    assert transaction["status"] == "SUCCESS"

    updated = client.get(
        f"/api/v1/invoices/{invoice['id']}", headers=auth(tokens["cashier"])
    ).get_json()["data"]
    assert updated["status"] == "PAID"
    assert updated["balance_minor"] == 0
    assert updated["amount_paid_minor"] == 500000


def test_partial_payment_and_balance(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={"method": "CASH", "amount_minor": 200000, "tendered_minor": 200000},
        headers=auth(tokens["cashier"]),
    )
    updated = client.get(
        f"/api/v1/invoices/{invoice['id']}", headers=auth(tokens["cashier"])
    ).get_json()["data"]
    assert updated["status"] == "PARTIALLY_PAID"
    assert updated["balance_minor"] == 300000


def test_mpesa_callback_is_idempotent(client, tokens, ids, app):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    intent = client.post(
        f"/api/v1/invoices/{invoice['id']}/payment-intents",
        json={"amount_minor": 500000, "phone": "0700000005"},
        headers={**auth(tokens["reception"]), "Idempotency-Key": "intent-1"},
    )
    assert intent.status_code == 201, intent.get_json()
    intent_data = intent.get_json()["data"]
    checkout_id = intent_data["checkout_request_id"]

    payload = {
        "Body": {
            "stkCallback": {
                "CheckoutRequestID": checkout_id,
                "ResultCode": 0,
                "ResultDesc": "Success",
                "CallbackMetadata": {
                    "Item": [
                        {"Name": "Amount", "Value": 500000},
                        {"Name": "MpesaReceiptNumber", "Value": "QK123456"},
                    ]
                },
            }
        }
    }
    callback = client.post("/api/v1/webhooks/mpesa/daraja", json=payload)
    assert callback.status_code == 200

    updated = client.get(
        f"/api/v1/invoices/{invoice['id']}", headers=auth(tokens["cashier"])
    ).get_json()["data"]
    assert updated["status"] == "PAID"

    second = client.post("/api/v1/webhooks/mpesa/daraja", json=payload)
    assert second.status_code == 200

    from app.billing.models import Transaction
    from app.extensions import db

    count = db.session.query(Transaction).filter_by(reference="QK123456").count()
    assert count == 1


def test_void_requires_admin_approval(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    request = client.post(
        f"/api/v1/invoices/{invoice['id']}/void-requests",
        json={"reason": "Wrong service billed"},
        headers=auth(tokens["reception"]),
    )
    assert request.status_code == 201, request.get_json()
    request_id = request.get_json()["data"]["id"]

    decision = client.post(
        f"/api/v1/void-requests/{request_id}/decision",
        json={"approve": True, "reason": "Verified"},
        headers=auth(tokens["admin"]),
    )
    assert decision.status_code == 200
    updated = client.get(
        f"/api/v1/invoices/{invoice['id']}", headers=auth(tokens["admin"])
    ).get_json()["data"]
    assert updated["status"] == "VOIDED"


def test_patient_cannot_create_invoice(client, tokens, ids):
    from tests.helpers import create_visit_flow

    _, visit = create_visit_flow(client, tokens, ids)
    response = client.post(
        f"/api/v1/visits/{visit['id']}/invoices",
        json={},
        headers=auth(tokens["patient"]),
    )
    assert response.status_code == 403


def test_payment_queues_receipt_notifications(client, tokens, ids, app):
    from app.common.enums import OutboxStatus
    from app.common.models import OutboxEvent
    from app.extensions import db
    from app.notifications.models import Notification
    from app.notifications.service import queue_event_notifications

    _, _, invoice = create_invoice_flow(client, tokens, ids)
    response = client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={"method": "CASH", "amount_minor": 500000, "tendered_minor": 500000},
        headers=auth(tokens["cashier"]),
    )
    assert response.status_code == 201
    reference = response.get_json()["data"]["reference"]

    with app.app_context():
        event = OutboxEvent.query.filter_by(
            event_type="payment.received", status=OutboxStatus.PENDING
        ).first()
        assert event is not None
        queue_event_notifications(event)
        db.session.commit()
        notifications = Notification.query.filter_by(template_key="receipt").all()
        assert len(notifications) == 2
        assert all(item.payload["reference"] == reference for item in notifications)
        assert all(item.payload["amount"] == "5000.00" for item in notifications)


def test_cash_discrepancy_alerts_admins(client, tokens, ids, app):
    from datetime import datetime, timezone

    from app.notifications.models import Notification

    _, _, invoice = create_invoice_flow(client, tokens, ids)
    client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={"method": "CASH", "amount_minor": 500000, "tendered_minor": 500000},
        headers=auth(tokens["cashier"]),
    )
    response = client.post(
        "/api/v1/billing/cash-reconciliations",
        json={
            "business_date": datetime.now(timezone.utc).date().isoformat(),
            "counted_cash_minor": 600000,
        },
        headers=auth(tokens["cashier"]),
    )
    assert response.status_code == 201, response.get_json()
    with app.app_context():
        alerts = Notification.query.filter_by(template_key="cash_variance_alert").all()
        assert len(alerts) == 1
        assert alerts[0].payload["variance"] == "1000.00"
