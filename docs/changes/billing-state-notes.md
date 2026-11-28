# Billing state consistency (BIL-18)

Branch `fix/billing-state-consistency`, based on
`fix/invoice-finalization-payment-guard` (BIL-16/17, not yet in `main`): this fix
builds on that branch's payment guard and its "Unbilled visits" panel, which do
not exist on `main`.

## Investigation

All database reads below ran inside `BEGIN TRANSACTION READ ONLY` against the dev
database (revision `0006_invoice_number_checks`) and were rolled back. API payloads
were produced by the same service serializers the endpoints call, also read-only.

### 1. What "Unbilled visits" does today

| | |
|---|---|
| Tab | `frontend/src/routes/receptionist/billing.tsx:32`, tab id `ready`, label "Unbilled visits" |
| Component | `frontend/src/components/billing/ReadyToBillPanel.tsx`, panel title "Visits without a finalized bill" |
| Endpoint | `GET /api/v1/billing/ready-to-bill` (`backend/app/billing/routes.py:260`), roles reception, cashier, admin |
| Query | `ready_to_bill_query()` (`backend/app/billing/service.py:251`) |
| Origin | Endpoint added in `a6d3580` (2026-11-18, "feat(api): add a ready-to-bill work-list of completed, uninvoiced visits"); the current wording added in `45e5075` (2026-11-27, "feat(web): drafts read-only; no finalize actions; admin force-complete"). Both authored as RoyCheru by Claude Code sessions. |

The exact condition:

```python
finalized = select Invoice.visit_id
            where Invoice.visit_id IS NOT NULL
              and Invoice.status NOT IN (VOIDED, DRAFT)
Visit where completed_at IS NOT NULL and Visit.id NOT IN finalized
```

It matches invoices to the visit **by `visit_id` only**.

The row message (`ReadyToBillPanel.tsx:80-82`) is chosen by one field,
`draft_invoice_id` (a DRAFT invoice found by `visit_id` *or* `appointment_id`):

- present → "Bill still a draft: an admin force-completes the visit to issue it"
- absent → "Bill cancelled: an admin force-completes the visit to reissue it"

So "cancelled" is not read from any void record or `VOIDED` status. It is
inferred from "listed, and no draft found". Any listed visit whose bill is not a
draft gets the "cancelled" sentence, whatever its real status.

The section's original purpose (before BIL-17) was a work-list: the desk created
or finalized bills for completed visits. Since BIL-17, completing a visit
finalizes its bill, so the only legitimate members are completed visits that
truly lack an active invoice. That purpose is still real (a voided bill on a
seen patient must be replaced), so the section is kept and narrowed, not removed
(see the Decisions section).

### 2. Amina's case

Patient **Amina Hassan**, `MF-2026-000001`, `7a5b3de5-…`.

| Record | Value |
|---|---|
| Appointment `dd0bd685-…` | WALK_IN, status COMPLETED, arrived and checked in 2026-11-27 13:36:13, completed 16:32:49 |
| Visit `d886835f-…` | appointment `dd0bd685`, started 16:31:16, completed 16:32:49 |
| Invoice `6dc4170a-…` | **INV-2026-000018**, status **ISSUED**, `appointment_id = dd0bd685`, **`visit_id = NULL`**, total 320,000 (line "Chest X-ray" 350,000 less an approved 30,000 discount), paid 0, balance 320,000, created 13:36:13, finalized 13:37:53, `void_reason` NULL, not replaced |
| Void requests | none |
| Transactions / payment intents / claims | none |
| Other invoices | INV-2026-000001 (PAID, 2026-11-05, no visit or appointment link; an unrelated seeded invoice) |

Audit timeline (Africa/Nairobi, 2026-11-27):

| Time | Actor | Action |
|---|---|---|
| 13:36:13 | ADMIN | `appointment.walk_in`, `invoice.draft_create` |
| 13:37:53 | CASHIER | `invoice.finalize`: number INV-2026-000018 (desk finalization, the pre-BIL-17 flow, before the visit existed) |
| 16:08:22 | RECEPTIONIST | `invoice.discount_request` 30,000 "Todays offer" |
| 16:16:17 | ADMIN | `invoice.discount_decision` approved |
| 16:16:48, 16:17:51, 16:19:17 | RECEPTIONIST | `invoice.payment_rejected` ×3: "The patient has not been seen: no completed visit for this appointment" (correct at the time: there was no visit yet) |
| 16:31:16 | DOCTOR | `appointment.status_change`, `visit.create` |
| 16:32:49 | DOCTOR | `visit.update`, `appointment.status_change`, `visit.complete` |

API responses now (read-only, same serializers):

- `GET /billing/ready-to-bill` → one item: visit `d886835f`, appointment `dd0bd685`, **`draft_invoice_id: null`**, patient "Amina Hassan" → reception renders "Bill cancelled: …".
- `GET /invoices/6dc4170a…` → `status: "ISSUED"`, `visit_id: null`, `appointment_id: dd0bd685`, `balance_minor: 320000` → cashier list renders "Ready for payment".
- Payment guard `payable_problem(INV-2026-000018)` → `None`: the invoice **is payable**.

### 3. Explaining the contradiction

The answer is **(b) with an (e) root cause**. (a), (c) and (d) are ruled out by the evidence.

