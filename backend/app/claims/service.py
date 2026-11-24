from app.billing.models import InvoiceAllocation, Transaction
from app.billing.service import (
    OPEN_CLAIM_STATUSES,
    alert_admins,
    estimate_appointment_charge_minor,
    lock_invoice,
    rebalance_patient_share,
    recompute_invoice,
)
from app.claims.models import Claim, ClaimStatusHistory, EligibilityCheck
from app.common.audit import record_audit
from app.common.base import as_utc, utcnow
from app.common.enums import (
    AllocationPayer,
    AllocationStatus,
    ClaimStatus,
    EligibilityStatus,
    InvoiceStatus,
    PaymentMethod,
    TransactionStatus,
)
from app.common.errors import bad_request, conflict, not_found
from app.common.outbox import enqueue_event
from app.extensions import db
from app.integrations.base import ProviderError
from app.integrations.sha import get_sha_gateway

TRANSITIONS = {
    ClaimStatus.DRAFT: {ClaimStatus.SUBMITTED, ClaimStatus.CANCELLED},
    ClaimStatus.SUBMITTED: {
        ClaimStatus.UNDER_REVIEW,
        ClaimStatus.APPROVED,
        ClaimStatus.REJECTED,
        ClaimStatus.CANCELLED,
    },
    ClaimStatus.UNDER_REVIEW: {
        ClaimStatus.APPROVED,
        ClaimStatus.REJECTED,
        ClaimStatus.CANCELLED,
    },
    ClaimStatus.APPROVED: {ClaimStatus.PAID},
    ClaimStatus.REJECTED: set(),
    ClaimStatus.PAID: set(),
    ClaimStatus.CANCELLED: set(),
}


def _iso(value):
    return value.isoformat() if value else None


def serialize_eligibility(check):
    return {
        "id": str(check.id),
        "patient_id": str(check.patient_id),
        "invoice_id": str(check.invoice_id) if check.invoice_id else None,
        "appointment_id": str(check.appointment_id) if check.appointment_id else None,
        "status": check.status.value,
        "coverage_limit_minor": check.coverage_limit_minor,
        "consumed_minor": check.consumed_minor,
        "remaining_coverage_minor": remaining_coverage(check),
        # BIL-8: the UI prompts for another payment method when SHA cannot pay.
        "next_action": "create_claim" if is_claimable(check) else "choose_payment_method",
        "provider": check.provider,
        "provider_reference": check.provider_reference,
        "checked_at": _iso(check.checked_at),
    }


def serialize_claim(claim):
    patient = getattr(claim, "patient", None)
    invoice = getattr(claim, "invoice", None)
    department = getattr(invoice, "department", None) if invoice is not None else None
    return {
        "id": str(claim.id),
        "invoice_id": str(claim.invoice_id),
        "invoice_number": getattr(invoice, "invoice_number", None),
        "patient_name": " ".join(part for part in (patient.first_name, patient.last_name) if part)
        if patient is not None
        else None,
        "patient_number": getattr(patient, "patient_number", None),
        "department_name": getattr(department, "name", None),
        "allocation_id": str(claim.allocation_id) if claim.allocation_id else None,
        "patient_id": str(claim.patient_id),
        "eligibility_check_id": str(claim.eligibility_check_id)
        if claim.eligibility_check_id
        else None,
        "claimed_amount_minor": claim.claimed_amount_minor,
        "approved_amount_minor": claim.approved_amount_minor,
        "currency": claim.currency,
        "status": claim.status.value,
        "external_reference": claim.external_reference,
        "submitted_at": _iso(claim.submitted_at),
        "decided_at": _iso(claim.decided_at),
        "paid_at": _iso(claim.paid_at),
        "rejection_reason": claim.rejection_reason,
        "resubmission_of_id": str(claim.resubmission_of_id) if claim.resubmission_of_id else None,
        "age_days": (utcnow() - as_utc(claim.submitted_at)).days
        if claim.submitted_at and claim.status in {ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW}
        else None,
        "history": [
            {
                "id": str(item.id),
                "from_status": item.from_status.value if item.from_status else None,
                "to_status": item.to_status.value,
                "note": item.note,
                "created_at": _iso(item.created_at),
            }
            for item in claim.history
        ],
    }


