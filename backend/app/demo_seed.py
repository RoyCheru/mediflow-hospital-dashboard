from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

from app.ai_assistance.models import AIInteraction
from app.auth.models import User
from app.billing.models import (
    CashReconciliation,
    Invoice,
    InvoiceAllocation,
    InvoiceLine,
    Refund,
    Transaction,
    VoidRequest,
)
from app.claims.models import Claim, ClaimStatusHistory
from app.common.audit import record_audit
from app.common.base import utcnow
from app.common.enums import (
    AIFeature,
    AIStatus,
    AllocationPayer,
    AllocationStatus,
    AppointmentSource,
    AppointmentStatus,
    CashReconciliationStatus,
    ClaimStatus,
    InvoiceStatus,
    NotificationChannel,
    NotificationStatus,
    PaymentMethod,
    RefundStatus,
    Role,
    TransactionStatus,
    Urgency,
    UserStatus,
    VoidRequestStatus,
)
from app.common.security import hash_password
from app.common.sequences import next_sequence_value
from app.extensions import db
from app.notifications.models import Notification
from app.patients.service import create_patient_profile
from app.scheduling.models import (
    Appointment,
    AvailabilityRule,
    DoctorProfile,
)


def _dt(days_ago=0, hour=10, minute=0):
    base = datetime.now(timezone.utc).replace(hour=hour, minute=minute, second=0, microsecond=0)
    return base - timedelta(days=days_ago)


def _month_date(months_ago, day=15, hour=11):
    now = datetime.now(timezone.utc)
    month = now.month - months_ago
    year = now.year + (month - 1) // 12
    month = (month - 1) % 12 + 1
    return datetime(year, month, day, hour, tzinfo=timezone.utc)


def _patient(admin, first, last, phone, dob, sex, allergies=None, sha=None, created_days_ago=0):
    profile = create_patient_profile(
        None,
        {
            "first_name": first,
            "last_name": last,
            "date_of_birth": dob,
            "sex": sex,
            "phone": phone,
            "email": f"{first.lower()}.{last.lower()}@example.test",
            "address": "Nairobi",
            "sha_number": sha,
            "allergies": allergies,
            "whatsapp_consent": True,
            "email_consent": True,
        },
        actor=admin,
    )
    if created_days_ago:
        when = utcnow() - timedelta(days=created_days_ago)
        profile.created_at = when
        profile.updated_at = when
    db.session.flush()
    return profile


def _invoice(patient, department, description, amount, method, when, status=InvoiceStatus.PAID):
    invoice = Invoice(
        invoice_number=next_sequence_value("invoice_number", prefix="INV-{year}-", width=6),
        patient_id=patient.id,
        department_id=department.id,
        currency="KES",
        subtotal_minor=amount,
        discount_minor=0,
        total_minor=amount,
        amount_paid_minor=amount if status == InvoiceStatus.PAID else 0,
        balance_minor=0 if status == InvoiceStatus.PAID else amount,
        status=status,
        primary_method=method,
        issued_at=when,
        created_at=when,
        updated_at=when,
    )
    invoice.lines.append(
        InvoiceLine(
            description=description,
            service_code="SEED",
            quantity=1,
            unit_price_minor=amount,
            line_total_minor=amount,
        )
    )
    db.session.add(invoice)
    db.session.flush()
    return invoice


def _transaction(invoice, method, amount, when, actor, status=TransactionStatus.SUCCESS):
    transaction = Transaction(
        invoice_id=invoice.id,
        method=method,
        amount_minor=amount,
        currency="KES",
        status=status,
        reference=f"SEED-{uuid4().hex[:14].upper()}",
        recorded_by_id=actor.id if actor else None,
        paid_at=when,
        created_at=when,
    )
    db.session.add(transaction)
    db.session.flush()
    return transaction


