from datetime import timedelta, timezone

from flask import current_app
from sqlalchemy import or_

from app.common.audit import record_audit
from app.common.base import utcnow
from app.common.enums import (
    Role,
    UserStatus,
    VerificationPurpose,
)
from app.common.errors import (
    bad_request,
    conflict,
    not_found,
    unauthorized,
    unprocessable,
)
from app.common.security import (
    create_access_token,
    generate_opaque_token,
    hash_password,
    refresh_token_expiry,
    sha256,
    validate_password_policy,
    verify_password,
)
from app.extensions import db


def _aware(value):
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _find_user(identifier):
    if not identifier:
        return None
    value = identifier.strip()
    return User.query.filter(or_(User.email == value.lower(), User.phone == value)).first()


def serialize_user(user):
    from app.patients.models import PatientProfile
    from app.scheduling.models import DoctorProfile

    patient = PatientProfile.query.filter_by(user_id=user.id).first()
    doctor = DoctorProfile.query.filter_by(user_id=user.id).first()
    return {
        "id": str(user.id),
        "email": user.email,
        "phone": user.phone,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": user.full_name,
        "role": user.role.value,
        "status": user.status.value,
        "email_verified": user.email_verified_at is not None,
        "phone_verified": user.phone_verified_at is not None,
        "patient_id": str(patient.id) if patient else None,
        "doctor_id": str(doctor.id) if doctor else None,
    }


