from flask import Blueprint, request

from app.ai_assistance import service
from app.ai_assistance.schemas import (
    ReportQuerySchema,
    SummaryApprovalSchema,
    SummaryDraftSchema,
    TriageSchema,
)
from app.clinical_records.service import get_visit_or_404
from app.common.decorators import auth_optional, auth_required, current_user
from app.common.enums import Role
from app.common.permissions import (
    assert_can_view_demographics,
    assert_doctor_owns_visit,
    patient_profile_for_user,
)
from app.common.responses import created, ok

bp = Blueprint("ai_assistance", __name__)


@bp.post("/ai/triage")
@auth_optional()
def triage():
    data = TriageSchema().load(request.get_json(silent=True) or {})
    user = current_user()
    patient_id = data.get("patient_id")
    if user is not None and user.role == Role.PATIENT:
        profile = patient_profile_for_user(user)
        patient_id = profile.id if profile else None
    elif user is None:
        patient_id = None
    result, interaction = service.triage(data["symptoms"], actor=user, patient_id=patient_id)
    return ok(
        {
            "triage": result,
            "ai_interaction_id": str(interaction.id),
            "ai_generated": True,
        }
    )


@bp.post("/visits/<uuid:visit_id>/summary-drafts")
@auth_required(Role.DOCTOR)
def summary_draft(visit_id):
    visit = get_visit_or_404(visit_id)
    assert_doctor_owns_visit(current_user(), visit)
    data = SummaryDraftSchema().load(request.get_json(silent=True) or {})
    interaction = service.create_summary_draft(visit, data.get("notes"), current_user())
    return created(service.serialize_interaction(interaction))


@bp.post("/visits/<uuid:visit_id>/summary-approval")
@auth_required(Role.DOCTOR)
def summary_approval(visit_id):
    visit = get_visit_or_404(visit_id)
    assert_doctor_owns_visit(current_user(), visit)
    data = SummaryApprovalSchema().load(request.get_json(silent=True) or {})
    visit = service.approve_summary(
        visit,
        data["ai_interaction_id"],
        data["summary"],
        current_user(),
    )
    from app.clinical_records.service import serialize_visit

    return ok(serialize_visit(visit))


@bp.get("/patients/<uuid:patient_id>/no-show-risk")
@auth_required(Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
def patient_no_show_risk(patient_id):
    from app.patients.service import get_patient_or_404

    get_patient_or_404(patient_id)
    assert_can_view_demographics(current_user(), patient_id)
    return ok(service.no_show_score(patient_id))


@bp.post("/admin/report-queries")
@auth_required(Role.ADMIN)
def report_query():
    data = ReportQuerySchema().load(request.get_json(silent=True) or {})
    return ok(service.report_query(data["query"], current_user()))
