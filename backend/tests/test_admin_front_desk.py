"""Admin front desk on a real database: registration duplicate check and bookings.

These ran green on SQLite while failing on Postgres (row locks over outer joins,
date-vs-text comparison). Run with MEDIFLOW_TEST_DATABASE_URL set to cover Postgres.
"""

from tests.helpers import auth, book_appointment


def _register(client, tokens, **overrides):
    payload = {
        "first_name": "Wanjiku",
        "last_name": "Desk",
        "date_of_birth": "1992-03-04",
        "sex": "FEMALE",
        "phone": "0711222333",
        **overrides,
    }
    return client.post("/api/v1/patients", json=payload, headers=auth(tokens["admin"]))


def test_duplicate_check_matches_name_and_date_of_birth(client, tokens):
    assert _register(client, tokens).status_code == 201
    response = client.get(
        "/api/v1/patients/duplicates"
        "?first_name=wanjiku&last_name=DESK&date_of_birth=1992-03-04&phone=0799000000",
        headers=auth(tokens["admin"]),
    )
    assert response.status_code == 200, response.get_json()
    items = response.get_json()["data"]["items"]
    assert [item["last_name"] for item in items] == ["Desk"]

    by_phone = client.get(
        "/api/v1/patients/duplicates?phone=0711222333", headers=auth(tokens["admin"])
    )
    assert len(by_phone.get_json()["data"]["items"]) == 1

    none = client.get(
        "/api/v1/patients/duplicates?first_name=Other&last_name=Person&date_of_birth=1992-03-04",
        headers=auth(tokens["admin"]),
    )
    assert none.get_json()["data"]["items"] == []


def test_duplicate_check_rejects_an_invalid_date(client, tokens):
    response = client.get(
        "/api/v1/patients/duplicates?first_name=A&last_name=B&date_of_birth=04/03/1992",
        headers=auth(tokens["admin"]),
    )
    assert response.status_code == 400
    body = response.get_json()["error"]
    assert body["message"] == "Invalid date of birth"
    assert "date_of_birth" in body["details"]


def test_admin_books_checks_in_and_reschedules(client, tokens, ids):
    booked = book_appointment(client, tokens, ids)
    moved = client.post(
        f"/api/v1/appointments/{booked['id']}/reschedule",
        json={"scheduled_start": "2030-01-08T10:00:00+00:00", "reason": "Patient request"},
        headers=auth(tokens["admin"]),
    )
    assert moved.status_code == 201, moved.get_json()
    replacement = moved.get_json()["data"]
    assert replacement["status"] == "SCHEDULED"

    checked_in = client.post(
        f"/api/v1/appointments/{replacement['id']}/check-in", headers=auth(tokens["admin"])
    )
    assert checked_in.status_code == 200, checked_in.get_json()
    assert checked_in.get_json()["data"]["status"] == "CHECKED_IN"


def test_admin_walk_in_registers_new_patient_with_draft_bill(client, tokens, ids):
    from uuid import UUID

    from app.billing.models import Invoice
    from app.common.enums import InvoiceStatus
    from app.patients.models import PatientProfile

    response = client.post(
        "/api/v1/appointments/walk-in",
        json={
            "doctor_id": str(ids["doctor_id"]),
            "service_id": str(ids["service_id"]),
            "patient": {
                "first_name": "Otieno",
                "last_name": "Walkin",
                "date_of_birth": "1988-08-08",
                "sex": "MALE",
                "phone": "0722333444",
                "sha_number": "SHA-DEMO-ACTIVE",
            },
        },
        headers=auth(tokens["admin"]),
    )
    assert response.status_code == 201, response.get_json()
    data = response.get_json()["data"]
    assert data["status"] == "CHECKED_IN"
    assert data["scheduled_start"] is None and data["arrived_at"]
    assert data["payer"]["label"] == "SHA · Active"

    patient = PatientProfile.query.get(UUID(data["patient_id"]))
    assert patient.last_name == "Walkin" and patient.patient_number
    draft = Invoice.query.filter_by(appointment_id=UUID(data["id"])).one()
    assert draft.status == InvoiceStatus.DRAFT and draft.invoice_number is None


def test_double_submitted_registration_creates_one_patient(client, tokens):
    from app.patients.models import PatientProfile

    headers = {**auth(tokens["admin"]), "Idempotency-Key": "register-once"}
    payload = {
        "first_name": "Akinyi",
        "last_name": "Twice",
        "date_of_birth": "1990-01-01",
        "phone": "0711000999",
    }
    first = client.post("/api/v1/patients", json=payload, headers=headers)
    second = client.post("/api/v1/patients", json=payload, headers=headers)
    assert first.status_code == 201 and second.status_code == 201
    assert first.get_json()["data"]["id"] == second.get_json()["data"]["id"]
    assert PatientProfile.query.filter_by(last_name="Twice").count() == 1

    reused = client.post(
        "/api/v1/patients", json={**payload, "first_name": "Other"}, headers=headers
    )
    assert reused.status_code == 409


def test_double_submitted_walk_in_queues_once_and_repeat_is_refused(client, tokens, ids):
    from app.scheduling.models import Appointment

    patient = _register(client, tokens, last_name="Queue", phone="0712000111").get_json()["data"]
    body = {"doctor_id": str(ids["doctor_id"]), "patient_id": patient["id"]}
    headers = {**auth(tokens["admin"]), "Idempotency-Key": "walk-in-once"}
    first = client.post("/api/v1/appointments/walk-in", json=body, headers=headers)
    second = client.post("/api/v1/appointments/walk-in", json=body, headers=headers)
    assert first.status_code == 201, first.get_json()
    assert second.get_json()["data"]["id"] == first.get_json()["data"]["id"]
    assert first.get_json()["data"]["queue_position"] is not None

    # A fresh submission (new key, e.g. a second desk) for the same patient and doctor.
    again = client.post(
        "/api/v1/appointments/walk-in", json=body, headers=auth(tokens["reception"])
    )
    assert again.status_code == 409
    assert again.get_json()["error"]["message"] == (
        "This patient is already in today's queue for this doctor"
    )
    from uuid import UUID

    assert Appointment.query.filter_by(patient_id=UUID(patient["id"])).count() == 1


def test_registration_rejects_invalid_data_with_field_errors(client, tokens):
    response = _register(
        client, tokens, first_name="  ", date_of_birth="2999-01-01", phone="07x1-abc"
    )
    assert response.status_code == 422
    details = response.get_json()["error"]["details"]
    assert details["first_name"] == ["Cannot be blank."]
    assert details["date_of_birth"] == ["Date of birth cannot be in the future."]
    assert details["phone"] == ["Enter a valid phone number (7 to 15 digits)."]

    walk_in = client.post(
        "/api/v1/appointments/walk-in",
        json={
            "doctor_id": "00000000-0000-0000-0000-000000000000",
            "patient": {"first_name": "A", "last_name": "B", "date_of_birth": "1990-01-01"},
        },
        headers=auth(tokens["admin"]),
    )
    assert walk_in.status_code == 422
    assert "phone" in walk_in.get_json()["error"]["details"]["patient"]
