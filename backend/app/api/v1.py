from flask import Blueprint

from app.ai_assistance.routes import bp as ai_bp
from app.analytics.routes import bp as analytics_bp
from app.audit.routes import bp as audit_bp
from app.auth.routes import bp as auth_bp
from app.billing.routes import bp as billing_bp
from app.claims.routes import bp as claims_bp
from app.clinical_records.routes import bp as clinical_bp
from app.notifications.routes import bp as notifications_bp
from app.patients.routes import bp as patients_bp
from app.scheduling.routes import bp as scheduling_bp

api_v1 = Blueprint("api_v1", __name__)


@api_v1.get("/health")
def health():
    return {"status": "ok", "service": "mediflow-api", "version": "1"}


for blueprint in (
    auth_bp,
    patients_bp,
    scheduling_bp,
    clinical_bp,
    billing_bp,
    claims_bp,
    notifications_bp,
    analytics_bp,
    audit_bp,
    ai_bp,
):
    api_v1.register_blueprint(blueprint)
