from datetime import date, time

import pytest

from app import create_app
from app.common.base import utcnow
from app.common.enums import Role, Sex, UserStatus
from app.common.security import hash_password
from app.config import TestConfig
from app.extensions import db


def make_user(email, phone, password, role, first_name, last_name):
    from app.auth.models import User

    user = User(
        email=email,
        phone=phone,
        password_hash=hash_password(password),
        role=role,
        status=UserStatus.ACTIVE,
        first_name=first_name,
        last_name=last_name,
        email_verified_at=utcnow(),
    )
    db.session.add(user)
    db.session.flush()
    return user


@pytest.fixture()
def app():
    application = create_app(TestConfig)
    with application.app_context():
        db.create_all()
        from app.notifications.service import ensure_default_templates

        ensure_default_templates()
        ids = _seed()
        application.config["TEST_IDS"] = ids
        yield application
        db.session.remove()
        db.drop_all()


def _seed():
    from app.patients.service import create_patient_profile
    from app.scheduling.models import (
        AvailabilityRule,
        Department,
        DoctorProfile,
        Service,
        ServicePrice,
    )

    department = Department(name="General Medicine", code="GEN")
    db.session.add(department)
    db.session.flush()
    service = Service(department_id=department.id, name="General consultation", code="CONS-GEN")
    db.session.add(service)
    db.session.flush()
    db.session.add(
        ServicePrice(service_id=service.id, amount_minor=250000, effective_from=utcnow())
    )

    admin = make_user("admin@test.local", "0700000001", "Admin12345!", Role.ADMIN, "Ada", "Admin")
    doctor_user = make_user(
        "doctor@test.local", "0700000002", "Doctor12345!", Role.DOCTOR, "Dan", "Doctor"
    )
    reception = make_user(
        "reception@test.local",
        "0700000003",
        "Reception12345!",
        Role.RECEPTIONIST,
        "Rita",
        "Reception",
    )
    cashier = make_user(
        "cashier@test.local",
        "0700000004",
        "Cashier12345!",
        Role.CASHIER,
        "Cate",
        "Cashier",
    )
    patient_user = make_user(
        "patient@test.local",
        "0700000005",
        "Patient12345!",
        Role.PATIENT,
        "Pam",
        "Patient",
    )

    doctor = DoctorProfile(
        user_id=doctor_user.id,
        department_id=department.id,
        specialty="General Practice",
        license_number="LIC-TEST-001",
        consultation_fee_minor=250000,
    )
    db.session.add(doctor)
    db.session.flush()
    for weekday in range(5):
        db.session.add(
            AvailabilityRule(
                doctor_id=doctor.id,
                weekday=weekday,
                start_time=time(8, 0),
                end_time=time(18, 0),
                slot_minutes=30,
                timezone="Africa/Nairobi",
            )
        )

    patient = create_patient_profile(
        patient_user,
        {
            "first_name": "Pam",
            "last_name": "Patient",
            "date_of_birth": date(1990, 1, 1),
            "sex": Sex.FEMALE,
            "phone": "0700000005",
            "email": "patient@test.local",
            "sha_number": "SHA-DEMO-ACTIVE",
            "allergies": "Penicillin",
            "whatsapp_consent": True,
            "email_consent": True,
        },
    )
    db.session.commit()
    return {
        "department_id": department.id,
        "service_id": service.id,
        "admin_id": admin.id,
        "doctor_user_id": doctor_user.id,
        "doctor_id": doctor.id,
        "reception_id": reception.id,
        "cashier_id": cashier.id,
        "patient_user_id": patient_user.id,
        "patient_id": patient.id,
    }


@pytest.fixture()
def client(app):
    return app.test_client()


def login(client, email, password):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def tokens(client):
    return {
        "admin": login(client, "admin@test.local", "Admin12345!"),
        "doctor": login(client, "doctor@test.local", "Doctor12345!"),
        "reception": login(client, "reception@test.local", "Reception12345!"),
        "cashier": login(client, "cashier@test.local", "Cashier12345!"),
        "patient": login(client, "patient@test.local", "Patient12345!"),
    }


@pytest.fixture()
def ids(app):
    return app.config["TEST_IDS"]
