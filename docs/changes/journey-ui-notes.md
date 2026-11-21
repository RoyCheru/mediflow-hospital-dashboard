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
| E2 Shared front-desk components | done |
| E3 Reception screens | done |
| E5 Draft line editing at the desk | done |
| E6 Cashier reconciliation and refunds | done |
| E7 Full journey test (UI only) | done (`e2e/patient-journey.spec.ts`) |

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

## E2: shared front-desk components

`src/components/frontdesk/`, commit `9ed5a1e`:

| Component | Used by |
|---|---|
| `PatientRegisterDialog` (duplicate check via `/patients/duplicates`, then "Use this patient" or "Register anyway"; SHA number and insurer fields) | admin Patients, reception Patients |
| `PatientPicker` (search by name, number or phone; replaces the 100-patient dropdown) | `BookingDialog` |
| `BookingDialog` (scheduled or walk-in; new walk-in patients now capture SHA/insurance, so the check-in SHA check can run) | admin Appointments, reception Queue and Patients |
| `CheckInList` (`GET /appointments?date=today&status=SCHEDULED`) | reception Queue |
| `QueueBoard` (`GET /queue`, grouped by doctor) | reception Queue |

Form rules and payload shaping are in `lib/patientForm.ts` (unit tested).

**Deviation from the plan:** the plan had one queue board for admin and
reception. The admin Live Queue reads `/admin/queue` and `/admin/staff`, which
reception cannot call, and it shows admin-only data (waiting thresholds,
per-doctor counts). So admin keeps `LiveQueuePanel`, and reception uses the
new `QueueBoard` on the shared `/queue` endpoint. Admin check-in stays in
the All Appointments table.

## E3: reception screens

Commit `8612c04`:
- `/receptionist/patients`: search, register, and Walk-in / Book per patient.
- `/receptionist/queue`: check in booked patients, add walk-ins, book, and
  the live queue with payer badge, co-pay and waiting minutes.
- E2E `e2e/reception-frontdesk.spec.ts` (3 tests): register → duplicate caught
  → walk-in shows `SHA · Active` and co-pay in the queue; check-in from the
  list; admin booking and registration still work through the shared dialogs.

## E5: draft line editing

Commit `92fb3a4`. The Finalize draft dialog lists the draft's lines and
subtotal; while the invoice is `DRAFT` the desk can add a priced service
(quantity; the API sets the price from the price list) or remove a line.
If every line is removed, finalizing re-adds the default consultation line
(existing backend behaviour); the dialog says so.

## E6: cashier reconciliation and refunds

| Change | Commit |
|---|---|
| **Backend guard (found while building the Resolve button):** `resolve_transaction` accepted any transaction as SUCCESS with no checks, which could undo phase A's parking of unsafe M-Pesa callbacks. Now only `UNCONFIRMED` payments can be resolved; accepting is refused (409) on a draft/voided/refunded invoice or above the balance, and the money must be returned and the payment marked failed. A parked payment that fits can still be accepted, once. 3 tests, each failing without the guard. | `b079005` |
| Shared `CashReconciliationPanel` (expected cash by method, counted cash with live variance; a variance needs a note; zero is a valid count; Accept / Mark failed on parked payments; history). The admin Reconciliation tab now uses it, which fixes its business date (it used the UTC date) and adds the resolve actions it lacked. | `730abe3` |
| `/cashier/reconciliation` and `/cashier/refunds` (search payments to request a refund, invoices to request a void, recent requests with status). Admin approval unchanged. | `34d72bd`, `642f17a` (test) |

## E7: full journey test

`e2e/patient-journey.spec.ts` (`1963009`), three browser sessions, no API
shortcuts except sign-in: reception registers a new patient and adds a
walk-in (payer badge `Cash`) → the doctor starts, documents and completes
the visit → the desk adds a lab line, finalizes and takes cash (invoice
`Paid`) → the cashier sees the payment and the day's expected cash includes it.

## Verification (2026-11-21, at `1963009`)

- Backend: **154 passed, 1 skipped** (opt-in Postgres test), run in two halves
  because the machine was loaded; ruff clean.
- Frontend: tsc clean, eslint 0 errors (9 pre-existing warnings), vitest
  **28 passed**, `vite build` OK.
- Playwright: **26/26** (admin 13, billing desk 5, doctor 2, reception 3,
  cashier 3, journey 1), each file with one worker against servers started
  by hand (`PW_NO_WEBSERVER=1`), because a system update made the server
  start exceed Playwright's 120 s limit.
- The backend log showed SQLite "database is locked" errors only during runs
  where Playwright used parallel workers: a limit of the SQLite test database
  (one writer), not the app; single-worker runs logged none. Run the suite
  with `--workers=1` on SQLite.

E2E timing: the first visit to a new route compiles it on the cold dev server
(30 s+), so first navigations allow 90 s, and the sign-in test retries the
whole submit (a pre-hydration click does a native GET submit).
