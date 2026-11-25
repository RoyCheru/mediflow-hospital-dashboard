"""Encounter billing workflow: reception -> doctor -> cashier.

Registration opens a draft bill with the consultation fee; the doctor orders
priced services on it and submits it; the cashier collects payment against it.
"""

import uuid
from uuid import UUID

from app.audit.models import AuditLog
from app.common.enums import Role
from app.extensions import db
from tests.conftest import login, make_user
from tests.helpers import auth, priced_service


def _walk_in(client, tokens, ids, idempotency_key=None):
    headers = auth(tokens["reception"])
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    response = client.post(
        "/api/v1/appointments/walk-in",
        json={
            "doctor_id": str(ids["doctor_id"]),
            "service_id": str(ids["service_id"]),
            "patient": {
                "first_name": "Encounter",
                "last_name": "Billing",
                "date_of_birth": "1984-04-04",
                "phone": "0713456789",
            },
        },
        headers=headers,
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]


def _start(client, tokens, appointment_id):
    response = client.post(
        f"/api/v1/appointments/{appointment_id}/visits",
        json={"presenting_complaint": "Cough"},
        headers=auth(tokens["doctor"]),
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]


def _bill(client, token, visit_id):
    return client.get(f"/api/v1/visits/{visit_id}/invoice", headers=auth(token))


def _second_doctor_token(client, ids):
    from app.scheduling.models import DoctorProfile

    user = make_user(
        "doctor2@test.local", "0700000099", "Doctor12345!", Role.DOCTOR, "Other", "Doctor"
    )
    db.session.add(
        DoctorProfile(
            user_id=user.id,
            department_id=ids["department_id"],
            license_number="KMPDC-OTHER",
            consultation_fee_minor=100000,
        )
    )
    db.session.commit()
    return login(client, "doctor2@test.local", "Doctor12345!")


def test_registration_opens_one_draft_with_the_consultation_fee(client, tokens, ids):
    from app.billing.models import Invoice

    first = _walk_in(client, tokens, ids, idempotency_key="register-encounter")
    again = _walk_in(client, tokens, ids, idempotency_key="register-encounter")
    assert again["id"] == first["id"]

    drafts = Invoice.query.filter_by(appointment_id=UUID(first["id"])).all()
    assert len(drafts) == 1
    draft = drafts[0]
    assert draft.status.value == "DRAFT" and draft.invoice_number is None
    assert str(draft.patient_id) == first["patient_id"]
    assert str(draft.department_id) == str(ids["department_id"])
    assert [(line.service_id, line.unit_price_minor) for line in draft.lines] == [
        (ids["service_id"], 500000)  # the configured service price
    ]


def test_doctor_orders_priced_services_and_totals_follow(client, tokens, ids):
    appointment = _walk_in(client, tokens, ids)
    visit = _start(client, tokens, appointment["id"])
    lab = priced_service(ids, "LAB-FBC", "Full blood count", 120000)

    bill = _bill(client, tokens["doctor"], visit["id"])
    assert bill.status_code == 200, bill.get_json()
    invoice = bill.get_json()["data"]
    assert invoice["status"] == "DRAFT" and invoice["visit_id"] == visit["id"]
    assert invoice["total_minor"] == 500000

    added = client.post(
        f"/api/v1/invoices/{invoice['id']}/lines",
        json={"service_id": str(lab.id), "quantity": 2},
        headers=auth(tokens["doctor"]),
    )
    assert added.status_code == 201, added.get_json()
    after = added.get_json()["data"]
    assert after["subtotal_minor"] == after["total_minor"] == 740000
    lab_line = next(line for line in after["lines"] if line["service_id"] == str(lab.id))
    assert lab_line["unit_price_minor"] == 120000 and lab_line["line_total_minor"] == 240000

    removed = client.delete(
        f"/api/v1/invoices/{invoice['id']}/lines/{lab_line['id']}",
        headers=auth(tokens["doctor"]),
    )
    assert removed.status_code == 200
    assert removed.get_json()["data"]["total_minor"] == 500000

    entry = AuditLog.query.filter_by(action="invoice.line_add").first()
    assert entry is not None and entry.after["line_total_minor"] == 240000