def _tokens_for(user, ip_address=None, user_agent=None):
    access_token = create_access_token(user)
    raw_refresh = generate_opaque_token()
    record = RefreshTokenFamily(
        user_id=user.id,
        token_hash=sha256(raw_refresh),
        expires_at=refresh_token_expiry(),
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.session.add(record)
    return {
        "access_token": access_token,
        "refresh_token": raw_refresh,
        "token_type": "Bearer",
        "expires_in": int(current_app.config["JWT_ACCESS_TTL"].total_seconds()),
        "user": serialize_user(user),
    }


def authenticate(identifier, password, ip_address=None, user_agent=None):
    user = _find_user(identifier)
    if user is None:
        raise unauthorized("Invalid credentials")
    now = utcnow()
    if user.locked_until is not None and _aware(user.locked_until) > now:
        raise unauthorized("Account is temporarily locked")
    if not verify_password(user.password_hash, password):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= current_app.config["LOGIN_MAX_ATTEMPTS"]:
            user.locked_until = now + timedelta(minutes=current_app.config["LOGIN_LOCKOUT_MINUTES"])
            user.failed_login_attempts = 0
        db.session.commit()
        raise unauthorized("Invalid credentials")
    if user.status != UserStatus.ACTIVE:
        raise unauthorized("Account is not active")
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    user.last_activity_at = now
    result = _tokens_for(user, ip_address, user_agent)
    record_audit(
        "auth.login",
        "user",
        user.id,
        actor=user,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.session.commit()
    return result


def refresh(raw_token, ip_address=None, user_agent=None):
    token_hash = sha256(raw_token)
    record = RefreshTokenFamily.query.filter_by(token_hash=token_hash).first()
    if record is None:
        raise unauthorized("Invalid refresh token")
    if record.revoked_at is not None:
        _revoke_family(record.family_id)
        db.session.commit()
        raise unauthorized("Refresh token has been revoked")
    if _aware(record.expires_at) <= utcnow():
        raise unauthorized("Refresh token has expired")
    user = User.query.get(record.user_id)
    if user is None or user.status != UserStatus.ACTIVE:
        raise unauthorized("Account is not active")

    raw_new = generate_opaque_token()
    new_hash = sha256(raw_new)
    record.revoked_at = utcnow()
    record.replaced_by_hash = new_hash
    record.last_used_at = utcnow()
    new_record = RefreshTokenFamily(
        user_id=user.id,
        family_id=record.family_id,
        token_hash=new_hash,
        expires_at=refresh_token_expiry(),
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.session.add(new_record)
    user.last_activity_at = utcnow()
    db.session.commit()
    return {
        "access_token": create_access_token(user),
        "refresh_token": raw_new,
        "token_type": "Bearer",
        "expires_in": int(current_app.config["JWT_ACCESS_TTL"].total_seconds()),
        "user": serialize_user(user),
    }


def _revoke_family(family_id):
    RefreshTokenFamily.query.filter_by(family_id=family_id).filter(
        RefreshTokenFamily.revoked_at.is_(None)
    ).update({"revoked_at": utcnow()})


def logout(raw_token):
    record = RefreshTokenFamily.query.filter_by(token_hash=sha256(raw_token)).first()
    if record is not None:
        _revoke_family(record.family_id)
        db.session.commit()
    return {"revoked": True}


def register_patient(data):
    email = (data.get("email") or "").lower() or None
    phone = data.get("phone")
    if not email and not phone:
        raise bad_request("Email or phone is required")
    if email and User.query.filter_by(email=email).first():
        raise conflict("An account with this email already exists")
    if phone and User.query.filter_by(phone=phone).first():
        raise conflict("An account with this phone already exists")
    validate_password_policy(data["password"])

    from app.patients.service import create_patient_profile

    user = User(
        email=email,
        phone=phone,
        password_hash=hash_password(data["password"]),
        role=Role.PATIENT,
        status=UserStatus.ACTIVE,
        first_name=data.get("first_name"),
        last_name=data.get("last_name"),
    )
    db.session.add(user)
    db.session.flush()
    profile = create_patient_profile(user, data)

    token = _issue_verification(user, VerificationPurpose.EMAIL_VERIFY)
    record_audit("patient.self_register", "patient", profile.id, actor=user)
    db.session.commit()
    return {
        "user": serialize_user(user),
        "patient": profile,
        "verification_token": token,
    }


def _issue_verification(user, purpose):
    raw = generate_opaque_token()
    token = VerificationToken(
        user_id=user.id,
        purpose=purpose,
        token_hash=sha256(raw),
        expires_at=utcnow() + timedelta(minutes=current_app.config["PASSWORD_RESET_TTL_MINUTES"]),
    )
    db.session.add(token)
    return raw


def verify(raw_token, purpose=VerificationPurpose.EMAIL_VERIFY):
    record = VerificationToken.query.filter_by(
        token_hash=sha256(raw_token), purpose=purpose
    ).first()
    if record is None or not record.is_valid():
        raise bad_request("Verification token is invalid or expired")
    user = User.query.get(record.user_id)
    if user is None:
        raise not_found("User not found")
    record.used_at = utcnow()
    if purpose == VerificationPurpose.EMAIL_VERIFY:
        user.email_verified_at = utcnow()
    elif purpose == VerificationPurpose.PHONE_VERIFY:
        user.phone_verified_at = utcnow()
    db.session.commit()
    return {"verified": True}


def request_password_reset(email):
    user = User.query.filter_by(email=(email or "").lower()).first()
    token = None
    if user is not None:
        token = _issue_verification(user, VerificationPurpose.PASSWORD_RESET)
        db.session.commit()
    return {
        "message": "If the account exists, reset instructions have been sent",
        "reset_token": token,
    }


def confirm_password_reset(raw_token, new_password):
    validate_password_policy(new_password)
    record = VerificationToken.query.filter_by(
        token_hash=sha256(raw_token), purpose=VerificationPurpose.PASSWORD_RESET
    ).first()
    if record is None or not record.is_valid():
        raise bad_request("Reset token is invalid or expired")
    user = User.query.get(record.user_id)
    if user is None:
        raise not_found("User not found")
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    user.failed_login_attempts = 0
    user.locked_until = None
    record.used_at = utcnow()
    _revoke_user_sessions(user.id)
    db.session.commit()
    return {"reset": True}


def _revoke_user_sessions(user_id):
    RefreshTokenFamily.query.filter_by(user_id=user_id).filter(
        RefreshTokenFamily.revoked_at.is_(None)
    ).update({"revoked_at": utcnow()})


def create_staff(data, actor):
    role = data["role"]
    if role not in {
        Role.DOCTOR,
        Role.RECEPTIONIST,
        Role.CASHIER,
        Role.ADMIN,
    }:
        raise unprocessable("Role is not a staff role")
    email = (data.get("email") or "").lower() or None
    phone = data.get("phone")
    if not email and not phone:
        raise bad_request("Email or phone is required")
    if email and User.query.filter_by(email=email).first():
        raise conflict("An account with this email already exists")
    if phone and User.query.filter_by(phone=phone).first():
        raise conflict("An account with this phone already exists")
    validate_password_policy(data["password"])

    user = User(
        email=email,
        phone=phone,
        password_hash=hash_password(data["password"]),
        role=role,
        status=UserStatus.ACTIVE,
        first_name=data.get("first_name"),
        last_name=data.get("last_name"),
        email_verified_at=utcnow() if email else None,
    )
    db.session.add(user)
    db.session.flush()

    if role == Role.DOCTOR:
        from app.scheduling.models import Department, DoctorProfile

        if not data.get("department_id") or not data.get("license_number"):
            raise bad_request(
                "Doctors require department_id and license_number",
                {"department_id": ["Required for doctors"], "license_number": ["Required"]},
            )
        department = Department.query.get(data["department_id"])
        if department is None:
            raise not_found("Department not found")
        db.session.add(
            DoctorProfile(
                user_id=user.id,
                department_id=department.id,
                specialty=data.get("specialty"),
                license_number=data["license_number"],
                consultation_fee_minor=data.get("consultation_fee_minor", 0),
            )
        )

    record_audit(
        "admin.user_create",
        "user",
        user.id,
        actor=actor,
        after={"role": role.value, "status": user.status.value},
    )
    db.session.commit()
    return user


def update_staff(user_id, data, actor):
    user = User.query.get(user_id)
    if user is None:
        raise not_found("User not found")
    before = {"role": user.role.value, "status": user.status.value}
    if "role" in data and data["role"] is not None:
        user.role = data["role"]
    if "status" in data and data["status"] is not None:
        user.status = data["status"]
        if user.status != UserStatus.ACTIVE:
            _revoke_user_sessions(user.id)
    if "first_name" in data:
        user.first_name = data["first_name"]
    if "last_name" in data:
        user.last_name = data["last_name"]
    record_audit(
        "admin.user_update",
        "user",
        user.id,
        actor=actor,
        before=before,
        after={"role": user.role.value, "status": user.status.value},
    )
    db.session.commit()
    return user


from app.auth.models import RefreshTokenFamily, User, VerificationToken  # noqa: E402
