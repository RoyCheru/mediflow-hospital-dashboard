from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from flask import current_app
from sqlalchemy import or_

from app.common.audit import record_audit
from app.common.base import utcnow
from app.common.enums import (
    AppointmentSource,
    AppointmentStatus,
    Role,
    Urgency,
)
from app.common.errors import bad_request, conflict, forbidden, not_found
from app.common.outbox import enqueue_event
from app.extensions import db
from app.scheduling.models import (
    Appointment,
    AvailabilityException,
    AvailabilityRule,
    Department,
    DoctorProfile,
    Service,
    ServicePrice,
)

ACTIVE_STATUSES = {
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CHECKED_IN,
    AppointmentStatus.IN_CONSULTATION,
}

TRANSITIONS = {
    AppointmentStatus.SCHEDULED: {
        AppointmentStatus.CHECKED_IN,
        AppointmentStatus.CANCELLED,
        AppointmentStatus.NO_SHOW,
    },
    AppointmentStatus.CHECKED_IN: {
        AppointmentStatus.IN_CONSULTATION,
        AppointmentStatus.CANCELLED,
        AppointmentStatus.NO_SHOW,
    },
    AppointmentStatus.IN_CONSULTATION: {
        AppointmentStatus.COMPLETED,
        AppointmentStatus.CANCELLED,
    },
    AppointmentStatus.COMPLETED: set(),
    AppointmentStatus.NO_SHOW: set(),
    AppointmentStatus.CANCELLED: set(),
}


