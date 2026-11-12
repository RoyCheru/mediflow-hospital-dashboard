from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func

from app.audit.models import AuditLog
from app.audit.service import serialize_audit
from app.billing.models import Invoice, Refund, Transaction, VoidRequest
from app.claims.models import Claim
from app.claims.service import serialize_claim
from app.common.base import as_utc, utcnow
from app.common.enums import (
    ClaimStatus,
    RefundStatus,
    TransactionStatus,
    VoidRequestStatus,
)
from app.extensions import db
from app.patients.models import PatientProfile
from app.scheduling.models import Appointment
from app.scheduling.service import serialize_appointment

PAYMENT_METHODS = ("SHA", "MPESA", "CASH", "CARD", "BANK", "SELF_PAY")


def _day_bounds(target_date):
    start = datetime.combine(target_date, time.min, tzinfo=timezone.utc)
    return start, start + timedelta(days=1)


def _month_start(target_date):
    return target_date.replace(day=1)


def _shift_month(target_date, months):
    month = target_date.month - 1 + months
    year = target_date.year + month // 12
    month = month % 12 + 1
    return date(year, month, 1)


def _pct(current, previous):
    if previous in (None, 0):
        return None
    return round((current - previous) / previous * 100, 1)


def _sum_successful_transactions(start, end):
    value = (
        db.session.query(func.coalesce(func.sum(Transaction.amount_minor), 0))
        .filter(
            Transaction.status == TransactionStatus.SUCCESS,
            Transaction.paid_at >= start,
            Transaction.paid_at < end,
        )
        .scalar()
    )
    return int(value or 0)


def _month_bounds(target_date):
    current_start = datetime.combine(_month_start(target_date), time.min, tzinfo=timezone.utc)
    next_start = datetime.combine(
        _shift_month(_month_start(target_date), 1), time.min, tzinfo=timezone.utc
    )
    return current_start, next_start


def _method_totals(start, end):
    rows = (
        db.session.query(Transaction.method, func.coalesce(func.sum(Transaction.amount_minor), 0))
        .filter(
            Transaction.status == TransactionStatus.SUCCESS,
            Transaction.paid_at >= start,
            Transaction.paid_at < end,
        )
        .group_by(Transaction.method)
        .all()
    )
    totals = {method: 0 for method in PAYMENT_METHODS}
    for method, amount in rows:
        key = method.value if hasattr(method, "value") else str(method)
        totals[key] = int(amount or 0)
    return totals


def _payment_split(start, end):
    totals = _method_totals(start, end)
    grand_total = sum(totals.values())
    rows = []
    for method in PAYMENT_METHODS:
        amount = totals[method]
        if amount == 0 and method not in {"SHA", "MPESA", "CASH"}:
            continue
        rows.append(
            {
                "method": method,
                "amount_minor": amount,
                "percentage": round(amount / grand_total * 100, 1) if grand_total else 0.0,
            }
        )
    return sorted(rows, key=lambda item: item["amount_minor"], reverse=True)


def _revenue_trend(today):
    current_month = _month_start(today)
    start_month = _shift_month(current_month, -5)
    start = datetime.combine(start_month, time.min, tzinfo=timezone.utc)
    end = datetime.combine(_shift_month(current_month, 1), time.min, tzinfo=timezone.utc)
    months = []
    cursor = start_month
    for _ in range(6):
        months.append(cursor.strftime("%Y-%m"))
        cursor = _shift_month(cursor, 1)

    transactions = Transaction.query.filter(
        Transaction.status == TransactionStatus.SUCCESS,
        Transaction.paid_at >= start,
        Transaction.paid_at < end,
    ).all()

    method_rows = {
        month: {"month": month, **{method: 0 for method in PAYMENT_METHODS}, "total_minor": 0}
        for month in months
    }
    department_names = set()
    department_rows = {month: {"month": month, "total_minor": 0} for month in months}

    for transaction in transactions:
        paid_at = as_utc(transaction.paid_at)
        key = paid_at.strftime("%Y-%m")
        if key not in method_rows:
            continue
        method = transaction.method.value
        amount = int(transaction.amount_minor or 0)
        method_rows[key][method] = method_rows[key].get(method, 0) + amount
        method_rows[key]["total_minor"] += amount

        invoice = getattr(transaction, "invoice", None)
        department = getattr(invoice, "department", None) if invoice is not None else None
        department_name = getattr(department, "name", None) or "Unassigned"
        department_names.add(department_name)
        department_rows[key][department_name] = (
            department_rows[key].get(department_name, 0) + amount
        )
        department_rows[key]["total_minor"] += amount

    return {
        "months": months,
        "methods": list(PAYMENT_METHODS),
        "departments": sorted(department_names),
        "by_method": [method_rows[month] for month in months],
        "by_department": [department_rows[month] for month in months],
    }