- (a) Two invoices: **false.** The visit's appointment has exactly one invoice; nothing is voided or replaced.
- (b) Different conditions: **true.** Reception decides "billed" by `Invoice.visit_id = visit.id`. The cashier list and the payment guard decide by the invoice's own status, and the guard resolves the visit through `visit_id` *or* `appointment_id` (`encounter_of`). For an invoice linked by appointment only, reception says unbilled and the cashier says payable.
- (c) Stale data: **false.** The reception response is freshly computed and still lists the visit.
- (d) Half-applied void: **false.** There are no void requests on the invoice, and the status is ISSUED.
- (e) Root cause: **true.** The invoice never received the visit's id, for two reasons.
  - `create_visit` (`clinical_records/service.py:172-177`) links only a DRAFT invoice of the appointment to the new visit. Amina's was already finalized.
  - `finalize_encounter_invoice` (`billing/service.py:664`) returns early for a non-draft invoice, before the `visit_id` backfill at line 695.

  Then the panel's wording turned "not matched by `visit_id`" into "cancelled".

A second, smaller inconsistency was found on the same invoice earlier that afternoon. Before the visit existed, `InvoiceCheckout` showed "Ready for payment" and the payment buttons for any ISSUED invoice. The server refused the payment three times ("patient has not been seen"). The screen and the guard used different conditions.

### 4. Every consumer of billing state

| Consumer | Decides | Condition today | Agrees with the guard? |
|---|---|---|---|
| `lifecycle.payable_problem` / `ensure_payable` (cash, card, bank, STK, allocations, SHA claim/settlement/resubmission, reconciliation) | payable | status ∈ {ISSUED, PARTIALLY_PAID}; visit by `visit_id` or `appointment_id` must be completed; appointment without visit → no | reference |
| `service.ready_to_bill_query` (reception "Unbilled visits") | unbilled | completed visit with no non-draft, non-voided invoice **by `visit_id` only** | **no**: misses appointment-linked invoices |
| `ReadyToBillPanel.tsx` | "draft" / "cancelled" wording | `draft_invoice_id` present or not | **no**: says "cancelled" without any void |
| `service.find_invoice_for_visit` (doctor bill, force-complete, completion) | the visit's invoice | non-voided, `visit_id` or `appointment_id`, newest | yes |
| `GET /invoices` + `InvoiceListPanel.tsx` (reception and cashier lists) | "Ready for payment" | `invoiceStatusHint(status)`: ISSUED → "Ready for payment" | **no**: ignores visit completion |
| `InvoiceCheckout.tsx` (payment buttons) | payable | `!closed && !isDraft` (closed = VOIDED, REFUNDED, PAID) | **no**: ISSUED before completion shows buttons |
| `admin/billing.tsx` | payable | `isPayableStatus(status)` (ISSUED, PARTIALLY_PAID) | **no**: ignores visit completion |
| `patient/invoices.tsx` | payable (M-Pesa) | `balance_minor > 0 && isPayableStatus(status)` | **no**: same |
| `ForceCompleteVisit.tsx` | draft / finalized | `status === "DRAFT"` | partly |
| `EncounterBillPanel.tsx` (doctor) | draft | `status === "DRAFT"` | yes for its purpose |
| `cashier/refunds.tsx` | refundable | not VOIDED and not DRAFT | separate rule (refunds), unchanged |
| `admin/service.invoice_totals` (dashboard) | outstanding | status ∈ {ISSUED, PARTIALLY_PAID} | **no**: counts unseen-patient invoices as outstanding |
| `claims/service` draft lookups (`:133`, `:244`, `:274`) | the appointment's draft | `appointment_id` and DRAFT | yes |

### 5. Existing data (dev database)

| Check | Count | Rows |
|---|---|---|
| Visits (all completed) | 6 | |
| Completed visits with no active invoice (matching by `visit_id` or appointment) | **0** | |
| …with no invoice at all / only voided invoices | 0 / 0 | |
| Visits with more than one active invoice | **0** | |
| Appointments with more than one active invoice | 0 | |
| Active invoices whose appointment has a visit but `visit_id` is NULL | **1** | INV-2026-000018 (Amina, ISSUED) |
| Finalized invoices with a pending or approved void request | **1** | INV-2026-000007: PAID, void request PENDING (a pending void does not change status; it can never be approved while money is collected, because `decide_void` re-checks under a lock) |
| Completed visits still holding a draft | 0 | |
| Visits listed by today's "Unbilled visits" query | 1 | Amina's, wrongly |

Nothing was changed. INV-2026-000018 keeps `visit_id = NULL`. The fix resolves the visit by appointment as well, so the row needs no rewrite.

### Reproduction tests

`backend/tests/test_billing_state.py` are marked `xfail(strict=True)` in Step 1, so they prove the failure while the pushed branch stays green (Lovable syncs this branch). Step 2 removes the markers.

- `test_finalized_invoice_linked_by_appointment_is_not_unbilled`: Amina's sequence (desk finalization, then visit, then completion). It fails today at "visit not in Unbilled visits": the visit is listed while the cashier sees ISSUED.
- `test_every_billing_view_reports_the_same_state`, `test_voided_bill_needs_reissue_then_admin_reissues`, `test_only_admin_reissues[...]`, `test_a_second_active_invoice_for_a_visit_is_rejected`: the target behavior.
- `test_seeded_visits_with_an_active_invoice_are_not_unbilled`: the demo seed now includes an Amina-style legacy encounter (`demo_seed.py`, "Legacy encounter"). It is listed today.
