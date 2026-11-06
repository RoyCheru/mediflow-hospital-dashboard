from marshmallow import EXCLUDE, Schema, fields, validate

from app.common.enums import AllocationPayer, PaymentMethod


class InvoiceLineSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    service_id = fields.UUID(required=False, allow_none=True)
    description = fields.String(required=False, allow_none=True)
    quantity = fields.Integer(load_default=1, validate=validate.Range(min=1))
    unit_price_minor = fields.Integer(
        required=False, allow_none=True, validate=validate.Range(min=0)
    )


class InvoiceCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    discount_minor = fields.Integer(load_default=0, validate=validate.Range(min=0))
    items = fields.List(fields.Nested(InvoiceLineSchema), load_default=list)
    due_at = fields.DateTime(required=False, allow_none=True)


class AllocationSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    payer = fields.Enum(AllocationPayer, by_value=True, required=True)
    amount_minor = fields.Integer(required=True, validate=validate.Range(min=1))
    external_reference = fields.String(required=False, allow_none=True)


class PaymentIntentSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    amount_minor = fields.Integer(required=True, validate=validate.Range(min=1))
    phone = fields.String(required=True)
    account_reference = fields.String(required=False, allow_none=True)


class CashPaymentSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    method = fields.Enum(PaymentMethod, by_value=True, load_default=PaymentMethod.CASH)
    amount_minor = fields.Integer(required=True, validate=validate.Range(min=1))
    tendered_minor = fields.Integer(required=False, allow_none=True, validate=validate.Range(min=0))
    reference = fields.String(required=False, allow_none=True)
    notes = fields.String(required=False, allow_none=True)


class VoidRequestSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    invoice_id = fields.UUID(required=False, allow_none=True)
    transaction_id = fields.UUID(required=False, allow_none=True)
    reason = fields.String(required=True)


class DecisionSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    approve = fields.Boolean(required=True)
    reason = fields.String(required=False, allow_none=True)


class RefundRequestSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    transaction_id = fields.UUID(required=True)
    amount_minor = fields.Integer(required=True, validate=validate.Range(min=1))
    reason = fields.String(required=True)


class ReconciliationResolveSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    resolution = fields.String(required=True, validate=validate.OneOf(["SUCCESS", "FAILED"]))
    notes = fields.String(required=False, allow_none=True)


class CashReconciliationSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    business_date = fields.Date(required=True)
    counted_cash_minor = fields.Integer(required=True, validate=validate.Range(min=0))
    notes = fields.String(required=False, allow_none=True)
