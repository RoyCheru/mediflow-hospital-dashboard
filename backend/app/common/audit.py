from flask import has_request_context, request


def record_audit(
    action,
    entity_type,
    entity_id=None,
    actor=None,
    actor_role=None,
    before=None,
    after=None,
    request_id=None,
    ip_address=None,
    user_agent=None,
):
    from app.audit.models import AuditLog

    if actor is not None:
        actor_id = getattr(actor, "id", None)
        if actor_role is None:
            role = getattr(actor, "role", None)
            actor_role = role.value if hasattr(role, "value") else role
    else:
        actor_id = None

    if has_request_context():
        ip_address = ip_address or request.headers.get("X-Forwarded-For", request.remote_addr)
        user_agent = user_agent or request.headers.get("User-Agent")
        request_id = request_id or request.headers.get("X-Request-Id")

    event = AuditLog(
        actor_user_id=actor_id,
        actor_role=actor_role,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before=before,
        after=after,
        request_id=request_id,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    from app.extensions import db

    db.session.add(event)
    return event
