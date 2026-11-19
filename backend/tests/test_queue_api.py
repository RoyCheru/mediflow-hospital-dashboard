from datetime import date, timedelta

from app.common.enums import AppointmentSource, AppointmentStatus
from app.common.time import hospital_today
from app.extensions import db
from tests.helpers import auth
from tests.test_admin_views import _create_appointment, _local_datetime


def test_queue_defaults_to_the_hospital_day_not_the_server_date(
    client, tokens, ids, monkeypatch
):
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
