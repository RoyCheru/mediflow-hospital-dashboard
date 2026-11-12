# MediFlow Admin API Contract

Base URL: `VITE_API_URL` (default `http://localhost:5000/api/v1`).
All requests and responses are JSON unless explicitly noted.

## Conventions

- Success: `{"data": ...}`.
- Error: `{"error": {"code": "...", "message": "...", "details": {...}}}`.
- HTTP status: `200` read, `201` created, `204` no content, `400` bad request, `401` missing/invalid token, `403` wrong role, `404` not found, `409` state conflict, `422` validation error.
- Auth: `Authorization: Bearer <access_token>`.
- Lists: `?page=1&page_size=20` (`per_page` is accepted as an alias) plus resource filters and `sort=-created_at`. Responses use:
  ```json
  {"data": {"items": [], "meta": {"page": 1, "per_page": 20, "page_size": 20, "total": 0, "pages": 0}}}
  ```
- Timestamps: ISO 8601 UTC with offset.
- Money: integer minor units (`*_minor`). KES is implied unless `currency` is present.
- Enums are uppercase and shared verbatim with TypeScript unions: `ADMIN`, `DOCTOR`, `RECEPTIONIST`, `CASHIER`, `PATIENT`; `ACTIVE`, `INACTIVE`, `SUSPENDED`, `PENDING_VERIFICATION`; `DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `VOIDED`, `REFUNDED`; `SHA`, `MPESA`, `CASH`, `CARD`, `BANK`, `SELF_PAY`; `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `PAID`, `CANCELLED`; `PENDING`, `APPROVED`, `REJECTED`, `COMPLETED`; `SCHEDULED`, `CHECKED_IN`, `IN_CONSULTATION`, `COMPLETED`, `NO_SHOW`, `CANCELLED`; `ONLINE`, `RECEPTION`, `WALK_IN`; `ROUTINE`, `URGENT`, `EMERGENCY`.

## Authentication

### POST `/auth/login`

Request:
```json
{"email": "admin@mediflow.test", "password": "Admin12345!"}
```
Response `200`:
```json
{"data": {"access_token": "...", "refresh_token": "...", "token_type": "Bearer", "expires_in": 900, "user": {"id": "...", "email": "...", "first_name": "...", "last_name": "...", "full_name": "...", "role": "ADMIN", "status": "ACTIVE", "patient_id": null, "doctor_id": null}}}
```

### POST `/auth/refresh`

Request `{"refresh_token": "..."}`. Returns the same token envelope.

### POST `/auth/logout`

Request `{"refresh_token": "..."}`. Returns `{"data": {"revoked": true}}`.

### GET `/auth/me`

Returns the current user using the same user shape.

## Admin dashboard

### GET `/admin/dashboard/summary`

Admin only. Single query for the dashboard shell.

Response:
```json
{"data": {
  "as_of": "2026-11-12T12:00:00+00:00",
  "stats": {
    "total_patients": {"value": 9, "change_pct": 12.5},
    "appointments_today": {"value": 6, "change_pct": -14.3},
    "revenue_month_minor": {"value_minor": 2450000, "change_pct": 9.4},
    "pending_claims": {"value": 4, "change_pct": null},
    "pending_voids": {"value": 1},
    "pending_refunds": {"value": 1}
  },
  "revenue_trend": {
    "months": ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"],
    "methods": ["SHA", "MPESA", "CASH", "CARD", "BANK", "SELF_PAY"],
    "departments": ["General Medicine", "Pediatrics"],
    "by_method": [{"month": "2026-06", "SHA": 0, "MPESA": 0, "CASH": 0, "CARD": 0, "BANK": 0, "SELF_PAY": 0, "total_minor": 0}],
    "by_department": [{"month": "2026-06", "General Medicine": 0, "Pediatrics": 0, "total_minor": 0}]
  },
  "payment_split": [{"method": "SHA", "amount_minor": 1000000, "percentage": 40.8}],
  "today_schedule": [{"id": "...", "scheduled_start": "...", "patient_name": "Brian Otieno", "doctor_name": "Dr. Otieno Odhiambo", "department_name": "General Medicine", "service_name": "General consultation", "status": "SCHEDULED", "source": "RECEPTION", "urgency": "ROUTINE"}],
  "recent_claims": [{"id": "...", "invoice_number": "...", "patient_name": "...", "claimed_amount_minor": 500000, "status": "SUBMITTED", "age_days": 20, "submitted_at": "..."}],
  "recent_audit": [{"id": "...", "created_at": "...", "actor_name": "Ada Admin", "actor_role": "ADMIN", "action": "invoice.create", "entity_type": "invoice", "entity_id": "...", "ip_address": "127.0.0.1"}]
}}
```
`change_pct` is `null` when there is no comparable previous value.

### GET `/admin/dashboard/pending-approvals`

Admin only. Returns pending void requests and refunds using the serializers below.

### GET `/admin/dashboard/invoice-totals`

Admin only. Returns counts and balances grouped by invoice status.

## Billing

### GET `/invoices`

