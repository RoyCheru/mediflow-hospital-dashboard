# Phase E plan: the patient journey in the UI

**Status:** approved 2026-11-19 with all recommended decisions (see below). Not started.
**Written:** 2026-11-19, after phase D (`feature/billing-phase-d`, `d82243e`).
**Goal:** a receptionist, a doctor and a cashier can take a patient from arrival to a
paid invoice in their own screens, with no API calls made by hand.

## Numbering

The audit plan (`patient-billing-flow-audit.md`, decision 5) used "phase E" for
charge capture and the coverage model (S2/S3). That work was never approved. It is
now **phase F**, and the old phase F (credit notes, ledger, inpatient billing) is
**later**. Phase E is this plan.

## Where things stand

Phases A–D built the backend for the whole journey. These steps have no working
screen for the role that should do them:

| Step | Who | Backend | UI today |
|---|---|---|---|
| Search and register patients | Reception | `GET/POST /patients`, `GET /patients/duplicates` | Admin Patients page only; `/receptionist/patients` is a placeholder |
| Check-in, walk-in, queue with payer badge | Reception | `POST /appointments/:id/check-in`, `POST /appointments/walk-in`, `GET /queue` | Admin Appointments and Live Queue only; `/receptionist/queue` is a placeholder |
| Start, document and complete a visit | Doctor | `POST /appointments/:id/visits`, `PATCH /visits/:id`, `POST /visits/:id/prescriptions`, `POST /visits/:id/complete` | None. `/doctor/queue` and `/doctor/consultations` are placeholders; the doctor dashboard shows static sample data |
| Add or remove draft invoice lines | Reception/cashier | `POST/DELETE /invoices/:id/lines` | API client functions exist; no button calls them |
| Cash reconciliation | Cashier | `GET /billing/cash-summary`, `GET/POST /billing/cash-reconciliations`, `GET /billing/reconciliation`, `POST /billing/transactions/:id/resolve` | Placeholder |
| Refund and void requests | Cashier | `POST /transactions/:id/refund-requests`, `POST /invoices/:id/void-requests`, `GET /billing/refunds`, `GET /billing/void-requests` | Placeholder (admin approval works) |

The doctor gap is the one that breaks the journey: without it, nothing in the UI
moves a patient from the queue to the billing desk. The billing-desk end-to-end
tests complete visits through the API for this reason.

### Backend gaps found while planning

1. **`GET /queue` uses the server's date.** It calls `date.today()`
   (`backend/app/scheduling/routes.py:444`) instead of `hospital_today()`, unlike
   the admin queue and phase A6. Around midnight, or on a server not on Nairobi time,
   reception and doctors would see the wrong day's queue.
2. **The queue does not say which visit is open.** Queue rows have no `visit_id`,
   and `POST /appointments/:id/visits` returns 409 when a visit exists. A doctor who
   reloads mid-consultation has no way back into the visit.
3. **Starting straight from `SCHEDULED` skips the SHA check.** `create_visit` can
   move a booked appointment through `CHECKED_IN` itself. That creates the draft bill
   (the hook is in `transition()`), but eligibility only runs in the check-in and
   walk-in routes, so the payer badge stays empty. See decision 1.

## Work items

Each item is one or more small commits, pushed as it lands.

### E1. Backend prerequisites

- `GET /queue` uses `hospital_today()` and rejects a bad `date` with 400.
- Queue and appointment rows include `visit_id` (and `visit_completed_at`) when a
  visit exists.
- Decision 1: `create_visit` runs `ensure_check_in_eligibility` when it checks the
  patient in itself. A failed or timed-out check never blocks the consultation.
- Tests: hospital-day queue across midnight, `visit_id` in the payload, and the
  chosen decision-1 behaviour.

### E2. Shared front-desk components

The admin pages already have a live queue with payer badges, appointment rows with
check-in, walk-in booking and patient registration. They are moved into shared
components (`src/components/frontdesk/`) and used by both admin and reception. They
are not copied.

- `QueueBoard`: grouped by doctor, payer badge and co-pay, auto-refresh. It reads
  `GET /queue` for reception and doctors, and `GET /admin/queue` for admin.
- `CheckInList`: today's booked appointments with a Check in button.
- `WalkInDialog` and `PatientRegisterDialog` (with the duplicate check).
- Admin pages keep working unchanged; the existing admin E2E tests guard this.

