from marshmallow import EXCLUDE, Schema, fields, validate

from app.common.enums import ConsentChannel, Sex


class PatientCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    first_name = fields.String(required=True, validate=validate.Length(min=1, max=120))
    middle_name = fields.String(required=False, allow_none=True)
    last_name = fields.String(required=True, validate=validate.Length(min=1, max=120))
    date_of_birth = fields.Date(required=True)
    sex = fields.Enum(Sex, by_value=True, load_default=Sex.UNKNOWN)
    national_id = fields.String(required=False, allow_none=True)
    birth_certificate_number = fields.String(required=False, allow_none=True)
    phone = fields.String(required=True, validate=validate.Length(min=7, max=32))
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
