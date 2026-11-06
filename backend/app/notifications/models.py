from uuid import uuid4

from app.common.base import BaseModel, CreatedAtMixin, TimestampMixin, utcnow
from app.common.crypto import EncryptedText
from app.common.enums import (
    NotificationAttemptStatus,
    NotificationChannel,
    NotificationStatus,
)
from app.extensions import db


class NotificationTemplate(BaseModel, TimestampMixin):
    __tablename__ = "notification_templates"
    __table_args__ = (db.UniqueConstraint("key", "channel", name="uq_template_key_channel"),)

    key = db.Column(db.String(80), nullable=False, index=True)
    channel = db.Column(db.Enum(NotificationChannel, native_enum=False, length=16), nullable=False)
    name = db.Column(db.String(160), nullable=False)
    subject = db.Column(db.String(200), nullable=True)
    body = db.Column(db.Text, nullable=False)
    whatsapp_template_name = db.Column(db.String(120), nullable=True)
    version = db.Column(db.Integer, nullable=False, default=1)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class Notification(BaseModel, TimestampMixin):
    __tablename__ = "notifications"
    __table_args__ = (
        db.Index("ix_notifications_status_scheduled", "status", "scheduled_at"),
        db.Index("ix_notifications_patient", "patient_id", "created_at"),
    )

    recipient_user_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True, index=True
    )
    patient_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("patient_profiles.id"),
        nullable=True,
        index=True,
    )
    channel = db.Column(db.Enum(NotificationChannel, native_enum=False, length=16), nullable=False)
    template_key = db.Column(db.String(80), nullable=False)
    recipient_address = db.Column(EncryptedText, nullable=True)
    status = db.Column(
        db.Enum(NotificationStatus, native_enum=False, length=24),
        nullable=False,
        default=NotificationStatus.QUEUED,
        index=True,
    )
    payload = db.Column(db.JSON, nullable=False, default=dict)
    consent_granted = db.Column(db.Boolean, nullable=True)
    provider_reference = db.Column(db.String(160), nullable=True)
    attempts = db.Column(db.Integer, nullable=False, default=0)
    scheduled_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, index=True)
    sent_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_error = db.Column(db.Text, nullable=True)

    attempts_log = db.relationship(
        "NotificationAttempt",
        back_populates="notification",
        order_by="NotificationAttempt.attempted_at",
        lazy="selectin",
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class NotificationAttempt(BaseModel, CreatedAtMixin):
    __tablename__ = "notification_attempts"

    notification_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("notifications.id"),
        nullable=False,
        index=True,
    )
    attempt_number = db.Column(db.Integer, nullable=False)
    status = db.Column(
        db.Enum(NotificationAttemptStatus, native_enum=False, length=16),
        nullable=False,
    )
    provider_reference = db.Column(db.String(160), nullable=True)
    error_class = db.Column(db.String(80), nullable=True)
    error_message = db.Column(db.Text, nullable=True)
    attempted_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    notification = db.relationship("Notification", back_populates="attempts_log")

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)
