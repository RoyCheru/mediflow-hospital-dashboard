from datetime import date

from flask import Blueprint, Response, request

from app.audit import service
from app.common.decorators import auth_required, current_user
from app.common.enums import Role
from app.common.pagination import paginated
from app.common.responses import ok

bp = Blueprint("audit", __name__)


def _filters():
    return {
        "actor_user_id": request.args.get("actor_user_id"),
        "action": request.args.get("action"),
        "role": request.args.get("role"),
        "entity_type": request.args.get("entity_type"),
        "entity_id": request.args.get("entity_id"),
        "start_date": date.fromisoformat(request.args["start_date"])
        if request.args.get("start_date")
        else None,
        "end_date": date.fromisoformat(request.args["end_date"])
        if request.args.get("end_date")
        else None,
        "q": request.args.get("q"),
        "sort": request.args.get("sort") or "-created_at",
    }


@bp.get("/admin/audit-events")
@auth_required(Role.ADMIN)
def list_audit_events():
    query = service.filtered_query(**_filters())
    return ok(paginated(query, service.serialize_audit))


@bp.post("/admin/audit-exports")
@auth_required(Role.ADMIN)
def export_audit_events():
    filters = _filters()
    items = service.filtered_query(**filters).limit(5000).all()
    service.audit_export(current_user(), len(items), filters)
    content = service.export_csv(items)
    return Response(
        content,
        mimetype="text/csv",
        headers={"Content-Disposition": 'attachment; filename="audit-log.csv"'},
    )