Roles: patient (own), receptionist, cashier, admin.
Filters: `status`, `method`, `department_id`, `patient_id`, `date_from`, `date_to` (`YYYY-MM-DD`), `q`, `sort` (`created_at`, `issued_at`, `total_minor`, `balance_minor`, `invoice_number`, `status`), pagination.
Response item:
```json
{"id": "...", "invoice_number": "INV-2026-000001", "patient_id": "...", "patient_name": "Pam Patient", "patient_number": "MF-2026-000001", "visit_id": "...", "doctor_name": "Dr. Dan Doctor", "department_id": "...", "department_name": "General Medicine", "currency": "KES", "subtotal_minor": 500000, "discount_minor": 0, "total_minor": 500000, "amount_paid_minor": 0, "balance_minor": 500000, "status": "ISSUED", "primary_method": null, "issued_at": "...", "due_at": null, "created_at": "...", "lines": [{"id": "...", "service_id": "...", "description": "General consultation", "service_code": "CONS-GEN", "quantity": 1, "unit_price_minor": 250000, "line_total_minor": 250000}], "allocations": [{"id": "...", "payer": "SHA", "amount_minor": 250000, "status": "PENDING", "external_reference": null}]}
```

### GET `/invoices/<id>`

Same shape; patient role may only read its own invoice.

### POST `/invoices/<id>/transactions`

Roles: receptionist, cashier, admin. Records a cash/card payment.
Request `{"method": "CASH", "amount_minor": 500000, "tendered_minor": 600000, "reference": null, "notes": null}`.
Returns a transaction:
```json
{"data": {"id": "...", "invoice_id": "...", "invoice_number": "...", "patient_name": "...", "method": "CASH", "amount_minor": 500000, "tendered_minor": 600000, "change_minor": 100000, "currency": "KES", "status": "SUCCESS", "reference": "CASH-...", "provider_reference": null, "paid_at": "...", "created_at": "...", "notes": null}}
```

### POST `/invoices/<id>/payment-intents`

Roles: receptionist, cashier, admin. Starts an M-Pesa STK push. Supports optional `Idempotency-Key` header.

### POST `/invoices/<id>/void-requests`

Roles: receptionist, cashier, admin. Request `{"reason": "..."}`. Returns a void request.

### GET `/billing/void-requests`

Roles: receptionist, cashier, admin. Filters `status`, `invoice_id`, pagination. Item:
```json
{"id": "...", "invoice_id": "...", "invoice_number": "...", "patient_name": "...", "transaction_id": null, "reason": "...", "status": "PENDING", "requested_by_id": "...", "requested_by_name": "...", "reviewed_by_id": null, "reviewed_by_name": null, "decision_reason": null, "decided_at": null, "created_at": "..."}
```

### POST `/void-requests/<id>/decision`

Admin only. Request `{"approve": true, "reason": "..."}`. Returns the updated void request. Writes an audit entry.

### GET `/billing/refunds`

Roles: receptionist, cashier, admin. Filters `status`, `invoice_id`, pagination. Item includes invoice number, patient name, requested/approved names, amount and status.

### POST `/refunds/<id>/decision`

Admin only. Request `{"approve": true, "reason": "..."}`. Writes an audit entry.

### GET `/billing/transactions`

Roles: receptionist, cashier, admin. Filters `status`, `method`, `invoice_id`, `date_from`, `date_to`, `q`, pagination. Items use the transaction shape above.

### GET `/billing/cash-summary?date=YYYY-MM-DD`

Roles: receptionist, cashier, admin. Returns expected/collected cash totals and transaction counts.

### GET `/billing/cash-reconciliations`

Roles: receptionist, cashier, admin. Paginated reconciliation history.
Item: `{"id": "...", "business_date": "2026-11-12", "expected_cash_minor": 0, "counted_cash_minor": 0, "variance_minor": 0, "status": "BALANCED", "notes": null}`.

### POST `/billing/cash-reconciliations`

Request `{"business_date": "2026-11-12", "counted_cash_minor": 0, "notes": null}`.

### GET `/billing/reconciliation`

Roles: receptionist, cashier, admin. Returns `{payment_intents: [], transactions: []}` needing manual resolution.

## SHA claims

### GET `/claims`

Roles: doctor (own), receptionist, cashier, admin.
Filters: `status`, `invoice_id`, `q`, `aging_bucket` (`current`, `14`, `30`, `60`), pagination.
Item:
```json
{"id": "...", "invoice_id": "...", "invoice_number": "...", "patient_name": "...", "patient_number": "...", "department_name": "...", "allocation_id": "...", "patient_id": "...", "eligibility_check_id": "...", "claimed_amount_minor": 500000, "approved_amount_minor": null, "currency": "KES", "status": "SUBMITTED", "external_reference": "...", "submitted_at": "...", "decided_at": null, "paid_at": null, "rejection_reason": null, "resubmission_of_id": null, "age_days": 20, "history": [{"id": "...", "from_status": null, "to_status": "SUBMITTED", "note": "Claim submitted", "created_at": "..."}]}
```

