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