def _stat_cards(today):
    month_start, next_month_start = _month_bounds(today)
    previous_month_start = datetime.combine(
        _shift_month(_month_start(today), -1), time.min, tzinfo=timezone.utc
    )

    total_patients = PatientProfile.query.count()
    patients_before_month = PatientProfile.query.filter(
        PatientProfile.created_at < month_start
    ).count()

    today_start, today_end = _day_bounds(today)
    yesterday_start, yesterday_end = _day_bounds(today - timedelta(days=1))
    appointments_today = Appointment.query.filter(
        Appointment.scheduled_start >= today_start,
        Appointment.scheduled_start < today_end,
    ).count()
    appointments_yesterday = Appointment.query.filter(
        Appointment.scheduled_start >= yesterday_start,
        Appointment.scheduled_start < yesterday_end,
    ).count()

    revenue_month = _sum_successful_transactions(month_start, next_month_start)
    revenue_previous = _sum_successful_transactions(previous_month_start, month_start)

    pending_claims = Claim.query.filter(
        Claim.status.in_([ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW])
    ).count()
    pending_voids = VoidRequest.query.filter(
        VoidRequest.status == VoidRequestStatus.PENDING
    ).count()
    pending_refunds = Refund.query.filter(Refund.status == RefundStatus.PENDING).count()

    return {
        "total_patients": {
            "value": total_patients,
            "change_pct": _pct(total_patients, patients_before_month),
        },
        "appointments_today": {
            "value": appointments_today,
            "change_pct": _pct(appointments_today, appointments_yesterday),
        },
        "revenue_month_minor": {
            "value_minor": revenue_month,
            "change_pct": _pct(revenue_month, revenue_previous),
        },
        "pending_claims": {"value": pending_claims, "change_pct": None},
        "pending_voids": {"value": pending_voids},
        "pending_refunds": {"value": pending_refunds},
    }


def _today_schedule(today, limit=8):
    start, end = _day_bounds(today)
    appointments = (
        Appointment.query.filter(
            Appointment.scheduled_start >= start,
            Appointment.scheduled_start < end,
        )
        .order_by(Appointment.scheduled_start.asc())
        .limit(limit)
        .all()
    )
    return [serialize_appointment(item) for item in appointments]


def _recent_claims(limit=5):
    claims = Claim.query.order_by(Claim.created_at.desc()).limit(limit).all()
    return [serialize_claim(item) for item in claims]


def _recent_audit(limit=6):
    entries = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [serialize_audit(item) for item in entries]


def dashboard_summary(today=None):
    target = today or utcnow().date()
    month_start, next_month_start = _month_bounds(target)
    return {
        "as_of": utcnow().isoformat(),
        "stats": _stat_cards(target),
        "revenue_trend": _revenue_trend(target),
        "payment_split": _payment_split(month_start, next_month_start),
        "today_schedule": _today_schedule(target),
        "recent_claims": _recent_claims(),
        "recent_audit": _recent_audit(),
    }


def pending_approvals():
    voids = VoidRequest.query.filter(VoidRequest.status == VoidRequestStatus.PENDING).all()
    refunds = Refund.query.filter(Refund.status == RefundStatus.PENDING).all()
    from app.billing.service import serialize_refund, serialize_void_request

    return {
        "void_requests": [serialize_void_request(item) for item in voids],
        "refunds": [serialize_refund(item) for item in refunds],
    }


def invoice_totals():
    rows = (
        db.session.query(Invoice.status, func.count(Invoice.id), func.sum(Invoice.balance_minor))
        .group_by(Invoice.status)
        .all()
    )
    return defaultdict(
        int,
        {
            (status.value if hasattr(status, "value") else str(status)): {
                "count": int(count),
                "balance_minor": int(balance or 0),
            }
            for status, count, balance in rows
        },
    )
