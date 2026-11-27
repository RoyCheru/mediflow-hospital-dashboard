from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from flask import current_app
from sqlalchemy import and_, or_

from app.common.audit import record_audit
from app.common.base import utcnow
from app.common.enums import (
    AppointmentSource,
    AppointmentStatus,
    Role,
    Urgency,
)
from app.common.errors import bad_request, conflict, forbidden, not_found
from app.common.locking import lock_row
from app.common.outbox import enqueue_event
from app.common.time import (
    hospital_day_bounds,
    hospital_timezone_name,
    hospital_today,
    hospital_tz,
)
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
    user = getattr(doctor, "user", None)
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


def visit_links_for_appointments(appointments):
    """Map appointment id -> {visit_id, visit_completed_at} in one query.

    Lets the queue tell a doctor which consultations are already open, so a
    reload can resume the visit instead of trying to create a second one.
    """
    from app.clinical_records.models import Visit

    appointment_ids = [item.id for item in appointments]
    if not appointment_ids:
        return {}
    rows = (
        db.session.query(Visit.appointment_id, Visit.id, Visit.completed_at)
        .filter(Visit.appointment_id.in_(appointment_ids))
        .all()
    )
    return {
        str(appointment_id): {
            "visit_id": str(visit_id),
            "visit_completed_at": _iso(_aware(completed_at)),
        }
        for appointment_id, visit_id, completed_at in rows
    }


def serialize_appointment(appointment, payer=None, visit_links=None):
    patient = getattr(appointment, "patient", None)
    doctor = getattr(appointment, "doctor", None)
    doctor_user = getattr(doctor, "user", None) if doctor is not None else None
    service = getattr(appointment, "service", None)
    department = getattr(appointment, "department", None)
    data = {
        "id": str(appointment.id),
        "patient_id": str(appointment.patient_id),
        "patient_name": " ".join(part for part in (patient.first_name, patient.last_name) if part)
        if patient is not None
        else None,
        "patient_number": getattr(patient, "patient_number", None),
        "doctor_id": str(appointment.doctor_id),
        "doctor_name": doctor_user.full_name if doctor_user is not None else None,
        "service_id": str(appointment.service_id) if appointment.service_id else None,
        "service_name": getattr(service, "name", None),
        "department_id": str(appointment.department_id) if appointment.department_id else None,
        "department_name": getattr(department, "name", None),
        "scheduled_start": _iso(_aware(appointment.scheduled_start)),
        "scheduled_end": _iso(_aware(appointment.scheduled_end)),
        "arrived_at": _iso(_aware(appointment.arrived_at)),
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
        "follow_up_of_visit_id": str(appointment.follow_up_of_visit_id)
        if appointment.follow_up_of_visit_id
        else None,
        "created_at": _iso(_aware(appointment.created_at)),
    }
    if payer is not None:
        data["payer"] = payer
        data["copay_due_minor"] = payer.get("copay_due_minor", 0)
    if visit_links is not None:
        link = visit_links.get(str(appointment.id), {})
        data["visit_id"] = link.get("visit_id")
        data["visit_completed_at"] = link.get("visit_completed_at")
    return data


