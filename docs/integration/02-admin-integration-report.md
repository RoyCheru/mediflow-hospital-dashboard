# Admin Integration Report

Status: complete for authentication plus the admin area.
Branch: `feat/admin-integration`.

## What changed

- Added a typed API client with bearer-token auth, normalized errors, query-string helpers and a single refresh-and-retry on 401.
- Added `AuthProvider` / `useAuth`, persisted sessions, server-validated `GET /auth/me`, login, logout and an admin route guard.
- Replaced all mock data in `frontend/src/routes/admin/*` with TanStack Query calls to the Flask API.
- Added the missing backend endpoints for dashboard aggregation, pending approvals, admin visits, AI interaction lists, report export lists and billing/claims list filters.
- Added a realistic demo seed covering all payment methods and every SHA claim lifecycle state.
- Added browser E2E coverage for login, role blocking, claims filtering and void approval + audit visibility.

## Framework decision

The task brief names Next.js. The repository is **TanStack Start + TanStack Router + Vite**. Rewriting the working frontend was out of scope and riskier than keeping the existing stack. The integration therefore uses:

- TanStack Router `beforeLoad` guards instead of `middleware.ts`.
- Vite's `VITE_API_URL` instead of `NEXT_PUBLIC_API_URL`.
- TanStack Query, which was already installed.

This is recorded in `00-discovery.md`.

## Auth and token approach

The backend returns JWT access and rotating refresh tokens in the login response body. It has no cookie or CSRF support.

Decision: store the tokens in `localStorage`, attach `Authorization: Bearer …` in the API client, and refresh once on a 401. If refresh fails, clear the session and send the user to `/auth/login`.

Why: this matches the backend's current contract without inventing a cookie/proxy layer. Trade-offs:

- Tokens are readable by JavaScript, so XSS protection depends on the app's CSP and rendering discipline.
- There is no CSRF exposure because tokens are not sent automatically as cookies.
- Route guards are UX only. Every admin endpoint enforces `Role.ADMIN` server-side and returns 403 for other roles.

Because tokens live in localStorage, the admin route's `beforeLoad` guard runs on the client only. During SSR it returns without redirecting, and the layout shows a short "Checking your session…" state until `GET /auth/me` confirms the session. This keeps direct reloads of `/admin/*` working.

If the backend later adopts httpOnly cookies, replace `auth-storage.ts` and the API client's auth header; the rest of the pages do not need to change.

## Endpoint-to-page map

| Page | Endpoints |
| --- | --- |
| `/auth/login` | `POST /auth/login`, `GET /auth/me` |
| `/admin` | `GET /admin/dashboard/summary`, `GET /patients`, `GET /admin/users` |
| `/admin/billing` | `GET /invoices`, `GET /invoices/:id`, `POST /invoices/:id/transactions`, `POST /invoices/:id/payment-intents`, `GET /billing/transactions`, `GET /billing/void-requests`, `POST /void-requests/:id/decision`, `GET /billing/refunds`, `POST /refunds/:id/decision`, `GET /billing/cash-summary`, `GET /billing/cash-reconciliations`, `POST /billing/cash-reconciliations`, `GET /billing/reconciliation`, `GET /admin/dashboard/invoice-totals` |
| `/admin/claims` | `GET /claims`, `GET /claims/:id`, `GET /claims/aging`, `POST /claims/:id/status`, `POST /claims/:id/resubmissions` |
| `/admin/audit-log` | `GET /admin/audit-events`, `POST /admin/audit-exports` |
| `/admin/patients` | `GET /patients`, `GET /patients/:id`, `POST /patients`, `PATCH /patients/:id` |
| `/admin/staff` | `GET /admin/users`, `POST /admin/users`, `PATCH /admin/users/:id`, `GET /doctors`, `PATCH /admin/doctors/:id`, `GET /departments` |
| `/admin/departments` | `GET /departments`, `GET /services`, `POST /admin/departments`, `PATCH /admin/departments/:id`, `POST /admin/services`, `PATCH /admin/services/:id`, `POST /admin/services/:id/prices` |
| `/admin/appointments` | `GET /appointments`, `POST /appointments`, `POST /appointments/walk-in`, `POST /appointments/:id/check-in`, `PATCH /appointments/:id` |
| `/admin/visits` | `GET /admin/visits`, `GET /visits/:id` |
| `/admin/analytics` | `GET /reports/revenue`, `GET /reports/claims`, `GET /reports/doctor-workload`, `GET /reports/no-shows`, `GET /reports/exports`, `POST /reports/exports` |
| `/admin/notifications` | `GET /notifications/delivery-status`, `GET /admin/notification-templates`, `PATCH /admin/notification-templates/:id`, `POST /admin/notifications/:id/retry` |
| `/admin/ai` | `GET /admin/ai-interactions`, `POST /ai/triage`, `POST /admin/report-queries` |
| `/admin/settings` | `GET /auth/me`, `GET /admin/users`, `PATCH /admin/users/:id` |

