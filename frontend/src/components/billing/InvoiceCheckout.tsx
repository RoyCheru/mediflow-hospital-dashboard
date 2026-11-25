import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgePercent, CreditCard, Download, ShieldCheck } from "lucide-react";
import {
  Badge,
  DetailRow,
  Field,
  Modal,
  inputCls,
  td,
  th,
  tableWrap,
  tbodyRow,
  theadRow,
} from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { ApiError, errorMessage } from "@/lib/api/client";
import {
  billingKeys,
  createPaymentIntent,
  downloadInvoicePdf,
  downloadReceipt,
  finalizeInvoice,
  getInvoice,
  listTransactions,
  recordPayment,
  requestDiscount,
} from "@/lib/api/billing";
import { claimKeys, createClaim, runEligibilityCheck } from "@/lib/api/claims";
import { kesToMinor, newIdempotencyKey, payerShares } from "@/lib/billingShares";
import {
  formatDateTime,
  formatKshMinor,
  invoiceStatusLabel,
  paymentMethodLabel,
  titleize,
} from "@/lib/format";
import { encounterRef } from "@/lib/invoices";
import { toast } from "sonner";
import type {
  EligibilityCheck,
  Invoice,
  PaymentIntent,
  PaymentMethod,
  Transaction,
} from "@/types/api";

type Panel = "none" | "payment" | "sha" | "discount";
type DeskMethod = Extract<PaymentMethod, "CASH" | "CARD" | "BANK" | "MPESA">;

const deskMethods: DeskMethod[] = ["CASH", "MPESA", "CARD", "BANK"];
const payerLabel = { PATIENT: "Patient", SHA: "SHA", INSURANCE: "Insurance" } as const;

function allocationTone(status: string): "success" | "warning" | "muted" {
  if (status === "PAID") return "success";
  if (status === "PENDING") return "warning";
  return "muted";
}

/**
 * One invoice at the desk: totals, lines, payer split, SHA verification and
 * claim (with the BIL-8 self-pay prompt), patient payments and discount
 * requests. Shared by the receptionist and cashier billing pages.
 */
