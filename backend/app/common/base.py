from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Uuid

from app.extensions import db


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class TimestampMixin:
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(
        db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )


class CreatedAtMixin:
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)


class BaseModel(db.Model):
    __abstract__ = True

    id = db.Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)


def enum_column(enum_class, **kwargs):
    return db.Column(db.Enum(enum_class, native_enum=False, length=48), nullable=False, **kwargs)


def uuid_str(value):
    return str(value) if value is not None else None
