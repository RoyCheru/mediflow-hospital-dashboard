# MediFlow Admin Integration — Discovery

Date: 2026-11-12
Branch: `feat/admin-integration`
Scope: authentication plus the admin area. Doctor, receptionist and patient areas are intentionally out of scope; the client and route guards are structured so they can be added later.

## 1. Backend

### Stack and run

- Flask 3, Flask-SQLAlchemy 2, Alembic, PostgreSQL in production, SQLite in tests.
- All routes are mounted under `/api/v1`.
- App factory: `backend/app/__init__.py`; config: `backend/app/config.py`.
- Run: `cd backend && source .venv/bin/activate && export FLASK_APP=wsgi && flask db upgrade && flask seed && flask run`
- Seed: `flask seed` creates `admin@mediflow.test`, `doctor@mediflow.test`, `reception@mediflow.test`, `cashier@mediflow.test`, `patient@mediflow.test` (passwords in `backend/README.md`).
- Tests: `.venv/bin/pytest`.
- Lint: `.venv/bin/ruff check app migrations tests`.

### Auth mechanism

- JWT access tokens (`HS256`, default 15 minutes) plus opaque rotating refresh tokens stored as SHA-256 hashes in `refresh_token_families`.
- `POST /auth/login` returns `{data: {access_token, refresh_token, token_type, expires_in, user}}`.
- Protected endpoints use `@auth_required(*roles)` in `app/common/decorators.py`; this checks the `Authorization: Bearer <token>` header, account status and staff inactivity.
- `GET /auth/me` returns the current user, including `role` (`ADMIN`, `DOCTOR`, `RECEPTIONIST`, `CASHIER`, `PATIENT`).
- No cookie or CSRF support exists on the backend.

### Response and error formats

- Success: `{"data": ...}` (`app/common/responses.py`).
- Lists: `{"data": {"items": [...], "meta": {"page", "per_page", "total", "pages"}}}` via `app/common/pagination.py`.
- Errors: `{"error": {"code", "message", "details"}}` with `400/401/403/404/405/409/413/422/500` (`app/common/errors.py`).
- Timestamps are ISO 8601 with UTC offsets.
- Money is stored and returned as integer minor units in `*_minor` fields (`BigInteger`), never floats.

### CORS

- `flask-cors` is configured in `app/__init__.py` for `/api/*`.
- Current default is `CORS_ORIGINS=*`. `.env.example` suggests `http://localhost:5173`.
- Decision: restrict the default to the TanStack Start dev origin (`http://localhost:8080`) and require an explicit origin list in deployment.

### Existing route surface (admin-relevant)

| Method | Path | Role |
| --- | --- | --- |
| POST | `/auth/login`, `/auth/refresh`, `/auth/logout` | public |
| GET | `/auth/me` | authenticated |
| GET/POST | `/admin/users` | admin |
| PATCH | `/admin/users/<id>` | admin |
| GET | `/admin/audit-events`, POST `/admin/audit-exports` | admin |
| GET | `/reports/revenue`, `/reports/claims`, `/reports/doctor-workload`, `/reports/no-shows`, `/reports/daily-cash` | admin (daily-cash also billing) |
| POST/GET | `/reports/exports`, `/reports/exports/<id>`, `/reports/exports/<id>/download` | admin |
| GET | `/invoices`, `/invoices/<id>` | patient or billing |
| POST | `/invoices/<id>/transactions`, `/allocations`, `/payment-intents`, `/void-requests` | billing |
| POST | `/void-requests/<id>/decision`, `/refunds/<id>/decision` | admin |
| GET | `/billing/reconciliation`, `/billing/cash-summary` | billing |
| POST | `/billing/cash-reconciliations`, `/billing/transactions/<id>/resolve` | billing |
| GET | `/claims`, `/claims/<id>`, `/claims/aging` | billing (doctors see own) |
| POST | `/claims/<id>/status` | admin |
| POST | `/claims/<id>/resubmissions` | billing |
| GET | `/patients` | doctor/reception/cashier/admin |
| POST/PATCH | `/patients`, `/patients/<id>` | reception/admin |
| GET | `/departments`, `/services`, `/doctors` | authenticated |
| POST/PATCH | `/admin/departments`, `/admin/services`, `/admin/doctors/<id>` | admin |
| GET | `/appointments`, `/appointments/<id>`, `/queue` | role-scoped |
| POST | `/appointments`, `/appointments/walk-in`, check-in/no-show/cancel/reschedule | role-scoped |
| GET | `/notifications/delivery-status`, `/admin/notification-templates` | admin |
| POST | `/admin/notifications/<id>/retry` | admin |
| GET/PATCH | `/admin/notification-templates/<id>` | admin |
| POST | `/admin/report-queries` | admin |
| POST | `/ai/triage` | public (assistive) |