def get_claim_or_404(claim_id):
    claim = Claim.query.get(claim_id)
    if claim is None:
        raise not_found("Claim not found")
    return claim


def _resolve_eligibility_subject(subject):
    """Return (invoice, appointment) for an invoice or an appointment."""
    from app.billing.models import Invoice
    from app.scheduling.models import Appointment

    invoice = subject if isinstance(subject, Invoice) else None
    appointment = subject if isinstance(subject, Appointment) else None
    if invoice is not None and appointment is None and invoice.appointment_id:
        appointment = Appointment.query.get(invoice.appointment_id)
    if appointment is not None and invoice is None:
        invoice = Invoice.query.filter_by(
            appointment_id=appointment.id, status=InvoiceStatus.DRAFT
        ).first()
    if invoice is None and appointment is None:
        raise bad_request("An invoice or appointment is required for an eligibility check")
    return invoice, appointment


def run_eligibility_check(subject, member_reference, actor):
    from app.patients.models import PatientProfile

    invoice, appointment = _resolve_eligibility_subject(subject)
    patient_id = invoice.patient_id if invoice is not None else appointment.patient_id
    patient = PatientProfile.query.get(patient_id)
    if patient is None:
        raise not_found("Patient not found")
    member = member_reference or patient.sha_number
    if not member:
        raise bad_request("A SHA member reference is required")
    gateway = get_sha_gateway()
    result = gateway.verify_member(
        member,
        {
            "patient_number": patient.patient_number,
            "date_of_birth": patient.date_of_birth.isoformat() if patient.date_of_birth else None,
        },
    )
    check = EligibilityCheck(
        patient_id=patient.id,
        invoice_id=invoice.id if invoice is not None else None,
        appointment_id=appointment.id if appointment is not None else None,
        sha_member_reference=member,
        status=result["status"],
        coverage_limit_minor=result.get("coverage_limit_minor"),
        consumed_minor=result.get("consumed_minor"),
        provider="simulated",
        provider_reference=result.get("provider_reference"),
        raw_response=result.get("raw") or {},
        checked_by_id=actor.id if actor else None,
    )
    db.session.add(check)
    record_audit(
        "claim.eligibility_check",
        "eligibility_check",
        check.id,
        actor=actor,
        after={
            "status": check.status.value,
            "appointment_id": str(appointment.id) if appointment is not None else None,
        },
    )
    db.session.flush()
    if invoice is not None and not is_claimable(check):
        convert_to_self_pay(invoice, check, actor)
    db.session.commit()
    return check


def _record_failed_eligibility(patient, invoice, appointment, member, actor, error):
    """Store an UNKNOWN check when the provider fails; never block check-in."""
    check = EligibilityCheck(
        patient_id=patient.id,
        invoice_id=invoice.id if invoice is not None else None,
        appointment_id=appointment.id if appointment is not None else None,
        sha_member_reference=member,
        status=EligibilityStatus.UNKNOWN,
        coverage_limit_minor=None,
        consumed_minor=None,
        provider="simulated",
        provider_reference=None,
        raw_response={
            "error": str(error),
            "error_class": getattr(error, "error_class", "provider_error"),
            "appointment_id": str(appointment.id),
        },
        checked_by_id=actor.id if actor else None,
    )
    db.session.add(check)
    record_audit(
        "claim.eligibility_check",
        "eligibility_check",
        check.id,
        actor=actor,
        after={
            "status": EligibilityStatus.UNKNOWN.value,
            "error_class": getattr(error, "error_class", "provider_error"),
            "appointment_id": str(appointment.id),
        },
    )
    db.session.commit()
    return check


