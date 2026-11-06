import re

from app.ai_assistance.models import AIInteraction
from app.analytics.service import ALLOWED_REPORTS, run_report
from app.common.audit import record_audit
from app.common.base import utcnow
from app.common.enums import AIFeature, AIStatus
from app.common.errors import bad_request, forbidden, not_found
from app.extensions import db
from app.integrations.llm import (
    DeterministicLanguageModelGateway,
    get_language_model,
)

PHONE_RE = re.compile(r"(?:\+?254|0)?7\d{8}|(?:\+?254|0)?1\d{8}")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
ID_RE = re.compile(r"\b\d{7,10}\b")


def mask_text(value):
    text = value or ""
    text = EMAIL_RE.sub("[email]", text)
    text = PHONE_RE.sub("[phone]", text)
    text = ID_RE.sub("[id]", text)
    return text


def serialize_interaction(item):
    return {
        "id": str(item.id),
        "feature": item.feature.value,
        "input_summary": item.input_summary,
        "output": item.output,
        "status": item.status.value,
        "approved": item.approved,
        "provider": item.provider,
        "model": item.model,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def triage(symptoms, actor=None, patient_id=None):
    masked = mask_text(symptoms)
    gateway = get_language_model()
    try:
        result = gateway.triage(masked)
    except Exception:
        result = DeterministicLanguageModelGateway().triage(masked)
    result.setdefault("notice", "This is not a diagnosis. A clinician must assess the patient.")
    interaction = AIInteraction(
        feature=AIFeature.TRIAGE,
        actor_user_id=actor.id if actor else None,
        patient_id=patient_id,
        input_summary=masked[:1000],
        output=result,
        provider="claude" if gateway.__class__.__name__.startswith("Claude") else "deterministic",
        status=AIStatus.COMPLETED,
    )
    db.session.add(interaction)
    record_audit("ai.triage", "ai_interaction", interaction.id, actor=actor)
    db.session.commit()
    return result, interaction


def create_summary_draft(visit, notes, actor):
    from app.scheduling.models import DoctorProfile

    doctor = DoctorProfile.query.filter_by(user_id=actor.id).first()
    if doctor is None or visit.doctor_id != doctor.id:
        raise forbidden()
    source_notes = notes or visit.notes or ""
    if not source_notes.strip():
        raise bad_request("Visit has no notes to summarize")
    masked = mask_text(source_notes)
    gateway = get_language_model()
    try:
        result = gateway.visit_summary(masked)
    except Exception:
        result = DeterministicLanguageModelGateway().visit_summary(masked)
    result["requires_doctor_approval"] = True
    interaction = AIInteraction(
        feature=AIFeature.VISIT_SUMMARY,
        actor_user_id=actor.id,
        patient_id=visit.patient_id,
        related_entity_type="visit",
        related_entity_id=visit.id,
        input_summary=masked[:1000],
        output=result,
        provider="claude" if gateway.__class__.__name__.startswith("Claude") else "deterministic",
        status=AIStatus.DRAFT,
    )
    db.session.add(interaction)
    record_audit(
        "ai.visit_summary_draft",
        "ai_interaction",
        interaction.id,
        actor=actor,
        after={"visit_id": str(visit.id)},
    )
    db.session.commit()
    return interaction


def approve_summary(visit, ai_interaction_id, summary, actor):
    from app.scheduling.models import DoctorProfile

    doctor = DoctorProfile.query.filter_by(user_id=actor.id).first()
    if doctor is None or visit.doctor_id != doctor.id:
        raise forbidden()
    interaction = AIInteraction.query.get(ai_interaction_id)
    if interaction is None:
        raise not_found("AI interaction not found")
    if interaction.related_entity_id != visit.id or interaction.feature != AIFeature.VISIT_SUMMARY:
        raise bad_request("AI interaction does not belong to this visit")
    visit.ai_summary = summary
    visit.ai_summary_approved = True
    visit.ai_summary_approved_by_id = actor.id
    visit.ai_summary_approved_at = utcnow()
    interaction.approved = True
    interaction.approved_by_id = actor.id
    interaction.approved_at = utcnow()
    interaction.status = AIStatus.APPROVED
    interaction.output = {**interaction.output, "approved_summary": summary}
    record_audit(
        "ai.visit_summary_approved",
        "visit",
        visit.id,
        actor=actor,
        after={"ai_interaction_id": str(interaction.id)},
    )
    db.session.commit()
    return visit


def report_query(query, actor):
    gateway = get_language_model()
    try:
        intent = gateway.report_intent(mask_text(query))
    except Exception:
        intent = DeterministicLanguageModelGateway().report_intent(mask_text(query))
    report_key = intent.get("report_key")
    if report_key not in ALLOWED_REPORTS:
        raise bad_request(
            "Request does not map to an allowed report",
            {"query": ["Unsupported report intent"]},
        )
    parameters = intent.get("parameters") or {}
    result = run_report(report_key, parameters)
    interaction = AIInteraction(
        feature=AIFeature.REPORT_QUERY,
        actor_user_id=actor.id,
        input_summary=mask_text(query)[:1000],
        output={"report_key": report_key, "parameters": parameters},
        provider="claude" if gateway.__class__.__name__.startswith("Claude") else "deterministic",
        status=AIStatus.COMPLETED,
    )
    db.session.add(interaction)
    record_audit("ai.report_query", "ai_interaction", interaction.id, actor=actor)
    db.session.commit()
    return {"report_key": report_key, "parameters": parameters, "result": result}


def no_show_score(patient_id):
    from app.scheduling.models import Appointment

    appointments = Appointment.query.filter_by(patient_id=patient_id).all()
    total = len(appointments)
    no_shows = sum(1 for item in appointments if item.status.value == "NO_SHOW")
    if total == 0:
        return {"score": None, "reason": "No appointment history"}
    score = round(no_shows / total, 4)
    return {
        "score": score,
        "reason": f"{no_shows} no-shows across {total} appointments",
    }