## PRD requirements covered

- AUTH-1, AUTH-2, AUTH-4: login, server-side RBAC, token refresh, inactivity handling via 401.
- Section 5 role matrix: non-admin tokens are rejected by the API; `/admin/*` UI routes also redirect.
- Section 8 admin dashboard: live stat cards, revenue trend toggle, payment split, patient/staff preview, today's schedule, claims preview and audit preview.
- BIL-1, BIL-2, BIL-3, BIL-4, BIL-6, BIL-9, BIL-10, BIL-12, BIL-13, BIL-14: invoice list/detail, cash/card payment, M-Pesa intent, claims tracker and aging, resubmission, refund/void approvals, cash reconciliation, outstanding balances.
- AUD-1, AUD-3, AUD-4: filterable/searchable audit page, CSV export, append-only backend.
- PAT-1, PAT-5: patient search and registration.
- ADM-1, ADM-2: users/roles/status, departments and services/prices.
- APT-3, APT-6: appointment filters, booking, walk-in, check-in and status updates.
- ANL-1 to ANL-5: revenue, claims, no-show and workload reports plus export jobs.
- NTF-1, NTF-5: delivery log, retry and templates.
- EMR-1, EMR-4: admin read-only visits list and detail.
- AI-1 to AI-5: triage, interaction log and allowlisted natural-language report queries.

## Backend additions

- `GET /admin/dashboard/summary` — aggregate stats, 6-month revenue trend by method/department, payment split, today's schedule, recent claims and recent audit.
- `GET /admin/dashboard/pending-approvals`, `GET /admin/dashboard/invoice-totals`.
- `GET /admin/visits`, `GET /admin/ai-interactions`, `GET /reports/exports`.
- Filter/search/sort support on invoices, transactions, claims, audit events, patients and appointments.
- `GET /billing/void-requests`, `GET /billing/refunds`, `GET /billing/transactions`, `GET /billing/cash-reconciliations`.
- Enriched serializers with patient/doctor/department/actor names.
- `page_size` alias for `per_page`.
- `flask seed` now creates extra staff, patients, appointments, invoices across payment methods, claims in every lifecycle state, pending void/refund requests, cash reconciliation, notifications and AI interactions.

## Files changed (high level)

Backend:

- `backend/app/admin/*` — dashboard service and routes.
- `backend/app/{billing,claims,audit,patients,scheduling,clinical_records,analytics}/*` — filters, serializers and list endpoints.
- `backend/app/demo_seed.py`, `backend/app/cli.py` — realistic seed.
- `backend/app/api/v1.py` — admin blueprint registration.
- `backend/tests/test_admin_integration.py` — new endpoint coverage.

Frontend:

