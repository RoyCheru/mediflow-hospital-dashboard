import json

import requests
from flask import current_app

from app.integrations.base import ProviderUnavailable

RED_FLAGS = [
    "chest pain",
    "difficulty breathing",
    "severe bleeding",
    "unconscious",
    "stroke",
    "suicidal",
    "seizure",
]

DEPARTMENT_KEYWORDS = {
    "Cardiology": ["chest", "heart", "palpitation", "blood pressure"],
    "Pediatrics": ["child", "baby", "infant", "fever in child"],
    "Obstetrics and Gynaecology": ["pregnant", "pregnancy", "period", "antenatal"],
    "Orthopaedics": ["fracture", "bone", "joint", "back pain", "knee"],
    "Dermatology": ["rash", "skin", "itch"],
    "Ophthalmology": ["eye", "vision"],
    "Dentistry": ["tooth", "dental", "gum"],
    "General Medicine": [],
}


class LanguageModelGateway:
    def triage(self, symptoms, context=None):
        raise NotImplementedError

    def visit_summary(self, notes, context=None):
        raise NotImplementedError

    def report_intent(self, query):
        raise NotImplementedError


class DeterministicLanguageModelGateway(LanguageModelGateway):
    def triage(self, symptoms, context=None):
        text = (symptoms or "").lower()
        red_flags = [flag for flag in RED_FLAGS if flag in text]
        department = "General Medicine"
        for name, keywords in DEPARTMENT_KEYWORDS.items():
            if any(keyword in text for keyword in keywords):
                department = name
                break
        urgency = "EMERGENCY" if red_flags else "ROUTINE"
        return {
            "suggested_department": department,
            "urgency": urgency,
            "red_flags": red_flags,
            "notice": "This is not a diagnosis. A clinician must assess the patient.",
            "emergency_message": ("Seek emergency care immediately." if red_flags else None),
        }

    def visit_summary(self, notes, context=None):
        text = (notes or "").strip()
        if not text:
            return {"summary": "No clinical notes were supplied."}
        sentences = [part.strip() for part in text.replace("\n", ". ").split(".")]
        summary = ". ".join(part for part in sentences if part)[:1200]
        return {"summary": summary, "requires_doctor_approval": True}

    def report_intent(self, query):
        text = (query or "").lower()
        if "claim" in text and ("30" in text or "age" in text):
            return {"report_key": "claims_aging", "parameters": {"min_age_days": 30}}
        if "revenue" in text:
            return {"report_key": "revenue", "parameters": {"group_by": "month"}}
        if "no-show" in text or "no show" in text:
            return {"report_key": "no_shows", "parameters": {}}
        return {"report_key": None, "parameters": {}}


class ClaudeLanguageModelGateway(LanguageModelGateway):
    def _call(self, system, payload):
        key = current_app.config.get("ANTHROPIC_API_KEY")
        if not key:
            raise ProviderUnavailable("Claude API key is not configured")
        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": current_app.config.get("ANTHROPIC_MODEL"),
                "max_tokens": 700,
                "system": system,
                "messages": [{"role": "user", "content": json.dumps(payload)}],
            },
            timeout=(5, 30),
        )
        if response.status_code >= 400:
            raise ProviderUnavailable("Language model request failed")
        text = "".join(block.get("text", "") for block in response.json().get("content", []))
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"summary": text}

    def triage(self, symptoms, context=None):
        return self._call(
            "You are a triage assistant. Never diagnose. Return JSON with "
            "suggested_department, urgency (ROUTINE, URGENT, EMERGENCY), red_flags, "
            "notice, emergency_message.",
            {"symptoms": symptoms, "context": context or {}},
        )

    def visit_summary(self, notes, context=None):
        return self._call(
            "Summarize the clinician notes for review. Never add a diagnosis. "
            "Return JSON with summary and requires_doctor_approval=true.",
            {"notes": notes, "context": context or {}},
        )

    def report_intent(self, query):
        return self._call(
            "Map the user request to one of these read-only report keys: revenue, "
            "claims_aging, doctor_workload, no_shows, daily_cash. Return JSON with "
            "report_key and parameters. Never write SQL.",
            {"query": query},
        )


def get_language_model() -> LanguageModelGateway:
    if current_app.config.get("LLM_MODE") == "claude":
        return ClaudeLanguageModelGateway()
    return DeterministicLanguageModelGateway()
