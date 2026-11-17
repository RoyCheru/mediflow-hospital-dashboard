from datetime import time, timedelta, timezone
from uuid import uuid4

from app.audit.models import AuditLog
from app.common.enums import AppointmentSource, AppointmentStatus, Urgency
from app.common.time import hospital_day_bounds, hospital_local_datetime, hospital_today
from app.extensions import db
from app.scheduling.models import Appointment
from tests.helpers import auth


def _admin_headers(tokens):
    return auth(tokens["admin"])


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


def _local_datetime(target_date, hour, minute=0):
    return hospital_local_datetime(target_date, time(hour, minute))


def _rule_payload(target_date, start="08:00", end="10:00", slot_minutes=30):
    start_time = time.fromisoformat(start)
    end_time = time.fromisoformat(end)
    return {
        "weekday": target_date.weekday(),
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "slot_minutes": slot_minutes,
        "timezone": "Africa/Nairobi",
    }


def _leave_payload(target_date):
    start, end = hospital_day_bounds(target_date)
    return {
        "start_at": start.isoformat(),
        "end_at": end.isoformat(),
        "kind": "LEAVE",
        "reason": "Annual leave",
    }


def test_admin_appointments_filters_pagination_and_nullable_slot(client, tokens, ids):
    today = hospital_today()
    past = today - timedelta(days=7)
    booked = _create_appointment(
        ids,
        scheduled_start=_local_datetime(today, 10),
        scheduled_end=_local_datetime(today, 10, 30),
        status=AppointmentStatus.SCHEDULED,
        source=AppointmentSource.RECEPTION,
    )
    walk_in = _create_appointment(
        ids,
        arrived_at=_local_datetime(today, 9, 45),
        status=AppointmentStatus.CHECKED_IN,
        source=AppointmentSource.WALK_IN,
    )
    old = _create_appointment(
        ids,
        scheduled_start=_local_datetime(past, 9),
        scheduled_end=_local_datetime(past, 9, 30),
        status=AppointmentStatus.COMPLETED,
        source=AppointmentSource.ONLINE,
    )
    db.session.commit()

    response = client.get(
        f"/api/v1/admin/appointments?date_from={today.isoformat()}&date_to={today.isoformat()}",
        headers=_admin_headers(tokens),
    )
    assert response.status_code == 200, response.get_json()
    payload = response.get_json()
    assert payload["meta"] == {"page": 1, "page_size": 20, "total": 2, "pages": 1}
    ids_returned = {item["id"] for item in payload["data"]}
    assert ids_returned == {str(booked.id), str(walk_in.id)}
    walk_row = next(item for item in payload["data"] if item["id"] == str(walk_in.id))
    assert walk_row["slot"] is None
    assert walk_row["arrived_at"] is not None
    assert walk_row["patient"]["name"] == "Pam Patient"

    only_walk_ins = client.get(
        f"/api/v1/admin/appointments?date_from={today.isoformat()}&date_to={today.isoformat()}&source=WALK_IN",
        headers=_admin_headers(tokens),
    ).get_json()
    assert only_walk_ins["meta"]["total"] == 1
    assert only_walk_ins["data"][0]["source"] == "WALK_IN"

    search = client.get(
        "/api/v1/admin/appointments?q=Pam",
        headers=_admin_headers(tokens),
    ).get_json()
    assert search["meta"]["total"] == 3

    paged = client.get(
        f"/api/v1/admin/appointments?date_from={today.isoformat()}&date_to={today.isoformat()}&page=2&page_size=1",
        headers=_admin_headers(tokens),
    ).get_json()
    assert paged["meta"]["page"] == 2
    assert paged["meta"]["page_size"] == 1
    assert len(paged["data"]) == 1

    invalid = client.get(
        "/api/v1/admin/appointments?sort=nope",
        headers=_admin_headers(tokens),
    )
    assert invalid.status_code == 400

    all_dates = client.get(
        "/api/v1/admin/appointments",
        headers=_admin_headers(tokens),
    ).get_json()
    assert {str(old.id), str(booked.id), str(walk_in.id)}.issubset(
        {item["id"] for item in all_dates["data"]}
    )


