import csv
import io
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

from app.analytics.models import ReportExport
from app.billing.models import Invoice, Transaction
from app.claims.models import Claim
from app.clinical_records.models import Visit
from app.common.base import as_utc, utcnow
from app.common.enums import (
    ClaimStatus,
    ExportStatus,
    ReportFormat,
    TransactionStatus,
)
from app.common.errors import bad_request
from app.extensions import db
from app.scheduling.models import Appointment

ALLOWED_REPORTS = {
    "revenue": "revenue_by_payment_method",
    "claims_aging": "claims_report",
    "doctor_workload": "doctor_workload",
    "no_shows": "no_show_report",
    "daily_cash": "daily_cash_report",
}


def _range(start_date, end_date):
    start = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
    end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
    return start, end


def _transactions(start_date, end_date):
    start, end = _range(start_date, end_date)
    return Transaction.query.filter(
        Transaction.status == TransactionStatus.SUCCESS,
        Transaction.paid_at >= start,
        Transaction.paid_at < end,
    ).all()


def revenue_by_payment_method(start_date, end_date, group_by="method"):
    transactions = _transactions(start_date, end_date)
    invoice_ids = {item.invoice_id for item in transactions}
    invoices = (
        {invoice.id: invoice for invoice in Invoice.query.filter(Invoice.id.in_(invoice_ids)).all()}
        if invoice_ids
        else {}
    )
    visits = {}
    if invoice_ids:
        visit_ids = {
            invoice.visit_id for invoice in invoices.values() if invoice.visit_id is not None
        }
        visits = {visit.id: visit for visit in Visit.query.filter(Visit.id.in_(visit_ids)).all()}

    buckets = defaultdict(int)
    counts = defaultdict(int)
    for transaction in transactions:
        invoice = invoices.get(transaction.invoice_id)
        visit = visits.get(invoice.visit_id) if invoice and invoice.visit_id else None
        if group_by == "method":
            key = transaction.method.value
        elif group_by == "month":
            key = transaction.paid_at.strftime("%Y-%m")
        elif group_by == "doctor":
            key = str(visit.doctor_id) if visit else "unassigned"
        elif group_by == "department":
            key = str(invoice.department_id) if invoice and invoice.department_id else "unassigned"
        else:
            raise bad_request("Invalid group_by value")
        buckets[key] += transaction.amount_minor
        counts[key] += 1
    return {
        "group_by": group_by,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "total_minor": sum(transaction.amount_minor for transaction in transactions),
        "groups": [
            {
                "key": key,
                "amount_minor": amount,
                "transaction_count": counts[key],
            }
            for key, amount in sorted(buckets.items())
        ],
    }


def claims_report(start_date=None, end_date=None):
    query = Claim.query
    if start_date:
        start = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        query = query.filter(Claim.created_at >= start)
    if end_date:
        end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
        query = query.filter(Claim.created_at < end)
    claims = query.all()
    by_status = defaultdict(int)
    aging = {"current": 0, "14_days": 0, "30_days": 0, "60_days": 0}
    paid_days = []
    for claim in claims:
        by_status[claim.status.value] += 1
        if claim.status in {ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW}:
            age = (utcnow() - as_utc(claim.submitted_at)).days if claim.submitted_at else 0
            if age >= 60:
                aging["60_days"] += 1
            elif age >= 30:
                aging["30_days"] += 1
            elif age >= 14:
                aging["14_days"] += 1
            else:
                aging["current"] += 1
        if claim.paid_at and claim.submitted_at:
            paid_days.append((as_utc(claim.paid_at) - as_utc(claim.submitted_at)).days)
    decided = by_status.get(ClaimStatus.APPROVED.value, 0) + by_status.get(
        ClaimStatus.PAID.value, 0
    )
    rejected = by_status.get(ClaimStatus.REJECTED.value, 0)
    total_decided = decided + rejected
    return {
        "total_claims": len(claims),
        "by_status": dict(by_status),
        "aging_buckets": aging,
        "approval_rate": round(decided / total_decided, 4) if total_decided else None,
        "average_days_to_payment": round(sum(paid_days) / len(paid_days), 2) if paid_days else None,
    }


