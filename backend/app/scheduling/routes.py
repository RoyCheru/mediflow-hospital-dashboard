from datetime import date

from flask import Blueprint, request

from app.common.base import utcnow
from app.common.decorators import auth_required, current_user
from app.common.enums import AppointmentSource, AppointmentStatus, Role
from app.common.errors import bad_request, forbidden, not_found
from app.common.pagination import paginated
from app.common.permissions import patient_profile_for_user
from app.common.responses import created, ok
from app.extensions import db
from app.scheduling import service
from app.scheduling.models import (
    Appointment,
    AvailabilityException,
    AvailabilityRule,
    Department,
    DoctorProfile,
    Service,
)
from app.scheduling.schemas import (
    AppointmentAdminUpdateSchema,
    AppointmentCreateSchema,
    AvailabilityExceptionSchema,
    AvailabilityRuleSchema,
    CancelSchema,
    DepartmentSchema,
    DepartmentUpdateSchema,
    DoctorUpdateSchema,
    RescheduleSchema,
    ServicePriceSchema,
    ServiceSchema,
    ServiceUpdateSchema,
    WalkInSchema,
)

bp = Blueprint("scheduling", __name__)


def _doctor_for_user(user):
    doctor = DoctorProfile.query.filter_by(user_id=user.id).first()
    if doctor is None:
        raise not_found("Doctor profile not found")
    return doctor


def _patient_id_from_request(user, data):
    if user.role == Role.PATIENT:
        profile = patient_profile_for_user(user)
        if profile is None:
            raise not_found("Patient profile not found")
        return profile.id
    if not data.get("patient_id"):
        raise bad_request("patient_id is required for staff bookings")
    return data["patient_id"]


@bp.get("/departments")
@auth_required()
def list_departments():
    query = Department.query.order_by(Department.name)
    return ok({"items": [service.serialize_department(item) for item in query.all()]})


@bp.post("/admin/departments")
@auth_required(Role.ADMIN)
def create_department():
    data = DepartmentSchema().load(request.get_json(silent=True) or {})
    return created(service.serialize_department(service.create_department(data, current_user())))


@bp.patch("/admin/departments/<uuid:department_id>")
@auth_required(Role.ADMIN)
def update_department(department_id):
    department = Department.query.get(department_id)
    if department is None:
        raise not_found("Department not found")
    data = DepartmentUpdateSchema().load(request.get_json(silent=True) or {})
    return ok(
        service.serialize_department(service.update_department(department, data, current_user()))
    )


@bp.get("/services")
@auth_required()
def list_services():
    department_id = request.args.get("department_id")
    query = Service.query
    if department_id:
        query = query.filter_by(department_id=department_id)
    return ok(
        {"items": [service.serialize_service(item) for item in query.order_by(Service.name).all()]}
    )


@bp.post("/admin/services")
@auth_required(Role.ADMIN)
def create_service():
    data = ServiceSchema().load(request.get_json(silent=True) or {})
    return created(service.serialize_service(service.create_service(data, current_user())))


@bp.patch("/admin/services/<uuid:service_id>")
@auth_required(Role.ADMIN)
def update_service(service_id):
    item = Service.query.get(service_id)
    if item is None:
        raise not_found("Service not found")
    data = ServiceUpdateSchema().load(request.get_json(silent=True) or {})
    return ok(service.serialize_service(service.update_service(item, data, current_user())))


@bp.post("/admin/services/<uuid:service_id>/prices")
@auth_required(Role.ADMIN)
def add_service_price(service_id):
    item = Service.query.get(service_id)
    if item is None:
        raise not_found("Service not found")
    data = ServicePriceSchema().load(request.get_json(silent=True) or {})
    price = service.add_service_price(item, data, current_user())
    return created(
        {
            "id": str(price.id),
            "amount_minor": price.amount_minor,
            "effective_from": price.effective_from.isoformat(),
        }
    )


@bp.get("/doctors")
@auth_required()
def list_doctors():
    query = DoctorProfile.query.filter_by(is_accepting_appointments=True)
    if request.args.get("department_id"):
        query = query.filter_by(department_id=request.args["department_id"])
    return ok({"items": [service.serialize_doctor(item) for item in query.all()]})


@bp.get("/doctors/<uuid:doctor_id>")
@auth_required()
def get_doctor(doctor_id):
    return ok(service.serialize_doctor(service.get_doctor_or_404(doctor_id)))


@bp.patch("/admin/doctors/<uuid:doctor_id>")
@auth_required(Role.ADMIN)
def update_doctor(doctor_id):
    doctor = service.get_doctor_or_404(doctor_id)
    data = DoctorUpdateSchema().load(request.get_json(silent=True) or {})
    return ok(service.serialize_doctor(service.update_doctor(doctor, data, current_user())))


