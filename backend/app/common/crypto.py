from cryptography.fernet import Fernet, InvalidToken
from flask import current_app, has_app_context
from sqlalchemy import Text, TypeDecorator

PREFIX = "enc:v1:"


def _fernet():
    if not has_app_context():
        return None
    key = current_app.config.get("ENCRYPTION_KEY")
    if not key:
        return None
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except (ValueError, TypeError):
        current_app.logger.warning(
            "ENCRYPTION_KEY is not a valid Fernet key; sensitive fields are not encrypted"
        )
        return None


class EncryptedText(TypeDecorator):
    """Encrypts sensitive columns at rest while keeping the ORM interface simple."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        fernet = _fernet()
        if fernet is None:
            return value
        return PREFIX + fernet.encrypt(str(value).encode()).decode()

    def process_result_value(self, value, dialect):
        if value is None or not isinstance(value, str) or not value.startswith(PREFIX):
            return value
        fernet = _fernet()
        if fernet is None:
            return value
        try:
            return fernet.decrypt(value[len(PREFIX) :].encode()).decode()
        except InvalidToken:
            return value