def doctor_workload(start_date, end_date, doctor_id=None):
    start, end = _range(start_date, end_date)
    effective_time = db.func.coalesce(
        Appointment.scheduled_start,
        Appointment.arrived_at,
        Appointment.created_at,
    )
    appointments = Appointment.query.filter(
        effective_time >= start,
        effective_time < end,
    )
    if doctor_id:
        from uuid import UUID

        if isinstance(doctor_id, str):
            doctor_id = UUID(doctor_id)
        appointments = appointments.filter(Appointment.doctor_id == doctor_id)
    rows = appointments.all()
    by_doctor = defaultdict(
        lambda: {
            "appointments": 0,
            "completed": 0,
            "no_shows": 0,
            "cancelled": 0,
        }
    )
    for appointment in rows:
        bucket = by_doctor[str(appointment.doctor_id)]
        bucket["appointments"] += 1
        if appointment.status.value == "COMPLETED":
            bucket["completed"] += 1
        elif appointment.status.value == "NO_SHOW":
            bucket["no_shows"] += 1
        elif appointment.status.value == "CANCELLED":
            bucket["cancelled"] += 1
    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "doctors": [
            {"doctor_id": doctor_id, **stats} for doctor_id, stats in sorted(by_doctor.items())
        ],
    }


def doctor_stats(doctor_id, start_date, end_date):
    start, end = _range(start_date, end_date)
    visits = Visit.query.filter(
        Visit.doctor_id == doctor_id,
        Visit.started_at >= start,
        Visit.started_at < end,
    ).all()
    completed = [visit for visit in visits if visit.completed_at is not None]
    durations = [
        (visit.completed_at - visit.started_at).total_seconds() / 60
        for visit in completed
        if visit.completed_at and visit.started_at
    ]
    invoice_ids = [
        invoice.id
        for invoice in Invoice.query.filter(
            Invoice.visit_id.in_([visit.id for visit in visits] or [None])
        ).all()
    ]
    revenue = (
        db.session.query(db.func.coalesce(db.func.sum(Transaction.amount_minor), 0))
        .filter(
            Transaction.invoice_id.in_(invoice_ids or [None]),
            Transaction.status == TransactionStatus.SUCCESS,
        )
        .scalar()
    )
    return {
        "doctor_id": str(doctor_id),
        "patients_seen": len({visit.patient_id for visit in visits}),
        "consultations": len(visits),
        "average_consultation_minutes": round(sum(durations) / len(durations), 2)
        if durations
        else None,
        "revenue_minor": int(revenue),
    }


def no_show_report(start_date, end_date):
    from app.common.enums import AppointmentSource

    start, end = _range(start_date, end_date)
    effective_time = db.func.coalesce(
        Appointment.scheduled_start,
        Appointment.arrived_at,
        Appointment.created_at,
    )
    appointments = Appointment.query.filter(
        Appointment.source != AppointmentSource.WALK_IN,
        effective_time >= start,
        effective_time < end,
    ).all()
    total = len(appointments)
    no_shows = sum(1 for item in appointments if item.status.value == "NO_SHOW")
    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "total_appointments": total,
        "no_shows": no_shows,
        "no_show_rate": round(no_shows / total, 4) if total else 0,
    }


def daily_cash_report(target_date):
    from app.billing.service import cash_summary

    return cash_summary(target_date)


def run_report(report_key, parameters):
    from app.common.time import hospital_today

    today = hospital_today()
    start_date = _as_date(parameters.get("start_date")) or today.replace(day=1)
    end_date = _as_date(parameters.get("end_date")) or today
    if report_key == "revenue":
        return revenue_by_payment_method(start_date, end_date, parameters.get("group_by", "method"))
    if report_key == "claims_aging":
        return claims_report(start_date, end_date)
    if report_key == "doctor_workload":
        return doctor_workload(start_date, end_date, parameters.get("doctor_id"))
    if report_key == "no_shows":
        return no_show_report(start_date, end_date)
    if report_key == "daily_cash":
        # The analytics page sends a date range; the day's cash is its last day.
        return daily_cash_report(
            _as_date(parameters.get("business_date"))
            or _as_date(parameters.get("end_date"))
            or today
        )
    raise bad_request("Unknown report")


