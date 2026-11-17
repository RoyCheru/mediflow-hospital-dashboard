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
