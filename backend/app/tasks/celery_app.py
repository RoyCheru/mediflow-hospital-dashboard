from celery import Celery

from app import create_app

flask_app = create_app()
celery = Celery(
    "mediflow",
    broker=flask_app.config["CELERY_BROKER_URL"],
    backend=flask_app.config["CELERY_RESULT_BACKEND"],
)
celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "dispatch-due-notifications": {
            "task": "app.tasks.notifications.dispatch_due",
            "schedule": 300.0,
        },
        "process-outbox": {
            "task": "app.tasks.outbox.process",
            "schedule": 60.0,
        },
        "claim-aging-check": {
            "task": "app.tasks.claims.check_aging",
            "schedule": 86400.0,
        },
    },
)


class FlaskContextTask(celery.Task):
    def __call__(self, *args, **kwargs):
        with flask_app.app_context():
            return super().__call__(*args, **kwargs)


celery.Task = FlaskContextTask