def test_doctor_cannot_set_prices_or_drop_the_consultation(client, tokens, ids):
    appointment = _walk_in(client, tokens, ids)
    visit = _start(client, tokens, appointment["id"])
    invoice = _bill(client, tokens["doctor"], visit["id"]).get_json()["data"]
    lines_url = f"/api/v1/invoices/{invoice['id']}/lines"
    headers = auth(tokens["doctor"])

    lab = priced_service(ids, "LAB-FBC", "Full blood count", 120000)
    priced = client.post(
        lines_url, json={"service_id": str(lab.id), "unit_price_minor": 1}, headers=headers
    )
    assert priced.status_code == 400
    free_text = client.post(
        lines_url, json={"description": "Anything", "unit_price_minor": 999}, headers=headers
    )
    assert free_text.status_code == 400
    retired = priced_service(ids, "LAB-OLD", "Retired test", 1000, active=False)
    assert (
        client.post(lines_url, json={"service_id": str(retired.id)}, headers=headers).status_code
        == 400
    )

    consultation = invoice["lines"][0]
    refused = client.delete(f"{lines_url}/{consultation['id']}", headers=headers)
    assert refused.status_code == 403
    assert _bill(client, tokens["doctor"], visit["id"]).get_json()["data"]["total_minor"] == 500000


def test_another_doctor_cannot_see_or_change_the_bill(client, tokens, ids):
    appointment = _walk_in(client, tokens, ids)
    visit = _start(client, tokens, appointment["id"])
    invoice = _bill(client, tokens["doctor"], visit["id"]).get_json()["data"]
    other = _second_doctor_token(client, ids)
    lab = priced_service(ids, "LAB-FBC", "Full blood count", 120000)

    assert _bill(client, other, visit["id"]).status_code == 403
    assert (
        client.post(
            f"/api/v1/invoices/{invoice['id']}/lines",
            json={"service_id": str(lab.id)},
            headers=auth(other),
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/visits/{visit['id']}/invoices/finalize", json={}, headers=auth(other)
        ).status_code
        == 403
    )
    assert _bill(client, tokens["patient"], visit["id"]).status_code == 403


def test_doctor_submits_the_bill_after_completing_and_it_is_then_locked(client, tokens, ids):
    appointment = _walk_in(client, tokens, ids)
    visit = _start(client, tokens, appointment["id"])
    invoice = _bill(client, tokens["doctor"], visit["id"]).get_json()["data"]
    lab = priced_service(ids, "LAB-FBC", "Full blood count", 120000)
    client.post(
        f"/api/v1/invoices/{invoice['id']}/lines",
        json={"service_id": str(lab.id)},
        headers=auth(tokens["doctor"]),
    )
    finalize_url = f"/api/v1/visits/{visit['id']}/invoices/finalize"

    early = client.post(finalize_url, json={}, headers=auth(tokens["doctor"]))
    assert early.status_code == 409  # the consultation is still open

    client.post(f"/api/v1/visits/{visit['id']}/complete", headers=auth(tokens["doctor"]))
    discount = client.post(
        finalize_url,
        json={"discount_minor": 1000, "discount_reason": "x"},
        headers=auth(tokens["doctor"]),
    )
    assert discount.status_code == 400

    submitted = client.post(finalize_url, json={}, headers=auth(tokens["doctor"]))
    assert submitted.status_code == 201, submitted.get_json()
    final = submitted.get_json()["data"]
    assert final["id"] == invoice["id"]
    assert final["status"] == "ISSUED" and final["invoice_number"].startswith("INV-")
    assert final["total_minor"] == final["balance_minor"] == 620000

    locked = client.post(
        f"/api/v1/invoices/{invoice['id']}/lines",
        json={"service_id": str(lab.id)},
        headers=auth(tokens["cashier"]),
    )
    assert locked.status_code == 409
    again = client.post(finalize_url, json={}, headers=auth(tokens["doctor"]))
    assert again.status_code == 409
    from app.auth.models import User

    doctor_user = User.query.filter_by(email="doctor@test.local").one()
    audit = AuditLog.query.filter_by(action="invoice.finalize").one()
    assert audit.actor_user_id == doctor_user.id