@bp.get("/doctors/me/availability")
@auth_required(Role.DOCTOR)
def my_availability():
    doctor = _doctor_for_user(current_user())
    rules = AvailabilityRule.query.filter_by(doctor_id=doctor.id).order_by(
        AvailabilityRule.weekday, AvailabilityRule.start_time
    )
    exceptions = AvailabilityException.query.filter(
        AvailabilityException.doctor_id == doctor.id,
        AvailabilityException.end_at >= utcnow(),
    ).order_by(AvailabilityException.start_at)
    return ok(
        {
            "rules": [service.serialize_rule(item) for item in rules.all()],
            "exceptions": [service.serialize_exception(item) for item in exceptions.all()],
        }
    )


@bp.post("/doctors/me/availability")
@auth_required(Role.DOCTOR)
def create_availability():
    doctor = _doctor_for_user(current_user())
    data = AvailabilityRuleSchema().load(request.get_json(silent=True) or {})
    return created(service.serialize_rule(service.create_rule(doctor, data)))


@bp.delete("/doctors/me/availability/<uuid:rule_id>")
@auth_required(Role.DOCTOR)
def delete_availability(rule_id):
    doctor = _doctor_for_user(current_user())
    return ok(service.serialize_rule(service.delete_rule(rule_id, doctor)))


@bp.post("/doctors/me/exceptions")
@auth_required(Role.DOCTOR, Role.ADMIN)
def create_exception():
    doctor = _doctor_for_user(current_user()) if current_user().role == Role.DOCTOR else None
    payload = request.get_json(silent=True) or {}
    if doctor is None:
        doctor = service.get_doctor_or_404(payload.get("doctor_id"))
    data = AvailabilityExceptionSchema().load(payload)
    return created(service.serialize_exception(service.create_exception(doctor, data)))


@bp.get("/availability")
@auth_required()
def get_availability():
    doctor_id = request.args.get("doctor_id")
    if not doctor_id:
        raise bad_request("doctor_id is required")
    date_value = request.args.get("date")
    target_date = date.fromisoformat(date_value) if date_value else date.today()
    return ok(
        {
            "doctor_id": doctor_id,
            "date": target_date.isoformat(),
            "slots": service.availability(doctor_id, target_date),
        }
    )


@bp.post("/appointments")
@auth_required(Role.PATIENT, Role.RECEPTIONIST, Role.ADMIN)
def create_appointment():
    user = current_user()
    data = AppointmentCreateSchema().load(request.get_json(silent=True) or {})
    patient_id = _patient_id_from_request(user, data)
    source = AppointmentSource.ONLINE if user.role == Role.PATIENT else AppointmentSource.RECEPTION
    appointment = service.create_appointment(data, user, patient_id, source=source)
    return created(service.serialize_appointment(appointment))


@bp.post("/appointments/walk-in")
@auth_required(Role.RECEPTIONIST, Role.ADMIN)
def create_walk_in():
    from datetime import timedelta

    data = WalkInSchema().load(request.get_json(silent=True) or {})
    payload = {
        "doctor_id": data["doctor_id"],
        "service_id": data.get("service_id"),
        "scheduled_start": utcnow() + timedelta(minutes=1),
        "urgency": data.get("urgency"),
        "notes": data.get("notes"),
    }
    appointment = service.create_appointment(
        payload,
        current_user(),
        data["patient_id"],
        source=AppointmentSource.WALK_IN,
    )
    return created(service.serialize_appointment(appointment))


