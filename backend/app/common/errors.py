from flask import jsonify
from marshmallow import ValidationError


class ApiError(Exception):
    def __init__(self, status_code, code, message, details=None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}

    def to_dict(self):
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details,
            }
        }


def bad_request(message, details=None):
    return ApiError(400, "BAD_REQUEST", message, details)


def unauthorized(message="Authentication required"):
    return ApiError(401, "UNAUTHORIZED", message)


def forbidden(message="You do not have permission to perform this action"):
    return ApiError(403, "FORBIDDEN", message)


def not_found(message="Resource not found"):
    return ApiError(404, "NOT_FOUND", message)


def conflict(message, details=None):
    return ApiError(409, "CONFLICT", message, details)


def unprocessable(message, details=None):
    return ApiError(422, "UNPROCESSABLE_ENTITY", message, details)


def register_error_handlers(app):
    @app.errorhandler(ApiError)
    def handle_api_error(error):
        audit = getattr(error, "audit", None)
        if audit:
            # Refused actions that must leave a trace (e.g. a payment attempt on a
            # non-payable invoice): discard the failed request's work first so
            # nothing half-done is committed with the audit entry.
            _record_refusal(audit)
        return jsonify(error.to_dict()), error.status_code

    @app.errorhandler(ValidationError)
    def handle_validation_error(error):
        return (
            jsonify(
                {
                    "error": {
                        "code": "VALIDATION_ERROR",
                        "message": "Request validation failed",
                        "details": error.messages,
                    }
                }
            ),
            422,
        )

    @app.errorhandler(404)
    def handle_404(_error):
        return (
            jsonify(
                {
                    "error": {
                        "code": "NOT_FOUND",
                        "message": "Resource not found",
                        "details": {},
                    }
                }
            ),
            404,
        )

    @app.errorhandler(405)
    def handle_405(_error):
        return (
            jsonify(
                {
                    "error": {
                        "code": "METHOD_NOT_ALLOWED",
                        "message": "Method not allowed",
                        "details": {},
                    }
                }
            ),
            405,
        )

    @app.errorhandler(413)
    def handle_413(_error):
        return (
            jsonify(
                {
                    "error": {
                        "code": "PAYLOAD_TOO_LARGE",
                        "message": "Uploaded file exceeds the 10 MB limit",
                        "details": {},
                    }
                }
            ),
            413,
        )

    @app.errorhandler(Exception)
    def handle_unexpected(error):
        if app.config.get("TESTING"):
            raise error
        app.logger.exception("Unhandled application error")
        return (
            jsonify(
                {
                    "error": {
                        "code": "INTERNAL_ERROR",
                        "message": "An unexpected error occurred",
                        "details": {},
                    }
                }
            ),
            500,
        )


def _record_refusal(audit):
    from flask import current_app

    from app.common.audit import record_audit
    from app.extensions import db

    try:
        db.session.rollback()
        try:
            from app.common.decorators import current_user

            actor = current_user()
        except Exception:  # noqa: BLE001 - unauthenticated callers (webhooks)
            actor = None
        record_audit(
            audit["action"],
            audit["entity_type"],
            audit.get("entity_id"),
            actor=actor,
            after=audit.get("after"),
        )
        db.session.commit()
    except Exception:  # noqa: BLE001 - never mask the original error
        db.session.rollback()
        current_app.logger.exception("Could not audit refused action %s", audit.get("action"))
