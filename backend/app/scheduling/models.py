from uuid import uuid4

from app.common.base import BaseModel, TimestampMixin, utcnow
from app.common.enums import (
    AppointmentSource,
    AppointmentStatus,
    AvailabilityExceptionKind,
    Urgency,
)
from app.extensions import db


class Department(BaseModel, TimestampMixin):
    __tablename__ = "departments"

    name = db.Column(db.String(160), nullable=False, unique=True)
    code = db.Column(db.String(32), nullable=False, unique=True)
    description = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    services = db.relationship("Service", back_populates="department", lazy="dynamic")

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class Service(BaseModel, TimestampMixin):
    __tablename__ = "services"
    __table_args__ = (db.UniqueConstraint("department_id", "code", name="uq_service_dept_code"),)

    department_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("departments.id"),
        nullable=False,
        index=True,
    )
    name = db.Column(db.String(160), nullable=False)
    code = db.Column(db.String(32), nullable=False)
    description = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    department = db.relationship("Department", back_populates="services")
    prices = db.relationship(
        "ServicePrice",
        back_populates="service",
        order_by="ServicePrice.effective_from.desc()",
        lazy="dynamic",
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class ServicePrice(BaseModel, TimestampMixin):
    __tablename__ = "service_prices"
    __table_args__ = (db.Index("ix_service_prices_effective", "service_id", "effective_from"),)

    service_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("services.id"),
        nullable=False,
        index=True,
    )
    amount_minor = db.Column(db.BigInteger, nullable=False)
    currency = db.Column(db.String(3), nullable=False, default="KES")
    effective_from = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    effective_to = db.Column(db.DateTime(timezone=True), nullable=True)

    service = db.relationship("Service", back_populates="prices")

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class DoctorProfile(BaseModel, TimestampMixin):
    __tablename__ = "doctor_profiles"

    user_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("users.id"),
        nullable=False,
        unique=True,
        index=True,
    )
    department_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("departments.id"),
        nullable=False,
        index=True,
    )
    specialty = db.Column(db.String(160), nullable=True)
    license_number = db.Column(db.String(80), nullable=False, unique=True)
    consultation_fee_minor = db.Column(db.BigInteger, nullable=False, default=0)
    bio = db.Column(db.Text, nullable=True)
    is_accepting_appointments = db.Column(db.Boolean, nullable=False, default=True)

    department = db.relationship("Department")
    availability_rules = db.relationship(
        "AvailabilityRule", back_populates="doctor", lazy="dynamic"
    )
    exceptions = db.relationship("AvailabilityException", back_populates="doctor", lazy="dynamic")

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class AvailabilityRule(BaseModel, TimestampMixin):
    __tablename__ = "availability_rules"

    doctor_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("doctor_profiles.id"),
        nullable=False,
        index=True,
    )
    weekday = db.Column(db.Integer, nullable=False)  # 0 = Monday, 6 = Sunday
    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=False)
    slot_minutes = db.Column(db.Integer, nullable=False, default=30)
    timezone = db.Column(db.String(64), nullable=False, default="Africa/Nairobi")
    effective_from = db.Column(db.Date, nullable=True)
    effective_to = db.Column(db.Date, nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    doctor = db.relationship("DoctorProfile", back_populates="availability_rules")

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class AvailabilityException(BaseModel, TimestampMixin):
    __tablename__ = "availability_exceptions"

    doctor_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("doctor_profiles.id"),
        nullable=False,
        index=True,
    )
    start_at = db.Column(db.DateTime(timezone=True), nullable=False)
    end_at = db.Column(db.DateTime(timezone=True), nullable=False)
    kind = db.Column(
        db.Enum(AvailabilityExceptionKind, native_enum=False, length=16),
        nullable=False,
        default=AvailabilityExceptionKind.BLOCKED,
    )
    reason = db.Column(db.Text, nullable=True)

    doctor = db.relationship("DoctorProfile", back_populates="exceptions")

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class Appointment(BaseModel, TimestampMixin):
    __tablename__ = "appointments"
    __table_args__ = (
        db.Index("ix_appointments_doctor_slot", "doctor_id", "scheduled_start"),
        db.Index("ix_appointments_patient_date", "patient_id", "scheduled_start"),
        db.Index("ix_appointments_queue", "doctor_id", "status", "scheduled_start"),
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
    service_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("services.id"), nullable=True)
    department_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("departments.id"), nullable=True)
    scheduled_start = db.Column(db.DateTime(timezone=True), nullable=False, index=True)
    scheduled_end = db.Column(db.DateTime(timezone=True), nullable=False)
    status = db.Column(
        db.Enum(AppointmentStatus, native_enum=False, length=32),
        nullable=False,
        default=AppointmentStatus.SCHEDULED,
        index=True,
    )
    source = db.Column(
        db.Enum(AppointmentSource, native_enum=False, length=16),
        nullable=False,
        default=AppointmentSource.RECEPTION,
    )
    urgency = db.Column(
        db.Enum(Urgency, native_enum=False, length=16),
        nullable=False,
        default=Urgency.ROUTINE,
    )
    no_show_score = db.Column(db.Numeric(5, 4), nullable=True)
    booked_by_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True)
    rescheduled_from_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("appointments.id"), nullable=True
    )
    checked_in_at = db.Column(db.DateTime(timezone=True), nullable=True)
    started_at = db.Column(db.DateTime(timezone=True), nullable=True)
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    cancelled_at = db.Column(db.DateTime(timezone=True), nullable=True)
    cancellation_reason = db.Column(db.Text, nullable=True)
    notes = db.Column(db.Text, nullable=True)

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)