export function InvoiceCheckout({
  invoiceId,
  onClose,
}: {
  invoiceId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<Panel>("none");
  const [eligibility, setEligibility] = useState<EligibilityCheck | null>(null);
  const [shaBlocked, setShaBlocked] = useState<string | null>(null);
  const [memberReference, setMemberReference] = useState("");
  const [claimAmount, setClaimAmount] = useState("");
  const [payment, setPayment] = useState({
    method: "CASH" as DeskMethod,
    amount: "",
    tendered: "",
    phone: "",
    reference: "",
    // One key per payment attempt: double submits and retries apply once.
    key: newIdempotencyKey(),
  });
  const [discount, setDiscount] = useState({ amount: "", reason: "" });

  const invoiceQuery = useQuery({
    queryKey: billingKeys.invoice(invoiceId),
    queryFn: () => getInvoice(invoiceId),
  });
  const invoice = invoiceQuery.data;
  const shares = invoice ? payerShares(invoice) : null;
  const closed = invoice ? ["VOIDED", "REFUNDED", "PAID"].includes(invoice.status) : true;
  const isDraft = invoice?.status === "DRAFT";

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: billingKeys.all });
    void queryClient.invalidateQueries({ queryKey: claimKeys.all });
  };

  const finalizeMutation = useMutation({
    mutationFn: () => finalizeInvoice(invoiceId),
    onSuccess: (finalized) => {
      toast.success(`Invoice ${finalized.invoice_number} finalized`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openPayment = (current: Invoice, method: DeskMethod = "CASH") => {
    const due = payerShares(current).patientDue;
    setPayment({
      method,
      amount: due > 0 ? String(due / 100) : "",
      tendered: "",
      phone: "",
      reference: "",
      key: newIdempotencyKey(),
    });
    setPanel("payment");
  };

  const eligibilityMutation = useMutation({
    mutationFn: () => runEligibilityCheck(invoiceId, memberReference.trim() || undefined),
    onSuccess: (check) => {
      setEligibility(check);
      refresh();
      if (check.next_action === "choose_payment_method") {
        setShaBlocked(
          `SHA status ${titleize(check.status)}: the invoice was converted to self-pay. Collect the balance by another method.`,
        );
      } else {
        setShaBlocked(null);
        toast.success("SHA member is eligible");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const claimMutation = useMutation({
    mutationFn: () => {
      const amount = claimAmount ? kesToMinor(claimAmount) : undefined;
      if (claimAmount && amount === null) throw new Error("Enter a valid claim amount");
      return createClaim(invoiceId, {
        ...(eligibility ? { eligibility_check_id: eligibility.id } : {}),
        ...(memberReference.trim() && !eligibility
          ? { member_reference: memberReference.trim() }
          : {}),
        ...(amount ? { amount_minor: amount } : {}),
      });
    },
    onSuccess: (claim) => {
      toast.success(`SHA claim submitted for ${formatKshMinor(claim.claimed_amount_minor)}`);
      setPanel("none");
      setClaimAmount("");
      refresh();
    },
    onError: (error: Error) => {
      // BIL-8: the server converted the invoice to self-pay before refusing.
      const details = error instanceof ApiError ? (error.details as Record<string, unknown>) : null;
      if (details?.["next_action"] === "choose_payment_method") {
        setShaBlocked(`${error.message}. The invoice is now self-pay.`);
        refresh();
        return;
      }
      toast.error(error.message);
    },
  });

  const paymentMutation = useMutation({
    mutationFn: (): Promise<PaymentIntent | Transaction> => {
      const amount = kesToMinor(payment.amount);
      if (amount === null) throw new Error("Enter a valid payment amount");
      if (payment.method === "MPESA") {
        if (amount % 100 !== 0) throw new Error("M-Pesa payments must be whole shillings");
        if (!payment.phone.trim()) throw new Error("Enter the M-Pesa phone number");
        return createPaymentIntent(
          invoiceId,
          { amount_minor: amount, phone: payment.phone },
          payment.key,
        );
      }
      const tendered = payment.tendered ? kesToMinor(payment.tendered) : undefined;
      if (payment.method === "CASH" && tendered !== undefined && tendered !== null) {
        if (tendered < amount) throw new Error("Amount tendered is less than the payment");
      }
      return recordPayment(
        invoiceId,
        {
          method: payment.method,
          amount_minor: amount,
          tendered_minor: tendered ?? undefined,
          reference: payment.reference || undefined,
        },
        payment.key,
      );
    },
    onSuccess: (result) => {
      if (payment.method === "MPESA") {
        toast.success("STK push sent. The payment appears once the customer confirms.");
      } else {
        const transaction = result as Transaction;
        const change = transaction.change_minor;
        toast.success(
          change ? `Payment recorded. Change: ${formatKshMinor(change)}` : "Payment recorded",
          {
            action: {
              label: "Receipt",
              onClick: () => void saveReceipt(transaction.id, transaction.reference),
            },
          },
        );
      }
      setPanel("none");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const discountMutation = useMutation({
    mutationFn: () => {
      const amount = kesToMinor(discount.amount);
      if (amount === null) throw new Error("Enter a valid discount amount");
      if (!discount.reason.trim()) throw new Error("A discount needs a reason");
      return requestDiscount(invoiceId, { amount_minor: amount, reason: discount.reason.trim() });
    },
    onSuccess: (updated) => {
      toast.success(
        updated.discount_status === "PENDING_APPROVAL"
          ? "Discount sent to an admin for approval"
          : "Discount applied",
      );
      setDiscount({ amount: "", reason: "" });
      setPanel("none");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function downloadPdf() {
    if (!invoice) return;
    try {
      const blob = await downloadInvoicePdf(invoice.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${invoice.invoice_number ?? "invoice"}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      toast.error(errorMessage(error));
    }
  }

  const tendered = kesToMinor(payment.tendered);
  const amountMinor = kesToMinor(payment.amount);
  const change =
    payment.method === "CASH" && tendered !== null && amountMinor !== null && tendered > amountMinor
      ? tendered - amountMinor
      : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={invoice?.invoice_number ?? (isDraft ? "Draft invoice" : "Invoice")}
      subtitle={
        invoice
          ? [
              invoice.patient_name ?? "Patient",
              invoice.patient_number,
              invoice.department_name,
              encounterRef(invoice) ? `Encounter ${encounterRef(invoice)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : "Loading invoice…"
      }
      wide
      footer={
        <>
          <Button variant="outline" onClick={() => void downloadPdf()} disabled={!invoice}>
            <Download /> PDF
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {invoice && !closed && (
            <>
              <Button variant="outline" onClick={() => setPanel("discount")}>
                <BadgePercent /> Discount
              </Button>
              {isDraft ? (
                <Button
                  onClick={() => finalizeMutation.mutate()}
                  disabled={finalizeMutation.isPending || !invoice.lines.length}
                >
                  {finalizeMutation.isPending ? "Finalizing…" : "Finalize invoice"}
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setPanel("sha")}>
                    <ShieldCheck /> Pay via SHA
                  </Button>
                  <Button onClick={() => openPayment(invoice)} disabled={!shares?.patientDue}>
                    <CreditCard /> Collect payment
                  </Button>
                </>
              )}
            </>
          )}
        </>
      }
    >
      {invoiceQuery.isLoading ? (
        <LoadingRows rows={3} />
      ) : invoiceQuery.error ? (
        <ErrorBlock error={invoiceQuery.error} onRetry={() => void invoiceQuery.refetch()} />
      ) : invoice && shares ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-5">
            <DetailRow label="Total" value={formatKshMinor(invoice.total_minor)} />
            <DetailRow label="Paid" value={formatKshMinor(invoice.amount_paid_minor)} />
            <DetailRow label="Balance" value={formatKshMinor(invoice.balance_minor)} />
            <DetailRow label="SHA pending" value={formatKshMinor(shares.payerPending)} />
            <DetailRow label="Patient due" value={formatKshMinor(shares.patientDue)} />
          </div>

          {shaBlocked && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="space-y-2">
                <p>{shaBlocked}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => openPayment(invoice, "MPESA")}>
                    Pay by M-Pesa
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openPayment(invoice, "CASH")}>
                    Pay cash
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className={tableWrap}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Description</th>
                  <th className={th}>Qty</th>
                  <th className={th}>Unit price</th>
                  <th className={th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line) => (
                  <tr key={line.id} className={tbodyRow}>
                    <td className={td}>{line.description}</td>
                    <td className={td}>{line.quantity}</td>
                    <td className={td}>{formatKshMinor(line.unit_price_minor)}</td>
                    <td className={td}>{formatKshMinor(line.line_total_minor)}</td>
                  </tr>
                ))}
                {invoice.discount_minor > 0 && (
                  <tr className={tbodyRow}>
                    <td className={td} colSpan={3}>
                      Discount{invoice.discount_reason ? ` · ${invoice.discount_reason}` : ""}
                    </td>
                    <td className={td}>−{formatKshMinor(invoice.discount_minor)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <PaymentHistory invoiceId={invoice.id} />

          <div className="flex flex-wrap items-center gap-2">
            <Badge>{invoiceStatusLabel(invoice.status)}</Badge>
            {invoice.primary_method && (
              <Badge tone="muted">{paymentMethodLabel(invoice.primary_method)}</Badge>
            )}
            {invoice.discount_status === "PENDING_APPROVAL" && (
              <Badge tone="warning">
                {`Discount ${formatKshMinor(invoice.discount_requested_minor ?? 0)} awaiting approval`}
              </Badge>
            )}
            {invoice.discount_status === "REJECTED" && (
              <Badge tone="danger">Discount rejected</Badge>
            )}
            {invoice.allocations
              .filter((item) => item.status !== "VOIDED")
              .map((item) => (
                <Badge key={item.id} tone={allocationTone(item.status)}>
                  {`${payerLabel[item.payer]} share ${formatKshMinor(item.amount_minor)} · ${titleize(item.status)}`}
                </Badge>
              ))}
            <span className="text-xs text-muted-foreground">
              {invoice.status === "DRAFT"
                ? "Draft — not finalized"
                : `Issued ${formatDateTime(invoice.issued_at)}`}
            </span>
          </div>

          {panel === "sha" && (
            <div className="space-y-3 rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold">Pay via SHA</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="SHA member number" hint="Leave blank to use the patient's profile">
                  <input
                    className={inputCls}
                    value={memberReference}
                    onChange={(event) => {
                      setMemberReference(event.target.value);
                      setEligibility(null);
                    }}
                  />
                </Field>
                <Field label="Claim amount (KES)" hint="Defaults to the balance, capped at cover">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={inputCls}
                    value={claimAmount}
                    onChange={(event) => setClaimAmount(event.target.value)}
                  />
                </Field>
              </div>
              {eligibility && (
                <p className="text-sm text-muted-foreground">
                  {`Eligibility: ${titleize(eligibility.status)}`}
                  {eligibility.remaining_coverage_minor !== null
                    ? ` · remaining cover ${formatKshMinor(eligibility.remaining_coverage_minor)}`
                    : ""}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => eligibilityMutation.mutate()}
                  disabled={eligibilityMutation.isPending}
                >
                  {eligibilityMutation.isPending ? "Checking…" : "Verify SHA"}
                </Button>
                <Button
                  onClick={() => claimMutation.mutate()}
                  disabled={
                    claimMutation.isPending || eligibility?.next_action === "choose_payment_method"
                  }
                >
                  {claimMutation.isPending ? "Submitting…" : "Submit SHA claim"}
                </Button>
              </div>
            </div>
          )}

          {panel === "payment" && (
            <div className="space-y-3 rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold">Collect payment</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Method">
                  <select
                    className={inputCls}
                    value={payment.method}
                    onChange={(event) =>
                      setPayment((current) => ({
                        ...current,
                        method: event.target.value as DeskMethod,
                        key: newIdempotencyKey(),
                      }))
                    }
                  >
                    {deskMethods.map((value) => (
                      <option key={value} value={value}>
                        {paymentMethodLabel(value)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Amount (KES)">
                  <input
                    type="number"
                    min="0"
                    step={payment.method === "MPESA" ? "1" : "0.01"}
                    className={inputCls}
                    value={payment.amount}
                    onChange={(event) =>
                      setPayment((current) => ({
                        ...current,
                        amount: event.target.value,
                        key: newIdempotencyKey(),
                      }))
                    }
                  />
                </Field>
                {payment.method === "MPESA" ? (
                  <Field label="Phone" className="sm:col-span-2">
                    <input
                      className={inputCls}
                      placeholder="07xx xxx xxx"
                      value={payment.phone}
                      onChange={(event) =>
                        setPayment((current) => ({ ...current, phone: event.target.value }))
                      }
                    />
                  </Field>
                ) : (
                  <>
                    {payment.method === "CASH" && (
                      <Field
                        label="Tendered (KES)"
                        {...(change !== null ? { hint: `Change: ${formatKshMinor(change)}` } : {})}
                      >
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={inputCls}
                          value={payment.tendered}
                          onChange={(event) =>
                            setPayment((current) => ({ ...current, tendered: event.target.value }))
                          }
                        />
                      </Field>
                    )}
                    <Field label="Reference">
                      <input
                        className={inputCls}
                        value={payment.reference}
                        onChange={(event) =>
                          setPayment((current) => ({ ...current, reference: event.target.value }))
                        }
                      />
                    </Field>
                  </>
                )}
              </div>
              <Button onClick={() => paymentMutation.mutate()} disabled={paymentMutation.isPending}>
                {paymentMutation.isPending
                  ? "Saving…"
                  : payment.method === "MPESA"
                    ? "Send STK push"
                    : "Record payment"}
              </Button>
            </div>
          )}

          {panel === "discount" && (
            <div className="space-y-3 rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold">Discount</h3>
              <p className="text-xs text-muted-foreground">
                Above 10% of the subtotal or above KES 1,000 needs admin approval.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Discount (KES)">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputCls}
                    value={discount.amount}
                    onChange={(event) =>
                      setDiscount((current) => ({ ...current, amount: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Reason">
                  <input
                    className={inputCls}
                    value={discount.reason}
                    onChange={(event) =>
                      setDiscount((current) => ({ ...current, reason: event.target.value }))
                    }
                  />
                </Field>
              </div>
              <Button
                onClick={() => discountMutation.mutate()}
                disabled={discountMutation.isPending}
              >
                {discountMutation.isPending ? "Saving…" : "Apply discount"}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

async function saveReceipt(transactionId: string, reference: string | null) {
  try {
    const blob = await downloadReceipt(transactionId);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `receipt-${reference ?? transactionId.slice(0, 8)}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error: unknown) {
    toast.error(errorMessage(error));
  }
}

/** Payments recorded against the invoice, with a receipt for each successful one. */
function PaymentHistory({ invoiceId }: { invoiceId: string }) {
  const params = { invoice_id: invoiceId, page_size: 50 };
  const payments = useQuery({
    queryKey: billingKeys.transactions(params),
    queryFn: () => listTransactions(params),
  });
  const items = payments.data?.items ?? [];
  return (
    <section aria-label="Payment history">
      <h3 className="mb-2 text-sm font-semibold">Payments</h3>
      {payments.isLoading ? (
        <LoadingRows rows={2} />
      ) : payments.error ? (
        <ErrorBlock error={payments.error} onRetry={() => void payments.refetch()} />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
      ) : (
        <div className={tableWrap}>
          <table className="w-full">
            <thead>
              <tr className={theadRow}>
                <th className={th}>Date</th>
                <th className={th}>Method</th>
                <th className={th}>Reference</th>
                <th className={th}>Amount</th>
                <th className={th}>Status</th>
                <th className={th}>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {items.map((payment) => (
                <tr key={payment.id} className={tbodyRow}>
                  <td className={td}>{formatDateTime(payment.paid_at ?? payment.created_at)}</td>
                  <td className={td}>{paymentMethodLabel(payment.method)}</td>
                  <td className={td}>{payment.reference ?? "—"}</td>
                  <td className={td}>{formatKshMinor(payment.amount_minor)}</td>
                  <td className={td}>
                    <Badge>{titleize(payment.status)}</Badge>
                  </td>
                  <td className={td}>
                    {payment.status === "SUCCESS" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Download receipt ${payment.reference ?? ""}`}
                        onClick={() => void saveReceipt(payment.id, payment.reference)}
                      >
                        <Download /> Receipt
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {payment.status === "PENDING" ? "Awaiting confirmation" : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
