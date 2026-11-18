from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from flask import current_app
from sqlalchemy import and_, func, or_

from app.auth.models import User
from app.common.base import as_utc, utcnow
from app.common.enums import (
    AppointmentSource,
    AppointmentStatus,
    AvailabilityExceptionKind,
    Role,
    Urgency,
    UserStatus,
)
from app.common.errors import bad_request, not_found
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
    DoctorProfile,
)
from app.scheduling.service import ACTIVE_STATUSES, queue, serialize_exception, serialize_rule


def _aware(value):
    return as_utc(value)


def _iso(value):
    return value.isoformat() if value else None


def _person(user):
    return getattr(user, "full_name", None) or " ".join(
        part
        for part in (getattr(user, "first_name", None), getattr(user, "last_name", None))
        if part
    )


def _doctor_user(doctor):
    if doctor is None:
        return None
    return getattr(doctor, "user", None)


def serialize_admin_appointment(appointment, payer=None):
    patient = getattr(appointment, "patient", None)
    doctor = getattr(appointment, "doctor", None)
    doctor_user = _doctor_user(doctor)
    department = getattr(appointment, "department", None)
    service = getattr(appointment, "service", None)
    data = {
        "id": str(appointment.id),
        "patient": {
            "id": str(appointment.patient_id),
            "name": " ".join(part for part in (patient.first_name, patient.last_name) if part)
            if patient is not None
            else None,
            "number": getattr(patient, "patient_number", None),
            "phone": getattr(patient, "phone", None),
        },
        "doctor": {
            "id": str(appointment.doctor_id),
            "name": _person(doctor_user) if doctor_user is not None else None,
        },
        "department": {
            "id": str(appointment.department_id) if appointment.department_id else None,
            "name": getattr(department, "name", None),
        },
        "service": {
            "id": str(appointment.service_id) if appointment.service_id else None,
            "name": getattr(service, "name", None),
        },
        "source": appointment.source.value,
        "status": appointment.status.value,
        "urgency": appointment.urgency.value,
        "notes": appointment.notes,
        "slot": _iso(_aware(appointment.scheduled_start)),
        "scheduled_end": _iso(_aware(appointment.scheduled_end)),
        "arrived_at": _iso(_aware(appointment.arrived_at)),
        "checked_in_at": _iso(_aware(appointment.checked_in_at)),
        "started_at": _iso(_aware(appointment.started_at)),
        "completed_at": _iso(_aware(appointment.completed_at)),
        "created_at": _iso(_aware(appointment.created_at)),
    }
    if payer is not None:
        data["payer"] = payer
        data["copay_due_minor"] = payer.get("copay_due_minor", 0)
    return data


def _parse_enum(value, enum_class, name):
    try:
        return enum_class(value)
    except (TypeError, ValueError) as exc:
        raise bad_request(f"Invalid {name}") from exc


def _parse_date(value, name):
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise bad_request(f"Invalid {name} date") from exc


def _date_range_filter(date_from, date_to):
    clauses = []
    if date_from is not None:
        start, _ = hospital_day_bounds(date_from)
        clauses.append(
            or_(
                and_(
                    Appointment.source != AppointmentSource.WALK_IN,
                    Appointment.scheduled_start >= start,
                ),
                and_(
                    Appointment.source == AppointmentSource.WALK_IN,
                    Appointment.arrived_at >= start,
                ),
            )
        )
    if date_to is not None:
        _, end = hospital_day_bounds(date_to)
        clauses.append(
            or_(
                and_(
                    Appointment.source != AppointmentSource.WALK_IN,
                    Appointment.scheduled_start < end,
                ),
                and_(
                    Appointment.source == AppointmentSource.WALK_IN,
                    Appointment.arrived_at < end,
                ),
            )
        )
    return clauses


