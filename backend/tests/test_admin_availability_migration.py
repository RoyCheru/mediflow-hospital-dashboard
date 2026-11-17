"""Upgrade/downgrade coverage for 0003_admin_staff_availability."""

import sqlite3
from pathlib import Path

import sqlalchemy as sa

from app import create_app
from app.config import TestConfig

DOCTOR_RULE_ID = "1" * 32
DOCTOR_EXCEPTION_ID = "2" * 32
DOCTOR_ID = "d" * 32
DOCTOR_USER_ID = "e" * 32
RECEPTION_USER_ID = "f" * 32


def _create_0002_database(path: Path):
    """Schema subset as it existed at 0002, with one doctor rule and exception."""
    connection = sqlite3.connect(path)
    connection.executescript(
        f"""
        CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY);
        INSERT INTO alembic_version VALUES ('0002_walk_in_appointment_model');
        CREATE TABLE users (id CHAR(32) NOT NULL PRIMARY KEY, email VARCHAR(255));
        CREATE TABLE doctor_profiles (
            id CHAR(32) NOT NULL PRIMARY KEY,
            user_id CHAR(32) REFERENCES users (id)
        );
        CREATE TABLE availability_rules (
            id CHAR(32) NOT NULL PRIMARY KEY,
            doctor_id CHAR(32) NOT NULL REFERENCES doctor_profiles (id),
            weekday INTEGER NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            slot_minutes INTEGER NOT NULL,
            timezone VARCHAR(64) NOT NULL,
            effective_from DATE,
            effective_to DATE,
            is_active BOOLEAN NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        );
        CREATE INDEX ix_availability_rules_doctor_id ON availability_rules (doctor_id);
        CREATE TABLE availability_exceptions (
            id CHAR(32) NOT NULL PRIMARY KEY,
            doctor_id CHAR(32) NOT NULL REFERENCES doctor_profiles (id),
            start_at DATETIME NOT NULL,
            end_at DATETIME NOT NULL,
            kind VARCHAR(16) NOT NULL,
            reason TEXT,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        );
        CREATE INDEX ix_availability_exceptions_doctor_id
            ON availability_exceptions (doctor_id);
        CREATE TABLE appointments (
            id CHAR(32) NOT NULL PRIMARY KEY,
            department_id CHAR(32),
            scheduled_start DATETIME,
            source VARCHAR(16) NOT NULL,
            created_at DATETIME NOT NULL
        );
        INSERT INTO users VALUES ('{DOCTOR_USER_ID}', 'doc@example.test');
        INSERT INTO users VALUES ('{RECEPTION_USER_ID}', 'desk@example.test');
        INSERT INTO doctor_profiles VALUES ('{DOCTOR_ID}', '{DOCTOR_USER_ID}');
        INSERT INTO availability_rules VALUES (
            '{DOCTOR_RULE_ID}', '{DOCTOR_ID}', 0, '08:00:00', '12:00:00', 30,
            'Africa/Nairobi', NULL, NULL, 1, '2026-01-01 00:00:00', '2026-01-01 00:00:00'
        );
        INSERT INTO availability_exceptions VALUES (
            '{DOCTOR_EXCEPTION_ID}', '{DOCTOR_ID}', '2026-01-05 05:00:00',
            '2026-01-05 15:00:00', 'LEAVE', 'Leave',
            '2026-01-01 00:00:00', '2026-01-01 00:00:00'
        );
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


def _version(path: Path):
    connection = sqlite3.connect(path)
    try:
        return connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    finally:
        connection.close()


def test_0003_upgrade_downgrade_round_trip_preserves_doctor_rows(tmp_path):
    path = tmp_path / "at_0002.db"
    _create_0002_database(path)
    runner = _app_for(path).test_cli_runner()

    upgrade = runner.invoke(args=["db", "upgrade", "0003_admin_staff_availability"])
    assert upgrade.exit_code == 0, upgrade.output
    assert _version(path) == "0003_admin_staff_availability"

    inspector = _inspect(path)
    for table, composite in (
        ("availability_rules", "ix_availability_rules_user_weekday"),
        ("availability_exceptions", "ix_availability_exceptions_user_start"),
    ):
        columns = {column["name"]: column for column in inspector.get_columns(table)}
        assert columns["user_id"]["nullable"] is True
        assert columns["doctor_id"]["nullable"] is True
        assert any(
            fk["referred_table"] == "users" and fk["constrained_columns"] == ["user_id"]
            for fk in inspector.get_foreign_keys(table)
        ), table
        indexes = {index["name"] for index in inspector.get_indexes(table)}
        assert {f"ix_{table}_user_id", composite} <= indexes
        checks = {check["name"] for check in inspector.get_check_constraints(table)}
        assert f"ck_{table}_owner" in checks
    appointment_indexes = {index["name"] for index in inspector.get_indexes("appointments")}
    assert {"ix_appointments_department_date", "ix_appointments_source_created"} <= (
        appointment_indexes
    )

    connection = sqlite3.connect(path)
    # Existing doctor rows survive and keep their owner.
    assert connection.execute(
        "SELECT doctor_id, user_id FROM availability_rules WHERE id = ?", (DOCTOR_RULE_ID,)
    ).fetchone() == (DOCTOR_ID, None)
    # The owner check rejects rows with no owner or two owners.
    for doctor_id, user_id in ((None, None), (DOCTOR_ID, RECEPTION_USER_ID)):
        try:
            connection.execute(
                "INSERT INTO availability_rules (id, doctor_id, user_id, weekday, start_time, "
                "end_time, slot_minutes, timezone, is_active, created_at, updated_at) VALUES "
                "(?, ?, ?, 1, '08:00:00', '09:00:00', 30, 'Africa/Nairobi', 1, "
                "'2026-01-01', '2026-01-01')",
                ("9" * 32, doctor_id, user_id),
            )
        except sqlite3.IntegrityError:
            pass
        else:
            raise AssertionError("owner check constraint not enforced")
    # Non-doctor staff working hours block the downgrade instead of being dropped.
    connection.execute(
        "INSERT INTO availability_rules (id, doctor_id, user_id, weekday, start_time, "
        "end_time, slot_minutes, timezone, is_active, created_at, updated_at) VALUES "
        "(?, NULL, ?, 1, '08:00:00', '17:00:00', 30, 'Africa/Nairobi', 1, "
        "'2026-01-01', '2026-01-01')",
        ("3" * 32, RECEPTION_USER_ID),
    )
    connection.commit()
    connection.close()

    refused = runner.invoke(args=["db", "downgrade", "0002_walk_in_appointment_model"])
    assert refused.exit_code != 0
    assert _version(path) == "0003_admin_staff_availability"

    connection = sqlite3.connect(path)
    connection.execute("DELETE FROM availability_rules WHERE user_id IS NOT NULL")
    connection.commit()
    connection.close()

    downgrade = runner.invoke(args=["db", "downgrade", "0002_walk_in_appointment_model"])
    assert downgrade.exit_code == 0, downgrade.output
    assert _version(path) == "0002_walk_in_appointment_model"

    inspector = _inspect(path)
    for table in ("availability_rules", "availability_exceptions"):
        columns = {column["name"]: column for column in inspector.get_columns(table)}
        assert "user_id" not in columns
        assert columns["doctor_id"]["nullable"] is False
    assert {"ix_appointments_department_date", "ix_appointments_source_created"}.isdisjoint(
        {index["name"] for index in inspector.get_indexes("appointments")}
    )
    connection = sqlite3.connect(path)
    assert connection.execute("SELECT count(*) FROM availability_rules").fetchone() == (1,)
    assert connection.execute("SELECT count(*) FROM availability_exceptions").fetchone() == (1,)
    connection.close()

    # Upgrading again after a downgrade is clean.
    again = runner.invoke(args=["db", "upgrade", "0003_admin_staff_availability"])
    assert again.exit_code == 0, again.output


def test_0003_upgrade_repairs_first_draft_schema(tmp_path):
    """A DB that applied the first draft (no FK/index) gains them on re-upgrade."""
    path = tmp_path / "draft.db"
    _create_0002_database(path)
    connection = sqlite3.connect(path)
    connection.executescript(
        """
        ALTER TABLE availability_rules ADD COLUMN user_id CHAR(32);
        ALTER TABLE availability_exceptions ADD COLUMN user_id CHAR(32);
        """
    )
    connection.commit()
    connection.close()

    runner = _app_for(path).test_cli_runner()
    upgrade = runner.invoke(args=["db", "upgrade", "0003_admin_staff_availability"])
    assert upgrade.exit_code == 0, upgrade.output
    inspector = _inspect(path)
    for table in ("availability_rules", "availability_exceptions"):
        assert any(
            fk["referred_table"] == "users" for fk in inspector.get_foreign_keys(table)
        ), table
        assert f"ix_{table}_user_id" in {index["name"] for index in inspector.get_indexes(table)}
