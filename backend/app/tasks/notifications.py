from app.tasks.celery_app import celery


@celery.task(name="app.tasks.notifications.dispatch_due")
def dispatch_due():
    from app.notifications.service import dispatch_due as run

    return {"dispatched": run()}


@celery.task(name="app.tasks.notifications.dispatch_one")
def dispatch_one(notification_id):
    from app.notifications.service import dispatch

    item = dispatch(notification_id)
    return {"notification_id": str(item.id), "status": item.status.value}