def ensure_check_in_eligibility(appointment, actor):
    """Run eligibility at check-in once; provider failure returns UNKNOWN."""
    from app.billing.models import Invoice
    from app.patients.models import PatientProfile

    existing = (
        EligibilityCheck.query.filter_by(appointment_id=appointment.id)
        .order_by(EligibilityCheck.checked_at.desc(), EligibilityCheck.created_at.desc())
        .first()
    )
    if existing is not None:
        return existing
    patient = PatientProfile.query.get(appointment.patient_id)
    if patient is None:
        return None
    member = patient.sha_number
    if not member:
        return None
    invoice = Invoice.query.filter_by(
        appointment_id=appointment.id, status=InvoiceStatus.DRAFT
    ).first()
    try:
        return run_eligibility_check(invoice or appointment, member, actor)
    except ProviderError as error:
        return _record_failed_eligibility(patient, invoice, appointment, member, actor, error)


def _latest_checks_for_appointments(appointment_ids):
    if not appointment_ids:
        return {}
    checks = (
        EligibilityCheck.query.filter(EligibilityCheck.appointment_id.in_(appointment_ids))
        .order_by(EligibilityCheck.checked_at.desc(), EligibilityCheck.created_at.desc())
        .all()
    )
    latest = {}
    for check in checks:
        latest.setdefault(check.appointment_id, check)
    return latest


def _drafts_for_appointments(appointment_ids):
    from app.billing.models import Invoice

    if not appointment_ids:
        return {}
    invoices = (
        Invoice.query.filter(
            Invoice.appointment_id.in_(appointment_ids),
            Invoice.status == InvoiceStatus.DRAFT,
        )
        .order_by(Invoice.created_at.desc())
        .all()
    )
    drafts = {}
    for invoice in invoices:
        drafts.setdefault(invoice.appointment_id, invoice)
    return drafts


def payer_summary(appointment, check=None, invoice=None):
    """Payer badge and co-pay due for a checked-in appointment.

    The co-pay is an estimate based on the encounter draft and remaining SHA
    cover; the final claim may change it. This is display-only.
    """
    from app.patients.models import PatientProfile

    patient = getattr(appointment, "patient", None)
    if patient is None:
        patient = PatientProfile.query.get(appointment.patient_id)
    estimated = (
        int(invoice.total_minor)
        if invoice is not None
        else estimate_appointment_charge_minor(appointment)
    )

    sha_number = getattr(patient, "sha_number", None) if patient is not None else None
    if sha_number:
        status = check.status if check is not None else None
        labels = {
            EligibilityStatus.ACTIVE: "SHA · Active",
            EligibilityStatus.INACTIVE: "SHA · Inactive",
            EligibilityStatus.LIMIT_EXHAUSTED: "SHA · Limit exhausted",
            EligibilityStatus.UNKNOWN: "SHA · Unverified",
        }
        label = labels.get(status, "SHA · Not checked")
        remaining = remaining_coverage(check) if check is not None else None
        if check is not None and is_claimable(check):
            copay = 0 if remaining is None else max(estimated - remaining, 0)
        else:
            copay = estimated
        return {
            "type": "SHA",
            "label": label,
            "eligibility_status": status.value if status is not None else None,
            "eligibility_check_id": str(check.id) if check is not None else None,
            "remaining_coverage_minor": remaining,
            "estimated_total_minor": estimated,
            "copay_due_minor": copay,
        }

    insurance = getattr(patient, "insurance_provider", None) if patient is not None else None
    if insurance:
        return {
            "type": "INSURANCE",
            "label": insurance,
            "eligibility_status": None,
            "eligibility_check_id": None,
            "remaining_coverage_minor": None,
            "estimated_total_minor": estimated,
            "copay_due_minor": estimated,
        }
    return {
        "type": "CASH",
        "label": "Cash",
        "eligibility_status": None,
        "eligibility_check_id": None,
        "remaining_coverage_minor": None,
        "estimated_total_minor": estimated,
        "copay_due_minor": estimated,
    }


def payer_summaries_for_appointments(appointments):
    appointment_ids = [item.id for item in appointments]
    checks = _latest_checks_for_appointments(appointment_ids)
    drafts = _drafts_for_appointments(appointment_ids)
    return {
        str(item.id): payer_summary(item, checks.get(item.id), drafts.get(item.id))
        for item in appointments
    }


