# Billing Revenue-Cycle Work: Notes

- **Branch:** `feat/billing-revenue-cycle`, stacked on
  `fix/admin-appointments-queue-availability` (approved; `main` lacks the
  billing, admin and walk-in code this builds on).
- **Source:** `docs/billing/patient-billing-flow-audit.md`.
- **Approved scope:** phases A–D of the audit plan. E, F and inpatient billing are out of scope.

## Approved decisions (2026-11-17)

| # | Decision |
|---|---|
| 1 | The consultation charge comes from the service price list. The doctor's consultation fee is only that service's default price |
| 2 | A discount needs admin approval when it is above 10% of the subtotal or above KES 1,000 |
| 3 | An invoice with collected money (or an open claim) cannot be voided until the money is refunded |
| 4 | Editing a visit after completion is allowed, with an audit entry |
| 5 | Stop after phase D |
| 6 | Stacking on `fix/admin-appointments-queue-availability` is acceptable |

## Baseline

The tree at `c3c15cb` is identical to `3acf414` (verified on 2026-11-17):
- pytest 74 passed; ruff clean
- eslint 0 errors (9 pre-existing warnings); tsc clean; build OK
- vitest 19 passed; Playwright 13 passed

## Phase A: Money integrity (done)

| Item | Commit(s) | Tests |
|---|---|---|
| A1 Invoice row lock on every balance check followed by a money write | `78bfdb0`, `99fe172` | `test_invoice_lock_query_uses_select_for_update_on_postgres`, `test_billing_postgres_locking.py` (opt-in, real Postgres) |
| A2 Unsafe M-Pesa callbacks parked as `UNCONFIRMED` (void, amount mismatch, over balance) | `28b3810` | `test_mpesa_callback_*`, `test_second_mpesa_callback_cannot_overpay`, `test_parked_callback_is_idempotent` |
| A3 Void refused while money or open claims remain; re-checked at approval | `0436f4e`, `6110458`, `a478850` (seed) | `test_void_refused_*`, `test_void_approval_rechecks_*` |
| A4 Claims capped at the outstanding balance; one open claim per invoice | `1d1c4ba` | `test_claim_cannot_exceed_balance_*`, `test_second_open_claim_*`, `test_resubmitted_claim_*` |
| A5 `Idempotency-Key` on cash, card and bank payments | `d7652fa` | `test_cash_payment_with_idempotency_key_*`, `test_payment_intent_replay_keeps_response_envelope` |
| A6 Hospital business day for cash summary, reconciliation and list filters | `0153804`, `bea62ca` | `test_cash_totals_use_the_hospital_business_day`, `test_invoice_list_date_filter_uses_hospital_day` |

### Found and fixed along the way

- **A1 initially broke every payment on Postgres.** `FOR UPDATE` was emitted together with
  the Invoice eager-load `LEFT OUTER JOIN`s, which Postgres rejects. SQLite ignores
  `FOR UPDATE`, so the SQLite test suite hid it. It was found by a two-thread run against Postgres and fixed with
  `FOR UPDATE OF invoices` + `lazyload("*")` (`99fe172`). An opt-in test
  (`MEDIFLOW_TEST_POSTGRES_URL`) now races three full payments and asserts that exactly one succeeds.
- **Seed money was inconsistent:** SHA invoices had both a desk payment and a claim
  settlement, and one invoice was `ISSUED` with a paid claim. The stored totals disagreed with the
  transactions, so the first real payment produced a negative balance. SHA invoices are now
  claim-driven, and the seed ends with a `recompute_invoice` pass (`5eaf6c0`). The
  demo void now targets a dedicated unpaid duplicate invoice.
- **Idempotent replays dropped the `{data: …}` envelope** on payment intents (`d7652fa`).
- **`GET /claims/aging` returned 500** (naive vs aware datetimes). This was previously logged as
  out of scope, but it is BIL-9 and now in scope, so it was fixed (`b58c1c8`).

### Verification after phase A

- pytest 92 passed, 1 skipped (the Postgres test skips without its env var; it passes against
  the scratch schema)
- Playwright 13 passed with no server tracebacks

### Behaviour changes to know about

- Paying more than the balance was already rejected for desk payments. Over-balance **M-Pesa**
  money is now recorded but parked as `UNCONFIRMED` for reconciliation instead of overpaying.
- A void request on an invoice with net money or an open claim returns `409` with
  `net_paid_minor` and `open_claim_ids`.
- A second open claim on an invoice returns `409`.

## Phase B: Correct amounts, payer mix and discounts (done)

