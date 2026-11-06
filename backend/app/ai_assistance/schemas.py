from marshmallow import EXCLUDE, Schema, fields, validate


class TriageSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    symptoms = fields.String(required=True, validate=validate.Length(min=3, max=4000))
    patient_id = fields.UUID(required=False, allow_none=True)


class SummaryDraftSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    notes = fields.String(required=False, allow_none=True)


class SummaryApprovalSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    ai_interaction_id = fields.UUID(required=True)
    summary = fields.String(required=True, validate=validate.Length(min=1, max=8000))


class ReportQuerySchema(Schema):
    class Meta:
        unknown = EXCLUDE

    query = fields.String(required=True, validate=validate.Length(min=2, max=1000))