### GET `/claims/aging`

Roles: receptionist, cashier, admin. Returns `{total_claims, by_status, aging_buckets, approval_rate, average_days_to_payment}`.

### POST `/claims/<id>/status`

Admin only. Request `{"status": "APPROVED", "approved_amount_minor": 500000, "rejection_reason": null, "note": "...", "external_reference": null}`. Transitions are validated server-side and audited.

### POST `/claims/<id>/resubmissions`

Roles: receptionist, cashier, admin. Only rejected claims. Request `{"amount_minor": 500000, "note": "..."}`. Returns a replacement claim.

### POST `/invoices/<id>/claims/eligibility-check`

Roles: billing. Request `{"member_reference": "SHA-..."}`. Returns eligibility check.

### POST `/invoices/<id>/claims`

Roles: billing. Request `{"eligibility_check_id": "...", "amount_minor": 500000}`.

## Audit

### GET `/admin/audit-events`

Admin only. Filters: `q`, `actor_user_id`, `action`, `role`, `entity_type`, `entity_id`, `start_date`, `end_date`, `sort` (`created_at`, `action`, `actor_role`, `entity_type`), pagination.
Item:
```json
{"id": "...", "actor_user_id": "...", "actor_name": "Ada Admin", "actor_role": "ADMIN", "action": "invoice.create", "entity_type": "invoice", "entity_id": "...", "before": null, "after": {"total_minor": 500000}, "request_id": "...", "ip_address": "...", "user_agent": "...", "created_at": "..."}
```

### POST `/admin/audit-exports`

Admin only. Accepts the same filters and returns a CSV attachment. Writes an `audit.export` audit entry.

## Management

### GET `/patients`

Roles: doctor, receptionist, cashier, admin.
Filters: `q`, `sex`, `is_active`, `sort` (`name`, `created_at`, `-created_at`, `-patient_number`), pagination.
Item: `{id, patient_number, first_name, last_name, date_of_birth, sex, phone, allergies}`.

### POST `/patients`, PATCH `/patients/<id>`

Receptionist/admin. Uses the existing patient schema.

### GET `/admin/users`

Admin only. Filters `role`, `status`, `search`, pagination. Item includes `id, email, phone, first_name, last_name, full_name, role, status, email_verified, phone_verified, patient_id, doctor_id`.

### POST `/admin/users`, PATCH `/admin/users/<id>`

Admin only. Create staff or update `status`, `role`, names. Deactivation is `{"status": "INACTIVE"}` and is audited.

### GET `/departments`, `/services`, `/doctors`

Authenticated. Departments/services are unpaginated catalog lists; doctors can be filtered by `department_id`.

### POST `/admin/departments`, PATCH `/admin/departments/<id>`

Admin only.

### POST `/admin/services`, PATCH `/admin/services/<id>`, POST `/admin/services/<id>/prices`

Admin only.

### PATCH `/admin/doctors/<id>`

Admin only.

### GET `/appointments`

Roles: patient (own), doctor (own), receptionist, admin.
Filters: `status`, `date`, `source`, `doctor_id`, `department_id`, `q`, `sort` (`scheduled_start`, `created_at`, `status`), pagination.
Item includes patient/doctor/service/department names plus status, source, urgency and timestamps.

### POST `/appointments`, POST `/appointments/walk-in`, PATCH `/appointments/<id>`

See the scheduling module; admin can update status/urgency/notes.

### GET `/admin/visits`

Admin only. Filters: `q`, `department_id`, `doctor_id`, `completed` (`true`/`false`), `date_from`, `date_to`, `sort`, pagination. Item includes patient/doctor/department names and clinical fields.

## Analytics and reports

- `GET /reports/revenue?start_date=&end_date=&group_by=method|month|doctor|department`
- `GET /reports/claims?start_date=&end_date=`
- `GET /reports/doctor-workload`, `GET /reports/no-shows`, `GET /reports/daily-cash`
- `GET /reports/exports` (paginated export jobs), `POST /reports/exports`, `GET /reports/exports/<id>`, `GET /reports/exports/<id>/download`
- All admin-only except `daily-cash`, which is also available to billing.

## Notifications and AI

- `GET /notifications/delivery-status?status=&channel=` (admin)
- `GET /admin/notification-templates`, `PATCH /admin/notification-templates/<id>` (admin)
- `POST /admin/notifications/<id>/retry` (admin)
- `GET /admin/ai-interactions?feature=&status=` (admin)
- `POST /ai/triage` (public, assistive) and `POST /admin/report-queries` (admin)

## Contract decisions

- Kept the existing `{"data": {items, meta}}` list envelope and added `page_size` as an alias for `per_page`.
- Kept uppercase enum values because they are already persisted and exposed by the backend.
- Added `VITE_API_URL` instead of `NEXT_PUBLIC_API_URL` because the frontend is Vite/TanStack Start.
- Added names to serializers (`patient_name`, `doctor_name`, `department_name`, `actor_name`) so the UI does not need to invent or separately hydrate them.