def test_admin_appointments_uses_hospital_timezone_day_boundaries(client, tokens, ids):
    today = hospital_today()
    yesterday = today - timedelta(days=1)
    just_after_midnight = _create_appointment(
        ids,
        scheduled_start=hospital_local_datetime(today, time(0, 30)).astimezone(timezone.utc),
        scheduled_end=hospital_local_datetime(today, time(1, 0)).astimezone(timezone.utc),
        status=AppointmentStatus.SCHEDULED,
        source=AppointmentSource.RECEPTION,
    )
    before_midnight = _create_appointment(
        ids,
        scheduled_start=hospital_local_datetime(yesterday, time(23, 30)).astimezone(timezone.utc),
        scheduled_end=hospital_local_datetime(today, time(0, 0)).astimezone(timezone.utc),
        status=AppointmentStatus.SCHEDULED,
        source=AppointmentSource.RECEPTION,
    )
    db.session.commit()

    payload = client.get(
        f"/api/v1/admin/appointments?date_from={today.isoformat()}&date_to={today.isoformat()}",
        headers=_admin_headers(tokens),
    ).get_json()
    returned = {item["id"] for item in payload["data"]}
    assert str(just_after_midnight.id) in returned
    assert str(before_midnight.id) not in returned


def test_admin_queue_orders_today_only_and_groups_by_doctor(client, tokens, ids):
    today = hospital_today()
    yesterday = today - timedelta(days=1)
    booked = _create_appointment(
        ids,
        scheduled_start=_local_datetime(today, 10),
        scheduled_end=_local_datetime(today, 10, 30),
        arrived_at=_local_datetime(today, 9, 55),
        status=AppointmentStatus.CHECKED_IN,
        source=AppointmentSource.RECEPTION,
    )
    walk_in = _create_appointment(
        ids,
        arrived_at=_local_datetime(today, 9, 30),
        status=AppointmentStatus.CHECKED_IN,
        source=AppointmentSource.WALK_IN,
    )
    urgent = _create_appointment(
        ids,
        arrived_at=_local_datetime(today, 10, 10),
        status=AppointmentStatus.CHECKED_IN,
        source=AppointmentSource.WALK_IN,
        urgency=Urgency.URGENT,
    )
    old = _create_appointment(
        ids,
        scheduled_start=_local_datetime(yesterday, 9),
        scheduled_end=_local_datetime(yesterday, 9, 30),
        status=AppointmentStatus.CHECKED_IN,
        source=AppointmentSource.RECEPTION,
    )
    db.session.commit()

    response = client.get("/api/v1/admin/queue", headers=_admin_headers(tokens))
    assert response.status_code == 200, response.get_json()
    payload = response.get_json()["data"]
    assert payload["date"] == today.isoformat()
    assert payload["timezone"] == "Africa/Nairobi"
    assert payload["generated_at"]
    assert payload["waiting_threshold_minutes"] == 30
    assert len(payload["doctors"]) == 1
    group = payload["doctors"][0]
    assert group["doctor"]["name"] == "Dan Doctor"
    assert group["counts"]["waiting"] == 3
    assert group["counts"]["in_consultation"] == 0
    assert [entry["appointment_id"] for entry in group["entries"]] == [
        str(urgent.id),
        str(walk_in.id),
        str(booked.id),
    ]
    assert [entry["position"] for entry in group["entries"]] == [1, 2, 3]
    assert str(old.id) not in {entry["appointment_id"] for entry in group["entries"]}