| Item | Commit(s) | Tests (`backend/tests/…`) |
|---|---|---|
| B1 One consultation charge from the price list; the doctor fee is only the fallback price | `97afd93` | `test_billing_amounts.py::test_default_invoice_*`, `test_doctor_fee_is_the_default_price_*` |
| B2 Only completed visits can be invoiced; post-completion edits audited as `visit.amend_after_completion` (field names only, no clinical text) | `c887cd5`, `b9ed725` | `test_open_visit_cannot_be_invoiced`, `test_amending_a_completed_visit_*` |
| B3 BIL-8 self-pay conversion; eligibility returns `remaining_coverage_minor` and `next_action` | `4f91e1d` | `test_inactive_sha_converts_*`, `test_claim_on_exhausted_cover_*` |
| B3b BIL-7 claims capped at remaining SHA cover, rest billed as patient co-pay | `00e5b04` | `test_claim_is_capped_at_remaining_cover_*`, `test_partial_claim_*` |
| B4 Rejected, cancelled or partially approved claims shift the unpaid amount to the patient, with an alert and audit | `d79c7ae` | `test_rejected_claim_*`, `test_partial_approval_*`, `test_resubmitted_claim_*`, `test_approved_amount_cannot_exceed_claimed` |
| B5 Patient payments linked to the PATIENT allocation | `fddaed8` | `test_co_pay_payments_are_linked_*`, `test_payments_without_a_payer_split_*` |
| B6 Discount reason and approval: schema + migration `0004`, then service and routes | `50a84c8`, `16ebcd0` | `test_invoice_discount_migration.py`, `test_billing_discounts.py` |

### Payer-mix model

One invariant drives every payer-mix change: **patient share = invoice total −
active SHA and insurance allocations** (`billing.service.rebalance_patient_share`).
It runs after self-pay conversion, claim creation, claim decisions, resubmission
and discounts, so the allocations always add up to the total. The patient allocation's
status follows the money the patient has paid (non-SHA payments less refunds).
That means co-pay paid before a claim still counts.

### Discount rules (decision 2)

- A discount needs a reason. A new discount replaces any earlier one.
- It applies immediately when it is ≤ 10% of the subtotal **and** ≤ KES 1,000 (exactly 10% is
  allowed). Above either threshold it is `PENDING_APPROVAL` until an admin other than the
  requester approves or rejects it. This matches the void and refund rule, so an admin's own
  large discount needs a second admin.
- A discount is refused while a SHA claim is open (the claim was sized on the old total), or when it
  would leave the invoice overpaid (refund first). Both are re-checked at approval.
- Thresholds: `DISCOUNT_APPROVAL_PERCENT`, `DISCOUNT_APPROVAL_MINOR`.
- A fully discounted invoice with nothing collected is `PAID`.

### API additions and changes

- `POST /invoices/:id/discount` (billing roles) `{amount_minor, reason}`
- `POST /invoices/:id/discount/decision` (admin) `{approve, reason}`
- Invoice JSON gains `discount_reason`, `discount_status` and `discount_requested_minor`.
- Eligibility JSON gains `remaining_coverage_minor` and `next_action`.
- `POST /visits/:id/invoices` returns `409` for a visit that isn't completed.
- `POST /invoices` with a discount but no `discount_reason` returns `400`.
- Approving more than the claimed amount returns `400`.
- `primary_method` becomes `SELF_PAY` after a BIL-8 conversion.
- New alert templates: `claim_patient_share_alert`, `discount_approval_alert`.

### Test fixture change

The fixture consultation service is now priced at 500000, which is the amount the old double
charge (service 250000 + doctor fee 250000) produced, so existing payment amounts in tests
stay meaningful. The doctor fee (250000) is exercised by the fallback test.

### Commit-history note

`c887cd5` already contains the amend-audit test whose implementation landed in
the next commit, `b9ed725`. At `c887cd5` alone, that one test fails. Both were
pushed, so history was left as is.

### E2E cold start

On a cold Vite dev server, the first admin page takes about 30 s to render (measured 30.3 s;
14 s warm), which is past the 30 s expect timeout. The first E2E assertion now waits up to 90 s.
This is a dev-server cost, not an app error: no console or page errors were seen.

### Verification after phase B (2026-11-18)

- pytest 120 passed, 1 skipped; ruff clean; the Postgres concurrency test passes against `migcheck`
- Migration `0004` round-trips on SQLite (test) and Postgres (`migcheck`: upgrade, downgrade, upgrade)
- Frontend lint 0 errors (same 9 warnings); tsc clean; vitest 19 passed
- **Playwright: not cleanly verified for phase B.** A run on a quiet machine before the cold-start
  timeout change had 12/13 passing; the only failure was the cold-start case above. Two later runs
  happened while another process held the load average at 8–11. The suite took 8–16 min instead of ~3,
  and tests failed while the page was still server-rendered: the client took up to 2 min 9 s to
  hydrate (login 11:03:39, first `/auth/me` 11:05:48). API responses were immediate, and there were no
  server tracebacks in the last run. The one SQLite `database is locked` error came from the 16-minute
  run. **Re-run `npx playwright test` on an idle machine before merging.**

