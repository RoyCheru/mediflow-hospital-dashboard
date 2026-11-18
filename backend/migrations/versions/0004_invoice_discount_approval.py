"""Invoice discount reason and approval workflow.

Revision ID: 0004_invoice_discount_approval
Revises: 0003_admin_staff_availability
Create Date: 2026-11-18

0001 builds from current metadata, so a fresh database already has these
columns; every step checks the live schema first. Downgrade drops the
discount workflow columns (reasons and approval history); the applied
discount_minor is kept.
"""

import sqlalchemy as sa
from alembic import op

revision = "0004_invoice_discount_approval"
down_revision = "0003_admin_staff_availability"
branch_labels = None
depends_on = None

COLUMNS = (
    ("discount_reason", sa.Text()),
    ("discount_status", sa.String(length=24)),
    ("discount_requested_minor", sa.BigInteger()),
    ("discount_requested_by_id", sa.Uuid(as_uuid=True)),
    ("discount_decided_by_id", sa.Uuid(as_uuid=True)),
    ("discount_decided_at", sa.DateTime(timezone=True)),
)
FOREIGN_KEYS = (
    ("fk_invoices_discount_requested_by_id_users", "discount_requested_by_id"),
    ("fk_invoices_discount_decided_by_id_users", "discount_decided_by_id"),
)


def _columns(bind):
    return {column["name"] for column in sa.inspect(bind).get_columns("invoices")}


def _user_fk_columns(bind):
    return {
        tuple(fk["constrained_columns"]): fk.get("name")
        for fk in sa.inspect(bind).get_foreign_keys("invoices")
        if fk.get("referred_table") == "users"
    }


def upgrade():
    bind = op.get_bind()
    existing = _columns(bind)
    with op.batch_alter_table("invoices") as batch:
        for name, column_type in COLUMNS:
            if name not in existing:
                batch.add_column(sa.Column(name, column_type, nullable=True))
    fks = _user_fk_columns(bind)
    with op.batch_alter_table("invoices") as batch:
        for fk_name, column in FOREIGN_KEYS:
            if (column,) not in fks:
                batch.create_foreign_key(fk_name, "users", [column], ["id"])


def downgrade():
    bind = op.get_bind()
    existing = _columns(bind)
    fks = _user_fk_columns(bind)
    with op.batch_alter_table("invoices") as batch:
        for _, column in FOREIGN_KEYS:
            name = fks.get((column,))
            if name:
                batch.drop_constraint(name, type_="foreignkey")
        for name, _ in COLUMNS:
            if name in existing:
                batch.drop_column(name)