def serialize_rule(rule):
    return {
        "id": str(rule.id),
        "doctor_id": str(rule.doctor_id) if rule.doctor_id else None,
        "user_id": str(rule.user_id) if rule.user_id else None,
        "owner_type": "doctor" if rule.doctor_id else "staff",
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
        "doctor_id": str(exception.doctor_id) if exception.doctor_id else None,
        "user_id": str(exception.user_id) if exception.user_id else None,
        "owner_type": "doctor" if exception.doctor_id else "staff",
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


def owner_for_user(user):
    from app.scheduling.models import DoctorProfile

    doctor = DoctorProfile.query.filter_by(user_id=user.id).first()
    if doctor is not None:
        return {
            "doctor": doctor,
            "doctor_id": doctor.id,
            "user_id": None,
            "is_doctor": True,
            "user": user,
        }
    return {
        "doctor": None,
        "doctor_id": None,
        "user_id": user.id,
        "is_doctor": False,
        "user": user,
    }


def owner_for_doctor(doctor):
    return {
        "doctor": doctor,
        "doctor_id": doctor.id,
        "user_id": None,
        "is_doctor": True,
        "user": doctor.user,
    }


def _hospital_aware(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=hospital_tz())
    return value.astimezone(timezone.utc)


def _owner_values(owner):
    return {"doctor_id": owner["doctor_id"], "user_id": owner["user_id"]}


def _owner_filter(model, owner):
    if owner["doctor_id"] is not None:
        return model.doctor_id == owner["doctor_id"]
    return model.user_id == owner["user_id"]


def _audit_owner(owner):
    return {
        "staff_user_id": str(owner["user"].id),
        "doctor_id": str(owner["doctor_id"]) if owner["doctor_id"] else None,
    }


def create_rule_for_owner(owner, data, actor=None):
    rule = AvailabilityRule(
        **_owner_values(owner),
        weekday=data["weekday"],
        start_time=data["start_time"],
        end_time=data["end_time"],
        slot_minutes=data.get("slot_minutes", 30),
        timezone=data.get("timezone") or hospital_timezone_name(),
        effective_from=data.get("effective_from"),
        effective_to=data.get("effective_to"),
        is_active=data.get("is_active", True),
    )
    if rule.end_time <= rule.start_time:
        raise bad_request("end_time must be after start_time")
    db.session.add(rule)
    db.session.flush()
    if actor is not None:
        record_audit(
            "availability.rule_create",
            "availability_rule",
            rule.id,
            actor=actor,
            after={**_audit_owner(owner), "rule": serialize_rule(rule)},
        )
    db.session.commit()
    return rule


def create_rule(doctor, data, actor=None):
    return create_rule_for_owner(owner_for_doctor(doctor), data, actor=actor)


def update_rule(rule, data, actor=None):
    before = serialize_rule(rule)
    for field in (
        "weekday",
        "start_time",
        "end_time",
        "slot_minutes",
        "timezone",
        "effective_from",
        "effective_to",
        "is_active",
    ):
        if field in data:
            setattr(rule, field, data[field])
    if rule.end_time <= rule.start_time:
        raise bad_request("end_time must be after start_time")
    if actor is not None:
        owner = owner_for_user(rule.doctor.user if rule.doctor_id else rule.user)
        record_audit(
            "availability.rule_update",
            "availability_rule",
            rule.id,
            actor=actor,
            before={**_audit_owner(owner), "rule": before},
            after={**_audit_owner(owner), "rule": serialize_rule(rule)},
        )
    db.session.commit()
    return rule


def delete_rule_for_owner(rule_id, owner, actor=None):
    rule = AvailabilityRule.query.filter(
        AvailabilityRule.id == rule_id,
        _owner_filter(AvailabilityRule, owner),
    ).first()
    if rule is None:
        raise not_found("Availability rule not found")
    before = serialize_rule(rule)
    rule.is_active = False
    if actor is not None:
        record_audit(
            "availability.rule_delete",
            "availability_rule",
            rule.id,
            actor=actor,
            before={**_audit_owner(owner), "rule": before},
            after={**_audit_owner(owner), "is_active": False},
        )
    db.session.commit()
    return rule


def delete_rule(rule_id, doctor, actor=None):
    return delete_rule_for_owner(rule_id, owner_for_doctor(doctor), actor=actor)


def create_exception_for_owner(owner, data, actor=None):
    start_at = _hospital_aware(data["start_at"])
    end_at = _hospital_aware(data["end_at"])
    if end_at <= start_at:
        raise bad_request("end_at must be after start_at")
    exception = AvailabilityException(
        **_owner_values(owner),
        start_at=start_at,
        end_at=end_at,
        kind=data.get("kind"),
        reason=data.get("reason"),
    )
    db.session.add(exception)
    db.session.flush()
    if actor is not None:
        record_audit(
            "availability.exception_create",
            "availability_exception",
            exception.id,
            actor=actor,
            after={**_audit_owner(owner), "exception": serialize_exception(exception)},
        )
    db.session.commit()
    return exception


def create_exception(doctor, data, actor=None):
    return create_exception_for_owner(owner_for_doctor(doctor), data, actor=actor)


def update_exception(exception, data, actor=None):
    before = serialize_exception(exception)
    for field in ("start_at", "end_at", "kind", "reason"):
        if field in data:
            value = data[field]
            if field in {"start_at", "end_at"}:
                value = _hospital_aware(value)
            setattr(exception, field, value)
    if exception.end_at <= exception.start_at:
        raise bad_request("end_at must be after start_at")
    if actor is not None:
        owner = owner_for_user(exception.doctor.user if exception.doctor_id else exception.user)
        record_audit(
            "availability.exception_update",
            "availability_exception",
            exception.id,
            actor=actor,
            before={**_audit_owner(owner), "exception": before},
            after={**_audit_owner(owner), "exception": serialize_exception(exception)},
        )
    db.session.commit()
    return exception


def delete_exception(exception, actor=None):
    before = serialize_exception(exception)
    if actor is not None:
        owner = owner_for_user(exception.doctor.user if exception.doctor_id else exception.user)
        record_audit(
            "availability.exception_delete",
            "availability_exception",
            exception.id,
            actor=actor,
            before={**_audit_owner(owner), "exception": before},
            after={**_audit_owner(owner), "deleted": True},
        )
    db.session.delete(exception)
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
        Appointment.scheduled_start.isnot(None),
        Appointment.scheduled_end.isnot(None),
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
    commit=True,
):
    doctor = get_doctor_or_404(data["doctor_id"])
    if not doctor.is_accepting_appointments:
        raise conflict("Doctor is not accepting appointments")
    from app.patients.models import PatientProfile

    patient = PatientProfile.query.get(patient_id)
    if patient is None:
        raise not_found("Patient not found")

    service = None
    if data.get("service_id"):
        service = Service.query.get(data["service_id"])
        if service is None:
            raise not_found("Service not found")

    now = utcnow()
    if source == AppointmentSource.WALK_IN:
        start = None
        end = None
        status = AppointmentStatus.CHECKED_IN
        arrived_at = now
        checked_in_at = now
    else:
        if not data.get("scheduled_start"):
            raise bad_request("A booked appointment requires a slot")
        start = _aware(data["scheduled_start"])
        end = start + timedelta(minutes=slot_minutes)
        if start < now - timedelta(minutes=5):
            raise bad_request("Cannot book an appointment in the past")

        # Serialize bookings per doctor to protect against concurrent double booking.
        lock_row(DoctorProfile, doctor.id)
        if not _assert_slot_free(doctor.id, start, end):
            raise conflict("That appointment slot is already booked")
        status = AppointmentStatus.SCHEDULED
        arrived_at = None
        checked_in_at = None

    appointment = Appointment(
        patient_id=patient.id,
        doctor_id=doctor.id,
        service_id=service.id if service else None,
        department_id=doctor.department_id,
        scheduled_start=start,
        scheduled_end=end,
        arrived_at=arrived_at,
        status=status,
        source=source,
        urgency=data.get("urgency", Urgency.ROUTINE),
        booked_by_id=actor.id if actor else None,
        checked_in_at=checked_in_at,
        follow_up_of_visit_id=data.get("follow_up_of_visit_id"),
        notes=data.get("notes"),
    )
    db.session.add(appointment)
    db.session.flush()

    if source == AppointmentSource.WALK_IN:
        from app.billing.service import ensure_draft_invoice_for_appointment

        ensure_draft_invoice_for_appointment(appointment, actor, commit=False)

    if source == AppointmentSource.WALK_IN:
        audit_action = "appointment.walk_in"
    elif source == AppointmentSource.FOLLOW_UP:
        audit_action = "appointment.follow_up"
    else:
        audit_action = "appointment.create"

    if source != AppointmentSource.WALK_IN:
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
        audit_action,
        "appointment",
        appointment.id,
        actor=actor,
        after={
            "status": appointment.status.value,
            "source": source.value,
            "arrived_at": _iso(arrived_at),
        },
    )
    if commit:
        db.session.commit()
    else:
        db.session.flush()
    return appointment