def remaining_coverage(check):
    """Unused SHA cover from an eligibility check; None means no stated limit."""
    if check.coverage_limit_minor is None:
        return None
    return max(int(check.coverage_limit_minor) - int(check.consumed_minor or 0), 0)


def is_claimable(check):
    return check.status == EligibilityStatus.ACTIVE and remaining_coverage(check) != 0


def convert_to_self_pay(invoice, check, actor):
    """BIL-8: SHA cannot pay, so the outstanding amount becomes the patient's.

    Voids pending SHA allocations that no open claim is using, marks the
    invoice self-pay and moves the share to the PATIENT allocation. The
    caller commits.
    """
    invoice = lock_invoice(invoice)
    claimed_allocation_ids = {
        claim.allocation_id
        for claim in Claim.query.filter(
            Claim.invoice_id == invoice.id, Claim.status.in_(OPEN_CLAIM_STATUSES)
        )
    }
    voided = []
    for allocation in invoice.allocations:
        if (
            allocation.payer == AllocationPayer.SHA
            and allocation.status == AllocationStatus.PENDING
            and allocation.id not in claimed_allocation_ids
        ):
            allocation.status = AllocationStatus.VOIDED
            voided.append(str(allocation.id))
    if invoice.status not in {InvoiceStatus.PAID, InvoiceStatus.VOIDED}:
        invoice.primary_method = PaymentMethod.SELF_PAY
    patient_allocation = rebalance_patient_share(invoice)
    record_audit(
        "invoice.self_pay_conversion",
        "invoice",
        invoice.id,
        actor=actor,
        after={
            "eligibility_check_id": str(check.id),
            "eligibility_status": check.status.value,
            "voided_sha_allocation_ids": voided,
            "patient_share_minor": patient_allocation.amount_minor if patient_allocation else 0,
        },
    )
    return invoice


def _ensure_no_open_claim(invoice):
    open_claim = Claim.query.filter(
        Claim.invoice_id == invoice.id, Claim.status.in_(OPEN_CLAIM_STATUSES)
    ).first()
    if open_claim is not None:
        raise conflict(
            "This invoice already has an open SHA claim",
            {"claim_id": str(open_claim.id), "status": open_claim.status.value},
        )


def _validate_claim_amount(invoice, amount):
    """A claim may cover at most what is still owed on the invoice."""
    if amount <= 0:
        raise bad_request("Claim amount must be greater than zero")
    if amount > invoice.balance_minor:
        raise bad_request(
            "Claim amount exceeds the outstanding balance",
            {"balance_minor": invoice.balance_minor},
        )


