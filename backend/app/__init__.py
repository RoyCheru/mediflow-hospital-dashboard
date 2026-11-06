import logging
import uuid

from flask import Flask, g, request

from app.config import Config
from app.extensions import db, migrate


def create_app(config=None):
    app = Flask(__name__)
    if config is None:
        app.config.from_object(Config)
    elif isinstance(config, str):
        app.config.from_object(config)
    elif isinstance(config, dict):
        app.config.update(config)
    else:
        app.config.from_object(config)

    db.init_app(app)
    migrate.init_app(app, db)

    from app.common.errors import register_error_handlers

    register_error_handlers(app)

    from app.api.v1 import api_v1

    app.register_blueprint(api_v1, url_prefix="/api/v1")

    # Importing models after extension init registers all metadata for Alembic.
    from app import models as _models  # noqa: F401

    try:
        from flask_cors import CORS

        CORS(
            app,
            resources={r"/api/*": {"origins": app.config.get("CORS_ORIGINS", "*")}},
            supports_credentials=False,
        )
    except ImportError:  # pragma: no cover
        pass

    @app.before_request
    def attach_request_id():
        g.request_id = request.headers.get("X-Request-Id", str(uuid.uuid4()))

    @app.after_request
    def add_request_headers(response):
        response.headers.setdefault("X-Request-Id", getattr(g, "request_id", ""))
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        return response

    configure_logging(app)

    from app.cli import register_cli

    register_cli(app)

    return app


def configure_logging(app):
    level = logging.DEBUG if app.config.get("ENV") == "development" else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
