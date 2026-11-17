# Admin Appointments & Staff Availability — Notes

Branch: `fix/admin-appointments-queue-availability`
PRD: `backend/docs/PRD.md` (APT-8, APT-9, APT-10, ADM-5, Section 8 Admin, Section 9).

## Branch base decision

The task asks for a branch from the default branch. `main` does not contain the
admin integration, the walk-in/follow-up model or the server-side queue service
that this task explicitly depends on. Branching from `main` would remove working
code and make APT-9 impossible without merging another feature branch (forbidden
by the working rules).

Decision: branch from `fix/walk-in-appointment-model` (the current pushed parent
branch). This preserves the nullable slot/arrival model and the existing queue
ordering service. No merge, rebase or force-push was used.

## What was lost and why

The original admin UI (before the live API integration) had:

- Appointments tabs: **Schedule**, **Live queue**, **Availability**.
- A live queue tab grouped by doctor with position and queue actions.
- Staff tabs: **Doctors & staff**, **User accounts**, **Availability** with
  weekly rules, exceptions and add/delete forms.
- A mock availability editor on the staff page.

During the live-API integration those were simplified to a single flat
appointments table and a flat staff table because the backend only exposed the
role-scoped appointment list and doctor self-service availability endpoints.

This task restores the PRD-required behavior on the current model:

- Appointments becomes **All Appointments** (all dates, filters) plus **Live
  Queue** (today only, read-only, server order). Availability is not restored on
  the appointments page because the revised PRD puts it on Doctors & Staff.
- Staff regains monthly/weekly availability and exceptions, now backed by
  admin endpoints and audit logging, and adds working hours/time off for
  non-doctor staff.
- Old queue action buttons are intentionally not restored: the new Live Queue is
  read-only monitoring. Check-in/booking remains on All Appointments.

## Discovered backend surface

| Area | Existing code |
| --- | --- |
| Appointment list | `GET /api/v1/appointments` role-scoped; no admin all-dates endpoint |
| Queue | `scheduling.service.queue()`; ordered by urgency, slot/arrival, id; today uses UTC day |
| Availability models | `AvailabilityRule` / `AvailabilityException`; FK only to `doctor_profiles` |
| Doctor self-service | `GET/POST/DELETE /doctors/me/availability`, `POST /doctors/me/exceptions` |
| Admin users | `GET /admin/users`, `PATCH /admin/users/<id>` |
| Admin staff/availability | none |
| Timezone | no hospital timezone setting; queue and reports use UTC dates |
| Seed | today-only appointments; doctor weekly rules; no non-doctor working hours |

## PRD vs code discrepancies

1. **Queue day boundary**: existing queue uses UTC midnight. PRD requires the
   hospital timezone (`Africa/Nairobi` default). Decision: add a
   `HOSPITAL_TIMEZONE` setting and compute local day bounds on the server.
2. **Availability ownership**: `AvailabilityRule`/`Exception` only reference
   `doctor_profiles`. PRD Section 9 says the same structure holds working hours
   and time off for other staff. Decision: add nullable `user_id` to both
   tables, make `doctor_id` nullable, and enforce exactly one owner. This avoids
   a second parallel model.
3. **Admin availability API**: no admin endpoints exist. Add them under
   `/api/v1/admin/staff/...` with server-side admin checks and audit entries.
4. **Appointments endpoint shape**: the task specifies `{data, meta}` with rows
   containing nested patient/doctor/department/service. Existing list endpoints
   use `{data: {items, meta}}`. New admin endpoints follow the task shape; the
   existing role-scoped endpoint is unchanged.
5. **Live Queue read-only**: old UI had queue actions. PRD APT-9 says read-only;
   do not restore actions there.

## Planned approach

- Add `HOSPITAL_TIMEZONE` config (default `Africa/Nairobi`).
- Generalize availability ownership with nullable `user_id` and a safe,
  idempotent migration.
- Add admin-only endpoints:
  - `GET /admin/appointments`
  - `GET /admin/queue`
  - `GET /admin/staff`
  - `GET /admin/staff/<user_id>/availability`
  - `GET /admin/availability`
  - CRUD rules/exceptions under `/admin/staff/<user_id>/availability/...`
