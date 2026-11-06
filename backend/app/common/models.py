import uuid

from sqlalchemy import UniqueConstraint

from app.common.base import BaseModel, TimestampMixin, utcnow
from app.common.enums import IdempotencyStatus, OutboxStatus
from app.extensions import db


class NumberSequence(BaseModel):
    __tablename__ = "number_sequences"

    key = db.Column(db.String(64), nullable=False, unique=True, index=True)
    prefix = db.Column(db.String(24), nullable=False, default="")
    current_value = db.Column(db.BigInteger, nullable=False, default=0)
    updated_at = db.Column(
        db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )


class IdempotencyKey(BaseModel, TimestampMixin):
    __tablename__ = "idempotency_keys"
    __table_args__ = (UniqueConstraint("scope", "key", name="uq_idempotency_scope_key"),)

    scope = db.Column(db.String(80), nullable=False)
    key = db.Column(db.String(128), nullable=False)
    request_hash = db.Column(db.String(64), nullable=False)
    status = db.Column(
        db.Enum(IdempotencyStatus, native_enum=False, length=32),
        nullable=False,
        default=IdempotencyStatus.IN_PROGRESS,
    )
    response_code = db.Column(db.Integer, nullable=True)
    response_body = db.Column(db.JSON, nullable=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=True)


class OutboxEvent(BaseModel, TimestampMixin):
    __tablename__ = "outbox_events"

    event_type = db.Column(db.String(80), nullable=False, index=True)
    aggregate_type = db.Column(db.String(80), nullable=False)
    aggregate_id = db.Column(db.Uuid(as_uuid=True), nullable=False, index=True)
    payload = db.Column(db.JSON, nullable=False, default=dict)
    status = db.Column(
        db.Enum(OutboxStatus, native_enum=False, length=24),
        nullable=False,
        default=OutboxStatus.PENDING,
        index=True,
    )
    attempts = db.Column(db.Integer, nullable=False, default=0)
    available_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    processed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_error = db.Column(db.Text, nullable=True)

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid.uuid4())
        super().__init__(**kwargs)
