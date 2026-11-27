# Invoice finalization and payment guard (BIL-16, BIL-17)

Branch: `fix/invoice-finalization-payment-guard`.

**Base branch.** This branch starts from `feature/encounter-billing-workflow`, not
from `main`. The billing code this task changes (doctor-side ordering and
submission, price-list-only lines, the cashier's awaiting-payment view) and the
admin front-desk fixes (row locks, duplicate check) exist only on that unmerged
branch. `main` is at the phase D merge plus three Lovable UI commits. Branching
from `main` would mean re-implementing that work, and `main` still has the
walk-in 500 this branch inherits the fix for.

PRD: BIL-16 and BIL-17 added to `backend/docs/PRD.md` (commit `0156d8d`).

## Status mapping

The stored values are unchanged (no enum migration); the target names map as:

| Target state | Stored `InvoiceStatus` |
|---|---|
| draft | `DRAFT` |
| finalized | `ISSUED` |
| partially_paid | `PARTIALLY_PAID` |
| paid | `PAID` |
| voided | `VOIDED` |
| (refunded after payment; existing, kept) | `REFUNDED` |

## Confirmation (step 1, before any code change)

Evidence comes from `backend/tests/test_invoice_payment_guard.py` (run against the
code as found; each bug test is a strict xfail that fails on its assertion) and a
read-only scan of the dev database (Postgres, revision `0005_encounter_billing`,
run inside a `READ ONLY` transaction).

| Question | Finding | Evidence |
|---|---|---|
| Cash payment against a `draft`? | **Refused** (409 `CONFLICT`, "Finalize the encounter bill…"). Not a shared guard: an inline check | `billing/service.py:1000` (`record_payment`); `test_draft_invoice_refuses_cash_stk_and_claims_today` passes |
| Cash payment when the visit is not completed? | **Allowed**: nothing checks the visit. A finalized invoice of an open visit takes cash (201) | `test_no_cash_payment_while_the_visit_is_open`: `assert 201 == 409` |
| M-Pesa STK push for a draft? | Refused (409), inline check | `billing/service.py:1103` |
| STK push when the visit is not completed? | **Allowed** (201) | `test_no_stk_push_while_the_visit_is_open` |
| SHA claim for a draft? | Refused (409), inline check before the row lock | `claims/service.py:432` |
| SHA claim when the visit is not completed? | **Allowed** (201) | `test_no_sha_claim_while_the_visit_is_open` |
| Payer allocation (SHA/insurance split) on a draft? | **Allowed** (201): only voided/refunded are refused | `billing/service.py` `add_allocation`; `test_payer_allocation_is_refused_on_a_draft` |
| Error code | Generic `CONFLICT`, no `INVOICE_NOT_PAYABLE` | `test_rejections_use_the_invoice_not_payable_code`: `'CONFLICT' == 'INVOICE_NOT_PAYABLE'` |
| Direct finalize endpoint for cashier/reception/admin? | **Yes, three**: `POST /invoices/:id/finalize` (reception, cashier, admin; works on a draft of an **open** visit, 200), `POST /visits/:id/invoices/finalize` (doctor, reception, cashier, admin), and the deprecated `POST /visits/:id/invoices` (reception, cashier, admin) | `billing/routes.py:121`, `:102`, `:79`; `test_billing_roles_cannot_finalize_*` (`200 == 403`) |
| UI finalize actions | Reception billing **Ready to bill → Finalize draft** (`ReadyToBillPanel`), **Finalize** in `InvoiceCheckout` for drafts, and the doctor's **Submit bill for payment** (a second call after completion) | `frontend/src/components/billing/ReadyToBillPanel.tsx`, `InvoiceCheckout.tsx`, `components/doctor/EncounterBillPanel.tsx` |
| When is an invoice finalized today? Tied to completion? Atomic? | By an explicit finalize call. Completing the visit leaves the invoice `DRAFT`; the doctor's UI then makes a **separate** finalize request, so the two are not atomic (completion can succeed while finalization fails) | `clinical_records/service.py:237` (`complete_visit` never touches the invoice); `test_completing_the_visit_finalizes_the_invoice` (`DRAFT == ISSUED`) |
| Invoice number at draft or finalization? | At finalization (`finalize_invoice`, `billing/service.py:543`, via the locked `number_sequences` row, `common/sequences.py:7`). Drafts have none | `test_check_in_creates_one_numberless_draft` |
| Finalized invoices still editable? | Lines: no (409). **Totals: yes**: a discount below the approval threshold is applied straight to a finalized invoice (`APPLIED`, total reduced) | `billing/service.py:792`; `test_a_discount_cannot_change_a_finalized_invoice_without_approval` (`'APPLIED' == 'PENDING_APPROVAL'`) |
| Prices snapshotted at finalization? | Line prices are captured when the line is added; finalization recomputes totals from those lines but does not refresh them to the price list in force at finalization | `billing/service.py:543` |
| Cancelled / no-show appointments | A checked-in or in-consultation appointment can be cancelled (and a checked-in one marked no-show); its **draft stays open** | `scheduling/service.py:806` (`transition`); `test_cancelling_a_checked_in_appointment_voids_its_draft` (`DRAFT == VOIDED`) |
| M-Pesa callback for a non-payable invoice | Voided/refunded: recorded as an `UNCONFIRMED` transaction, the intent goes to the reconciliation queue, admins are alerted and the callback is audit-logged (phase A). A **draft** or an open visit is not checked by `_callback_problem` (`billing/service.py:1167`) | `test_mpesa_callback_after_void_is_parked_for_reconciliation` |
| Rejected payment attempts audited? | **No** | `test_rejected_payment_attempts_are_audited` |

### Payment paths and their checks

| Path | Entry point | Check as found |
|---|---|---|
| Cash / card / bank | `POST /invoices/:id/transactions` → `record_payment` | inline: draft, voided/refunded, settled |
| M-Pesa initiate | `POST /invoices/:id/payment-intents` → `create_payment_intent` | inline: draft, settled |
| M-Pesa callback | `POST /webhooks/mpesa/daraja` → `handle_mpesa_callback` | `_callback_problem`: voided/refunded, amount, balance (not draft, not visit) |
| Paybill / Till capture (BIL-15) | **none implemented** | n/a |
| SHA claim create | `POST /invoices/:id/claims` → `create_claim` | inline: draft, voided, paid (not refunded, not visit; before the lock) |
| SHA claim resubmit | `POST /claims/:id/resubmissions` → `resubmit_claim` | voided only |
| SHA settlement (claim paid) | `transition_claim` → `_settle_claim` | none |
| Payer allocation | `POST /invoices/:id/allocations` → `add_allocation` | voided/refunded only |
| Reconciliation: accept parked transaction | `POST /billing/transactions/:id/resolve` → `resolve_transaction` | inline: draft/voided/refunded, balance |
| Reconciliation: accept pending intent | `POST /billing/payment-intents/:id/resolve` → `resolve_payment_intent` | inline: draft/voided/refunded |
| Void / refund | void and refund request/decision | own rules (void refused while money or open claims remain) |

**No single shared guard exists**: every path has its own partial check and none
checks visit completion.

### Existing data that violates the rules (dev database, read-only)

Invoices by status: `ISSUED` 8, `PAID` 10 (no drafts).

| Check | Rows |
|---|---|
| Successful payments on `DRAFT` invoices | 0 |
| Successful payments where the visit is not completed | 0 |
| Finalized/paid invoices whose visit is not completed | 0 |
| **Finalized invoice with an appointment but no visit** | **1: `INV-2026-000018`, `ISSUED`, appointment `CHECKED_IN` (patient never seen, invoice payable)** |
| Open drafts on cancelled / no-show appointments | 0 |
| Non-draft invoices without a number | 0 |
| SHA claims or payment intents on drafts | 0 |

`INV-2026-000018` is reported, not changed. It will be refused by the new guard
and listed by the violations report.

## What was fixed (step 2 and 3)

### One payment guard (BIL-16)

`backend/app/billing/lifecycle.py`:

- `payable_problem(invoice)` / `ensure_payable(invoice, action)` is the single
  rule. An invoice is payable only when it is `ISSUED` (finalized) or
  `PARTIALLY_PAID` **and** the encounter's visit is completed. An invoice tied
  to an appointment whose patient was never seen (no visit) is not payable. An
  invoice with no encounter at all (historical/manual rows) is payable once
  finalized.
- Violations raise `InvoiceNotPayable`: **409 `INVOICE_NOT_PAYABLE`** with
  `invoice_id`, `invoice_status` and the attempted `action` in `details`. The
  error handler rolls the request back, then writes an
  `invoice.payment_rejected` audit entry (actor, invoice, action, reason). The
  rollback comes first so nothing half-done is committed with the audit entry
  (for example an idempotency record).
- Role violations stay **403** from the route/service role checks.

Every payment path now calls it:

| Path | Where |
|---|---|
| Cash / card / bank | `record_payment` |
| M-Pesa initiate | `create_payment_intent` |
| M-Pesa callback | `_callback_problem` → not payable means the money is **recorded as `UNCONFIRMED`**, the intent goes to the reconciliation queue, admins are alerted and the callback is audit-logged (never dropped, never applied) |
| SHA claim create | `create_claim` (before the eligibility call and again under the row lock) |
| SHA claim resubmit | `resubmit_claim` |
| SHA settlement | `_settle_claim` |
| Payer allocation | `add_allocation` |
| Reconciliation accept (transaction / intent) | `resolve_transaction`, `resolve_payment_intent` (message adds "return the money to the payer and resolve it as failed") |
| Paybill/Till capture | not implemented (BIL-15); when added it must call `ensure_payable` |
| Void / refund | own rules, unchanged (void refused while money or open claims remain) |

### State machine

`set_invoice_status` is now the only way invoice status changes
(`finalize_invoice`, `recompute_invoice`, void approval, draft voiding). Allowed:

| From | To |
|---|---|
| `DRAFT` | `ISSUED`, `VOIDED` |
| `ISSUED` | `PARTIALLY_PAID`, `PAID`, `REFUNDED`, `VOIDED` |
| `PARTIALLY_PAID` | `ISSUED`, `PAID`, `REFUNDED` |
| `PAID` | `PARTIALLY_PAID`, `REFUNDED` |
| `REFUNDED` | `VOIDED` |
| `VOIDED` | (none) |

Anything else is a 409 `INVALID_INVOICE_TRANSITION`. Payment states move both
ways because refunds lower the amount paid.

Database constraints (migration `0006_invoice_number_checks`, reversible, also in
the model so tests enforce them): `ck_invoices_number_when_final` (a non-draft,
non-voided invoice has a number) and `ck_invoices_draft_has_no_number`. A
constraint that payments reference only non-draft invoices would need a trigger
across tables; it is enforced by the guard instead (not practical as a check
constraint). The migration refuses to run, and changes nothing, if existing rows
violate it, pointing to `flask invoice-violations`.

### Finalization only on visit completion (BIL-17)

- `complete_encounter(visit, actor, reason=None)`
  (`clinical_records/service.py`) is the one transaction. It completes the visit,
  moves the appointment to `COMPLETED`, snapshots prices, assigns the number and
  finalizes the invoice, then commits once. On any failure everything rolls back.
  `transition()` gained `commit=False` for this; it used to commit on its own,
  which the atomicity test caught.
- **Idempotent**: completing again does nothing to a finalized bill (same number,
  one `invoice.finalize` audit). For a completed visit whose bill is still a draft
  (legacy data) it finalizes it.
- The doctor's `POST /visits/:id/complete` uses it and now returns the visit
  **with its invoice**.
- **Direct finalize removed for every role**: `POST /invoices/:id/finalize`,
  `POST /visits/:id/invoices/finalize` and the deprecated `POST /visits/:id/invoices`
  now answer **403** ("Invoices are finalized only by completing the visit…") for
  all roles, the doctor included. The paths are kept so old clients get a clear
  error, not a 404.
- **Admin force-complete**: `POST /admin/visits/:id/force-complete` (admin only)
  with a mandatory `reason` (at least 10 characters) runs the same
  `complete_encounter` and writes `visit.force_complete` (actor, visit, reason,
  invoice number). It also serves as the **reissue after a void**: a completed
  visit whose bill was voided gets a new finalized invoice with a new number. It
  refuses (409) when the visit is completed and already has a finalized bill.

### Numbering and price snapshot

- Numbers are reserved from the locked `number_sequences` row **inside** the
  completion transaction, so a failed completion rolls the number back: no gaps,
  no duplicates. Tested sequentially and with six concurrent completions on
  Postgres.
- Drafts have no number (the API shows them as "Draft"; the UI shows
  "Awaiting visit completion").
- At finalization each service line is re-priced at the price list **in force at
  that moment** (`_snapshot_line_prices`); afterwards the invoice keeps its own
  prices whatever the price list does. A consultation billed at the doctor's fee
  (service without a price) keeps that amount.

### Immutability and adjustments

- Lines can be added or removed only by **the doctor of the encounter, while the
  bill is a draft**. Billing roles get 403 (drafts are read-only for them); any
  edit of a finalized invoice is 409. The booked consultation line cannot be
  removed. The checks live in the service (`assert_can_edit_lines`).
- **Discounts**: a discount on a finalized invoice changes its total, so it is
  now always an approved adjustment. Every discount request waits for approval
  by a different admin (the previous auto-apply below 10% / KES 1,000 is gone,
  and `DISCOUNT_APPROVAL_PERCENT` / `DISCOUNT_APPROVAL_MINOR` were removed). A
  discount on a draft is refused (409).
- Corrections otherwise go through the existing void (admin approval, reason)
  and refund workflows. A voided invoice is never paid. After a full refund the
  invoice can be voided (`REFUNDED → VOIDED`).

### Cancelled and no-show appointments

Cancelling (from checked in or in consultation) or marking a no-show voids the
appointment's open draft (`void_open_draft`, audit `invoice.draft_void`, reason
"Appointment cancelled/no_show"). It is kept, never deleted, and never payable.

