from datetime import date, datetime, time, timezone

from flask import Blueprint, request
from sqlalchemy import or_

from app.admin import service
from app.common.decorators import auth_required
from app.common.enums import Role
from app.common.pagination import paginated
from app.common.responses import ok

bp = Blueprint("admin", __name__)


@bp.get("/admin/visits")
@auth_required(Role.ADMIN)
def list_visits():
    from app.clinical_records.models import Visit
    from app.clinical_records.service import serialize_visit
    from app.patients.models import PatientProfile

    query = Visit.query
    if request.args.get("department_id"):
        from uuid import UUID

        query = query.filter(Visit.department_id == UUID(request.args["department_id"]))
    if request.args.get("doctor_id"):
        from uuid import UUID

        query = query.filter(Visit.doctor_id == UUID(request.args["doctor_id"]))
    if request.args.get("completed") in {"true", "false"}:
        completed = request.args["completed"] == "true"
        query = (
            query.filter(Visit.completed_at.isnot(None))
            if completed
            else query.filter(Visit.completed_at.is_(None))
        )
    if request.args.get("date_from"):
        start = datetime.combine(
            date.fromisoformat(request.args["date_from"]), time.min, tzinfo=timezone.utc
        )
        query = query.filter(Visit.started_at >= start)
    if request.args.get("date_to"):
        end = datetime.combine(
            date.fromisoformat(request.args["date_to"]), time.max, tzinfo=timezone.utc
        )
        query = query.filter(Visit.started_at <= end)
    if request.args.get("q"):
        like = f"%{request.args['q'].strip()}%"
        query = query.filter(
            or_(
                Visit.patient.has(
                    or_(
                        PatientProfile.first_name.ilike(like),
                        PatientProfile.last_name.ilike(like),
                        PatientProfile.patient_number.ilike(like),
                    )
                ),
            )
        )
    sort = request.args.get("sort") or "-started_at"
    descending = sort.startswith("-")
    field = sort.lstrip("-")
    columns = {
        "started_at": Visit.started_at,
        "created_at": Visit.created_at,
        "completed_at": Visit.completed_at,
    }
    column = columns.get(field, Visit.started_at)
    query = query.order_by(column.desc() if descending else column.asc())
    return ok(paginated(query, serialize_visit))


@bp.get("/admin/ai-interactions")
@auth_required(Role.ADMIN)
def list_ai_interactions():
    from app.ai_assistance.models import AIInteraction
    from app.ai_assistance.service import serialize_interaction
    from app.common.enums import AIFeature, AIStatus

    query = AIInteraction.query
    if request.args.get("feature"):
        query = query.filter(AIInteraction.feature == AIFeature(request.args["feature"]))
    if request.args.get("status"):
        query = query.filter(AIInteraction.status == AIStatus(request.args["status"]))
    query = query.order_by(AIInteraction.created_at.desc())
    return ok(paginated(query, serialize_interaction))


@bp.get("/admin/dashboard/summary")
@auth_required(Role.ADMIN)
def dashboard_summary():
    return ok(service.dashboard_summary())


@bp.get("/admin/dashboard/pending-approvals")
@auth_required(Role.ADMIN)
def pending_approvals():
    return ok(service.pending_approvals())


@bp.get("/admin/dashboard/invoice-totals")
@auth_required(Role.ADMIN)
def invoice_totals():
    return ok(service.invoice_totals())