### Key models

- `User`: email, phone, role, status, names, last login/activity.
- `PatientProfile`: patient number, demographics, encrypted national ID/SHA number, allergies/chronic conditions/medications, next of kin, active flag.
- `Department`, `Service`, `ServicePrice`, `DoctorProfile`, `AvailabilityRule`, `AvailabilityException`.
- `Appointment`: patient/doctor/service, scheduled start/end, status, source, urgency, no-show score.
- `Visit`, `Prescription`, `PrescriptionItem`, `Attachment`.
- `Invoice`, `InvoiceLine`, `InvoiceAllocation`, `PaymentIntent`, `Transaction`, `VoidRequest`, `Refund`, `CashReconciliation`.
- `Claim`, `ClaimStatusHistory`, `EligibilityCheck`.
- `AuditLog` (append-only; ORM blocks update/delete).
- `Notification`, `NotificationAttempt`, `NotificationTemplate`.
- `AIInteraction`, `ReportExport`.

All tables use UUID primary keys and `created_at`/`updated_at` except append-only event tables.

### Seed reality

`flask seed` only creates one department, five services, one doctor, one patient and one future appointment. It does **not** create invoices, transactions, claims, audit history or enough patients for a convincing dashboard. The integration must extend seeding (Phase 2) so all three payment methods, claim statuses and audit entries are represented.

## 2. Frontend

### Stack and structure

The task brief says Next.js App Router. The repository actually uses **TanStack Start + TanStack Router + React 19 + TypeScript + Vite + Tailwind CSS 4 + TanStack Query**. Decision: keep the existing framework and implement the integration using TanStack Router file routes, `beforeLoad` guards and TanStack Query. This preserves the working UI.

Current route areas:

| Area | Layout | Home | Notes |
| --- | --- | --- | --- |
| Auth | `src/routes/auth/route.tsx` | `/auth/login` | existing demo form, no API |
| Admin | `src/routes/admin/route.tsx` | `/admin` | full mock UI, 13 pages |
| Doctor | `src/routes/doctor/route.tsx` | `/doctor` | mock dashboard, out of scope |
| Receptionist | `src/routes/receptionist/route.tsx` | `/receptionist` | placeholder, out of scope |
| Cashier | `src/routes/cashier/route.tsx` | `/cashier` | placeholder, out of scope |
| Patient | `src/routes/patient/route.tsx` | `/patient` | placeholder, out of scope |

Shared UI: `src/components/AppShell.tsx`, `TopBarActions.tsx`, `kit.tsx` (`Panel`, `StatCard`, `Badge`, `Modal`, table helpers), `src/components/ui/*`.

### Mock/hardcoded data inventory

All admin pages import seeded arrays from `src/lib/data.ts` and keep local `useState` copies:

| File | What is mocked |
| --- | --- |
| `src/routes/admin/index.tsx` | stat values, revenue charts, payment split, people table, schedule, claims preview, audit preview |
| `src/routes/admin/billing.tsx` | invoices, transactions, intents, refunds, void requests, reconciliations, cash summary |
| `src/routes/admin/claims.tsx` | claims, eligibility checks, aging buckets |
| `src/routes/admin/audit-log.tsx` | audit entries, stats, CSV built in the browser |
| `src/routes/admin/patients.tsx` | patient list/detail, registration, duplicates |
| `src/routes/admin/staff.tsx` | staff list, availability rules/exceptions, create/edit |
| `src/routes/admin/departments.tsx` | departments and services |
| `src/routes/admin/appointments.tsx` | appointment list, schedule, availability, booking |
| `src/routes/admin/visits.tsx` | visits, prescriptions, attachments, AI summaries |
| `src/routes/admin/analytics.tsx` | revenue/claims/no-show/workload charts and exports |
| `src/routes/admin/notifications.tsx` | notification log, templates, retries |
| `src/routes/admin/settings.tsx` | profile, users, integrations, fake API key |
| `src/routes/admin/ai.tsx` | AI interactions and triage demo |
| `src/lib/data.ts` | ~2,800 lines of demo patients, invoices, claims, audit, etc. |
| `src/lib/doctor-data.ts` | doctor-only demo data (out of scope) |

The top-bar alerts, messages and profile are intentionally in-memory demo state (`TopBarActions.tsx`); they are not part of the admin data integration.

### Current auth and HTTP handling

- No API client, no token storage, no refresh logic, no `middleware.ts`, and no route guards.
- Login page navigates directly to a chosen role home using demo links.
- `QueryClientProvider` already wraps the app (`src/routes/__root.tsx`), so TanStack Query is available.
- No `.env` files exist in the frontend.

### Frontend env conventions

Vite exposes `VITE_*` variables. Decision: use `VITE_API_URL` (not `NEXT_PUBLIC_API_URL`) because the project is Vite-based. Add `frontend/.env.example` and document the change.

