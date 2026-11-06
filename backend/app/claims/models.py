from uuid import uuid4

from app.common.base import BaseModel, CreatedAtMixin, TimestampMixin, utcnow
from app.common.crypto import EncryptedText
from app.common.enums import ClaimStatus, EligibilityStatus
from app.extensions import db


class EligibilityCheck(BaseModel, CreatedAtMixin):
    __tablename__ = "eligibility_checks"

    patient_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("patient_profiles.id"),
        nullable=False,
        index=True,
    )
    invoice_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("invoices.id"), nullable=True, index=True
    )
    sha_member_reference = db.Column(EncryptedText, nullable=False)
    status = db.Column(
        db.Enum(EligibilityStatus, native_enum=False, length=24),
        nullable=False,
        default=EligibilityStatus.UNKNOWN,
    )
    coverage_limit_minor = db.Column(db.BigInteger, nullable=True)
    consumed_minor = db.Column(db.BigInteger, nullable=True)
    provider = db.Column(db.String(64), nullable=False, default="simulated")
    provider_reference = db.Column(db.String(160), nullable=True)
    raw_response = db.Column(db.JSON, nullable=False, default=dict)
    checked_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    checked_by_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True)

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class Claim(BaseModel, TimestampMixin):
    __tablename__ = "claims"
    __table_args__ = (
        db.Index("ix_claims_status_submitted", "status", "submitted_at"),
        db.Index("ix_claims_invoice", "invoice_id"),
    )

    invoice_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("invoices.id"), nullable=False, index=True
    )
    allocation_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("invoice_allocations.id"),
        nullable=True,
    )
    patient_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("patient_profiles.id"),
        nullable=False,
        index=True,
    )
    eligibility_check_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("eligibility_checks.id"),
        nullable=True,
    )
    sha_member_reference = db.Column(EncryptedText, nullable=False)
    claimed_amount_minor = db.Column(db.BigInteger, nullable=False)
    approved_amount_minor = db.Column(db.BigInteger, nullable=True)
    currency = db.Column(db.String(3), nullable=False, default="KES")
    status = db.Column(
        db.Enum(ClaimStatus, native_enum=False, length=24),
        nullable=False,
        default=ClaimStatus.DRAFT,
        index=True,
    )
    external_reference = db.Column(db.String(160), nullable=True, index=True)
    submitted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    decided_at = db.Column(db.DateTime(timezone=True), nullable=True)
    paid_at = db.Column(db.DateTime(timezone=True), nullable=True)
    rejection_reason = db.Column(db.Text, nullable=True)
    resubmission_of_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("claims.id"), nullable=True)
    created_by_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True)

    history = db.relationship(
        "ClaimStatusHistory",
        back_populates="claim",
        order_by="ClaimStatusHistory.created_at",
        lazy="selectin",
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class ClaimStatusHistory(BaseModel, CreatedAtMixin):
    __tablename__ = "claim_status_history"

    claim_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("claims.id"), nullable=False, index=True
    )
    from_status = db.Column(db.Enum(ClaimStatus, native_enum=False, length=24), nullable=True)
    to_status = db.Column(db.Enum(ClaimStatus, native_enum=False, length=24), nullable=False)
    actor_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True)
    note = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    claim = db.relationship("Claim", back_populates="history")

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)
