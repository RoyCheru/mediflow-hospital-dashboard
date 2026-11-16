"""Walk-in and follow-up appointment model.

Revision ID: 0002_walk_in_appointment_model
Revises: 0001_initial
Create Date: 2026-11-14

The initial revision builds from current SQLAlchemy metadata, so a fresh database
already has these columns/constraints. This migration is therefore idempotent:
it adds what an older database is missing and leaves a fresh schema untouched.
"""

from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from alembic import op

revision = "0002_walk_in_appointment_model"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

WALK_IN_CHECK = "source <> 'WALK_IN' OR (arrived_at IS NOT NULL AND status <> 'SCHEDULED')"
BOOKED_CHECK = "source = 'WALK_IN' OR (scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL)"
SOURCE_CHECK = "source IN ('ONLINE', 'RECEPTION', 'WALK_IN', 'FOLLOW_UP')"


def _ids(rows):
    return ", ".join(str(row[0]) for row in rows)


def _appointment_columns(bind):
    return {column["name"]: column for column in sa.inspect(bind).get_columns("appointments")}


def _check_names(bind):
    return {
        constraint["name"] for constraint in sa.inspect(bind).get_check_constraints("appointments")
    }


def _index_names(bind):
    return {index["name"] for index in sa.inspect(bind).get_indexes("appointments")}


def upgrade():
    bind = op.get_bind()
    columns = _appointment_columns(bind)

    # Older SQLAlchemy versions may have created a VARCHAR source check. Drop a
    # legacy source check but keep our own named constraint if it already exists.
    if bind.dialect.name == "postgresql":
        for constraint in sa.inspect(bind).get_check_constraints("appointments"):
            if constraint["name"] == "ck_appointments_source_values":
                continue
            if "source" in (constraint.get("sqltext") or "").lower():
                op.drop_constraint(constraint["name"], "appointments", type_="check")

    missing_columns = []
    if "arrived_at" not in columns:
        missing_columns.append(sa.Column("arrived_at", sa.DateTime(timezone=True), nullable=True))
    if "follow_up_of_visit_id" not in columns:
        missing_columns.append(
            sa.Column("follow_up_of_visit_id", sa.Uuid(as_uuid=True), nullable=True)
        )
    if missing_columns:
        with op.batch_alter_table("appointments") as batch:
            for column in missing_columns:
                batch.add_column(column)

    op.execute(
        sa.text(
            "UPDATE appointments "
            "SET arrived_at = COALESCE(checked_in_at, created_at) "
            "WHERE arrived_at IS NULL "
            "AND status IN ('CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED')"
        )
    )

    walk_in_violations = bind.execute(
        sa.text(
            "SELECT id FROM appointments "
            "WHERE source = 'WALK_IN' AND (arrived_at IS NULL OR status = 'SCHEDULED')"
        )
    ).fetchall()
    if walk_in_violations:
        raise RuntimeError(
            "Cannot add walk-in constraints. These walk-in appointments have no "
            "arrival time or are still scheduled and need manual review: "
            + _ids(walk_in_violations)
        )

    booked_violations = bind.execute(
        sa.text(
            "SELECT id FROM appointments "
            "WHERE source <> 'WALK_IN' "
            "AND (scheduled_start IS NULL OR scheduled_end IS NULL)"
        )
    ).fetchall()
    if booked_violations:
        raise RuntimeError(
            "Cannot add booked-appointment constraints. These rows have no slot: "
            + _ids(booked_violations)
        )

    columns = _appointment_columns(bind)
    checks = _check_names(bind)
    with op.batch_alter_table("appointments") as batch:
        if columns["scheduled_start"].get("nullable") is False:
            batch.alter_column(
                "scheduled_start",
                existing_type=sa.DateTime(timezone=True),
                nullable=True,
            )
        if columns["scheduled_end"].get("nullable") is False:
            batch.alter_column(
                "scheduled_end",
                existing_type=sa.DateTime(timezone=True),
                nullable=True,
            )
        if "ck_appointments_walk_in_arrived" not in checks:
            batch.create_check_constraint("ck_appointments_walk_in_arrived", WALK_IN_CHECK)
        if "ck_appointments_booked_slot" not in checks:
            batch.create_check_constraint("ck_appointments_booked_slot", BOOKED_CHECK)
        if "ck_appointments_source_values" not in checks:
            batch.create_check_constraint("ck_appointments_source_values", SOURCE_CHECK)

    indexes = _index_names(bind)
    if "ix_appointments_doctor_arrived" not in indexes:
        op.create_index(
            "ix_appointments_doctor_arrived",
            "appointments",
            ["doctor_id", "status", "arrived_at"],
        )
    if "ix_appointments_follow_up_of_visit_id" not in indexes:
        op.create_index(
            "ix_appointments_follow_up_of_visit_id",
            "appointments",
            ["follow_up_of_visit_id"],
        )


