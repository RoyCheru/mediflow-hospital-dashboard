"""Ready-to-bill work-list: completed visits without an active invoice."""

from tests.helpers import auth, complete_visit, create_visit_flow


def _ready(client, tokens, role="reception"):
    response = client.get("/api/v1/billing/ready-to-bill", headers=auth(tokens[role]))
    return response


def _visit_ids(response):
    return {item["visit_id"] for item in response.get_json()["data"]["items"]}


def test_completion_bills_the_visit_and_a_void_puts_it_back_for_reissue(client, tokens, ids):
    _, visit = create_visit_flow(client, tokens, ids)
    assert visit["id"] not in _visit_ids(_ready(client, tokens))  # still open

    # Completing finalizes the bill (BIL-17): nothing is left to bill.
    invoice = complete_visit(client, tokens, visit["id"])["invoice"]
    assert invoice["status"] == "ISSUED"
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
    response = _ready(client, tokens, role="cashier")
    row = next(
        item for item in response.get_json()["data"]["items"] if item["visit_id"] == visit["id"]
    )
    assert row["expected_line"] == {
        "description": "General consultation",
        "unit_price_minor": 500000,
    }
    assert row["patient"]["name"] and row["doctor_name"]

    # The reissue is an admin force-complete with a reason; it gets a new number.
    reissued = client.post(
        f"/api/v1/admin/visits/{visit['id']}/force-complete",
        json={"reason": "Reissue after void: wrong service"},
        headers=auth(tokens["admin"]),
    )
    assert reissued.status_code == 200, reissued.get_json()
    new_invoice = reissued.get_json()["data"]["invoice"]
    assert new_invoice["id"] != invoice["id"] and new_invoice["status"] == "ISSUED"
    assert new_invoice["invoice_number"] != invoice["invoice_number"]
    assert visit["id"] not in _visit_ids(_ready(client, tokens))


def test_ready_to_bill_is_for_billing_roles_only(client, tokens):
    assert client.get("/api/v1/billing/ready-to-bill").status_code == 401
    assert _ready(client, tokens, role="patient").status_code == 403
    assert _ready(client, tokens, role="doctor").status_code == 403
