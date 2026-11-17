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

## Open items

- **M-Pesa amount units (needs a decision).** `DarajaMpesaGateway.stk_push` sends
  `Amount: int(amount_minor)` (cents), but Daraja expects whole shillings. With
  the real gateway, a KES 5,000 bill would request KES 500,000. The simulated gateway hides
  this. Callback amounts are now read through one helper
  (`_callback_amount_minor`), so a units fix changes the push and that helper only.
  Not changed yet because it is outside the approved plan.
- `tests/test_billing_postgres_locking.py` needs a disposable migrated and seeded
  Postgres database or schema. The scratch schema `migcheck` in the dev database was
  rebuilt with the fixed seed for this purpose.