- Reuse `scheduling.service.queue()` for Live Queue ordering; only add
  hospital-day boundaries and department filtering around it.
- Add indexes for admin appointment filters.
- Seed past/today/future appointments, all sources/statuses, a mixed urgent
  queue, doctor leave today, and receptionist working hours.
- Frontend: Appointments page tabs with URL search state, All Appointments table
  with filters/sort/pagination/details, Live Queue panel with polling, Staff
  page working-today summary and availability panel/editor.
- Tests: backend endpoint/RBAC/audit/timezone/queue tests; Playwright flows.

## Decisions to record

- Timezone setting: `HOSPITAL_TIMEZONE=Africa/Nairobi`.
- Queue polling: 25 seconds, only while the Live Queue tab is active and the
  browser tab is visible.
- Waiting highlight threshold: 30 minutes, returned by the API as
  `waiting_threshold_minutes`.
- Non-doctor working hours: reuse `AvailabilityRule`/`AvailabilityException`
  with `user_id` owner.
- Audit action names: `availability.rule_create`, `availability.rule_update`,
  `availability.rule_delete`, `availability.exception_create`,
  `availability.exception_update`, `availability.exception_delete`.
- Admin availability edits are on behalf of the target staff user and always
  record `staff_user_id` in the audit payload.

## Assumptions / gaps to confirm during implementation

- "Staff" includes doctors, receptionists and cashiers; patients are excluded.
- Non-doctor `slot_minutes` is stored but not used for booking; it represents
  the working-hours grid only.
- `next_available_slot` is computed for doctors only.
- Availability calendar shows booked doctor slots but does not allow editing
  appointments from this panel.

---

# Resume audit (2026-11-17)

A later session resumed this branch with no memory of the earlier one. The
earlier session left all implementation uncommitted. It was reviewed and
committed as three `wip:` commits (`814de31`, `eb15eb5`, `09928fe`) so nothing
was lost, then fixed forward.

## Git and environment state found

- Branch `fix/admin-appointments-queue-availability`, in sync with origin at
  `c993f10` (PRD update only). No stash. No pull request (the `gh` CLI is not installed).
