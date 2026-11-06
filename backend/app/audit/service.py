import csv
import io
from datetime import datetime, time, timezone

from app.audit.models import AuditLog
from app.common.audit import record_audit
from app.extensions import db


def serialize_audit(item):
    return {
        "id": str(item.id),
        "actor_user_id": str(item.actor_user_id) if item.actor_user_id else None,
        "actor_role": item.actor_role,
        "action": item.action,
        "entity_type": item.entity_type,
        "entity_id": str(item.entity_id) if item.entity_id else None,
        "before": item.before,
        "after": item.after,
        "request_id": item.request_id,
        "ip_address": item.ip_address,
        "user_agent": item.user_agent,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def filtered_query(
    actor_user_id=None,
    action=None,
    role=None,
    start_date=None,
    end_date=None,
    entity_type=None,
    entity_id=None,
):
    query = AuditLog.query
    if actor_user_id:
        from uuid import UUID

        query = query.filter(AuditLog.actor_user_id == UUID(actor_user_id))
    if action:
        query = query.filter(AuditLog.action.ilike(f"%{action}%"))
    if role:
        query = query.filter(AuditLog.actor_role == role)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        from uuid import UUID

        query = query.filter(AuditLog.entity_id == UUID(entity_id))
    if start_date:
        query = query.filter(
            AuditLog.created_at >= datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        )
    if end_date:
        query = query.filter(
            AuditLog.created_at <= datetime.combine(end_date, time.max, tzinfo=timezone.utc)
        )
    return query.order_by(AuditLog.created_at.desc())


def export_csv(items):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "id",
            "created_at",
            "actor_user_id",
            "actor_role",
            "action",
            "entity_type",
            "entity_id",
            "ip_address",
            "request_id",
        ]
    )
    for item in items:
        writer.writerow(
            [
                item.id,
                item.created_at.isoformat() if item.created_at else "",
                item.actor_user_id or "",
                item.actor_role or "",
                item.action,
                item.entity_type,
                item.entity_id or "",
                item.ip_address or "",
                item.request_id or "",
            ]
        )
    return buffer.getvalue().encode()


def audit_export(actor, count, filters):
    record_audit(
        "audit.export",
        "audit_log",
        None,
        actor=actor,
        after={"count": count, "filters": filters},
    )
    db.session.commit()
