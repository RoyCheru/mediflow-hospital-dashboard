from tests.helpers import auth


def test_reception_registers_patient(client, tokens):
    response = client.post(
        "/api/v1/patients",
        json={
            "first_name": "John",
            "last_name": "Doe",
            "date_of_birth": "1992-02-02",
            "sex": "MALE",
            "phone": "0711222333",
            "email": "john.doe@test.local",
            "allergies": "None",
            "sha_number": "SHA-NEW-1",
        },
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 201, response.get_json()
    data = response.get_json()["data"]
    assert data["patient_number"].startswith("MF-")
    assert data["first_name"] == "John"


def test_self_registration_and_own_profile(client):
    response = client.post(
        "/api/v1/patients/self-registration",
        json={
            "email": "self@test.local",
            "phone": "0722333444",
            "password": "SelfPatient123!",
            "first_name": "Self",
            "last_name": "Registered",
            "date_of_birth": "1998-05-05",
            "sex": "FEMALE",
        },
    )
    assert response.status_code == 201, response.get_json()

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "self@test.local", "password": "SelfPatient123!"},
    )
    token = login.get_json()["data"]["access_token"]
    me = client.get("/api/v1/patients/me", headers=auth(token))
    assert me.status_code == 200
    assert me.get_json()["data"]["first_name"] == "Self"


def test_doctor_cannot_view_unrelated_patient(client, tokens):
    created = client.post(
        "/api/v1/patients",
        json={
            "first_name": "Una",
            "last_name": "Related",
            "date_of_birth": "1980-03-03",
            "phone": "0733444555",
        },
        headers=auth(tokens["reception"]),
    ).get_json()["data"]
    response = client.get(f"/api/v1/patients/{created['id']}", headers=auth(tokens["doctor"]))
    assert response.status_code == 403

    admin = client.get(f"/api/v1/patients/{created['id']}", headers=auth(tokens["admin"]))
    assert admin.status_code == 200


def test_duplicate_detection_returns_candidates(client, tokens):
    payload = {
        "first_name": "Dup",
        "last_name": "Patient",
        "date_of_birth": "1990-09-09",
        "phone": "0744555666",
    }
    first = client.post("/api/v1/patients", json=payload, headers=auth(tokens["reception"]))
    assert first.status_code == 201
    second = client.post(
        "/api/v1/patients",
        json={**payload, "phone": "0755666777"},
        headers=auth(tokens["reception"]),
    )
    assert second.status_code == 201
    assert second.get_json()["data"]["potential_duplicates"]
