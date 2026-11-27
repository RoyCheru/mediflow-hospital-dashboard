"""BIL-16/17 verification: role x state x action matrix, atomic and idempotent
completion, gap-free numbering, late M-Pesa callbacks, force-complete, the
transition table and the read-only violations report."""

import os
import threading
import uuid
from uuid import UUID

import pytest

from app.audit.models import AuditLog
from app.billing.models import Invoice, Transaction
from app.common.enums import InvoiceStatus, TransactionStatus
from app.extensions import db
from tests.helpers import auth, book_appointment, priced_service

ROLES = ("admin", "reception", "cashier", "doctor", "patient")
STATES = ("draft", "finalized", "partially_paid", "paid", "voided")
ACTIONS = ("cash_payment", "stk_push", "sha_claim", "direct_finalize", "edit_lines")
BILLING = {"admin", "reception", "cashier"}
PAYABLE = {"finalized", "partially_paid"}


def _open_visit(client, tokens, ids, start="2030-01-07T10:00:00+00:00"):
    appointment = book_appointment(client, tokens, ids, start=start)
    client.post(
        f"/api/v1/appointments/{appointment['id']}/check-in", headers=auth(tokens["reception"])
    )
    visit = client.post(
        f"/api/v1/appointments/{appointment['id']}/visits",
        json={"presenting_complaint": "Cough"},
        headers=auth(tokens["doctor"]),
    ).get_json()["data"]
    return appointment, visit


def _complete(client, tokens, visit_id):
    response = client.post(f"/api/v1/visits/{visit_id}/complete", headers=auth(tokens["doctor"]))
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]["invoice"]


def _invoice_in(client, tokens, ids, state):
    """An invoice of the seeded patient in the given lifecycle state."""
    _, visit = _open_visit(client, tokens, ids)
    if state == "draft":
        return Invoice.query.filter_by(visit_id=UUID(visit["id"])).one()
    invoice = _complete(client, tokens, visit["id"])
    pay_url = f"/api/v1/invoices/{invoice['id']}/transactions"
    if state == "partially_paid":
        client.post(
            pay_url,
            json={"method": "CASH", "amount_minor": 100000, "tendered_minor": 100000},
            headers=auth(tokens["cashier"]),
        )
    elif state == "paid":
        client.post(
            pay_url,
            json={"method": "CASH", "amount_minor": 500000, "tendered_minor": 500000},
            headers=auth(tokens["cashier"]),
        )
    elif state == "voided":
        request = client.post(
            f"/api/v1/invoices/{invoice['id']}/void-requests",
            json={"reason": "Entered in error"},
            headers=auth(tokens["reception"]),
        ).get_json()["data"]
        client.post(
            f"/api/v1/void-requests/{request['id']}/decision",
            json={"approve": True},
            headers=auth(tokens["admin"]),
        )
    db.session.expire_all()
    found = db.session.get(Invoice, UUID(invoice["id"]))
    expected = {
        "finalized": InvoiceStatus.ISSUED,
        "partially_paid": InvoiceStatus.PARTIALLY_PAID,
        "paid": InvoiceStatus.PAID,
        "voided": InvoiceStatus.VOIDED,
    }[state]
    assert found.status == expected
    return found


def _act(client, tokens, ids, role, action, invoice):
    headers = auth(tokens[role])
    base = f"/api/v1/invoices/{invoice.id}"
    if action == "cash_payment":
        return client.post(
            f"{base}/transactions",
            json={"method": "CASH", "amount_minor": 10000, "tendered_minor": 10000},
            headers=headers,
        )
    if action == "stk_push":
        return client.post(
            f"{base}/payment-intents",
            json={"amount_minor": 10000, "phone": "0712345678"},
            headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
        )
    if action == "sha_claim":
        return client.post(
            f"{base}/claims",
            json={"member_reference": "SHA-DEMO-ACTIVE", "amount_minor": 10000},
            headers=headers,
        )
    if action == "direct_finalize":
        return client.post(f"{base}/finalize", headers=headers)
    service = priced_service(ids, f"LAB-{uuid.uuid4().hex[:6]}", "Lab test", 10000)
    return client.post(f"{base}/lines", json={"service_id": str(service.id)}, headers=headers)


def _allowed(role, state, action):
    if action == "direct_finalize":
        return False  # nobody finalizes directly (BIL-17)
    if action == "edit_lines":
        return role == "doctor" and state == "draft"
    if action == "cash_payment" or action == "sha_claim":
        return role in BILLING and state in PAYABLE
    if action == "stk_push":
        return (role in BILLING or role == "patient") and state in PAYABLE
    raise AssertionError(action)