### Existing data

`invoice_rule_violations()` (read-only) behind `GET /admin/reports/invoice-violations`
(admin) and `flask invoice-violations`. Rules reported: `payment_on_draft`,
`payment_before_visit_completed`, `payable_before_visit_completed`,
`finalized_without_number`, `open_draft_for_unseen_appointment`. Nothing is changed.

### Seed

The seed now has drafts for today's checked-in patients (and an open visit for
those in consultation), finalized invoices awaiting payment, a partly paid
invoice, paid invoices and a voided invoice (approved void). A test runs
`flask seed` and checks every state is present and the report is empty.

### Frontend

- Drafts appear as **Draft · Awaiting visit completion**, read-only: no Pay via
  SHA, Collect payment, Discount or Finalize. Finalized invoices appear as
  **Finalized · Ready for payment**.
- Removed every Finalize action (reception Ready-to-bill dialog with its line
  editor, the invoice view's Finalize, the doctor's separate Submit call). The
  reception tab is now "Unbilled visits" (legacy drafts and voided bills awaiting
  an admin reissue) and the billing page opens on invoices awaiting payment.
- Doctor: completing the visit finalizes the bill (the response carries it); a
  completed visit with a legacy draft shows "Finalize bill", which repeats the
  idempotent completion.
- Admin: visit detail shows the bill and a **Force-complete visit** action with a
  required reason.
