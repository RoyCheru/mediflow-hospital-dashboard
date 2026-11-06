import uuid
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import func

from app.billing.models import (
    CashReconciliation,
    Invoice,
    InvoiceAllocation,
    InvoiceLine,
    PaymentIntent,
    Refund,
    Transaction,
    VoidRequest,
)
from app.common.audit import record_audit
from app.common.base import utcnow
from app.common.enums import (
    AllocationStatus,
    CashReconciliationStatus,
    InvoiceStatus,
    PaymentIntentStatus,
    PaymentMethod,
    RefundStatus,
    TransactionStatus,
    VoidRequestStatus,
)
from app.common.errors import bad_request, conflict, not_found
from app.common.outbox import enqueue_event
from app.common.sequences import next_sequence_value
from app.extensions import db
from app.integrations.mpesa import get_mpesa_gateway, normalize_phone


def _iso(value):
    return value.isoformat() if value else None


def _aware(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def serialize_invoice(invoice):
    return {
        "id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "patient_id": str(invoice.patient_id),
        "visit_id": str(invoice.visit_id) if invoice.visit_id else None,
        "department_id": str(invoice.department_id) if invoice.department_id else None,
        "currency": invoice.currency,
        "subtotal_minor": invoice.subtotal_minor,
        "discount_minor": invoice.discount_minor,
        "total_minor": invoice.total_minor,
        "amount_paid_minor": invoice.amount_paid_minor,
        "balance_minor": invoice.balance_minor,
        "status": invoice.status.value,
        "primary_method": invoice.primary_method.value if invoice.primary_method else None,
        "issued_at": _iso(_aware(invoice.issued_at)),
        "due_at": _iso(_aware(invoice.due_at)),
        "created_at": _iso(_aware(invoice.created_at)),
        "lines": [
            {
                "id": str(line.id),
                "service_id": str(line.service_id) if line.service_id else None,
                "description": line.description,
                "service_code": line.service_code,
                "quantity": line.quantity,
                "unit_price_minor": line.unit_price_minor,
                "line_total_minor": line.line_total_minor,
            }
            for line in invoice.lines
        ],
        "allocations": [
            {
                "id": str(allocation.id),
                "payer": allocation.payer.value,
                "amount_minor": allocation.amount_minor,
                "status": allocation.status.value,
                "external_reference": allocation.external_reference,
            }
            for allocation in invoice.allocations
        ],
    }


def serialize_transaction(transaction):
    return {
        "id": str(transaction.id),
        "invoice_id": str(transaction.invoice_id),
        "allocation_id": str(transaction.allocation_id) if transaction.allocation_id else None,
        "method": transaction.method.value,
        "amount_minor": transaction.amount_minor,
        "tendered_minor": transaction.tendered_minor,
        "change_minor": transaction.change_minor,
        "currency": transaction.currency,
        "status": transaction.status.value,
        "reference": transaction.reference,
        "provider_reference": transaction.provider_reference,
        "paid_at": _iso(_aware(transaction.paid_at)),
        "created_at": _iso(_aware(transaction.created_at)),
        "notes": transaction.notes,
    }


def serialize_intent(intent):
    return {
        "id": str(intent.id),
        "invoice_id": str(intent.invoice_id),
        "method": intent.method.value,
        "amount_minor": intent.amount_minor,
        "phone": intent.phone,
        "checkout_request_id": intent.checkout_request_id,
        "merchant_request_id": intent.merchant_request_id,
        "status": intent.status.value,
        "attempts": intent.attempts if hasattr(intent, "attempts") else None,
        "created_at": _iso(_aware(intent.created_at)),
    }


def serialize_void_request(item):
    return {
        "id": str(item.id),
        "invoice_id": str(item.invoice_id) if item.invoice_id else None,
        "transaction_id": str(item.transaction_id) if item.transaction_id else None,
        "reason": item.reason,
        "status": item.status.value,
        "requested_by_id": str(item.requested_by_id),
        "reviewed_by_id": str(item.reviewed_by_id) if item.reviewed_by_id else None,
        "decision_reason": item.decision_reason,
        "decided_at": _iso(_aware(item.decided_at)),
        "created_at": _iso(_aware(item.created_at)),
    }


def serialize_refund(item):
    return {
        "id": str(item.id),
        "invoice_id": str(item.invoice_id),
        "original_transaction_id": str(item.original_transaction_id),
        "amount_minor": item.amount_minor,
        "reason": item.reason,
        "status": item.status.value,
        "requested_by_id": str(item.requested_by_id),
        "approved_by_id": str(item.approved_by_id) if item.approved_by_id else None,
        "decided_at": _iso(_aware(item.decided_at)),
        "created_at": _iso(_aware(item.created_at)),
    }


def serialize_cash_reconciliation(item):
    return {
        "id": str(item.id),
        "business_date": item.business_date.isoformat(),
        "expected_cash_minor": item.expected_cash_minor,
        "counted_cash_minor": item.counted_cash_minor,
        "variance_minor": item.variance_minor,
        "status": item.status.value,
        "notes": item.notes,
    }


def get_invoice_or_404(invoice_id):
    invoice = Invoice.query.get(invoice_id)
    if invoice is None:
        raise not_found("Invoice not found")
    return invoice


def create_invoice(visit, data, actor):
    existing = (
        Invoice.query.filter_by(visit_id=visit.id)
        .filter(Invoice.status != InvoiceStatus.VOIDED)
        .first()
    )
    if existing is not None:
        raise conflict(
            "An invoice already exists for this visit",
            {"invoice_id": str(existing.id)},
        )

    line_specs = data.get("items") or []
    if not line_specs:
        from app.scheduling.models import Appointment, DoctorProfile, Service
        from app.scheduling.service import current_price

        appointment = Appointment.query.get(visit.appointment_id) if visit.appointment_id else None
        if appointment is not None and appointment.service_id:
            service = Service.query.get(appointment.service_id)
            price = current_price(service.id)
            line_specs.append(
                {
                    "service_id": service.id,
                    "description": service.name,
                    "quantity": 1,
                    "unit_price_minor": price.amount_minor if price else 0,
                }
            )
        doctor = DoctorProfile.query.get(visit.doctor_id)
        if doctor is not None and doctor.consultation_fee_minor > 0:
            line_specs.append(
                {
                    "description": "Consultation",
                    "quantity": 1,
                    "unit_price_minor": doctor.consultation_fee_minor,
                }
            )
    if not line_specs:
        raise bad_request(
            "Invoice requires at least one line item",
            {"items": ["Provide items or attach a priced service to the visit"]},
        )

    invoice = Invoice(
        invoice_number=next_sequence_value("invoice_number", prefix="INV-{year}-", width=6),
        patient_id=visit.patient_id,
        visit_id=visit.id,
        department_id=visit.department_id,
        issued_by_id=actor.id if actor else None,
        status=InvoiceStatus.ISSUED,
        issued_at=utcnow(),
        due_at=data.get("due_at"),
    )
    subtotal = 0
    for spec in line_specs:
        quantity = spec.get("quantity", 1)
        unit_price = spec.get("unit_price_minor")
        service = None
        if spec.get("service_id"):
            from app.scheduling.models import Service
            from app.scheduling.service import current_price

            service = Service.query.get(spec["service_id"])
            if service is None:
                raise not_found("Service not found")
            if unit_price is None:
                price = current_price(service.id)
                unit_price = price.amount_minor if price else 0
        if unit_price is None:
            raise bad_request(
                "Each line requires service_id or unit_price_minor",
                {"items": ["Missing unit_price_minor"]},
            )
        line_total = int(quantity) * int(unit_price)
        subtotal += line_total
        invoice.lines.append(
            InvoiceLine(
                service_id=service.id if service else None,
                description=spec.get("description") or (service.name if service else "Service"),
                service_code=service.code if service else None,
                quantity=quantity,
                unit_price_minor=int(unit_price),
                line_total_minor=line_total,
            )
        )

    discount = int(data.get("discount_minor") or 0)
    if discount > subtotal:
        raise bad_request("Discount cannot exceed subtotal")
    invoice.subtotal_minor = subtotal
    invoice.discount_minor = discount
    invoice.total_minor = subtotal - discount
    invoice.amount_paid_minor = 0
    invoice.balance_minor = invoice.total_minor
    db.session.add(invoice)
    db.session.flush()
    enqueue_event(
        "invoice.created",
        "invoice",
        invoice.id,
        {
            "invoice_id": str(invoice.id),
            "invoice_number": invoice.invoice_number,
            "patient_id": str(invoice.patient_id),
            "total_minor": invoice.total_minor,
        },
    )
    record_audit(
        "invoice.create",
        "invoice",
        invoice.id,
        actor=actor,
        after={"total_minor": invoice.total_minor},
    )
    db.session.commit()
    return invoice


def add_allocation(invoice, data, actor):
    if invoice.status in {InvoiceStatus.VOIDED, InvoiceStatus.REFUNDED}:
        raise conflict("Cannot allocate a voided or refunded invoice")
    allocated = sum(
        item.amount_minor for item in invoice.allocations if item.status != AllocationStatus.VOIDED
    )
    if allocated + data["amount_minor"] > invoice.total_minor:
        raise bad_request("Allocation exceeds the invoice total")
    allocation = InvoiceAllocation(
        invoice_id=invoice.id,
        payer=data["payer"],
        amount_minor=data["amount_minor"],
        external_reference=data.get("external_reference"),
    )
    db.session.add(allocation)
    db.session.flush()
    record_audit(
        "invoice.allocation_create",
        "invoice_allocation",
        allocation.id,
        actor=actor,
        after={"payer": allocation.payer.value, "amount_minor": allocation.amount_minor},
    )
    db.session.commit()
    return allocation


def record_payment(invoice, data, actor):
    method = data.get("method", PaymentMethod.CASH)
    if method == PaymentMethod.SHA:
        raise bad_request("Use the SHA claims workflow for SHA payments")
    if method == PaymentMethod.MPESA:
        raise bad_request("Use the M-Pesa payment-intent workflow")
    if invoice.status in {InvoiceStatus.VOIDED, InvoiceStatus.REFUNDED}:
        raise conflict("Invoice cannot receive payment in its current state")
    if invoice.balance_minor <= 0:
        raise conflict("Invoice is already settled")
    amount = int(data["amount_minor"])
    if amount > invoice.balance_minor:
        raise bad_request("Payment exceeds the outstanding balance")
    tendered = data.get("tendered_minor")
    if method == PaymentMethod.CASH:
        if tendered is None:
            tendered = amount
        if tendered < amount:
            raise bad_request("Tendered amount is less than the payment amount")
        change = tendered - amount
    else:
        change = None

    reference = data.get("reference") or f"{method.value}-{uuid.uuid4().hex[:16].upper()}"
    if Transaction.query.filter_by(reference=reference).first():
        raise conflict("A transaction with this reference already exists")
    transaction = Transaction(
        invoice_id=invoice.id,
        method=method,
        amount_minor=amount,
        tendered_minor=tendered,
        change_minor=change,
        status=TransactionStatus.SUCCESS,
        reference=reference,
        recorded_by_id=actor.id if actor else None,
        paid_at=utcnow(),
        notes=data.get("notes"),
    )
    db.session.add(transaction)
    db.session.flush()
    recompute_invoice(invoice)
    enqueue_event(
        "payment.received",
        "transaction",
        transaction.id,
        {
            "transaction_id": str(transaction.id),
            "invoice_id": str(invoice.id),
            "patient_id": str(invoice.patient_id),
            "amount_minor": amount,
            "method": method.value,
            "reference": reference,
        },
    )
    record_audit(
        "payment.record",
        "transaction",
        transaction.id,
        actor=actor,
        after={"amount_minor": amount, "method": method.value},
    )
    db.session.commit()
    return transaction


def recompute_invoice(invoice):
    paid = (
        db.session.query(func.coalesce(func.sum(Transaction.amount_minor), 0))
        .filter(
            Transaction.invoice_id == invoice.id,
            Transaction.status == TransactionStatus.SUCCESS,
        )
        .scalar()
    )
    refunded = (
        db.session.query(func.coalesce(func.sum(Refund.amount_minor), 0))
        .filter(
            Refund.invoice_id == invoice.id,
            Refund.status == RefundStatus.COMPLETED,
        )
        .scalar()
    )
    net = int(paid) - int(refunded)
    invoice.amount_paid_minor = net
    invoice.balance_minor = invoice.total_minor - net
    if invoice.status == InvoiceStatus.VOIDED:
        return invoice
    if net <= 0:
        invoice.status = InvoiceStatus.REFUNDED if refunded > 0 else InvoiceStatus.ISSUED
    elif net >= invoice.total_minor:
        invoice.status = InvoiceStatus.PAID
    else:
        invoice.status = InvoiceStatus.PARTIALLY_PAID
    return invoice


def create_payment_intent(invoice, data, actor, idempotency_key=None):
    if invoice.balance_minor <= 0:
        raise conflict("Invoice is already settled")
    amount = int(data["amount_minor"])
    if amount > invoice.balance_minor:
        raise bad_request("Payment exceeds the outstanding balance")
    gateway = get_mpesa_gateway()
    result = gateway.stk_push(
        data["phone"],
        amount,
        data.get("account_reference") or invoice.invoice_number,
        f"Payment for {invoice.invoice_number}",
    )
    intent = PaymentIntent(
        invoice_id=invoice.id,
        method=PaymentMethod.MPESA,
        amount_minor=amount,
        phone=normalize_phone(data["phone"]),
        checkout_request_id=result["checkout_request_id"],
        merchant_request_id=result.get("merchant_request_id"),
        status=PaymentIntentStatus.PENDING,
        idempotency_key=idempotency_key,
        created_by_id=actor.id if actor else None,
        provider_payload=result,
    )
    db.session.add(intent)
    db.session.flush()
    invoice.primary_method = PaymentMethod.MPESA
    enqueue_event(
        "payment.intent_created",
        "payment_intent",
        intent.id,
        {
            "payment_intent_id": str(intent.id),
            "invoice_id": str(invoice.id),
            "amount_minor": amount,
        },
    )
    record_audit(
        "payment.intent_create",
        "payment_intent",
        intent.id,
        actor=actor,
        after={"amount_minor": amount, "phone": intent.phone},
    )
    db.session.commit()
    return intent


def handle_mpesa_callback(payload):
    callback = (payload or {}).get("Body", {}).get("stkCallback", {}) or {}
    checkout_id = callback.get("CheckoutRequestID")
    intent = PaymentIntent.query.filter_by(checkout_request_id=checkout_id).first()
    if intent is None:
        return {"ResultCode": 0, "ResultDesc": "Accepted"}

    if intent.status == PaymentIntentStatus.SUCCESS:
        return {"ResultCode": 0, "ResultDesc": "Already processed"}

    result_code = int(callback.get("ResultCode", -1))
    metadata = {
        item.get("Name"): item.get("Value")
        for item in (callback.get("CallbackMetadata") or {}).get("Item", [])
    }
    if result_code == 0:
        receipt = metadata.get("MpesaReceiptNumber") or f"MPESA-{uuid.uuid4().hex[:12]}"
        existing = Transaction.query.filter_by(reference=receipt).first()
        if existing is None:
            transaction = Transaction(
                invoice_id=intent.invoice_id,
                payment_intent_id=intent.id,
                method=PaymentMethod.MPESA,
                amount_minor=int(metadata.get("Amount") or intent.amount_minor),
                status=TransactionStatus.SUCCESS,
                reference=receipt,
                provider_reference=receipt,
                paid_at=utcnow(),
                notes="Matched from M-Pesa Daraja callback",
            )
            db.session.add(transaction)
        intent.status = PaymentIntentStatus.SUCCESS
        invoice = Invoice.query.get(intent.invoice_id)
        if invoice is not None:
            invoice.primary_method = PaymentMethod.MPESA
            db.session.flush()
            recompute_invoice(invoice)
        enqueue_event(
            "payment.received",
            "payment_intent",
            intent.id,
            {
                "payment_intent_id": str(intent.id),
                "invoice_id": str(intent.invoice_id),
                "patient_id": str(invoice.patient_id) if invoice else None,
                "amount_minor": int(metadata.get("Amount") or intent.amount_minor),
                "reference": receipt,
            },
        )
    elif result_code in {1032, 1037, 2001}:
        intent.status = PaymentIntentStatus.UNCONFIRMED
        _alert_admins(
            "mpesa_failed_alert",
            {
                "checkout_id": checkout_id or "",
                "invoice_id": str(intent.invoice_id),
                "status": intent.status.value,
            },
        )
    else:
        intent.status = PaymentIntentStatus.FAILED
        _alert_admins(
            "mpesa_failed_alert",
            {
                "checkout_id": checkout_id or "",
                "invoice_id": str(intent.invoice_id),
                "status": intent.status.value,
            },
        )
    record_audit(
        "payment.callback",
        "payment_intent",
        intent.id,
        after={"status": intent.status.value, "result_code": result_code},
    )
    db.session.commit()
    return {"ResultCode": 0, "ResultDesc": "Accepted"}


def create_void_request(data, actor):
    if not data.get("invoice_id") and not data.get("transaction_id"):
        raise bad_request("invoice_id or transaction_id is required")
    if data.get("invoice_id") and data.get("transaction_id"):
        raise bad_request("Provide only one of invoice_id or transaction_id")
    if data.get("invoice_id"):
        invoice = get_invoice_or_404(data["invoice_id"])
        if invoice.status == InvoiceStatus.VOIDED:
            raise conflict("Invoice is already voided")
    if data.get("transaction_id"):
        transaction = Transaction.query.get(data["transaction_id"])
        if transaction is None:
            raise not_found("Transaction not found")
        if transaction.status == TransactionStatus.REVERSED:
            raise conflict("Transaction is already reversed")
    item = VoidRequest(
        invoice_id=data.get("invoice_id"),
        transaction_id=data.get("transaction_id"),
        reason=data["reason"],
        requested_by_id=actor.id,
    )
    db.session.add(item)
    db.session.flush()
    record_audit(
        "void.request",
        "void_request",
        item.id,
        actor=actor,
        after={"reason": item.reason},
    )
    db.session.commit()
    return item


def decide_void(request_id, data, actor):
    item = VoidRequest.query.get(request_id)
    if item is None:
        raise not_found("Void request not found")
    if item.status != VoidRequestStatus.PENDING:
        raise conflict("Void request has already been decided")
    if item.requested_by_id == actor.id:
        raise conflict("The requester cannot approve their own void request")
    item.status = VoidRequestStatus.APPROVED if data["approve"] else VoidRequestStatus.REJECTED
    item.reviewed_by_id = actor.id
    item.decision_reason = data.get("reason")
    item.decided_at = utcnow()
    if data["approve"]:
        if item.invoice_id:
            invoice = get_invoice_or_404(item.invoice_id)
            invoice.status = InvoiceStatus.VOIDED
            invoice.void_reason = item.reason
            for allocation in invoice.allocations:
                allocation.status = AllocationStatus.VOIDED
        elif item.transaction_id:
            transaction = Transaction.query.get(item.transaction_id)
            if transaction is not None:
                transaction.status = TransactionStatus.REVERSED
                recompute_invoice(get_invoice_or_404(transaction.invoice_id))
    record_audit(
        "void.decision",
        "void_request",
        item.id,
        actor=actor,
        after={"status": item.status.value, "reason": item.decision_reason},
    )
    db.session.commit()
    return item


def create_refund_request(data, actor):
    transaction = Transaction.query.get(data["transaction_id"])
    if transaction is None:
        raise not_found("Transaction not found")
    if transaction.status != TransactionStatus.SUCCESS:
        raise conflict("Only successful transactions can be refunded")
    already = (
        db.session.query(func.coalesce(func.sum(Refund.amount_minor), 0))
        .filter(
            Refund.original_transaction_id == transaction.id,
            Refund.status.in_([RefundStatus.PENDING, RefundStatus.COMPLETED]),
        )
        .scalar()
    )
    if int(already) + data["amount_minor"] > transaction.amount_minor:
        raise bad_request("Refund exceeds the original transaction amount")
    refund = Refund(
        invoice_id=transaction.invoice_id,
        original_transaction_id=transaction.id,
        amount_minor=data["amount_minor"],
        reason=data["reason"],
        requested_by_id=actor.id,
    )
    db.session.add(refund)
    db.session.flush()
    record_audit(
        "refund.request",
        "refund",
        refund.id,
        actor=actor,
        after={"amount_minor": refund.amount_minor},
    )
    db.session.commit()
    return refund


def decide_refund(refund_id, data, actor):
    refund = Refund.query.get(refund_id)
    if refund is None:
        raise not_found("Refund not found")
    if refund.status != RefundStatus.PENDING:
        raise conflict("Refund has already been decided")
    if refund.requested_by_id == actor.id:
        raise conflict("The requester cannot approve their own refund request")
    refund.status = RefundStatus.COMPLETED if data["approve"] else RefundStatus.REJECTED
    refund.approved_by_id = actor.id
    refund.decided_at = utcnow()
    if data["approve"]:
        invoice = get_invoice_or_404(refund.invoice_id)
        db.session.flush()
        recompute_invoice(invoice)
    record_audit(
        "refund.decision",
        "refund",
        refund.id,
        actor=actor,
        after={"status": refund.status.value},
    )
    db.session.commit()
    return refund


def reconciliation_queue():
    intents = PaymentIntent.query.filter(
        PaymentIntent.status == PaymentIntentStatus.UNCONFIRMED
    ).all()
    transactions = Transaction.query.filter(
        Transaction.status == TransactionStatus.UNCONFIRMED
    ).all()
    return intents, transactions


def resolve_transaction(transaction, data, actor):
    if data["resolution"] == "SUCCESS":
        transaction.status = TransactionStatus.SUCCESS
    else:
        transaction.status = TransactionStatus.FAILED
    recompute_invoice(get_invoice_or_404(transaction.invoice_id))
    record_audit(
        "payment.reconcile",
        "transaction",
        transaction.id,
        actor=actor,
        after={
            "resolution": data["resolution"],
            "notes": data.get("notes"),
        },
    )
    db.session.commit()
    return transaction


def cash_expected_for(business_date):
    start = datetime.combine(business_date, time.min, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    total = (
        db.session.query(func.coalesce(func.sum(Transaction.amount_minor), 0))
        .filter(
            Transaction.method == PaymentMethod.CASH,
            Transaction.status == TransactionStatus.SUCCESS,
            Transaction.paid_at >= start,
            Transaction.paid_at < end,
        )
        .scalar()
    )
    return int(total)


def cash_reconciliation(data, actor):
    business_date = data["business_date"]
    expected = cash_expected_for(business_date)
    counted = int(data["counted_cash_minor"])
    variance = counted - expected
    item = CashReconciliation.query.filter_by(business_date=business_date).first()
    if item is None:
        item = CashReconciliation(business_date=business_date)
        db.session.add(item)
    item.expected_cash_minor = expected
    item.counted_cash_minor = counted
    item.variance_minor = variance
    item.status = (
        CashReconciliationStatus.BALANCED if variance == 0 else CashReconciliationStatus.DISCREPANCY
    )
    item.logged_by_id = actor.id if actor else None
    item.notes = data.get("notes")
    record_audit(
        "cash.reconcile",
        "cash_reconciliation",
        item.id,
        actor=actor,
        after={"expected": expected, "counted": counted, "variance": variance},
    )
    if variance != 0:
        _alert_admins(
            "cash_variance_alert",
            {
                "business_date": business_date.isoformat(),
                "variance": f"{variance / 100:.2f}",
            },
        )
    db.session.commit()
    return item


def _alert_admins(template_key, payload):
    from app.auth.models import User
    from app.common.enums import NotificationChannel, Role, UserStatus
    from app.notifications.models import Notification

    admins = User.query.filter_by(role=Role.ADMIN, status=UserStatus.ACTIVE).all()
    for admin in admins:
        db.session.add(
            Notification(
                recipient_user_id=admin.id,
                channel=NotificationChannel.IN_APP,
                template_key=template_key,
                payload=payload,
            )
        )


def cash_summary(business_date):
    start = datetime.combine(business_date, time.min, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    rows = (
        db.session.query(
            Transaction.method,
            func.coalesce(func.sum(Transaction.amount_minor), 0),
            func.count(Transaction.id),
        )
        .filter(
            Transaction.status == TransactionStatus.SUCCESS,
            Transaction.paid_at >= start,
            Transaction.paid_at < end,
        )
        .group_by(Transaction.method)
        .all()
    )
    return {
        "business_date": business_date.isoformat(),
        "methods": [
            {
                "method": method.value,
                "amount_minor": int(amount),
                "count": int(count),
            }
            for method, amount, count in rows
        ],
        "cash_expected_minor": cash_expected_for(business_date),
    }
