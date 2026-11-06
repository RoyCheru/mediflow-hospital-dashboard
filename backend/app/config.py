import os
from datetime import timedelta


def _database_url() -> str:
    url = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://mediflow:mediflow@localhost:5432/mediflow",
    )
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg://", 1)
    return url


class Config:
    ENV = os.getenv("FLASK_ENV", "development")
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-me")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", SECRET_KEY)
    JWT_ALGORITHM = "HS256"
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")

    SQLALCHEMY_DATABASE_URI = _database_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    JWT_ACCESS_TTL = timedelta(minutes=int(os.getenv("JWT_ACCESS_TTL_MINUTES", "15")))
    REFRESH_TOKEN_TTL_DAYS = int(os.getenv("REFRESH_TOKEN_TTL_DAYS", "14"))
    STAFF_INACTIVITY_MINUTES = int(os.getenv("STAFF_INACTIVITY_MINUTES", "15"))
    PASSWORD_RESET_TTL_MINUTES = int(os.getenv("PASSWORD_RESET_TTL_MINUTES", "30"))
    LOGIN_MAX_ATTEMPTS = int(os.getenv("LOGIN_MAX_ATTEMPTS", "5"))
    LOGIN_LOCKOUT_MINUTES = int(os.getenv("LOGIN_LOCKOUT_MINUTES", "15"))

    ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "")
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024
    ALLOWED_UPLOAD_TYPES = {"application/pdf", "image/jpeg", "image/png"}

    STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local")
    STORAGE_LOCAL_DIR = os.getenv(
        "STORAGE_LOCAL_DIR",
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "instance", "storage"),
    )
    STORAGE_BUCKET = os.getenv("STORAGE_BUCKET", "mediflow-documents")
    STORAGE_SIGNED_URL_TTL_SECONDS = int(os.getenv("STORAGE_SIGNED_URL_TTL_SECONDS", "300"))

    MPESA_MODE = os.getenv("MPESA_MODE", "simulated")
    MPESA_BASE_URL = os.getenv("MPESA_BASE_URL", "https://sandbox.safaricom.co.ke")
    MPESA_CONSUMER_KEY = os.getenv("MPESA_CONSUMER_KEY", "")
    MPESA_CONSUMER_SECRET = os.getenv("MPESA_CONSUMER_SECRET", "")
    MPESA_SHORTCODE = os.getenv("MPESA_SHORTCODE", "174379")
    MPESA_PASSKEY = os.getenv("MPESA_PASSKEY", "")
    MPESA_CALLBACK_URL = os.getenv("MPESA_CALLBACK_URL", "")
    MPESA_CALLBACK_SECRET = os.getenv("MPESA_CALLBACK_SECRET", "")

    SHA_MODE = os.getenv("SHA_MODE", "simulated")
    SHA_BASE_URL = os.getenv("SHA_BASE_URL", "")
    SHA_API_KEY = os.getenv("SHA_API_KEY", "")

    MESSAGING_MODE = os.getenv("MESSAGING_MODE", "console")
    TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "")
    EMAIL_PROVIDER = os.getenv("EMAIL_PROVIDER", "console")
    RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
    EMAIL_FROM = os.getenv("EMAIL_FROM", "no-reply@mediflow.local")

    LLM_MODE = os.getenv("LLM_MODE", "deterministic")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")

    CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
    CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")

    APPOINTMENT_CANCELLATION_CUTOFF_HOURS = int(
        os.getenv("APPOINTMENT_CANCELLATION_CUTOFF_HOURS", "2")
    )
    CLAIM_AGING_DAYS = [int(part) for part in os.getenv("CLAIM_AGING_DAYS", "14,30,60").split(",")]
    DEFAULT_PAGE_SIZE = int(os.getenv("DEFAULT_PAGE_SIZE", "20"))
    MAX_PAGE_SIZE = int(os.getenv("MAX_PAGE_SIZE", "100"))
    TESTING = False


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite+pysqlite:///:memory:"
    SQLALCHEMY_ENGINE_OPTIONS = {}
    JWT_SECRET_KEY = "test-jwt-secret-with-at-least-32-bytes"
    SECRET_KEY = "test-secret"
    ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
    MPESA_MODE = "simulated"
    SHA_MODE = "simulated"
    MESSAGING_MODE = "console"
    LLM_MODE = "deterministic"
    STORAGE_BACKEND = "local"
    STORAGE_LOCAL_DIR = "/tmp/mediflow-test-storage"
    STAFF_INACTIVITY_MINUTES = 15
