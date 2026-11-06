from uuid import uuid4

from app.common.base import BaseModel, CreatedAtMixin, TimestampMixin, utcnow
from app.common.enums import (
    AllocationPayer,
    AllocationStatus,
    CashReconciliationStatus,
    InvoiceStatus,
    PaymentIntentStatus,
    PaymentMethod,
    RefundStatus,
    TransactionStatus,
    VoidRequestStatus,
)
from app.extensions import db


class Invoice(BaseModel, TimestampMixin):
    __tablename__ = "invoices"
    __table_args__ = (
        db.Index("ix_invoices_patient_date", "patient_id", "created_at"),
        db.Index("ix_invoices_status_date", "status", "created_at"),
    )

    invoice_number = db.Column(db.String(40), nullable=False, unique=True, index=True)
    patient_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("patient_profiles.id"),
        nullable=False,
        index=True,
    )
    visit_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("visits.id"),
        nullable=True,
        index=True,
    )
    department_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("departments.id"), nullable=True)
    issued_by_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True)
    currency = db.Column(db.String(3), nullable=False, default="KES")
    subtotal_minor = db.Column(db.BigInteger, nullable=False, default=0)
    discount_minor = db.Column(db.BigInteger, nullable=False, default=0)
    total_minor = db.Column(db.BigInteger, nullable=False, default=0)
    amount_paid_minor = db.Column(db.BigInteger, nullable=False, default=0)
    balance_minor = db.Column(db.BigInteger, nullable=False, default=0)
    status = db.Column(
        db.Enum(InvoiceStatus, native_enum=False, length=24),
        nullable=False,
        default=InvoiceStatus.DRAFT,
        index=True,
    )
    primary_method = db.Column(db.Enum(PaymentMethod, native_enum=False, length=16), nullable=True)
    void_reason = db.Column(db.Text, nullable=True)
    issued_at = db.Column(db.DateTime(timezone=True), nullable=True)
    due_at = db.Column(db.DateTime(timezone=True), nullable=True)

    lines = db.relationship(
        "InvoiceLine", back_populates="invoice", cascade="all, delete-orphan", lazy="selectin"
    )
    allocations = db.relationship("InvoiceAllocation", back_populates="invoice", lazy="selectin")
    transactions = db.relationship("Transaction", back_populates="invoice", lazy="dynamic")

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class InvoiceLine(BaseModel, CreatedAtMixin):
    __tablename__ = "invoice_lines"

    invoice_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("invoices.id"), nullable=False, index=True
    )
    service_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("services.id"), nullable=True)
    description = db.Column(db.String(255), nullable=False)
    service_code = db.Column(db.String(64), nullable=True)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    unit_price_minor = db.Column(db.BigInteger, nullable=False)
    line_total_minor = db.Column(db.BigInteger, nullable=False)

    invoice = db.relationship("Invoice", back_populates="lines")

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class InvoiceAllocation(BaseModel, TimestampMixin):
    __tablename__ = "invoice_allocations"

    invoice_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("invoices.id"), nullable=False, index=True
    )
    payer = db.Column(db.Enum(AllocationPayer, native_enum=False, length=16), nullable=False)
    amount_minor = db.Column(db.BigInteger, nullable=False)
    status = db.Column(
        db.Enum(AllocationStatus, native_enum=False, length=16),
        nullable=False,
        default=AllocationStatus.PENDING,
    )
    external_reference = db.Column(db.String(160), nullable=True)

    invoice = db.relationship("Invoice", back_populates="allocations")

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class PaymentIntent(BaseModel, TimestampMixin):
    __tablename__ = "payment_intents"
    __table_args__ = (
        db.UniqueConstraint("method", "checkout_request_id", name="uq_payment_intent_checkout"),
    )

    invoice_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("invoices.id"), nullable=False, index=True
    )
    method = db.Column(
        db.Enum(PaymentMethod, native_enum=False, length=16),
        nullable=False,
        default=PaymentMethod.MPESA,
    )
    amount_minor = db.Column(db.BigInteger, nullable=False)
    currency = db.Column(db.String(3), nullable=False, default="KES")
    phone = db.Column(db.String(32), nullable=True)
    checkout_request_id = db.Column(db.String(160), nullable=True, index=True)
    merchant_request_id = db.Column(db.String(160), nullable=True)
    status = db.Column(
        db.Enum(PaymentIntentStatus, native_enum=False, length=24),
        nullable=False,
        default=PaymentIntentStatus.PENDING,
        index=True,
    )
    idempotency_key = db.Column(db.String(128), nullable=True)
    created_by_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True)
    provider_payload = db.Column(db.JSON, nullable=False, default=dict)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=True)

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class Transaction(BaseModel, CreatedAtMixin):
    __tablename__ = "transactions"
    __table_args__ = (
        db.Index("ix_transactions_invoice_status", "invoice_id", "status"),
        db.Index("ix_transactions_method_date", "method", "created_at"),
    )

    invoice_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("invoices.id"), nullable=False, index=True
    )
    allocation_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("invoice_allocations.id"),
        nullable=True,
    )
    payment_intent_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("payment_intents.id"),
        nullable=True,
    )
    method = db.Column(db.Enum(PaymentMethod, native_enum=False, length=16), nullable=False)
    amount_minor = db.Column(db.BigInteger, nullable=False)
    tendered_minor = db.Column(db.BigInteger, nullable=True)
    change_minor = db.Column(db.BigInteger, nullable=True)
    currency = db.Column(db.String(3), nullable=False, default="KES")
    status = db.Column(
        db.Enum(TransactionStatus, native_enum=False, length=24),
        nullable=False,
        default=TransactionStatus.SUCCESS,
        index=True,
    )
    reference = db.Column(db.String(160), nullable=True, unique=True, index=True)
    provider_reference = db.Column(db.String(160), nullable=True)
    idempotency_key = db.Column(db.String(128), nullable=True, unique=True)
    recorded_by_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True)
    paid_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    notes = db.Column(db.Text, nullable=True)

    invoice = db.relationship("Invoice", back_populates="transactions")

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class VoidRequest(BaseModel, TimestampMixin):
    __tablename__ = "void_requests"

    invoice_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("invoices.id"), nullable=True, index=True
    )
    transaction_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("transactions.id"),
        nullable=True,
        index=True,
    )
    reason = db.Column(db.Text, nullable=False)
    requested_by_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=False)
    reviewed_by_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True)
    status = db.Column(
        db.Enum(VoidRequestStatus, native_enum=False, length=16),
        nullable=False,
        default=VoidRequestStatus.PENDING,
    )
    decision_reason = db.Column(db.Text, nullable=True)
    decided_at = db.Column(db.DateTime(timezone=True), nullable=True)

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class Refund(BaseModel, TimestampMixin):
    __tablename__ = "refunds"

    invoice_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("invoices.id"), nullable=False, index=True
    )
    original_transaction_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("transactions.id"),
        nullable=False,
        index=True,
    )
    refund_transaction_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("transactions.id"), nullable=True
    )
    amount_minor = db.Column(db.BigInteger, nullable=False)
    reason = db.Column(db.Text, nullable=False)
    requested_by_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=False)
    approved_by_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True)
    status = db.Column(
        db.Enum(RefundStatus, native_enum=False, length=16),
        nullable=False,
        default=RefundStatus.PENDING,
    )
    decided_at = db.Column(db.DateTime(timezone=True), nullable=True)

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)


class CashReconciliation(BaseModel, TimestampMixin):
    __tablename__ = "cash_reconciliations"

    business_date = db.Column(db.Date, nullable=False, unique=True, index=True)
    expected_cash_minor = db.Column(db.BigInteger, nullable=False, default=0)
    counted_cash_minor = db.Column(db.BigInteger, nullable=False, default=0)
    variance_minor = db.Column(db.BigInteger, nullable=False, default=0)
    status = db.Column(
        db.Enum(CashReconciliationStatus, native_enum=False, length=16),
        nullable=False,
        default=CashReconciliationStatus.OPEN,
    )
    logged_by_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True)
    resolved_by_id = db.Column(db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=True)
    notes = db.Column(db.Text, nullable=True)

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)