Update: on 2026-11-18 the full suite passed **17/17** on a quiet machine during phase C
(13 existing tests + 4 new desk tests; 2.8 min; no server tracebacks). That run covers the
phase B code.

## M-Pesa amount units (approved 2026-11-18, done)

`3cd2eaf`: Daraja's `Amount` is whole shillings. The STK push converts with
`minor_to_shillings`, and callbacks convert back with `shillings_to_minor` (which accepts
values like `"5000.00"`). Payment intents that are not whole shillings return 400, and the desk UI
validates this before sending. Tests that fake Daraja callbacks now report KES.
`test_mpesa_units.py` asserts the outgoing Daraja payload.

## Phase C: Reception and cashier UI (done)

| Item | Commit(s) | Tests |
|---|---|---|
| C0 `GET /billing/ready-to-bill`: completed visits without an active invoice (a voided invoice puts the visit back) | `a6d3580` | `test_billing_worklist.py` |
| C1 API clients: `createInvoice`, `addAllocation`, `requestDiscount`, `decideDiscount`, `listReadyToBill`, `api.postIdempotent`; types | `b1308ff` | tsc |
| C2 Receptionist and cashier areas gated (`requireRole` + `RoleGate`); sign-in routes by role | `42a17e6` | E2E sign-in and keep-out test |
| C3 Shared `components/billing/*` (checkout, work-list, invoice list) and the receptionist desk | `0a3bca7`, `947dc0d`, `b2e1b8c` | `billingShares.test.ts`, E2E desk flows |
| C4 Cashier invoices and payments pages | `34f94b3` | E2E cashier payments |
| C5 E2E `e2e/billing-desk.spec.ts` | `8bfe0df` | 4 tests |

### Desk flow (receptionist `/receptionist/billing`, cashier `/cashier/invoices`)

1. **Ready to bill** lists completed visits with the charge a default invoice will carry.
   **Create invoice** takes an optional discount and reason, then opens checkout.
2. **Checkout** shows total, paid, **SHA pending** and **Patient due**, the lines (with any discount),
   and badges for each payer share and the discount state.
3. **Pay via SHA**: *Verify SHA* (member number, or blank to use the profile), then
   *Submit SHA claim* (amount optional; the server caps it at the remaining cover). The patient
   co-pay appears as the patient share.
4. If SHA cannot pay (BIL-8), an alert says the invoice was converted to self-pay and offers
   **Pay by M-Pesa** or **Pay cash** with the patient due pre-filled.
5. **Collect payment**: cash shows the change; card and bank take a reference. Each attempt sends
   an `Idempotency-Key` (a new key when method or amount changes), so a double submit records
   once. M-Pesa sends an STK push and requires whole shillings.
6. **Discount** asks for an amount and reason; above the threshold it shows "awaiting approval".

### Decisions

- **Sign-in routing:** receptionists go to `/receptionist`, cashiers to `/cashier`, admins to
  `/admin`. Doctors and patients still go to `/unauthorized`, because their areas are out of scope.
- **Role gate:** each area admits its own role only. The API still enforces roles server-side.
- **Admin billing page left unchanged.** The new components are separate, so the existing
  admin flows are untouched. The admin page still has no create-invoice action; the desks do.
- **Display-only maths:** "SHA pending" and "Patient due" are computed in the browser from the
  server's allocations, only to choose what to show and pre-fill. The server validates every amount.

### Verification after phase C (2026-11-18)

- pytest 126 passed, 1 skipped; ruff clean
- Frontend lint 0 errors (same 9 pre-existing warnings); tsc clean; build OK; vitest 24 passed
- Playwright 17/17 passed with no server tracebacks

### Known gaps

- The receptionist and cashier dashboards, the queue, and the other pages in those areas are still
  placeholders (out of scope).
- Admins approve discounts through the API (`POST /invoices/:id/discount/decision`). There is no
  admin UI yet for pending discounts.
- The ready-to-bill list computes each row's expected charge with a few queries per row (bounded by
  page size).
- E2E tests that sign in through the form wait for `networkidle`. Submitting before hydration falls
  back to a native GET.

## Open items

- `tests/test_billing_postgres_locking.py` needs a disposable migrated and seeded
  Postgres database or schema. The scratch schema `migcheck` in the dev database was
  rebuilt with the fixed seed for this purpose.
