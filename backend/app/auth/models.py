from uuid import uuid4

from app.common.base import BaseModel, CreatedAtMixin, TimestampMixin, utcnow
from app.common.enums import Role, UserStatus, VerificationPurpose
from app.extensions import db


class User(BaseModel, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (db.Index("ix_users_role_status", "role", "status"),)

    email = db.Column(db.String(255), nullable=True, unique=True, index=True)
    phone = db.Column(db.String(32), nullable=True, unique=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.Enum(Role, native_enum=False, length=32), nullable=False, index=True)
    status = db.Column(
        db.Enum(UserStatus, native_enum=False, length=32),
        nullable=False,
        default=UserStatus.PENDING_VERIFICATION,
        index=True,
    )
    first_name = db.Column(db.String(120), nullable=True)
    last_name = db.Column(db.String(120), nullable=True)
    email_verified_at = db.Column(db.DateTime(timezone=True), nullable=True)
    phone_verified_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_login_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_activity_at = db.Column(db.DateTime(timezone=True), nullable=True)
    failed_login_attempts = db.Column(db.Integer, nullable=False, default=0)
    locked_until = db.Column(db.DateTime(timezone=True), nullable=True)
    must_change_password = db.Column(db.Boolean, nullable=False, default=False)

    refresh_tokens = db.relationship("RefreshTokenFamily", back_populates="user", lazy="dynamic")

    @property
    def full_name(self):
        parts = [self.first_name, self.last_name]
        return " ".join(part for part in parts if part)

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class RefreshTokenFamily(BaseModel, CreatedAtMixin):
    __tablename__ = "refresh_token_families"
    __table_args__ = (db.Index("ix_refresh_family_user", "user_id", "family_id"),)

    user_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True
    )
    family_id = db.Column(db.Uuid(as_uuid=True), nullable=False, index=True)
    token_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    revoked_at = db.Column(db.DateTime(timezone=True), nullable=True)
    replaced_by_hash = db.Column(db.String(64), nullable=True)
    last_used_at = db.Column(db.DateTime(timezone=True), nullable=True)
    ip_address = db.Column(db.String(64), nullable=True)
    user_agent = db.Column(db.String(512), nullable=True)

    user = db.relationship("User", back_populates="refresh_tokens")

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        kwargs.setdefault("family_id", uuid4())
        super().__init__(**kwargs)


class VerificationToken(BaseModel, CreatedAtMixin):
    __tablename__ = "verification_tokens"

    user_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True
    )
    purpose = db.Column(db.Enum(VerificationPurpose, native_enum=False, length=32), nullable=False)
    token_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    used_at = db.Column(db.DateTime(timezone=True), nullable=True)

    def is_valid(self):
        expires_at = self.expires_at
        if expires_at is not None and expires_at.tzinfo is None:
            from datetime import timezone

            expires_at = expires_at.replace(tzinfo=timezone.utc)
        return self.used_at is None and expires_at > utcnow()
