from uuid import uuid4

from app.common.base import BaseModel, CreatedAtMixin, TimestampMixin, utcnow
from app.common.crypto import EncryptedText
from app.common.enums import ConsentChannel, Sex
from app.extensions import db


class PatientProfile(BaseModel, TimestampMixin):
    __tablename__ = "patient_profiles"
    __table_args__ = (
        db.Index("ix_patients_name", "last_name", "first_name"),
        db.Index("ix_patients_phone", "phone"),
    )

    user_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("users.id"),
        nullable=True,
        unique=True,
        index=True,
    )
    patient_number = db.Column(db.String(32), nullable=False, unique=True, index=True)
    first_name = db.Column(db.String(120), nullable=False)
    middle_name = db.Column(db.String(120), nullable=True)
    last_name = db.Column(db.String(120), nullable=False)
    date_of_birth = db.Column(db.Date, nullable=False)
    sex = db.Column(
        db.Enum(Sex, native_enum=False, length=16),
        nullable=False,
        default=Sex.UNKNOWN,
    )
    national_id = db.Column(EncryptedText, nullable=True)
    birth_certificate_number = db.Column(EncryptedText, nullable=True)
    phone = db.Column(db.String(32), nullable=False, index=True)
    email = db.Column(db.String(255), nullable=True, index=True)
    address = db.Column(db.Text, nullable=True)
    next_of_kin_name = db.Column(db.String(160), nullable=True)
    next_of_kin_phone = db.Column(db.String(32), nullable=True)
    next_of_kin_relationship = db.Column(db.String(64), nullable=True)
    sha_number = db.Column(EncryptedText, nullable=True)
    insurance_provider = db.Column(db.String(160), nullable=True)
    insurance_member_number = db.Column(EncryptedText, nullable=True)
    allergies = db.Column(EncryptedText, nullable=True)
    chronic_conditions = db.Column(EncryptedText, nullable=True)
    current_medications = db.Column(EncryptedText, nullable=True)
    blood_group = db.Column(db.String(8), nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    consents = db.relationship(
        "ConsentRecord",
        back_populates="patient",
        order_by="ConsentRecord.created_at",
        lazy="dynamic",
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class ConsentRecord(BaseModel, CreatedAtMixin):
    __tablename__ = "consent_records"
    __table_args__ = (
        db.Index("ix_consent_patient_channel", "patient_id", "channel", "created_at"),
    )

    patient_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("patient_profiles.id"),
        nullable=False,
        index=True,
    )
    channel = db.Column(
        db.Enum(ConsentChannel, native_enum=False, length=16),
        nullable=False,
    )
    purpose = db.Column(db.String(120), nullable=False, default="TRANSACTIONAL")
    granted = db.Column(db.Boolean, nullable=False)
    capture_source = db.Column(db.String(64), nullable=False, default="API")
    captured_by_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    patient = db.relationship("PatientProfile", back_populates="consents")

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)

    @classmethod
    def latest_for(cls, patient_id, channel):
        return (
            cls.query.filter_by(patient_id=patient_id, channel=channel)
            .order_by(cls.created_at.desc())
            .first()
        )