## 3. Gap table

| Admin screen element | Backend endpoint | Status | PRD requirement |
| --- | --- | --- | --- |
| Login, current user, refresh, logout | `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me` | exists | AUTH-1, AUTH-2, AUTH-4 |
| Role guard, non-admin removal | `@auth_required(Role.ADMIN)` and role checks | exists | AUTH-2, Section 5 |
| Dashboard stat cards | none aggregated | missing | ANL-1, ANL-3, ANL-4 |
| Revenue trend and payment split | `/reports/revenue` | needs aggregation/filters | ANL-1 |
| Today's schedule | `/appointments?date=...` | exists, needs enriched response | APT-6, APT-7 |
| Recent claims preview | `/claims` | exists, needs enriched response | BIL-6, BIL-9 |
| Recent audit preview | `/admin/audit-events` | exists, needs actor names | AUD-1, AUD-3 |
| Patients table/search/detail | `/patients` | exists, needs pagination and richer serializer | PAT-1, PAT-5 |
| Staff/users list and deactivate | `/admin/users`, `PATCH /admin/users/<id>` | exists | ADM-1, AUTH-3 |
| Departments/services | `/departments`, `/services`, admin CRUD | exists | ADM-2 |
| Appointments list/filters | `/appointments` | exists, needs q/doctor/department/source filters | APT-3, APT-6 |
| Invoices list/detail/filters | `/invoices`, `/invoices/<id>` | exists, needs date/method/q filters and names | BIL-1, BIL-2, BIL-13 |
| Record payment | `/invoices/<id>/transactions` | exists | BIL-3, BIL-4 |
| SHA claims tracker, aging, resubmit | `/claims`, `/claims/aging`, `/claims/<id>/status`, `/claims/<id>/resubmissions` | exists, needs q/bucket filters and names | BIL-5 to BIL-12 |
| Cash reconciliation | `/billing/cash-summary`, `/billing/cash-reconciliations` | exists; history list missing | BIL-14 |
| Void approvals | `POST /void-requests/<id>/decision` | exists; list missing | BIL-10 |
| Refund approvals | `POST /refunds/<id>/decision` | exists; list missing | BIL-10 |
| Audit log filters/search/export | `/admin/audit-events`, `/admin/audit-exports` | exists; q/sort/actor names missing | AUD-1, AUD-3, AUD-4 |
| Analytics reports/exports | `/reports/*` | exists | ANL-1 to ANL-5 |
| Notification log/templates/retry | `/notifications/delivery-status`, `/admin/notification-templates`, `/admin/notifications/<id>/retry` | exists | NTF-1, NTF-5 |
| Visits list | none for admin | missing | EMR-1, EMR-4, AUD-2 |
| AI interactions list | none | missing | AI-1 to AI-5 |
| Hospital profile / integrations settings | none | missing | ADM-3, ADM-4 |
| CSV export | `/admin/audit-exports`, `/reports/exports` | exists | AUD-3, ANL-5 |

P0 admin requirements with no current implementation: aggregated dashboard summary, admin visits list, pending void/refund lists, audit search, and a realistic seed dataset.

## 4. PRD vs code discrepancies

1. **Framework**: PRD says Next.js; code is TanStack Start. Keep TanStack Start to avoid a rewrite. Auth guards live in TanStack Router `beforeLoad`; API client lives in `src/lib/api`.
2. **Enum casing**: the task contract suggests lowercase enums; the backend uses uppercase enum values (`ADMIN`, `SUBMITTED`, `MPESA`). Keep uppercase so the API and database stay consistent.
3. **Pagination envelope**: contract suggests `data` array plus `meta`; backend returns `data: {items, meta}`. Keep the existing envelope and make the frontend type match. Add `page_size` as an alias for `per_page`.
4. **Dashboard scope**: PRD admin dashboard includes cash reconciliation and claims; the current UI calls it "Pending Approvals" and shows both refunds and voids. Bind it to pending claims plus pending voids/refunds and keep the label honest.
5. **Patient status/admission**: the UI shows `Admitted/Discharged/Transferred`, but the backend has no ward/admission model (explicit non-goal). Replace those columns with backend-backed `is_active`/risk-derived values rather than inventing admissions.
6. **CORS default**: code defaults to `*`. Restrict to configured frontend origins; record the deployment requirement.
7. **Seed data**: PRD expects realistic demo data; code seeds a single appointment. Extend seeding so dashboard/billing/claims/audit screens can be populated without inserting fake values in the UI.
8. **Staff inactivity**: PRD says automatic logout after 15 minutes for staff; backend already enforces this via `STAFF_INACTIVITY_MINUTES` on authenticated requests. The frontend must handle the resulting 401.
