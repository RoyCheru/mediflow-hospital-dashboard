import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from app import create_app
from app.config import TestConfig


def _create_legacy_database(path: Path, rows):
    connection = sqlite3.connect(path)
    connection.executescript(
        """
        CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY);
        INSERT INTO alembic_version (version_num) VALUES ('0001_initial');
        CREATE TABLE appointments (
            id CHAR(32) NOT NULL PRIMARY KEY,
            patient_id CHAR(32),
            doctor_id CHAR(32),
            department_id CHAR(32),
            service_id CHAR(32),
            scheduled_start DATETIME NOT NULL,
            scheduled_end DATETIME NOT NULL,
            status VARCHAR(32) NOT NULL,
            source VARCHAR(16) NOT NULL,
            urgency VARCHAR(16) NOT NULL DEFAULT 'ROUTINE',
            no_show_score NUMERIC(5, 4),
            booked_by_id CHAR(32),
            rescheduled_from_id CHAR(32),
            checked_in_at DATETIME,
            started_at DATETIME,
            completed_at DATETIME,
            cancelled_at DATETIME,
            cancellation_reason TEXT,
            notes TEXT,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        );
        """
    )
    now = datetime.now(timezone.utc).isoformat(sep=" ")
    for row in rows:
        connection.execute(
            """
            INSERT INTO appointments (
                id, scheduled_start, scheduled_end, status, source,
                checked_in_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["id"],
                row["scheduled_start"],
                row["scheduled_end"],
                row["status"],
                row["source"],
                row.get("checked_in_at"),
                now,
                now,
            ),
        )
    connection.commit()
    connection.close()


def _app_for(path: Path):
    class MigrationConfig(TestConfig):
        SQLALCHEMY_DATABASE_URI = f"sqlite+pysqlite:///{path}"

    return create_app(MigrationConfig)


def test_migration_upgrade_and_downgrade_on_existing_appointments(tmp_path):
    path = tmp_path / "legacy.db"
    _create_legacy_database(
        path,
        [
            {
                "id": "a" * 32,
                "scheduled_start": "2030-01-07 10:00:00",
                "scheduled_end": "2030-01-07 10:30:00",
                "status": "SCHEDULED",
                "source": "RECEPTION",
            },
            {
                "id": "b" * 32,
                "scheduled_start": "2030-01-07 11:00:00",
                "scheduled_end": "2030-01-07 11:30:00",
                "status": "CHECKED_IN",
                "source": "WALK_IN",
                "checked_in_at": "2030-01-07 11:05:00",
            },
        ],
    )
    app = _app_for(path)
    runner = app.test_cli_runner()

    upgrade = runner.invoke(args=["db", "upgrade", "0002_walk_in_appointment_model"])
    assert upgrade.exit_code == 0, upgrade.output

    connection = sqlite3.connect(path)
    columns = {row[1] for row in connection.execute("PRAGMA table_info(appointments)").fetchall()}
    assert "arrived_at" in columns
    assert "follow_up_of_visit_id" in columns
    walk_in_arrived = connection.execute(
        "SELECT arrived_at FROM appointments WHERE id = ?", ("b" * 32,)
    ).fetchone()[0]
    booked_arrived = connection.execute(
        "SELECT arrived_at FROM appointments WHERE id = ?", ("a" * 32,)
    ).fetchone()[0]
    assert walk_in_arrived is not None
    assert booked_arrived is None
    schema = connection.execute(
        "SELECT sql FROM sqlite_master WHERE name = 'appointments'"
    ).fetchone()[0]
    assert "ck_appointments_walk_in_arrived" in schema
    assert "ck_appointments_booked_slot" in schema

    now = datetime.now(timezone.utc).isoformat(sep=" ")
    connection.execute(
        """
        INSERT INTO appointments (
            id, scheduled_start, scheduled_end, status, source,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "c" * 32,
            "2030-01-08 09:00:00",
            "2030-01-08 09:30:00",
            "SCHEDULED",
            "FOLLOW_UP",
            now,
            now,
        ),
    )
    connection.commit()
    connection.close()

    downgrade = runner.invoke(args=["db", "downgrade", "0001_initial"])
    assert downgrade.exit_code == 0, downgrade.output

    connection = sqlite3.connect(path)
    columns = {row[1] for row in connection.execute("PRAGMA table_info(appointments)").fetchall()}
    assert "arrived_at" not in columns
    assert "follow_up_of_visit_id" not in columns
    follow_up_source = connection.execute(
        "SELECT source FROM appointments WHERE id = ?", ("c" * 32,)
    ).fetchone()[0]
    walk_in_slot = connection.execute(
        "SELECT scheduled_start FROM appointments WHERE id = ?", ("b" * 32,)
    ).fetchone()[0]
    assert follow_up_source == "RECEPTION"
    assert walk_in_slot is not None
    connection.close()


def test_migration_refuses_unfixable_walk_in_rows(tmp_path):
    path = tmp_path / "bad-walk-in.db"
    _create_legacy_database(
        path,
        [
            {
                "id": "d" * 32,
                "scheduled_start": "2030-01-07 11:00:00",
                "scheduled_end": "2030-01-07 11:30:00",
                "status": "SCHEDULED",
                "source": "WALK_IN",
            }
        ],
    )
    app = _app_for(path)
    runner = app.test_cli_runner()

    upgrade = runner.invoke(args=["db", "upgrade", "0002_walk_in_appointment_model"])
    assert upgrade.exit_code != 0

    connection = sqlite3.connect(path)
    version = connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    schema = connection.execute(
        "SELECT sql FROM sqlite_master WHERE name = 'appointments'"
    ).fetchone()[0]
    row = connection.execute("SELECT id FROM appointments WHERE id = ?", ("d" * 32,)).fetchone()
    connection.close()
    assert version == "0001_initial"
    assert row is not None
    assert "ck_appointments_walk_in_arrived" not in schema
