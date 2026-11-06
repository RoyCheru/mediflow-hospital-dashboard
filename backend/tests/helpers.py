def auth(token):
    return {"Authorization": f"Bearer {token}"}


def book_appointment(client, tokens, ids, start="2030-01-07T10:00:00+00:00"):
    response = client.post(
        "/api/v1/appointments",
        json={
            "doctor_id": str(ids["doctor_id"]),
            "service_id": str(ids["service_id"]),
            "scheduled_start": start,
        },
        headers=auth(tokens["patient"]),
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]


def create_visit_flow(client, tokens, ids):
    appointment = book_appointment(client, tokens, ids)
    response = client.post(
        f"/api/v1/appointments/{appointment['id']}/check-in",
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 200, response.get_json()
    response = client.post(
        f"/api/v1/appointments/{appointment['id']}/visits",
        json={
            "presenting_complaint": "Cough and fever",
            "vitals": {"temperature": 37.8},
            "notes": "Patient reports cough for three days.",
        },
        headers=auth(tokens["doctor"]),
    )
    assert response.status_code == 201, response.get_json()
    return appointment, response.get_json()["data"]


def create_invoice_flow(client, tokens, ids):
    appointment, visit = create_visit_flow(client, tokens, ids)
    response = client.post(
        f"/api/v1/visits/{visit['id']}/invoices",
        json={},
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 201, response.get_json()
    return appointment, visit, response.get_json()["data"]
