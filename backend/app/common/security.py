import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from flask import current_app

from app.common.errors import unauthorized, unprocessable

try:
    from argon2 import PasswordHasher
    from argon2.exceptions import VerificationError, VerifyMismatchError

    _password_hasher = PasswordHasher()
    _ARGON2 = True
except ImportError:  # pragma: no cover - fallback keeps the backend runnable
    from werkzeug.security import check_password_hash, generate_password_hash

    _ARGON2 = False


def hash_password(password: str) -> str:
    if _ARGON2:
        return _password_hasher.hash(password)
    return generate_password_hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    if not password_hash:
        return False
    if _ARGON2:
        try:
            return _password_hasher.verify(password_hash, password)
        except (VerifyMismatchError, VerificationError):
            return False
    return check_password_hash(password_hash, password)


def validate_password_policy(password: str) -> None:
    if not isinstance(password, str) or len(password) < 10:
        raise unprocessable(
            "Password must be at least 10 characters long",
            {"password": ["Minimum length is 10 characters"]},
        )
    if password.lower() == password or password.upper() == password:
        raise unprocessable(
            "Password must include upper and lower case characters",
            {"password": ["Use both upper and lower case characters"]},
        )
    if not any(char.isdigit() for char in password):
        raise unprocessable(
            "Password must include a number",
            {"password": ["Include at least one number"]},
        )


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def generate_opaque_token() -> str:
    return secrets.token_urlsafe(48)


def create_access_token(user) -> str:
    now = datetime.now(timezone.utc)
    expires = now + current_app.config["JWT_ACCESS_TTL"]
    payload = {
        "sub": str(user.id),
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
        "jti": secrets.token_hex(16),
    }
    return jwt.encode(
        payload,
        current_app.config["JWT_SECRET_KEY"],
        algorithm=current_app.config["JWT_ALGORITHM"],
    )


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            current_app.config["JWT_SECRET_KEY"],
            algorithms=[current_app.config["JWT_ALGORITHM"]],
        )
    except jwt.ExpiredSignatureError as exc:
        raise unauthorized("Access token has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise unauthorized("Invalid access token") from exc
    if payload.get("type") != "access" or not payload.get("sub"):
        raise unauthorized("Invalid access token")
    return payload


def refresh_token_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=current_app.config["REFRESH_TOKEN_TTL_DAYS"])