@pytest.mark.parametrize("action", ACTIONS)
@pytest.mark.parametrize("state", STATES)
@pytest.mark.parametrize("role", ROLES)
def test_role_state_action_matrix(client, tokens, ids, role, state, action):
    invoice = _invoice_in(client, tokens, ids, state)
    response = _act(client, tokens, ids, role, action, invoice)
    if _allowed(role, state, action):
        assert response.status_code in (200, 201), response.get_json()
    else:
        assert response.status_code in (403, 409), (response.status_code, response.get_json())
        role_forbidden = (
            action == "direct_finalize"
            or (action == "edit_lines" and role != "doctor")
            or (action in ("cash_payment", "sha_claim") and role not in BILLING)
            or (action == "stk_push" and role == "doctor")
        )
        assert response.status_code == (403 if role_forbidden else 409), response.get_json()
        if response.status_code == 409 and action != "edit_lines":
            assert response.get_json()["error"]["code"] == "INVOICE_NOT_PAYABLE"


def test_failure_during_completion_changes_nothing(client, tokens, ids, monkeypatch):
    from app.clinical_records.models import Visit
    from app.scheduling.models import Appointment

    appointment, visit = _open_visit(client, tokens, ids)

    def explode(*args, **kwargs):
        raise RuntimeError("printer on fire")

    monkeypatch.setattr("app.billing.service.next_sequence_value", explode)
    with pytest.raises(RuntimeError):
        client.post(f"/api/v1/visits/{visit['id']}/complete", headers=auth(tokens["doctor"]))

    db.session.expire_all()
    assert db.session.get(Visit, UUID(visit["id"])).completed_at is None
    assert db.session.get(Appointment, UUID(appointment["id"])).status.value == "IN_CONSULTATION"
    invoice = Invoice.query.filter_by(visit_id=UUID(visit["id"])).one()
    assert invoice.status == InvoiceStatus.DRAFT and invoice.invoice_number is None

    monkeypatch.undo()
    final = _complete(client, tokens, visit["id"])
    assert final["status"] == "ISSUED"


def test_repeating_completion_is_idempotent(client, tokens, ids):
    _, visit = _open_visit(client, tokens, ids)
    first = _complete(client, tokens, visit["id"])
    second = _complete(client, tokens, visit["id"])
    assert (first["id"], first["invoice_number"]) == (second["id"], second["invoice_number"])
    assert AuditLog.query.filter_by(action="invoice.finalize").count() == 1


def test_numbers_are_sequential_without_gaps(client, tokens, ids):
    numbers = []
    for hour in range(10, 14):
        _, visit = _open_visit(client, tokens, ids, start=f"2030-01-07T{hour:02d}:00:00+00:00")
        numbers.append(_complete(client, tokens, visit["id"])["invoice_number"])
    tail = [int(number.rsplit("-", 1)[1]) for number in numbers]
    assert tail == list(range(tail[0], tail[0] + len(tail)))


