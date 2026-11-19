from datetime import date, timedelta, timezone

from app.common.enums import AppointmentSource, AppointmentStatus
from app.common.time import hospital_today
from app.extensions import db
from tests.helpers import auth, book_appointment, complete_visit
from tests.test_admin_views import _create_appointment, _local_datetime


def test_queue_defaults_to_the_hospital_day_not_the_server_date(client, tokens, ids, monkeypatch):
    # Pretend the hospital is already on a different calendar day than the server.
    hospital_day = date.today() + timedelta(days=3)
    monkeypatch.setattr("app.scheduling.service.hospital_today", lambda: hospital_day)
    on_hospital_day = _create_appointment(
        ids,
        arrived_at=_local_datetime(hospital_day, 9),
        status=AppointmentStatus.CHECKED_IN,
        source=AppointmentSource.WALK_IN,
    )
    on_server_day = _create_appointment(
        ids,
        arrived_at=_local_datetime(date.today(), 9),
        status=AppointmentStatus.CHECKED_IN,
        source=AppointmentSource.WALK_IN,
    )
    db.session.commit()

    response = client.get("/api/v1/queue", headers=auth(tokens["reception"]))

    assert response.status_code == 200
    returned = {item["id"] for item in response.get_json()["data"]["items"]}
    assert str(on_hospital_day.id) in returned
    assert str(on_server_day.id) not in returned


def test_queue_explicit_date_and_invalid_date(client, tokens, ids):
    today = hospital_today()
    walk_in = _create_appointment(
        ids,
        arrived_at=_local_datetime(today, 9),
        status=AppointmentStatus.CHECKED_IN,
        source=AppointmentSource.WALK_IN,
    )
    db.session.commit()
    headers = auth(tokens["reception"])

    response = client.get(f"/api/v1/queue?date={today.isoformat()}", headers=headers)
    assert response.status_code == 200
    assert str(walk_in.id) in {item["id"] for item in response.get_json()["data"]["items"]}

    assert client.get("/api/v1/queue?date=not-a-date", headers=headers).status_code == 400


def test_queue_and_appointment_expose_the_open_visit(client, tokens, ids):
    appointment = book_appointment(client, tokens, ids)
    client.post(
        f"/api/v1/appointments/{appointment['id']}/check-in",
        headers=auth(tokens["reception"]),
    )
    queue_url = "/api/v1/queue?date=2030-01-07"

    def queue_row(role):
        items = client.get(queue_url, headers=auth(tokens[role])).get_json()["data"]["items"]
        return next(item for item in items if item["id"] == appointment["id"])

    before = queue_row("doctor")
    assert before["visit_id"] is None
    assert before["visit_completed_at"] is None

    visit = client.post(
        f"/api/v1/appointments/{appointment['id']}/visits",
        json={"presenting_complaint": "Headache"},
        headers=auth(tokens["doctor"]),
    ).get_json()["data"]

    # After a reload the doctor can find the open visit instead of creating another.
    assert queue_row("doctor")["visit_id"] == visit["id"]
    assert queue_row("reception")["visit_id"] == visit["id"]

    complete_visit(client, tokens, visit["id"])
    detail = client.get(
        f"/api/v1/appointments/{appointment['id']}", headers=auth(tokens["doctor"])
    ).get_json()["data"]
    assert detail["visit_id"] == visit["id"]
    assert detail["visit_completed_at"] is not None


def test_appointment_list_date_filter_uses_the_hospital_day(client, tokens, ids):
    today = hospital_today()
    # Stored in UTC like the app does (SQLite compares as text).
    # 01:30 in Nairobi is 22:30 UTC the previous day: a UTC-day filter would miss it.
    early = _create_appointment(
        ids,
        scheduled_start=_local_datetime(today, 1, 30).astimezone(timezone.utc),
        scheduled_end=_local_datetime(today, 2).astimezone(timezone.utc),
        status=AppointmentStatus.SCHEDULED,
        source=AppointmentSource.RECEPTION,
    )
    previous_evening = _create_appointment(
        ids,
        scheduled_start=_local_datetime(today - timedelta(days=1), 23, 30).astimezone(timezone.utc),
        scheduled_end=_local_datetime(today, 0).astimezone(timezone.utc),
        status=AppointmentStatus.SCHEDULED,
        source=AppointmentSource.RECEPTION,
    )
    db.session.commit()
    headers = auth(tokens["reception"])

    response = client.get(
        f"/api/v1/appointments?date={today.isoformat()}&page_size=100", headers=headers
    )
    assert response.status_code == 200
    returned = {item["id"] for item in response.get_json()["data"]["items"]}
    assert str(early.id) in returned
    assert str(previous_evening.id) not in returned

    assert client.get("/api/v1/appointments?date=bad", headers=headers).status_code == 400