def admin_appointments(
    date_from=None,
    date_to=None,
    status=None,
    source=None,
    doctor_id=None,
    department_id=None,
    q=None,
    sort="-slot",
):
    from app.common.pagination import pagination_args
    from app.patients.models import PatientProfile

    page, page_size = pagination_args()
    if date_from and date_to and date_from > date_to:
        raise bad_request("date_from must be before or equal to date_to")

    query = Appointment.query
    for clause in _date_range_filter(date_from, date_to):
        query = query.filter(clause)
    if status:
        query = query.filter(Appointment.status == _parse_enum(status, AppointmentStatus, "status"))
    if source:
        query = query.filter(Appointment.source == _parse_enum(source, AppointmentSource, "source"))
    if doctor_id:
        try:
            query = query.filter(Appointment.doctor_id == UUID(str(doctor_id)))
        except (TypeError, ValueError) as exc:
            raise bad_request("Invalid doctor_id") from exc
    if department_id:
        try:
            query = query.filter(Appointment.department_id == UUID(str(department_id)))
        except (TypeError, ValueError) as exc:
            raise bad_request("Invalid department_id") from exc
    if q:
        terms = [term for term in q.split() if term]
        conditions = []
        for term in terms:
            like = f"%{term}%"
            conditions.append(
                or_(
                    PatientProfile.first_name.ilike(like),
                    PatientProfile.last_name.ilike(like),
                    PatientProfile.patient_number.ilike(like),
                    PatientProfile.phone.ilike(like),
                )
            )
        if conditions:
            query = query.filter(Appointment.patient.has(and_(*conditions)))

    field = (sort or "-slot").lstrip("-")
    descending = (sort or "-slot").startswith("-")
    effective = func.coalesce(
        Appointment.scheduled_start,
        Appointment.arrived_at,
        Appointment.created_at,
    )
    columns = {
        "slot": effective,
        "arrived_at": func.coalesce(
            Appointment.arrived_at,
            Appointment.scheduled_start,
            Appointment.created_at,
        ),
        "created_at": Appointment.created_at,
        "status": Appointment.status,
        "source": Appointment.source,
    }
    column = columns.get(field)
    if column is None:
        raise bad_request("Invalid sort field")
    query = query.order_by(column.desc() if descending else column.asc(), Appointment.id.asc())
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    pages = (total + page_size - 1) // page_size if total else 0

    from app.claims.service import payer_summaries_for_appointments

    payers = payer_summaries_for_appointments(items)
    return {
        "data": [
            serialize_admin_appointment(item, payer=payers.get(str(item.id))) for item in items
        ],
        "meta": {"page": page, "page_size": page_size, "total": total, "pages": pages},
    }