def _claim(invoice, patient, amount, status, submitted_days_ago, actor):
    allocation = InvoiceAllocation(
        invoice_id=invoice.id,
        payer=AllocationPayer.SHA,
        amount_minor=amount,
        status=AllocationStatus.PAID
        if status in {ClaimStatus.APPROVED, ClaimStatus.PAID}
        else AllocationStatus.PENDING,
        external_reference=f"SHA-{uuid4().hex[:10].upper()}",
    )
    db.session.add(allocation)
    db.session.flush()
    submitted = utcnow() - timedelta(days=submitted_days_ago)
    claim = Claim(
        invoice_id=invoice.id,
        allocation_id=allocation.id,
        patient_id=patient.id,
        sha_member_reference=patient.sha_number or "SHA-SEED",
        claimed_amount_minor=amount,
        approved_amount_minor=amount
        if status in {ClaimStatus.APPROVED, ClaimStatus.PAID}
        else None,
        status=status,
        external_reference=f"SHA-{uuid4().hex[:10].upper()}",
        submitted_at=submitted,
        decided_at=submitted + timedelta(days=8)
        if status in {ClaimStatus.APPROVED, ClaimStatus.REJECTED, ClaimStatus.PAID}
        else None,
        paid_at=submitted + timedelta(days=12) if status == ClaimStatus.PAID else None,
        rejection_reason="Member details did not match the submitted invoice"
        if status == ClaimStatus.REJECTED
        else None,
        created_by_id=actor.id if actor else None,
        created_at=submitted,
        updated_at=submitted,
    )
    db.session.add(claim)
    db.session.flush()
    db.session.add(
        ClaimStatusHistory(
            claim_id=claim.id,
            from_status=None,
            to_status=ClaimStatus.SUBMITTED,
            actor_id=actor.id if actor else None,
            note="Seeded claim",
            created_at=submitted,
        )
    )
    return claim


