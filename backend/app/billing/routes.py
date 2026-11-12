from datetime import date, datetime, time, timezone

from flask import Blueprint, Response, request
from sqlalchemy import or_

from app.billing import service
from app.billing.models import CashReconciliation, Invoice, Refund, Transaction, VoidRequest
from app.billing.schemas import (
    AllocationSchema,
    CashPaymentSchema,
    CashReconciliationSchema,
    DecisionSchema,
    InvoiceCreateSchema,
    PaymentIntentSchema,
    ReconciliationResolveSchema,
    RefundRequestSchema,
    VoidRequestSchema,
)
from app.clinical_records.service import get_visit_or_404
from app.common.decorators import auth_required, current_user
from app.common.enums import PaymentMethod, RefundStatus, Role, TransactionStatus, VoidRequestStatus
from app.common.errors import forbidden, not_found, unauthorized
from app.common.idempotency import begin, complete
from app.common.pagination import paginated
from app.common.permissions import patient_profile_for_user
from app.common.responses import created, ok
from app.extensions import db
from app.integrations.documents import get_document_renderer
from app.integrations.mpesa import get_mpesa_gateway

bp = Blueprint("billing", __name__)

BILLING = (Role.RECEPTIONIST, Role.CASHIER, Role.ADMIN)


@bp.post("/visits/<uuid:visit_id>/invoices")
@auth_required(*BILLING)
def create_invoice(visit_id):
    from app.scheduling.models import DoctorProfile  # noqa: F401

    visit = get_visit_or_404(visit_id)
    data = InvoiceCreateSchema().load(request.get_json(silent=True) or {})
    invoice = service.create_invoice(visit, data, current_user())
    return created(service.serialize_invoice(invoice))


def _date_bound(name, end_of_day=False):
    value = request.args.get(name)
    if not value:
        return None
    parsed = date.fromisoformat(value)
    return datetime.combine(parsed, time.max if end_of_day else time.min, tzinfo=timezone.utc)


def _sorted(query, default="-created_at"):
    from app.common.errors import bad_request

    raw = request.args.get("sort") or default
    descending = raw.startswith("-")
    field = raw.lstrip("-")
    columns = {
        "created_at": Invoice.created_at,
        "issued_at": Invoice.issued_at,
        "total_minor": Invoice.total_minor,
        "balance_minor": Invoice.balance_minor,
        "invoice_number": Invoice.invoice_number,
        "status": Invoice.status,
    }
    if field not in columns:
        raise bad_request("Invalid sort field")
    column = columns[field]
    return query.order_by(column.desc() if descending else column.asc())


@bp.get("/invoices")
@auth_required(Role.PATIENT, *BILLING)
def list_invoices():
    from app.patients.models import PatientProfile

    user = current_user()
    query = Invoice.query
    if user.role == Role.PATIENT:
        profile = patient_profile_for_user(user)
        if profile is None:
            raise not_found("Patient profile not found")
        query = query.filter_by(patient_id=profile.id)
    if request.args.get("status"):
        query = query.filter(Invoice.status == request.args["status"])
    if request.args.get("patient_id") and user.role != Role.PATIENT:
        from uuid import UUID

        query = query.filter_by(patient_id=UUID(request.args["patient_id"]))
    if request.args.get("method"):
        query = query.filter(Invoice.primary_method == PaymentMethod(request.args["method"]))
    if request.args.get("department_id"):
        from uuid import UUID

        query = query.filter(Invoice.department_id == UUID(request.args["department_id"]))
    if request.args.get("date_from"):
        query = query.filter(Invoice.created_at >= _date_bound("date_from"))
    if request.args.get("date_to"):
        query = query.filter(Invoice.created_at <= _date_bound("date_to", end_of_day=True))
    if request.args.get("q"):
        like = f"%{request.args['q'].strip()}%"
        query = query.filter(
            or_(
                Invoice.invoice_number.ilike(like),
                Invoice.patient.has(
                    or_(
                        PatientProfile.first_name.ilike(like),
                        PatientProfile.last_name.ilike(like),
                        PatientProfile.patient_number.ilike(like),
                        PatientProfile.phone.ilike(like),
                    )
                ),
            )
        )
    query = _sorted(query)
    return ok(paginated(query, service.serialize_invoice))


