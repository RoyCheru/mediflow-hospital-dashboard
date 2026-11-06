from app.billing.models import Invoice, InvoiceAllocation, Transaction
from app.billing.service import recompute_invoice
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
        "status": check.status.value,
        "coverage_limit_minor": check.coverage_limit_minor,
        "consumed_minor": check.consumed_minor,
        "provider": check.provider,
        "provider_reference": check.provider_reference,
        "checked_at": _iso(check.checked_at),
    }


def serialize_claim(claim):
    return {
        "id": str(claim.id),
        "invoice_id": str(claim.invoice_id),
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


def run_eligibility_check(invoice, member_reference, actor):
    from app.patients.models import PatientProfile

    patient = PatientProfile.query.get(invoice.patient_id)
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
        invoice_id=invoice.id,
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
        after={"status": check.status.value},
    )
    db.session.commit()
    return check


def create_claim(invoice, data, actor):
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
    if check is None:
        check = run_eligibility_check(invoice, data.get("member_reference"), actor)
    if check.status != EligibilityStatus.ACTIVE:
        raise conflict(
            "SHA member is not eligible for a claim",
            {
                "eligibility_check_id": str(check.id),
                "status": check.status.value,
            },
        )

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
    if amount <= 0:
        raise bad_request("Claim amount must be greater than zero")
    if amount > invoice.total_minor:
        raise bad_request("Claim amount exceeds invoice total")

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
        db.session.add(allocation)
        db.session.flush()

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
    invoice = Invoice.query.get(claim.invoice_id)
    if invoice is not None:
        db.session.flush()
        recompute_invoice(invoice)


def transition_claim(claim, data, actor):
    new_status = data["status"]
    if new_status == claim.status:
        return claim
    if new_status not in TRANSITIONS.get(claim.status, set()):
        raise conflict(f"Cannot move claim from {claim.status.value} to {new_status.value}")
    previous = claim.status
    claim.status = new_status
    if new_status == ClaimStatus.APPROVED:
        claim.approved_amount_minor = (
            data.get("approved_amount_minor")
            if data.get("approved_amount_minor") is not None
            else claim.claimed_amount_minor
        )
        claim.decided_at = utcnow()
    if new_status == ClaimStatus.REJECTED:
        claim.rejection_reason = data.get("rejection_reason") or data.get("note")
        claim.decided_at = utcnow()
    if new_status == ClaimStatus.PAID:
        claim.paid_at = utcnow()
        if claim.approved_amount_minor is None:
            claim.approved_amount_minor = claim.claimed_amount_minor
        _settle_claim(claim, actor, data.get("external_reference"))
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
    invoice = Invoice.query.get(claim.invoice_id)
    if invoice is None:
        raise not_found("Invoice not found")
    amount = data.get("amount_minor") or claim.claimed_amount_minor
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
        age = (now - claim.submitted_at).days if claim.submitted_at else 0
        if age >= 60:
            buckets["60_days"].append((claim, age))
        elif age >= 30:
            buckets["30_days"].append((claim, age))
        elif age >= 14:
            buckets["14_days"].append((claim, age))
        else:
            buckets["current"].append((claim, age))
    return {
        key: {
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
        for key, items in buckets.items()
    }


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
