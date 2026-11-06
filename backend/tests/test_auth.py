from tests.helpers import auth


def test_health(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


def test_login_and_refresh_rotation(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "doctor@test.local", "password": "Doctor12345!"},
    )
    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["access_token"]
    assert data["user"]["role"] == "DOCTOR"

    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": data["refresh_token"]})
    assert refreshed.status_code == 200
    new_refresh = refreshed.get_json()["data"]["refresh_token"]
    assert new_refresh != data["refresh_token"]

    reused = client.post("/api/v1/auth/refresh", json={"refresh_token": data["refresh_token"]})
    assert reused.status_code == 401


def test_invalid_login_and_missing_token(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "doctor@test.local", "password": "WrongPassword1!"},
    )
    assert response.status_code == 401
    assert client.get("/api/v1/patients/me").status_code == 401


def test_admin_creates_staff_and_receptionist_is_denied(client, tokens):
    response = client.post(
        "/api/v1/admin/users",
        json={
            "email": "new.nurse@test.local",
            "password": "Nurse123456!",
            "first_name": "New",
            "last_name": "Nurse",
            "role": "RECEPTIONIST",
        },
        headers=auth(tokens["admin"]),
    )
    assert response.status_code == 201, response.get_json()

    denied = client.post(
        "/api/v1/admin/users",
        json={
            "email": "other@test.local",
            "password": "Other123456!",
            "first_name": "Other",
            "last_name": "User",
            "role": "RECEPTIONIST",
        },
        headers=auth(tokens["reception"]),
    )
    assert denied.status_code == 403


def test_password_reset_flow(client):
    request = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": "patient@test.local"},
    )
    token = request.get_json()["data"]["reset_token"]
    assert token

    confirm = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": "NewPatient123!"},
    )
    assert confirm.status_code == 200

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "patient@test.local", "password": "NewPatient123!"},
    )
    assert login.status_code == 200
