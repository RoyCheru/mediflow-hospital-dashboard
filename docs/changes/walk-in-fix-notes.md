# Walk-in / Appointment Model Fix — Discovery and Decisions

Branch: `fix/walk-in-appointment-model`
PRD: `backend/docs/PRD.md` (revised APT-5, APT-6, APT-7, EMR-5, section 6.1 and section 9).

## Branch base decision

The task asks for a branch from the default branch. The default branch (`main`) does not contain the admin integration or the typed frontend API client that this task explicitly references (`lib/api`, admin appointments table, dashboard schedule). Branching from `main` would remove working code and make the frontend deliverables impossible without merging another feature branch, which the working rules forbid.

Decision: branch from `feat/admin-integration` (the parent feature branch, already pushed). This keeps the repository history intact and lets the appointment fixes apply to the actual current code. No merge, rebase or force-push was used.

## Current appointment model

| Concern | Current code |
| --- | --- |
| Model | `backend/app/scheduling/models.py` → `Appointment` |
| Slot columns | `scheduled_start` and `scheduled_end`; both `nullable=False` |
| Arrival | `checked_in_at` only; no `arrived_at` |
| Source | `backend/app/common/enums.py` → `AppointmentSource(ONLINE, RECEPTION, WALK_IN)` |
| Source storage | SQLAlchemy `Enum(..., native_enum=False, length=16)` → `VARCHAR`, no Postgres ENUM type |
| Status | `AppointmentStatus(SCHEDULED, CHECKED_IN, IN_CONSULTATION, COMPLETED, NO_SHOW, CANCELLED)` |
| Follow-up link | none; `Visit.follow_up_date` only |
| Walk-in creation | `POST /appointments/walk-in` fakes `scheduled_start = now + 1 minute` and creates `CHECKED_IN` |
| Follow-up creation | `POST /visits/<id>/follow-up` creates `source=RECEPTION`, allows doctor/reception/admin |
| Check-in | `transition(CHECKED_IN)` sets `checked_in_at` only |
| Queue | `scheduling.service.queue()` filters `scheduled_start` for today, includes `SCHEDULED`, sorts urgency then `scheduled_start` |
| Reminders | `notifications.service.queue_event_notifications()` reads `appointment.scheduled_start` without null guard |
| No-show scoring | `ai_assistance.service.no_show_score()` counts all appointments |
| No-show report | `analytics.service.no_show_report()` uses all appointments as denominator |
| Doctor workload | `analytics.service.doctor_workload()` filters by `scheduled_start` |
| Admin today schedule | `admin.service._today_schedule()` filters by `scheduled_start`; dashboard stat also uses `scheduled_start` |
| Seed | `app/demo_seed.py` and `app/cli.py` set source online/reception/walk-in and slots on every row |
| Tests | `tests/test_scheduling.py`, helpers, plus admin/analytics tests |
| Frontend types | `src/types/api.ts`; mock types in `src/lib/data.ts` and `src/lib/doctor-data.ts` |
| Frontend API | `src/lib/api/management.ts` (`createWalkIn`) |
| Frontend displays | admin appointments table, admin dashboard schedule, admin dashboard stat, filters/badges |

## PRD vs code discrepancies

1. **Walk-ins have a synthetic slot.** The code sets `scheduled_start = now + 1 minute`. PRD says walk-in slot is empty/null. Follow PRD.
2. **No arrival timestamp.** The code only has `checked_in_at`. PRD adds `arrived_at`. Add it; keep `checked_in_at` for booked check-in history.
3. **`follow-up` source missing.** Add `FOLLOW_UP` to the source enum. Because the column is `VARCHAR` (not a Postgres enum), no `ALTER TYPE` is required; the migration will also replace any legacy source check constraint.
4. **Follow-ups are recorded as reception.** Visit follow-up currently uses `source=RECEPTION`. Change to `FOLLOW_UP`.
5. **Follow-up authorization includes reception.** PRD says a doctor (or admin) creates follow-ups. Remove reception.
6. **Queue includes scheduled bookings and excludes walk-ins with null slots.** Change to checked-in/in-consultation only, with booked rows ordered by slot and walk-ins by arrival.
7. **No-show logic includes walk-ins.** Walk-ins cannot no-show; exclude them from marking and scoring/reporting.
8. **Reminders assume non-null slot.** Guard on `scheduled_start` and `status=SCHEDULED`; skip walk-ins.
9. **Date filters assume slot.** Admin appointment date filter, dashboard schedule/stat, and workload reports must use `scheduled_start` for booked rows and `arrived_at` for walk-ins.
10. **No DB constraints for source/status/slot combinations.** Add check constraints in the model and migration.