@bp.get("/invoices/<uuid:invoice_id>")
@auth_required(Role.PATIENT, *BILLING)
def get_invoice(invoice_id):
    invoice = service.get_invoice_or_404(invoice_id)
    if current_user().role == Role.PATIENT:
        profile = patient_profile_for_user(current_user())
        if profile is None or invoice.patient_id != profile.id:
            raise forbidden()
    return ok(service.serialize_invoice(invoice))


@bp.post("/invoices/<uuid:invoice_id>/allocations")
@auth_required(*BILLING)
def create_allocation(invoice_id):
    invoice = service.get_invoice_or_404(invoice_id)
    data = AllocationSchema().load(request.get_json(silent=True) or {})
    allocation = service.add_allocation(invoice, data, current_user())
    return created(
        {
            "id": str(allocation.id),
            "payer": allocation.payer.value,
            "amount_minor": allocation.amount_minor,
            "status": allocation.status.value,
        }
    )


@bp.post("/invoices/<uuid:invoice_id>/transactions")
@auth_required(*BILLING)
def record_payment(invoice_id):
    invoice = service.get_invoice_or_404(invoice_id)
    data = CashPaymentSchema().load(request.get_json(silent=True) or {})
    transaction = service.record_payment(invoice, data, current_user())
    return created(service.serialize_transaction(transaction))


@bp.post("/invoices/<uuid:invoice_id>/payment-intents")
@auth_required(*BILLING)
def create_payment_intent(invoice_id):
    invoice = service.get_invoice_or_404(invoice_id)
    data = PaymentIntentSchema().load(request.get_json(silent=True) or {})
    key = request.headers.get("Idempotency-Key")
    record = None
    if key:
        record, cached = begin("mpesa.payment_intent", key, data)
        if cached is not None:
            return cached["body"], cached["code"]
    intent = service.create_payment_intent(invoice, data, current_user(), key)
    payload = service.serialize_intent(intent)
    if record is not None:
        complete(record, 201, payload)
        db.session.commit()
    return created(payload)


@bp.post("/webhooks/mpesa/daraja")
def mpesa_callback():
    payload = request.get_json(silent=True) or {}
    gateway = get_mpesa_gateway()
    if not gateway.verify_callback(dict(request.headers), payload):
        raise unauthorized("Invalid callback signature")
    return ok(service.handle_mpesa_callback(payload))


@bp.post("/invoices/<uuid:invoice_id>/void-requests")
@auth_required(*BILLING)
def create_void_request(invoice_id):
    data = VoidRequestSchema().load(request.get_json(silent=True) or {})
    data["invoice_id"] = invoice_id
    data.pop("transaction_id", None)
    item = service.create_void_request(data, current_user())
    return created(service.serialize_void_request(item))


@bp.post("/void-requests/<uuid:request_id>/decision")
@auth_required(Role.ADMIN)
def decide_void(request_id):
    data = DecisionSchema().load(request.get_json(silent=True) or {})
    item = service.decide_void(request_id, data, current_user())
    return ok(service.serialize_void_request(item))


@bp.post("/transactions/<uuid:transaction_id>/refund-requests")
@auth_required(*BILLING)
def create_refund_request(transaction_id):
    payload = request.get_json(silent=True) or {}
    payload["transaction_id"] = transaction_id
    data = RefundRequestSchema().load(payload)
    refund = service.create_refund_request(data, current_user())
    return created(service.serialize_refund(refund))


@bp.post("/refunds/<uuid:refund_id>/decision")
@auth_required(Role.ADMIN)
def decide_refund(refund_id):
    data = DecisionSchema().load(request.get_json(silent=True) or {})
    refund = service.decide_refund(refund_id, data, current_user())
    return ok(service.serialize_refund(refund))


@bp.get("/billing/reconciliation")
@auth_required(*BILLING)
def reconciliation():
    intents, transactions = service.reconciliation_queue()
    return ok(
        {
            "payment_intents": [service.serialize_intent(item) for item in intents],
            "transactions": [service.serialize_transaction(item) for item in transactions],
        }
    )


@bp.post("/billing/transactions/<uuid:transaction_id>/resolve")
@auth_required(*BILLING)
def resolve_transaction(transaction_id):
    transaction = Transaction.query.get(transaction_id)
    if transaction is None:
        raise not_found("Transaction not found")
    data = ReconciliationResolveSchema().load(request.get_json(silent=True) or {})
    transaction = service.resolve_transaction(transaction, data, current_user())
    return ok(service.serialize_transaction(transaction))