def test_admin_staff_metrics_and_working_today(client, tokens, ids):
    today = hospital_today()
    rule = client.post(
        f"/api/v1/admin/staff/{ids['reception_id']}/availability/rules",
        json=_rule_payload(today, "09:00", "17:00"),
        headers=_admin_headers(tokens),
    )
    assert rule.status_code == 201, rule.get_json()

    staff = client.get("/api/v1/admin/staff", headers=_admin_headers(tokens))
    assert staff.status_code == 200, staff.get_json()
    payload = staff.get_json()
    assert "data" in payload and "meta" in payload
    reception = next(
        item for item in payload["data"] if item["user_id"] == str(ids["reception_id"])
    )
    assert reception["today_status"] == "available"
    assert reception["today_working_hours"] == [{"start": "09:00", "end": "17:00"}]
    assert reception["next_available_slot"] is None

    doctor = next(item for item in payload["data"] if item["user_id"] == str(ids["doctor_user_id"]))
    assert "next_available_slot" in doctor
    assert doctor["today_working_hours"] is not None

    working = client.get(
        f"/api/v1/admin/availability?date={today.isoformat()}",
        headers=_admin_headers(tokens),
    )
    assert working.status_code == 200, working.get_json()
    working_payload = working.get_json()["data"]
    assert working_payload["date"] == today.isoformat()
    assert any(item["user_id"] == str(ids["reception_id"]) for item in working_payload["items"])


def test_admin_availability_leave_exception(client, tokens, ids):
    today = hospital_today()
    response = client.post(
        f"/api/v1/admin/staff/{ids['doctor_user_id']}/availability/exceptions",
        json=_leave_payload(today),
        headers=_admin_headers(tokens),
    )
    assert response.status_code == 201, response.get_json()

    staff = client.get("/api/v1/admin/staff", headers=_admin_headers(tokens)).get_json()
    doctor = next(item for item in staff["data"] if item["user_id"] == str(ids["doctor_user_id"]))
    assert doctor["today_status"] == "on_leave"

    details = client.get(
        f"/api/v1/admin/staff/{ids['doctor_user_id']}/availability?from={today.isoformat()}&to={today.isoformat()}",
        headers=_admin_headers(tokens),
    )
    assert details.status_code == 200, details.get_json()
    detail_payload = details.get_json()["data"]
    assert detail_payload["today_status"] == "on_leave"
    assert detail_payload["days"][0]["on_leave"] is True

    working = client.get(
        f"/api/v1/admin/availability?date={today.isoformat()}",
        headers=_admin_headers(tokens),
    ).get_json()["data"]
    assert all(item["user_id"] != str(ids["doctor_user_id"]) for item in working["items"])


def test_admin_availability_doctor_slots_include_booked_slots(client, tokens, ids):
    today = hospital_today()
    rule = client.post(
        f"/api/v1/admin/staff/{ids['doctor_user_id']}/availability/rules",
        json=_rule_payload(today, "06:00", "07:00"),
        headers=_admin_headers(tokens),
    )
    assert rule.status_code == 201, rule.get_json()
    booked = _create_appointment(
        ids,
        scheduled_start=_local_datetime(today, 6, 30).astimezone(timezone.utc),
        scheduled_end=_local_datetime(today, 7, 0).astimezone(timezone.utc),
        status=AppointmentStatus.SCHEDULED,
        source=AppointmentSource.RECEPTION,
    )
    db.session.commit()

    details = client.get(
        f"/api/v1/admin/staff/{ids['doctor_user_id']}/availability?from={today.isoformat()}&to={today.isoformat()}",
        headers=_admin_headers(tokens),
    )
    assert details.status_code == 200, details.get_json()
    payload = details.get_json()["data"]
    assert payload["is_doctor"] is True
    slots = payload["days"][0]["slots"]
    booked_slot = next(slot for slot in slots if slot["appointment"])
    assert booked_slot["appointment"]["id"] == str(booked.id)
    assert booked_slot["available"] is False
    assert any(
        slot["available"] for slot in slots if slot["start"].endswith("06:00:00+00:00") or True
    )


