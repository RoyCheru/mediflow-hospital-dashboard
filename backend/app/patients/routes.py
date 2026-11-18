from flask import Blueprint, request

from app.common.audit import record_audit
from app.common.decorators import auth_required, current_user
from app.common.enums import Role
from app.common.errors import forbidden, not_found
from app.common.pagination import paginated
from app.common.permissions import (
    assert_can_view_clinical,
    assert_can_view_demographics,
    patient_profile_for_user,
)
from app.common.responses import created, ok
from app.extensions import db
from app.patients import service
from app.patients.schemas import (
    ConsentSchema,
    PatientCreateSchema,
    PatientUpdateSchema,
)

bp = Blueprint("patients", __name__)


@bp.post("/patients/self-registration")
def self_registration():
    from flask import current_app

    from app.auth.schemas import RegisterPatientSchema
    from app.auth.service import register_patient

    data = RegisterPatientSchema().load(request.get_json(silent=True) or {})
    result = register_patient(data)
    if not (current_app.config.get("TESTING") or current_app.config.get("ENV") == "development"):
        result.pop("verification_token", None)
    return created(service.serialize_patient(result["patient"]))


@bp.post("/patients")
@auth_required(Role.RECEPTIONIST, Role.ADMIN)
def create_patient():
    data = PatientCreateSchema().load(request.get_json(silent=True) or {})
    profile, duplicates = service.register_patient(data, current_user())
    payload = service.serialize_patient(profile)
    payload["potential_duplicates"] = [service.serialize_patient_brief(item) for item in duplicates]
    return created(payload)


@bp.get("/patients")
@auth_required(Role.DOCTOR, Role.RECEPTIONIST, Role.CASHIER, Role.ADMIN)
def list_patients():
    query_text = request.args.get("q") or request.args.get("search")
    user = current_user()
    doctor = None
    if user.role == Role.DOCTOR and not request.args.get("all"):
        from app.scheduling.models import DoctorProfile

        doctor = DoctorProfile.query.filter_by(user_id=user.id).first()
    query = service.search_patients(query_text, doctor=doctor, limit=None)
    if request.args.get("sex"):
        from app.common.enums import Sex

        query = query.filter(service.PatientProfile.sex == Sex(request.args["sex"].upper()))
    if request.args.get("is_active") in {"true", "false"}:
        query = query.filter(
            service.PatientProfile.is_active == (request.args["is_active"] == "true")
        )
    sort = request.args.get("sort") or "name"
    sort_map = {
        "name": (
            service.PatientProfile.last_name.asc(),
            service.PatientProfile.first_name.asc(),
        ),
        "-created_at": (service.PatientProfile.created_at.desc(),),
        "created_at": (service.PatientProfile.created_at.asc(),),
        "-patient_number": (service.PatientProfile.patient_number.desc(),),
    }
    query = query.order_by(*sort_map.get(sort, sort_map["name"]))
    return ok(paginated(query, service.serialize_patient_brief))


@bp.get("/patients/duplicates")
@auth_required(Role.RECEPTIONIST, Role.ADMIN)
def duplicates():
    items = service.duplicate_candidates(
        request.args.get("first_name"),
        request.args.get("last_name"),
        request.args.get("date_of_birth"),
        request.args.get("phone"),
    )
    return ok({"items": [service.serialize_patient_brief(item) for item in items]})


@bp.get("/patients/me")
@auth_required(Role.PATIENT)
def my_profile():
    profile = patient_profile_for_user(current_user())
    if profile is None:
        raise not_found("Patient profile not found")
    record_audit("patient.read_own", "patient", profile.id, actor=current_user())
    db.session.commit()
    return ok(service.serialize_patient(profile))


@bp.get("/patients/me/timeline")
@auth_required(Role.PATIENT)
def my_timeline():
    profile = patient_profile_for_user(current_user())
    if profile is None:
        raise not_found("Patient profile not found")
    record_audit(
        "clinical_timeline.read_own",
        "patient",
        profile.id,
        actor=current_user(),
    )
    db.session.commit()
    return ok({"items": service.timeline(profile.id)})


@bp.get("/patients/me/invoices")
@auth_required(Role.PATIENT)
def my_invoices():
    profile = patient_profile_for_user(current_user())
    if profile is None:
        raise not_found("Patient profile not found")
    from app.billing.models import Invoice
    from app.billing.service import serialize_invoice

    query = Invoice.query.filter_by(patient_id=profile.id).order_by(Invoice.created_at.desc())
    return ok(paginated(query, serialize_invoice))


@bp.get("/patients/<uuid:patient_id>")
@auth_required(Role.DOCTOR, Role.RECEPTIONIST, Role.CASHIER, Role.ADMIN, Role.PATIENT)
def get_patient(patient_id):
    profile = service.get_patient_or_404(patient_id)
    assert_can_view_demographics(current_user(), profile.id)
    record_audit("patient.read", "patient", profile.id, actor=current_user())
    db.session.commit()
    from app.patients.models import ConsentRecord

    payload = service.serialize_patient(profile)
    payload["consents"] = [
        {
            "channel": record.channel.value,
            "granted": record.granted,
            "created_at": record.created_at.isoformat(),
        }
        for record in profile.consents.order_by(ConsentRecord.created_at.desc()).all()
    ]
    return ok(payload)


@bp.patch("/patients/<uuid:patient_id>")
@auth_required(Role.RECEPTIONIST, Role.ADMIN)
def update_patient(patient_id):
    profile = service.get_patient_or_404(patient_id)
    data = PatientUpdateSchema().load(request.get_json(silent=True) or {})
    profile = service.update_patient(profile, data, current_user())
    return ok(service.serialize_patient(profile))


@bp.post("/patients/<uuid:patient_id>/consents")
@auth_required(Role.RECEPTIONIST, Role.ADMIN, Role.PATIENT)
def create_consent(patient_id):
    profile = service.get_patient_or_404(patient_id)
    user = current_user()
    if user.role == Role.PATIENT:
        own = patient_profile_for_user(user)
        if own is None or own.id != profile.id:
            raise forbidden()
    data = ConsentSchema().load(request.get_json(silent=True) or {})
    record = service.add_consent(profile, data, user)
    return created(
        {
            "id": str(record.id),
            "channel": record.channel.value,
            "granted": record.granted,
            "created_at": record.created_at.isoformat(),
        }
    )


@bp.get("/patients/<uuid:patient_id>/timeline")
@auth_required(Role.DOCTOR, Role.RECEPTIONIST, Role.CASHIER, Role.ADMIN, Role.PATIENT)
def patient_timeline(patient_id):
    profile = service.get_patient_or_404(patient_id)
    assert_can_view_clinical(current_user(), profile.id)
    record_audit("clinical_timeline.read", "patient", profile.id, actor=current_user())
    db.session.commit()
    return ok({"items": service.timeline(profile.id)})


@bp.get("/patients/<uuid:patient_id>/invoices")
@auth_required(Role.DOCTOR, Role.RECEPTIONIST, Role.CASHIER, Role.ADMIN, Role.PATIENT)
def patient_invoices(patient_id):
    profile = service.get_patient_or_404(patient_id)
    assert_can_view_demographics(current_user(), profile.id)
    from app.billing.models import Invoice
    from app.billing.service import serialize_invoice

    query = Invoice.query.filter_by(patient_id=profile.id).order_by(Invoice.created_at.desc())
    return ok(paginated(query, serialize_invoice))
