"""Invoice lifecycle (BIL-16, BIL-17): allowed state transitions and the single
"is this invoice payable?" guard used by every payment path.

Target states map to the stored values as: draft = DRAFT, finalized = ISSUED,
partially_paid = PARTIALLY_PAID, paid = PAID, voided = VOIDED. REFUNDED is the
existing state for money returned after payment.
"""

from app.common.enums import InvoiceStatus
from app.common.errors import ApiError, conflict

S = InvoiceStatus

# Which status may follow which. Payment states move both ways because refunds
# reduce the amount paid; DRAFT is left only by finalization or voiding.
ALLOWED_TRANSITIONS = {
    S.DRAFT: {S.ISSUED, S.VOIDED},
    S.ISSUED: {S.PARTIALLY_PAID, S.PAID, S.REFUNDED, S.VOIDED},
    S.PARTIALLY_PAID: {S.ISSUED, S.PAID, S.REFUNDED},
    S.PAID: {S.PARTIALLY_PAID, S.REFUNDED},
    S.REFUNDED: {S.VOIDED},  # money returned in full, then the invoice is voided
    S.VOIDED: set(),
}

PAYABLE_STATUSES = {S.ISSUED, S.PARTIALLY_PAID}


def set_invoice_status(invoice, new_status):
    """The only way invoice status changes; refuses transitions not in the table."""
    current = invoice.status
    if current == new_status:
        return invoice
    if current is not None and new_status not in ALLOWED_TRANSITIONS.get(current, set()):
        raise conflict(
            f"An invoice cannot move from {current.value} to {new_status.value}",
            {"code": "INVALID_INVOICE_TRANSITION", "from": current.value, "to": new_status.value},
        )
    invoice.status = new_status
    return invoice


class InvoiceNotPayable(ApiError):
    """409 INVOICE_NOT_PAYABLE. The error handler rolls the request back, then
    audit-logs the rejected attempt (see register_error_handlers)."""

    def __init__(self, invoice, action, reason):
        super().__init__(
            409,
            "INVOICE_NOT_PAYABLE",
            reason,
            {
                "invoice_id": str(invoice.id),
                "invoice_status": invoice.status.value,
                "action": action,
            },
        )
        self.audit = {
            "action": "invoice.payment_rejected",
            "entity_type": "invoice",
            "entity_id": invoice.id,
            "after": {"attempted": action, "status": invoice.status.value, "reason": reason},
        }


def encounter_of(invoice):
    """(visit, appointment) the invoice bills; either may be None."""
    from app.clinical_records.models import Visit
    from app.extensions import db
    from app.scheduling.models import Appointment

    visit = db.session.get(Visit, invoice.visit_id) if invoice.visit_id else None
    if visit is None and invoice.appointment_id:
        visit = Visit.query.filter_by(appointment_id=invoice.appointment_id).first()
    appointment_id = invoice.appointment_id or (visit.appointment_id if visit else None)
    appointment = db.session.get(Appointment, appointment_id) if appointment_id else None
    return visit, appointment


def payable_problem(invoice):
    """Why money cannot be taken against this invoice, or None when it can.

    Payable means finalized (or partially paid) and, when the invoice belongs to
    an encounter, that encounter's visit is completed. An invoice tied to an
    appointment whose patient was never seen is not payable.
    """
    if invoice is None:
        return "Invoice not found"
    if invoice.status == S.DRAFT:
        return "Awaiting visit completion: the invoice is still a draft"
    if invoice.status not in PAYABLE_STATUSES:
        return f"The invoice is {invoice.status.value.lower().replace('_', ' ')}"
    visit, appointment = encounter_of(invoice)
    if visit is not None and visit.completed_at is None:
        return "The visit is not completed"
    if visit is None and appointment is not None:
        return "The patient has not been seen: no completed visit for this appointment"
    return None


def ensure_payable(invoice, action, hint=None):
    """Single guard for every payment path (cash, card, bank, M-Pesa, SHA claims,
    payer allocations, reconciliation). Raises InvoiceNotPayable (409); ``hint``
    is appended to the message (e.g. what to do with money already received)."""
    problem = payable_problem(invoice)
    if problem:
        raise InvoiceNotPayable(invoice, action, f"{problem}. {hint}" if hint else problem)
    return invoice


def invoice_rule_violations():
    """Read-only report of existing invoices that break BIL-16/17.

    Nothing is changed: rows are listed for a person to review. Categories:
    money recorded on a draft, money recorded or still collectable while the
    visit is not completed (or the patient was never seen), a non-draft invoice
    without an official number, and open drafts of cancelled/no-show
    appointments.
    """
    from sqlalchemy import func

    from app.billing.models import Invoice, Transaction
    from app.common.enums import AppointmentStatus, TransactionStatus
    from app.extensions import db

    paid_by_invoice = dict(
        db.session.query(Transaction.invoice_id, func.sum(Transaction.amount_minor))
        .filter(Transaction.status == TransactionStatus.SUCCESS)
        .group_by(Transaction.invoice_id)
        .all()
    )
    rows = []

    def add(invoice, rule, detail):
        rows.append(
            {
                "rule": rule,
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "status": invoice.status.value,
                "patient_id": str(invoice.patient_id),
                "amount_paid_minor": int(paid_by_invoice.get(invoice.id, 0) or 0),
                "detail": detail,
            }
        )

    for invoice in Invoice.query.order_by(Invoice.created_at).all():
        paid = int(paid_by_invoice.get(invoice.id, 0) or 0)
        visit, appointment = encounter_of(invoice)
        not_seen = visit is None and appointment is not None
        visit_open = visit is not None and visit.completed_at is None
        if invoice.status == S.DRAFT:
            if paid:
                add(invoice, "payment_on_draft", "Successful payments recorded on a draft")
            if appointment is not None and appointment.status in {
                AppointmentStatus.CANCELLED,
                AppointmentStatus.NO_SHOW,
            }:
                add(
                    invoice,
                    "open_draft_for_unseen_appointment",
                    f"Draft still open for a {appointment.status.value.lower()} appointment",
                )
            continue
        if invoice.status == S.VOIDED:
            continue
        if not invoice.invoice_number:
            add(invoice, "finalized_without_number", "Non-draft invoice has no official number")
        if visit_open or not_seen:
            reason = "visit not completed" if visit_open else "patient never seen (no visit)"
            if paid:
                add(invoice, "payment_before_visit_completed", f"Payments recorded; {reason}")
            elif invoice.status in PAYABLE_STATUSES:
                add(invoice, "payable_before_visit_completed", f"Awaiting payment; {reason}")
    return rows
