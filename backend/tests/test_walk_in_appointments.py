from datetime import datetime, time, timedelta, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.ai_assistance.service import no_show_score
from app.common.base import utcnow
from app.common.enums import (
    AppointmentSource,
    AppointmentStatus,
    Urgency,
)
from app.extensions import db
from app.patients.models import PatientProfile
from app.scheduling.models import Appointment
from tests.helpers import auth, book_appointment, create_visit_flow


def _walk_in_payload(ids, **overrides):
    payload = {
        "doctor_id": str(ids["doctor_id"]),
        "service_id": str(ids["service_id"]),
        "urgency": "URGENT",
        "notes": "Walk-in at reception",
        "patient": {
            "first_name": "Walkin",
            "last_name": "Patient",
            "date_of_birth": "1991-05-04",
            "sex": "FEMALE",
            "phone": "0777000123",
            "email": "walkin.patient@example.com",
        },
    }
    payload.update(overrides)
    return payload


def _create_appointment(ids, **overrides):
    start = overrides.pop("scheduled_start", None)
    end = overrides.pop("scheduled_end", None)
    appointment = Appointment(
        patient_id=overrides.pop("patient_id", ids["patient_id"]),
        doctor_id=overrides.pop("doctor_id", ids["doctor_id"]),
        service_id=overrides.pop("service_id", ids["service_id"]),
        department_id=overrides.pop("department_id", ids["department_id"]),
        scheduled_start=start,
        scheduled_end=end,
        arrived_at=overrides.pop("arrived_at", None),
        status=overrides.pop("status", AppointmentStatus.CHECKED_IN),
        source=overrides.pop("source", AppointmentSource.RECEPTION),
        urgency=overrides.pop("urgency", Urgency.ROUTINE),
        **overrides,
    )
    db.session.add(appointment)
    db.session.flush()
    return appointment


