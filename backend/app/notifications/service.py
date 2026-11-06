from datetime import timedelta
from uuid import UUID

from app.common.audit import record_audit
from app.common.base import utcnow
from app.common.enums import (
    NotificationAttemptStatus,
    NotificationChannel,
    NotificationStatus,
)
from app.common.errors import not_found
from app.extensions import db
from app.integrations.messaging import get_messaging_gateway
from app.notifications.models import (
    Notification,
    NotificationAttempt,
    NotificationTemplate,
)

DEFAULT_TEMPLATES = [
    (
        "booking_confirmation",
        "Appointment confirmed",
        "Hello {patient_name}, your appointment with {doctor_name} is "
        "confirmed for {scheduled_start}.",
    ),
    (
        "appointment_reminder_24h",
        "Appointment reminder",
        "Hello {patient_name}, reminder: your appointment is tomorrow at {scheduled_start}.",
    ),
    (
        "appointment_reminder_2h",
        "Appointment reminder",
        "Hello {patient_name}, your appointment starts in 2 hours at {scheduled_start}.",
    ),
    (
        "appointment_change",
        "Appointment updated",
        "Hello {patient_name}, your appointment has been updated. Status: {status}.",
    ),
    (
        "prescription_ready",
        "Prescription ready",
        "Hello {patient_name}, your prescription is ready for collection.",
    ),
    (
        "invoice_issued",
        "Invoice issued",
        "Hello {patient_name}, invoice {invoice_number} has been issued. Amount due: KES {amount}.",
    ),
    (
        "receipt",
        "Payment receipt",
        "Hello {patient_name}, we received your payment of KES {amount}. Reference: {reference}.",
    ),
    (
        "claim_aging_alert",
        "Aging SHA claim",
        "Claim {claim_id} has been open for {age_days} days.",
    ),
    (
        "cash_variance_alert",
        "Cash variance alert",
        "Cash reconciliation for {business_date} has a variance of KES {variance}.",
    ),
    (
        "mpesa_failed_alert",
        "M-Pesa payment needs attention",
        "M-Pesa payment {checkout_id} for invoice {invoice_id} is {status}.",
    ),
]


def ensure_default_templates():
    for key, name, body in DEFAULT_TEMPLATES:
        for channel in (
            NotificationChannel.WHATSAPP,
            NotificationChannel.EMAIL,
            NotificationChannel.IN_APP,
        ):
            exists = NotificationTemplate.query.filter_by(key=key, channel=channel).first()
            if exists is None:
                db.session.add(
                    NotificationTemplate(
                        key=key,
                        channel=channel,
                        name=name,
                        subject=name,
                        body=body,
                    )
                )
    db.session.commit()


def serialize_notification(item):
    return {
        "id": str(item.id),
        "channel": item.channel.value,
        "template_key": item.template_key,
        "status": item.status.value,
        "attempts": item.attempts,
        "scheduled_at": item.scheduled_at.isoformat() if item.scheduled_at else None,
        "sent_at": item.sent_at.isoformat() if item.sent_at else None,
        "last_error": item.last_error,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "attempts_log": [
            {
                "attempt_number": attempt.attempt_number,
                "status": attempt.status.value,
                "error_class": attempt.error_class,
                "attempted_at": attempt.attempted_at.isoformat(),
            }
            for attempt in item.attempts_log
        ],
    }


def serialize_template(item):
    return {
        "id": str(item.id),
        "key": item.key,
        "channel": item.channel.value,
        "name": item.name,
        "subject": item.subject,
        "body": item.body,
        "whatsapp_template_name": item.whatsapp_template_name,
        "version": item.version,
        "is_active": item.is_active,
    }


def _create(patient, channel, template_key, payload, scheduled_at=None):
    address = (
        patient.phone
        if channel
        in {
            NotificationChannel.WHATSAPP,
            NotificationChannel.SMS,
        }
        else patient.email
    )
    return Notification(
        patient_id=patient.id,
        recipient_user_id=patient.user_id,
        channel=channel,
        template_key=template_key,
        recipient_address=address,
        payload=payload,
        scheduled_at=scheduled_at or utcnow(),
    )


def _uuid(value):
    if value is None or isinstance(value, UUID):
        return value
    return UUID(str(value))


