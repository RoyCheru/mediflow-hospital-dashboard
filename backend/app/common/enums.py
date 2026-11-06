from enum import Enum


class Role(str, Enum):
    PATIENT = "PATIENT"
    DOCTOR = "DOCTOR"
    RECEPTIONIST = "RECEPTIONIST"
    CASHIER = "CASHIER"
    ADMIN = "ADMIN"


STAFF_ROLES = {Role.DOCTOR, Role.RECEPTIONIST, Role.CASHIER, Role.ADMIN}
BILLING_ROLES = {Role.RECEPTIONIST, Role.CASHIER, Role.ADMIN}
CLINICAL_WRITE_ROLES = {Role.DOCTOR}
ADMIN_ROLES = {Role.ADMIN}


class UserStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    SUSPENDED = "SUSPENDED"
    PENDING_VERIFICATION = "PENDING_VERIFICATION"


class VerificationPurpose(str, Enum):
    EMAIL_VERIFY = "EMAIL_VERIFY"
    PHONE_VERIFY = "PHONE_VERIFY"
    PASSWORD_RESET = "PASSWORD_RESET"


class Sex(str, Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    OTHER = "OTHER"
    UNKNOWN = "UNKNOWN"


class ConsentChannel(str, Enum):
    WHATSAPP = "WHATSAPP"
    EMAIL = "EMAIL"
    SMS = "SMS"


class AppointmentStatus(str, Enum):
    SCHEDULED = "SCHEDULED"
    CHECKED_IN = "CHECKED_IN"
    IN_CONSULTATION = "IN_CONSULTATION"
    COMPLETED = "COMPLETED"
    NO_SHOW = "NO_SHOW"
    CANCELLED = "CANCELLED"


class AppointmentSource(str, Enum):
    ONLINE = "ONLINE"
    RECEPTION = "RECEPTION"
    WALK_IN = "WALK_IN"


class Urgency(str, Enum):
    ROUTINE = "ROUTINE"
    URGENT = "URGENT"
    EMERGENCY = "EMERGENCY"


class AvailabilityExceptionKind(str, Enum):
    LEAVE = "LEAVE"
    BLOCKED = "BLOCKED"
    EXTRA = "EXTRA"


class PrescriptionStatus(str, Enum):
    ISSUED = "ISSUED"
    CANCELLED = "CANCELLED"


class AttachmentType(str, Enum):
    LAB_REPORT = "LAB_REPORT"
    SCAN = "SCAN"
    REFERRAL = "REFERRAL"
    OTHER = "OTHER"


class InvoiceStatus(str, Enum):
    DRAFT = "DRAFT"
    ISSUED = "ISSUED"
    PARTIALLY_PAID = "PARTIALLY_PAID"
    PAID = "PAID"
    VOIDED = "VOIDED"
    REFUNDED = "REFUNDED"


class PaymentMethod(str, Enum):
    SHA = "SHA"
    MPESA = "MPESA"
    CASH = "CASH"
    CARD = "CARD"
    BANK = "BANK"
    SELF_PAY = "SELF_PAY"


class AllocationPayer(str, Enum):
    PATIENT = "PATIENT"
    SHA = "SHA"
    INSURANCE = "INSURANCE"


class AllocationStatus(str, Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    VOIDED = "VOIDED"


class PaymentIntentStatus(str, Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    TIMEOUT = "TIMEOUT"
    UNCONFIRMED = "UNCONFIRMED"


class TransactionStatus(str, Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    UNCONFIRMED = "UNCONFIRMED"
    REVERSED = "REVERSED"


class VoidRequestStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class RefundStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    COMPLETED = "COMPLETED"


class CashReconciliationStatus(str, Enum):
    OPEN = "OPEN"
    BALANCED = "BALANCED"
    DISCREPANCY = "DISCREPANCY"


class ClaimStatus(str, Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    PAID = "PAID"
    CANCELLED = "CANCELLED"


class EligibilityStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    LIMIT_EXHAUSTED = "LIMIT_EXHAUSTED"
    UNKNOWN = "UNKNOWN"


class NotificationChannel(str, Enum):
    WHATSAPP = "WHATSAPP"
    EMAIL = "EMAIL"
    SMS = "SMS"
    IN_APP = "IN_APP"


class NotificationStatus(str, Enum):
    QUEUED = "QUEUED"
    SENDING = "SENDING"
    SENT = "SENT"
    DELIVERED = "DELIVERED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class NotificationAttemptStatus(str, Enum):
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"


class ReportFormat(str, Enum):
    CSV = "CSV"
    PDF = "PDF"


class ExportStatus(str, Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class AIFeature(str, Enum):
    TRIAGE = "TRIAGE"
    VISIT_SUMMARY = "VISIT_SUMMARY"
    NO_SHOW_RISK = "NO_SHOW_RISK"
    REPORT_QUERY = "REPORT_QUERY"
    DOCTOR_SUGGESTION = "DOCTOR_SUGGESTION"


class AIStatus(str, Enum):
    DRAFT = "DRAFT"
    COMPLETED = "COMPLETED"
    APPROVED = "APPROVED"
    FAILED = "FAILED"


class OutboxStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    PROCESSED = "PROCESSED"
    FAILED = "FAILED"
    DEAD = "DEAD"


class IdempotencyStatus(str, Enum):
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
