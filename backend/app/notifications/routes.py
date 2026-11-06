from flask import Blueprint, request

from app.common.decorators import auth_required, current_user
from app.common.enums import Role
from app.common.errors import not_found
from app.common.pagination import paginated
from app.common.responses import ok
from app.notifications import service
from app.notifications.models import Notification, NotificationTemplate
from app.notifications.schemas import TemplateUpdateSchema

bp = Blueprint("notifications", __name__)


@bp.get("/notifications")
@auth_required()
def my_notifications():
    query = Notification.query.filter_by(recipient_user_id=current_user().id).order_by(
        Notification.created_at.desc()
    )
    return ok(paginated(query, service.serialize_notification))


@bp.get("/notifications/delivery-status")
@auth_required(Role.ADMIN)
def delivery_status():
    query = Notification.query
    if request.args.get("status"):
        from app.common.enums import NotificationStatus

        query = query.filter(Notification.status == NotificationStatus(request.args["status"]))
    if request.args.get("channel"):
        from app.common.enums import NotificationChannel

        query = query.filter(Notification.channel == NotificationChannel(request.args["channel"]))
    query = query.order_by(Notification.created_at.desc())
    return ok(paginated(query, service.serialize_notification))


@bp.post("/admin/notifications/<uuid:notification_id>/retry")
@auth_required(Role.ADMIN)
def retry(notification_id):
    item = Notification.query.get(notification_id)
    if item is None:
        raise not_found("Notification not found")
    item.status = item.status.__class__.QUEUED
    item.last_error = None
    from app.extensions import db

    db.session.commit()
    item = service.dispatch(item.id)
    return ok(service.serialize_notification(item))


@bp.get("/admin/notification-templates")
@auth_required(Role.ADMIN)
def list_templates():
    query = NotificationTemplate.query.order_by(
        NotificationTemplate.key, NotificationTemplate.channel
    )
    return ok({"items": [service.serialize_template(item) for item in query.all()]})


@bp.patch("/admin/notification-templates/<uuid:template_id>")
@auth_required(Role.ADMIN)
def update_template(template_id):
    template = NotificationTemplate.query.get(template_id)
    if template is None:
        raise not_found("Notification template not found")
    data = TemplateUpdateSchema().load(request.get_json(silent=True) or {})
    template = service.update_template(template, data, current_user())
    return ok(service.serialize_template(template))
