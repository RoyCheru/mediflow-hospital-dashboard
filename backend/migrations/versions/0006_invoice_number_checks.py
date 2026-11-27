"""Invoice number check constraints (BIL-17).

A finalized (or later) invoice must carry its official number; a draft must not.
Voided invoices are exempt (a voided draft of a cancelled appointment has none).

Revision ID: 0006_invoice_number_checks
Revises: 0005_encounter_billing
"""

import sqlalchemy as sa
from alembic import op

revision = "0006_invoice_number_checks"
down_revision = "0005_encounter_billing"
branch_labels = None
depends_on = None

CHECKS = {
    "ck_invoices_number_when_final": (
        "status IN ('DRAFT', 'VOIDED') OR invoice_number IS NOT NULL"
    ),
    "ck_invoices_draft_has_no_number": "status <> 'DRAFT' OR invoice_number IS NULL",
}


def _existing(bind):
    return {item["name"] for item in sa.inspect(bind).get_check_constraints("invoices")}


def upgrade():
    bind = op.get_bind()
    # Existing rows are reported, never rewritten: stop with a clear message.
    violations = bind.execute(
        sa.text(
            "SELECT count(*) FROM invoices WHERE NOT ("
            + " AND ".join(f"({rule})" for rule in CHECKS.values())
            + ")"
        )
    ).scalar()
    if violations:
        raise RuntimeError(
            f"{violations} invoice(s) break the invoice-number rules; run "
            "`flask invoice-violations` and resolve them before upgrading"
        )
    existing = _existing(bind)
    with op.batch_alter_table("invoices") as batch:
        for name, rule in CHECKS.items():
            if name not in existing:
                batch.create_check_constraint(name, rule)


def downgrade():
    existing = _existing(op.get_bind())
    with op.batch_alter_table("invoices") as batch:
        for name in CHECKS:
            if name in existing:
                batch.drop_constraint(name, type_="check")
