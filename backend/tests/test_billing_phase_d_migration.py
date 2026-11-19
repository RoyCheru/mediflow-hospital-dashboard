"""Upgrade/downgrade coverage for 0005_encounter_billing."""

import sqlite3
from pathlib import Path

import sqlalchemy as sa

from app import create_app
from app.config import TestConfig

ISSUED_ID = "1" * 32
DRAFT_ID = "2" * 32
APPOINTMENT_ID = "a" * 32
NEW_APPOINTMENT_ID = "b" * 32
ELIGIBILITY_ID = "3" * 32


def _create_0004_database(path: Path):
    connection = sqlite3.connect(path)
    connection.executescript(
        f"""
        CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY);
        INSERT INTO alembic_version VALUES ('0004_invoice_discount_approval');
        CREATE TABLE appointments (id CHAR(32) NOT NULL PRIMARY KEY);
        CREATE TABLE invoices (
            id CHAR(32) NOT NULL PRIMARY KEY,
            invoice_number VARCHAR(40) NOT NULL,
            status VARCHAR(24) NOT NULL,
            issued_at DATETIME,
            created_at DATETIME NOT NULL
        );
        CREATE TABLE eligibility_checks (
            id CHAR(32) NOT NULL PRIMARY KEY,
            invoice_id CHAR(32) NOT NULL REFERENCES invoices (id)
        );
        INSERT INTO appointments VALUES ('{APPOINTMENT_ID}');
        INSERT INTO invoices VALUES (
            '{ISSUED_ID}', 'INV-2026-000001', 'ISSUED',
            '2026-01-02 03:04:05', '2026-01-01 00:00:00'
        );
        INSERT INTO invoices VALUES (
            '{DRAFT_ID}', 'INV-2026-000002', 'DRAFT',
            NULL, '2026-01-03 00:00:00'
        );
        INSERT INTO eligibility_checks VALUES ('{ELIGIBILITY_ID}', '{ISSUED_ID}');
        """
    )
    connection.commit()
    connection.close()


def _app_for(path: Path):
    class MigrationConfig(TestConfig):
        SQLALCHEMY_DATABASE_URI = f"sqlite+pysqlite:///{path}"

    return create_app(MigrationConfig)


def _inspect(path: Path):
    return sa.inspect(sa.create_engine(f"sqlite+pysqlite:///{path}"))


def _columns(path: Path, table: str):
    return {column["name"]: column for column in _inspect(path).get_columns(table)}


def _indexes(path: Path, table: str):
    return {index["name"] for index in _inspect(path).get_indexes(table)}


def test_0005_round_trip_backfills_and_keeps_existing_invoices(tmp_path):
    path = tmp_path / "at_0004.db"
    _create_0004_database(path)
    runner = _app_for(path).test_cli_runner()

    upgrade = runner.invoke(args=["db", "upgrade", "0005_encounter_billing"])
    assert upgrade.exit_code == 0, upgrade.output

    invoices = _columns(path, "invoices")
    assert {"appointment_id", "finalized_at"} <= set(invoices)
    assert invoices["invoice_number"]["nullable"] is True
    assert {("appointment_id",)} <= {
        tuple(fk["constrained_columns"])
        for fk in _inspect(path).get_foreign_keys("invoices")
        if fk["referred_table"] == "appointments"
    }
    assert {
        "ix_invoices_appointment_id",
        "ix_invoices_invoice_number",
        "uq_invoices_draft_appointment",
    } <= _indexes(path, "invoices")

    eligibility = _columns(path, "eligibility_checks")
    assert "appointment_id" in eligibility
    assert eligibility["invoice_id"]["nullable"] is True
    assert {("appointment_id",)} <= {
        tuple(fk["constrained_columns"])
        for fk in _inspect(path).get_foreign_keys("eligibility_checks")
        if fk["referred_table"] == "appointments"
    }
    assert "ix_eligibility_checks_appointment_id" in _indexes(path, "eligibility_checks")

    connection = sqlite3.connect(path)
    issued_finalized, issued_number = connection.execute(
        "SELECT finalized_at, invoice_number FROM invoices WHERE id = ?", (ISSUED_ID,)
    ).fetchone()
    draft_finalized, draft_number = connection.execute(
        "SELECT finalized_at, invoice_number FROM invoices WHERE id = ?", (DRAFT_ID,)
    ).fetchone()
    assert issued_finalized == "2026-01-02 03:04:05"
    assert issued_number == "INV-2026-000001"
    assert draft_finalized is None
    assert draft_number == "INV-2026-000002"

    # invoice_id may now be null, and one appointment cannot have two drafts.
    connection.execute(
        "INSERT INTO eligibility_checks (id, invoice_id, appointment_id) VALUES (?, NULL, ?)",
        ("4" * 32, APPOINTMENT_ID),
    )
    connection.execute(
        "INSERT INTO invoices (id, invoice_number, status, created_at, appointment_id) "
        "VALUES (?, NULL, 'DRAFT', '2026-01-04 00:00:00', ?)",
        ("5" * 32, NEW_APPOINTMENT_ID),
    )
    try:
        connection.execute(
            "INSERT INTO invoices (id, invoice_number, status, created_at, appointment_id) "
            "VALUES (?, NULL, 'DRAFT', '2026-01-04 00:00:00', ?)",
            ("6" * 32, NEW_APPOINTMENT_ID),
        )
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("one draft per appointment was not enforced")
    connection.commit()
    connection.close()

    downgrade = runner.invoke(args=["db", "downgrade", "0004_invoice_discount_approval"])
    assert downgrade.exit_code == 0, downgrade.output

    invoices = _columns(path, "invoices")
    assert "appointment_id" not in invoices
    assert "finalized_at" not in invoices
    assert invoices["invoice_number"]["nullable"] is False
    assert "ix_invoices_appointment_id" not in _indexes(path, "invoices")
    assert "uq_invoices_draft_appointment" not in _indexes(path, "invoices")
    eligibility = _columns(path, "eligibility_checks")
    assert "appointment_id" not in eligibility
    assert eligibility["invoice_id"]["nullable"] is True

    connection = sqlite3.connect(path)
    rows = dict(connection.execute("SELECT id, invoice_number FROM invoices").fetchall())
    assert rows[ISSUED_ID] == "INV-2026-000001"
    assert rows["5" * 32].startswith("DRAFT-")
    connection.close()

    again = runner.invoke(args=["db", "upgrade", "0005_encounter_billing"])
    assert again.exit_code == 0, again.output
