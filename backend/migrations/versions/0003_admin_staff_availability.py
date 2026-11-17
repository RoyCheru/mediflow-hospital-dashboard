"""Admin staff availability ownership and appointment filter indexes.

Revision ID: 0003_admin_staff_availability
Revises: 0002_walk_in_appointment_model
Create Date: 2026-11-16

The initial revision builds from current metadata, so a fresh database already
has these columns/constraints. This migration is idempotent for older databases.
"""

import sqlalchemy as sa
from alembic import op

revision = "0003_admin_staff_availability"
down_revision = "0002_walk_in_appointment_model"
branch_labels = None
depends_on = None

RULE_OWNER_CHECK = (
    "(doctor_id IS NOT NULL AND user_id IS NULL) OR (doctor_id IS NULL AND user_id IS NOT NULL)"
)
EXCEPTION_OWNER_CHECK = RULE_OWNER_CHECK


def _columns(bind, table):
    return {column["name"]: column for column in sa.inspect(bind).get_columns(table)}


def _checks(bind, table):
    return {constraint["name"] for constraint in sa.inspect(bind).get_check_constraints(table)}


def _indexes(bind, table):
    return {index["name"] for index in sa.inspect(bind).get_indexes(table)}


def upgrade():
    bind = op.get_bind()

    for table, check_name, check_sql, index_name in (
        (
            "availability_rules",
            "ck_availability_rules_owner",
            RULE_OWNER_CHECK,
            "ix_availability_rules_user_weekday",
        ),
        (
            "availability_exceptions",
            "ck_availability_exceptions_owner",
            EXCEPTION_OWNER_CHECK,
            "ix_availability_exceptions_user_start",
        ),
    ):
        columns = _columns(bind, table)
        checks = _checks(bind, table)
        with op.batch_alter_table(table) as batch:
            if "user_id" not in columns:
                batch.add_column(sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=True))
            if columns["doctor_id"].get("nullable") is False:
                batch.alter_column(
                    "doctor_id",
                    existing_type=sa.Uuid(as_uuid=True),
                    nullable=True,
                )
            if check_name not in checks:
                batch.create_check_constraint(check_name, check_sql)

        indexes = _indexes(bind, table)
        if index_name not in indexes:
            if table == "availability_rules":
                op.create_index(index_name, table, ["user_id", "weekday"])
            else:
                op.create_index(index_name, table, ["user_id", "start_at"])

    appointment_indexes = _indexes(bind, "appointments")
    if "ix_appointments_department_date" not in appointment_indexes:
        op.create_index(
            "ix_appointments_department_date",
            "appointments",
            ["department_id", "scheduled_start"],
        )
    if "ix_appointments_source_created" not in appointment_indexes:
        op.create_index(
            "ix_appointments_source_created",
            "appointments",
            ["source", "created_at"],
        )


def downgrade():
    bind = op.get_bind()

    for table in ("availability_rules", "availability_exceptions"):
        columns = _columns(bind, table)
        if "user_id" in columns:
            count = bind.execute(
                sa.text(f"SELECT count(*) FROM {table} WHERE user_id IS NOT NULL")
            ).scalar()
            if count:
                raise RuntimeError(
                    f"Cannot downgrade: {count} {table} rows belong to non-doctor "
                    "staff. Remove or migrate those working-hours records first."
                )

    for table, check_name, index_name in (
        (
            "availability_rules",
            "ck_availability_rules_owner",
            "ix_availability_rules_user_weekday",
        ),
        (
            "availability_exceptions",
            "ck_availability_exceptions_owner",
            "ix_availability_exceptions_user_start",
        ),
    ):
        columns = _columns(bind, table)
        checks = _checks(bind, table)
        indexes = _indexes(bind, table)
        if index_name in indexes:
            op.drop_index(index_name, table_name=table)
        with op.batch_alter_table(table) as batch:
            if check_name in checks:
                batch.drop_constraint(check_name, type_="check")
            if "user_id" in columns:
                batch.drop_column("user_id")
            if columns["doctor_id"].get("nullable") is True:
                batch.alter_column(
                    "doctor_id",
                    existing_type=sa.Uuid(as_uuid=True),
                    nullable=False,
                )

    appointment_indexes = _indexes(bind, "appointments")
    if "ix_appointments_department_date" in appointment_indexes:
        op.drop_index("ix_appointments_department_date", table_name="appointments")
    if "ix_appointments_source_created" in appointment_indexes:
        op.drop_index("ix_appointments_source_created", table_name="appointments")