- `frontend/src/lib/api/*` — typed resource clients.
- `frontend/src/lib/auth.tsx`, `auth-storage.ts`, `types/api.ts` — auth and contract types.
- `frontend/src/components/DataState.tsx` — loading, empty and error states.
- `frontend/src/routes/auth/login.tsx`, `routes/admin/route.tsx`, `routes/unauthorized.tsx` — auth flow and guard.
- `frontend/src/routes/admin/*.tsx` — all admin pages.
- `frontend/e2e/*`, `playwright.config.ts` — E2E tests.
- `frontend/.env.example` — `VITE_API_URL`.

Docs:

- `docs/integration/00-discovery.md`
- `docs/integration/01-api-contract.md`
- `docs/integration/02-admin-integration-report.md`

## Decisions and assumptions

1. Keep the existing `{"data": ...}` envelope and `data.items` + `meta` list shape instead of reshaping every endpoint.
2. Keep uppercase enums because they are already persisted and exposed.
3. Use localStorage bearer tokens rather than adding a cookie proxy (see above).
4. Admin visits are read-only; only doctors write clinical records.
5. The admin patient table uses backend fields only. The old mock `Admitted/Discharged/Transferred` status is gone because the PRD explicitly excludes inpatient ward management.
6. M-Pesa payments from the admin UI start a payment intent (STK push). Confirmation still arrives through the provider callback; the reconciliation tab shows unconfirmed items.
7. Top-bar alert/message demo state remains in-memory by project convention; it is not hospital data.

## Known gaps

- No hospital-profile/branding endpoint exists, so `/admin/settings` shows the authenticated admin profile, session security and staff access instead of fictitious branding/integration settings.
- Admin visits are read-only; clinical writes belong to doctors by PRD.
- Notification rows do not expose recipient PII in the UI; the backend deliberately stores encrypted recipient addresses.
- Report export creation is queued; the UI lists jobs but does not yet download generated files.
- No automatic token revocation on role change; the next admin request is still checked server-side.
- E2E currently covers the four required flows. Additional page-by-page E2E coverage is a sensible follow-up.

## How to run locally

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
# Edit DATABASE_URL and CORS_ORIGINS
export FLASK_APP=wsgi
flask db upgrade
flask seed
flask run --port 5000
```

For a quick local SQLite run:

```bash
cd backend
DATABASE_URL=sqlite+pysqlite:////tmp/mediflow.db FLASK_APP=wsgi .venv/bin/flask db upgrade
DATABASE_URL=sqlite+pysqlite:////tmp/mediflow.db FLASK_APP=wsgi .venv/bin/flask seed
DATABASE_URL=sqlite+pysqlite:////tmp/mediflow.db FLASK_APP=wsgi .venv/bin/flask run --port 5000
```

### Frontend

```bash
cd frontend
cp .env.example .env
# VITE_API_URL=http://localhost:5000/api/v1
npm install
npm run dev
```

Open `http://localhost:8080/auth/login` and sign in with a seeded account.

### Tests

```bash
cd backend && .venv/bin/pytest
cd frontend && npm test && npm run lint && npx tsc --noEmit && npm run build
cd frontend && npm run test:e2e
```

`npm run test:e2e` starts a throwaway SQLite backend, seeds it, starts the frontend and runs Playwright. It requires the Playwright Chromium browser (`npx playwright install chromium`).

## Verification performed

- Backend: `ruff check app tests`, `ruff format --check app tests`, `.venv/bin/pytest` — **45 passed**.
- Frontend: `npx tsc --noEmit`, `npm run lint` (0 errors), `npm run build`, `npm test` — **14 passed**.
- Playwright: **4 passed** (admin login/live dashboard including a full reload, non-admin blocked, claims filter, void approval visible in audit log).
- SQL spot-check against the E2E SQLite database matched the dashboard summary exactly for total patients, month revenue, pending claims, pending voids and pending refunds.
- `flask seed` verified against SQLite and confirmed to produce data for every admin screen.