- API errors with `INVOICE_NOT_PAYABLE` show the server's reason.

## Decisions

| Decision | Choice |
|---|---|
| Status names | Kept the stored enum (no migration); mapping in the table above |
| Zero-amount visit | Existing behaviour: a bill with no billable lines finalizes at zero and, with nothing to collect, becomes `PAID` at once |
| Invoices with no encounter (historical/manual) | Payable once finalized |
| Line edits | Doctor of the encounter only, draft only; billing roles read-only |
| Discounts on finalized invoices | Always require approval by a different admin |
| Reissue after void | Admin force-complete with a reason (new number) |
| Direct finalize endpoints | Kept as 403 for every role rather than removed (clear error for old clients) |
| Rejected attempts | 409 `INVOICE_NOT_PAYABLE` + audit after rollback |

## Follow-ups (out of scope)

- **Pre-visit deposits and advance payments**: not supported. Money before
  completion would need its own model (a deposit or credit applied at
  finalization) rather than a payment on a draft.
- Paybill/Till capture (BIL-15) is not implemented; it must use `ensure_payable`.
- `INV-2026-000018` in the dev data (finalized, patient never seen) is listed by
  the violations report and refused by the guard; it needs a person to void it.

## Files changed

Backend:
- **New:** `app/billing/lifecycle.py` (guard, state machine, violations report);
  `migrations/versions/0006_invoice_number_checks.py`.
