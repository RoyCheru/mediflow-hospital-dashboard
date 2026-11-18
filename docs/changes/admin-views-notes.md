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

---

# Resume outcome (2026-11-17)

## What was lost or broken, and why

The earlier session stopped before committing anything, so all of its work
existed only in the working tree. It was recovered intact as `wip:` commits.
The items below were wrong in that work and were fixed forward. Nothing was reverted.

| Problem | Cause | Fix commit |
| --- | --- | --- |
| Migration 0003 lacked `user_id → users.id` FK and `ix_availability_*_user_id` | First draft only added the column | `68e8225` (revision repaired in place; dev DB re-applied via `stamp 0002` + `upgrade`) |
| One doctor on leave hid every doctor from "Working today" | `None == None` owner match | `12cf1ae` |
| Rule effective dates ignored by "Working today" | Filtered on weekday only | `12cf1ae` |
| `in_consultation` counted any past day | No date bound | `12cf1ae` |
| Staff detail `today_status` wrong when range excluded today | Used range exceptions | `12cf1ae` |
| `/admin/queue?doctor_id=bad` → 500 | Unvalidated UUID | `12cf1ae` |
| Check in / Update actions missing on admin appointments | Tab rewrite dropped them | `8eb05da` |
| No way to edit an existing rule or time off | Only add/delete UI | `c723f3b` |
| "Upcoming time off" limited to 7-day window | Used range exceptions | `12cf1ae`, `c723f3b` |
| Vacuous `or True` assertion in slot test | Test bug | `9b2224c` |

## Files changed on this branch (since `c993f10`)

Backend: `app/config.py`, `.env.example`, `app/common/time.py` (new),
`app/api/v1.py`, `app/admin/staff_routes.py` (new), `app/admin/staff_service.py`
(new), `app/scheduling/{models,routes,schemas,service}.py`, `app/demo_seed.py`,
`migrations/versions/0003_admin_staff_availability.py` (new),
`tests/test_admin_views.py` (new), `tests/test_admin_availability_migration.py`
(new), `tests/test_walk_in_migration.py` (pins upgrades to 0002).

Frontend: `src/routes/admin/{appointments,staff,index}.tsx`,
`src/components/admin/{AllAppointments,LiveQueuePanel,StaffAvailabilityPanel}.tsx`
(new), `src/lib/api/{adminViews.ts (new),client.ts}`, `src/lib/format.ts`,
`src/lib/format.test.ts` (new), `src/lib/queuePolling.ts` (new),
`src/types/api.ts`, `e2e/admin-integration.spec.ts`, `playwright.config.ts`,
`.env.example`.

## Endpoint → page map

| Endpoint (all under `/api/v1`, admin only) | Used by |
| --- | --- |
| `GET /admin/appointments` | Appointments → All Appointments (`AllAppointments`) |
| `GET /admin/queue` | Appointments → Live Queue (`LiveQueuePanel`) and the tab label count |
| `GET /admin/staff` | Doctors & Staff list, doctor filter dropdowns on both appointment tabs |
| `GET /admin/availability?date=` | Doctors & Staff → "Working today" summary |
| `GET /admin/staff/:user_id/availability?from=&to=` | Staff panel → Availability tab |
| `POST/PATCH/DELETE /admin/staff/:user_id/availability/rules[/:id]` | Staff panel → working hours form/list |
| `POST/PATCH/DELETE /admin/staff/:user_id/availability/exceptions[/:id]` | Staff panel → time off form/list |
| existing `POST /appointments/:id/check-in`, `PATCH /appointments/:id` | All Appointments row actions |

Doctor self-service (`/doctors/me/availability`, `/doctors/me/exceptions`) is
unchanged apart from now writing audit entries too.

## Requirement coverage

| Requirement | Status | Evidence |
| --- | --- | --- |
| APT-8 | done and verified | `test_admin_appointments_filters_pagination_and_nullable_slot`, `..._uses_hospital_timezone_day_boundaries`; E2E "all appointments spans dates…", "walk-in appointments render…" |
| APT-9 | done and verified | `test_admin_queue_orders_today_only_and_groups_by_doctor`; E2E "checked-in walk-in appears on…", "live queue API only returns today's rows…", tab URL survives reload, dashboard link |
| APT-10 | done and verified | `test_admin_availability_*`, `test_working_today_leave_hides_only_that_doctor`, audit before/after asserted; E2E "doctor on leave…", "admin edits existing working hours…" |
| ADM-5 | done and verified | `test_admin_staff_metrics_and_working_today`, `test_staff_availability_today_status_and_upcoming_time_off`; seed gives receptionist Joy Wairimu Mon–Fri 08:00–17:00 |
| RBAC | done and verified | `test_admin_views_require_admin` (401 + 403 for reception/doctor/patient); E2E 403 check |
| Migration up/down | done and verified | `test_admin_availability_migration.py` (SQLite); manual Postgres round trip in an isolated schema |