def _aware(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _iso(value):
    return value.isoformat() if value else None


def serialize_department(department):
    return {
        "id": str(department.id),
        "name": department.name,
        "code": department.code,
        "description": department.description,
        "is_active": department.is_active,
    }


def serialize_service(service):
    price = current_price(service.id)
    return {
        "id": str(service.id),
        "department_id": str(service.department_id),
        "name": service.name,
        "code": service.code,
        "description": service.description,
        "is_active": service.is_active,
        "current_price_minor": price.amount_minor if price else None,
        "currency": price.currency if price else "KES",
    }


def serialize_doctor(doctor):
    from app.auth.models import User

    user = User.query.get(doctor.user_id)
    return {
        "id": str(doctor.id),
        "user_id": str(doctor.user_id),
        "name": user.full_name if user else None,
        "department_id": str(doctor.department_id),
        "specialty": doctor.specialty,
        "license_number": doctor.license_number,
        "consultation_fee_minor": doctor.consultation_fee_minor,
        "is_accepting_appointments": doctor.is_accepting_appointments,
        "bio": doctor.bio,
    }


def serialize_appointment(appointment):
    return {
        "id": str(appointment.id),
        "patient_id": str(appointment.patient_id),
        "doctor_id": str(appointment.doctor_id),
        "service_id": str(appointment.service_id) if appointment.service_id else None,
        "department_id": str(appointment.department_id) if appointment.department_id else None,
        "scheduled_start": _iso(_aware(appointment.scheduled_start)),
        "scheduled_end": _iso(_aware(appointment.scheduled_end)),
        "status": appointment.status.value,
        "source": appointment.source.value,
        "urgency": appointment.urgency.value,
        "no_show_score": float(appointment.no_show_score)
        if appointment.no_show_score is not None
        else None,
        "checked_in_at": _iso(_aware(appointment.checked_in_at)),
        "started_at": _iso(_aware(appointment.started_at)),
        "completed_at": _iso(_aware(appointment.completed_at)),
        "cancelled_at": _iso(_aware(appointment.cancelled_at)),
        "cancellation_reason": appointment.cancellation_reason,
        "notes": appointment.notes,
        "rescheduled_from_id": str(appointment.rescheduled_from_id)
        if appointment.rescheduled_from_id
        else None,
        "created_at": _iso(_aware(appointment.created_at)),
    }


def serialize_rule(rule):
    return {
        "id": str(rule.id),
        "doctor_id": str(rule.doctor_id),
        "weekday": rule.weekday,
        "start_time": rule.start_time.isoformat(),
        "end_time": rule.end_time.isoformat(),
        "slot_minutes": rule.slot_minutes,
        "timezone": rule.timezone,
        "effective_from": rule.effective_from.isoformat() if rule.effective_from else None,
        "effective_to": rule.effective_to.isoformat() if rule.effective_to else None,
        "is_active": rule.is_active,
    }


def serialize_exception(exception):
    return {
        "id": str(exception.id),
        "doctor_id": str(exception.doctor_id),
        "start_at": _iso(_aware(exception.start_at)),
        "end_at": _iso(_aware(exception.end_at)),
        "kind": exception.kind.value,
        "reason": exception.reason,
    }


def current_price(service_id):
    now = utcnow()
    return (
        ServicePrice.query.filter(
            ServicePrice.service_id == service_id,
            ServicePrice.effective_from <= now,
            or_(
                ServicePrice.effective_to.is_(None),
                ServicePrice.effective_to > now,
            ),
        )
        .order_by(ServicePrice.effective_from.desc())
        .first()
    )


def create_department(data, actor):
    department = Department(
        name=data["name"],
        code=data["code"],
        description=data.get("description"),
        is_active=data.get("is_active", True),
    )
    db.session.add(department)
    record_audit("department.create", "department", department.id, actor=actor)
    db.session.commit()
    return department


def update_department(department, data, actor):
    for field in ("name", "description", "is_active"):
        if field in data:
            setattr(department, field, data[field])
    record_audit(
        "department.update",
        "department",
        department.id,
        actor=actor,
        after={"name": department.name, "is_active": department.is_active},
    )
    db.session.commit()
    return department


def create_service(data, actor):
    department = Department.query.get(data["department_id"])
    if department is None:
        raise not_found("Department not found")
    service = Service(
        department_id=department.id,
        name=data["name"],
        code=data["code"],
        description=data.get("description"),
        is_active=data.get("is_active", True),
    )
    db.session.add(service)
    db.session.flush()
    db.session.add(
        ServicePrice(
            service_id=service.id,
            amount_minor=data["amount_minor"],
            effective_from=utcnow(),
        )
    )
    record_audit("service.create", "service", service.id, actor=actor)
    db.session.commit()
    return service


def update_service(service, data, actor):
    for field in ("name", "description", "is_active"):
        if field in data:
            setattr(service, field, data[field])
    record_audit("service.update", "service", service.id, actor=actor)
    db.session.commit()
    return service


def add_service_price(service, data, actor):
    previous = current_price(service.id)
    if previous is not None:
        previous.effective_to = data.get("effective_from") or utcnow()
    price = ServicePrice(
        service_id=service.id,
        amount_minor=data["amount_minor"],
        effective_from=data.get("effective_from") or utcnow(),
    )
    db.session.add(price)
    record_audit(
        "service.price_change",
        "service_price",
        price.id,
        actor=actor,
        after={"amount_minor": price.amount_minor},
    )
    db.session.commit()
    return price


def get_doctor_or_404(doctor_id):
    from uuid import UUID

    if isinstance(doctor_id, str):
        doctor_id = UUID(doctor_id)
    doctor = DoctorProfile.query.get(doctor_id)
    if doctor is None:
        raise not_found("Doctor not found")
    return doctor


def update_doctor(doctor, data, actor):
    for field in (
        "department_id",
        "specialty",
        "consultation_fee_minor",
        "bio",
        "is_accepting_appointments",
    ):
        if field in data:
            setattr(doctor, field, data[field])
    record_audit("doctor.update", "doctor_profile", doctor.id, actor=actor)
    db.session.commit()
    return doctor


def create_rule(doctor, data):
    rule = AvailabilityRule(
        doctor_id=doctor.id,
        weekday=data["weekday"],
        start_time=data["start_time"],
        end_time=data["end_time"],
        slot_minutes=data.get("slot_minutes", 30),
        timezone=data.get("timezone", "Africa/Nairobi"),
        effective_from=data.get("effective_from"),
        effective_to=data.get("effective_to"),
    )
    if rule.end_time <= rule.start_time:
        raise bad_request("end_time must be after start_time")
    db.session.add(rule)
    db.session.commit()
    return rule


def delete_rule(rule_id, doctor):
    rule = AvailabilityRule.query.filter_by(id=rule_id, doctor_id=doctor.id).first()
    if rule is None:
        raise not_found("Availability rule not found")
    rule.is_active = False
    db.session.commit()
    return rule


def create_exception(doctor, data):
    if data["end_at"] <= data["start_at"]:
        raise bad_request("end_at must be after start_at")
    exception = AvailabilityException(
        doctor_id=doctor.id,
        start_at=data["start_at"],
        end_at=data["end_at"],
        kind=data.get("kind"),
        reason=data.get("reason"),
    )
    db.session.add(exception)
    db.session.commit()
    return exception


def availability(doctor_id, target_date):
    doctor = get_doctor_or_404(doctor_id)
    rules = AvailabilityRule.query.filter_by(
        doctor_id=doctor.id, weekday=target_date.weekday(), is_active=True
    ).all()
    timezone_name = rules[0].timezone if rules else "Africa/Nairobi"
    tz = ZoneInfo(timezone_name)
    day_start = datetime.combine(target_date, time.min, tzinfo=tz).astimezone(timezone.utc)
    day_end = day_start + timedelta(days=1)

    exceptions = AvailabilityException.query.filter(
        AvailabilityException.doctor_id == doctor.id,
        AvailabilityException.start_at < day_end,
        AvailabilityException.end_at > day_start,
    ).all()
    booked = Appointment.query.filter(
        Appointment.doctor_id == doctor.id,
        Appointment.status.in_(ACTIVE_STATUSES),
        Appointment.scheduled_start < day_end,
        Appointment.scheduled_end > day_start,
    ).all()

    slots = []
    seen = set()
    for rule in rules:
        if rule.effective_from and target_date < rule.effective_from:
            continue
        if rule.effective_to and target_date > rule.effective_to:
            continue
        cursor = datetime.combine(target_date, rule.start_time, tzinfo=tz)
        rule_end = datetime.combine(target_date, rule.end_time, tzinfo=tz)
        while cursor + timedelta(minutes=rule.slot_minutes) <= rule_end:
            slot_start = cursor.astimezone(timezone.utc)
            slot_end = slot_start + timedelta(minutes=rule.slot_minutes)
            key = slot_start.isoformat()
            if key not in seen:
                seen.add(key)
                blocked = any(
                    slot_start < _aware(item.end_at) and slot_end > _aware(item.start_at)
                    for item in exceptions
                )
                taken = any(
                    slot_start < _aware(item.scheduled_end)
                    and slot_end > _aware(item.scheduled_start)
                    for item in booked
                )
                slots.append(
                    {
                        "start": slot_start.isoformat(),
                        "end": slot_end.isoformat(),
                        "available": not blocked and not taken,
                    }
                )
            cursor = cursor + timedelta(minutes=rule.slot_minutes)
    slots.sort(key=lambda item: item["start"])
    return slots


def _assert_slot_free(doctor_id, start, end, exclude_id=None):
    query = Appointment.query.filter(
        Appointment.doctor_id == doctor_id,
        Appointment.status.in_(ACTIVE_STATUSES),
        Appointment.scheduled_start < end,
        Appointment.scheduled_end > start,
    )
    if exclude_id is not None:
        query = query.filter(Appointment.id != exclude_id)
    return query.first() is None


def create_appointment(
    data,
    actor,
    patient_id,
    source=AppointmentSource.RECEPTION,
    slot_minutes=30,
):
    doctor = get_doctor_or_404(data["doctor_id"])
    if not doctor.is_accepting_appointments:
        raise conflict("Doctor is not accepting appointments")
    from app.patients.models import PatientProfile

    patient = PatientProfile.query.get(patient_id)
    if patient is None:
        raise not_found("Patient not found")

    start = _aware(data["scheduled_start"])
    end = start + timedelta(minutes=slot_minutes)
    if start < utcnow() - timedelta(minutes=5):
        raise bad_request("Cannot book an appointment in the past")

    # Serialize bookings per doctor to protect against concurrent double booking.
    db.session.execute(
        db.select(DoctorProfile).where(DoctorProfile.id == doctor.id).with_for_update()
    )
    if not _assert_slot_free(doctor.id, start, end):
        raise conflict("That appointment slot is already booked")

    service = None
    if data.get("service_id"):
        service = Service.query.get(data["service_id"])
        if service is None:
            raise not_found("Service not found")

    appointment = Appointment(
        patient_id=patient.id,
        doctor_id=doctor.id,
        service_id=service.id if service else None,
        department_id=doctor.department_id,
        scheduled_start=start,
        scheduled_end=end,
        status=AppointmentStatus.SCHEDULED
        if source != AppointmentSource.WALK_IN
        else AppointmentStatus.CHECKED_IN,
        source=source,
        urgency=data.get("urgency", Urgency.ROUTINE),
        booked_by_id=actor.id if actor else None,
        checked_in_at=utcnow() if source == AppointmentSource.WALK_IN else None,
        notes=data.get("notes"),
    )
    db.session.add(appointment)
    db.session.flush()
    enqueue_event(
        "appointment.created",
        "appointment",
        appointment.id,
        {
            "appointment_id": str(appointment.id),
            "patient_id": str(patient.id),
            "doctor_id": str(doctor.id),
        },
    )
    record_audit(
        "appointment.create",
        "appointment",
        appointment.id,
        actor=actor,
        after={"status": appointment.status.value, "source": source.value},
    )
    db.session.commit()
    return appointment


def transition(appointment, new_status, actor, reason=None):
    if new_status == appointment.status:
        return appointment
    allowed = TRANSITIONS.get(appointment.status, set())
    if new_status not in allowed:
        raise conflict(
            f"Cannot move appointment from {appointment.status.value} to {new_status.value}"
        )
    now = utcnow()
    appointment.status = new_status
    if new_status == AppointmentStatus.CHECKED_IN:
        appointment.checked_in_at = now
    elif new_status == AppointmentStatus.IN_CONSULTATION:
        appointment.started_at = now
    elif new_status == AppointmentStatus.COMPLETED:
        appointment.completed_at = now
    elif new_status == AppointmentStatus.CANCELLED:
        appointment.cancelled_at = now
        appointment.cancellation_reason = reason
    record_audit(
        "appointment.status_change",
        "appointment",
        appointment.id,
        actor=actor,
        after={"status": new_status.value, "reason": reason},
    )
    enqueue_event(
        "appointment.status_changed",
        "appointment",
        appointment.id,
        {"appointment_id": str(appointment.id), "status": new_status.value},
    )
    db.session.commit()
    return appointment


def cancel(appointment, actor, reason, actor_role):
    if appointment.status in {
        AppointmentStatus.COMPLETED,
        AppointmentStatus.CANCELLED,
        AppointmentStatus.NO_SHOW,
    }:
        raise conflict("Appointment cannot be cancelled in its current state")
    if actor_role == Role.PATIENT:
        cutoff = current_app.config["APPOINTMENT_CANCELLATION_CUTOFF_HOURS"]
        if _aware(appointment.scheduled_start) - utcnow() < timedelta(hours=cutoff):
            raise forbidden(f"Appointments must be cancelled at least {cutoff} hours in advance")
    return transition(appointment, AppointmentStatus.CANCELLED, actor, reason)


def reschedule(appointment, new_start, actor, reason=None):
    if appointment.status not in {AppointmentStatus.SCHEDULED}:
        raise conflict("Only scheduled appointments can be rescheduled")
    new_start = _aware(new_start)
    if new_start < utcnow():
        raise bad_request("New appointment time is in the past")
    end = new_start + (appointment.scheduled_end - appointment.scheduled_start)
    db.session.execute(
        db.select(DoctorProfile).where(DoctorProfile.id == appointment.doctor_id).with_for_update()
    )
    if not _assert_slot_free(appointment.doctor_id, new_start, end, exclude_id=appointment.id):
        raise conflict("That appointment slot is already booked")
    appointment.status = AppointmentStatus.CANCELLED
    appointment.cancelled_at = utcnow()
    appointment.cancellation_reason = reason or "RESCHEDULED"
    replacement = Appointment(
        patient_id=appointment.patient_id,
        doctor_id=appointment.doctor_id,
        service_id=appointment.service_id,
        department_id=appointment.department_id,
        scheduled_start=new_start,
        scheduled_end=end,
        status=AppointmentStatus.SCHEDULED,
        source=appointment.source,
        urgency=appointment.urgency,
        booked_by_id=actor.id if actor else None,
        rescheduled_from_id=appointment.id,
        notes=appointment.notes,
    )
    db.session.add(replacement)
    db.session.flush()
    record_audit(
        "appointment.reschedule",
        "appointment",
        replacement.id,
        actor=actor,
        before={"appointment_id": str(appointment.id)},
        after={"scheduled_start": new_start.isoformat()},
    )
    db.session.commit()
    return replacement


def queue(doctor_id=None, target_date=None):
    target_date = target_date or date.today()
    start = datetime.combine(target_date, time.min, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    query = Appointment.query.filter(
        Appointment.scheduled_start >= start,
        Appointment.scheduled_start < end,
        Appointment.status.in_(
            {
                AppointmentStatus.SCHEDULED,
                AppointmentStatus.CHECKED_IN,
                AppointmentStatus.IN_CONSULTATION,
            }
        ),
    )
    if doctor_id is not None:
        from uuid import UUID

        if isinstance(doctor_id, str):
            doctor_id = UUID(doctor_id)
        query = query.filter(Appointment.doctor_id == doctor_id)
    urgency_order = {
        Urgency.EMERGENCY: 0,
        Urgency.URGENT: 1,
        Urgency.ROUTINE: 2,
    }
    items = query.all()
    items.sort(
        key=lambda item: (
            urgency_order.get(item.urgency, 3),
            _aware(item.scheduled_start),
        )
    )
    return items