## Implemented changes

### Data model and migration

- Make `scheduled_start` and `scheduled_end` nullable.
- Add `arrived_at` (timezone-aware, nullable).
- Add `follow_up_of_visit_id` (nullable UUID reference to `visits.id`) — decided yes. It is stored without a database foreign key because `visits.appointment_id` and this column form a DDL cycle that SQLite cannot sort reliably; the service sets it and the id is validated by use.
- Add `FOLLOW_UP = "FOLLOW_UP"` to `AppointmentSource`.
- Add check constraints:
  - `ck_appointments_walk_in_arrived`: `source <> 'WALK_IN' OR (arrived_at IS NOT NULL AND status <> 'SCHEDULED')`
  - `ck_appointments_booked_slot`: `source = 'WALK_IN' OR (scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL)`
  - `ck_appointments_source_values`: source in the four values.
- New Alembic revision `0002_walk_in_appointment_model`.
  - Add columns; no DB FK is created for `follow_up_of_visit_id` (see decision above).
  - Backfill `arrived_at = COALESCE(checked_in_at, created_at)` for checked-in/in-consultation/completed rows.
  - Validate walk-in and booked rows; raise a clear error listing violating IDs rather than forcing constraints.
  - Upgrade is batch-safe for SQLite and plain ALTER for Postgres; legacy source check constraints are dropped on Postgres before adding the new one.
  - Downgrade converts `FOLLOW_UP` rows to `RECEPTION`, synthesizes slots for walk-ins from `arrived_at`/`created_at` before restoring `NOT NULL`, then removes the new columns/constraints. This keeps the downgrade functional without deleting rows; the synthesized slot is documented as a downgrade-only representation of an old schema.

### Backend behavior

- `create_appointment` handles walk-ins: no slot calculation/free-slot check, `status=CHECKED_IN`, `arrived_at=now`, `checked_in_at=now`. Booked rows keep current slot validation.
- New transactional walk-in service that finds an existing patient or registers a new one (reusing `patients.service.register_patient` without committing), creates the appointment without committing, rolls back the whole unit on any error, and returns the queue position.
- Walk-in endpoint schema accepts `patient_id` or new-patient fields. Receptionist/admin only.
- Follow-up endpoint sets `source=FOLLOW_UP`, `follow_up_of_visit_id=visit.id`; doctor/admin only.
- Check-in sets both `checked_in_at` and `arrived_at`.
- Queue service is the single ordering source: checked-in/in-consultation today; urgent first; effective time is slot for booked, arrival for walk-ins; ties by arrival then id.
- No-show marking rejects walk-ins; no-show scoring/report excludes walk-ins.
- Reminders only for rows with a slot and status `SCHEDULED`; skip walk-ins.
- Admin dashboard schedule/stat, appointment list date filters/sorting, and doctor workload use effective time.
- Audit entries include source for walk-in/check-in/follow-up.
- Seed covers all four sources, walk-in null slots + arrival, urgent flags, and mixed queues.

### Frontend

- Extend `AppointmentSource` with `FOLLOW_UP`; `scheduled_start`/`scheduled_end` nullable; add `arrived_at`, `follow_up_of_visit_id`, optional `queue_position`.
- Add a display helper for appointment time: booked → date/time; walk-in → `Walk-in · arrived HH:mm`.
- Add follow-up to source filter/badges.
- Admin appointments table and dashboard schedule use the helper; walk-in rows remain visually distinct.
- Admin walk-in form supports existing patient or new patient in one submit.
- Update mock type unions in `data.ts`/`doctor-data.ts` so no source union is missing `FOLLOW_UP`.

## Decisions

- Queue tie-breaker: `(urgency_rank, effective_time, arrived_at or created_at, id)`.
- Walk-ins are excluded from reminders and no-show logic.
- The existing `checked_in_at` column stays; `arrived_at` is the queue timestamp for everyone.
- `scheduled_start`/`scheduled_end` are the slot columns; no new `slot` column is introduced.

## Known gaps to confirm after implementation

