from app.common.base import utcnow
from app.common.enums import OutboxStatus
from app.extensions import db
from app.tasks.celery_app import celery


@celery.task(name="app.tasks.outbox.process")
def process(limit=100):
    from app.common.models import OutboxEvent
    from app.notifications.service import queue_event_notifications

    events = (
        OutboxEvent.query.filter(
            OutboxEvent.status == OutboxStatus.PENDING,
            OutboxEvent.available_at <= utcnow(),
        )
        .order_by(OutboxEvent.created_at)
        .limit(limit)
        .all()
    )
    processed = 0
    failed = 0
    for event in events:
        event.status = OutboxStatus.PROCESSING
        db.session.commit()
        try:
            queue_event_notifications(event)
            event.status = OutboxStatus.PROCESSED
            event.processed_at = utcnow()
            processed += 1
        except Exception as exc:
            event.attempts = (event.attempts or 0) + 1
            event.last_error = str(exc)[:500]
            event.status = OutboxStatus.DEAD if event.attempts >= 5 else OutboxStatus.FAILED
            failed += 1
        db.session.commit()
    return {"processed": processed, "failed": failed, "total": len(events)}