### E3. Reception screens

- `/receptionist/patients`: search by name, patient number or phone; register a
  new patient with SHA and insurance details; duplicate warning before saving.
- `/receptionist/queue`: today's check-ins, walk-in button, live queue with payer
  badges (`SHA · Active`, `SHA · Inactive`, `SHA · Unverified`, insurer, `Cash`)
  and estimated co-pay.

### E4. Doctor queue and consultation

- `/doctor/queue`: the doctor's own queue for today, in queue order. Each row has
  **Start consultation** (creates the visit) or **Resume** (when `visit_id` is set).
- `/doctor/consultations/$visitId`: the visit workspace.
  - Patient banner: name, number, age, allergies, payer badge.
  - Presenting complaint, vitals, notes, diagnosis and plan, saved with
    `PATCH /visits/:id` (explicit Save plus a "saved" indicator; no silent autosave
    of clinical text).
  - Prescriptions list and add form.
  - **Complete visit** with a confirm step. After completion, fields can still be
    edited and the change is audited, as in phase B.
- `/doctor/consultations`: today's and recent visits for this doctor, linking to
  the workspace. This needs a doctor-scoped visit list: either
  `GET /visits?doctor=me` (new) or reuse of the admin list with a doctor filter.
- Doctor dashboard: the static sample data is replaced with live counts (today's
  queue, open visits, completed today). Charts stay for later.

### E5. Draft line editing at the billing desk

- In the checkout for a `DRAFT` invoice: list lines, **Add line** (pick a service;
  the price comes from the price list) and **Remove** per line.
- The draft total updates; once finalized, the controls disappear.
- No new backend work.

### E6. Cashier reconciliation and refunds

- `/cashier/reconciliation`: today's expected cash from the cash summary, enter the
  counted amount, see the variance, save the reconciliation. A second panel lists
  `UNCONFIRMED` M-Pesa transactions with **Resolve**.
- `/cashier/refunds`: request a refund on a transaction or a void on an invoice
  (reason required). The lists show request status: pending, approved or rejected.
  Approval stays with admin.

### E7. End-to-end journey test

One Playwright test that uses only the UI:
reception registers a patient and books a walk-in → payer badge shows → the doctor
starts, documents and completes the visit → the visit shows in Ready to bill →
the desk adds a line, finalizes and takes cash → the invoice is `PAID` and the cash
shows in the reconciliation total.

## Suggested order

E1 → E4 → E7 (first version: walk-in through the admin page, doctor in the new
screens, billing desk) → E2 → E3 → E5 → E6 → E7 (full version).

The doctor work comes first because it closes the break in the journey. Every
later step can then be checked with the real flow.

## Decisions needed

1. **Doctor starts a booked appointment that reception never checked in.** The
   backend allows it today. Options: allow it and run the SHA check at that point
   (recommended: patients do walk straight in), or refuse it until reception checks
   them in. **Decided: allow it and run the SHA check.**
2. **Doctor dashboard.** It shows static sample data. Replace it with live
   data in this phase (today's queue count, open visits, completed today), or
   leave it for later? Recommended: replace the counts, leave charts for later.
   **Decided: live counts now, charts later.**
3. **Other placeholders.** The receptionist and cashier dashboards, the
   receptionist claims page, and the doctor appointments, patients, availability,
   reports and AI pages are not in this plan. Confirm that they stay out.
   **Decided: they stay out.**
4. **Branching.** Start phase E from `main` after the phase D pull request is
   merged (recommended), or stack it on `feature/billing-phase-d`.
   **Decided: branch from `main` after the phase D merge.**

## Not in scope

- Charging for prescriptions, lab or imaging orders (phase F, S2).
- The coverage and payer-plan model (phase F, S3).
- Changes to how invoices, claims or payments behave: phase E uses the existing API.

## Verification for each item

pytest and ruff for backend changes; eslint, tsc, `vite build` and vitest for the
frontend; Playwright on an idle machine. Notes go into
`docs/changes/billing-rcm-notes.md` (or a new `journey-ui-notes.md`) with commit
hashes, as in phases A–D.

Project rules that apply: keep top-bar notifications, demo conversations and
profile controls in the shared `TopBarActions` component; never rewrite pushed
history (Lovable sync).