def create_claim(invoice, data, actor):
    if invoice.status == InvoiceStatus.DRAFT:
        raise conflict(
            "Finalize the invoice before creating a claim",
            {"invoice_id": str(invoice.id), "status": invoice.status.value},
        )
    if invoice.status == InvoiceStatus.VOIDED:
        raise conflict("Cannot create a claim for a voided invoice")
    if invoice.status == InvoiceStatus.PAID:
        raise conflict("Invoice is already settled")

    check = None
    if data.get("eligibility_check_id"):
        check = EligibilityCheck.query.get(data["eligibility_check_id"])
        if check is None:
            raise not_found("Eligibility check not found")
        if check.invoice_id != invoice.id:
            raise bad_request("Eligibility check belongs to a different invoice")
        if not is_claimable(check):
            convert_to_self_pay(invoice, check, actor)
            db.session.commit()
    if check is None:
        check = run_eligibility_check(invoice, data.get("member_reference"), actor)
    if not is_claimable(check):
        # The conversion to self-pay is already committed; the error tells the
        # UI to collect the patient share by another method (BIL-8).
        raise conflict(
            "SHA cannot cover this invoice; collect payment by another method",
            {
                "eligibility_check_id": str(check.id),
                "status": check.status.value,
                "remaining_coverage_minor": remaining_coverage(check),
                "next_action": "choose_payment_method",
            },
        )

    # Eligibility checks commit, so take the lock only after them.
    invoice = lock_invoice(invoice)
    _ensure_no_open_claim(invoice)
    amount = data.get("amount_minor")
    if amount is None:
        sha_allocation = next(
            (
                item
                for item in invoice.allocations
                if item.payer == AllocationPayer.SHA and item.status != AllocationStatus.VOIDED
            ),
            None,
        )
        amount = sha_allocation.amount_minor if sha_allocation else invoice.balance_minor
    cover = remaining_coverage(check)
    if cover is not None and amount > cover:
        # BIL-7: SHA pays up to the remaining cover; the rest is the patient's co-pay.
        amount = cover
    _validate_claim_amount(invoice, amount)

    allocation = next(
        (
            item
            for item in invoice.allocations
            if item.payer == AllocationPayer.SHA and item.status != AllocationStatus.VOIDED
        ),
        None,
    )
    if allocation is None:
        allocation = InvoiceAllocation(
            invoice_id=invoice.id,
            payer=AllocationPayer.SHA,
            amount_minor=amount,
        )
        invoice.allocations.append(allocation)
        db.session.add(allocation)
        db.session.flush()
    else:
        allocation.amount_minor = amount
        allocation.status = AllocationStatus.PENDING
    rebalance_patient_share(invoice)

    gateway = get_sha_gateway()
    result = gateway.submit_claim(
        {
            "member_reference": check.sha_member_reference,
            "invoice_number": invoice.invoice_number,
            "amount_minor": amount,
            "currency": invoice.currency,
        }
    )
    claim = Claim(
        invoice_id=invoice.id,
        allocation_id=allocation.id,
        patient_id=invoice.patient_id,
        eligibility_check_id=check.id,
        sha_member_reference=check.sha_member_reference,
        claimed_amount_minor=amount,
        status=ClaimStatus.SUBMITTED,
        external_reference=result.get("external_reference"),
        submitted_at=utcnow(),
        created_by_id=actor.id if actor else None,
    )
    db.session.add(claim)
    db.session.flush()
    db.session.add(
        ClaimStatusHistory(
            claim_id=claim.id,
            from_status=None,
            to_status=ClaimStatus.SUBMITTED,
            actor_id=actor.id if actor else None,
            note="Claim submitted",
        )
    )
    invoice.primary_method = PaymentMethod.SHA
    enqueue_event(
        "claim.submitted",
        "claim",
        claim.id,
        {
            "claim_id": str(claim.id),
            "invoice_id": str(invoice.id),
            "amount_minor": amount,
        },
    )
    record_audit(
        "claim.create",
        "claim",
        claim.id,
        actor=actor,
        after={"amount_minor": amount, "status": claim.status.value},
    )
    db.session.commit()
    return claim


def _settle_claim(claim, actor, external_reference=None):
    invoice = lock_invoice(claim.invoice_id)
    existing = Transaction.query.filter_by(
        reference=claim.external_reference or f"CLAIM-{claim.id}"
    ).first()
    if existing is None:
        transaction = Transaction(
            invoice_id=claim.invoice_id,
            allocation_id=claim.allocation_id,
            method=PaymentMethod.SHA,
            amount_minor=claim.approved_amount_minor or claim.claimed_amount_minor,
            status=TransactionStatus.SUCCESS,
            reference=claim.external_reference or f"CLAIM-{claim.id}",
            provider_reference=external_reference or claim.external_reference,
            recorded_by_id=actor.id if actor else None,
            paid_at=utcnow(),
            notes="SHA claim settlement",
        )
        db.session.add(transaction)
    if claim.allocation_id:
        allocation = InvoiceAllocation.query.get(claim.allocation_id)
        if allocation is not None:
            allocation.status = AllocationStatus.PAID
    db.session.flush()
    recompute_invoice(invoice)