@bp.get("/billing/cash-summary")
@auth_required(*BILLING)
def cash_summary():
    target = date.fromisoformat(request.args["date"]) if request.args.get("date") else date.today()
    return ok(service.cash_summary(target))


@bp.post("/billing/cash-reconciliations")
@auth_required(*BILLING)
def cash_reconciliation():
    data = CashReconciliationSchema().load(request.get_json(silent=True) or {})
    item = service.cash_reconciliation(data, current_user())
    return created(service.serialize_cash_reconciliation(item))


@bp.get("/billing/void-requests")
@auth_required(*BILLING)
def list_void_requests():
    query = VoidRequest.query
    if request.args.get("status"):
        query = query.filter(VoidRequest.status == VoidRequestStatus(request.args["status"]))
    if request.args.get("invoice_id"):
        from uuid import UUID

        query = query.filter(VoidRequest.invoice_id == UUID(request.args["invoice_id"]))
    query = query.order_by(VoidRequest.created_at.desc())
    return ok(paginated(query, service.serialize_void_request))


@bp.get("/billing/refunds")
@auth_required(*BILLING)
def list_refunds():
    query = Refund.query
    if request.args.get("status"):
        query = query.filter(Refund.status == RefundStatus(request.args["status"]))
    if request.args.get("invoice_id"):
        from uuid import UUID

        query = query.filter(Refund.invoice_id == UUID(request.args["invoice_id"]))
    query = query.order_by(Refund.created_at.desc())
    return ok(paginated(query, service.serialize_refund))


@bp.get("/billing/transactions")
@auth_required(*BILLING)
def list_transactions():
    query = Transaction.query
    if request.args.get("status"):
        query = query.filter(Transaction.status == TransactionStatus(request.args["status"]))
    if request.args.get("method"):
        query = query.filter(Transaction.method == PaymentMethod(request.args["method"]))
    if request.args.get("invoice_id"):
        from uuid import UUID

        query = query.filter(Transaction.invoice_id == UUID(request.args["invoice_id"]))
    if request.args.get("date_from"):
        query = query.filter(Transaction.paid_at >= _date_bound("date_from"))
    if request.args.get("date_to"):
        query = query.filter(Transaction.paid_at <= _date_bound("date_to", end_of_day=True))
    if request.args.get("q"):
        like = f"%{request.args['q'].strip()}%"
        query = query.filter(
            or_(
                Transaction.reference.ilike(like),
                Transaction.provider_reference.ilike(like),
                Transaction.invoice.has(Invoice.invoice_number.ilike(like)),
            )
        )
    query = query.order_by(Transaction.created_at.desc())
    return ok(paginated(query, service.serialize_transaction))


@bp.get("/billing/cash-reconciliations")
@auth_required(*BILLING)
def list_cash_reconciliations():
    query = CashReconciliation.query.order_by(CashReconciliation.business_date.desc())
    return ok(paginated(query, service.serialize_cash_reconciliation))


@bp.get("/invoices/<uuid:invoice_id>/pdf")
@auth_required(Role.PATIENT, *BILLING)
def invoice_pdf(invoice_id):
    invoice = service.get_invoice_or_404(invoice_id)
    if current_user().role == Role.PATIENT:
        profile = patient_profile_for_user(current_user())
        if profile is None or invoice.patient_id != profile.id:
            raise forbidden()
    content = get_document_renderer().invoice(invoice)
    return Response(
        content,
        mimetype="text/html",
        headers={"Content-Disposition": f'inline; filename="{invoice.invoice_number}.html"'},
    )


@bp.get("/transactions/<uuid:transaction_id>/receipt")
@auth_required(Role.PATIENT, *BILLING)
def transaction_receipt(transaction_id):
    transaction = Transaction.query.get(transaction_id)
    if transaction is None:
        raise not_found("Transaction not found")
    if current_user().role == Role.PATIENT:
        invoice = service.get_invoice_or_404(transaction.invoice_id)
        profile = patient_profile_for_user(current_user())
        if profile is None or invoice.patient_id != profile.id:
            raise forbidden()
    content = get_document_renderer().receipt(transaction)
    return Response(
        content,
        mimetype="text/html",
        headers={"Content-Disposition": f'inline; filename="receipt-{transaction.id}.html"'},
    )
