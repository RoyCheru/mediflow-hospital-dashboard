import uuid
from datetime import timezone

from flask import current_app
from sqlalchemy import func, or_
from sqlalchemy.orm import lazyload

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
    AllocationPayer,
    AllocationStatus,
    CashReconciliationStatus,
    ClaimStatus,
    DiscountStatus,
    InvoiceStatus,
    PaymentIntentStatus,
    PaymentMethod,
    RefundStatus,
    TransactionStatus,
    VoidRequestStatus,
)
from app.common.errors import ApiError, bad_request, conflict, not_found
from app.common.outbox import enqueue_event
from app.common.sequences import next_sequence_value
from app.common.time import hospital_day_bounds
from app.extensions import db
from app.integrations.mpesa import (
    MINOR_UNITS_PER_SHILLING,
    get_mpesa_gateway,
    normalize_phone,
    shillings_to_minor,
)


def _iso(value):
    return value.isoformat() if value else None


def _aware(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _person_name(person):
    if person is None:
        return None
    return getattr(person, "full_name", None) or " ".join(
        part
        for part in (getattr(person, "first_name", None), getattr(person, "last_name", None))
        if part
    )


def serialize_invoice(invoice):
    patient = getattr(invoice, "patient", None)
    department = getattr(invoice, "department", None)
    visit = getattr(invoice, "visit", None)
    doctor = getattr(visit, "doctor", None) if visit is not None else None
    doctor_user = getattr(doctor, "user", None) if doctor is not None else None
    return {
        "id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "patient_id": str(invoice.patient_id),
        "patient_name": _person_name(patient),
        "patient_number": getattr(patient, "patient_number", None),
        "appointment_id": str(invoice.appointment_id) if invoice.appointment_id else None,
        "visit_id": str(invoice.visit_id) if invoice.visit_id else None,
        "doctor_name": _person_name(doctor_user),
        "department_id": str(invoice.department_id) if invoice.department_id else None,
        "department_name": getattr(department, "name", None),
        "currency": invoice.currency,
        "subtotal_minor": invoice.subtotal_minor,
        "discount_minor": invoice.discount_minor,
        "discount_reason": invoice.discount_reason,
        "discount_status": invoice.discount_status.value if invoice.discount_status else None,
        "discount_requested_minor": invoice.discount_requested_minor,
        "total_minor": invoice.total_minor,
        "amount_paid_minor": invoice.amount_paid_minor,
        "balance_minor": invoice.balance_minor,
        "status": invoice.status.value,
        "primary_method": invoice.primary_method.value if invoice.primary_method else None,
        "issued_at": _iso(_aware(invoice.issued_at)),
        "finalized_at": _iso(_aware(invoice.finalized_at)),
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
    invoice = getattr(transaction, "invoice", None)
    patient = getattr(invoice, "patient", None) if invoice is not None else None
    return {
        "id": str(transaction.id),
        "invoice_id": str(transaction.invoice_id),
        "invoice_number": getattr(invoice, "invoice_number", None),
        "patient_name": _person_name(patient),
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
    invoice = getattr(item, "invoice", None)
    patient = getattr(invoice, "patient", None) if invoice is not None else None
    return {
        "id": str(item.id),
        "invoice_id": str(item.invoice_id) if item.invoice_id else None,
        "invoice_number": getattr(invoice, "invoice_number", None),
        "patient_name": _person_name(patient),
        "requested_by_name": _person_name(getattr(item, "requested_by", None)),
        "reviewed_by_name": _person_name(getattr(item, "reviewed_by", None)),
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
    invoice = getattr(item, "invoice", None)
    patient = getattr(invoice, "patient", None) if invoice is not None else None
    return {
        "id": str(item.id),
        "invoice_id": str(item.invoice_id),
        "invoice_number": getattr(invoice, "invoice_number", None),
        "patient_name": _person_name(patient),
        "requested_by_name": _person_name(getattr(item, "requested_by", None)),
        "approved_by_name": _person_name(getattr(item, "approved_by", None)),
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


def invoice_lock_query(invoice_id):
    """Query that re-reads an invoice with a row lock (``SELECT ... FOR UPDATE``).

    Every balance check followed by a money write must run under this lock so
    concurrent payments, callbacks, settlements and voids serialize per
    invoice. SQLite ignores ``FOR UPDATE``; Postgres honours it.
    """
    # Lock only the invoices row: Invoice eager-loads relationships through
    # LEFT OUTER JOINs, and Postgres refuses FOR UPDATE on the nullable side of
    # an outer join. lazyload("*") also keeps the locking query small.
    return (
        Invoice.query.options(lazyload("*"))
        .filter(Invoice.id == invoice_id)
        .with_for_update(of=Invoice)
        .execution_options(populate_existing=True)
    )


def lock_invoice(invoice_or_id):
    invoice_id = getattr(invoice_or_id, "id", invoice_or_id)
    invoice = invoice_lock_query(invoice_id).first()
    if invoice is None:
        raise not_found("Invoice not found")
    return invoice


def get_invoice_or_404(invoice_id):
    invoice = Invoice.query.get(invoice_id)
    if invoice is None:
        raise not_found("Invoice not found")
    return invoice


def ready_to_bill_query():
    """Completed visits with no finalized invoice, newest first.

    A draft does not remove the visit from the work-list: the desk opens the
    draft and finalizes it. A finalized (or partially paid, paid or refunded)
    invoice does, until it is voided.
    """
    from app.clinical_records.models import Visit

    finalized = db.session.query(Invoice.visit_id).filter(
        Invoice.visit_id.isnot(None),
        Invoice.status.notin_([InvoiceStatus.VOIDED, InvoiceStatus.DRAFT]),
    )
    return Visit.query.filter(Visit.completed_at.isnot(None), ~Visit.id.in_(finalized)).order_by(
        Visit.completed_at.desc()
    )


def _draft_for_visit(visit):
    clauses = [Invoice.visit_id == visit.id]
    if visit.appointment_id:
        clauses.append(Invoice.appointment_id == visit.appointment_id)
    return (
        Invoice.query.filter(Invoice.status == InvoiceStatus.DRAFT, or_(*clauses))
        .order_by(Invoice.created_at.desc())
        .first()
    )


def serialize_ready_to_bill(visit):
    """Work-list row: who to bill and the charge the encounter bill carries."""
    patient = visit.patient
    doctor_user = getattr(visit.doctor, "user", None) if visit.doctor else None
    draft = _draft_for_visit(visit)
    try:
        default_line = _default_consultation_line(visit)
    except ApiError:
        default_line = None  # unpriced service: the cashier must enter items manually

    if draft is not None and draft.lines:
        if len(draft.lines) == 1:
            line = draft.lines[0]
            expected_line = {
                "description": line.description,
                "unit_price_minor": line.line_total_minor,
            }
        else:
            expected_line = {
                "description": f"{len(draft.lines)} lines",
                "unit_price_minor": draft.total_minor,
            }
    elif default_line is not None:
        expected_line = {
            "description": default_line["description"],
            "unit_price_minor": default_line["unit_price_minor"],
        }
    else:
        expected_line = None

    return {
        "visit_id": str(visit.id),
        "appointment_id": str(visit.appointment_id) if visit.appointment_id else None,
        "completed_at": _iso(_aware(visit.completed_at)),
        "patient": {
            "id": str(visit.patient_id),
            "name": _person_name(patient),
            "number": getattr(patient, "patient_number", None),
            "has_sha_number": bool(getattr(patient, "sha_number", None)),
        },
        "doctor_name": _person_name(doctor_user),
        "department_name": getattr(visit.department, "name", None),
        "expected_line": expected_line,
        "draft_invoice_id": str(draft.id) if draft is not None else None,
        "draft_total_minor": draft.total_minor if draft is not None else None,
        "draft_line_count": len(draft.lines) if draft is not None else 0,
    }


def _default_line_for_appointment(appointment, doctor=None):
    """The single consultation charge for an encounter.

    The service price list is the source of truth. The doctor's consultation
    fee is only the default price for that service when the price list has
    no current price, or the charge when the appointment names no service.
    The two are never billed together.
    """
    from app.scheduling.models import DoctorProfile, Service
    from app.scheduling.service import current_price

    if doctor is None and appointment is not None:
        doctor = DoctorProfile.query.get(appointment.doctor_id)
    doctor_fee = doctor.consultation_fee_minor if doctor is not None else 0

    if appointment is not None and appointment.service_id:
        service = Service.query.get(appointment.service_id)
        if service is None:
            raise not_found("Service not found")
        price = current_price(service.id)
        unit_price = price.amount_minor if price else doctor_fee
        if not unit_price:
            raise bad_request(
                "The visit's service has no current price",
                {"service_id": str(service.id)},
            )
        return {
            "service_id": service.id,
            "description": service.name,
            "quantity": 1,
            "unit_price_minor": unit_price,
        }
    if doctor_fee > 0:
        return {"description": "Consultation", "quantity": 1, "unit_price_minor": doctor_fee}
    return None


def _default_consultation_line(visit):
    from app.scheduling.models import Appointment, DoctorProfile

    appointment = Appointment.query.get(visit.appointment_id) if visit.appointment_id else None
    return _default_line_for_appointment(appointment, DoctorProfile.query.get(visit.doctor_id))


def estimate_appointment_charge_minor(appointment):
    """Expected charge for the encounter bill, used by the check-in badge."""
    try:
        line = _default_line_for_appointment(appointment)
    except ApiError:
        return 0
    if line is None:
        return 0
    return int(line.get("quantity", 1)) * int(line["unit_price_minor"])


def _invoice_line_from_spec(spec):
    quantity = int(spec.get("quantity", 1))
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
    line_total = quantity * int(unit_price)
    return InvoiceLine(
        service_id=service.id if service else None,
        description=spec.get("description") or (service.name if service else "Service"),
        service_code=service.code if service else None,
        quantity=quantity,
        unit_price_minor=int(unit_price),
        line_total_minor=line_total,
    )


def _replace_invoice_lines(invoice, specs):
    invoice.lines.clear()
    db.session.flush()
    for spec in specs:
        invoice.lines.append(_invoice_line_from_spec(spec))
    db.session.flush()


def _recalculate_draft_totals(invoice):
    subtotal = sum(int(line.line_total_minor) for line in invoice.lines)
    if invoice.discount_minor > subtotal:
        raise conflict(
            "The discount would exceed the invoice subtotal",
            {"subtotal_minor": subtotal, "discount_minor": invoice.discount_minor},
        )
    invoice.subtotal_minor = subtotal
    invoice.total_minor = subtotal - invoice.discount_minor
    invoice.amount_paid_minor = 0
    invoice.balance_minor = invoice.total_minor
    db.session.flush()
    if any(item.status != AllocationStatus.VOIDED for item in invoice.allocations):
        rebalance_patient_share(invoice)


def _find_active_invoice_for_appointment(appointment_id):
    return (
        Invoice.query.filter(
            Invoice.appointment_id == appointment_id,
            Invoice.status != InvoiceStatus.VOIDED,
        )
        .order_by(Invoice.created_at.desc())
        .first()
    )


def ensure_draft_invoice_for_appointment(appointment, actor=None, commit=True):
    """Return the encounter bill for an appointment, creating it once.

    The appointment row is locked so concurrent check-ins/finalize fallbacks
    serialize on Postgres. A partial unique index is the database backstop.
    """
    from app.clinical_records.models import Visit
    from app.scheduling.models import Appointment as AppointmentModel
    from app.scheduling.models import DoctorProfile

    db.session.execute(
        db.select(AppointmentModel).where(AppointmentModel.id == appointment.id).with_for_update()
    )
    existing = _find_active_invoice_for_appointment(appointment.id)
    visit = Visit.query.filter_by(appointment_id=appointment.id).first()
    if existing is not None:
        if existing.visit_id is None and visit is not None:
            existing.visit_id = visit.id
            db.session.flush()
        if commit:
            db.session.commit()
        return existing

    invoice = Invoice(
        patient_id=appointment.patient_id,
        appointment_id=appointment.id,
        visit_id=visit.id if visit is not None else None,
        department_id=appointment.department_id,
        issued_by_id=actor.id if actor else None,
        status=InvoiceStatus.DRAFT,
    )
    line = _default_line_for_appointment(
        appointment, DoctorProfile.query.get(appointment.doctor_id)
    )
    if line is not None:
        invoice.lines.append(_invoice_line_from_spec(line))
    invoice.subtotal_minor = sum(int(item.line_total_minor) for item in invoice.lines)
    invoice.discount_minor = 0
    invoice.total_minor = invoice.subtotal_minor
    invoice.amount_paid_minor = 0
    invoice.balance_minor = invoice.total_minor
    db.session.add(invoice)
    db.session.flush()
    record_audit(
        "invoice.draft_create",
        "invoice",
        invoice.id,
        actor=actor,
        after={
            "appointment_id": str(appointment.id),
            "total_minor": invoice.total_minor,
        },
    )
    if commit:
        db.session.commit()
    return invoice


def finalize_invoice(invoice, actor):
    """Assign the number, lock the lines and post the final totals."""
    invoice = lock_invoice(invoice)
    if invoice.status != InvoiceStatus.DRAFT:
        raise conflict(
            "Invoice is already finalized",
            {
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "status": invoice.status.value,
            },
        )
    if not invoice.lines:
        raise bad_request(
            "Invoice requires at least one line item",
            {"items": ["Add a line before finalizing"]},
        )
    subtotal = sum(int(line.line_total_minor) for line in invoice.lines)
    if invoice.discount_minor > subtotal:
        raise conflict(
            "The discount would exceed the invoice subtotal",
            {"subtotal_minor": subtotal, "discount_minor": invoice.discount_minor},
        )
    invoice.subtotal_minor = subtotal
    invoice.total_minor = subtotal - invoice.discount_minor
    invoice.amount_paid_minor = 0
    invoice.balance_minor = invoice.total_minor
    invoice.finalized_at = utcnow()
    invoice.issued_at = invoice.issued_at or invoice.finalized_at
    invoice.invoice_number = next_sequence_value("invoice_number", prefix="INV-{year}-", width=6)
    invoice.status = InvoiceStatus.ISSUED
    db.session.flush()
    recompute_invoice(invoice)
    if any(item.status != AllocationStatus.VOIDED for item in invoice.allocations):
        rebalance_patient_share(invoice)
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
        "invoice.finalize",
        "invoice",
        invoice.id,
        actor=actor,
        after={
            "invoice_number": invoice.invoice_number,
            "total_minor": invoice.total_minor,
            "finalized_at": _iso(_aware(invoice.finalized_at)),
        },
    )
    db.session.commit()
    return invoice


def _find_invoice_for_visit(visit):
    clauses = [Invoice.visit_id == visit.id]
    if visit.appointment_id:
        clauses.append(Invoice.appointment_id == visit.appointment_id)
    return (
        Invoice.query.filter(Invoice.status != InvoiceStatus.VOIDED, or_(*clauses))
        .order_by(Invoice.created_at.desc())
        .first()
    )


def finalize_visit_invoice(visit, data, actor):
    """Finalize a visit's encounter bill, creating the draft when missing."""
    if visit.completed_at is None:
        raise conflict(
            "Complete the visit before invoicing it",
            {"visit_id": str(visit.id)},
        )
    invoice = _find_invoice_for_visit(visit)
    if invoice is not None and invoice.status != InvoiceStatus.DRAFT:
        raise conflict(
            "An invoice already exists for this visit",
            {"invoice_id": str(invoice.id), "invoice_number": invoice.invoice_number},
        )

    if invoice is None:
        if visit.appointment_id:
            from app.scheduling.models import Appointment

            appointment = Appointment.query.get(visit.appointment_id)
            invoice = ensure_draft_invoice_for_appointment(appointment, actor, commit=False)
        else:
            invoice = Invoice(
                patient_id=visit.patient_id,
                visit_id=visit.id,
                department_id=visit.department_id,
                issued_by_id=actor.id if actor else None,
                status=InvoiceStatus.DRAFT,
            )
            line = _default_consultation_line(visit)
            if line is not None:
                invoice.lines.append(_invoice_line_from_spec(line))
            db.session.add(invoice)
            db.session.flush()
            record_audit(
                "invoice.draft_create",
                "invoice",
                invoice.id,
                actor=actor,
                after={"visit_id": str(visit.id)},
            )

    if invoice.visit_id is None:
        invoice.visit_id = visit.id
    if data.get("due_at") and invoice.due_at is None:
        invoice.due_at = data["due_at"]

    line_specs = data.get("items") or []
    if line_specs:
        _replace_invoice_lines(invoice, line_specs)
    elif not invoice.lines:
        line = _default_consultation_line(visit)
        if line is not None:
            invoice.lines.append(_invoice_line_from_spec(line))
    _recalculate_draft_totals(invoice)

    discount = int(data.get("discount_minor") or 0)
    discount_reason = (data.get("discount_reason") or "").strip()
    if discount > invoice.subtotal_minor:
        raise bad_request("Discount cannot exceed subtotal")
    if discount and not discount_reason:
        raise bad_request(
            "A discount requires a reason",
            {"discount_reason": ["Required when discount_minor is set"]},
        )
    if discount:
        _record_discount_request(invoice, discount, discount_reason, actor)

    return finalize_invoice(invoice, actor)


def add_invoice_line(invoice, data, actor):
    invoice = lock_invoice(invoice)
    if invoice.status != InvoiceStatus.DRAFT:
        raise conflict(
            "Only draft invoices can be edited",
            {"invoice_id": str(invoice.id), "status": invoice.status.value},
        )
    line = _invoice_line_from_spec(data)
    invoice.lines.append(line)
    db.session.flush()
    _recalculate_draft_totals(invoice)
    record_audit(
        "invoice.line_add",
        "invoice",
        invoice.id,
        actor=actor,
        after={"description": line.description, "line_total_minor": line.line_total_minor},
    )
    db.session.commit()
    return invoice


def remove_invoice_line(invoice, line_id, actor):
    invoice = lock_invoice(invoice)
    if invoice.status != InvoiceStatus.DRAFT:
        raise conflict(
            "Only draft invoices can be edited",
            {"invoice_id": str(invoice.id), "status": invoice.status.value},
        )
    line = next((item for item in invoice.lines if item.id == line_id), None)
    if line is None:
        raise not_found("Invoice line not found")
    description = line.description
    line_total = line.line_total_minor
    invoice.lines.remove(line)
    db.session.flush()
    _recalculate_draft_totals(invoice)
    record_audit(
        "invoice.line_remove",
        "invoice",
        invoice.id,
        actor=actor,
        before={"description": description, "line_total_minor": line_total},
    )
    db.session.commit()
    return invoice


def create_invoice(visit, data, actor):
    """Compatibility wrapper for the pre-D create-invoice endpoint.

    Deprecated: the desk should finalize the encounter draft. This keeps old
    callers working by ensuring a draft exists and then finalizing it.
    """
    invoice = finalize_visit_invoice(visit, data, actor)
    record_audit(
        "invoice.create",
        "invoice",
        invoice.id,
        actor=actor,
        after={
            "invoice_number": invoice.invoice_number,
            "total_minor": invoice.total_minor,
        },
    )
    db.session.commit()
    return invoice


def discount_needs_approval(subtotal_minor, amount_minor):
    """Above 10% of the subtotal or above KES 1,000 (configurable) needs an admin."""
    percent = current_app.config.get("DISCOUNT_APPROVAL_PERCENT", 10)
    limit = current_app.config.get("DISCOUNT_APPROVAL_MINOR", 100000)
    return amount_minor > limit or amount_minor * 100 > subtotal_minor * percent


def _ensure_discount_allowed(invoice, amount):
    from app.claims.models import Claim  # local: claims imports billing

    if invoice.status in {InvoiceStatus.VOIDED, InvoiceStatus.REFUNDED}:
        raise conflict("Cannot discount a voided or refunded invoice")
    if amount < 0 or amount > invoice.subtotal_minor:
        raise bad_request("Discount must be between zero and the invoice subtotal")
    if invoice.subtotal_minor - amount < invoice.amount_paid_minor:
        raise conflict(
            "The discount would leave the invoice overpaid; refund the difference first",
            {"net_paid_minor": invoice.amount_paid_minor},
        )
    open_claim = Claim.query.filter(
        Claim.invoice_id == invoice.id, Claim.status.in_(OPEN_CLAIM_STATUSES)
    ).first()
    if open_claim is not None:
        raise conflict(
            "Cannot change the discount while a SHA claim is open",
            {"claim_id": str(open_claim.id)},
        )


def _apply_discount(invoice, amount):
    invoice.discount_minor = amount
    invoice.total_minor = invoice.subtotal_minor - amount
    db.session.flush()
    recompute_invoice(invoice)
    if any(item.status != AllocationStatus.VOIDED for item in invoice.allocations):
        rebalance_patient_share(invoice)


def _record_discount_request(invoice, amount, reason, actor):
    """Apply a discount within the threshold, or park it for admin approval."""
    _ensure_discount_allowed(invoice, amount)
    before = {"discount_minor": invoice.discount_minor, "total_minor": invoice.total_minor}
    invoice.discount_reason = reason
    invoice.discount_requested_minor = amount
    invoice.discount_requested_by_id = actor.id if actor else None
    invoice.discount_decided_by_id = None
    invoice.discount_decided_at = None
    if discount_needs_approval(invoice.subtotal_minor, amount):
        invoice.discount_status = DiscountStatus.PENDING_APPROVAL
        alert_admins(
            "discount_approval_alert",
            {
                "invoice_number": invoice.invoice_number,
                "amount": f"{amount / 100:.2f}",
                "reason": reason,
            },
        )
        action = "invoice.discount_request"
    else:
        invoice.discount_status = DiscountStatus.APPLIED
        _apply_discount(invoice, amount)
        action = "invoice.discount_apply"
    record_audit(
        action,
        "invoice",
        invoice.id,
        actor=actor,
        before=before,
        after={
            "requested_minor": amount,
            "reason": reason,
            "status": invoice.discount_status.value,
            "total_minor": invoice.total_minor,
        },
    )


def request_discount(invoice, data, actor):
    invoice = lock_invoice(invoice)
    if invoice.discount_status == DiscountStatus.PENDING_APPROVAL:
        raise conflict("A discount request is already waiting for approval")
    reason = (data.get("reason") or "").strip()
    if not reason:
        raise bad_request("A discount requires a reason", {"reason": ["Required"]})
    _record_discount_request(invoice, int(data["amount_minor"]), reason, actor)
    db.session.commit()
    return invoice


def decide_discount(invoice, data, actor):
    invoice = lock_invoice(invoice)
    if invoice.discount_status != DiscountStatus.PENDING_APPROVAL:
        raise conflict("There is no discount waiting for approval")
    if invoice.discount_requested_by_id == actor.id:
        raise conflict("The requester cannot approve their own discount")
    amount = int(invoice.discount_requested_minor or 0)
    before = {"discount_minor": invoice.discount_minor, "total_minor": invoice.total_minor}
    if data["approve"]:
        # Money or a claim may have arrived since the request; re-check.
        _ensure_discount_allowed(invoice, amount)
        _apply_discount(invoice, amount)
        invoice.discount_status = DiscountStatus.APPLIED
    else:
        invoice.discount_status = DiscountStatus.REJECTED
    invoice.discount_decided_by_id = actor.id
    invoice.discount_decided_at = utcnow()
    record_audit(
        "invoice.discount_decision",
        "invoice",
        invoice.id,
        actor=actor,
        before=before,
        after={
            "approved": bool(data["approve"]),
            "requested_minor": amount,
            "decision_reason": data.get("reason"),
            "total_minor": invoice.total_minor,
        },
    )
    db.session.commit()
    return invoice


def rebalance_patient_share(invoice):
    """Keep the PATIENT allocation equal to what third-party payers do not cover.

    Invariant: patient share = invoice total - active (non-voided) SHA and
    insurance allocations. Call after any payer-mix change (self-pay
    conversion, claim creation, rejection, partial approval, resubmission).
    The caller holds the invoice lock and commits.
    """
    active = [item for item in invoice.allocations if item.status != AllocationStatus.VOIDED]
    third_party = sum(item.amount_minor for item in active if item.payer != AllocationPayer.PATIENT)
    target = max(invoice.total_minor - third_party, 0)
    patient_allocations = [item for item in active if item.payer == AllocationPayer.PATIENT]
    allocation = patient_allocations[0] if patient_allocations else None
    for duplicate in patient_allocations[1:]:
        duplicate.status = AllocationStatus.VOIDED

    if allocation is None:
        if target == 0:
            return None
        allocation = InvoiceAllocation(
            invoice_id=invoice.id, payer=AllocationPayer.PATIENT, amount_minor=target
        )
        invoice.allocations.append(allocation)
        db.session.add(allocation)
        db.session.flush()
    allocation.amount_minor = target
    _refresh_patient_allocation_status(invoice, allocation)
    return allocation


def patient_paid_minor(invoice):
    """Money the patient has paid on the invoice: non-SHA payments less refunds."""
    paid = (
        db.session.query(func.coalesce(func.sum(Transaction.amount_minor), 0))
        .filter(
            Transaction.invoice_id == invoice.id,
            Transaction.status == TransactionStatus.SUCCESS,
            Transaction.method != PaymentMethod.SHA,
        )
        .scalar()
    )
    refunded = (
        db.session.query(func.coalesce(func.sum(Refund.amount_minor), 0))
        .filter(Refund.invoice_id == invoice.id, Refund.status == RefundStatus.COMPLETED)
        .scalar()
    )
    return int(paid) - int(refunded)


def _refresh_patient_allocation_status(invoice, allocation):
    paid = patient_paid_minor(invoice)
    if allocation.amount_minor == 0 and paid <= 0:
        allocation.status = AllocationStatus.VOIDED
    elif paid >= allocation.amount_minor:
        allocation.status = AllocationStatus.PAID
    else:
        allocation.status = AllocationStatus.PENDING


def _active_patient_allocation(invoice):
    return next(
        (
            item
            for item in invoice.allocations
            if item.payer == AllocationPayer.PATIENT and item.status != AllocationStatus.VOIDED
        ),
        None,
    )


def apply_patient_money(invoice, transaction=None):
    """Attribute patient money to the PATIENT allocation and refresh its status.

    Links ``transaction`` (a non-SHA payment) to the invoice's active patient
    allocation, if the invoice has one, so outstanding co-pay can be
    reported. Also call after refunds. No-op for invoices without a payer
    split.
    """
    allocation = _active_patient_allocation(invoice)
    if allocation is None:
        return None
    if transaction is not None and transaction.method != PaymentMethod.SHA:
        transaction.allocation_id = allocation.id
    db.session.flush()
    _refresh_patient_allocation_status(invoice, allocation)
    return allocation


def add_allocation(invoice, data, actor):
    invoice = lock_invoice(invoice)
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
    invoice = lock_invoice(invoice)
    if invoice.status == InvoiceStatus.DRAFT:
        raise conflict(
            "Finalize the invoice before taking payment",
            {"invoice_id": str(invoice.id), "status": invoice.status.value},
        )
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
    apply_patient_money(invoice, transaction)
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
    # A draft keeps its lifecycle status until finalize assigns the number.
    if invoice.status == InvoiceStatus.DRAFT:
        return invoice
    if invoice.status == InvoiceStatus.VOIDED:
        return invoice
    if invoice.total_minor == 0 and net == 0:
        invoice.status = InvoiceStatus.PAID  # fully discounted: nothing to collect
    elif net <= 0:
        invoice.status = InvoiceStatus.REFUNDED if refunded > 0 else InvoiceStatus.ISSUED
    elif net >= invoice.total_minor:
        invoice.status = InvoiceStatus.PAID
    else:
        invoice.status = InvoiceStatus.PARTIALLY_PAID
    return invoice


def create_payment_intent(invoice, data, actor, idempotency_key=None):
    invoice = lock_invoice(invoice)
    if invoice.status == InvoiceStatus.DRAFT:
        raise conflict(
            "Finalize the invoice before taking payment",
            {"invoice_id": str(invoice.id), "status": invoice.status.value},
        )
    if invoice.balance_minor <= 0:
        raise conflict("Invoice is already settled")
    amount = int(data["amount_minor"])
    if amount > invoice.balance_minor:
        raise bad_request("Payment exceeds the outstanding balance")
    if amount % MINOR_UNITS_PER_SHILLING:
        raise bad_request(
            "M-Pesa payments must be in whole shillings",
            {"amount_minor": ["Must be a multiple of 100"]},
        )
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


def _callback_amount_minor(metadata, intent):
    """Amount reported by the Daraja callback, converted from shillings to minor units."""
    reported = metadata.get("Amount")
    return shillings_to_minor(reported) if reported is not None else int(intent.amount_minor)


def _callback_problem(intent, invoice, amount):
    """Why a successful M-Pesa callback cannot be applied automatically, if at all."""
    if invoice is None:
        return "invoice not found"
    if invoice.status in {InvoiceStatus.VOIDED, InvoiceStatus.REFUNDED}:
        return f"invoice is {invoice.status.value.lower()}"
    if amount != int(intent.amount_minor):
        return f"amount {amount} does not match requested {intent.amount_minor}"
    if amount > invoice.balance_minor:
        return "amount exceeds outstanding balance"
    return None


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
        amount = _callback_amount_minor(metadata, intent)
        invoice = invoice_lock_query(intent.invoice_id).first()
        problem = _callback_problem(intent, invoice, amount)
        transaction = Transaction.query.filter_by(reference=receipt).first()
        if transaction is None:
            transaction = Transaction(
                invoice_id=intent.invoice_id,
                payment_intent_id=intent.id,
                method=PaymentMethod.MPESA,
                amount_minor=amount,
                # Money that cannot be applied safely is kept, but parked
                # for manual reconciliation instead of settling the invoice.
                status=TransactionStatus.UNCONFIRMED if problem else TransactionStatus.SUCCESS,
                reference=receipt,
                provider_reference=receipt,
                paid_at=utcnow(),
                notes=(
                    f"Needs reconciliation: {problem}"
                    if problem
                    else "Matched from M-Pesa Daraja callback"
                ),
            )
            db.session.add(transaction)
        if problem:
            intent.status = PaymentIntentStatus.UNCONFIRMED
            alert_admins(
                "mpesa_failed_alert",
                {
                    "checkout_id": checkout_id or "",
                    "invoice_id": str(intent.invoice_id),
                    "status": f"{intent.status.value} ({problem})",
                },
            )
        else:
            intent.status = PaymentIntentStatus.SUCCESS
            invoice.primary_method = PaymentMethod.MPESA
            db.session.flush()
            recompute_invoice(invoice)
            apply_patient_money(invoice, transaction)
            enqueue_event(
                "payment.received",
                "payment_intent",
                intent.id,
                {
                    "payment_intent_id": str(intent.id),
                    "invoice_id": str(intent.invoice_id),
                    "patient_id": str(invoice.patient_id),
                    "amount_minor": amount,
                    "reference": receipt,
                },
            )
    elif result_code in {1032, 1037, 2001}:
        intent.status = PaymentIntentStatus.UNCONFIRMED
        alert_admins(
            "mpesa_failed_alert",
            {
                "checkout_id": checkout_id or "",
                "invoice_id": str(intent.invoice_id),
                "status": intent.status.value,
            },
        )
    else:
        intent.status = PaymentIntentStatus.FAILED
        alert_admins(
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


OPEN_CLAIM_STATUSES = (
    ClaimStatus.DRAFT,
    ClaimStatus.SUBMITTED,
    ClaimStatus.UNDER_REVIEW,
    ClaimStatus.APPROVED,
)


def ensure_invoice_voidable(invoice):
    """An invoice may only be voided once no money or payer claim is attached.

    Collected money must be refunded (or the transaction reversed) and open SHA
    claims cancelled first, otherwise the money or claim would be stranded on a
    dead invoice.
    """
    from app.claims.models import Claim  # local: claims imports billing

    open_claims = Claim.query.filter(
        Claim.invoice_id == invoice.id, Claim.status.in_(OPEN_CLAIM_STATUSES)
    ).all()
    if invoice.amount_paid_minor > 0 or open_claims:
        raise conflict(
            "Refund collected payments and cancel open claims before voiding this invoice",
            {
                "net_paid_minor": invoice.amount_paid_minor,
                "open_claim_ids": [str(claim.id) for claim in open_claims],
            },
        )


def create_void_request(data, actor):
    if not data.get("invoice_id") and not data.get("transaction_id"):
        raise bad_request("invoice_id or transaction_id is required")
    if data.get("invoice_id") and data.get("transaction_id"):
        raise bad_request("Provide only one of invoice_id or transaction_id")
    if data.get("invoice_id"):
        invoice = get_invoice_or_404(data["invoice_id"])
        if invoice.status == InvoiceStatus.VOIDED:
            raise conflict("Invoice is already voided")
        ensure_invoice_voidable(invoice)
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
    invoice = None
    if data["approve"] and item.invoice_id:
        # Re-check under the lock: money may have arrived since the request.
        invoice = lock_invoice(item.invoice_id)
        ensure_invoice_voidable(invoice)
    item.status = VoidRequestStatus.APPROVED if data["approve"] else VoidRequestStatus.REJECTED
    item.reviewed_by_id = actor.id
    item.decision_reason = data.get("reason")
    item.decided_at = utcnow()
    if data["approve"]:
        if invoice is not None:
            invoice.status = InvoiceStatus.VOIDED
            invoice.void_reason = item.reason
            for allocation in invoice.allocations:
                allocation.status = AllocationStatus.VOIDED
        elif item.transaction_id:
            transaction = Transaction.query.get(item.transaction_id)
            if transaction is not None:
                invoice = lock_invoice(transaction.invoice_id)
                transaction.status = TransactionStatus.REVERSED
                recompute_invoice(invoice)
                apply_patient_money(invoice)
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
        invoice = lock_invoice(refund.invoice_id)
        db.session.flush()
        recompute_invoice(invoice)
        apply_patient_money(invoice)
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


def resolve_payment_intent(intent, data, actor):
    invoice = lock_invoice(intent.invoice_id)
    if intent.status not in {
        PaymentIntentStatus.PENDING,
        PaymentIntentStatus.UNCONFIRMED,
    }:
        raise conflict(
            "Only pending or unconfirmed payment intents can be resolved",
            {"payment_intent_id": str(intent.id), "status": intent.status.value},
        )
    transaction = Transaction.query.filter_by(payment_intent_id=intent.id).first()
    if data["resolution"] == "SUCCESS":
        if invoice.status in {
            InvoiceStatus.DRAFT,
            InvoiceStatus.VOIDED,
            InvoiceStatus.REFUNDED,
        }:
            raise conflict(
                f"Cannot accept a payment on a {invoice.status.value.lower()} invoice",
                {"invoice_id": str(invoice.id), "invoice_status": invoice.status.value},
            )
        if int(intent.amount_minor) > int(invoice.balance_minor):
            raise conflict(
                "Payment exceeds the outstanding balance",
                {
                    "amount_minor": int(intent.amount_minor),
                    "balance_minor": int(invoice.balance_minor),
                },
            )
        reference = (
            transaction.reference
            if transaction is not None
            else (f"MANUAL-{intent.id.hex[:12].upper()}")
        )
        if transaction is None:
            transaction = Transaction(
                invoice_id=intent.invoice_id,
                payment_intent_id=intent.id,
                method=PaymentMethod.MPESA,
                amount_minor=intent.amount_minor,
                status=TransactionStatus.SUCCESS,
                reference=reference,
                provider_reference=intent.checkout_request_id,
                paid_at=utcnow(),
                notes="Manually confirmed from the reconciliation queue",
            )
            db.session.add(transaction)
        else:
            transaction.status = TransactionStatus.SUCCESS
            transaction.notes = "Manually accepted at reconciliation"
        intent.status = PaymentIntentStatus.SUCCESS
        invoice.primary_method = PaymentMethod.MPESA
        db.session.flush()
        recompute_invoice(invoice)
        apply_patient_money(invoice, transaction)
        enqueue_event(
            "payment.received",
            "payment_intent",
            intent.id,
            {
                "payment_intent_id": str(intent.id),
                "invoice_id": str(intent.invoice_id),
                "patient_id": str(invoice.patient_id),
                "amount_minor": int(intent.amount_minor),
                "reference": reference,
            },
        )
    else:
        intent.status = PaymentIntentStatus.FAILED
        if transaction is not None and transaction.status == TransactionStatus.UNCONFIRMED:
            transaction.status = TransactionStatus.FAILED
            transaction.notes = "Marked failed at reconciliation"
    record_audit(
        "payment.intent_resolve",
        "payment_intent",
        intent.id,
        actor=actor,
        after={
            "resolution": data["resolution"],
            "status": intent.status.value,
            "notes": data.get("notes"),
        },
    )
    db.session.commit()
    return intent


def resolve_transaction(transaction, data, actor):
    """Settle a parked (UNCONFIRMED) payment from the reconciliation queue.

    Accepting it (SUCCESS) is only allowed when it could have been applied in the
    first place: the invoice is payable and the amount fits the outstanding
    balance. Otherwise the money must be returned to the payer and the
    transaction resolved as FAILED, so a click cannot overpay or pay a voided bill.
    """
    invoice = lock_invoice(transaction.invoice_id)
    if transaction.status != TransactionStatus.UNCONFIRMED:
        raise conflict(
            "Only unconfirmed payments can be resolved",
            {"transaction_id": str(transaction.id), "status": transaction.status.value},
        )
    if data["resolution"] == "SUCCESS":
        if invoice.status in {
            InvoiceStatus.DRAFT,
            InvoiceStatus.VOIDED,
            InvoiceStatus.REFUNDED,
        }:
            raise conflict(
                f"Cannot accept a payment on a {invoice.status.value.lower()} invoice; "
                "return the money to the payer and resolve it as failed",
                {"invoice_id": str(invoice.id), "invoice_status": invoice.status.value},
            )
        if int(transaction.amount_minor) > int(invoice.balance_minor):
            raise conflict(
                "Payment exceeds the outstanding balance; return the money to the payer "
                "and resolve it as failed",
                {
                    "amount_minor": int(transaction.amount_minor),
                    "balance_minor": int(invoice.balance_minor),
                },
            )
        transaction.status = TransactionStatus.SUCCESS
    else:
        transaction.status = TransactionStatus.FAILED
    recompute_invoice(invoice)
    apply_patient_money(
        invoice, transaction if transaction.status == TransactionStatus.SUCCESS else None
    )
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
    """Net cash expected in the drawer for a hospital business day.

    Successful cash payments increase the expected amount; completed refunds
    of cash transactions decrease it. Refunds are counted on the day they were
    approved, not the day the original payment was taken.
    """
    start, end = hospital_day_bounds(business_date)
    received = (
        db.session.query(func.coalesce(func.sum(Transaction.amount_minor), 0))
        .filter(
            Transaction.method == PaymentMethod.CASH,
            Transaction.status == TransactionStatus.SUCCESS,
            Transaction.paid_at >= start,
            Transaction.paid_at < end,
        )
        .scalar()
    )
    refunded = (
        db.session.query(func.coalesce(func.sum(Refund.amount_minor), 0))
        .join(Transaction, Refund.original_transaction_id == Transaction.id)
        .filter(
            Refund.status == RefundStatus.COMPLETED,
            Transaction.method == PaymentMethod.CASH,
            Refund.decided_at >= start,
            Refund.decided_at < end,
        )
        .scalar()
    )
    return int(received) - int(refunded)


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
        alert_admins(
            "cash_variance_alert",
            {
                "business_date": business_date.isoformat(),
                "variance": f"{variance / 100:.2f}",
            },
        )
    db.session.commit()
    return item


def alert_admins(template_key, payload):
    """Queue an in-app notification for every active admin."""

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
    start, end = hospital_day_bounds(business_date)
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
