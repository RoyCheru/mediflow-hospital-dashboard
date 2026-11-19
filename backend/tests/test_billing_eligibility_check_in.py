"""Phase D: eligibility at check-in and payer/co-pay payloads."""

from uuid import UUID

from app.claims.models import EligibilityCheck
from app.common.enums import AllocationPayer, AllocationStatus, EligibilityStatus
from app.extensions import db
from app.integrations.base import ProviderTimeout, ProviderUnavailable
from app.patients.models import PatientProfile
from tests.helpers import auth, book_appointment


def _set_sha(ids, reference):
    patient = PatientProfile.query.get(ids["patient_id"])
    patient.sha_number = reference
    db.session.commit()


def _check_in(client, tokens, ids):
    appointment = book_appointment(client, tokens, ids)
    response = client.post(
        f"/api/v1/appointments/{appointment['id']}/check-in",
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 200, response.get_json()
    return appointment, response.get_json()["data"]


def _draft_allocations(appointment_id):
    from app.billing.models import Invoice

    draft = Invoice.query.filter_by(appointment_id=UUID(str(appointment_id))).one()
    return [item for item in draft.allocations if item.status != AllocationStatus.VOIDED]


def test_check_in_runs_eligibility_and_returns_the_payer(client, tokens, ids):
    appointment, data = _check_in(client, tokens, ids)
    assert data["payer"]["type"] == "SHA"
    assert data["payer"]["eligibility_status"] == "ACTIVE"
    assert data["payer"]["label"] == "SHA · Active"
    assert data["copay_due_minor"] == 0

    check = EligibilityCheck.query.filter_by(appointment_id=UUID(appointment["id"])).one()
    assert check.status == EligibilityStatus.ACTIVE
    assert check.invoice_id is not None


def test_inactive_sha_shows_the_full_co_pay_and_converts_the_draft(client, tokens, ids):
    _set_sha(ids, "SHA-DEMO-INACTIVE")
    appointment, data = _check_in(client, tokens, ids)
    assert data["payer"]["eligibility_status"] == "INACTIVE"
    assert "Inactive" in data["payer"]["label"]
    assert data["copay_due_minor"] == 500000

    allocations = _draft_allocations(appointment["id"])
    assert len(allocations) == 1
    assert allocations[0].payer == AllocationPayer.PATIENT
    assert allocations[0].amount_minor == 500000


def test_eligibility_failure_does_not_block_check_in(client, tokens, ids, monkeypatch):
    class FailingGateway:
        def verify_member(self, member_reference, patient_context=None):
            raise ProviderUnavailable("SHA is down")

    monkeypatch.setattr("app.claims.service.get_sha_gateway", lambda: FailingGateway())
    appointment, data = _check_in(client, tokens, ids)
    assert data["payer"]["eligibility_status"] == "UNKNOWN"
    assert data["payer"]["label"] == "SHA · Unverified"
    assert data["copay_due_minor"] == 500000

    check = EligibilityCheck.query.filter_by(appointment_id=UUID(appointment["id"])).one()
    assert check.status == EligibilityStatus.UNKNOWN
    assert check.raw_response["error_class"] == "unavailable"
    assert _draft_allocations(appointment["id"]) == []


def test_eligibility_timeout_does_not_block_check_in(client, tokens, ids, monkeypatch):
    class TimingOutGateway:
        def verify_member(self, member_reference, patient_context=None):
            raise ProviderTimeout("SHA timed out")

    monkeypatch.setattr("app.claims.service.get_sha_gateway", lambda: TimingOutGateway())
    appointment, data = _check_in(client, tokens, ids)
    assert data["copay_due_minor"] == 500000
    check = EligibilityCheck.query.filter_by(appointment_id=UUID(appointment["id"])).one()
    assert check.status == EligibilityStatus.UNKNOWN
    assert check.raw_response["error_class"] == "timeout"


def test_walk_in_runs_eligibility_and_queue_shows_the_payer(client, tokens, ids):
    response = client.post(
        "/api/v1/appointments/walk-in",
        json={
            "patient_id": str(ids["patient_id"]),
            "doctor_id": str(ids["doctor_id"]),
            "service_id": str(ids["service_id"]),
        },
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 201, response.get_json()
    appointment = response.get_json()["data"]
    assert appointment["payer"]["type"] == "SHA"
    assert appointment["payer"]["eligibility_status"] == "ACTIVE"

    queue = client.get("/api/v1/queue", headers=auth(tokens["reception"]))
    assert queue.status_code == 200
    entry = next(
        item for item in queue.get_json()["data"]["items"] if item["id"] == appointment["id"]
    )
    assert entry["payer"]["type"] == "SHA"
    assert entry["copay_due_minor"] == 0

    admin_queue = client.get("/api/v1/admin/queue", headers=auth(tokens["admin"]))
    assert admin_queue.status_code == 200
    admin_entry = next(
        item
        for group in admin_queue.get_json()["data"]["doctors"]
        for item in group["entries"]
        if item["appointment_id"] == appointment["id"]
    )
    assert admin_entry["payer"]["type"] == "SHA"
    assert admin_entry["copay_due_minor"] == 0
