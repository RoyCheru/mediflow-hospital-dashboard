# Phase E: patient journey in the UI (progress notes)

Plan: `docs/billing/phase-e-journey-ui-plan.md` (approved 2026-11-19 with all
recommended decisions). Branch: `feature/journey-ui-phase-e`, from `main` at
`823d922` (phase D merged).

## Status

| Item | State |
|---|---|
| E1 Backend prerequisites | done |
| E4 Doctor queue, consultation, consultations list, dashboard counts | done |
| E7 Journey test, first version (walk-in by API, doctor in the UI) | done (`e2e/doctor-consultation.spec.ts`) |
| E2 Shared front-desk components | not started |
| E3 Reception screens | not started |
| E5 Draft line editing at the desk | not started |
| E6 Cashier reconciliation and refunds | not started |
| E7 Full journey test (UI only) | not started |

## E1: backend prerequisites

| Change | Commit | Tests |
|---|---|---|
| `GET /queue` defaults to the hospital day (was the server's `date.today()`); bad `date` returns 400 | `6ec9ca1`, `98b47fa` (format) | `test_queue_api.py` |
| `GET /queue` and `GET /appointments/:id` include `visit_id` and `visit_completed_at` (one batched query) | `9f2d293` | `test_queue_and_appointment_expose_the_open_visit` |
| Decision 1: a doctor starting a `SCHEDULED` appointment also runs the check-in SHA check after the visit is committed; failures are stored as `UNKNOWN` and never block; checked-in patients are not re-checked | `72ca070` | `test_billing_eligibility_check_in.py` (3 new tests) |
| Found while building the queue page: `GET /appointments?date=` filtered on the UTC day; now the hospital day, bad date returns 400 | `32da0f4` | `test_appointment_list_date_filter_uses_the_hospital_day` |

Each new test was confirmed to fail without its fix.

## E4: doctor screens

| Change | Commit |
|---|---|
| `GET /visits/mine` (doctor only, no clinical text, `completed` and `date` filters) | `ef397fd` |
| `GET /appointments/:id` returns `payer`/`copay_due_minor` to staff (not to patients) | `8eb7918` |
| Doctors land on `/doctor` after sign-in (they were sent to `/unauthorized`); `/doctor` is role-gated; clinical API client; `PayerBadge` | `43b805e` |
| `/doctor/queue` (Start/Resume, booked-not-checked-in list) and `/doctor/consultations/$visitId` (vitals, notes, diagnosis, plan, prescriptions, Complete visit) | `9c86bf2` |
| Decision 2: dashboard greeting, stat cards, today's queue and recent consultations are live; remaining panels labelled "Sample data" | `e7abfb9` |
| `/doctor/consultations` list with filters and pagination | `6209c02` |

Design choices:
- Clinical text is saved with an explicit **Save** (with an "Unsaved changes" /
  "Saved HH:MM" indicator), not silent autosave. **Complete visit** asks for
  confirmation and saves pending changes first.
- A completed visit stays editable; the phase B audit entry records the edit.
- Seeded appointments in `IN_CONSULTATION` without a visit show **Start
  consultation**, which creates the visit (the backend allows it).

### Commit-history note

`43b805e` contains the rename `consultations.tsx → consultations.index.tsx`
(staged earlier by `git mv`), while the matching `routeTree.gen.ts` landed in
`9c86bf2`. `43b805e` on its own therefore does not build; the branch tip does.
It is pushed and not rewritten (per `AGENTS.md`).

## Verification (at `6209c02`)

- Backend: full `pytest` green at `72ca070`; the later backend commits ran
  their affected test files (queue, scheduling, walk-in, eligibility, doctor
  visits). ruff check/format clean.
- Frontend: tsc clean, eslint 0 errors (9 pre-existing warnings), vitest 24
  passed, `vite build` OK.
- Playwright: `doctor-consultation.spec.ts` 2/2. The full suite has not been
  re-run on this branch yet.

E2E timing: the first visit to a new route compiles it on the cold dev server
(30 s+), so first navigations allow 90 s, and the sign-in test retries the
whole submit (a pre-hydration click does a native GET submit).
