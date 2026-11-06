from flask import Blueprint, current_app, request

from app.auth import service
from app.auth.schemas import (
    LoginSchema,
    PasswordResetConfirmSchema,
    PasswordResetRequestSchema,
    RefreshSchema,
    StaffCreateSchema,
    UserUpdateSchema,
    VerifyTokenSchema,
)
from app.common.decorators import auth_required, current_user
from app.common.enums import Role
from app.common.responses import created, ok
from app.extensions import db

bp = Blueprint("auth", __name__)


def _validation(schema):
    return schema.load(request.get_json(silent=True) or {})


def _token_visible(token):
    return (
        token
        if current_app.config.get("TESTING") or current_app.config.get("ENV") == "development"
        else None
    )


@bp.post("/auth/login")
def login():
    data = _validation(LoginSchema())
    identifier = data.get("email") or data.get("phone")
    if not identifier:
        from app.common.errors import bad_request

        raise bad_request("Email or phone is required")
    result = service.authenticate(
        identifier,
        data["password"],
        ip_address=request.headers.get("X-Forwarded-For", request.remote_addr),
        user_agent=request.headers.get("User-Agent"),
    )
    return ok(result)


@bp.post("/auth/refresh")
def refresh():
    data = _validation(RefreshSchema())
    result = service.refresh(
        data["refresh_token"],
        ip_address=request.headers.get("X-Forwarded-For", request.remote_addr),
        user_agent=request.headers.get("User-Agent"),
    )
    return ok(result)


@bp.post("/auth/logout")
def logout():
    data = _validation(RefreshSchema())
    return ok(service.logout(data["refresh_token"]))


@bp.post("/auth/password-reset/request")
def password_reset_request():
    data = _validation(PasswordResetRequestSchema())
    result = service.request_password_reset(data["email"])
    result["reset_token"] = _token_visible(result.get("reset_token"))
    return ok(result)


@bp.post("/auth/password-reset/confirm")
def password_reset_confirm():
    data = _validation(PasswordResetConfirmSchema())
    return ok(service.confirm_password_reset(data["token"], data["new_password"]))


@bp.post("/auth/verify")
def verify():
    data = _validation(VerifyTokenSchema())
    return ok(service.verify(data["token"]))


@bp.get("/auth/me")
@auth_required()
def me():
    return ok(service.serialize_user(current_user()))


@bp.post("/admin/users")
@auth_required(Role.ADMIN)
def create_staff():
    data = _validation(StaffCreateSchema())
    user = service.create_staff(data, current_user())
    return created(service.serialize_user(user))


@bp.get("/admin/users")
@auth_required(Role.ADMIN)
def list_users():
    from app.common.pagination import paginated

    role = request.args.get("role")
    status = request.args.get("status")
    search = request.args.get("search")
    query = service.User.query
    if role:
        query = query.filter(service.User.role == Role(role))
    if status:
        from app.common.enums import UserStatus

        query = query.filter(service.User.status == UserStatus(status))
    if search:
        like = f"%{search}%"
        query = query.filter(
            db.or_(
                service.User.email.ilike(like),
                service.User.phone.ilike(like),
                service.User.first_name.ilike(like),
                service.User.last_name.ilike(like),
            )
        )
    query = query.order_by(service.User.created_at.desc())
    return ok(paginated(query, service.serialize_user))


@bp.patch("/admin/users/<uuid:user_id>")
@auth_required(Role.ADMIN)
def update_user(user_id):
    data = _validation(UserUpdateSchema())
    user = service.update_staff(user_id, data, current_user())
    return ok(service.serialize_user(user))
