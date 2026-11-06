from marshmallow import EXCLUDE, Schema, fields, validate

from app.common.enums import ClaimStatus


class EligibilityCheckSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    member_reference = fields.String(required=False, allow_none=True)


class ClaimCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    eligibility_check_id = fields.UUID(required=False, allow_none=True)
    amount_minor = fields.Integer(required=False, allow_none=True, validate=validate.Range(min=1))
    member_reference = fields.String(required=False, allow_none=True)


class ClaimStatusSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    status = fields.Enum(ClaimStatus, by_value=True, required=True)
    note = fields.String(required=False, allow_none=True)
    approved_amount_minor = fields.Integer(
        required=False, allow_none=True, validate=validate.Range(min=0)
    )
    rejection_reason = fields.String(required=False, allow_none=True)
    external_reference = fields.String(required=False, allow_none=True)


class ClaimResubmissionSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    amount_minor = fields.Integer(required=False, allow_none=True, validate=validate.Range(min=1))
    note = fields.String(required=False, allow_none=True)
