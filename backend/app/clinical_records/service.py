import hashlib
import os

from flask import current_app

from app.clinical_records.models import (
    Attachment,
    Prescription,
    PrescriptionItem,
    ReferralLetter,
    Visit,
)
from app.common.audit import record_audit
from app.common.base import utcnow
from app.common.enums import AppointmentStatus
from app.common.errors import bad_request, conflict, forbidden, not_found
from app.common.outbox import enqueue_event
from app.extensions import db
from app.integrations.documents import get_document_renderer
from app.integrations.object_storage import (
    build_storage_key,
    get_object_storage,
)


def _iso(value):
    return value.isoformat() if value else None


def serialize_visit(visit, include_clinical=True):
    patient = getattr(visit, "patient", None)
    doctor = getattr(visit, "doctor", None)
    doctor_user = getattr(doctor, "user", None) if doctor is not None else None
    department = getattr(visit, "department", None)
    payload = {
        "id": str(visit.id),
        "appointment_id": str(visit.appointment_id) if visit.appointment_id else None,
        "patient_id": str(visit.patient_id),
        "patient_name": " ".join(part for part in (patient.first_name, patient.last_name) if part)
        if patient is not None
        else None,
        "patient_number": getattr(patient, "patient_number", None),
        "doctor_id": str(visit.doctor_id),
        "doctor_name": doctor_user.full_name if doctor_user is not None else None,
        "department_id": str(visit.department_id) if visit.department_id else None,
        "department_name": getattr(department, "name", None),
        "vitals": visit.vitals or {},
        "follow_up_date": visit.follow_up_date.isoformat() if visit.follow_up_date else None,
        "ai_summary_approved": visit.ai_summary_approved,
        "started_at": _iso(visit.started_at),
        "completed_at": _iso(visit.completed_at),
        "created_at": _iso(visit.created_at),
    }
    if include_clinical:
        payload.update(
            {
                "presenting_complaint": visit.presenting_complaint,
                "notes": visit.notes,
                "diagnosis": visit.diagnosis,
                "plan": visit.plan,
                "ai_summary": visit.ai_summary,
            }
        )
    return payload


def serialize_prescription(prescription):
    return {
        "id": str(prescription.id),
        "visit_id": str(prescription.visit_id),
        "doctor_id": str(prescription.doctor_id),
        "status": prescription.status.value,
        "notes": prescription.notes,
        "issued_at": _iso(prescription.issued_at),
        "items": [
            {
                "id": str(item.id),
                "drug_name": item.drug_name,
                "dose": item.dose,
                "frequency": item.frequency,
                "duration": item.duration,
                "route": item.route,
                "instructions": item.instructions,
                "quantity": item.quantity,
            }
            for item in prescription.items
        ],
    }


def serialize_attachment(attachment):
    return {
        "id": str(attachment.id),
        "visit_id": str(attachment.visit_id),
        "patient_id": str(attachment.patient_id),
        "attachment_type": attachment.attachment_type.value,
        "file_name": attachment.file_name,
        "content_type": attachment.content_type,
        "byte_size": attachment.byte_size,
        "checksum_sha256": attachment.checksum_sha256,
        "scan_state": attachment.scan_state,
        "created_at": _iso(attachment.created_at),
    }


def serialize_referral(letter):
    return {
        "id": str(letter.id),
        "visit_id": str(letter.visit_id),
        "destination": letter.destination,
        "reason": letter.reason,
        "created_at": _iso(letter.created_at),
    }


def get_visit_or_404(visit_id):
    visit = Visit.query.get(visit_id)
    if visit is None:
        raise not_found("Visit not found")
    return visit


def doctor_owns_appointment(doctor_user, appointment):
    from app.scheduling.models import DoctorProfile

    doctor = DoctorProfile.query.filter_by(user_id=doctor_user.id).first()
    if doctor is None or appointment.doctor_id != doctor.id:
        return False
    return True


def create_visit(appointment, data, doctor_user):
    if not doctor_owns_appointment(doctor_user, appointment):
        raise forbidden()
    existing = Visit.query.filter_by(appointment_id=appointment.id).first()
    if existing is not None:
        raise conflict("A visit already exists for this appointment")
    if appointment.status == AppointmentStatus.SCHEDULED:
        from app.scheduling.service import transition

        transition(appointment, AppointmentStatus.CHECKED_IN, doctor_user)
        transition(appointment, AppointmentStatus.IN_CONSULTATION, doctor_user)
    elif appointment.status == AppointmentStatus.CHECKED_IN:
        from app.scheduling.service import transition

        transition(appointment, AppointmentStatus.IN_CONSULTATION, doctor_user)
    elif appointment.status != AppointmentStatus.IN_CONSULTATION:
        raise conflict("Appointment is not in a consultable state")

    from app.scheduling.models import DoctorProfile

    doctor = DoctorProfile.query.filter_by(user_id=doctor_user.id).first()
    visit = Visit(
        appointment_id=appointment.id,
        patient_id=appointment.patient_id,
        doctor_id=doctor.id,
        department_id=appointment.department_id,
        presenting_complaint=data.get("presenting_complaint"),
        vitals=data.get("vitals") or {},
        notes=data.get("notes"),
        diagnosis=data.get("diagnosis"),
        plan=data.get("plan"),
        follow_up_date=data.get("follow_up_date"),
        started_at=utcnow(),
    )
    db.session.add(visit)
    db.session.flush()
    record_audit(
        "visit.create",
        "visit",
        visit.id,
        actor=doctor_user,
        after={"patient_id": str(visit.patient_id)},
    )
    db.session.commit()
    return visit


