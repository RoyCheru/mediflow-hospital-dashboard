from uuid import uuid4

from tests.helpers import auth, create_invoice_flow, create_visit_flow


def test_self_registration_returns_a_working_verification_token(client):
    suffix = uuid4().hex[:8]
    response = client.post(
        "/api/v1/patients/self-registration",
        json={
            "email": f"phase2-{suffix}@test.local",
            "phone": f"07{int(suffix, 16) % 100000000:08d}",
            "password": "Phase2Patient123!",
            "first_name": "Phase",
            "last_name": "Two",
            "date_of_birth": "1995-05-05",
            "sex": "FEMALE",
        },
    )
    assert response.status_code == 201, response.get_json()
    token = response.get_json()["data"]["verification_token"]
    verified = client.post("/api/v1/auth/verify", json={"token": token})
    assert verified.status_code == 200, verified.get_json()
    assert verified.get_json()["data"]["verified"] is True


def test_patient_can_update_own_profile_and_read_prescriptions(client, tokens, ids):
    _, visit = create_visit_flow(client, tokens, ids)
    prescribed = client.post(
        f"/api/v1/visits/{visit['id']}/prescriptions",
        json={
            "items": [
                {
                    "drug_name": "Paracetamol",
                    "dose": "500 mg",
                    "frequency": "Three times daily",
                    "duration": "3 days",
                }
            ]
        },
        headers=auth(tokens["doctor"]),
    )
    assert prescribed.status_code == 201, prescribed.get_json()

    profile = client.patch(
        "/api/v1/patients/me",
        json={"address": "Phase 2 Street"},
        headers=auth(tokens["patient"]),
    )
    assert profile.status_code == 200, profile.get_json()
    assert profile.get_json()["data"]["address"] == "Phase 2 Street"

    prescriptions = client.get(
        "/api/v1/patients/me/prescriptions",
        headers=auth(tokens["patient"]),
    )
    assert prescriptions.status_code == 200, prescriptions.get_json()
    assert any(
        item["drug_name"] == "Paracetamol"
        for prescription in prescriptions.get_json()["data"]["items"]
        for item in prescription["items"]
    )


def test_doctor_can_delete_own_availability_exception(client, tokens):
    created = client.post(
        "/api/v1/doctors/me/exceptions",
        json={
            "start_at": "2030-05-01T09:00:00",
            "end_at": "2030-05-01T12:00:00",
            "kind": "LEAVE",
            "reason": "Phase 2 leave",
        },
        headers=auth(tokens["doctor"]),
    )
    assert created.status_code == 201, created.get_json()
    exception_id = created.get_json()["data"]["id"]
    deleted = client.delete(
        f"/api/v1/doctors/me/exceptions/{exception_id}",
        headers=auth(tokens["doctor"]),
    )
    assert deleted.status_code == 200, deleted.get_json()
    assert deleted.get_json()["data"]["deleted"] is True


def test_patient_can_start_an_mpesa_payment_for_own_invoice(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    response = client.post(
        f"/api/v1/invoices/{invoice['id']}/payment-intents",
        json={"amount_minor": 500000, "phone": "0700000005"},
        headers=auth(tokens["patient"]),
    )
    assert response.status_code == 201, response.get_json()
    assert response.get_json()["data"]["status"] == "PENDING"
