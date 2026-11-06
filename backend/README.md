# MediFlow Backend

Flask backend for the MediFlow hospital / telehealth platform. It implements the
workflows in `inputs/PRD.md`: authentication and RBAC, patient registration and
consent, scheduling and queue management, clinical records, billing and M-Pesa,
SHA claims, notifications, reports/exports, audit logging, AI assistance, and
provider integration ports.

All routes are mounted under `/api/v1`.

## Stack

- Python 3.11+ (verified on 3.14), Flask 3
- SQLAlchemy 2 and Flask-SQLAlchemy
- PostgreSQL in production (`psycopg`), SQLite for local smoke tests
- Alembic via Flask-Migrate
- JWT access tokens, rotating refresh-token families
- Argon2id password hashing
- Marshmallow request validation
- Celery + Redis for asynchronous notifications, outbox dispatch, claims aging,
  and report exports (optional in development)
- Fernet for field-level encryption of national IDs and SHA member numbers

## Layout

```text
backend/
  app/
    __init__.py                 Application factory, blueprint wiring, headers
    config.py                   Base/testing config from environment
    models.py                   Aggregates all models for metadata/migrations
    cli.py                      seed, create-admin, outbox, notifications, exports
    api/v1.py                   Blueprint registration and /health
    auth/                       users, refresh families, verification tokens
    patients/                   patient profiles, consent records
    scheduling/                 departments, services, prices, doctors, availability, appointments
    clinical_records/           visits, prescriptions, attachments, referrals
    billing/                    invoices, lines, allocations, intents, transactions, voids, refunds, cash reconciliation
    claims/                     eligibility checks, claims, status history
    notifications/              templates, notifications, delivery attempts
    analytics/                  report exports
    audit/                      append-only audit log
    ai_assistance/              AI interactions
    common/                     base models, enums, errors, responses, crypto, security,
                                decorators, permissions, audit, outbox, idempotency,
                                pagination, sequences
    integrations/               M-Pesa, SHA, messaging, object storage, LLM, PDF adapters
    tasks/                      Celery app and async jobs
  migrations/                   Alembic environment and initial revision
  tests/                        Pytest suite (38 tests)
  requirements.txt
  requirements-dev.txt
  .env.example
  wsgi.py
```

## Data Model (37 tables)

### Identity and access

| Table | Purpose |
| --- | --- |
| `users` | Staff and patient accounts, roles, status, lockout, login/activity timestamps |
| `refresh_token_families` | Rotating refresh-token family and reuse detection |
| `verification_tokens` | Email/phone verification and password-reset tokens |

### Patients and consent

| Table | Purpose |
| --- | --- |
| `patient_profiles` | Demographics, encrypted national ID, SHA member number, next of kin, flags |
| `consent_records` | Per-channel consent with grant/revoke history |

### Scheduling and catalog

| Table | Purpose |
| --- | --- |
| `departments` | Clinical departments |
| `services` | Billable services and procedure metadata |
| `service_prices` | Effective-dated prices per service |
| `doctor_profiles` | Doctor specialization, license, consultation fee, department |
| `availability_rules` | Recurring weekly availability |
| `availability_exceptions` | One-off blocks or extra sessions |
| `appointments` | Bookings, walk-ins, check-in, no-show, reschedule/cancel state |

### Clinical records

| Table | Purpose |
| --- | --- |
| `visits` | Encounter, vitals, notes, diagnosis, AI summary and approval state |
| `prescriptions` | Prescription header and issuing doctor |
| `prescription_items` | Medication lines and dosage instructions |
| `attachments` | Uploaded clinical files and storage metadata |
| `referral_letters` | Generated referral documents |

### Billing and payments

| Table | Purpose |
| --- | --- |
| `invoices` | Invoice header, totals, status, visit/patient links |
| `invoice_lines` | Service and consultation line items |
| `invoice_allocations` | Payment-to-invoice allocation |
| `payment_intents` | M-Pesa/payment intent lifecycle |
| `transactions` | Cash, card, and mobile-money payments, provider references |
| `void_requests` | Dual-control invoice void requests |
| `refunds` | Refund requests and approval decisions |
| `cash_reconciliations` | Shift opening/closing cash and variance |

### Insurance claims

| Table | Purpose |
| --- | --- |
| `eligibility_checks` | SHA eligibility requests and responses |
| `claims` | SHA claim lifecycle, amounts, provider references |
| `claim_status_history` | Append-only claim state transitions |