- No dedicated receptionist UI page exists; the admin appointments page is the only functional booking screen, so the walk-in form there will be wired to the new endpoint. Doctor/receptionist pages remain scaffolds.
- Any external consumers that assume `scheduled_start` is always non-null must be updated; the repository search covers the monorepo, but integrations outside the repo are out of scope.


## Final implementation summary

### Files touched

Backend:

- `app/common/enums.py` — `AppointmentSource.FOLLOW_UP`.
- `app/scheduling/models.py` — nullable slot columns, `arrived_at`, `follow_up_of_visit_id`, queue index, check constraints.
- `app/scheduling/schemas.py` — walk-in schema accepts existing `patient_id` or nested new-patient payload.
- `app/scheduling/service.py` — walk-in creation/transaction, null-slot handling, queue ordering, check-in arrival, follow-up audit, walk-in no-show guard.
- `app/scheduling/routes.py` — transactional walk-in endpoint response with queue position/duplicates, date filters and effective-time sorting.
- `app/patients/service.py` — `register_patient(commit=False)` for the walk-in transaction.
- `app/clinical_records/routes.py` — follow-ups are doctor/admin only, `source=FOLLOW_UP`, visit link.
- `app/notifications/service.py` — reminders only for booked/scheduled rows with a slot; walk-ins skipped.
- `app/ai_assistance/service.py` — no-show score excludes walk-ins.
- `app/analytics/service.py` — workload uses effective time; no-show report excludes walk-ins.
- `app/admin/service.py` — dashboard schedule/stat include walk-ins by arrival time.
- `app/demo_seed.py` — all four sources, null-slot walk-ins with arrival, urgent priority, mixed queue.
- `migrations/versions/0002_walk_in_appointment_model.py` — idempotent upgrade/downgrade, backfill and validation.
- `tests/test_walk_in_appointments.py`, `tests/test_walk_in_migration.py`, `tests/test_scheduling.py` — new coverage and updated queue expectations.

Frontend:

- `src/types/api.ts`, `src/lib/data.ts`, `src/lib/doctor-data.ts` — `FOLLOW_UP`, nullable slots, arrival/link fields.
- `src/lib/format.ts` — appointment time labels for booked vs walk-in rows.
- `src/lib/api/management.ts` — typed walk-in response with queue position and duplicates.
- `src/routes/admin/appointments.tsx` — follow-up filter, null-slot display, walk-in new/existing patient form, queue position feedback, walk-in no-show hidden.
- `src/routes/admin/index.tsx` — dashboard schedule handles walk-ins and arrival time.
- `e2e/admin-integration.spec.ts` — walk-in null-slot rendering E2E test.

### Verification

- Backend: `ruff check app tests`, `ruff format --check app tests`, `.venv/bin/pytest` — **58 passed**.
- Migration: fresh SQLite upgrade → seed → downgrade → upgrade; legacy-schema upgrade/downgrade test; refusal test for unfixable walk-in rows.
- Frontend: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (14 passed).
- Playwright: **5 passed** including the walk-in arrival/null-slot rendering test.
- Seed now produces all four sources, walk-in rows with empty slots and `arrived_at`, and urgent walk-ins in the queue.

### Legacy data remediation encountered

The development PostgreSQL database contained legacy walk-in rows that blocked
the new constraints. On review:

- A cancelled walk-in with `checked_in_at` was backfilled using that existing
  timestamp (`arrived_at = checked_in_at`); no arrival time was invented.
- A no-show walk-in had no `checked_in_at`. Under the new model a walk-in cannot
  no-show, so its `source` was reclassified to `RECEPTION` while preserving the
  status, synthetic slot and notes. The change was written to the audit log as
  `appointment.legacy_source_fix`.

The migration still refuses any other unfixable walk-in row and lists its ID.
Apply with `flask db upgrade`.

### Assumptions and known gaps

- `scheduled_start`/`scheduled_end` are treated as the PRD's "slot" columns; no new `slot` column was introduced.
- Walk-ins cannot be marked no-show and are excluded from no-show scoring/reporting.
- No receptionist UI page exists yet, so the admin appointment screen contains the functional walk-in form. Doctor/receptionist pages remain scaffolds.
- The follow-up link is a UUID reference, not a DB foreign key, to avoid the existing `visits.appointment_id` DDL cycle.
- Downgrade converts `FOLLOW_UP` rows to `RECEPTION` and gives walk-ins a synthetic 30-minute slot because the old schema cannot represent a null slot. This is documented as downgrade-only behavior; no rows are deleted.