def _waiting_minutes(appointment, now):
    if appointment.status == AppointmentStatus.CHECKED_IN:
        reference = appointment.arrived_at or appointment.created_at
        if reference is None:
            return 0
        return max(int((now - _aware(reference)).total_seconds() // 60), 0)
    if appointment.status == AppointmentStatus.IN_CONSULTATION:
        if appointment.started_at and appointment.arrived_at:
            return max(
                int(
                    (
                        _aware(appointment.started_at) - _aware(appointment.arrived_at)
                    ).total_seconds()
                    // 60
                ),
                0,
            )
        return 0
    return 0


def _queue_entry(appointment, position, now, payer=None):
    data = {
        "position": position,
        "appointment_id": str(appointment.id),
        "patient": {
            "id": str(appointment.patient_id),
            "name": " ".join(
                part
                for part in (appointment.patient.first_name, appointment.patient.last_name)
                if part
            )
            if appointment.patient is not None
            else None,
            "number": getattr(appointment.patient, "patient_number", None),
        },
        "source": appointment.source.value,
        "urgent": appointment.urgency in {Urgency.URGENT, Urgency.EMERGENCY},
        "status": appointment.status.value,
        "arrived_at": _iso(_aware(appointment.arrived_at)),
        "waiting_minutes": _waiting_minutes(appointment, now),
        "slot": _iso(_aware(appointment.scheduled_start)),
    }
    if payer is not None:
        data["payer"] = payer
        data["copay_due_minor"] = payer.get("copay_due_minor", 0)
    return data


def admin_queue(doctor_id=None, department_id=None):
    target_date = hospital_today()
    items = queue(
        doctor_id=doctor_id,
        target_date=target_date,
        department_id=department_id,
    )
    now = utcnow()
    threshold = current_app.config.get("QUEUE_WAITING_THRESHOLD_MINUTES", 30)
    start, end = hospital_day_bounds(target_date)

    from app.claims.service import payer_summaries_for_appointments

    payers = payer_summaries_for_appointments(items)

    doctor_ids = {item.doctor_id for item in items}
    completed_counts = {}
    if doctor_ids:
        effective = func.coalesce(
            Appointment.scheduled_start,
            Appointment.arrived_at,
            Appointment.created_at,
        )
        completed_counts = dict(
            db.session.query(Appointment.doctor_id, func.count(Appointment.id))
            .filter(
                Appointment.doctor_id.in_(doctor_ids),
                Appointment.status == AppointmentStatus.COMPLETED,
                effective >= start,
                effective < end,
            )
            .group_by(Appointment.doctor_id)
            .all()
        )

    grouped = {}
    order = []
    for item in items:
        key = str(item.doctor_id)
        if key not in grouped:
            doctor = item.doctor
            doctor_user = _doctor_user(doctor)
            department = item.department or getattr(doctor, "department", None)
            grouped[key] = {
                "doctor": {
                    "id": key,
                    "name": _person(doctor_user) if doctor_user is not None else None,
                },
                "department": {
                    "id": str(department.id) if department is not None else None,
                    "name": getattr(department, "name", None),
                },
                "counts": {
                    "waiting": 0,
                    "in_consultation": 0,
                    "completed_today": int(completed_counts.get(item.doctor_id, 0)),
                },
                "entries": [],
            }
            order.append(key)
        bucket = grouped[key]
        position = len(bucket["entries"]) + 1
        bucket["entries"].append(_queue_entry(item, position, now, payer=payers.get(str(item.id))))
        if item.status == AppointmentStatus.CHECKED_IN:
            bucket["counts"]["waiting"] += 1
        elif item.status == AppointmentStatus.IN_CONSULTATION:
            bucket["counts"]["in_consultation"] += 1

    doctors = [grouped[key] for key in order]
    return {
        "date": target_date.isoformat(),
        "timezone": hospital_timezone_name(),
        "generated_at": now.isoformat(),
        "waiting_threshold_minutes": threshold,
        "total_waiting": sum(item["counts"]["waiting"] for item in doctors),
        "doctors": doctors,
    }


def _staff_query(q=None, role=None, status=None):
    query = User.query.filter(User.role != Role.PATIENT)
    if role:
        query = query.filter(User.role == _parse_enum(role, Role, "role"))
    if status:
        query = query.filter(User.status == _parse_enum(status, UserStatus, "status"))
    if q:
        terms = [term for term in q.split() if term]
        conditions = []
        for term in terms:
            like = f"%{term}%"
            conditions.append(
                or_(
                    User.first_name.ilike(like),
                    User.last_name.ilike(like),
                    User.email.ilike(like),
                    User.phone.ilike(like),
                )
            )
        if conditions:
            query = query.filter(and_(*conditions))
    return query.order_by(User.last_name.asc(), User.first_name.asc())


def _rules_for_owners(doctor_ids, user_ids):
    clauses = []
    if doctor_ids:
        clauses.append(AvailabilityRule.doctor_id.in_(doctor_ids))
    if user_ids:
        clauses.append(AvailabilityRule.user_id.in_(user_ids))
    if not clauses:
        return []
    return AvailabilityRule.query.filter(or_(*clauses)).all()


def _exceptions_overlapping(doctor_ids, user_ids, start, end):
    clauses = []
    if doctor_ids:
        clauses.append(AvailabilityException.doctor_id.in_(doctor_ids))
    if user_ids:
        clauses.append(AvailabilityException.user_id.in_(user_ids))
    if not clauses:
        return []
    return AvailabilityException.query.filter(
        or_(*clauses),
        AvailabilityException.start_at < end,
        AvailabilityException.end_at > start,
    ).all()


def _on_leave(exceptions, target_date):
    start, end = hospital_day_bounds(target_date)
    return any(
        item.kind == AvailabilityExceptionKind.LEAVE
        and _aware(item.start_at) < end
        and _aware(item.end_at) > start
        for item in exceptions
    )


def _rule_applies(rule, target_date):
    if not rule.is_active or rule.weekday != target_date.weekday():
        return False
    if rule.effective_from and target_date < rule.effective_from:
        return False
    if rule.effective_to and target_date > rule.effective_to:
        return False
    return True


def _working_hours(rules, target_date):
    return [
        {"start": rule.start_time.strftime("%H:%M"), "end": rule.end_time.strftime("%H:%M")}
        for rule in rules
        if _rule_applies(rule, target_date)
    ]


def _rule_slots(rule, target_date):
    tz = hospital_tz()
    cursor = datetime.combine(target_date, rule.start_time, tzinfo=tz)
    rule_end = datetime.combine(target_date, rule.end_time, tzinfo=tz)
    while cursor + timedelta(minutes=rule.slot_minutes) <= rule_end:
        yield cursor, cursor + timedelta(minutes=rule.slot_minutes)
        cursor += timedelta(minutes=rule.slot_minutes)


def _slot_blocked(slot_start, slot_end, exceptions):
    return any(
        slot_start < _aware(item.end_at) and slot_end > _aware(item.start_at) for item in exceptions
    )


def _slot_booked(slot_start, slot_end, appointments):
    for appointment in appointments:
        if appointment.scheduled_start is None or appointment.scheduled_end is None:
            continue
        start = _aware(appointment.scheduled_start)
        end = _aware(appointment.scheduled_end)
        if slot_start < end and slot_end > start:
            return appointment
    return None


def _next_available_slot(doctor_id, now=None, days=14):
    now = now or utcnow()
    rules = (
        AvailabilityRule.query.filter_by(doctor_id=doctor_id, is_active=True)
        .order_by(AvailabilityRule.weekday, AvailabilityRule.start_time)
        .all()
    )
    if not rules:
        return None
    start_date = hospital_today(now)
    range_start, _ = hospital_day_bounds(start_date)
    _, range_end = hospital_day_bounds(start_date + timedelta(days=days))
    exceptions = AvailabilityException.query.filter(
        AvailabilityException.doctor_id == doctor_id,
        AvailabilityException.start_at < range_end,
        AvailabilityException.end_at > range_start,
    ).all()
    appointments = Appointment.query.filter(
        Appointment.doctor_id == doctor_id,
        Appointment.status.in_(ACTIVE_STATUSES),
        Appointment.scheduled_start >= range_start,
        Appointment.scheduled_start < range_end,
    ).all()
    for offset in range(days):
        target_date = start_date + timedelta(days=offset)
        day_rules = [rule for rule in rules if _rule_applies(rule, target_date)]
        for rule in day_rules:
            for local_start, local_end in _rule_slots(rule, target_date):
                slot_start = local_start.astimezone(timezone.utc)
                slot_end = local_end.astimezone(timezone.utc)
                if slot_start < now:
                    continue
                if _slot_blocked(slot_start, slot_end, exceptions):
                    continue
                if _slot_booked(slot_start, slot_end, appointments):
                    continue
                return _iso(slot_start)
    return None


def _in_consultation_today(doctor_ids):
    """Doctors with an IN_CONSULTATION appointment whose effective time is today."""
    if not doctor_ids:
        return set()
    start, end = hospital_day_bounds(hospital_today())
    effective = func.coalesce(
        Appointment.scheduled_start,
        Appointment.arrived_at,
        Appointment.created_at,
    )
    return {
        doctor_id
        for (doctor_id,) in db.session.query(Appointment.doctor_id)
        .filter(
            Appointment.doctor_id.in_(list(doctor_ids)),
            Appointment.status == AppointmentStatus.IN_CONSULTATION,
            effective >= start,
            effective < end,
        )
        .distinct()
        .all()
    }


def _belongs_to(item, doctor_id, user_id):
    """True when a rule/exception is owned by this doctor profile or staff user."""
    if doctor_id is not None:
        return item.doctor_id == doctor_id
    return item.doctor_id is None and item.user_id == user_id


def _today_status(doctor, rules, exceptions, in_consultation_doctor_ids, target_date):
    if _on_leave(exceptions, target_date):
        return "on_leave"
    if doctor is not None and doctor.id in in_consultation_doctor_ids:
        return "in_consultation"
    if _working_hours(rules, target_date):
        return "available"
    return "off_today"


def _staff_item(user, doctor, rules, exceptions, in_consultation_doctor_ids):
    target_date = hospital_today()
    hours = _working_hours(rules, target_date)
    is_doctor = doctor is not None
    today_status = _today_status(doctor, rules, exceptions, in_consultation_doctor_ids, target_date)
    return {
        "id": str(user.id),
        "user_id": str(user.id),
        "full_name": _person(user),
        "email": user.email,
        "phone": user.phone,
        "role": user.role.value,
        "status": user.status.value,
        "doctor_id": str(doctor.id) if doctor else None,
        "department": {
            "id": str(doctor.department_id) if doctor and doctor.department_id else None,
            "name": getattr(doctor.department, "name", None) if doctor else None,
        },
        "specialty": doctor.specialty if doctor else None,
        "license_number": doctor.license_number if doctor else None,
        "consultation_fee_minor": doctor.consultation_fee_minor if doctor else None,
        "is_accepting_appointments": doctor.is_accepting_appointments if doctor else None,
        "today_status": today_status,
        "today_working_hours": hours,
        "next_available_slot": _next_available_slot(doctor.id) if is_doctor else None,
    }


def admin_staff(q=None, role=None, status=None):
    from app.common.pagination import pagination_args

    page, page_size = pagination_args()
    query = _staff_query(q=q, role=role, status=status)
    total = query.count()
    users = query.offset((page - 1) * page_size).limit(page_size).all()
    user_ids = [user.id for user in users]
    doctors = (
        DoctorProfile.query.filter(DoctorProfile.user_id.in_(user_ids)).all() if user_ids else []
    )
    doctor_by_user = {doctor.user_id: doctor for doctor in doctors}
    doctor_ids = [doctor.id for doctor in doctors]
    rules = _rules_for_owners(doctor_ids, user_ids)
    today_start, today_end = hospital_day_bounds(hospital_today())
    exceptions = _exceptions_overlapping(doctor_ids, user_ids, today_start, today_end)
    in_consultation = _in_consultation_today(doctor_ids)
    items = []
    for user in users:
        doctor = doctor_by_user.get(user.id)
        doctor_id = doctor.id if doctor else None
        owner_rules = [rule for rule in rules if _belongs_to(rule, doctor_id, user.id)]
        owner_exceptions = [item for item in exceptions if _belongs_to(item, doctor_id, user.id)]
        items.append(_staff_item(user, doctor, owner_rules, owner_exceptions, in_consultation))
    pages = (total + page_size - 1) // page_size if total else 0
    return {
        "data": items,
        "meta": {"page": page, "page_size": page_size, "total": total, "pages": pages},
    }


def working_today(target_date=None):
    """Staff with working hours on ``target_date`` (hospital day) and not on leave."""
    target_date = target_date or hospital_today()
    start, end = hospital_day_bounds(target_date)
    rules = [
        rule
        for rule in AvailabilityRule.query.filter_by(
            weekday=target_date.weekday(), is_active=True
        ).all()
        if _rule_applies(rule, target_date)
    ]
    doctor_ids = {rule.doctor_id for rule in rules if rule.doctor_id}
    user_ids = {rule.user_id for rule in rules if rule.user_id}
    exceptions = _exceptions_overlapping(doctor_ids, user_ids, start, end)
    # DoctorProfile.user and .department are eager-joined; one query each.
    doctors = (
        DoctorProfile.query.filter(DoctorProfile.id.in_(doctor_ids)).all() if doctor_ids else []
    )
    doctor_by_id = {doctor.id: doctor for doctor in doctors}
    users_by_id = (
        {user.id: user for user in User.query.filter(User.id.in_(user_ids)).all()}
        if user_ids
        else {}
    )

    merged = {}
    for rule in sorted(rules, key=lambda item: item.start_time):
        doctor = doctor_by_id.get(rule.doctor_id) if rule.doctor_id else None
        user = doctor.user if doctor else users_by_id.get(rule.user_id)
        if user is None or user.status != UserStatus.ACTIVE:
            continue
        owner_exceptions = [
            item for item in exceptions if _belongs_to(item, rule.doctor_id, rule.user_id)
        ]
        if _on_leave(owner_exceptions, target_date):
            continue
        hours = {"start": rule.start_time.strftime("%H:%M"), "end": rule.end_time.strftime("%H:%M")}
        key = str(user.id)
        if key in merged:
            merged[key]["working_hours"].append(hours)
            continue
        merged[key] = {
            "user_id": key,
            "full_name": _person(user),
            "role": user.role.value,
            "is_doctor": doctor is not None,
            "department": {
                "id": str(doctor.department_id) if doctor and doctor.department_id else None,
                "name": getattr(doctor.department, "name", None) if doctor else None,
            },
            "working_hours": [hours],
        }
    items = sorted(merged.values(), key=lambda item: item["full_name"])
    return {
        "date": target_date.isoformat(),
        "timezone": hospital_timezone_name(),
        "items": items,
    }


def staff_availability(user, date_from=None, date_to=None):
    from app.scheduling.service import owner_for_user

    date_from = date_from or hospital_today()
    date_to = date_to or (date_from + timedelta(days=6))
    if date_from > date_to:
        raise bad_request("from must be before or equal to to")
    if (date_to - date_from).days > 31:
        raise bad_request("Availability range cannot exceed 31 days")

    owner = owner_for_user(user)
    doctor = owner["doctor"]
    rules = (
        AvailabilityRule.query.filter(
            AvailabilityRule.doctor_id == doctor.id
            if doctor
            else AvailabilityRule.user_id == user.id
        )
        .order_by(AvailabilityRule.weekday, AvailabilityRule.start_time)
        .all()
    )
    range_start, _ = hospital_day_bounds(date_from)
    _, range_end = hospital_day_bounds(date_to)
    exceptions = (
        AvailabilityException.query.filter(
            AvailabilityException.doctor_id == doctor.id
            if doctor
            else AvailabilityException.user_id == user.id,
            AvailabilityException.start_at < range_end,
            AvailabilityException.end_at > range_start,
        )
        .order_by(AvailabilityException.start_at)
        .all()
    )
    appointments = []
    if doctor:
        appointments = Appointment.query.filter(
            Appointment.doctor_id == doctor.id,
            Appointment.status != AppointmentStatus.CANCELLED,
            Appointment.scheduled_start >= range_start,
            Appointment.scheduled_start < range_end,
        ).all()

    days = []
    cursor = date_from
    while cursor <= date_to:
        day_rules = [rule for rule in rules if _rule_applies(rule, cursor)]
        day_start, day_end = hospital_day_bounds(cursor)
        day_exceptions = [
            item
            for item in exceptions
            if _aware(item.start_at) < day_end and _aware(item.end_at) > day_start
        ]
        slots = []
        if doctor:
            for rule in day_rules:
                for local_start, local_end in _rule_slots(rule, cursor):
                    slot_start = local_start.astimezone(timezone.utc)
                    slot_end = local_end.astimezone(timezone.utc)
                    appointment = _slot_booked(slot_start, slot_end, appointments)
                    blocked = _slot_blocked(slot_start, slot_end, day_exceptions)
                    slots.append(
                        {
                            "start": _iso(slot_start),
                            "end": _iso(slot_end),
                            "available": not blocked and appointment is None,
                            "blocked": blocked,
                            "appointment": {
                                "id": str(appointment.id),
                                "patient_name": " ".join(
                                    part
                                    for part in (
                                        appointment.patient.first_name,
                                        appointment.patient.last_name,
                                    )
                                    if part
                                )
                                if appointment.patient
                                else None,
                                "status": appointment.status.value,
                                "source": appointment.source.value,
                            }
                            if appointment
                            else None,
                        }
                    )
        days.append(
            {
                "date": cursor.isoformat(),
                "weekday": cursor.weekday(),
                "working_hours": [
                    {
                        "start": rule.start_time.strftime("%H:%M"),
                        "end": rule.end_time.strftime("%H:%M"),
                    }
                    for rule in day_rules
                ],
                "on_leave": _on_leave(day_exceptions, cursor),
                "exceptions": [serialize_exception(item) for item in day_exceptions],
                "slots": slots,
            }
        )
        cursor += timedelta(days=1)

    target_date = hospital_today()
    today_start, today_end = hospital_day_bounds(target_date)
    owner_filter = (
        AvailabilityException.doctor_id == doctor.id
        if doctor
        else AvailabilityException.user_id == user.id
    )
    today_exceptions = AvailabilityException.query.filter(
        owner_filter,
        AvailabilityException.start_at < today_end,
        AvailabilityException.end_at > today_start,
    ).all()
    upcoming = (
        AvailabilityException.query.filter(owner_filter, AvailabilityException.end_at > utcnow())
        .order_by(AvailabilityException.start_at)
        .limit(50)
        .all()
    )
    in_consultation = _in_consultation_today({doctor.id}) if doctor else set()
    return {
        "staff": {
            "id": str(user.id),
            "user_id": str(user.id),
            "full_name": _person(user),
            "role": user.role.value,
            "doctor_id": str(doctor.id) if doctor else None,
        },
        "is_doctor": doctor is not None,
        "timezone": hospital_timezone_name(),
        "from": date_from.isoformat(),
        "to": date_to.isoformat(),
        "today_status": _today_status(
            doctor, rules, today_exceptions, in_consultation, target_date
        ),
        "today_working_hours": _working_hours(rules, target_date),
        "next_available_slot": _next_available_slot(doctor.id) if doctor else None,
        "weekly_pattern": [serialize_rule(rule) for rule in rules if rule.is_active],
        "exceptions": [serialize_exception(item) for item in exceptions],
        "upcoming_exceptions": [serialize_exception(item) for item in upcoming],
        "days": days,
    }


def find_staff_user(user_id):
    user = User.query.get(user_id)
    if user is None or user.role == Role.PATIENT:
        raise not_found("Staff member not found")
    return user