- **Changed:**
  - `app/billing/service.py` (guard calls, `finalize_encounter_invoice`, price snapshot, line-edit rules, discounts, `void_open_draft`; `create_invoice` / `finalize_visit_invoice` removed);
  - `app/billing/routes.py` (finalize endpoints 403; line routes delegate to the service);
  - `app/billing/models.py` (check constraints);
  - `app/claims/service.py` (guard on claim create/resubmit/settle);
  - `app/clinical_records/service.py` and `routes.py` (`complete_encounter`, `force_complete_visit`, completion returns the invoice);
  - `app/scheduling/service.py` (`transition(commit=False)`, draft void on cancel/no-show);
  - `app/admin/routes.py` (force-complete, violations report);
  - `app/cli.py` (`invoice-violations`);
  - `app/common/errors.py` (audit after rollback for refused actions);
  - `app/common/sequences.py` (race-safe first use);
  - `app/demo_seed.py`;
  - `app/config.py` and `.env.example` (discount thresholds removed).
- **Tests:**
  - new: `test_invoice_payment_guard.py`, `test_invoice_lifecycle.py`, `test_invoice_number_migration.py`;
  - updated: `helpers.py`, `test_billing_amounts.py`, `test_billing_discounts.py`, `test_billing_integrity.py`, `test_billing_phase_d.py`, `test_billing_worklist.py`, `test_encounter_billing.py`, `test_demo_seed.py`.

