from marshmallow import EXCLUDE, Schema, fields, validate

from app.common.enums import (
    AppointmentStatus,
    AvailabilityExceptionKind,
    Urgency,
)


class DepartmentSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = fields.String(required=True)
    code = fields.String(required=True)
    description = fields.String(required=False, allow_none=True)
    is_active = fields.Boolean(load_default=True)


class DepartmentUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = fields.String(required=False)
    description = fields.String(required=False, allow_none=True)
    is_active = fields.Boolean(required=False)


class ServiceSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    department_id = fields.UUID(required=True)
    name = fields.String(required=True)
    code = fields.String(required=True)
    description = fields.String(required=False, allow_none=True)
    is_active = fields.Boolean(load_default=True)
    amount_minor = fields.Integer(required=True, validate=validate.Range(min=0))


class ServiceUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = fields.String(required=False)
    description = fields.String(required=False, allow_none=True)
    is_active = fields.Boolean(required=False)


class ServicePriceSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    amount_minor = fields.Integer(required=True, validate=validate.Range(min=0))
    effective_from = fields.DateTime(required=False, allow_none=True)


class DoctorUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    department_id = fields.UUID(required=False)
    specialty = fields.String(required=False, allow_none=True)
    consultation_fee_minor = fields.Integer(required=False, validate=validate.Range(min=0))
    bio = fields.String(required=False, allow_none=True)
    is_accepting_appointments = fields.Boolean(required=False)


class AvailabilityRuleSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    weekday = fields.Integer(required=True, validate=validate.Range(min=0, max=6))
    start_time = fields.Time(required=True)
    end_time = fields.Time(required=True)
    slot_minutes = fields.Integer(load_default=30, validate=validate.Range(min=5, max=240))
    timezone = fields.String(load_default="Africa/Nairobi")
    effective_from = fields.Date(required=False, allow_none=True)
    effective_to = fields.Date(required=False, allow_none=True)


class AvailabilityExceptionSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    start_at = fields.DateTime(required=True)
    end_at = fields.DateTime(required=True)
    kind = fields.Enum(
        AvailabilityExceptionKind, by_value=True, load_default=AvailabilityExceptionKind.BLOCKED
    )
    reason = fields.String(required=False, allow_none=True)


class AppointmentCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    patient_id = fields.UUID(required=False, allow_none=True)
    doctor_id = fields.UUID(required=True)
    service_id = fields.UUID(required=False, allow_none=True)
    scheduled_start = fields.DateTime(required=True)
    urgency = fields.Enum(Urgency, by_value=True, load_default=Urgency.ROUTINE)
    notes = fields.String(required=False, allow_none=True)


class WalkInSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    patient_id = fields.UUID(required=True)
    doctor_id = fields.UUID(required=True)
    service_id = fields.UUID(required=False, allow_none=True)
    urgency = fields.Enum(Urgency, by_value=True, load_default=Urgency.ROUTINE)
    notes = fields.String(required=False, allow_none=True)


class AppointmentAdminUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    status = fields.Enum(AppointmentStatus, by_value=True, required=False)
    urgency = fields.Enum(Urgency, by_value=True, required=False)
    notes = fields.String(required=False, allow_none=True)


class CancelSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    reason = fields.String(required=False, allow_none=True, load_default="Cancelled")


class RescheduleSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    scheduled_start = fields.DateTime(required=True)
    reason = fields.String(required=False, allow_none=True)