def _submitted_invoice(client, tokens, ids):
    appointment = _walk_in(client, tokens, ids)
    visit = _start(client, tokens, appointment["id"])
    client.post(f"/api/v1/visits/{visit['id']}/complete", headers=auth(tokens["doctor"]))
    response = client.post(
        f"/api/v1/visits/{visit['id']}/invoices/finalize", json={}, headers=auth(tokens["doctor"])
    )
    assert response.status_code == 201, response.get_json()
    return visit, response.get_json()["data"]


def test_cashier_finds_invoices_awaiting_payment(client, tokens, ids):
    visit, invoice = _submitted_invoice(client, tokens, ids)
    headers = auth(tokens["cashier"])

    def found(query):
        response = client.get(f"/api/v1/invoices?{query}", headers=headers)
        assert response.status_code == 200, response.get_json()
        return [item["id"] for item in response.get_json()["data"]["items"]]

    assert invoice["id"] in found("status=ISSUED,PARTIALLY_PAID")
    assert invoice["id"] not in found("status=PAID")
    assert invoice["id"] in found(f"q={invoice['invoice_number']}")
    assert invoice["id"] in found(f"q={invoice['patient_number']}")
    assert invoice["id"] in found("q=Billing")
    assert invoice["id"] in found(f"q={visit['id'][:8]}")  # encounter reference
    assert client.get("/api/v1/invoices?status=NOPE", headers=headers).status_code == 400


def test_cashier_collects_partial_then_verified_mpesa_payment(client, tokens, ids):
    _, invoice = _submitted_invoice(client, tokens, ids)
    headers = {**auth(tokens["cashier"]), "Idempotency-Key": "cash-part"}
    pay_url = f"/api/v1/invoices/{invoice['id']}/transactions"

    cash = client.post(pay_url, json={"method": "CASH", "amount_minor": 200000}, headers=headers)
    replay = client.post(pay_url, json={"method": "CASH", "amount_minor": 200000}, headers=headers)
    assert (
        cash.status_code == 201 and replay.get_json()["data"]["id"] == cash.get_json()["data"]["id"]
    )

    state = client.get(f"/api/v1/invoices/{invoice['id']}", headers=auth(tokens["cashier"]))
    state = state.get_json()["data"]
    assert state["status"] == "PARTIALLY_PAID"
    assert state["amount_paid_minor"] == 200000 and state["balance_minor"] == 300000

    intent = client.post(
        f"/api/v1/invoices/{invoice['id']}/payment-intents",
        json={"amount_minor": 300000, "phone": "0712345678"},
        headers={**auth(tokens["cashier"]), "Idempotency-Key": str(uuid.uuid4())},
    ).get_json()["data"]
    pending = client.get(f"/api/v1/invoices/{invoice['id']}", headers=auth(tokens["cashier"]))
    assert pending.get_json()["data"]["status"] == "PARTIALLY_PAID"  # not paid on request

    client.post(
        "/api/v1/webhooks/mpesa/daraja",
        json={
            "Body": {
                "stkCallback": {
                    "CheckoutRequestID": intent["checkout_request_id"],
                    "ResultCode": 0,
                    "ResultDesc": "Success",
                    "CallbackMetadata": {
                        "Item": [
                            {"Name": "Amount", "Value": 3000},
                            {"Name": "MpesaReceiptNumber", "Value": "QKENCOUNTER1"},
                        ]
                    },
                }
            }
        },
    )
    paid = client.get(f"/api/v1/invoices/{invoice['id']}", headers=auth(tokens["cashier"]))
    paid = paid.get_json()["data"]
    assert paid["status"] == "PAID" and paid["balance_minor"] == 0

    history = client.get(
        f"/api/v1/billing/transactions?invoice_id={invoice['id']}", headers=auth(tokens["cashier"])
    ).get_json()["data"]["items"]
    assert sorted((t["method"], t["amount_minor"]) for t in history) == [
        ("CASH", 200000),
        ("MPESA", 300000),
    ]
    receipt = client.get(
        f"/api/v1/transactions/{cash.get_json()['data']['id']}/receipt",
        headers=auth(tokens["cashier"]),
    )
    assert receipt.status_code == 200 and receipt.data.startswith(b"%PDF")
