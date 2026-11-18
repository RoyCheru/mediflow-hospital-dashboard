"""Concurrency check for invoice row locks on a real Postgres database.

SQLite ignores SELECT ... FOR UPDATE, so this only runs when
MEDIFLOW_TEST_POSTGRES_URL points at a disposable, migrated and seeded
Postgres database (or schema), for example:

    MEDIFLOW_TEST_POSTGRES_URL="postgresql+psycopg://user:pw@localhost/db?options=-csearch_path%3Dscratch"

The test leaves its payments in place, so do not point it at real data.
"""

import os
import threading
import time
import uuid

import pytest

POSTGRES_URL = os.getenv("MEDIFLOW_TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(not POSTGRES_URL, reason="MEDIFLOW_TEST_POSTGRES_URL not set")


def test_concurrent_full_payments_settle_exactly_once():
    from app import create_app
    from app.auth.models import User
    from app.billing import service
    from app.billing.models import Invoice
    from app.common.enums import InvoiceStatus, PaymentMethod
    from app.config import Config
    from app.extensions import db

    class PostgresConfig(Config):
        SQLALCHEMY_DATABASE_URI = POSTGRES_URL

    app = create_app(PostgresConfig)
    with app.app_context():
        invoice = Invoice.query.filter(
            Invoice.status == InvoiceStatus.ISSUED, Invoice.balance_minor > 0
        ).first()
        assert invoice is not None, "seeded database needs an unpaid issued invoice"
        invoice_id, balance = invoice.id, invoice.balance_minor
        cashier_id = User.query.filter_by(role="CASHIER").first().id

    outcomes = []
    barrier = threading.Barrier(3)

    def pay():
        with app.app_context():
            actor = db.session.get(User, cashier_id)
            target = db.session.get(Invoice, invoice_id)
            barrier.wait()
            try:
                service.record_payment(
                    target,
                    {
                        "method": PaymentMethod.CARD,
                        "amount_minor": balance,
                        "reference": f"LOCK-{uuid.uuid4().hex[:10]}",
                    },
                    actor,
                )
                outcomes.append("paid")
            except Exception as exc:  # noqa: BLE001 - recorded for the assertion
                db.session.rollback()
                outcomes.append(f"{type(exc).__name__}: {exc}")

    threads = [threading.Thread(target=pay) for _ in range(3)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    time.sleep(0.1)

    assert outcomes.count("paid") == 1, outcomes
    with app.app_context():
        settled = db.session.get(Invoice, invoice_id)
        assert settled.status == InvoiceStatus.PAID
        assert settled.balance_minor == 0