@bp.get("/appointments")
@auth_required(Role.PATIENT, Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
def list_appointments():
    user = current_user()
    query = Appointment.query
    if user.role == Role.PATIENT:
        profile = patient_profile_for_user(user)
        if profile is None:
            raise not_found("Patient profile not found")
        query = query.filter_by(patient_id=profile.id)
    elif user.role == Role.DOCTOR:
        query = query.filter_by(doctor_id=_doctor_for_user(user).id)
    if request.args.get("status"):
        query = query.filter(Appointment.status == AppointmentStatus(request.args["status"]))
    if request.args.get("source"):
        query = query.filter(Appointment.source == AppointmentSource(request.args["source"]))
    if request.args.get("doctor_id"):
        from uuid import UUID

        query = query.filter(Appointment.doctor_id == UUID(request.args["doctor_id"]))
    if request.args.get("department_id"):
        from uuid import UUID

        query = query.filter(Appointment.department_id == UUID(request.args["department_id"]))
    if request.args.get("date"):
        target = date.fromisoformat(request.args["date"])
        from datetime import datetime, time, timezone

        start = datetime.combine(target, time.min, tzinfo=timezone.utc)
        query = query.filter(Appointment.scheduled_start >= start).filter(
            Appointment.scheduled_start < start.replace(hour=23, minute=59, second=59)
        )
    if request.args.get("q"):
        from sqlalchemy import String, cast, or_

        from app.patients.models import PatientProfile

        like = f"%{request.args['q'].strip()}%"
        query = query.filter(
            or_(
                Appointment.patient.has(
                    or_(
                        PatientProfile.first_name.ilike(like),
                        PatientProfile.last_name.ilike(like),
                        PatientProfile.patient_number.ilike(like),
                        PatientProfile.phone.ilike(like),
                    )
                ),
                Appointment.notes.ilike(like),
                cast(Appointment.id, String).ilike(like),
            )
        )
    sort = request.args.get("sort") or "-scheduled_start"
    descending = sort.startswith("-")
    sort_field = sort.lstrip("-")
    sort_map = {
        "scheduled_start": Appointment.scheduled_start,
        "created_at": Appointment.created_at,
        "status": Appointment.status,
    }
    column = sort_map.get(sort_field, Appointment.scheduled_start)
    query = query.order_by(column.desc() if descending else column.asc())
    return ok(paginated(query, service.serialize_appointment))


@bp.get("/appointments/<uuid:appointment_id>")
@auth_required(Role.PATIENT, Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
def get_appointment(appointment_id):
    appointment = Appointment.query.get(appointment_id)
    if appointment is None:
        raise not_found("Appointment not found")
    user = current_user()
    if user.role == Role.PATIENT:
        profile = patient_profile_for_user(user)
        if profile is None or appointment.patient_id != profile.id:
            raise forbidden()
    if user.role == Role.DOCTOR and appointment.doctor_id != _doctor_for_user(user).id:
        raise forbidden()
    return ok(service.serialize_appointment(appointment))


@bp.patch("/appointments/<uuid:appointment_id>")
@auth_required(Role.ADMIN)
def update_appointment(appointment_id):
    appointment = Appointment.query.get(appointment_id)
    if appointment is None:
        raise not_found("Appointment not found")
    data = AppointmentAdminUpdateSchema().load(request.get_json(silent=True) or {})
    if "urgency" in data:
        appointment.urgency = data["urgency"]
    if "notes" in data:
        appointment.notes = data["notes"]
    if "status" in data and data["status"] != appointment.status:
        service.transition(appointment, data["status"], current_user())
    db.session.commit()
    return ok(service.serialize_appointment(appointment))


@bp.post("/appointments/<uuid:appointment_id>/check-in")
@auth_required(Role.RECEPTIONIST, Role.ADMIN)
def check_in(appointment_id):
    appointment = Appointment.query.get(appointment_id)
    if appointment is None:
        raise not_found("Appointment not found")
    appointment = service.transition(appointment, AppointmentStatus.CHECKED_IN, current_user())
    return ok(service.serialize_appointment(appointment))


@bp.post("/appointments/<uuid:appointment_id>/no-show")
@auth_required(Role.RECEPTIONIST, Role.ADMIN, Role.DOCTOR)
def mark_no_show(appointment_id):
    appointment = Appointment.query.get(appointment_id)
    if appointment is None:
        raise not_found("Appointment not found")
    if (
        current_user().role == Role.DOCTOR
        and appointment.doctor_id != _doctor_for_user(current_user()).id
    ):
        raise forbidden()
    appointment = service.transition(appointment, AppointmentStatus.NO_SHOW, current_user())
    return ok(service.serialize_appointment(appointment))


@bp.post("/appointments/<uuid:appointment_id>/cancel")
@auth_required(Role.PATIENT, Role.RECEPTIONIST, Role.ADMIN)
def cancel_appointment(appointment_id):
    appointment = Appointment.query.get(appointment_id)
    if appointment is None:
        raise not_found("Appointment not found")
    user = current_user()
    if user.role == Role.PATIENT:
        profile = patient_profile_for_user(user)
        if profile is None or appointment.patient_id != profile.id:
            raise forbidden()
    data = CancelSchema().load(request.get_json(silent=True) or {})
    appointment = service.cancel(appointment, user, data.get("reason"), user.role)
    return ok(service.serialize_appointment(appointment))


@bp.post("/appointments/<uuid:appointment_id>/reschedule")
@auth_required(Role.PATIENT, Role.RECEPTIONIST, Role.ADMIN)
def reschedule_appointment(appointment_id):
    appointment = Appointment.query.get(appointment_id)
    if appointment is None:
        raise not_found("Appointment not found")
    user = current_user()
    if user.role == Role.PATIENT:
        profile = patient_profile_for_user(user)
        if profile is None or appointment.patient_id != profile.id:
            raise forbidden()
    data = RescheduleSchema().load(request.get_json(silent=True) or {})
    replacement = service.reschedule(appointment, data["scheduled_start"], user, data.get("reason"))
    return created(service.serialize_appointment(replacement))


@bp.get("/queue")
@auth_required(Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
def get_queue():
    user = current_user()
    doctor_id = request.args.get("doctor_id")
    if user.role == Role.DOCTOR:
        doctor_id = str(_doctor_for_user(user).id)
    target_date = (
        date.fromisoformat(request.args["date"]) if request.args.get("date") else date.today()
    )
    items = service.queue(doctor_id=doctor_id, target_date=target_date)
    return ok({"items": [service.serialize_appointment(item) for item in items]})
