from uuid import uuid4

from app.common.base import BaseModel, CreatedAtMixin
from app.common.enums import AIFeature, AIStatus
from app.extensions import db


class AIInteraction(BaseModel, CreatedAtMixin):
    __tablename__ = "ai_interactions"

    feature = db.Column(
        db.Enum(AIFeature, native_enum=False, length=32), nullable=False, index=True
    )
    actor_user_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True, index=True
    )
    patient_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("patient_profiles.id"), nullable=True
    )
    related_entity_type = db.Column(db.String(64), nullable=True)
    related_entity_id = db.Column(db.Uuid(as_uuid=True), nullable=True)
    input_summary = db.Column(db.Text, nullable=False)
    output = db.Column(db.JSON, nullable=False, default=dict)
    provider = db.Column(db.String(64), nullable=False, default="deterministic")
    model = db.Column(db.String(120), nullable=True)
    status = db.Column(
        db.Enum(AIStatus, native_enum=False, length=16),
        nullable=False,
        default=AIStatus.COMPLETED,
    )
    approved = db.Column(db.Boolean, nullable=False, default=False)
    approved_by_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True)
    approved_at = db.Column(db.DateTime(timezone=True), nullable=True)

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)
