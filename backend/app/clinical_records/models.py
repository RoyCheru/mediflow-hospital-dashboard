from uuid import uuid4

from app.common.base import BaseModel, CreatedAtMixin, TimestampMixin, utcnow
from app.common.crypto import EncryptedText
from app.common.enums import AttachmentType, PrescriptionStatus
from app.extensions import db


class Visit(BaseModel, TimestampMixin):
    __tablename__ = "visits"
    __table_args__ = (
        db.Index("ix_visits_patient_date", "patient_id", "created_at"),
        db.Index("ix_visits_doctor_date", "doctor_id", "created_at"),
    )

    appointment_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("appointments.id"),
        nullable=True,
        unique=True,
        index=True,
    )
    patient_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("patient_profiles.id"),
        nullable=False,
        index=True,
    )
    doctor_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("doctor_profiles.id"),
        nullable=False,
        index=True,
    )
    department_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("departments.id"), nullable=True)
    presenting_complaint = db.Column(EncryptedText, nullable=True)
    vitals = db.Column(db.JSON, nullable=False, default=dict)
    notes = db.Column(EncryptedText, nullable=True)
    diagnosis = db.Column(EncryptedText, nullable=True)
    plan = db.Column(EncryptedText, nullable=True)
    ai_summary = db.Column(EncryptedText, nullable=True)
    ai_summary_approved = db.Column(db.Boolean, nullable=False, default=False)
    ai_summary_approved_by_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True
    )
    ai_summary_approved_at = db.Column(db.DateTime(timezone=True), nullable=True)
    follow_up_date = db.Column(db.Date, nullable=True)
    started_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)

    patient = db.relationship("PatientProfile", lazy="joined")
    doctor = db.relationship("DoctorProfile", lazy="joined")
    department = db.relationship("Department", lazy="joined")
    prescriptions = db.relationship("Prescription", back_populates="visit", lazy="dynamic")
    attachments = db.relationship("Attachment", back_populates="visit", lazy="dynamic")

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class Prescription(BaseModel, TimestampMixin):
    __tablename__ = "prescriptions"

    visit_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("visits.id"), nullable=False, index=True
    )
    doctor_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("doctor_profiles.id"),
        nullable=False,
        index=True,
    )
    status = db.Column(
        db.Enum(PrescriptionStatus, native_enum=False, length=16),
        nullable=False,
        default=PrescriptionStatus.ISSUED,
    )
    notes = db.Column(db.Text, nullable=True)
    issued_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    visit = db.relationship("Visit", back_populates="prescriptions")
    items = db.relationship(
        "PrescriptionItem",
        back_populates="prescription",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class PrescriptionItem(BaseModel, CreatedAtMixin):
    __tablename__ = "prescription_items"

    prescription_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("prescriptions.id"),
        nullable=False,
        index=True,
    )
    drug_name = db.Column(db.String(200), nullable=False)
    dose = db.Column(db.String(80), nullable=False)
    frequency = db.Column(db.String(80), nullable=False)
    duration = db.Column(db.String(80), nullable=False)
    route = db.Column(db.String(80), nullable=True)
    instructions = db.Column(db.Text, nullable=True)
    quantity = db.Column(db.Integer, nullable=True)

    prescription = db.relationship("Prescription", back_populates="items")

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class Attachment(BaseModel, CreatedAtMixin):
    __tablename__ = "attachments"

    visit_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("visits.id"), nullable=False, index=True
    )
    patient_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("patient_profiles.id"),
        nullable=False,
        index=True,
    )
    attachment_type = db.Column(
        db.Enum(AttachmentType, native_enum=False, length=24),
        nullable=False,
        default=AttachmentType.OTHER,
    )
    storage_key = db.Column(db.String(512), nullable=False, unique=True)
    file_name = db.Column(db.String(255), nullable=False)
    content_type = db.Column(db.String(120), nullable=False)
    byte_size = db.Column(db.BigInteger, nullable=False)
    checksum_sha256 = db.Column(db.String(64), nullable=False)
    scan_state = db.Column(db.String(32), nullable=False, default="PENDING")
    uploaded_by_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True)

    visit = db.relationship("Visit", back_populates="attachments")

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class ReferralLetter(BaseModel, CreatedAtMixin):
    __tablename__ = "referral_letters"

    visit_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("visits.id"), nullable=False, index=True
    )
    destination = db.Column(db.String(200), nullable=False)
    reason = db.Column(db.Text, nullable=False)
    content = db.Column(EncryptedText, nullable=False)
    storage_key = db.Column(db.String(512), nullable=True)
    generated_by_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True)

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)
