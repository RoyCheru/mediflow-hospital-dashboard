from marshmallow import EXCLUDE, Schema, fields, validate

from app.common.enums import Role, Sex, UserStatus


class LoginSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    email = fields.Email(required=False, allow_none=True)
    phone = fields.String(required=False, allow_none=True)
    password = fields.String(required=True)

    @property
    def identifier(self):
        return None


class RegisterPatientSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    email = fields.Email(required=False, allow_none=True)
    phone = fields.String(required=True, validate=validate.Length(min=7, max=32))
    password = fields.String(required=True)
    first_name = fields.String(required=True, validate=validate.Length(min=1, max=120))
    middle_name = fields.String(required=False, allow_none=True)
    last_name = fields.String(required=True, validate=validate.Length(min=1, max=120))
    date_of_birth = fields.Date(required=True)
    sex = fields.Enum(Sex, by_value=True, required=False, load_default=Sex.UNKNOWN)
    national_id = fields.String(required=False, allow_none=True)
    birth_certificate_number = fields.String(required=False, allow_none=True)
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
    whatsapp_consent = fields.Boolean(load_default=False)
    email_consent = fields.Boolean(load_default=False)


class StaffCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    email = fields.Email(required=False, allow_none=True)
    phone = fields.String(required=False, allow_none=True)
    password = fields.String(required=True)
    first_name = fields.String(required=True)
    last_name = fields.String(required=True)
    role = fields.Enum(Role, by_value=True, required=True)
    department_id = fields.UUID(required=False, allow_none=True)
    specialty = fields.String(required=False, allow_none=True)
    license_number = fields.String(required=False, allow_none=True)
    consultation_fee_minor = fields.Integer(required=False, load_default=0)


class UserUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    status = fields.Enum(UserStatus, by_value=True, required=False)
    role = fields.Enum(Role, by_value=True, required=False)
    first_name = fields.String(required=False)
    last_name = fields.String(required=False)


class RefreshSchema(Schema):
    refresh_token = fields.String(required=True)


class PasswordResetRequestSchema(Schema):
    email = fields.Email(required=True)


class PasswordResetConfirmSchema(Schema):
    token = fields.String(required=True)
    new_password = fields.String(required=True)


class VerifyTokenSchema(Schema):
    token = fields.String(required=True)


class LoginResponseSchema(Schema):
    access_token = fields.String()
    refresh_token = fields.String()
    token_type = fields.String()
    expires_in = fields.Integer()
    user = fields.Dict()