def _apply_claim_outcome(claim, actor):
    """Move whatever SHA will not pay onto the patient's share.

    Rejected or cancelled claims release the SHA allocation; an approval or
    payment below the claimed amount shrinks it to the approved amount. The
    patient allocation is rebalanced and billing is alerted when the
    patient now owes more.
    """
    if claim.allocation_id is None:
        return
    invoice = lock_invoice(claim.invoice_id)
    allocation = InvoiceAllocation.query.get(claim.allocation_id)
    if allocation is None:
        return
    if claim.status in {ClaimStatus.REJECTED, ClaimStatus.CANCELLED}:
        allocation.status = AllocationStatus.VOIDED
    elif claim.status in {ClaimStatus.APPROVED, ClaimStatus.PAID}:
        allocation.amount_minor = claim.approved_amount_minor
    else:
        return
    before = next(
        (
            item.amount_minor
            for item in invoice.allocations
            if item.payer == AllocationPayer.PATIENT and item.status != AllocationStatus.VOIDED
        ),
        0,
    )
    patient_allocation = rebalance_patient_share(invoice)
    after = patient_allocation.amount_minor if patient_allocation else 0
    if after > before:
        alert_admins(
            "claim_patient_share_alert",
            {
                "claim_id": str(claim.id),
                "status": claim.status.value,
                "invoice_number": invoice.invoice_number,
                "patient_share": f"{after / 100:.2f}",
            },
        )
        record_audit(
            "invoice.patient_share_increase",
            "invoice",
            invoice.id,
            actor=actor,
            before={"patient_share_minor": before},
            after={
                "patient_share_minor": after,
                "claim_id": str(claim.id),
                "claim_status": claim.status.value,
            },
        )


def transition_claim(claim, data, actor):
    new_status = data["status"]
    if new_status == claim.status:
        return claim
    if new_status not in TRANSITIONS.get(claim.status, set()):
        raise conflict(f"Cannot move claim from {claim.status.value} to {new_status.value}")
    previous = claim.status
    claim.status = new_status
    if new_status == ClaimStatus.APPROVED:
        approved = (
            data.get("approved_amount_minor")
            if data.get("approved_amount_minor") is not None
            else claim.claimed_amount_minor
        )
        if approved > claim.claimed_amount_minor:
            raise bad_request("Approved amount cannot exceed the claimed amount")
        claim.approved_amount_minor = approved
        claim.decided_at = utcnow()
    if new_status == ClaimStatus.REJECTED:
        claim.rejection_reason = data.get("rejection_reason") or data.get("note")
        claim.decided_at = utcnow()
    if new_status == ClaimStatus.PAID:
        claim.paid_at = utcnow()
        if claim.approved_amount_minor is None:
            claim.approved_amount_minor = claim.claimed_amount_minor
        _settle_claim(claim, actor, data.get("external_reference"))
    _apply_claim_outcome(claim, actor)
    if data.get("external_reference"):
        claim.external_reference = data["external_reference"]
    db.session.add(
        ClaimStatusHistory(
            claim_id=claim.id,
            from_status=previous,
            to_status=new_status,
            actor_id=actor.id if actor else None,
            note=data.get("note"),
        )
    )
    record_audit(
        "claim.status_change",
        "claim",
        claim.id,
        actor=actor,
        before={"status": previous.value},
        after={"status": new_status.value},
    )
    db.session.commit()
    return claim


