from flask import Blueprint, request

from app.billing.service import get_invoice_or_404
from app.claims import service
from app.claims.models import Claim
from app.claims.schemas import (
    ClaimCreateSchema,
    ClaimResubmissionSchema,
    ClaimStatusSchema,
    EligibilityCheckSchema,
)
from app.common.decorators import auth_required, current_user
from app.common.enums import Role
from app.common.errors import forbidden
from app.common.pagination import paginated
from app.common.responses import created, ok

bp = Blueprint("claims", __name__)

BILLING = (Role.RECEPTIONIST, Role.CASHIER, Role.ADMIN)


@bp.post("/invoices/<uuid:invoice_id>/claims/eligibility-check")
@auth_required(*BILLING)
def eligibility_check(invoice_id):
    invoice = get_invoice_or_404(invoice_id)
    data = EligibilityCheckSchema().load(request.get_json(silent=True) or {})
    check = service.run_eligibility_check(invoice, data.get("member_reference"), current_user())
    return created(service.serialize_eligibility(check))


@bp.post("/invoices/<uuid:invoice_id>/claims")
@auth_required(*BILLING)
def create_claim(invoice_id):
    invoice = get_invoice_or_404(invoice_id)
    data = ClaimCreateSchema().load(request.get_json(silent=True) or {})
    claim = service.create_claim(invoice, data, current_user())
    return created(service.serialize_claim(claim))


@bp.get("/invoices/<uuid:invoice_id>/claims")
@auth_required(Role.DOCTOR, *BILLING)
def invoice_claims(invoice_id):
    invoice = get_invoice_or_404(invoice_id)
    items = Claim.query.filter_by(invoice_id=invoice.id).order_by(Claim.created_at.desc())
    return ok({"items": [service.serialize_claim(item) for item in items.all()]})


@bp.get("/claims/aging")
@auth_required(*BILLING)
def aging():
    return ok(service.aging_report())


@bp.get("/claims")
@auth_required(Role.DOCTOR, *BILLING)
def list_claims():
    query = Claim.query
    if request.args.get("status"):
        query = query.filter(Claim.status == request.args["status"])
    if request.args.get("invoice_id"):
        from uuid import UUID

        query = query.filter(Claim.invoice_id == UUID(request.args["invoice_id"]))
    if current_user().role == Role.DOCTOR:
        from app.billing.models import Invoice
        from app.clinical_records.models import Visit
        from app.scheduling.models import DoctorProfile

        doctor = DoctorProfile.query.filter_by(user_id=current_user().id).first()
        if doctor is None:
            return ok({"items": [], "meta": {"count": 0}})
        query = (
            query.join(Invoice, Invoice.id == Claim.invoice_id)
            .join(Visit, Visit.id == Invoice.visit_id)
            .filter(Visit.doctor_id == doctor.id)
        )
    query = query.order_by(Claim.created_at.desc())
    return ok(paginated(query, service.serialize_claim))


@bp.get("/claims/<uuid:claim_id>")
@auth_required(Role.DOCTOR, *BILLING)
def get_claim(claim_id):
    claim = service.get_claim_or_404(claim_id)
    if current_user().role == Role.DOCTOR:
        from app.billing.models import Invoice
        from app.clinical_records.models import Visit
        from app.scheduling.models import DoctorProfile

        doctor = DoctorProfile.query.filter_by(user_id=current_user().id).first()
        invoice = Invoice.query.get(claim.invoice_id)
        visit = Visit.query.get(invoice.visit_id) if invoice and invoice.visit_id else None
        if doctor is None or visit is None or visit.doctor_id != doctor.id:
            raise forbidden()
    return ok(service.serialize_claim(claim))


@bp.post("/claims/<uuid:claim_id>/resubmissions")
@auth_required(*BILLING)
def resubmit(claim_id):
    claim = service.get_claim_or_404(claim_id)
    data = ClaimResubmissionSchema().load(request.get_json(silent=True) or {})
    replacement = service.resubmit_claim(claim, data, current_user())
    return created(service.serialize_claim(replacement))


@bp.post("/claims/<uuid:claim_id>/status")
@auth_required(Role.ADMIN)
def update_status(claim_id):
    claim = service.get_claim_or_404(claim_id)
    data = ClaimStatusSchema().load(request.get_json(silent=True) or {})
    claim = service.transition_claim(claim, data, current_user())
    return ok(service.serialize_claim(claim))


@bp.post("/webhooks/sha/claim-status")
def sha_callback():
    payload = request.get_json(silent=True) or {}
    claim = service.handle_sha_callback(payload)
    return ok(service.serialize_claim(claim))
