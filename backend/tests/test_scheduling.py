from tests.helpers import auth, book_appointment


def test_booking_prevents_double_booking(client, tokens, ids):
    first = book_appointment(client, tokens, ids)
    second = client.post(
        "/api/v1/appointments",
        json={
            "doctor_id": str(ids["doctor_id"]),
            "service_id": str(ids["service_id"]),
            "scheduled_start": first["scheduled_start"],
        },
        headers=auth(tokens["patient"]),
    )
    assert second.status_code == 409


def test_queue_check_in_and_visit(client, tokens, ids):
    appointment = book_appointment(client, tokens, ids)

    queue = client.get(
        f"/api/v1/queue?doctor_id={ids['doctor_id']}&date=2030-01-07",
        headers=auth(tokens["reception"]),
    )
    assert queue.status_code == 200
    assert any(item["id"] == appointment["id"] for item in queue.get_json()["data"]["items"])

    checked_in = client.post(
        f"/api/v1/appointments/{appointment['id']}/check-in",
        headers=auth(tokens["reception"]),
    )
    assert checked_in.status_code == 200
    assert checked_in.get_json()["data"]["status"] == "CHECKED_IN"

    visit = client.post(
        f"/api/v1/appointments/{appointment['id']}/visits",
        json={"presenting_complaint": "Headache", "notes": "Mild headache"},
        headers=auth(tokens["doctor"]),
    )
    assert visit.status_code == 201, visit.get_json()
    assert visit.get_json()["data"]["patient_id"] == str(ids["patient_id"])


def test_patient_cannot_check_in(client, tokens, ids):
    appointment = book_appointment(client, tokens, ids)
    response = client.post(
        f"/api/v1/appointments/{appointment['id']}/check-in",
        headers=auth(tokens["patient"]),
    )
    assert response.status_code == 403


def test_doctor_manages_own_availability(client, tokens):
    response = client.get("/api/v1/doctors/me/availability", headers=auth(tokens["doctor"]))
    assert response.status_code == 200
    assert len(response.get_json()["data"]["rules"]) == 5


def test_doctor_schedules_follow_up_from_visit(client, tokens, ids):
    from tests.helpers import create_visit_flow

    _, visit = create_visit_flow(client, tokens, ids)
    response = client.post(
        f"/api/v1/visits/{visit['id']}/follow-up",
        json={
            "doctor_id": str(ids["doctor_id"]),
            "service_id": str(ids["service_id"]),
            "scheduled_start": "2030-02-01T10:00:00+00:00",
        },
        headers=auth(tokens["doctor"]),
    )
    assert response.status_code == 201, response.get_json()
    assert response.get_json()["data"]["scheduled_start"].startswith("2030-02-01T10:00")

    updated = client.get(
        f"/api/v1/visits/{visit['id']}", headers=auth(tokens["doctor"])
    ).get_json()["data"]
    assert updated["follow_up_date"] == "2030-02-01"