def downgrade():
    bind = op.get_bind()
    columns = _appointment_columns(bind)

    # The old model cannot read FOLLOW_UP. Treat those booked rows as reception
    # bookings so no appointment data is lost.
    if "source" in columns:
        op.execute(
            sa.text("UPDATE appointments SET source = 'RECEPTION' WHERE source = 'FOLLOW_UP'")
        )

    # Restore NOT NULL slot columns. Walk-ins had no slot in the new model, so
    # materialize their arrival/creation time as a synthetic 30-minute slot.
    if "scheduled_start" in columns:
        table = sa.Table("appointments", sa.MetaData(), autoload_with=bind)
        selected = [table.c.id, table.c.scheduled_start, table.c.scheduled_end]
        selected.append(
            table.c.arrived_at if "arrived_at" in columns else sa.literal(None).label("arrived_at")
        )
        selected.append(table.c.created_at)
        rows = bind.execute(
            sa.select(*selected).where(
                sa.or_(
                    table.c.scheduled_start.is_(None),
                    table.c.scheduled_end.is_(None),
                )
            )
        ).mappings()
        for row in rows:
            start = (
                row["scheduled_start"]
                or row["arrived_at"]
                or row["created_at"]
                or datetime.now(timezone.utc)
            )
            if isinstance(start, str):
                start = datetime.fromisoformat(start)
            end = row["scheduled_end"] or (start + timedelta(minutes=30))
            if isinstance(end, str):
                end = datetime.fromisoformat(end)
            bind.execute(
                table.update()
                .where(table.c.id == row["id"])
                .values(scheduled_start=start, scheduled_end=end)
            )

    indexes = _index_names(bind)
    if "ix_appointments_doctor_arrived" in indexes:
        op.drop_index("ix_appointments_doctor_arrived", table_name="appointments")
    if "ix_appointments_follow_up_of_visit_id" in indexes:
        op.drop_index("ix_appointments_follow_up_of_visit_id", table_name="appointments")

    checks = _check_names(bind)
    with op.batch_alter_table("appointments") as batch:
        if "ck_appointments_source_values" in checks:
            batch.drop_constraint("ck_appointments_source_values", type_="check")
        if "ck_appointments_walk_in_arrived" in checks:
            batch.drop_constraint("ck_appointments_walk_in_arrived", type_="check")
        if "ck_appointments_booked_slot" in checks:
            batch.drop_constraint("ck_appointments_booked_slot", type_="check")
        if "follow_up_of_visit_id" in columns:
            batch.drop_column("follow_up_of_visit_id")
        if "arrived_at" in columns:
            batch.drop_column("arrived_at")

    columns = _appointment_columns(bind)
    with op.batch_alter_table("appointments") as batch:
        if columns["scheduled_start"].get("nullable") is True:
            batch.alter_column(
                "scheduled_start",
                existing_type=sa.DateTime(timezone=True),
                nullable=False,
            )
        if columns["scheduled_end"].get("nullable") is True:
            batch.alter_column(
                "scheduled_end",
                existing_type=sa.DateTime(timezone=True),
                nullable=False,
            )
