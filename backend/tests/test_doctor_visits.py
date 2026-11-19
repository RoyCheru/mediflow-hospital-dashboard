"""Phase E: the doctor's own visit list (GET /visits/mine)."""

from app.common.time import hospital_today
from tests.helpers import auth, complete_visit, create_visit_flow


def _mine(client, tokens, query=""):
    response = client.get(f"/api/v1/visits/mine{query}", headers=auth(tokens["doctor"]))
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]


def test_doctor_lists_own_visits_without_clinical_text(client, tokens, ids):
    _, visit = create_visit_flow(client, tokens, ids)

    data = _mine(client, tokens)
    row = next(item for item in data["items"] if item["id"] == visit["id"])
    assert row["patient_number"]
    assert "notes" not in row
    assert "presenting_complaint" not in row
    assert data["meta"]["total"] >= 1

    open_ids = {item["id"] for item in _mine(client, tokens, "?completed=false")["items"]}
    assert visit["id"] in open_ids

    complete_visit(client, tokens, visit["id"])
    today = hospital_today().isoformat()
    done = _mine(client, tokens, f"?completed=true&date={today}")
    assert visit["id"] in {item["id"] for item in done["items"]}
    assert visit["id"] not in {
        item["id"] for item in _mine(client, tokens, "?completed=false")["items"]
    }


def test_visits_mine_is_doctor_only_and_validates_filters(client, tokens, ids):
    for role in ("reception", "cashier", "admin", "patient"):
        response = client.get("/api/v1/visits/mine", headers=auth(tokens[role]))
        assert response.status_code == 403, role
    headers = auth(tokens["doctor"])
    assert client.get("/api/v1/visits/mine?completed=maybe", headers=headers).status_code == 400
    assert client.get("/api/v1/visits/mine?date=nope", headers=headers).status_code == 400
