"""0006_invoice_number_checks: round trip, enforcement, and refusal on bad data."""

import sqlite3
from pathlib import Path

import sqlalchemy as sa

from app import create_app
from app.config import TestConfig


def _create_0005_database(path: Path, extra_rows=""):
    connection = sqlite3.connect(path)
    connection.executescript(
        f"""
        CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY);
        INSERT INTO alembic_version VALUES ('0005_encounter_billing');
        CREATE TABLE invoices (
            id CHAR(32) NOT NULL PRIMARY KEY,
            invoice_number VARCHAR(40),
            status VARCHAR(24) NOT NULL
        );
        INSERT INTO invoices VALUES ('{"1" * 32}', 'INV-2026-000001', 'ISSUED');
        INSERT INTO invoices VALUES ('{"2" * 32}', NULL, 'DRAFT');
        INSERT INTO invoices VALUES ('{"3" * 32}', NULL, 'VOIDED');
        {extra_rows}
        """
    )
    connection.commit()
    connection.close()


def _runner(path: Path):
    class MigrationConfig(TestConfig):
        SQLALCHEMY_DATABASE_URI = f"sqlite+pysqlite:///{path}"

    return create_app(MigrationConfig).test_cli_runner()


def _checks(path: Path):
    engine = sa.create_engine(f"sqlite+pysqlite:///{path}")
    return {item["name"] for item in sa.inspect(engine).get_check_constraints("invoices")}


def _insert(path: Path, values: str):
    connection = sqlite3.connect(path)
    try:
        connection.execute(f"INSERT INTO invoices VALUES ({values})")
        connection.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        connection.close()


def test_0006_round_trip_and_enforcement(tmp_path):
    path = tmp_path / "mediflow.db"
    _create_0005_database(path)
    runner = _runner(path)

    upgrade = runner.invoke(args=["db", "upgrade", "0006_invoice_number_checks"])
    assert upgrade.exit_code == 0, upgrade.output
    assert _checks(path) == {"ck_invoices_number_when_final", "ck_invoices_draft_has_no_number"}
    # Existing rows are kept.
    connection = sqlite3.connect(path)
    assert connection.execute("SELECT count(*) FROM invoices").fetchone()[0] == 3
    connection.close()
    assert not _insert(path, f"'{'4' * 32}', NULL, 'ISSUED'")  # finalized without number
    assert not _insert(path, f"'{'5' * 32}', 'INV-X', 'DRAFT'")  # draft with a number
    assert _insert(path, f"'{'6' * 32}', 'INV-2026-000002', 'PAID'")

    downgrade = runner.invoke(args=["db", "downgrade", "0005_encounter_billing"])
    assert downgrade.exit_code == 0, downgrade.output
    assert _checks(path) == set()
    assert _insert(path, f"'{'7' * 32}', NULL, 'ISSUED'")  # no longer enforced

    connection = sqlite3.connect(path)
    connection.execute(f"DELETE FROM invoices WHERE id = '{'7' * 32}'")
    connection.commit()
    connection.close()
    again = runner.invoke(args=["db", "upgrade", "0006_invoice_number_checks"])
    assert again.exit_code == 0, again.output


def test_0006_refuses_to_upgrade_over_violating_rows(tmp_path):
    path = tmp_path / "mediflow.db"
    _create_0005_database(
        path, extra_rows=f"INSERT INTO invoices VALUES ('{'9' * 32}', NULL, 'PAID');"
    )
    result = _runner(path).invoke(args=["db", "upgrade", "0006_invoice_number_checks"])
    # Refused (the RuntimeError names `flask invoice-violations`; Flask-Migrate logs
    # it and exits 1), and nothing was changed.
    assert result.exit_code != 0
    connection = sqlite3.connect(path)
    assert connection.execute("SELECT version_num FROM alembic_version").fetchone()[0] == (
        "0005_encounter_billing"
    )
    connection.close()
