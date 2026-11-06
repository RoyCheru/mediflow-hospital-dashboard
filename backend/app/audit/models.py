from uuid import uuid4

from sqlalchemy import event

from app.common.base import BaseModel, utcnow
from app.extensions import db


class AuditLog(BaseModel):
    __tablename__ = "audit_logs"
    __table_args__ = (
        db.Index("ix_audit_actor_date", "actor_user_id", "created_at"),
        db.Index("ix_audit_entity", "entity_type", "entity_id"),
        db.Index("ix_audit_action_date", "action", "created_at"),
    )

    actor_user_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True, index=True
    )
    actor_role = db.Column(db.String(32), nullable=True)
    action = db.Column(db.String(80), nullable=False, index=True)
    entity_type = db.Column(db.String(80), nullable=False, index=True)
    entity_id = db.Column(db.Uuid(as_uuid=True), nullable=True, index=True)
    before = db.Column(db.JSON, nullable=True)
    after = db.Column(db.JSON, nullable=True)
    request_id = db.Column(db.String(80), nullable=True)
    ip_address = db.Column(db.String(64), nullable=True)
    user_agent = db.Column(db.String(512), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, index=True)

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


@event.listens_for(AuditLog, "before_update")
def _prevent_audit_update(mapper, connection, target):
    raise ValueError("Audit records are append-only and cannot be updated")


@event.listens_for(AuditLog, "before_delete")
def _prevent_audit_delete(mapper, connection, target):
    raise ValueError("Audit records are append-only and cannot be deleted")