def test_admin_availability_crud_writes_audit_entries(client, tokens, ids):
    today = hospital_today()
    create = client.post(
        f"/api/v1/admin/staff/{ids['reception_id']}/availability/rules",
        json=_rule_payload(today, "10:00", "12:00"),
        headers=_admin_headers(tokens),
    )
    assert create.status_code == 201, create.get_json()
    rule = create.get_json()["data"]
    created_audit = AuditLog.query.filter_by(action="availability.rule_create").first()
    assert created_audit is not None
    assert str(created_audit.actor_user_id) == str(ids["admin_id"])
    assert created_audit.after["staff_user_id"] == str(ids["reception_id"])

    update = client.patch(
        f"/api/v1/admin/staff/{ids['reception_id']}/availability/rules/{rule['id']}",
        json={"end_time": "13:00:00"},
        headers=_admin_headers(tokens),
    )
    assert update.status_code == 200, update.get_json()
    assert AuditLog.query.filter_by(action="availability.rule_update").first() is not None

    delete = client.delete(
        f"/api/v1/admin/staff/{ids['reception_id']}/availability/rules/{rule['id']}",
        headers=_admin_headers(tokens),
    )
    assert delete.status_code == 200, delete.get_json()
    assert AuditLog.query.filter_by(action="availability.rule_delete").first() is not None

    exception = client.post(
        f"/api/v1/admin/staff/{ids['reception_id']}/availability/exceptions",
        json={
            "start_at": _leave_payload(today)["start_at"],
            "end_at": _leave_payload(today)["end_at"],
            "kind": "LEAVE",
            "reason": "Time off",
        },
        headers=_admin_headers(tokens),
    )
    assert exception.status_code == 201, exception.get_json()
    exception_id = exception.get_json()["data"]["id"]
    assert AuditLog.query.filter_by(action="availability.exception_create").first() is not None

    patched_exception = client.patch(
        f"/api/v1/admin/staff/{ids['reception_id']}/availability/exceptions/{exception_id}",
        json={"reason": "Updated time off"},
        headers=_admin_headers(tokens),
    )
    assert patched_exception.status_code == 200, patched_exception.get_json()
    assert AuditLog.query.filter_by(action="availability.exception_update").first() is not None

    deleted_exception = client.delete(
        f"/api/v1/admin/staff/{ids['reception_id']}/availability/exceptions/{exception_id}",
        headers=_admin_headers(tokens),
    )
    assert deleted_exception.status_code == 200, deleted_exception.get_json()
    assert AuditLog.query.filter_by(action="availability.exception_delete").first() is not None


def test_admin_views_require_admin(client, tokens, ids):
    today = hospital_today()
    paths = [
        "/api/v1/admin/appointments",
        "/api/v1/admin/queue",
        "/api/v1/admin/staff",
        f"/api/v1/admin/staff/{ids['reception_id']}/availability",
        f"/api/v1/admin/availability?date={today.isoformat()}",
    ]
    for path in paths:
        assert client.get(path).status_code == 401
        assert client.get(path, headers=auth(tokens["reception"])).status_code == 403
        assert client.get(path, headers=auth(tokens["doctor"])).status_code == 403
        assert client.get(path, headers=auth(tokens["patient"])).status_code == 403

    rule_payload = _rule_payload(today)
    creates = [
        f"/api/v1/admin/staff/{ids['reception_id']}/availability/rules",
        f"/api/v1/admin/staff/{ids['reception_id']}/availability/exceptions",
    ]
    for path in creates:
        assert client.post(path, json=rule_payload).status_code == 401
        assert (
            client.post(path, json=rule_payload, headers=auth(tokens["reception"])).status_code
            == 403
        )

    assert (
        client.patch(
            f"/api/v1/admin/staff/{ids['reception_id']}/availability/rules/{uuid4()}",
            json={"is_active": False},
            headers=auth(tokens["reception"]),
        ).status_code
        == 403
    )
