import re
from datetime import date

from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate

from app.common.enums import ConsentChannel, Sex

_PHONE_CHARS = re.compile(r"^\+?[0-9][0-9 ()-]*$")


def validate_phone(value):
    """Digits with optional leading +, spaces, dashes or brackets; 7-15 digits."""
    digits = re.sub(r"\D", "", value or "")
    if not _PHONE_CHARS.match((value or "").strip()) or not 7 <= len(digits) <= 15:
        raise ValidationError("Enter a valid phone number (7 to 15 digits).")


def validate_date_of_birth(value):
    today = date.today()
    if value > today:
        raise ValidationError("Date of birth cannot be in the future.")
    if value.year < today.year - 130:
        raise ValidationError("Date of birth is too far in the past.")


def validate_name(value):
    if not (value or "").strip():
        raise ValidationError("Cannot be blank.")


class PatientCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    first_name = fields.String(
        required=True, validate=[validate.Length(min=1, max=120), validate_name]
    )
    middle_name = fields.String(required=False, allow_none=True)
    last_name = fields.String(
        required=True, validate=[validate.Length(min=1, max=120), validate_name]
    )
    date_of_birth = fields.Date(required=True, validate=validate_date_of_birth)
    sex = fields.Enum(Sex, by_value=True, load_default=Sex.UNKNOWN)
    national_id = fields.String(required=False, allow_none=True)
    birth_certificate_number = fields.String(required=False, allow_none=True)
    phone = fields.String(required=True, validate=[validate.Length(min=7, max=32), validate_phone])
    email = fields.Email(required=False, allow_none=True)
    address = fields.String(required=False, allow_none=True)
    next_of_kin_name = fields.String(required=False, allow_none=True)
    next_of_kin_phone = fields.String(required=False, allow_none=True)
    next_of_kin_relationship = fields.String(required=False, allow_none=True)
    sha_number = fields.String(required=False, allow_none=True)
    insurance_provider = fields.String(required=False, allow_none=True)
    insurance_member_number = fields.String(required=False, allow_none=True)
    allergies = fields.String(required=False, allow_none=True)
    chronic_conditions = fields.String(required=False, allow_none=True)
    current_medications = fields.String(required=False, allow_none=True)
    blood_group = fields.String(required=False, allow_none=True)
    is_active = fields.Boolean(load_default=True)
    whatsapp_consent = fields.Boolean(load_default=False)
    email_consent = fields.Boolean(load_default=False)


class PatientUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    first_name = fields.String(required=False)
    middle_name = fields.String(required=False, allow_none=True)
    last_name = fields.String(required=False)
    date_of_birth = fields.Date(required=False)
    sex = fields.Enum(Sex, by_value=True, required=False)
    national_id = fields.String(required=False, allow_none=True)
    birth_certificate_number = fields.String(required=False, allow_none=True)
    phone = fields.String(required=False)
    email = fields.Email(required=False, allow_none=True)
    address = fields.String(required=False, allow_none=True)
    next_of_kin_name = fields.String(required=False, allow_none=True)
    next_of_kin_phone = fields.String(required=False, allow_none=True)
    next_of_kin_relationship = fields.String(required=False, allow_none=True)
    sha_number = fields.String(required=False, allow_none=True)
    insurance_provider = fields.String(required=False, allow_none=True)
    insurance_member_number = fields.String(required=False, allow_none=True)
    allergies = fields.String(required=False, allow_none=True)
    chronic_conditions = fields.String(required=False, allow_none=True)
    current_medications = fields.String(required=False, allow_none=True)
    blood_group = fields.String(required=False, allow_none=True)
    is_active = fields.Boolean(required=False)


class ConsentSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    channel = fields.Enum(ConsentChannel, by_value=True, required=True)
    granted = fields.Boolean(required=True)
    purpose = fields.String(load_default="TRANSACTIONAL")
