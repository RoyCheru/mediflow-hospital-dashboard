from marshmallow import EXCLUDE, Schema, fields, validate


class VisitCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    presenting_complaint = fields.String(required=False, allow_none=True)
    vitals = fields.Dict(required=False, load_default=dict)
    notes = fields.String(required=False, allow_none=True)
    diagnosis = fields.String(required=False, allow_none=True)
    plan = fields.String(required=False, allow_none=True)
    follow_up_date = fields.Date(required=False, allow_none=True)


class VisitUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    presenting_complaint = fields.String(required=False, allow_none=True)
    vitals = fields.Dict(required=False, allow_none=True)
    notes = fields.String(required=False, allow_none=True)
    diagnosis = fields.String(required=False, allow_none=True)
    plan = fields.String(required=False, allow_none=True)
    follow_up_date = fields.Date(required=False, allow_none=True)
    ai_summary = fields.String(required=False, allow_none=True)


class PrescriptionItemSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    drug_name = fields.String(required=True)
    dose = fields.String(required=True)
    frequency = fields.String(required=True)
    duration = fields.String(required=True)
    route = fields.String(required=False, allow_none=True)
    instructions = fields.String(required=False, allow_none=True)
    quantity = fields.Integer(required=False, allow_none=True, validate=validate.Range(min=1))


class PrescriptionCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    notes = fields.String(required=False, allow_none=True)
    items = fields.List(
        fields.Nested(PrescriptionItemSchema), required=True, validate=validate.Length(min=1)
    )


class ReferralSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    destination = fields.String(required=True)
    reason = fields.String(required=True)


class FollowUpSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    doctor_id = fields.UUID(required=True)
    service_id = fields.UUID(required=False, allow_none=True)
    scheduled_start = fields.DateTime(required=True)
    notes = fields.String(required=False, allow_none=True)
    slot_minutes = fields.Integer(
        required=False, load_default=30, validate=validate.Range(min=5, max=240)
    )
