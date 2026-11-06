import uuid

import requests
from flask import current_app

from app.integrations.base import ProviderRejected


class MessagingGateway:
    def send_whatsapp(self, to, template_name, parameters=None):
        raise NotImplementedError

    def send_email(self, to, subject, body):
        raise NotImplementedError


class ConsoleMessagingGateway(MessagingGateway):
    def send_whatsapp(self, to, template_name, parameters=None):
        current_app.logger.info(
            "Simulated WhatsApp to=%s template=%s params=%s",
            _mask(to),
            template_name,
            parameters or {},
        )
        return {"provider_reference": f"wa-sim-{uuid.uuid4().hex[:12]}", "status": "SENT"}

    def send_email(self, to, subject, body):
        current_app.logger.info("Simulated email to=%s subject=%s", _mask(to), subject)
        return {"provider_reference": f"email-sim-{uuid.uuid4().hex[:12]}", "status": "SENT"}


class TwilioWhatsAppGateway(MessagingGateway):
    def send_whatsapp(self, to, template_name, parameters=None):
        sid = current_app.config.get("TWILIO_ACCOUNT_SID")
        token = current_app.config.get("TWILIO_AUTH_TOKEN")
        sender = current_app.config.get("TWILIO_WHATSAPP_FROM")
        if not all([sid, token, sender]):
            raise ProviderRejected("Twilio WhatsApp is not configured")
        response = requests.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
            auth=(sid, token),
            data={
                "From": sender,
                "To": f"whatsapp:{to}",
                "Body": template_name,
            },
            timeout=(5, 20),
        )
        if response.status_code >= 400:
            raise ProviderRejected("WhatsApp delivery request failed")
        return {
            "provider_reference": response.json().get("sid"),
            "status": "SENT",
        }


class ResendEmailGateway(MessagingGateway):
    def send_whatsapp(self, to, template_name, parameters=None):
        raise ProviderRejected("WhatsApp is not configured for this gateway")

    def send_email(self, to, subject, body):
        key = current_app.config.get("RESEND_API_KEY")
        if not key:
            raise ProviderRejected("Email provider is not configured")
        response = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {key}"},
            json={
                "from": current_app.config.get("EMAIL_FROM"),
                "to": [to],
                "subject": subject,
                "html": body,
            },
            timeout=(5, 20),
        )
        if response.status_code >= 400:
            raise ProviderRejected("Email delivery request failed")
        return {
            "provider_reference": response.json().get("id"),
            "status": "SENT",
        }


def get_messaging_gateway() -> MessagingGateway:
    mode = current_app.config.get("MESSAGING_MODE")
    if mode == "twilio":
        return TwilioWhatsAppGateway()
    if mode == "resend":
        return ResendEmailGateway()
    return ConsoleMessagingGateway()


def _mask(value):
    if not value:
        return value
    value = str(value)
    if len(value) <= 4:
        return "****"
    return value[:2] + "*" * (len(value) - 4) + value[-2:]