def resubmit_claim(claim, data, actor):
    if claim.status != ClaimStatus.REJECTED:
        raise conflict("Only rejected claims can be resubmitted")
    invoice = lock_invoice(claim.invoice_id)
    if invoice.status == InvoiceStatus.VOIDED:
        raise conflict("Cannot resubmit a claim for a voided invoice")
    _ensure_no_open_claim(invoice)
    amount = data.get("amount_minor") or claim.claimed_amount_minor
    _validate_claim_amount(invoice, amount)
    gateway = get_sha_gateway()
    result = gateway.submit_claim(
        {
            "member_reference": claim.sha_member_reference,
            "invoice_number": invoice.invoice_number,
            "amount_minor": amount,
            "currency": claim.currency,
            "resubmission": True,
        }
    )
    if claim.allocation_id:
        allocation = InvoiceAllocation.query.get(claim.allocation_id)
        if allocation is not None:
            allocation.amount_minor = amount
            allocation.status = AllocationStatus.PENDING
            rebalance_patient_share(invoice)
    replacement = Claim(
        invoice_id=claim.invoice_id,
        allocation_id=claim.allocation_id,
        patient_id=claim.patient_id,
        eligibility_check_id=claim.eligibility_check_id,
        sha_member_reference=claim.sha_member_reference,
        claimed_amount_minor=amount,
        status=ClaimStatus.SUBMITTED,
        external_reference=result.get("external_reference"),
        submitted_at=utcnow(),
        resubmission_of_id=claim.id,
        created_by_id=actor.id if actor else None,
    )
    db.session.add(replacement)
    db.session.flush()
    db.session.add(
        ClaimStatusHistory(
            claim_id=replacement.id,
            from_status=None,
            to_status=ClaimStatus.SUBMITTED,
            actor_id=actor.id if actor else None,
            note=data.get("note") or "Resubmitted after rejection",
        )
    )
    enqueue_event(
        "claim.resubmitted",
        "claim",
        replacement.id,
        {
            "claim_id": str(replacement.id),
            "original_claim_id": str(claim.id),
        },
    )
    record_audit(
        "claim.resubmit",
        "claim",
        replacement.id,
        actor=actor,
        before={"claim_id": str(claim.id)},
    )
    db.session.commit()
    return replacement


def aging_report():
    now = utcnow()
    open_claims = Claim.query.filter(
        Claim.status.in_([ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW])
    ).all()
    buckets = {"current": [], "14_days": [], "30_days": [], "60_days": []}
    for claim in open_claims:
        age = (now - as_utc(claim.submitted_at)).days if claim.submitted_at else 0
        if age >= 60:
            buckets["60_days"].append((claim, age))
        elif age >= 30:
            buckets["30_days"].append((claim, age))
        elif age >= 14:
            buckets["14_days"].append((claim, age))
        else:
            buckets["current"].append((claim, age))
    all_claims = Claim.query.all()
    by_status = {}
    for claim in all_claims:
        by_status[claim.status.value] = by_status.get(claim.status.value, 0) + 1
    decided = by_status.get(ClaimStatus.APPROVED.value, 0) + by_status.get(
        ClaimStatus.PAID.value, 0
    )
    rejected = by_status.get(ClaimStatus.REJECTED.value, 0)
    total_decided = decided + rejected
    paid_days = [
        (as_utc(claim.paid_at) - as_utc(claim.submitted_at)).days
        for claim in all_claims
        if claim.paid_at and claim.submitted_at
    ]
    payload = {
        "total_claims": len(all_claims),
        "by_status": by_status,
        "aging_buckets": {key: len(items) for key, items in buckets.items()},
        "approval_rate": round(decided / total_decided, 4) if total_decided else None,
        "average_days_to_payment": round(sum(paid_days) / len(paid_days), 2) if paid_days else None,
    }
    for key, items in buckets.items():
        payload[key] = {
            "count": len(items),
            "claims": [
                {
                    "claim_id": str(claim.id),
                    "invoice_id": str(claim.invoice_id),
                    "status": claim.status.value,
                    "age_days": age,
                    "claimed_amount_minor": claim.claimed_amount_minor,
                }
                for claim, age in items
            ],
        }
    return payload


def handle_sha_callback(payload):
    reference = payload.get("claim_reference") or payload.get("reference")
    claim = Claim.query.filter_by(external_reference=reference).first()
    if claim is None:
        raise not_found("Claim not found")
    gateway = get_sha_gateway()
    new_status = gateway.normalize_status(payload.get("status"))
    return transition_claim(
        claim,
        {
            "status": new_status,
            "approved_amount_minor": payload.get("approved_amount_minor"),
            "rejection_reason": payload.get("rejection_reason"),
            "note": payload.get("note") or "Provider status update",
        },
        None,
    )
