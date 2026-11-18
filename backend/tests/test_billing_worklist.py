"""Ready-to-bill work-list: completed visits without an active invoice."""

from tests.helpers import auth, complete_visit, create_visit_flow


def _ready(client, tokens, role="reception"):
    response = client.get("/api/v1/billing/ready-to-bill", headers=auth(tokens[role]))
    return response


def _visit_ids(response):
    return {item["visit_id"] for item in response.get_json()["data"]["items"]}


def test_completed_visit_is_ready_until_invoiced_and_again_after_void(client, tokens, ids):
    _, visit = create_visit_flow(client, tokens, ids)
    assert visit["id"] not in _visit_ids(_ready(client, tokens))  # still open

    complete_visit(client, tokens, visit["id"])
    response = _ready(client, tokens)
    assert response.status_code == 200
    row = next(
        item for item in response.get_json()["data"]["items"] if item["visit_id"] == visit["id"]
    )
    assert row["expected_line"] == {
        "description": "General consultation",
        "unit_price_minor": 500000,
    }
    assert row["patient"]["name"]
    assert row["doctor_name"]

    invoice = client.post(
        f"/api/v1/visits/{visit['id']}/invoices", json={}, headers=auth(tokens["reception"])
    ).get_json()["data"]
    assert visit["id"] not in _visit_ids(_ready(client, tokens))

    request = client.post(
        f"/api/v1/invoices/{invoice['id']}/void-requests",
        json={"reason": "Wrong service"},
        headers=auth(tokens["reception"]),
    ).get_json()["data"]
    client.post(
        f"/api/v1/void-requests/{request['id']}/decision",
        json={"approve": True},
        headers=auth(tokens["admin"]),
    )
    assert visit["id"] in _visit_ids(_ready(client, tokens, role="cashier"))


def test_ready_to_bill_is_for_billing_roles_only(client, tokens):
    assert client.get("/api/v1/billing/ready-to-bill").status_code == 401
    assert _ready(client, tokens, role="patient").status_code == 403
    assert _ready(client, tokens, role="doctor").status_code == 403
