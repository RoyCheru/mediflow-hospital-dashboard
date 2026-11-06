import hashlib
import json

from app.common.enums import IdempotencyStatus
from app.common.errors import conflict
from app.common.models import IdempotencyKey
from app.extensions import db


def request_fingerprint(payload) -> str:
    encoded = json.dumps(payload, sort_keys=True, default=str).encode()
    return hashlib.sha256(encoded).hexdigest()


def find_existing(scope: str, key: str):
    if not key:
        return None
    return IdempotencyKey.query.filter_by(scope=scope, key=key).first()


def begin(scope: str, key: str, payload) -> IdempotencyKey:
    """Create an idempotency record or return an existing completed result.

    Returns a tuple of (record, cached_response). A reused key with a different
    request body is rejected, which prevents accidental payload switching.
    """
    fingerprint = request_fingerprint(payload)
    existing = find_existing(scope, key)
    if existing is not None:
        if existing.request_hash != fingerprint:
            raise conflict("Idempotency key was already used with a different request")
        if existing.status == IdempotencyStatus.COMPLETED:
            return existing, {
                "code": existing.response_code,
                "body": existing.response_body,
            }
        if existing.status == IdempotencyStatus.IN_PROGRESS:
            raise conflict("A request with this idempotency key is already in progress")
        raise conflict("A previous request with this idempotency key failed")
    record = IdempotencyKey(
        scope=scope,
        key=key,
        request_hash=fingerprint,
        status=IdempotencyStatus.IN_PROGRESS,
    )
    db.session.add(record)
    db.session.flush()
    return record, None


def complete(record: IdempotencyKey, response_code: int, response_body) -> None:
    record.status = IdempotencyStatus.COMPLETED
    record.response_code = response_code
    record.response_body = response_body
    db.session.add(record)