Frontend:
- **New:** `components/admin/ForceCompleteVisit.tsx`.
- **Removed:** `components/billing/DraftLinesEditor.tsx`.
- **Changed:**
  - `components/billing/{InvoiceCheckout,InvoiceListPanel,ReadyToBillPanel}.tsx`;
  - `components/doctor/EncounterBillPanel.tsx`;
  - `lib/api/{billing,clinical,visits}.ts` (finalize calls removed; `forceCompleteVisit`);
  - `lib/format.ts` (`invoiceStatusHint`);
  - `routes/admin/visits.tsx`, `routes/doctor/consultations.$visitId.tsx`, `routes/receptionist/billing.tsx`;
  - E2E specs `admin-front-desk`, `billing-desk`, `cashier-desk`, `doctor-consultation`.

Database: migration `0006_invoice_number_checks` (run `flask db upgrade`). Your dev
database passes it (no non-draft invoice without a number).

## Verification

| Check | Result |
|---|---|
| Backend `pytest`, SQLite | **360 passed, 2 skipped** (the two Postgres-only tests) |
| Backend `pytest`, Postgres (`MEDIFLOW_TEST_DATABASE_URL`) | guard, lifecycle (incl. the 125-cell matrix and 6-way concurrent numbering), phase D and encounter tests all pass; the concurrent numbering test caught a real race (fixed in `6f9864e`) |
| Confirmation tests (step 1) | all 15 now pass (strict xfail markers removed) |
| Migration `0006` | upgrade → downgrade → upgrade on SQLite (test) and on seeded Postgres; refuses to run over violating rows |
| Seed on Postgres with `0006` | seeds cleanly; `flask invoice-violations` reports none |
| ruff check / format | clean |
| Frontend tsc / eslint / vitest / build | clean / 0 errors (9 pre-existing warnings) / 37 passed / OK |
| Playwright against a Postgres-backed API | **34/34**, no server tracebacks |

## Commits

| Hash | Message |
|---|---|
| `0156d8d` | docs: add BIL-16 and BIL-17 invoice finalization and payment rules |
| `688876e` | test(api): confirm invoice finalization and payment-guard gaps |
| `6f9864e` | fix(api): race-safe first use of a number sequence |
| `6d2f36f` | fix(api): enforce finalized-invoice-only payments (BIL-16, BIL-17) |
| `01d245d` | feat(db): invoice number check constraints (0006) |
| `a2456f0` | feat(seed): cover every invoice state as the live workflow would |
| `45e5075` | feat(web): drafts read-only; no finalize actions; admin force-complete |
| `1310d28` | test(web): E2E for finalized-only payment and force-complete |

Note on "tests before each commit": the suite was run green on the final tree and
on the step-1 commit. The intermediate commits were made afterwards from that
verified tree, so they were not each re-run in isolation.

## Follow-up fix: admin Billing page offered "Record payment" on drafts

Reported after delivery: an admin could still start recording a payment on a
non-finalized invoice. The server never accepted one (dev data: no payments that
day, no `invoice.payment_rejected` entries; the guard returns 409
`INVOICE_NOT_PAYABLE` for admins, covered by the matrix). The gap was in the
screens: the admin **Billing** page has its own invoice view and payment form
(not the shared checkout), and enabled **Record payment** whenever the balance
was above zero, which includes drafts. The patient invoices page hid Pay only
for drafts, so a voided invoice with a balance still offered an M-Pesa push.

Fix: a shared `isPayableStatus()` (finalized or partially paid, mirroring the
server guard) gates both pages; the admin page shows why payment is unavailable
("Awaiting visit completion: payments open when the doctor completes the
visit"). New E2E `admin cannot record a payment on a draft invoice` checks the
API refusal (409 `INVOICE_NOT_PAYABLE`) and the disabled button; it fails
without the fix and passes with it (Postgres-backed API).