def test_walk_in_new_patient_is_checked_in_and_queued(client, tokens, ids):
    response = client.post(
        "/api/v1/appointments/walk-in",
        json=_walk_in_payload(ids),
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 201, response.get_json()
    appointment = response.get_json()["data"]
    assert appointment["source"] == "WALK_IN"
    assert appointment["status"] == "CHECKED_IN"
    assert appointment["scheduled_start"] is None
    assert appointment["scheduled_end"] is None
    assert appointment["arrived_at"] is not None
    assert appointment["queue_position"] == 1
    assert appointment["potential_duplicates"] == []

    patient = PatientProfile.query.filter_by(phone="0777000123").first()
    assert patient is not None
    assert patient.first_name == "Walkin"

    queue = client.get(
        f"/api/v1/queue?doctor_id={ids['doctor_id']}&date={utcnow().date().isoformat()}",
        headers=auth(tokens["reception"]),
    )
    assert queue.status_code == 200
    items = queue.get_json()["data"]["items"]
    assert [item["id"] for item in items] == [appointment["id"]]


def test_walk_in_existing_patient(client, tokens, ids):
    response = client.post(
        "/api/v1/appointments/walk-in",
        json={
            "patient_id": str(ids["patient_id"]),
            "doctor_id": str(ids["doctor_id"]),
            "service_id": str(ids["service_id"]),
            "notes": "Existing patient walk-in",
        },
        headers=auth(tokens["admin"]),
    )
    assert response.status_code == 201, response.get_json()
    assert response.get_json()["data"]["patient_id"] == str(ids["patient_id"])
    assert response.get_json()["data"]["arrived_at"] is not None


def test_walk_in_rolls_back_patient_when_appointment_fails(client, tokens, ids):
    payload = _walk_in_payload(
        ids,
        doctor_id="00000000-0000-0000-0000-000000000000",
    )
    response = client.post(
        "/api/v1/appointments/walk-in",
        json=payload,
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 404
    assert PatientProfile.query.filter_by(phone="0777000123").first() is None


def test_walk_in_permissions(client, tokens, ids):
    payload = _walk_in_payload(ids)
    assert (
        client.post(
            "/api/v1/appointments/walk-in",
            json=payload,
            headers=auth(tokens["doctor"]),
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/appointments/walk-in",
            json=payload,
            headers=auth(tokens["patient"]),
        ).status_code
        == 403
    )
    assert client.post("/api/v1/appointments/walk-in", json=payload).status_code == 401


def test_walk_in_validation_error(client, tokens, ids):
    payload = _walk_in_payload(ids)
    payload.pop("patient")
    response = client.post(
        "/api/v1/appointments/walk-in",
        json=payload,
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 400


def test_booked_check_in_sets_arrived_at(client, tokens, ids):
    appointment = book_appointment(client, tokens, ids)
    assert appointment["arrived_at"] is None
    response = client.post(
        f"/api/v1/appointments/{appointment['id']}/check-in",
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 200, response.get_json()
    assert response.get_json()["data"]["arrived_at"] is not None


def test_follow_up_uses_follow_up_source_and_doctor_only(client, tokens, ids):
    _, visit = create_visit_flow(client, tokens, ids)
    payload = {
        "doctor_id": str(ids["doctor_id"]),
        "service_id": str(ids["service_id"]),
        "scheduled_start": "2030-02-01T10:00:00+00:00",
    }
    denied = client.post(
        f"/api/v1/visits/{visit['id']}/follow-up",
        json=payload,
        headers=auth(tokens["reception"]),
    )
    assert denied.status_code == 403

    response = client.post(
        f"/api/v1/visits/{visit['id']}/follow-up",
        json=payload,
        headers=auth(tokens["doctor"]),
    )
    assert response.status_code == 201, response.get_json()
    appointment = response.get_json()["data"]
    assert appointment["source"] == "FOLLOW_UP"
    assert appointment["status"] == "SCHEDULED"
    assert appointment["follow_up_of_visit_id"] == visit["id"]
    assert appointment["scheduled_start"].startswith("2030-02-01T10:00")


def test_constraints_reject_invalid_walk_in_and_booked_rows(app, ids):
    walk_in = Appointment(
        patient_id=ids["patient_id"],
        doctor_id=ids["doctor_id"],
        status=AppointmentStatus.CHECKED_IN,
        source=AppointmentSource.WALK_IN,
    )
    db.session.add(walk_in)
    with pytest.raises(IntegrityError):
        db.session.commit()
    db.session.rollback()

    booked = Appointment(
        patient_id=ids["patient_id"],
        doctor_id=ids["doctor_id"],
        status=AppointmentStatus.SCHEDULED,
        source=AppointmentSource.RECEPTION,
    )
    db.session.add(booked)
    with pytest.raises(IntegrityError):
        db.session.commit()
    db.session.rollback()


def test_queue_orders_by_slot_arrival_and_urgency(client, tokens, ids):
    today = utcnow().date()
    base = datetime.combine(today, time.min, tzinfo=timezone.utc)

    booked_ten = _create_appointment(
        ids,
        scheduled_start=base + timedelta(hours=10),
        scheduled_end=base + timedelta(hours=10, minutes=30),
        arrived_at=base + timedelta(hours=9, minutes=55),
        source=AppointmentSource.RECEPTION,
    )
    walk_in_early = _create_appointment(
        ids,
        arrived_at=base + timedelta(hours=9, minutes=30),
        source=AppointmentSource.WALK_IN,
    )
    booked_follow_up = _create_appointment(
        ids,
        scheduled_start=base + timedelta(hours=9, minutes=45),
        scheduled_end=base + timedelta(hours=10, minutes=15),
        arrived_at=base + timedelta(hours=9, minutes=40),
        source=AppointmentSource.FOLLOW_UP,
    )
    walk_in_urgent = _create_appointment(
        ids,
        arrived_at=base + timedelta(hours=10, minutes=10),
        source=AppointmentSource.WALK_IN,
        urgency=Urgency.URGENT,
    )
    db.session.commit()

    response = client.get(
        f"/api/v1/queue?doctor_id={ids['doctor_id']}&date={today.isoformat()}",
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 200
    items = response.get_json()["data"]["items"]
    assert [item["id"] for item in items] == [
        str(walk_in_urgent.id),
        str(walk_in_early.id),
        str(booked_follow_up.id),
        str(booked_ten.id),
    ]


def test_walk_ins_are_skipped_by_no_show_logic(client, tokens, ids):
    walk_in = client.post(
        "/api/v1/appointments/walk-in",
        json=_walk_in_payload(ids),
        headers=auth(tokens["reception"]),
    )
    assert walk_in.status_code == 201, walk_in.get_json()
    walk_in_id = walk_in.get_json()["data"]["id"]

    denied = client.post(
        f"/api/v1/appointments/{walk_in_id}/no-show",
        headers=auth(tokens["reception"]),
    )
    assert denied.status_code == 409

    patient = PatientProfile.query.filter_by(phone="0777000123").first()
    assert patient is not None
    _create_appointment(
        ids,
        patient_id=patient.id,
        scheduled_start=utcnow() - timedelta(days=1),
        scheduled_end=utcnow() - timedelta(days=1) + timedelta(minutes=30),
        status=AppointmentStatus.NO_SHOW,
        source=AppointmentSource.ONLINE,
    )
    db.session.commit()
    result = no_show_score(patient.id)
    assert result["score"] == 1.0


def test_walk_in_does_not_enqueue_booking_reminders(client, tokens, ids):
    from app.common.enums import OutboxStatus
    from app.common.models import OutboxEvent

    response = client.post(
        "/api/v1/appointments/walk-in",
        json=_walk_in_payload(ids),
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 201, response.get_json()
    count = OutboxEvent.query.filter_by(
        event_type="appointment.created",
        status=OutboxStatus.PENDING,
    ).count()
    assert count == 0