- Default branch `main` (`57474e4`); this branch is stacked on
  `fix/walk-in-appointment-model` → `feat/admin-integration` (see "Branch base
  decision" above).
- PRD (`backend/docs/PRD.md`) already contains APT-8, APT-9, APT-10, ADM-5 and
  the Section 8 admin wording, so no PRD change was needed.
- Migrations: one linear chain `0001_initial → 0002_walk_in_appointment_model →
  0003_admin_staff_availability` (head). No duplicates or branches. The dev
  Postgres DB is stamped at `0003`.
- The frontend is TanStack Start/Router (Vite), not Next.js as the task prompt
  says (see discrepancies).

## Baseline (before any fix, uncommitted WIP in the tree)

| Check | Result |
| --- | --- |
| `pytest` (backend) | 66 passed |
| `ruff check` / `ruff format --check` | clean |
| `npm run lint` (frontend) | 0 errors, 9 warnings (all pre-existing, in `components/ui`, `kit.tsx`, `auth.tsx`, `PlaceholderPage.tsx`) |
| `tsc --noEmit` | clean |
| `npm run build` | OK |
| `vitest` | 14 passed |
| Playwright | not run at baseline (needs live API and seeded DB); run in Step 4 |

## Status table

| Item | Status | Evidence |
| --- | --- | --- |
| APT-8 All Appointments (overall) | partial | Endpoint and table exist. Existing row actions (Check in, Update) were dropped by the WIP rewrite of `routes/admin/appointments.tsx` |
| APT-9 Live Queue (overall) | partial | Endpoint and panel exist; malformed `doctor_id` → 500; summary query and panel poll with two different query keys (double requests); arrived time hidden for booked rows |
| APT-10 Doctor availability (overall) | partial | Endpoints and panel exist; no UI to edit an existing rule (PATCH unused); bugs below |
| ADM-5 Non-doctor working hours (overall) | partial | Model supports `user_id` owner; `working_today` leave bug hides staff (below) |
| Data model (`user_id` owner, check constraint) | done and verified | `scheduling/models.py`; dev DB has the check constraint |
| Migration 0003 | broken | Adds `availability_*.user_id` **without FK to `users`** and without the model's `ix_availability_*_user_id` index; dev DB (`\d availability_rules`) confirms drift. No up/down test for 0003 |
| `HOSPITAL_TIMEZONE` setting + helpers | done and verified | `config.py`, `common/time.py`, `test_admin_appointments_uses_hospital_timezone_day_boundaries` |
| `GET /admin/appointments` | done and verified | `test_admin_appointments_filters_pagination_and_nullable_slot`; relationships are `lazy="joined"`, so no N+1 |
| `GET /admin/queue` | partial | Reuses `scheduling.service.queue()` (single ordering); `test_admin_queue_orders_today_only_and_groups_by_doctor`; invalid UUID → 500 |
| `GET /admin/staff` | partial | `today_status` "in_consultation" counts IN_CONSULTATION rows from any day, not today |
| `GET /admin/staff/:id/availability` | partial | `today_status` computed from range exceptions, so it is wrong when range excludes today; time off limited to the 7-day range (no "upcoming") |
| `GET /admin/availability` | broken | Leave filter `item.doctor_id == rule.doctor_id or item.user_id == rule.user_id` matches `None == None`, so **one doctor on leave hides every doctor**; ignores `effective_from/to`; N+1 `User.query.get` per doctor |
| Admin CRUD + audit | done and verified | `test_admin_availability_crud_writes_audit_entries` |
| RBAC 401/403 | done and verified | `test_admin_views_require_admin` |
| Seed data | partial (to verify on dev DB) | `demo_seed.py` adds past/future rows, receptionist hours, doctor leave today |
| Frontend API/types | done | `lib/api/adminViews.ts`, `types/api.ts` |
| Appointments tabs + URL state | done | `validateSearch` `tab` in `routes/admin/appointments.tsx` |
| Sidebar single entry, dashboard link `?tab=queue` | to verify | `routes/admin/index.tsx` link added |
| Staff page list + Working today | done | `routes/admin/staff.tsx` (phone column folded into the profile tab) |
| Staff availability panel | partial | `StaffAvailabilityPanel.tsx`: add/delete only, no edit of existing rule/exception |
| E2E specs | unverified | `e2e/admin-integration.spec.ts` new tests never run |

## Broken or suspicious items

1. Migration 0003 missing FK and single-column indexes (schema drift on the dev DB).
2. `working_today` leave matching bug (`None == None`), effective dates ignored, N+1.
3. `today_status` for staff detail uses the requested range, not today.
4. `in_consultation` status is not limited to today.
5. `/admin/queue?doctor_id=bad` raises an unhandled `ValueError` (500).
6. Existing Check in / Update appointment actions removed from the admin appointments page.
7. Page-level queue summary and Live Queue panel poll under different query keys.
8. No edit form for existing availability rules.
9. `frontend/check-admin.mjs` is an ad-hoc debug script with demo credentials.
   It was moved out of the repository and not committed.

## Plan (remaining work only)

1. Repair migration 0003 in place: add the FK and the indexes, keeping it idempotent. Re-apply it on the
   dev DB by `stamp 0002` + `upgrade` (non-destructive). Add an up/down test for 0003.
2. Fix `working_today`, `today_status`, in-consultation-today and queue param
   validation. Add `upcoming_exceptions` to the staff availability response. Add
   tests (leave isolation, effective dates, upcoming, bad UUID).
3. Restore Check in / Update actions on All Appointments. Share the queue query key
   between the tab label and the panel. Show arrival time for every queue entry.
4. Add edit of existing rules and exceptions in the availability panel.
5. Verify seed on the dev DB, then run the full verification (pytest, lint, tsc, build,
   vitest, Playwright) and the leftovers search. Finish the notes and the PR.
