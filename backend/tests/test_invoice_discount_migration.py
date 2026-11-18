"""Upgrade/downgrade coverage for 0004_invoice_discount_approval."""

import sqlite3
from pathlib import Path

import sqlalchemy as sa

from app import create_app
from app.config import TestConfig

NEW_COLUMNS = {
    "discount_reason",
    "discount_status",
    "discount_requested_minor",
    "discount_requested_by_id",
    "discount_decided_by_id",
    "discount_decided_at",
}


def _create_0003_database(path: Path):
    connection = sqlite3.connect(path)
    connection.executescript(
        """
        CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY);
        INSERT INTO alembic_version VALUES ('0003_admin_staff_availability');
        CREATE TABLE users (id CHAR(32) NOT NULL PRIMARY KEY);
        CREATE TABLE invoices (
            id CHAR(32) NOT NULL PRIMARY KEY,
            invoice_number VARCHAR(40) NOT NULL,
            subtotal_minor BIGINT NOT NULL,
            discount_minor BIGINT NOT NULL,
            total_minor BIGINT NOT NULL,
            issued_by_id CHAR(32) REFERENCES users (id)
        );
        INSERT INTO invoices VALUES ('inv1', 'INV-1', 100000, 5000, 95000, NULL);
        """
    )
    connection.commit()
    connection.close()


def _app_for(path: Path):
    class MigrationConfig(TestConfig):
        SQLALCHEMY_DATABASE_URI = f"sqlite+pysqlite:///{path}"

    return create_app(MigrationConfig)


def _inspector(path: Path):
    return sa.inspect(sa.create_engine(f"sqlite+pysqlite:///{path}"))


def test_0004_round_trip_keeps_applied_discounts(tmp_path):
    path = tmp_path / "at_0003.db"
    _create_0003_database(path)
    runner = _app_for(path).test_cli_runner()

    upgrade = runner.invoke(args=["db", "upgrade", "0004_invoice_discount_approval"])
    assert upgrade.exit_code == 0, upgrade.output
    inspector = _inspector(path)
    columns = {column["name"] for column in inspector.get_columns("invoices")}
    assert NEW_COLUMNS <= columns
    user_fk_columns = {
        tuple(fk["constrained_columns"])
        for fk in inspector.get_foreign_keys("invoices")
        if fk["referred_table"] == "users"
    }
    assert {("discount_requested_by_id",), ("discount_decided_by_id",)} <= user_fk_columns

    downgrade = runner.invoke(args=["db", "downgrade", "0003_admin_staff_availability"])
    assert downgrade.exit_code == 0, downgrade.output
    columns = {column["name"] for column in _inspector(path).get_columns("invoices")}
    assert NEW_COLUMNS.isdisjoint(columns)
    connection = sqlite3.connect(path)
    assert connection.execute(
        "SELECT invoice_number, discount_minor, total_minor FROM invoices"
    ).fetchall() == [("INV-1", 5000, 95000)]
    connection.close()

    again = runner.invoke(args=["db", "upgrade", "0004_invoice_discount_approval"])
    assert again.exit_code == 0, again.output