def _refuse_duplicate_walk_in(patient_id, doctor_id):
    """A patient already waiting or in consultation with this doctor today is
    not queued twice (double submit, or two desks adding the same person)."""
    from uuid import UUID

    if isinstance(doctor_id, str):
        doctor_id = UUID(doctor_id)
    active = next(
        (
            item
            for item in queue(doctor_id=doctor_id, target_date=hospital_today())
            if item.patient_id == patient_id
        ),
        None,
    )
    if active is not None:
        raise conflict(
            "This patient is already in today's queue for this doctor",
            {"appointment_id": str(active.id), "status": active.status.value},
        )


def create_walk_in_appointment(data, actor):
    """Create a walk-in appointment and its patient in a single transaction."""
    from app.patients import service as patients_service
    from app.patients.models import PatientProfile

    patient_payload = data.get("patient")
    patient_id = data.get("patient_id")
    if patient_id and patient_payload:
        raise bad_request("Provide patient_id or a new patient payload, not both")
    if not patient_id and not patient_payload:
        raise bad_request("patient_id or a new patient payload is required")

    try:
        duplicates = []
        if patient_id:
            patient = PatientProfile.query.get(patient_id)
            if patient is None:
                raise not_found("Patient not found")
            _refuse_duplicate_walk_in(patient.id, data.get("doctor_id"))
        else:
            patient, duplicates = patients_service.register_patient(
                patient_payload, actor=actor, commit=False
            )

        appointment = create_appointment(
            data,
            actor,
            patient.id,
            source=AppointmentSource.WALK_IN,
            commit=False,
        )
        queue_items = queue(
            doctor_id=appointment.doctor_id,
            target_date=hospital_today(),
        )
        position = next(
            (index + 1 for index, item in enumerate(queue_items) if item.id == appointment.id),
            None,
        )
        db.session.commit()
        return appointment, position, duplicates
    except Exception:
        db.session.rollback()
        raise