@pytest.mark.skipif(
    not os.getenv("MEDIFLOW_TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="row locks need Postgres (set MEDIFLOW_TEST_DATABASE_URL)",
)
def test_concurrent_completions_get_distinct_gap_free_numbers(app, client, tokens, ids):
    from app.clinical_records.models import Visit
    from app.clinical_records.service import complete_encounter
    from app.scheduling.models import DoctorProfile

    visit_ids = []
    for hour in range(8, 14):
        _, visit = _open_visit(client, tokens, ids, start=f"2030-01-07T{hour:02d}:00:00+00:00")
        visit_ids.append(UUID(visit["id"]))
    doctor_user_id = db.session.get(DoctorProfile, ids["doctor_id"]).user_id
    db.session.remove()

    errors = []
    barrier = threading.Barrier(len(visit_ids))

    def complete(visit_id):
        with app.app_context():
            from app.auth.models import User

            try:
                actor = db.session.get(User, doctor_user_id)
                visit = db.session.get(Visit, visit_id)
                barrier.wait()
                complete_encounter(visit, actor)
            except Exception as exc:  # noqa: BLE001
                errors.append(repr(exc))
            finally:
                db.session.remove()

    threads = [threading.Thread(target=complete, args=(vid,)) for vid in visit_ids]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert errors == []
    numbers = sorted(
        int(invoice.invoice_number.rsplit("-", 1)[1])
        for invoice in Invoice.query.filter(Invoice.visit_id.in_(visit_ids))
    )
    assert numbers == list(range(numbers[0], numbers[0] + len(visit_ids)))


def _stk(client, tokens, invoice_id, amount):
    return client.post(
        f"/api/v1/invoices/{invoice_id}/payment-intents",
        json={"amount_minor": amount, "phone": "0712345678"},
        headers={**auth(tokens["cashier"]), "Idempotency-Key": str(uuid.uuid4())},
    ).get_json()["data"]


def _callback(client, intent, amount_minor, receipt):
    return client.post(
        "/api/v1/webhooks/mpesa/daraja",
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


def test_late_callback_for_a_voided_invoice_is_recorded_unmatched(client, tokens, ids):
    _, visit = _open_visit(client, tokens, ids)
    invoice = _complete(client, tokens, visit["id"])
    intent = _stk(client, tokens, invoice["id"], 500000)
    request = client.post(
        f"/api/v1/invoices/{invoice['id']}/void-requests",
        json={"reason": "Duplicate"},
        headers=auth(tokens["reception"]),
    ).get_json()["data"]
    client.post(
        f"/api/v1/void-requests/{request['id']}/decision",
        json={"approve": True},
        headers=auth(tokens["admin"]),
    )
    assert _callback(client, intent, 500000, "QKLATE1").status_code == 200

    money = Transaction.query.filter_by(reference="QKLATE1").one()
    assert money.status == TransactionStatus.UNCONFIRMED and money.amount_minor == 500000
    queue = client.get("/api/v1/billing/reconciliation", headers=auth(tokens["cashier"]))
    assert "QKLATE1" in {item["reference"] for item in queue.get_json()["data"]["transactions"]}
    paid = db.session.get(Invoice, UUID(invoice["id"]))
    assert paid.amount_paid_minor == 0 and paid.status == InvoiceStatus.VOIDED


def test_admin_force_complete_requires_a_reason_and_is_audited(client, tokens, ids):
    _, visit = _open_visit(client, tokens, ids)
    url = f"/api/v1/admin/visits/{visit['id']}/force-complete"
    assert client.post(url, json={}, headers=auth(tokens["admin"])).status_code == 400
    assert (
        client.post(url, json={"reason": "short"}, headers=auth(tokens["admin"])).status_code == 400
    )
    for role in ("doctor", "reception", "cashier"):
        response = client.post(url, json={"reason": "x" * 20}, headers=auth(tokens[role]))
        assert response.status_code == 403, role

    reason = "Doctor left; patient was seen and discharged"
    done = client.post(url, json={"reason": reason}, headers=auth(tokens["admin"]))
    assert done.status_code == 200, done.get_json()
    data = done.get_json()["data"]
    assert data["completed_at"] and data["invoice"]["status"] == "ISSUED"
    entry = AuditLog.query.filter_by(action="visit.force_complete").one()
    assert entry.after["reason"] == reason
    assert entry.after["invoice_number"] == data["invoice"]["invoice_number"]
    assert str(entry.entity_id) == visit["id"]

    again = client.post(url, json={"reason": reason}, headers=auth(tokens["admin"]))
    assert again.status_code == 409  # already completed and finalized


def test_no_show_voids_the_draft(client, tokens, ids):
    appointment = book_appointment(client, tokens, ids)
    client.post(
        f"/api/v1/appointments/{appointment['id']}/check-in", headers=auth(tokens["reception"])
    )
    client.post(
        f"/api/v1/appointments/{appointment['id']}/no-show", headers=auth(tokens["reception"])
    )
    draft = Invoice.query.filter_by(appointment_id=UUID(appointment["id"])).one()
    assert draft.status == InvoiceStatus.VOIDED and draft.void_reason
    assert AuditLog.query.filter_by(action="invoice.draft_void").count() == 1


def test_transition_table_refuses_illegal_moves():
    from app.billing.lifecycle import set_invoice_status
    from app.common.errors import ApiError

    invoice = Invoice(status=InvoiceStatus.DRAFT)
    for target in (InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.REFUNDED):
        with pytest.raises(ApiError):
            set_invoice_status(invoice, target)
    set_invoice_status(invoice, InvoiceStatus.ISSUED)
    set_invoice_status(invoice, InvoiceStatus.PAID)
    with pytest.raises(ApiError):
        set_invoice_status(invoice, InvoiceStatus.DRAFT)
    voided = Invoice(status=InvoiceStatus.VOIDED)
    with pytest.raises(ApiError):
        set_invoice_status(voided, InvoiceStatus.ISSUED)


def test_violations_report_lists_without_changing(client, tokens, ids):
    appointment, visit = _open_visit(client, tokens, ids)
    legacy = Invoice.query.filter_by(visit_id=UUID(visit["id"])).one()
    legacy.status = InvoiceStatus.ISSUED  # legacy: finalized while the visit is open
    legacy.invoice_number = "INV-LEGACY-1"
    db.session.commit()

    report = client.get("/api/v1/admin/reports/invoice-violations", headers=auth(tokens["admin"]))
    assert report.status_code == 200
    rules = {(item["invoice_number"], item["rule"]) for item in report.get_json()["data"]["items"]}
    assert ("INV-LEGACY-1", "payable_before_visit_completed") in rules
    db.session.expire_all()
    assert db.session.get(Invoice, legacy.id).status == InvoiceStatus.ISSUED  # untouched
    assert (
        client.get(
            "/api/v1/admin/reports/invoice-violations", headers=auth(tokens["cashier"])
        ).status_code
        == 403
    )
