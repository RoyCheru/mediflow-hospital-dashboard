import uuid

import requests
from flask import current_app

from app.common.enums import ClaimStatus, EligibilityStatus
from app.integrations.base import ProviderRejected, ProviderUnavailable


class ShaGateway:
    def verify_member(self, member_reference, patient_context=None):
        raise NotImplementedError

    def submit_claim(self, claim_payload):
        raise NotImplementedError

    def normalize_status(self, provider_status):
        raise NotImplementedError


class SimulatedShaGateway(ShaGateway):
    def verify_member(self, member_reference, patient_context=None):
        member = (member_reference or "").upper()
        if member.endswith("INACTIVE"):
            status = EligibilityStatus.INACTIVE
            limit = 0
        elif member.endswith("EXHAUSTED"):
            status = EligibilityStatus.LIMIT_EXHAUSTED
            limit = 0
        else:
            status = EligibilityStatus.ACTIVE
            limit = 50000000  # KES 500,000 in minor units
        return {
            "status": status,
            "coverage_limit_minor": limit,
            "consumed_minor": 0,
            "provider_reference": f"SHA-SIM-{uuid.uuid4().hex[:12].upper()}",
            "raw": {
                "member_reference": member,
                "simulated": True,
            },
        }

    def submit_claim(self, claim_payload):
        return {
            "external_reference": f"SHA-CLAIM-{uuid.uuid4().hex[:12].upper()}",
            "status": ClaimStatus.SUBMITTED,
        }

    def normalize_status(self, provider_status):
        mapping = {
            "submitted": ClaimStatus.SUBMITTED,
            "under_review": ClaimStatus.UNDER_REVIEW,
            "under review": ClaimStatus.UNDER_REVIEW,
            "approved": ClaimStatus.APPROVED,
            "rejected": ClaimStatus.REJECTED,
            "paid": ClaimStatus.PAID,
        }
        return mapping.get(str(provider_status).lower(), ClaimStatus.UNDER_REVIEW)


class HttpShaGateway(ShaGateway):
    def _headers(self):
        key = current_app.config.get("SHA_API_KEY")
        if not key:
            raise ProviderUnavailable("SHA integration is not configured")
        return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    def verify_member(self, member_reference, patient_context=None):
        base = current_app.config.get("SHA_BASE_URL")
        if not base:
            raise ProviderUnavailable("SHA integration is not configured")
        response = requests.post(
            f"{base.rstrip('/')}/members/verify",
            json={
                "member_reference": member_reference,
                "patient_context": patient_context or {},
            },
            headers=self._headers(),
            timeout=(5, 20),
        )
        if response.status_code >= 400:
            raise ProviderRejected("SHA verification failed")
        body = response.json()
        return {
            "status": EligibilityStatus(body.get("status", "UNKNOWN")),
            "coverage_limit_minor": body.get("coverage_limit_minor"),
            "consumed_minor": body.get("consumed_minor"),
            "provider_reference": body.get("reference"),
            "raw": body,
        }

    def submit_claim(self, claim_payload):
        base = current_app.config.get("SHA_BASE_URL")
        if not base:
            raise ProviderUnavailable("SHA integration is not configured")
        response = requests.post(
            f"{base.rstrip('/')}/claims",
            json=claim_payload,
            headers=self._headers(),
            timeout=(5, 30),
        )
        if response.status_code >= 400:
            raise ProviderRejected("SHA claim submission failed")
        body = response.json()
        return {
            "external_reference": body.get("reference"),
            "status": self.normalize_status(body.get("status")),
        }

    def normalize_status(self, provider_status):
        return SimulatedShaGateway().normalize_status(provider_status)


def get_sha_gateway() -> ShaGateway:
    if current_app.config.get("SHA_MODE") == "http":
        return HttpShaGateway()
    return SimulatedShaGateway()