### Notifications

| Table | Purpose |
| --- | --- |
| `notification_templates` | Per-channel, per-event templates |
| `notifications` | Queued/sent/failed notification records |
| `notification_attempts` | Delivery attempts and provider responses |

### Auditing, AI, reporting, infrastructure

| Table | Purpose |
| --- | --- |
| `audit_logs` | Append-only actor/action/entity log |
| `ai_interactions` | Triage, summary, and report-query interactions |
| `report_exports` | Async report export jobs |
| `number_sequences` | Human-readable patient/invoice/claim/receipt numbers |
| `idempotency_keys` | Webhook and payment-intent idempotency |
| `outbox_events` | Transactional outbox for async side effects |

## API Surface

### Auth and admin

- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- `GET /auth/me`, `POST /auth/verify`
- `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm`
- `GET|POST /admin/users`, `PATCH /admin/users/<id>`
- `POST /admin/departments`, `PATCH /admin/departments/<id>`
- `POST /admin/services`, `PATCH /admin/services/<id>`,
  `POST /admin/services/<id>/prices`
- `PATCH /admin/doctors/<id>`
- `GET /admin/notification-templates`,
  `PATCH /admin/notification-templates/<id>`,
  `POST /admin/notifications/<id>/retry`
- `GET /admin/audit-events`, `POST /admin/audit-exports`
- `POST /admin/report-queries` (natural-language report access)

### Patients and consent

- `POST /patients/self-registration`
- `GET|POST /patients`, `GET|PATCH /patients/<id>`
- `GET /patients/duplicates`
- `POST /patients/<id>/consents`
- `GET /patients/me`, `GET /patients/me/invoices`, `GET /patients/me/timeline`
- `GET /patients/<id>/invoices`, `GET /patients/<id>/timeline`

### Scheduling

- `GET /departments`, `GET /services`, `GET /doctors`, `GET /doctors/<id>`
- `GET /availability`
- `GET /doctors/me/availability`, `POST /doctors/me/availability`,
  `DELETE /doctors/me/availability/<id>`, `POST /doctors/me/exceptions`
- `GET|POST /appointments`, `GET|PATCH /appointments/<id>`
- `POST /appointments/walk-in`
- `POST /appointments/<id>/check-in`, `cancel`, `no-show`, `reschedule`
- `POST /appointments/<id>/visits`
- `GET /queue`

### Clinical records

- `GET|PATCH /visits/<id>`
- `POST /visits/<id>/complete`
- `GET|POST /visits/<id>/prescriptions`
- `POST /visits/<id>/attachments`
- `POST /visits/<id>/follow-up`
- `POST /visits/<id>/referral-letter`
- `POST /visits/<id>/summary-drafts`, `POST /visits/<id>/summary-approval`
- `GET /attachments/<id>/content`, `GET /attachments/<id>/download-url`

### Billing, payments, refunds

- `GET|POST /visits/<id>/invoices`, `GET /invoices`, `GET /invoices/<id>`
- `POST /invoices/<id>/allocations`
- `POST /invoices/<id>/transactions`
- `POST /invoices/<id>/payment-intents`
- `POST /webhooks/mpesa/daraja`
- `GET /transactions/<id>/receipt`
- `POST /transactions/<id>/refund-requests`
- `POST /refunds/<id>/decision`
- `POST /invoices/<id>/void-requests`
- `POST /void-requests/<id>/decision`
- `GET /billing/cash-summary`, `GET /billing/reconciliation`
- `POST /billing/cash-reconciliations`,
  `POST /billing/transactions/<id>/resolve`
- `GET /invoices/<id>/pdf`

### SHA claims

- `POST /invoices/<id>/claims/eligibility-check`
- `GET|POST /invoices/<id>/claims`
- `GET /claims`, `GET /claims/<id>`, `GET /claims/aging`
- `POST /claims/<id>/status`, `POST /claims/<id>/resubmissions`
- `POST /webhooks/sha/claim-status`

### Notifications, reports, AI

- `GET /notifications`, `GET /notifications/delivery-status`
- `GET /reports/revenue`, `GET /reports/my-stats`, `GET /reports/claims`,
  `GET /reports/no-shows`, `GET /reports/doctor-workload`,
  `GET /reports/daily-cash`
- `POST /reports/exports`, `GET /reports/exports/<id>`,
  `GET /reports/exports/<id>/download`
