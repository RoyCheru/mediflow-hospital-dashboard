from datetime import date

from flask import Blueprint, Response, request

from app.analytics import service
from app.analytics.models import ReportExport
from app.common.decorators import auth_required, current_user
from app.common.enums import ReportFormat, Role
from app.common.errors import not_found
from app.common.responses import created, ok
from app.scheduling.models import DoctorProfile

bp = Blueprint("analytics", __name__)


def _date(name, default=None):
    value = request.args.get(name)
    return date.fromisoformat(value) if value else default


def _start():
    return _date("start_date") or date.today().replace(day=1)


def _end():
    return _date("end_date") or date.today()


@bp.get("/reports/revenue")
@auth_required(Role.ADMIN)
def revenue():
    return ok(
        service.revenue_by_payment_method(
            _start(),
            _end(),
            request.args.get("group_by", "method"),
        )
    )


@bp.get("/reports/claims")
@auth_required(Role.ADMIN)
def claims_report():
    return ok(service.claims_report(_start(), _end()))


@bp.get("/reports/doctor-workload")
@auth_required(Role.ADMIN)
def doctor_workload():
    return ok(service.doctor_workload(_start(), _end(), request.args.get("doctor_id")))


@bp.get("/reports/no-shows")
@auth_required(Role.ADMIN)
def no_shows():
    return ok(service.no_show_report(_start(), _end()))


@bp.get("/reports/daily-cash")
@auth_required(Role.RECEPTIONIST, Role.CASHIER, Role.ADMIN)
def daily_cash():
    return ok(service.daily_cash_report(_date("business_date") or date.today()))


@bp.get("/reports/my-stats")
@auth_required(Role.DOCTOR)
def my_stats():
    doctor = DoctorProfile.query.filter_by(user_id=current_user().id).first()
    if doctor is None:
        raise not_found("Doctor profile not found")
    return ok(service.doctor_stats(doctor.id, _start(), _end()))


@bp.post("/reports/exports")
@auth_required(Role.ADMIN)
def create_export():
    payload = request.get_json(silent=True) or {}
    report_key = payload.get("report_key")
    if not report_key:
        from app.common.errors import bad_request

        raise bad_request("report_key is required")
    report_format = ReportFormat(payload.get("format", "CSV"))
    export = service.create_export(
        report_key, payload.get("parameters") or {}, report_format, current_user()
    )
    return created(
        {
            "id": str(export.id),
            "status": export.status.value,
            "report_key": export.report_key,
        }
    )


@bp.get("/reports/exports")
@auth_required(Role.ADMIN)
def list_exports():
    from app.common.pagination import paginated

    query = ReportExport.query.order_by(ReportExport.created_at.desc())
    return ok(
        paginated(
            query,
            lambda item: {
                "id": str(item.id),
                "report_key": item.report_key,
                "format": item.report_format.value,
                "status": item.status.value,
                "parameters": item.parameters,
                "error_message": item.error_message,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "completed_at": item.completed_at.isoformat() if item.completed_at else None,
            },
        )
    )


@bp.get("/reports/exports/<uuid:export_id>")
@auth_required(Role.ADMIN)
def get_export(export_id):
    export = ReportExport.query.get(export_id)
    if export is None:
        raise not_found("Export not found")
    return ok(
        {
            "id": str(export.id),
            "report_key": export.report_key,
            "format": export.report_format.value,
            "status": export.status.value,
            "storage_key": export.storage_key,
            "error_message": export.error_message,
        }
    )


@bp.get("/reports/exports/<uuid:export_id>/download")
@auth_required(Role.ADMIN)
def download_export(export_id):
    export = ReportExport.query.get(export_id)
    if export is None:
        raise not_found("Export not found")
    if export.storage_key is None:
        raise not_found("Export is not ready")
    from app.integrations.object_storage import get_object_storage

    content = get_object_storage().get(export.storage_key)
    return Response(
        content,
        mimetype="text/csv" if export.report_format == ReportFormat.CSV else "text/html",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{export.report_key}-{export.id}'
                f'.{export.report_format.value.lower()}"'
            )
        },
    )
