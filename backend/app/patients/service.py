from sqlalchemy import or_

from app.common.audit import record_audit
from app.common.enums import ConsentChannel, Sex
from app.common.errors import conflict, not_found
from app.common.sequences import next_sequence_value
from app.extensions import db
from app.patients.models import ConsentRecord, PatientProfile

PATIENT_FIELDS = (
    "first_name",
    "middle_name",
    "last_name",
    "date_of_birth",
    "sex",
    "national_id",
    "birth_certificate_number",
    "phone",
    "email",
    "address",
    "next_of_kin_name",
    "next_of_kin_phone",
    "next_of_kin_relationship",
    "sha_number",
    "insurance_provider",
    "insurance_member_number",
    "allergies",
    "chronic_conditions",
    "current_medications",
    "blood_group",
    "is_active",
)


def _enum_value(value):
    return value.value if hasattr(value, "value") else value


def serialize_patient(profile):
    return {
        "id": str(profile.id),
        "patient_number": profile.patient_number,
        "user_id": str(profile.user_id) if profile.user_id else None,
        "first_name": profile.first_name,
        "middle_name": profile.middle_name,
        "last_name": profile.last_name,
        "date_of_birth": profile.date_of_birth.isoformat() if profile.date_of_birth else None,
        "sex": _enum_value(profile.sex),
        "phone": profile.phone,
        "email": profile.email,
        "address": profile.address,
        "national_id": profile.national_id,
        "birth_certificate_number": profile.birth_certificate_number,
        "next_of_kin_name": profile.next_of_kin_name,
        "next_of_kin_phone": profile.next_of_kin_phone,
        "next_of_kin_relationship": profile.next_of_kin_relationship,
        "sha_number": profile.sha_number,
        "insurance_provider": profile.insurance_provider,
        "insurance_member_number": profile.insurance_member_number,
        "allergies": profile.allergies,
        "chronic_conditions": profile.chronic_conditions,
        "current_medications": profile.current_medications,
        "blood_group": profile.blood_group,
        "is_active": profile.is_active,
        "created_at": profile.created_at.isoformat() if profile.created_at else None,
        "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
    }


def serialize_patient_brief(profile):
    return {
        "id": str(profile.id),
        "patient_number": profile.patient_number,
        "first_name": profile.first_name,
        "last_name": profile.last_name,
        "date_of_birth": profile.date_of_birth.isoformat() if profile.date_of_birth else None,
        "sex": _enum_value(profile.sex),
        "phone": profile.phone,
        "allergies": profile.allergies,
    }


def get_patient_or_404(patient_id):
    profile = PatientProfile.query.get(patient_id)
    if profile is None:
        raise not_found("Patient not found")
    return profile


def create_patient_profile(user, data, actor=None, create_consents=True):
    profile = PatientProfile(
        user_id=user.id if user else None,
        patient_number=next_sequence_value("patient_number", prefix="MF-{year}-", width=6),
        first_name=data["first_name"],
        middle_name=data.get("middle_name"),
        last_name=data["last_name"],
        date_of_birth=data["date_of_birth"],
        sex=data.get("sex") or Sex.UNKNOWN,
        national_id=data.get("national_id"),
        birth_certificate_number=data.get("birth_certificate_number"),
        phone=data["phone"],
        email=(data.get("email") or None),
        address=data.get("address"),
        next_of_kin_name=data.get("next_of_kin_name"),
        next_of_kin_phone=data.get("next_of_kin_phone"),
        next_of_kin_relationship=data.get("next_of_kin_relationship"),
        sha_number=data.get("sha_number"),
        insurance_provider=data.get("insurance_provider"),
        insurance_member_number=data.get("insurance_member_number"),
        allergies=data.get("allergies"),
        chronic_conditions=data.get("chronic_conditions"),
        current_medications=data.get("current_medications"),
        blood_group=data.get("blood_group"),
        is_active=data.get("is_active", True),
    )
    db.session.add(profile)
    db.session.flush()

    if create_consents:
        captured_by = actor.id if actor else (user.id if user else None)
        for channel, key in (
            (ConsentChannel.WHATSAPP, "whatsapp_consent"),
            (ConsentChannel.EMAIL, "email_consent"),
        ):
            if key in data:
                db.session.add(
                    ConsentRecord(
                        patient_id=profile.id,
                        channel=channel,
                        granted=bool(data.get(key)),
                        captured_by_id=captured_by,
                        capture_source="REGISTRATION",
                    )
                )
    return profile