## Final verification (2026-11-17)

| Check | Baseline | Final |
| --- | --- | --- |
| pytest | 66 passed | 74 passed |
| ruff check / format | clean | clean |
| eslint | 0 errors, 9 warnings | 0 errors, same 9 pre-existing warnings |
| tsc | clean | clean |
| vite build | OK | OK |
| vitest | 14 passed | 19 passed (also passes with `TZ=America/Los_Angeles`) |
| Playwright | not run | 13 passed |

## Decisions

- **Timezone:** `HOSPITAL_TIMEZONE` (default `Africa/Nairobi`) in backend config.
  Every "today" (queue, staff status, working today, date filters) is computed
  on the server with `app/common/time.py`. The frontend only formats
  timestamps, using `VITE_HOSPITAL_TIMEZONE` (same default). API responses also
  carry `timezone`.
- **Polling:** 25 s (`src/lib/queuePolling.ts`). It runs only while the Live Queue tab is
  mounted and the browser tab is focused and visible, and it refetches when focus returns.
- **Waiting threshold:** `QUEUE_WAITING_THRESHOLD_MINUTES` (default 30), returned
  as `waiting_threshold_minutes`. Waiting time is highlighted when it is over the threshold.
- **Staff working-hours model:** reuse `AvailabilityRule`/`AvailabilityException`
  with a nullable `user_id` owner and a check constraint that requires exactly one owner.
  Doctors stay keyed by `doctor_id`, so doctor booking logic is untouched.
- **Migration repair:** 0003 was never merged, so it was repaired in place
  instead of stacking a 0004. It is idempotent. Downgrade **refuses** (exit 1,
  nothing changed) while non-doctor working hours exist, rather than deleting them.
  Flask-Migrate writes the reason only to the app logger.
- **Queue order:** comes only from `scheduling.service.queue()`. The admin
  endpoint numbers positions in the order it receives, and the frontend renders it as is.
- **Status codes:** malformed query parameters → 400 (matches the existing admin
  list endpoints and their tests); invalid JSON bodies → 422 (marshmallow);
  missing auth → 401; wrong role → 403; unknown staff or rule → 404.
- **Live Queue actions:** read-only. Check-in and status updates stay on All Appointments.

## Additional PRD/prompt vs code discrepancies

6. **Frontend framework:** the task prompt says Next.js App Router, while the PRD
   §13 says Next.js. The repository is TanStack Start/Router on Vite (Lovable).
   Followed the code. Tab state uses TanStack `validateSearch` (`?tab=queue`).
7. **Validation status:** the task lists 422. Query-string validation keeps 400 to stay
   consistent with existing endpoints. Body validation is 422.

## Out-of-scope issues noticed (not fixed)

- `GET /claims/aging` raises `TypeError: can't subtract offset-naive and
  offset-aware datetimes` on SQLite (`app/claims/service.py:403`). It appears in
  the Playwright server log. Claims is out of scope.
- The sidebar has static badge numbers (Appointments 6, Billing 5, Claims 4,
  Notifications 3) in `src/lib/navigation.ts`, left over from the original UI scaffold.
- `flask seed` only runs on an empty database. The existing dev DB was seeded before
  this branch, so it does not contain the new past/future appointments,
  receptionist hours or today's doctor leave. To see them, reseed a fresh database. This
  was not done here because it would wipe dev data.
- The demo seed has two urgent walk-ins today (one EMERGENCY, one URGENT), which
  comes from the walk-in branch's seed.

## Assumptions and known gaps

- "Staff" means every non-patient user. `next_available_slot` is computed for doctors
  only, searching 14 days ahead. On `/admin/staff` it costs a few queries per doctor
  row (bounded by page size).
- Staff detail range is capped at 31 days. The calendar shows up to 3 booked slots per
  day, with counts.
- An isolated Postgres schema `migcheck` was created in the dev database for the
  seeded migration check. Remove it with `DROP SCHEMA migcheck CASCADE;` when no longer needed.
- `frontend/check-admin.mjs` (ad-hoc debug script with demo credentials) from
  the earlier session was not committed.
