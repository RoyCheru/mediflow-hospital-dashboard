import uuid
from functools import wraps

from flask import g, request

from app.common.base import as_utc, utcnow
from app.common.enums import STAFF_ROLES, Role, UserStatus
from app.common.errors import forbidden, unauthorized
from app.common.security import decode_access_token


def _bearer_token():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    return token or None


def authenticate_request():
    from app.auth.models import User

    token = _bearer_token()
    if not token:
        raise unauthorized()
    payload = decode_access_token(token)
    user = User.query.filter_by(id=uuid.UUID(payload["sub"])).first()
    if user is None:
        raise unauthorized("Account not found")
    if user.status != UserStatus.ACTIVE:
        raise unauthorized("Account is not active")
    if user.role in STAFF_ROLES and user.last_activity_at is not None:
        idle_minutes = (utcnow() - as_utc(user.last_activity_at)).total_seconds() / 60
        if idle_minutes > user_inactivity_limit():
            raise unauthorized("Staff session expired due to inactivity")
    user.last_activity_at = utcnow()
    return user


def user_inactivity_limit():
    from flask import current_app

    return current_app.config["STAFF_INACTIVITY_MINUTES"]


def current_user():
    return getattr(g, "current_user", None)


def auth_required(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = authenticate_request()
            if roles and user.role not in roles:
                raise forbidden()
            g.current_user = user
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def auth_optional():
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            g.current_user = None
            if _bearer_token():
                try:
                    g.current_user = authenticate_request()
                except Exception:
                    g.current_user = None
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def require_roles(*roles):
    return auth_required(*roles)


__all__ = [
    "Role",
    "auth_required",
    "auth_optional",
    "current_user",
    "authenticate_request",
    "require_roles",
]
