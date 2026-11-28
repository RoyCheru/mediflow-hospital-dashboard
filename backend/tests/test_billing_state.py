"""One billing state per visit (BIL-18): reception, cashier and admin agree.

Reproduces the reported contradiction: reception's "Unbilled visits" called a
visit's bill "cancelled" while the cashier showed the same invoice as ready for
payment. See docs/changes/billing-state-notes.md for the investigation.
"""

from uuid import UUID

import pytest
import sqlalchemy as sa

from app.audit.models import AuditLog
from app.auth.models import User
from app.billing.models import Invoice
from app.common.enums import InvoiceStatus
from app.extensions import db
from tests.helpers import auth, book_appointment, create_invoice_flow

# Step 1 reproductions: fail before the fix (strict), pass after it.
REPRO = pytest.mark.xfail(strict=True, reason="BIL-18 inconsistency, fixed in step 2")

REASON = "Voided in error: patient was seen and must be billed"


@pytest.fixture()
def seeded_client():
    """The demo seed, which includes the legacy Amina-style encounter."""
    from app import create_app
    from app.config import TestConfig

    application = create_app(TestConfig)
    with application.app_context():
        db.drop_all()
        db.create_all()
        result = application.test_cli_runner().invoke(args=["seed"])
        assert result.exit_code == 0, result.output
        client = application.test_client()
        login = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@mediflow.test", "password": "Admin12345!"},
        )
        yield client, login.get_json()["data"]["access_token"]
        db.session.rollback()
        db.session.remove()
        db.drop_all()


def _legacy_desk_finalized_visit(client, tokens, ids):
    """Amina's case: the desk finalized the draft before the doctor saw the patient
    (the pre-BIL-17 flow), then the doctor opened and completed the visit."""
    from app.billing.service import finalize_invoice

    appointment = book_appointment(client, tokens, ids)
    client.post(
        f"/api/v1/appointments/{appointment['id']}/check-in", headers=auth(tokens["reception"])
    )
    draft = Invoice.query.filter_by(
        appointment_id=UUID(appointment["id"]), status=InvoiceStatus.DRAFT
    ).one()
    finalize_invoice(draft, User.query.filter_by(email="cashier@test.local").one())
    visit = client.post(
        f"/api/v1/appointments/{appointment['id']}/visits",
        json={"presenting_complaint": "Cough"},
        headers=auth(tokens["doctor"]),
    ).get_json()["data"]
    completed = client.post(
        f"/api/v1/visits/{visit['id']}/complete", headers=auth(tokens["doctor"])
    )
    assert completed.status_code == 200, completed.get_json()
    return visit, str(draft.id)


def _void(client, tokens, invoice_id):
    requested = client.post(
        f"/api/v1/invoices/{invoice_id}/void-requests",
        json={"reason": "Entered against the wrong service"},
        headers=auth(tokens["reception"]),
    )
    assert requested.status_code == 201, requested.get_json()
    decided = client.post(
        f"/api/v1/void-requests/{requested.get_json()['data']['id']}/decision",
        json={"approve": True, "reason": "Confirmed"},
        headers=auth(tokens["admin"]),
    )
    assert decided.status_code == 200, decided.get_json()


def _unbilled(client, tokens, role="reception"):
    response = client.get("/api/v1/billing/ready-to-bill", headers=auth(tokens[role]))
    assert response.status_code == 200
    return {item["visit_id"]: item for item in response.get_json()["data"]["items"]}


def _views(client, tokens, visit_id, invoice_id):
    """(billing_state, active_invoice_id) as each billing screen's API reports it."""
    seen = {}
    for role in ("reception", "cashier", "admin"):
        state = client.get(
            f"/api/v1/visits/{visit_id}/billing-state", headers=auth(tokens[role])
        ).get_json()["data"]
        seen[f"{role}:visit"] = (state["billing_state"], state["active_invoice_id"])
        invoice = client.get(
            f"/api/v1/invoices/{invoice_id}", headers=auth(tokens[role])
        ).get_json()["data"]
        seen[f"{role}:invoice"] = (invoice["billing_state"], invoice["active_invoice_id"])
    return seen


