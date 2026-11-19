"""Encounter billing: draft invoices, finalization and eligibility at check-in.

Revision ID: 0005_encounter_billing
Revises: 0004_invoice_discount_approval
Create Date: 2026-11-18

Drafts are created at check-in and carry no invoice number until they are
finalized. The migration is idempotent because 0001 builds from current
metadata: a fresh database already has these columns and indexes.
"""

import sqlalchemy as sa
from alembic import op

revision = "0005_encounter_billing"
down_revision = "0004_invoice_discount_approval"
branch_labels = None
depends_on = None

DRAFT_INDEX = "uq_invoices_draft_appointment"


def _columns(bind, table):
    return {column["name"]: column for column in sa.inspect(bind).get_columns(table)}


def _indexes(bind, table):
    return {index["name"]: index for index in sa.inspect(bind).get_indexes(table)}


def _foreign_keys(bind, table, column):
    return [
        item
        for item in sa.inspect(bind).get_foreign_keys(table)
        if item.get("constrained_columns") == [column]
    ]


def _fk_name(table, column):
    return f"fk_{table}_{column}"


def _ensure_invoice_number_index(bind):
    indexes = _indexes(bind, "invoices")
    index = indexes.get("ix_invoices_invoice_number")
    if index is None:
        op.create_index(
            "ix_invoices_invoice_number",
            "invoices",
            ["invoice_number"],
            unique=True,
        )
    elif not index.get("unique"):
        # A non-unique index would silently allow duplicate numbers.
        op.drop_index("ix_invoices_invoice_number", table_name="invoices")
        op.create_index(
            "ix_invoices_invoice_number",
            "invoices",
            ["invoice_number"],
            unique=True,
        )


def _assert_no_duplicate_drafts(bind):
    duplicates = bind.execute(
        sa.text(
            "SELECT appointment_id, count(*) AS draft_count FROM invoices "
            "WHERE appointment_id IS NOT NULL AND status = 'DRAFT' "
            "GROUP BY appointment_id HAVING count(*) > 1"
        )
    ).fetchall()
    if duplicates:
        appointment_ids = ", ".join(str(row[0]) for row in duplicates)
        raise RuntimeError(
            "Cannot create the one-draft-per-appointment index. These "
            f"appointments have more than one draft invoice: {appointment_ids}"
        )


def _placeholder_invoice_number(bind):
    if bind.dialect.name == "postgresql":
        expression = "replace(id::text, '-', '')"
    else:
        expression = "substr(CAST(id AS TEXT), 1, 32)"
    op.execute(
        sa.text(
            "UPDATE invoices SET invoice_number = 'DRAFT-' || "
            f"{expression} WHERE invoice_number IS NULL"
        )
    )


def upgrade():
    bind = op.get_bind()

    invoice_columns = _columns(bind, "invoices")
    with op.batch_alter_table("invoices") as batch:
        if "appointment_id" not in invoice_columns:
            batch.add_column(sa.Column("appointment_id", sa.Uuid(as_uuid=True), nullable=True))
        if "finalized_at" not in invoice_columns:
            batch.add_column(sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True))
        if invoice_columns["invoice_number"].get("nullable") is False:
            batch.alter_column(
                "invoice_number",
                existing_type=sa.String(length=40),
                nullable=True,
            )

    if not _foreign_keys(bind, "invoices", "appointment_id"):
        with op.batch_alter_table("invoices") as batch:
            batch.create_foreign_key(
                _fk_name("invoices", "appointment_id"),
                "appointments",
                ["appointment_id"],
                ["id"],
            )

    invoice_indexes = _indexes(bind, "invoices")
    if "ix_invoices_appointment_id" not in invoice_indexes:
        op.create_index("ix_invoices_appointment_id", "invoices", ["appointment_id"])
    _ensure_invoice_number_index(bind)
    if DRAFT_INDEX not in invoice_indexes:
        _assert_no_duplicate_drafts(bind)
        op.create_index(
            DRAFT_INDEX,
            "invoices",
            ["appointment_id"],
            unique=True,
            sqlite_where=sa.text("status = 'DRAFT'"),
            postgresql_where=sa.text("status = 'DRAFT'"),
        )

    eligibility_columns = _columns(bind, "eligibility_checks")
    with op.batch_alter_table("eligibility_checks") as batch:
        if "appointment_id" not in eligibility_columns:
            batch.add_column(sa.Column("appointment_id", sa.Uuid(as_uuid=True), nullable=True))
        if eligibility_columns["invoice_id"].get("nullable") is False:
            batch.alter_column(
                "invoice_id",
                existing_type=sa.Uuid(as_uuid=True),
                nullable=True,
            )

    if not _foreign_keys(bind, "eligibility_checks", "appointment_id"):
        with op.batch_alter_table("eligibility_checks") as batch:
            batch.create_foreign_key(
                _fk_name("eligibility_checks", "appointment_id"),
                "appointments",
                ["appointment_id"],
                ["id"],
            )
    if "ix_eligibility_checks_appointment_id" not in _indexes(bind, "eligibility_checks"):
        op.create_index(
            "ix_eligibility_checks_appointment_id",
            "eligibility_checks",
            ["appointment_id"],
        )

    # Existing issued invoices keep their number; give them a finalized time.
    op.execute(
        sa.text(
            "UPDATE invoices SET finalized_at = COALESCE(issued_at, created_at) "
            "WHERE finalized_at IS NULL AND invoice_number IS NOT NULL "
            "AND status <> 'DRAFT'"
        )
    )


def downgrade():
    bind = op.get_bind()

    invoice_indexes = _indexes(bind, "invoices")
    if DRAFT_INDEX in invoice_indexes:
        op.drop_index(DRAFT_INDEX, table_name="invoices")

    # The pre-D schema requires a number on every invoice. Drafts are not
    # deleted: they get a downgrade-only placeholder so rows and lines survive.
    _placeholder_invoice_number(bind)
    invoice_columns = _columns(bind, "invoices")
    with op.batch_alter_table("invoices") as batch:
        if invoice_columns["invoice_number"].get("nullable") is True:
            batch.alter_column(
                "invoice_number",
                existing_type=sa.String(length=40),
                nullable=False,
            )
    _ensure_invoice_number_index(bind)

    if "ix_invoices_appointment_id" in invoice_indexes:
        op.drop_index("ix_invoices_appointment_id", table_name="invoices")
    named_fks = [
        item["name"]
        for item in _foreign_keys(bind, "invoices", "appointment_id")
        if item.get("name")
    ]
    with op.batch_alter_table("invoices") as batch:
        for name in named_fks:
            batch.drop_constraint(name, type_="foreignkey")
        if "finalized_at" in invoice_columns:
            batch.drop_column("finalized_at")
        if "appointment_id" in invoice_columns:
            batch.drop_column("appointment_id")

    eligibility_indexes = _indexes(bind, "eligibility_checks")
    if "ix_eligibility_checks_appointment_id" in eligibility_indexes:
        op.drop_index(
            "ix_eligibility_checks_appointment_id",
            table_name="eligibility_checks",
        )
    eligibility_columns = _columns(bind, "eligibility_checks")
    named_fks = [
        item["name"]
        for item in _foreign_keys(bind, "eligibility_checks", "appointment_id")
        if item.get("name")
    ]
    with op.batch_alter_table("eligibility_checks") as batch:
        for name in named_fks:
            batch.drop_constraint(name, type_="foreignkey")
        if "appointment_id" in eligibility_columns:
            batch.drop_column("appointment_id")
    # invoice_id was nullable before this revision too, so it stays nullable.