- `POST /ai/triage`
- `GET /patients/<id>/no-show-risk`
- `GET /health`

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
```

Set `DATABASE_URL` to a PostgreSQL URL, then create the schema and seed demo
data:

```bash
export FLASK_APP=wsgi
flask db upgrade
flask seed
```

Demo accounts after seeding:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@mediflow.test` | `Admin12345!` |
| Doctor | `doctor@mediflow.test` | `Doctor12345!` |
| Receptionist | `reception@mediflow.test` | `Reception12345!` |
| Cashier | `cashier@mediflow.test` | `Cashier12345!` |
| Patient | `patient@mediflow.test` | `Patient12345!` |

Run locally:

```bash
flask run
# or
gunicorn -w 4 -b 0.0.0.0:8000 wsgi:app
```

## Configuration

Key variables in `.env.example`:

- `SECRET_KEY`, `JWT_SECRET_KEY`
- `DATABASE_URL`
- `CORS_ORIGINS`
- `JWT_ACCESS_TTL_MINUTES`, `REFRESH_TOKEN_TTL_DAYS`
- `ENCRYPTION_KEY` (Fernet key for national IDs and SHA numbers)
- `MPESA_*`, `SHA_*`, `MESSAGING_*`, `LLM_*`
- `STORAGE_BACKEND`, `STORAGE_LOCAL_DIR`, `STORAGE_BUCKET`
- `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`

Integrations default to simulated adapters, so the API works without external
credentials. Real adapters are selected with `MPESA_MODE=live`,
`SHA_MODE=live`, `MESSAGING_MODE=live`, and `LLM_MODE=live`.

## Business Rules Implemented

- Invoice totals are service prices plus the doctor consultation fee.
- M-Pesa callbacks are idempotent by provider reference; duplicate callbacks do
  not double-post payments.
- Invoice voids and refunds require two different users (requester and
  approver).
- Audit rows are append-only at the ORM level; updates and deletes raise.
- Notifications are consent-gated for patients; revoking consent blocks sends.
- Invoices and receipts use gap-free, per-scope human-readable sequences.
- AI-generated visit summaries stay drafts until the treating doctor approves.
- Natural-language report queries only produce approved aggregate reports from
  the allowlist in `app/analytics/service.py`; raw SQL is rejected.
- Patient self-registration issues verification tokens; staff-created patients
  are active immediately.
- Cash reconciliation records expected, counted, and variance amounts.
- Claim status transitions are recorded in history and can be driven by SHA
  callbacks.

## RBAC

Roles: `ADMIN`, `DOCTOR`, `RECEPTIONIST`, `CASHIER`, `PATIENT`.

- Admin: administration, audit, users, catalogs, reports, approvals.
- Doctor: own patients/visits, prescriptions, summaries, availability, own stats.
- Receptionist: registration, appointments, check-in, queue.
- Cashier: invoices, payments, reconciliation, refund/void requests.
- Patient: own profile, own appointments, own invoices/timeline, consent.

## Background Jobs

With Redis and Celery installed:

```bash
celery -A app.tasks.celery_app.celery worker -l info
celery -A app.tasks.celery_app.celery beat -l info
```

Jobs cover notification dispatch, outbox event processing, SHA claim aging,
and report exports. Synchronous CLI fallbacks are available:

```bash
flask dispatch-notifications
flask process-outbox
flask build-export <export_id>
```

## Tests and Quality

```bash
.venv/bin/pytest
.venv/bin/ruff check app migrations tests
.venv/bin/ruff format --check app migrations tests
```

The suite uses an in-memory SQLite database and seeded fixtures. It covers auth
and RBAC, patient registration/consent/duplicates, scheduling conflicts and
queue flow, billing/M-Pesa idempotency/voids, SHA claims, audit immutability,
notification templates, analytics reports, and AI allowlisting/approval.

## Operational Notes

- The initial Alembic revision bootstraps the schema from SQLAlchemy metadata;
  generate future revisions with `flask db migrate` after model changes.
- Use a 32+ byte `JWT_SECRET_KEY` in every non-test environment.
- Store `ENCRYPTION_KEY` in a secret manager and rotate with a planned
  re-encryption job.
- Provider timeouts/retries are handled by the adapter layer and Celery jobs;
  production adapters should add circuit breakers and metrics.
- PDF and document generation are intentionally minimal and dependency-free.