@REPRO
def test_finalized_invoice_linked_by_appointment_is_not_unbilled(client, tokens, ids):
    """The reported bug: a payable invoice must never be listed as a cancelled bill."""
    visit, invoice_id = _legacy_desk_finalized_visit(client, tokens, ids)

    cashier_view = client.get(
        f"/api/v1/invoices/{invoice_id}", headers=auth(tokens["cashier"])
    ).get_json()["data"]
    assert cashier_view["status"] == "ISSUED"  # the cashier sees "Ready for payment"
    # Reception's "Unbilled visits" must not list it (it did, as "Bill cancelled").
    assert visit["id"] not in _unbilled(client, tokens)
    assert cashier_view["billing_state"] == "ready_for_payment"
    assert cashier_view["active_invoice_id"] == invoice_id


@REPRO
def test_every_billing_view_reports_the_same_state(client, tokens, ids):
    _, visit, invoice = create_invoice_flow(client, tokens, ids)
    views = _views(client, tokens, visit["id"], invoice["id"])
    assert set(views.values()) == {("ready_for_payment", invoice["id"])}, views


@REPRO
def test_voided_bill_needs_reissue_then_admin_reissues(client, tokens, ids):
    _, visit, invoice = create_invoice_flow(client, tokens, ids)
    _void(client, tokens, invoice["id"])

    row = _unbilled(client, tokens)[visit["id"]]
    assert (row["billing_state"], row["reason_code"]) == ("needs_reissue", "INVOICE_VOIDED")
    assert row["active_invoice_id"] is None
    voided = client.get(
        f"/api/v1/invoices/{invoice['id']}", headers=auth(tokens["cashier"])
    ).get_json()["data"]
    assert voided["payable"] is False
    refused = client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={"method": "CASH", "amount_minor": 1000, "tendered_minor": 1000},
        headers=auth(tokens["cashier"]),
    )
    assert refused.status_code == 409

    reissued = client.post(
        f"/api/v1/admin/visits/{visit['id']}/reissue-invoice",
        json={"reason": REASON},
        headers=auth(tokens["admin"]),
    )
    assert reissued.status_code == 201, reissued.get_json()
    new = reissued.get_json()["data"]
    assert new["replaces_invoice_id"] == invoice["id"]
    assert new["invoice_number"] and new["invoice_number"] != invoice["invoice_number"]
    assert visit["id"] not in _unbilled(client, tokens)
    views = _views(client, tokens, visit["id"], new["id"])
    assert set(views.values()) == {("ready_for_payment", new["id"])}, views
    assert AuditLog.query.filter_by(action="invoice.reissue", entity_id=UUID(new["id"])).count()


@REPRO
@pytest.mark.parametrize("role", ["reception", "cashier", "doctor", "patient"])
def test_only_admin_reissues(client, tokens, ids, role):
    _, visit, invoice = create_invoice_flow(client, tokens, ids)
    _void(client, tokens, invoice["id"])
    response = client.post(
        f"/api/v1/admin/visits/{visit['id']}/reissue-invoice",
        json={"reason": REASON},
        headers=auth(tokens[role]),
    )
    assert response.status_code == 403
    assert _unbilled(client, tokens)[visit["id"]]["billing_state"] == "needs_reissue"


@REPRO
def test_a_second_active_invoice_for_a_visit_is_rejected(client, tokens, ids):
    _, visit, invoice = create_invoice_flow(client, tokens, ids)
    original = db.session.get(Invoice, UUID(invoice["id"]))
    db.session.add(
        Invoice(
            patient_id=original.patient_id,
            visit_id=original.visit_id,
            status=InvoiceStatus.DRAFT,
        )
    )
    with pytest.raises(sa.exc.IntegrityError):
        db.session.flush()
    db.session.rollback()


@REPRO
def test_seeded_visits_with_an_active_invoice_are_not_unbilled(seeded_client):
    client, admin_token = seeded_client
    response = client.get("/api/v1/billing/ready-to-bill", headers=auth(admin_token))
    for row in response.get_json()["data"]["items"]:
        assert row["billing_state"] == "needs_reissue", row
