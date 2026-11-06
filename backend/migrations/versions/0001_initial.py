"""Initial MediFlow schema.

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-06
"""

from alembic import op

import app.models  # noqa: F401  (registers all tables on db.metadata)
from app.extensions import db

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # The initial database is empty, so creating the declared metadata keeps the
    # first migration exactly aligned with the SQLAlchemy models. Subsequent
    # schema changes must use explicit, reviewable Alembic operations.
    db.metadata.create_all(bind=op.get_bind())


def downgrade():
    db.metadata.drop_all(bind=op.get_bind())