def update_visit(visit, data, doctor_user):
    from app.scheduling.models import DoctorProfile

    doctor = DoctorProfile.query.filter_by(user_id=doctor_user.id).first()
    if doctor is None or visit.doctor_id != doctor.id:
        raise forbidden()
    for field in (
        "presenting_complaint",
        "vitals",
        "notes",
        "diagnosis",
        "plan",
        "follow_up_date",
    ):
        if field in data:
            setattr(visit, field, data[field])
    record_audit(
        "visit.update",
        "visit",
        visit.id,
        actor=doctor_user,
        after={"fields": sorted(data.keys())},
    )
    db.session.commit()
    return visit


def complete_visit(visit, doctor_user):
    from app.scheduling.models import Appointment, DoctorProfile
    from app.scheduling.service import transition

    doctor = DoctorProfile.query.filter_by(user_id=doctor_user.id).first()
    if doctor is None or visit.doctor_id != doctor.id:
        raise forbidden()
    if visit.completed_at is not None:
        return visit
    visit.completed_at = utcnow()
    if visit.appointment_id:
        appointment = Appointment.query.get(visit.appointment_id)
        if appointment and appointment.status == AppointmentStatus.IN_CONSULTATION:
            transition(appointment, AppointmentStatus.COMPLETED, doctor_user)
    enqueue_event(
        "visit.completed",
        "visit",
        visit.id,
        {
            "visit_id": str(visit.id),
            "patient_id": str(visit.patient_id),
            "doctor_id": str(visit.doctor_id),
        },
    )
    record_audit("visit.complete", "visit", visit.id, actor=doctor_user)
    db.session.commit()
    return visit


def create_prescription(visit, data, doctor_user):
    from app.scheduling.models import DoctorProfile

    doctor = DoctorProfile.query.filter_by(user_id=doctor_user.id).first()
    if doctor is None or visit.doctor_id != doctor.id:
        raise forbidden()
    prescription = Prescription(
        visit_id=visit.id,
        doctor_id=doctor.id,
        notes=data.get("notes"),
        issued_at=utcnow(),
    )
    for item in data["items"]:
        prescription.items.append(
            PrescriptionItem(
                drug_name=item["drug_name"],
                dose=item["dose"],
                frequency=item["frequency"],
                duration=item["duration"],
                route=item.get("route"),
                instructions=item.get("instructions"),
                quantity=item.get("quantity"),
            )
        )
    db.session.add(prescription)
    db.session.flush()
    enqueue_event(
        "prescription.issued",
        "prescription",
        prescription.id,
        {
            "prescription_id": str(prescription.id),
            "patient_id": str(visit.patient_id),
        },
    )
    record_audit(
        "prescription.create",
        "prescription",
        prescription.id,
        actor=doctor_user,
        after={"items": len(data["items"])},
    )
    db.session.commit()
    return prescription


def create_attachment(visit, file_storage, attachment_type, doctor_user):
    from app.scheduling.models import DoctorProfile

    doctor = DoctorProfile.query.filter_by(user_id=doctor_user.id).first()
    if doctor is None or visit.doctor_id != doctor.id:
        raise forbidden()
    content_type = file_storage.mimetype or "application/octet-stream"
    if content_type not in current_app.config["ALLOWED_UPLOAD_TYPES"]:
        raise bad_request(
            "Only PDF, JPG and PNG files are supported",
            {"file": ["Unsupported content type"]},
        )
    data = file_storage.read()
    if len(data) > current_app.config["MAX_CONTENT_LENGTH"]:
        raise bad_request("File exceeds the 10 MB limit")
    if len(data) == 0:
        raise bad_request("Uploaded file is empty")
    key = build_storage_key(visit.patient_id, file_storage.filename or "upload")
    get_object_storage().put(key, data, content_type)
    attachment = Attachment(
        visit_id=visit.id,
        patient_id=visit.patient_id,
        attachment_type=attachment_type,
        storage_key=key,
        file_name=os.path.basename(file_storage.filename or "upload"),
        content_type=content_type,
        byte_size=len(data),
        checksum_sha256=hashlib.sha256(data).hexdigest(),
        scan_state="PENDING",
        uploaded_by_id=doctor_user.id,
    )
    db.session.add(attachment)
    db.session.flush()
    record_audit(
        "attachment.create",
        "attachment",
        attachment.id,
        actor=doctor_user,
        after={"file_name": attachment.file_name, "type": attachment_type.value},
    )
    db.session.commit()
    return attachment


def attachment_download_url(attachment):
    return get_object_storage().signed_url(attachment.storage_key)


def attachment_content(attachment):
    return get_object_storage().get(attachment.storage_key)


def create_referral(visit, data, doctor_user):
    from app.scheduling.models import DoctorProfile

    doctor = DoctorProfile.query.filter_by(user_id=doctor_user.id).first()
    if doctor is None or visit.doctor_id != doctor.id:
        raise forbidden()
    renderer = get_document_renderer()
    content = renderer.referral_letter(visit, data["destination"], data["reason"])
    key = build_storage_key(visit.patient_id, "referral.pdf")
    get_object_storage().put(key, content, "application/pdf")
    letter = ReferralLetter(
        visit_id=visit.id,
        destination=data["destination"],
        reason=data["reason"],
        content=content.decode(errors="replace"),
        storage_key=key,
        generated_by_id=doctor_user.id,
    )
    db.session.add(letter)
    db.session.flush()
    record_audit("referral.create", "referral_letter", letter.id, actor=doctor_user)
    db.session.commit()
    return letter
