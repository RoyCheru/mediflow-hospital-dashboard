from tests.helpers import auth


def test_triage_red_flags_are_emergency(client):
    response = client.post(
        "/api/v1/ai/triage",
        json={"symptoms": "Chest pain and difficulty breathing"},
    )
    assert response.status_code == 200, response.get_json()
    data = response.get_json()["data"]
    assert data["ai_generated"] is True
    assert data["triage"]["urgency"] == "EMERGENCY"
    assert data["triage"]["emergency_message"]
    assert data["triage"]["red_flags"]


def test_triage_masks_personal_data(app, client):
    response = client.post(
        "/api/v1/ai/triage",
        json={
            "symptoms": "Patient 0712345678 email a@b.com has a skin rash",
        },
    )
    assert response.status_code == 200
    from app.ai_assistance.models import AIInteraction

    interaction = AIInteraction.query.first()
    assert "[phone]" in interaction.input_summary
    assert "[email]" in interaction.input_summary


def test_natural_language_report_is_allowlisted(client, tokens):
    response = client.post(
        "/api/v1/admin/report-queries",
        json={"query": "show claims over 30 days old"},
        headers=auth(tokens["admin"]),
    )
    assert response.status_code == 200, response.get_json()
    assert response.get_json()["data"]["report_key"] == "claims_aging"

    denied = client.post(
        "/api/v1/admin/report-queries",
        json={"query": "show claims"},
        headers=auth(tokens["reception"]),
    )
    assert denied.status_code == 403


def test_visit_summary_requires_doctor_approval(client, tokens, ids):
    from tests.helpers import create_visit_flow

    appointment, visit = create_visit_flow(client, tokens, ids)
    draft = client.post(
        f"/api/v1/visits/{visit['id']}/summary-drafts",
        json={"notes": "Persistent cough with mild fever for three days."},
        headers=auth(tokens["doctor"]),
    )
    assert draft.status_code == 201, draft.get_json()
    interaction = draft.get_json()["data"]
    assert interaction["approved"] is False

    approval = client.post(
        f"/api/v1/visits/{visit['id']}/summary-approval",
        json={
            "ai_interaction_id": interaction["id"],
            "summary": "Three-day cough with mild fever; clinician reviewed.",
        },
        headers=auth(tokens["doctor"]),
    )
    assert approval.status_code == 200
    assert approval.get_json()["data"]["ai_summary_approved"] is True
