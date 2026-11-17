"""Money-integrity guards: row locking, callback checks, void rules, idempotency."""

from uuid import uuid4

from sqlalchemy.dialects import postgresql

from app.billing.service import invoice_lock_query
from tests.helpers import auth, create_invoice_flow


def test_invoice_lock_query_uses_select_for_update_on_postgres(app):
    with app.app_context():
        statement = invoice_lock_query(uuid4()).statement
        sql = str(statement.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in sql


def test_second_payment_cannot_exceed_balance(client, tokens, ids):
    _, _, invoice = create_invoice_flow(client, tokens, ids)
    total = invoice["total_minor"]
    first = client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={"method": "CASH", "amount_minor": total - 100},
        headers=auth(tokens["cashier"]),
    )
    assert first.status_code == 201, first.get_json()
    second = client.post(
        f"/api/v1/invoices/{invoice['id']}/transactions",
        json={"method": "CARD", "amount_minor": 200},
        headers=auth(tokens["cashier"]),
    )
    assert second.status_code == 400
    updated = client.get(
        f"/api/v1/invoices/{invoice['id']}", headers=auth(tokens["cashier"])
    ).get_json()["data"]
    assert updated["balance_minor"] == 100
    assert updated["status"] == "PARTIALLY_PAID"
