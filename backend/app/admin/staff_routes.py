from datetime import date
from uuid import UUID

from flask import Blueprint, jsonify, request

from app.admin import staff_service
from app.common.decorators import auth_required, current_user
from app.common.enums import Role
from app.common.errors import bad_request, not_found
from app.common.responses import created, ok
from app.scheduling import service as scheduling_service
from app.scheduling.models import AvailabilityException, AvailabilityRule
from app.scheduling.schemas import (
    AvailabilityExceptionSchema,
    AvailabilityExceptionUpdateSchema,
    AvailabilityRuleSchema,
    AvailabilityRuleUpdateSchema,
)

bp = Blueprint("admin_staff", __name__)


def _date_arg(name, default=None):
    value = request.args.get(name)
    if not value:
        return default
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise bad_request(f"Invalid {name} date") from exc


def _owner_rule(user, rule_id):
    owner = scheduling_service.owner_for_user(user)
    query = AvailabilityRule.query.filter(AvailabilityRule.id == rule_id)
    if owner["doctor_id"] is not None:
        query = query.filter(AvailabilityRule.doctor_id == owner["doctor_id"])
    else:
        query = query.filter(AvailabilityRule.user_id == owner["user_id"])
    rule = query.first()
    if rule is None:
        raise not_found("Availability rule not found")
    return owner, rule


def _owner_exception(user, exception_id):
    owner = scheduling_service.owner_for_user(user)
    query = AvailabilityException.query.filter(AvailabilityException.id == exception_id)
    if owner["doctor_id"] is not None:
        query = query.filter(AvailabilityException.doctor_id == owner["doctor_id"])
    else:
        query = query.filter(AvailabilityException.user_id == owner["user_id"])
    item = query.first()
    if item is None:
        raise not_found("Availability exception not found")
    return owner, item


@bp.get("/admin/appointments")
@auth_required(Role.ADMIN)
def list_admin_appointments():
    result = staff_service.admin_appointments(
        date_from=_date_arg("date_from"),
        date_to=_date_arg("date_to"),
        status=request.args.get("status"),
        source=request.args.get("source"),
        doctor_id=request.args.get("doctor_id"),
        department_id=request.args.get("department_id"),
        q=request.args.get("q"),
        sort=request.args.get("sort") or "-slot",
    )
    return jsonify(result), 200


def _uuid_arg(name):
    value = request.args.get(name)
    if not value:
        return None
    try:
        return UUID(value)
    except ValueError as exc:
        raise bad_request(f"Invalid {name}") from exc


@bp.get("/admin/queue")
@auth_required(Role.ADMIN)
def admin_queue():
    return ok(
        staff_service.admin_queue(
            doctor_id=_uuid_arg("doctor_id"),
            department_id=_uuid_arg("department_id"),
        )
    )


@bp.get("/admin/staff")
@auth_required(Role.ADMIN)
def list_admin_staff():
    return jsonify(
        staff_service.admin_staff(
            q=request.args.get("q") or request.args.get("search"),
            role=request.args.get("role"),
            status=request.args.get("status"),
        )
    ), 200


@bp.get("/admin/availability")
@auth_required(Role.ADMIN)
def admin_availability():
    target_date = _date_arg("date")
    return ok(staff_service.working_today(target_date))


@bp.get("/admin/staff/<uuid:user_id>/availability")
@auth_required(Role.ADMIN)
def admin_staff_availability(user_id):
    user = staff_service.find_staff_user(user_id)
    date_from = _date_arg("from")
    date_to = _date_arg("to")
    return ok(staff_service.staff_availability(user, date_from, date_to))


@bp.post("/admin/staff/<uuid:user_id>/availability/rules")
@auth_required(Role.ADMIN)
def admin_create_rule(user_id):
    user = staff_service.find_staff_user(user_id)
    owner = scheduling_service.owner_for_user(user)
    data = AvailabilityRuleSchema().load(request.get_json(silent=True) or {})
    rule = scheduling_service.create_rule_for_owner(owner, data, actor=current_user())
    return created(scheduling_service.serialize_rule(rule))


@bp.patch("/admin/staff/<uuid:user_id>/availability/rules/<uuid:rule_id>")
@auth_required(Role.ADMIN)
def admin_update_rule(user_id, rule_id):
    user = staff_service.find_staff_user(user_id)
    _, rule = _owner_rule(user, rule_id)
    data = AvailabilityRuleUpdateSchema().load(request.get_json(silent=True) or {})
    rule = scheduling_service.update_rule(rule, data, actor=current_user())
    return ok(scheduling_service.serialize_rule(rule))


@bp.delete("/admin/staff/<uuid:user_id>/availability/rules/<uuid:rule_id>")
@auth_required(Role.ADMIN)
def admin_delete_rule(user_id, rule_id):
    user = staff_service.find_staff_user(user_id)
    owner = scheduling_service.owner_for_user(user)
    rule = scheduling_service.delete_rule_for_owner(rule_id, owner, actor=current_user())
    return ok(scheduling_service.serialize_rule(rule))


@bp.post("/admin/staff/<uuid:user_id>/availability/exceptions")
@auth_required(Role.ADMIN)
def admin_create_exception(user_id):
    user = staff_service.find_staff_user(user_id)
    owner = scheduling_service.owner_for_user(user)
    data = AvailabilityExceptionSchema().load(request.get_json(silent=True) or {})
    item = scheduling_service.create_exception_for_owner(owner, data, actor=current_user())
    return created(scheduling_service.serialize_exception(item))


@bp.patch("/admin/staff/<uuid:user_id>/availability/exceptions/<uuid:exception_id>")
@auth_required(Role.ADMIN)
def admin_update_exception(user_id, exception_id):
    user = staff_service.find_staff_user(user_id)
    _, item = _owner_exception(user, exception_id)
    data = AvailabilityExceptionUpdateSchema().load(request.get_json(silent=True) or {})
    item = scheduling_service.update_exception(item, data, actor=current_user())
    return ok(scheduling_service.serialize_exception(item))


@bp.delete("/admin/staff/<uuid:user_id>/availability/exceptions/<uuid:exception_id>")
@auth_required(Role.ADMIN)
def admin_delete_exception(user_id, exception_id):
    user = staff_service.find_staff_user(user_id)
    _, item = _owner_exception(user, exception_id)
    scheduling_service.delete_exception(item, actor=current_user())
    return ok({"deleted": True})
