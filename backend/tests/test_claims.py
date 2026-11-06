from tests.helpers import auth, create_invoice_flow


def test_sha_claim_lifecycle_to_paid(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    eligibility = client.post(
        f"/api/v1/invoices/{invoice['id']}/claims/eligibility-check",
        json={"member_reference": "SHA-DEMO-ACTIVE"},
        headers=auth(tokens["reception"]),
    )
    assert eligibility.status_code == 201, eligibility.get_json()
    assert eligibility.get_json()["data"]["status"] == "ACTIVE"

    claim_response = client.post(
        f"/api/v1/invoices/{invoice['id']}/claims",
        json={
            "eligibility_check_id": eligibility.get_json()["data"]["id"],
            "amount_minor": 500000,
        },
        headers=auth(tokens["reception"]),
    )
    assert claim_response.status_code == 201, claim_response.get_json()
    claim = claim_response.get_json()["data"]
    assert claim["status"] == "SUBMITTED"

    for status, extra in (
        ("UNDER_REVIEW", {}),
        ("APPROVED", {"approved_amount_minor": 500000}),
        ("PAID", {}),
    ):
        response = client.post(
            f"/api/v1/claims/{claim['id']}/status",
            json={"status": status, **extra},
            headers=auth(tokens["admin"]),
        )
        assert response.status_code == 200, response.get_json()

    final_claim = client.get(
        f"/api/v1/claims/{claim['id']}", headers=auth(tokens["admin"])
    ).get_json()["data"]
    assert final_claim["status"] == "PAID"
    assert len(final_claim["history"]) == 4

    updated_invoice = client.get(
        f"/api/v1/invoices/{invoice['id']}", headers=auth(tokens["admin"])
    ).get_json()["data"]
    assert updated_invoice["status"] == "PAID"


def test_inactive_sha_member_blocks_claim(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    check = client.post(
        f"/api/v1/invoices/{invoice['id']}/claims/eligibility-check",
        json={"member_reference": "SHA-DEMO-INACTIVE"},
        headers=auth(tokens["reception"]),
    )
    assert check.status_code == 201
    assert check.get_json()["data"]["status"] == "INACTIVE"

    response = client.post(
        f"/api/v1/invoices/{invoice['id']}/claims",
        json={
            "eligibility_check_id": check.get_json()["data"]["id"],
            "amount_minor": 500000,
        },
        headers=auth(tokens["reception"]),
    )
    assert response.status_code == 409


def test_claims_aging_report_accessible_to_billing(client, tokens):
    response = client.get("/api/v1/claims/aging", headers=auth(tokens["reception"]))
    assert response.status_code == 200
    assert "60_days" in response.get_json()["data"]
