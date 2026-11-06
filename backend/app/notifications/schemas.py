from marshmallow import EXCLUDE, Schema, fields


class TemplateUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = fields.String(required=False)
    subject = fields.String(required=False, allow_none=True)
    body = fields.String(required=False)
    whatsapp_template_name = fields.String(required=False, allow_none=True)
    is_active = fields.Boolean(required=False)
