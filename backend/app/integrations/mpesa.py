import base64
import hmac
import uuid
from datetime import datetime
from decimal import Decimal

import requests
from flask import current_app

from app.integrations.base import ProviderRejected, ProviderUnavailable

MINOR_UNITS_PER_SHILLING = 100


def minor_to_shillings(amount_minor) -> int:
    """Daraja amounts are whole Kenya shillings; MediFlow stores minor units."""
    amount_minor = int(amount_minor)
    if amount_minor % MINOR_UNITS_PER_SHILLING:
        raise ValueError("M-Pesa amounts must be whole shillings")
    return amount_minor // MINOR_UNITS_PER_SHILLING


def shillings_to_minor(value) -> int:
    """Convert a Daraja callback ``Amount`` (KES, possibly "5000.00") to minor units."""
    return int((Decimal(str(value)) * MINOR_UNITS_PER_SHILLING).to_integral_value())


def normalize_phone(phone: str) -> str:
    value = "".join(char for char in str(phone) if char.isdigit())
    if value.startswith("0"):
        value = "254" + value[1:]
    if value.startswith("7") or value.startswith("1"):
        value = "254" + value
    return value


def _callback_token_matches(args) -> bool:
    secret = current_app.config.get("MPESA_CALLBACK_SECRET") or ""
    token = (args or {}).get("token") or ""
    return bool(secret) and hmac.compare_digest(str(token), secret)


def callback_url_with_token(url: str) -> str:
    """Daraja does not sign callbacks, so the shared secret travels in the URL we
    register (?token=...) and is checked on receipt."""
    from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

    secret = current_app.config.get("MPESA_CALLBACK_SECRET") or ""
    if not url or not secret:
        return url
    parts = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parts.query) if k != "token"] + [("token", secret)]
    return urlunsplit(parts._replace(query=urlencode(query)))


class MpesaGateway:
    def stk_push(self, phone, amount_minor, account_reference, description, callback_url=None):
        raise NotImplementedError

    def verify_callback(self, headers, payload, args=None):
        raise NotImplementedError


class SimulatedMpesaGateway(MpesaGateway):
    def stk_push(self, phone, amount_minor, account_reference, description, callback_url=None):
        checkout_id = f"ws_CO_SIM_{uuid.uuid4().hex[:18].upper()}"
        return {
            "checkout_request_id": checkout_id,
            "merchant_request_id": f"MR_SIM_{uuid.uuid4().hex[:12].upper()}",
            "customer_message": "Simulated STK push accepted",
            "response_code": "0",
        }

    def verify_callback(self, headers, payload, args=None):
        # Simulated (development) mode accepts unsigned callbacks only while no
        # secret is configured; once one is set the token is required.
        if not current_app.config.get("MPESA_CALLBACK_SECRET"):
            return True
        return _callback_token_matches(args)


class DarajaMpesaGateway(MpesaGateway):
    def _token(self):
        key = current_app.config["MPESA_CONSUMER_KEY"]
        secret = current_app.config["MPESA_CONSUMER_SECRET"]
        if not key or not secret:
            raise ProviderUnavailable("M-Pesa credentials are not configured")
        response = requests.get(
            f"{current_app.config['MPESA_BASE_URL']}/oauth/v1/generate",
            params={"grant_type": "client_credentials"},
            auth=(key, secret),
            timeout=(5, 15),
        )
        if response.status_code >= 400:
            raise ProviderUnavailable("Could not obtain M-Pesa access token")
        return response.json()["access_token"]

    def stk_push(self, phone, amount_minor, account_reference, description, callback_url=None):
        shortcode = current_app.config["MPESA_SHORTCODE"]
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        password = base64.b64encode(
            f"{shortcode}{current_app.config['MPESA_PASSKEY']}{timestamp}".encode()
        ).decode()
        payload = {
            "BusinessShortCode": shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline",
            "Amount": minor_to_shillings(amount_minor),
            "PartyA": normalize_phone(phone),
            "PartyB": shortcode,
            "PhoneNumber": normalize_phone(phone),
            "CallBackURL": callback_url_with_token(
                callback_url or current_app.config["MPESA_CALLBACK_URL"]
            ),
            "AccountReference": account_reference,
            "TransactionDesc": description[:100],
        }
        response = requests.post(
            f"{current_app.config['MPESA_BASE_URL']}/mpesa/stkpush/v1/processrequest",
            json=payload,
            headers={"Authorization": f"Bearer {self._token()}"},
            timeout=(5, 20),
        )
        if response.status_code >= 400:
            raise ProviderRejected("M-Pesa rejected the STK push request")
        body = response.json()
        if body.get("ResponseCode") not in {"0", 0}:
            raise ProviderRejected(body.get("ResponseDescription", "STK push failed"))
        return {
            "checkout_request_id": body["CheckoutRequestID"],
            "merchant_request_id": body["MerchantRequestID"],
            "customer_message": body.get("CustomerMessage"),
            "response_code": str(body.get("ResponseCode")),
        }

    def verify_callback(self, headers, payload, args=None):
        # Live mode fails closed: without a configured secret no callback is trusted.
        return _callback_token_matches(args)


def get_mpesa_gateway() -> MpesaGateway:
    if current_app.config.get("MPESA_MODE") == "daraja":
        return DarajaMpesaGateway()
    return SimulatedMpesaGateway()
