from datetime import timedelta

from flask import current_app

from app.common.base import as_utc, utcnow
from app.common.enums import ClaimStatus, NotificationChannel, Role
from app.extensions import db
from app.tasks.celery_app import celery


@celery.task(name="app.tasks.claims.check_aging")
def check_aging():
    from app.auth.models import User
    from app.claims.models import Claim
    from app.notifications.models import Notification

    thresholds = current_app.config.get("CLAIM_AGING_DAYS", [14, 30, 60])
    oldest = min(thresholds) if thresholds else 14
    cutoff = utcnow() - timedelta(days=oldest)
    claims = Claim.query.filter(
        Claim.status.in_([ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW]),
        Claim.submitted_at <= cutoff,
    ).all()
    admins = User.query.filter_by(role=Role.ADMIN).all()
    created = 0
    for claim in claims:
        age = (utcnow() - as_utc(claim.submitted_at)).days
        for admin in admins:
            db.session.add(
                Notification(
                    recipient_user_id=admin.id,
                    channel=NotificationChannel.IN_APP,
                    template_key="claim_aging_alert",
                    payload={
                        "claim_id": str(claim.id),
                        "age_days": age,
                        "amount_minor": claim.claimed_amount_minor,
                    },
                )
            )
            created += 1
    db.session.commit()
    return {"claims": len(claims), "notifications": created}
