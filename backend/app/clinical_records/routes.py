from flask import Blueprint, Response, request

from app.clinical_records import service
from app.clinical_records.models import Attachment, Prescription
from app.clinical_records.schemas import (
    FollowUpSchema,
    PrescriptionCreateSchema,
    ReferralSchema,
    VisitCreateSchema,
    VisitUpdateSchema,
)
from app.common.audit import record_audit
from app.common.decorators import auth_required, current_user
from app.common.enums import AppointmentSource, AttachmentType, Role
from app.common.errors import forbidden, not_found
from app.common.permissions import assert_doctor_owns_visit, patient_profile_for_user
from app.common.responses import created, ok
from app.extensions import db
from app.scheduling.models import Appointment, DoctorProfile

bp = Blueprint("clinical_records", __name__)


def _doctor(user):
    doctor = DoctorProfile.query.filter_by(user_id=user.id).first()
    if doctor is None:
        raise forbidden()
    return doctor


def _assert_read(user, visit):
    if user.role == Role.ADMIN:
        return
    if user.role == Role.DOCTOR and visit.doctor_id == _doctor(user).id:
        return
    if user.role == Role.PATIENT:
        profile = patient_profile_for_user(user)
        if profile is not None and visit.patient_id == profile.id:
            return
    raise forbidden()


def _assert_write(user, visit):
    assert_doctor_owns_visit(user, visit)


@bp.post("/appointments/<uuid:appointment_id>/visits")
@auth_required(Role.DOCTOR)
def create_visit(appointment_id):
    appointment = Appointment.query.get(appointment_id)
    if appointment is None:
        raise not_found("Appointment not found")
    if appointment.doctor_id != _doctor(current_user()).id:
        raise forbidden()
    data = VisitCreateSchema().load(request.get_json(silent=True) or {})
    visit = service.create_visit(appointment, data, current_user())
    return created(service.serialize_visit(visit))


@bp.get("/visits/<uuid:visit_id>")
@auth_required(Role.DOCTOR, Role.ADMIN, Role.PATIENT)
def get_visit(visit_id):
    visit = service.get_visit_or_404(visit_id)
    _assert_read(current_user(), visit)
    record_audit("visit.read", "visit", visit.id, actor=current_user())
    db.session.commit()
    return ok(service.serialize_visit(visit))


@bp.patch("/visits/<uuid:visit_id>")
@auth_required(Role.DOCTOR)
def update_visit(visit_id):
    visit = service.get_visit_or_404(visit_id)
    _assert_write(current_user(), visit)
    data = VisitUpdateSchema().load(request.get_json(silent=True) or {})
    if "ai_summary" in data:
        data.pop("ai_summary")
    visit = service.update_visit(visit, data, current_user())
    return ok(service.serialize_visit(visit))


@bp.post("/visits/<uuid:visit_id>/complete")
@auth_required(Role.DOCTOR)
def complete_visit(visit_id):
    visit = service.get_visit_or_404(visit_id)
    _assert_write(current_user(), visit)
    visit = service.complete_visit(visit, current_user())
    return ok(service.serialize_visit(visit))


@bp.post("/visits/<uuid:visit_id>/prescriptions")
@auth_required(Role.DOCTOR)
def create_prescription(visit_id):
    visit = service.get_visit_or_404(visit_id)
    _assert_write(current_user(), visit)
    data = PrescriptionCreateSchema().load(request.get_json(silent=True) or {})
    prescription = service.create_prescription(visit, data, current_user())
    return created(service.serialize_prescription(prescription))


@bp.get("/visits/<uuid:visit_id>/prescriptions")
@auth_required(Role.DOCTOR, Role.ADMIN, Role.PATIENT)
def list_prescriptions(visit_id):
    visit = service.get_visit_or_404(visit_id)
    _assert_read(current_user(), visit)
    record_audit("prescription.read", "visit", visit.id, actor=current_user())
    db.session.commit()
    items = Prescription.query.filter_by(visit_id=visit.id).order_by(Prescription.issued_at.desc())
    return ok({"items": [service.serialize_prescription(item) for item in items.all()]})


@bp.post("/visits/<uuid:visit_id>/attachments")
@auth_required(Role.DOCTOR)
def upload_attachment(visit_id):
    visit = service.get_visit_or_404(visit_id)
    _assert_write(current_user(), visit)
    file = request.files.get("file")
    if file is None:
        from app.common.errors import bad_request

        raise bad_request("file is required")
    try:
        attachment_type = AttachmentType(
            request.form.get("attachment_type", AttachmentType.OTHER.value)
        )
    except ValueError as exc:
        from app.common.errors import bad_request

        raise bad_request("Invalid attachment_type") from exc
    attachment = service.create_attachment(visit, file, attachment_type, current_user())
    return created(service.serialize_attachment(attachment))


@bp.get("/attachments/<uuid:attachment_id>/download-url")
@auth_required(Role.DOCTOR, Role.ADMIN, Role.PATIENT)
def attachment_download_url(attachment_id):
    attachment = Attachment.query.get(attachment_id)
    if attachment is None:
        raise not_found("Attachment not found")
    visit = service.get_visit_or_404(attachment.visit_id)
    _assert_read(current_user(), visit)
    record_audit("attachment.read", "attachment", attachment.id, actor=current_user())
    db.session.commit()
    return ok(
        {
            "url": service.attachment_download_url(attachment),
            "file_name": attachment.file_name,
            "expires_seconds": 300,
        }
    )


@bp.get("/attachments/<uuid:attachment_id>/content")
@auth_required(Role.DOCTOR, Role.ADMIN, Role.PATIENT)
def attachment_content(attachment_id):
    attachment = Attachment.query.get(attachment_id)
    if attachment is None:
        raise not_found("Attachment not found")
    visit = service.get_visit_or_404(attachment.visit_id)
    _assert_read(current_user(), visit)
    data = service.attachment_content(attachment)
    return Response(
        data,
        mimetype=attachment.content_type,
        headers={"Content-Disposition": f'attachment; filename="{attachment.file_name}"'},
    )


@bp.post("/visits/<uuid:visit_id>/follow-up")
@auth_required(Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
def schedule_follow_up(visit_id):
    from app.scheduling import service as scheduling_service

    visit = service.get_visit_or_404(visit_id)
    if current_user().role == Role.DOCTOR:
        _assert_write(current_user(), visit)
    data = FollowUpSchema().load(request.get_json(silent=True) or {})
    appointment = scheduling_service.create_appointment(
        {
            "doctor_id": data["doctor_id"],
            "service_id": data.get("service_id"),
            "scheduled_start": data["scheduled_start"],
            "notes": data.get("notes") or "Follow-up visit",
        },
        current_user(),
        visit.patient_id,
        source=AppointmentSource.RECEPTION,
        slot_minutes=data.get("slot_minutes", 30),
    )
    visit.follow_up_date = data["scheduled_start"].date()
    db.session.commit()
    return created(scheduling_service.serialize_appointment(appointment))


@bp.post("/visits/<uuid:visit_id>/referral-letter")
@auth_required(Role.DOCTOR)
def create_referral(visit_id):
    visit = service.get_visit_or_404(visit_id)
    _assert_write(current_user(), visit)
    data = ReferralSchema().load(request.get_json(silent=True) or {})
    letter = service.create_referral(visit, data, current_user())
    return created(service.serialize_referral(letter))