def _as_date(value):
    if not value:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def create_export(report_key, parameters, report_format, actor):
    if report_key not in ALLOWED_REPORTS:
        raise bad_request("Report is not in the allowlist")
    export = ReportExport(
        report_key=report_key,
        parameters=parameters,
        report_format=report_format,
        requested_by_id=actor.id,
    )
    db.session.add(export)
    db.session.commit()
    return export


def _safe_csv_value(value):
    text = "" if value is None else str(value)
    if text.startswith(("=", "+", "-", "@")):
        return "'" + text
    return text


def _report_sections(result):
    """Turn a report result into (title, header, rows) tables for CSV/PDF.

    Scalars form one key/value table; a list of records becomes its own table
    (one row per record); a mapping becomes a key/value table. Nested values are
    never written as Python reprs.
    """
    summary = []
    sections = []
    for key, value in result.items():
        if isinstance(value, list):
            records = [item for item in value if isinstance(item, dict)]
            if records:
                header = list(dict.fromkeys(k for item in records for k in item))
                rows = [[item.get(column) for column in header] for item in records]
                sections.append((key, header, rows))
            elif value:
                sections.append((key, ["value"], [[item] for item in value]))
            else:
                sections.append((key, ["value"], []))
        elif isinstance(value, dict):
            sections.append((key, ["key", "value"], [[k, v] for k, v in value.items()]))
        else:
            summary.append([key, value])
    if summary:
        sections.insert(0, ("summary", ["key", "value"], summary))
    return sections


def _render_csv(sections):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    for index, (title, header, rows) in enumerate(sections):
        if index:
            writer.writerow([])
        if len(sections) > 1:
            writer.writerow([_safe_csv_value(title)])
        writer.writerow([_safe_csv_value(column) for column in header])
        for row in rows:
            writer.writerow([_safe_csv_value(cell) for cell in row])
    return buffer.getvalue().encode()


def _render_pdf(report_key, sections):
    from app.integrations.pdf import build_pdf

    lines = ["MediFlow", report_key.replace("_", " ").title(), ""]
    for title, header, rows in sections:
        lines.append(str(title).replace("_", " ").title())
        if header == ["key", "value"]:
            lines.extend(f"  {str(k).replace('_', ' ').title()}: {v}" for k, v in rows)
        else:
            lines.append("  " + " | ".join(str(column) for column in header))
            for row in rows:
                lines.append("  " + " | ".join("" if cell is None else str(cell) for cell in row))
        if not rows:
            lines.append("  (none)")
        lines.append("")
    return build_pdf(lines)


def build_export(export):
    from app.integrations.object_storage import get_object_storage

    try:
        export.status = ExportStatus.PROCESSING
        db.session.commit()
        sections = _report_sections(run_report(export.report_key, export.parameters))
        if export.report_format == ReportFormat.CSV:
            content = _render_csv(sections)
            content_type = "text/csv"
            extension = "csv"
        else:
            content = _render_pdf(export.report_key, sections)
            content_type = "application/pdf"
            extension = "pdf"
        key = f"exports/{export.id}.{extension}"
        get_object_storage().put(key, content, content_type)
        export.status = ExportStatus.COMPLETED
        export.storage_key = key
        export.completed_at = utcnow()
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        export.status = ExportStatus.FAILED
        export.error_message = str(exc)[:500]
        db.session.commit()
        raise
    return export


def process_export(export):
    """Build an export now, or hand it to the Celery worker when configured.

    REPORT_EXPORTS_ASYNC=true sends it to the worker (app.tasks.documents.build_export);
    if the broker cannot be reached it is built here instead, so a request never
    leaves an export QUEUED with nothing to pick it up. A failed build is stored
    as FAILED with its error rather than failing the request.
    """
    from flask import current_app

    if current_app.config.get("REPORT_EXPORTS_ASYNC"):
        try:
            from celery import Celery

            client = Celery(broker=current_app.config["CELERY_BROKER_URL"])
            client.conf.broker_connection_retry_on_startup = False
            client.conf.broker_transport_options = {"max_retries": 1}
            client.send_task("app.tasks.documents.build_export", args=[str(export.id)])
            return export
        except Exception:  # noqa: BLE001 - broker down: build inline instead
            current_app.logger.warning("Report export broker unavailable; building inline")
    try:
        build_export(export)
    except Exception:  # noqa: BLE001 - recorded on the export as FAILED
        current_app.logger.exception("Report export %s failed", export.id)
    return export
