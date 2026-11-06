from app.common.models import OutboxEvent


def enqueue_event(event_type, aggregate_type, aggregate_id, payload=None):
    from app.extensions import db

    event = OutboxEvent(
        event_type=event_type,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        payload=payload or {},
    )
    db.session.add(event)
    return event
