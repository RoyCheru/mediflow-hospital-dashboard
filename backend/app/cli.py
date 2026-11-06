from datetime import date, time, timedelta

import click

from app.common.enums import Role, Sex, UserStatus
from app.common.security import hash_password
from app.extensions import db


def register_cli(app):
    @app.cli.command("seed")
    def seed():
        """Create a realistic demo dataset for every role."""
        from app.auth.models import User
        from app.common.base import utcnow
        from app.common.enums import AppointmentSource, AppointmentStatus
        from app.notifications.service import ensure_default_templates
        from app.patients.service import create_patient_profile
        from app.scheduling.models import (
            Appointment,
            AvailabilityRule,
            Department,
            DoctorProfile,
            Service,
            ServicePrice,
        )

        ensure_default_templates()
        if User.query.filter_by(email="admin@mediflow.test").first():
            click.echo("Seed data already present")
            return

        departments = {}
        for name, code in (
            ("General Medicine", "GEN"),
            ("Pediatrics", "PED"),
            ("Cardiology", "CAR"),
            ("Orthopaedics", "ORT"),
        ):
            department = Department(name=name, code=code, description=f"{name} department")
            db.session.add(department)
            departments[code] = department
        db.session.flush()

        services = {}
        for code, department, name, price in (
            ("CONS-GEN", "GEN", "General consultation", 250000),
            ("CONS-PED", "PED", "Pediatric consultation", 300000),
            ("CONS-CAR", "CAR", "Cardiology consultation", 500000),
            ("LAB-CBC", "GEN", "Complete blood count", 120000),
            ("XRAY-CHEST", "GEN", "Chest X-ray", 350000),
        ):
            service = Service(
                department_id=departments[department].id,
                name=name,
                code=code,
            )
            db.session.add(service)
            db.session.flush()
            db.session.add(
                ServicePrice(
                    service_id=service.id,
                    amount_minor=price,
                    effective_from=utcnow() - timedelta(days=30),
                )
            )
            services[code] = service

        def make_user(email, phone, password, role, first, last):
            user = User(
                email=email,
                phone=phone,
                password_hash=hash_password(password),
                role=role,
                status=UserStatus.ACTIVE,
                first_name=first,
                last_name=last,
                email_verified_at=utcnow(),
            )
            db.session.add(user)
            db.session.flush()
            return user

        make_user("admin@mediflow.test", "0700000001", "Admin12345!", Role.ADMIN, "Amina", "Admin")
        doctor_user = make_user(
            "doctor@mediflow.test",
            "0700000002",
            "Doctor12345!",
            Role.DOCTOR,
            "Otieno",
            "Odhiambo",
        )
        make_user(
            "reception@mediflow.test",
            "0700000003",
            "Reception12345!",
            Role.RECEPTIONIST,
            "Grace",
            "Wanjiku",
        )
        make_user(
            "cashier@mediflow.test",
            "0700000004",
            "Cashier12345!",
            Role.CASHIER,
            "Peter",
            "Kariuki",
        )
        patient_user = make_user(
            "patient@mediflow.test",
            "0700000005",
            "Patient12345!",
            Role.PATIENT,
            "Amina",
            "Hassan",
        )

        doctor = DoctorProfile(
            user_id=doctor_user.id,
            department_id=departments["GEN"].id,
            specialty="General Practice",
            license_number="KMPDC-DEMO-001",
            consultation_fee_minor=250000,
        )
        db.session.add(doctor)
        db.session.flush()

        for weekday in range(5):
            db.session.add(
                AvailabilityRule(
                    doctor_id=doctor.id,
                    weekday=weekday,
                    start_time=time(9, 0),
                    end_time=time(17, 0),
                    slot_minutes=30,
                    timezone="Africa/Nairobi",
                )
            )

        patient = create_patient_profile(
            patient_user,
            {
                "first_name": "Amina",
                "last_name": "Hassan",
                "date_of_birth": date(1994, 4, 12),
                "sex": Sex.FEMALE,
                "phone": "0700000005",
                "email": "patient@mediflow.test",
                "address": "Nairobi",
                "sha_number": "SHA-DEMO-ACTIVE",
                "allergies": "Penicillin",
                "whatsapp_consent": True,
                "email_consent": True,
            },
        )

        tomorrow = utcnow().replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=1)
        appointment = Appointment(
            patient_id=patient.id,
            doctor_id=doctor.id,
            service_id=services["CONS-GEN"].id,
            department_id=departments["GEN"].id,
            scheduled_start=tomorrow,
            scheduled_end=tomorrow + timedelta(minutes=30),
            status=AppointmentStatus.SCHEDULED,
            source=AppointmentSource.ONLINE,
            booked_by_id=patient_user.id,
        )
        db.session.add(appointment)
        db.session.commit()

        click.echo("Demo users created:")
        click.echo("  admin@mediflow.test / Admin12345!")
        click.echo("  doctor@mediflow.test / Doctor12345!")
        click.echo("  reception@mediflow.test / Reception12345!")
        click.echo("  cashier@mediflow.test / Cashier12345!")
        click.echo("  patient@mediflow.test / Patient12345!")

    @app.cli.command("create-admin")
    @click.option("--email", required=True)
    @click.option("--password", required=True)
    @click.option("--first-name", default="System")
    @click.option("--last-name", default="Administrator")
    def create_admin(email, password, first_name, last_name):
        from app.auth.models import User
        from app.common.security import validate_password_policy

        validate_password_policy(password)
        if User.query.filter_by(email=email.lower()).first():
            raise click.ClickException("A user with that email already exists")
        user = User(
            email=email.lower(),
            password_hash=hash_password(password),
            role=Role.ADMIN,
            status=UserStatus.ACTIVE,
            first_name=first_name,
            last_name=last_name,
        )
        db.session.add(user)
        db.session.commit()
        click.echo(f"Admin created: {email}")

    @app.cli.command("dispatch-notifications")
    def dispatch_notifications():
        from app.notifications.service import dispatch_due

        count = dispatch_due()
        click.echo(f"Dispatched {count} notifications")

    @app.cli.command("process-outbox")
    def process_outbox():
        from app.common.base import utcnow
        from app.common.enums import OutboxStatus
        from app.common.models import OutboxEvent
        from app.notifications.service import queue_event_notifications

        events = OutboxEvent.query.filter(
            OutboxEvent.status == OutboxStatus.PENDING,
            OutboxEvent.available_at <= utcnow(),
        ).all()
        for event in events:
            try:
                queue_event_notifications(event)
                event.status = OutboxStatus.PROCESSED
                event.processed_at = utcnow()
            except Exception as exc:
                event.status = OutboxStatus.FAILED
                event.last_error = str(exc)[:500]
        db.session.commit()
        click.echo(f"Processed {len(events)} outbox events")

    @app.cli.command("build-export")
    @click.argument("export_id")
    def build_export_command(export_id):
        from app.analytics.models import ReportExport
        from app.analytics.service import build_export

        export = ReportExport.query.get(export_id)
        if export is None:
            raise click.ClickException("Export not found")
        build_export(export)
        click.echo(f"Export {export.id} is {export.status.value}")