def queue_event_notifications(event):
    from app.patients.models import PatientProfile

    payload = event.payload or {}
    patient_id = _uuid(payload.get("patient_id"))
    if not patient_id:
        return []
    patient = PatientProfile.query.get(patient_id)
    if patient is None:
        return []

    created = []
    channels = [NotificationChannel.WHATSAPP, NotificationChannel.EMAIL]
    if event.event_type == "appointment.created":
        from app.scheduling.models import Appointment

        appointment = Appointment.query.get(_uuid(payload.get("appointment_id")))
        context = {
            "patient_name": patient.first_name,
            "doctor_name": "your doctor",
            "scheduled_start": appointment.scheduled_start.isoformat() if appointment else "",
        }
        for channel in channels:
            created.append(_create(patient, channel, "booking_confirmation", context))
        if appointment is not None:
            for hours, key in ((24, "appointment_reminder_24h"), (2, "appointment_reminder_2h")):
                when = appointment.scheduled_start - timedelta(hours=hours)
                if when > utcnow():
                    for channel in channels:
                        created.append(_create(patient, channel, key, context, when))
    elif event.event_type == "appointment.status_changed":
        context = {
            "patient_name": patient.first_name,
            "status": payload.get("status"),
        }
        for channel in channels:
            created.append(_create(patient, channel, "appointment_change", context))
    elif event.event_type == "prescription.issued":
        context = {"patient_name": patient.first_name}
        for channel in channels:
            created.append(_create(patient, channel, "prescription_ready", context))
    elif event.event_type == "invoice.created":
        context = {
            "patient_name": patient.first_name,
            "invoice_number": payload.get("invoice_number") or payload.get("invoice_id"),
            "amount": f"{(payload.get('total_minor') or 0) / 100:.2f}",
        }
        for channel in channels:
            created.append(_create(patient, channel, "invoice_issued", context))
    elif event.event_type == "payment.received":
        context = {
            "patient_name": patient.first_name,
            "amount": f"{(payload.get('amount_minor') or 0) / 100:.2f}",
            "reference": payload.get("reference") or payload.get("transaction_id"),
        }
        for channel in channels:
            created.append(_create(patient, channel, "receipt", context))
    for item in created:
        db.session.add(item)
    return created


def _render(template, payload):
    body = template.body
    for key, value in (payload or {}).items():
        body = body.replace("{" + key + "}", str(value))
    return body


def _consent_granted(notification):
    from app.patients.models import ConsentRecord

    if notification.patient_id is None:
        return True
    record = ConsentRecord.latest_for(notification.patient_id, notification.channel)
    return bool(record and record.granted)


def dispatch(notification_id):
    notification = Notification.query.get(notification_id)
    if notification is None:
        raise not_found("Notification not found")
    if notification.status not in {
        NotificationStatus.QUEUED,
        NotificationStatus.FAILED,
    }:
        return notification
    if not _consent_granted(notification):
        notification.status = NotificationStatus.CANCELLED
        notification.consent_granted = False
        db.session.commit()
        return notification

    notification.consent_granted = True
    template = NotificationTemplate.query.filter_by(
        key=notification.template_key,
        channel=notification.channel,
        is_active=True,
    ).first()
    if template is None:
        notification.status = NotificationStatus.FAILED
        notification.last_error = "No active template"
        db.session.commit()
        return notification

    body = _render(template, notification.payload)
    gateway = get_messaging_gateway()
    attempt_number = (notification.attempts or 0) + 1
    notification.attempts = attempt_number
    notification.status = NotificationStatus.SENDING
    db.session.commit()

    try:
        if notification.channel == NotificationChannel.IN_APP:
            result = {"provider_reference": None, "status": "SENT"}
        elif notification.channel == NotificationChannel.WHATSAPP:
            result = gateway.send_whatsapp(
                notification.recipient_address,
                template.whatsapp_template_name or template.key,
                notification.payload,
            )
        else:
            result = gateway.send_email(
                notification.recipient_address,
                template.subject or template.name,
                body,
            )
        notification.status = NotificationStatus.SENT
        notification.sent_at = utcnow()
        notification.provider_reference = result.get("provider_reference")
        notification.last_error = None
        attempt_status = NotificationAttemptStatus.SUCCESS
    except Exception as exc:  # provider errors are recorded, not swallowed
        notification.status = NotificationStatus.FAILED
        notification.last_error = f"{exc.__class__.__name__}: {str(exc)[:300]}"
        attempt_status = NotificationAttemptStatus.FAILED
        result = {"provider_reference": None}

    db.session.add(
        NotificationAttempt(
            notification_id=notification.id,
            attempt_number=attempt_number,
            status=attempt_status,
            provider_reference=result.get("provider_reference"),
            error_class=notification.last_error.split(":")[0] if notification.last_error else None,
            error_message=notification.last_error,
        )
    )
    db.session.commit()

    if (
        notification.status == NotificationStatus.FAILED
        and notification.channel == NotificationChannel.WHATSAPP
    ):
        email_notification = _create(
            _patient(notification.patient_id),
            NotificationChannel.EMAIL,
            notification.template_key,
            notification.payload,
        )
        db.session.add(email_notification)
        db.session.commit()
    return notification


def _patient(patient_id):
    from app.patients.models import PatientProfile

    patient = PatientProfile.query.get(patient_id)
    if patient is None:
        raise not_found("Patient not found")
    return patient


def dispatch_due(limit=50):
    items = (
        Notification.query.filter(
            Notification.status == NotificationStatus.QUEUED,
            Notification.scheduled_at <= utcnow(),
        )
        .order_by(Notification.scheduled_at)
        .limit(limit)
        .all()
    )
    for item in items:
        dispatch(item.id)
    return len(items)


def update_template(template, data, actor):
    before = serialize_template(template)
    for field in ("name", "subject", "body", "whatsapp_template_name", "is_active"):
        if field in data:
            setattr(template, field, data[field])
    if any(field in data for field in ("name", "subject", "body")):
        template.version = (template.version or 1) + 1
    record_audit(
        "notification_template.update",
        "notification_template",
        template.id,
        actor=actor,
        before=before,
        after=serialize_template(template),
    )
    db.session.commit()
    return template