def seed_demo_activity(admin, doctor_user, doctor, departments, services, main_patient):
    """Create realistic admin data: staff, patients, appointments, billing, claims, audit."""
    from app.common.enums import Sex

    reception = User.query.filter_by(email="reception@mediflow.test").first()
    cashier = User.query.filter_by(email="cashier@mediflow.test").first()

    second_doctor_user = User(
        email="doctor2@mediflow.test",
        phone="0700000012",
        password_hash=hash_password("Doctor12345!"),
        role=Role.DOCTOR,
        status=UserStatus.ACTIVE,
        first_name="Lilian",
        last_name="Mutua",
        email_verified_at=utcnow(),
    )
    second_reception = User(
        email="reception2@mediflow.test",
        phone="0700000013",
        password_hash=hash_password("Reception12345!"),
        role=Role.RECEPTIONIST,
        status=UserStatus.ACTIVE,
        first_name="Joy",
        last_name="Wairimu",
        email_verified_at=utcnow(),
    )
    db.session.add_all([second_doctor_user, second_reception])
    db.session.flush()

    second_doctor = DoctorProfile(
        user_id=second_doctor_user.id,
        department_id=departments["PED"].id,
        specialty="Consultant Pediatrician",
        license_number="KMPDC-DEMO-002",
        consultation_fee_minor=300000,
        is_accepting_appointments=True,
    )
    db.session.add(second_doctor)
    db.session.flush()
    for weekday in range(5):
        db.session.add(
            AvailabilityRule(
                doctor_id=second_doctor.id,
                weekday=weekday,
                start_time=time(8, 0),
                end_time=time(16, 0),
                slot_minutes=30,
                timezone="Africa/Nairobi",
            )
        )

    patients = [main_patient]
    people = [
        (
            "Brian",
            "Otieno",
            "0711000101",
            date(1972, 9, 2),
            Sex.MALE,
            "Penicillin",
            "SHA-SEED-001",
            120,
        ),
        ("Wanjiru", "Kamau", "0711000102", date(1997, 4, 18), Sex.FEMALE, None, "SHA-SEED-002", 95),
        ("Mercy", "Chebet", "0711000103", date(2020, 2, 11), Sex.FEMALE, None, None, 70),
        (
            "Hassan",
            "Abdi",
            "0711000104",
            date(1979, 6, 21),
            Sex.MALE,
            "Sulfa drugs",
            "SHA-SEED-004",
            45,
        ),
        (
            "Halima",
            "Said",
            "0711000105",
            date(1990, 12, 3),
            Sex.FEMALE,
            "Iodine",
            "SHA-SEED-005",
            30,
        ),
        ("Kevin", "Mwangi", "0711000106", date(1984, 8, 15), Sex.MALE, None, None, 14),
        ("Esther", "Moraa", "0711000107", date(1995, 1, 9), Sex.FEMALE, None, "SHA-SEED-007", 3),
        ("Samuel", "Kiptoo", "0711000108", date(1965, 3, 27), Sex.MALE, None, "SHA-SEED-008", 0),
    ]
    for first, last, phone, dob, sex, allergy, sha, age_days in people:
        patients.append(
            _patient(
                admin,
                first,
                last,
                phone,
                dob,
                sex,
                allergies=allergy,
                sha=sha,
                created_days_ago=age_days,
            )
        )

    dept_codes = ["GEN", "PED", "CAR", "ORT"]
    service_codes = ["CONS-GEN", "CONS-PED", "CONS-CAR", "LAB-CBC", "XRAY-CHEST"]
    today = utcnow().date()

    for index, patient in enumerate(patients):
        department = departments[dept_codes[index % len(dept_codes)]]
        service = services[service_codes[index % len(service_codes)]]
        start = datetime.combine(today, time(8 + index, 30), tzinfo=timezone.utc)
        status = [
            AppointmentStatus.COMPLETED,
            AppointmentStatus.IN_CONSULTATION,
            AppointmentStatus.CHECKED_IN,
            AppointmentStatus.SCHEDULED,
            AppointmentStatus.SCHEDULED,
            AppointmentStatus.NO_SHOW,
        ][index % 6]
        appointment = Appointment(
            patient_id=patient.id,
            doctor_id=doctor.id,
            service_id=service.id,
            department_id=department.id,
            scheduled_start=start,
            scheduled_end=start + timedelta(minutes=30),
            status=status,
            source=[
                AppointmentSource.RECEPTION,
                AppointmentSource.ONLINE,
                AppointmentSource.WALK_IN,
            ][index % 3],
            urgency=[Urgency.ROUTINE, Urgency.URGENT, Urgency.EMERGENCY][0 if index % 4 else 1],
            no_show_score=0.05 * (index % 7),
            booked_by_id=reception.id if reception else admin.id,
        )
        if status == AppointmentStatus.COMPLETED:
            appointment.checked_in_at = start
            appointment.started_at = start
            appointment.completed_at = start + timedelta(minutes=30)
        elif status == AppointmentStatus.IN_CONSULTATION:
            appointment.checked_in_at = start
            appointment.started_at = start
        elif status == AppointmentStatus.CHECKED_IN:
            appointment.checked_in_at = start
        db.session.add(appointment)

        when = _month_date(index % 6, day=min(20, 5 + index))
        amount = 250000 + index * 75000
        method = [PaymentMethod.SHA, PaymentMethod.MPESA, PaymentMethod.CASH, PaymentMethod.CARD][
            index % 4
        ]
        invoice_status = (
            InvoiceStatus.PAID
            if index % 5 != 4
            else InvoiceStatus.PARTIALLY_PAID
            if index % 2
            else InvoiceStatus.ISSUED
        )
        invoice = _invoice(
            patient,
            department,
            service.name,
            amount,
            method,
            when,
            status=invoice_status,
        )
        if invoice_status == InvoiceStatus.PAID:
            _transaction(invoice, method, amount, when + timedelta(hours=1), cashier or admin)
        elif invoice_status == InvoiceStatus.PARTIALLY_PAID:
            _transaction(
                invoice,
                method,
                amount // 2,
                when + timedelta(hours=1),
                cashier or admin,
            )

        if method == PaymentMethod.SHA and index < 7:
            claim_status = [
                ClaimStatus.SUBMITTED,
                ClaimStatus.UNDER_REVIEW,
                ClaimStatus.APPROVED,
                ClaimStatus.REJECTED,
                ClaimStatus.PAID,
                ClaimStatus.SUBMITTED,
                ClaimStatus.UNDER_REVIEW,
            ][index]
            days = [10, 20, 35, 5, 45, 70, 16][index]
            _claim(invoice, patient, amount, claim_status, days, reception or admin)
            if claim_status == ClaimStatus.PAID:
                _transaction(
                    invoice,
                    PaymentMethod.SHA,
                    amount,
                    utcnow() - timedelta(days=max(days - 8, 1)),
                    cashier or admin,
                )

    # Pending approvals and cash reconciliation.
    pending_invoice = (
        Invoice.query.filter(Invoice.status != InvoiceStatus.VOIDED)
        .order_by(Invoice.created_at.desc())
        .first()
    )
    if pending_invoice is not None:
        db.session.add(
            VoidRequest(
                invoice_id=pending_invoice.id,
                reason="Duplicate invoice created during a ward transfer",
                requested_by_id=reception.id if reception else admin.id,
                status=VoidRequestStatus.PENDING,
            )
        )
        original = Transaction.query.filter_by(
            invoice_id=pending_invoice.id, status=TransactionStatus.SUCCESS
        ).first()
        if original is not None:
            db.session.add(
                Refund(
                    invoice_id=pending_invoice.id,
                    original_transaction_id=original.id,
                    amount_minor=max(original.amount_minor // 2, 1000),
                    reason="Patient overpaid at the cash desk",
                    requested_by_id=cashier.id if cashier else admin.id,
                    status=RefundStatus.PENDING,
                )
            )

    cash_expected = (
        db.session.query(db.func.coalesce(db.func.sum(Transaction.amount_minor), 0))
        .filter(
            Transaction.method == PaymentMethod.CASH,
            Transaction.status == TransactionStatus.SUCCESS,
        )
        .scalar()
        or 0
    )
    db.session.add(
        CashReconciliation(
            business_date=today,
            expected_cash_minor=int(cash_expected),
            counted_cash_minor=int(cash_expected) - 50000 if cash_expected else 0,
            variance_minor=-50000 if cash_expected else 0,
            status=CashReconciliationStatus.DISCREPANCY
            if cash_expected
            else CashReconciliationStatus.BALANCED,
            logged_by_id=cashier.id if cashier else admin.id,
            notes="Seeded end-of-shift count",
        )
    )

    # Notification log and AI interactions.
    for index, patient in enumerate(patients[:6]):
        channel = [
            NotificationChannel.WHATSAPP,
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
        ][index % 3]
        status = [
            NotificationStatus.SENT,
            NotificationStatus.DELIVERED,
            NotificationStatus.FAILED,
            NotificationStatus.QUEUED,
        ][index % 4]
        db.session.add(
            Notification(
                patient_id=patient.id,
                recipient_user_id=patient.user_id,
                channel=channel,
                template_key=[
                    "booking_confirmation",
                    "invoice_receipt",
                    "appointment_reminder_24h",
                ][index % 3],
                recipient_address=patient.phone
                if channel != NotificationChannel.EMAIL
                else patient.email,
                status=status,
                attempts=1 if status != NotificationStatus.QUEUED else 0,
                sent_at=utcnow() - timedelta(hours=index + 1)
                if status in {NotificationStatus.SENT, NotificationStatus.DELIVERED}
                else None,
                last_error="Simulated provider timeout"
                if status == NotificationStatus.FAILED
                else None,
            )
        )

    for index, (feature, status) in enumerate(
        [
            (AIFeature.VISIT_SUMMARY, AIStatus.APPROVED),
            (AIFeature.TRIAGE, AIStatus.COMPLETED),
            (AIFeature.REPORT_QUERY, AIStatus.COMPLETED),
            (AIFeature.NO_SHOW_RISK, AIStatus.COMPLETED),
        ]
    ):
        db.session.add(
            AIInteraction(
                feature=feature,
                actor_user_id=admin.id,
                input_summary=f"Seed interaction {index + 1}",
                output={"summary": "Seeded deterministic AI result"},
                provider="deterministic",
                status=status,
                approved=status == AIStatus.APPROVED,
            )
        )

    for index, actor in enumerate(
        [admin, doctor_user, reception or admin, cashier or admin, second_reception]
    ):
        if actor is None:
            continue
        record_audit(
            [
                "invoice.create",
                "claim.status_change",
                "patient.create",
                "invoice.allocation_create",
                "auth.login",
            ][index % 5],
            ["invoice", "claim", "patient", "invoice_allocation", "user"][index % 5],
            None,
            actor=actor,
            after={"seeded": True, "index": index},
        )

    db.session.commit()
