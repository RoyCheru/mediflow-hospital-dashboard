"""Import every model so SQLAlchemy and Alembic see the complete metadata."""

from app.ai_assistance.models import AIInteraction
from app.analytics.models import ReportExport
from app.audit.models import AuditLog
from app.auth.models import RefreshTokenFamily, User, VerificationToken
from app.billing.models import (
    CashReconciliation,
    Invoice,
    InvoiceAllocation,
    InvoiceLine,
    PaymentIntent,
    Refund,
    Transaction,
    VoidRequest,
)
from app.claims.models import Claim, ClaimStatusHistory, EligibilityCheck
from app.clinical_records.models import (
    Attachment,
    Prescription,
    PrescriptionItem,
    ReferralLetter,
    Visit,
)
from app.common.models import IdempotencyKey, NumberSequence, OutboxEvent
from app.notifications.models import (
    Notification,
    NotificationAttempt,
    NotificationTemplate,
)
from app.patients.models import ConsentRecord, PatientProfile
from app.scheduling.models import (
    Appointment,
    AvailabilityException,
    AvailabilityRule,
    Department,
    DoctorProfile,
    Service,
    ServicePrice,
)

__all__ = [
    "AIInteraction",
    "Appointment",
    "Attachment",
    "AuditLog",
    "AvailabilityException",
    "AvailabilityRule",
    "CashReconciliation",
    "Claim",
    "ClaimStatusHistory",
    "ConsentRecord",
    "Department",
    "DoctorProfile",
    "EligibilityCheck",
    "IdempotencyKey",
    "Invoice",
    "InvoiceAllocation",
    "InvoiceLine",
    "Notification",
    "NotificationAttempt",
    "NotificationTemplate",
    "NumberSequence",
    "OutboxEvent",
    "PatientProfile",
    "PaymentIntent",
    "Prescription",
    "PrescriptionItem",
    "ReferralLetter",
    "RefreshTokenFamily",
    "Refund",
    "ReportExport",
    "Service",
    "ServicePrice",
    "Transaction",
    "User",
    "VerificationToken",
    "Visit",
    "VoidRequest",
]
