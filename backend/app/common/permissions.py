from app.common.enums import Role
from app.common.errors import forbidden


def is_admin(user) -> bool:
    return user is not None and user.role == Role.ADMIN


def is_clinical_writer(user) -> bool:
    return user is not None and user.role == Role.DOCTOR


def patient_profile_for_user(user):
    from app.patients.models import PatientProfile

    if user is None or user.role != Role.PATIENT:
        return None
    return PatientProfile.query.filter_by(user_id=user.id).first()


def doctor_has_patient_relationship(user, patient_id) -> bool:
    from app.clinical_records.models import Visit
    from app.scheduling.models import Appointment

    if user is None or user.role != Role.DOCTOR:
        return False
    from app.scheduling.models import DoctorProfile

    doctor = DoctorProfile.query.filter_by(user_id=user.id).first()
    if doctor is None:
        return False
    visit_exists = (
        Visit.query.filter_by(doctor_id=doctor.id, patient_id=patient_id)
        .with_entities(Visit.id)
        .first()
    )
    if visit_exists:
        return True
    appointment_exists = (
        Appointment.query.filter_by(doctor_id=doctor.id, patient_id=patient_id)
        .with_entities(Appointment.id)
        .first()
    )
    return appointment_exists is not None


def assert_can_view_demographics(user, patient_id):
    from app.patients.models import PatientProfile

    if user is None:
        raise forbidden()
    if user.role in {Role.ADMIN, Role.RECEPTIONIST, Role.CASHIER}:
        return
    if user.role == Role.PATIENT:
        profile = PatientProfile.query.filter_by(user_id=user.id).first()
        if profile is not None and profile.id == patient_id:
            return
        raise forbidden()
    if user.role == Role.DOCTOR and doctor_has_patient_relationship(user, patient_id):
        return
    raise forbidden()


def assert_can_view_clinical(user, patient_id):
    from app.patients.models import PatientProfile

    if user is None:
        raise forbidden()
    if user.role == Role.ADMIN:
        return  # read-only access is enforced by route verbs and audited
    if user.role == Role.PATIENT:
        profile = PatientProfile.query.filter_by(user_id=user.id).first()
        if profile is not None and profile.id == patient_id:
            return
        raise forbidden()
    if user.role == Role.DOCTOR and doctor_has_patient_relationship(user, patient_id):
        return
    raise forbidden()


def assert_doctor_owns_visit(user, visit):
    from app.scheduling.models import DoctorProfile

    if user is None or user.role != Role.DOCTOR:
        raise forbidden()
    doctor = DoctorProfile.query.filter_by(user_id=user.id).first()
    if doctor is None or visit.doctor_id != doctor.id:
        raise forbidden()


def assert_can_write_clinical(user, patient_id):
    if user is None or user.role != Role.DOCTOR:
        raise forbidden()
    if not doctor_has_patient_relationship(user, patient_id):
        raise forbidden()