def transition(appointment, new_status, actor, reason=None, commit=True):
    if new_status == appointment.status:
        return appointment
    if new_status == AppointmentStatus.NO_SHOW and appointment.source == AppointmentSource.WALK_IN:
        raise conflict("Walk-in appointments cannot be marked as no-show")
    allowed = TRANSITIONS.get(appointment.status, set())
    if new_status not in allowed:
        raise conflict(
            f"Cannot move appointment from {appointment.status.value} to {new_status.value}"
        )
    now = utcnow()
    appointment.status = new_status
    if new_status == AppointmentStatus.CHECKED_IN:
        appointment.checked_in_at = now
        appointment.arrived_at = appointment.arrived_at or now
    elif new_status == AppointmentStatus.IN_CONSULTATION:
        appointment.started_at = now
    elif new_status == AppointmentStatus.COMPLETED:
        appointment.completed_at = now
    elif new_status == AppointmentStatus.CANCELLED:
        appointment.cancelled_at = now
        appointment.cancellation_reason = reason
    if new_status == AppointmentStatus.CHECKED_IN:
        # The encounter bill starts at check-in and is finalized at the desk.
        from app.billing.service import ensure_draft_invoice_for_appointment

        ensure_draft_invoice_for_appointment(appointment, actor, commit=False)
    elif new_status in {AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW}:
        # The patient was not seen: their open draft can never become payable.
        from app.billing.service import void_open_draft

        void_open_draft(appointment, actor, f"Appointment {new_status.value.lower()}")
    record_audit(
        "appointment.status_change",
        "appointment",
        appointment.id,
        actor=actor,
        after={
            "status": new_status.value,
            "source": appointment.source.value,
            "reason": reason,
        },
    )
    enqueue_event(
        "appointment.status_changed",
        "appointment",
        appointment.id,
        {"appointment_id": str(appointment.id), "status": new_status.value},
    )
    if commit:
        db.session.commit()
    return appointment


def cancel(appointment, actor, reason, actor_role):
    if appointment.status in {
        AppointmentStatus.COMPLETED,
        AppointmentStatus.CANCELLED,
        AppointmentStatus.NO_SHOW,
    }:
        raise conflict("Appointment cannot be cancelled in its current state")
    if actor_role == Role.PATIENT and appointment.scheduled_start is not None:
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
    lock_row(DoctorProfile, appointment.doctor_id)
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


def _effective_time(appointment):
    if appointment.source == AppointmentSource.WALK_IN:
        return _aware(appointment.arrived_at) or _aware(appointment.created_at)
    return (
        _aware(appointment.scheduled_start)
        or _aware(appointment.arrived_at)
        or _aware(appointment.created_at)
    )


def queue(doctor_id=None, target_date=None, department_id=None):
    target_date = target_date or hospital_today()
    start, end = hospital_day_bounds(target_date)
    query = Appointment.query.filter(
        Appointment.status.in_(
            {
                AppointmentStatus.CHECKED_IN,
                AppointmentStatus.IN_CONSULTATION,
            }
        ),
        or_(
            and_(
                Appointment.source != AppointmentSource.WALK_IN,
                Appointment.scheduled_start >= start,
                Appointment.scheduled_start < end,
            ),
            and_(
                Appointment.source == AppointmentSource.WALK_IN,
                Appointment.arrived_at >= start,
                Appointment.arrived_at < end,
            ),
        ),
    )
    if doctor_id is not None:
        from uuid import UUID

        if isinstance(doctor_id, str):
            doctor_id = UUID(doctor_id)
        query = query.filter(Appointment.doctor_id == doctor_id)
    if department_id is not None:
        from uuid import UUID

        if isinstance(department_id, str):
            department_id = UUID(department_id)
        query = query.filter(Appointment.department_id == department_id)
    urgency_order = {
        Urgency.EMERGENCY: 0,
        Urgency.URGENT: 1,
        Urgency.ROUTINE: 2,
    }
    items = query.all()
    items.sort(
        key=lambda item: (
            urgency_order.get(item.urgency, 3),
            _effective_time(item),
            _aware(item.arrived_at) or _aware(item.created_at),
            str(item.id),
        )
    )
    return items