def register_patient(data, actor=None, source="RECEPTION"):
    if data.get("email"):
        existing = PatientProfile.query.filter_by(email=data["email"].lower()).first()
        if existing:
            raise conflict(
                "A patient with this email already exists",
                {"patient_id": str(existing.id)},
            )
    duplicates = duplicate_candidates(
        data.get("first_name"),
        data.get("last_name"),
        data.get("date_of_birth"),
        data.get("phone"),
    )
    profile = create_patient_profile(None, data, actor=actor)
    record_audit(
        "patient.create",
        "patient",
        profile.id,
        actor=actor,
        after={"patient_number": profile.patient_number},
    )
    db.session.commit()
    return profile, duplicates


def update_patient(profile, data, actor):
    before = serialize_patient(profile)
    for field in PATIENT_FIELDS:
        if field in data:
            setattr(profile, field, data[field])
    record_audit(
        "patient.update",
        "patient",
        profile.id,
        actor=actor,
        before=before,
        after=serialize_patient(profile),
    )
    db.session.commit()
    return profile


def add_consent(profile, data, actor):
    record = ConsentRecord(
        patient_id=profile.id,
        channel=data["channel"],
        granted=data["granted"],
        purpose=data.get("purpose", "TRANSACTIONAL"),
        captured_by_id=actor.id if actor else None,
        capture_source="API",
    )
    db.session.add(record)
    record_audit(
        "patient.consent",
        "consent_record",
        record.id,
        actor=actor,
        after={"channel": data["channel"].value, "granted": data["granted"]},
    )
    db.session.commit()
    return record


def search_patients(query_text, doctor=None, limit=50):
    query = PatientProfile.query
    if query_text:
        like = f"%{query_text.strip()}%"
        query = query.filter(
            or_(
                PatientProfile.first_name.ilike(like),
                PatientProfile.last_name.ilike(like),
                PatientProfile.patient_number.ilike(like),
                PatientProfile.phone.ilike(like),
                PatientProfile.email.ilike(like),
            )
        )
    if doctor is not None:
        from app.scheduling.models import Appointment

        patient_ids = (
            db.session.query(Appointment.patient_id)
            .filter(Appointment.doctor_id == doctor.id)
            .subquery()
        )
        query = query.filter(PatientProfile.id.in_(db.select(patient_ids.c.patient_id)))
    return query.order_by(PatientProfile.last_name, PatientProfile.first_name).limit(limit)


def duplicate_candidates(first_name, last_name, date_of_birth, phone):
    query = PatientProfile.query
    filters = []
    if first_name and last_name and date_of_birth:
        filters.append(
            db.and_(
                PatientProfile.first_name.ilike(first_name),
                PatientProfile.last_name.ilike(last_name),
                PatientProfile.date_of_birth == date_of_birth,
            )
        )
    if phone:
        filters.append(PatientProfile.phone == phone)
    if not filters:
        return []
    return query.filter(or_(*filters)).limit(5).all()


def timeline(patient_id):
    from app.clinical_records.models import Attachment, Prescription, Visit

    events = []
    for visit in (
        Visit.query.filter_by(patient_id=patient_id).order_by(Visit.created_at.desc()).all()
    ):
        events.append(
            {
                "type": "visit",
                "id": str(visit.id),
                "occurred_at": visit.started_at.isoformat()
                if visit.started_at
                else visit.created_at.isoformat(),
                "summary": {
                    "complaint": visit.presenting_complaint,
                    "diagnosis": visit.diagnosis,
                },
            }
        )
    for prescription in (
        Prescription.query.join(Visit, Prescription.visit_id == Visit.id)
        .filter(Visit.patient_id == patient_id)
        .order_by(Prescription.issued_at.desc())
        .all()
    ):
        events.append(
            {
                "type": "prescription",
                "id": str(prescription.id),
                "occurred_at": prescription.issued_at.isoformat(),
                "summary": {
                    "items": len(prescription.items),
                    "drugs": [item.drug_name for item in prescription.items],
                },
            }
        )
    for attachment in (
        Attachment.query.filter_by(patient_id=patient_id)
        .order_by(Attachment.created_at.desc())
        .all()
    ):
        events.append(
            {
                "type": "attachment",
                "id": str(attachment.id),
                "occurred_at": attachment.created_at.isoformat(),
                "summary": {
                    "file_name": attachment.file_name,
                    "attachment_type": attachment.attachment_type.value,
                },
            }
        )
    events.sort(key=lambda item: item["occurred_at"], reverse=True)
    return events
