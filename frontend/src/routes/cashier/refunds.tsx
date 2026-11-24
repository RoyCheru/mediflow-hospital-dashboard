import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins, Search, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Field,
  Modal,
  PageHeader,
  Panel,
  inputCls,
  tableWrap,
  tbodyRow,
  td,
  textareaCls,
  th,
  theadRow,
} from "@/components/kit";
import { DataState, EmptyBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import {
  billingKeys,
  listInvoices,
  listRefunds,
  listTransactions,
  listVoidRequests,
  requestRefund,
  requestVoid,
} from "@/lib/api/billing";
import { kesToMinor, newIdempotencyKey } from "@/lib/billingShares";
import { formatDateTime, formatKshMinor, paymentMethodLabel, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Invoice, Refund, Transaction, VoidRequest } from "@/types/api";

export const Route = createFileRoute("/cashier/refunds")({
  head: () => ({ meta: [{ title: "Refunds & Voids — MediFlow" }] }),
  component: Page,
});

type Target =
  { kind: "refund"; transaction: Transaction } | { kind: "void"; invoice: Invoice } | null;

function Page() {
  const [target, setTarget] = useState<Target>(null);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Refunds & Voids"
        subtitle="Request a refund or an invoice void with a reason. An admin approves every request."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <PaymentSearch onRefund={(transaction) => setTarget({ kind: "refund", transaction })} />
        <InvoiceSearch onVoid={(invoice) => setTarget({ kind: "void", invoice })} />
      </div>
      <RequestLists />
      {target && <RequestDialog target={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

function SearchBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative mb-3">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        aria-label={label}
        placeholder={label}
        className={cn(inputCls, "pl-10")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function PaymentSearch({ onRefund }: { onRefund: (transaction: Transaction) => void }) {
  const [q, setQ] = useState("");
  const params = { q: q.trim() || undefined, status: "SUCCESS", page_size: 8 };
  const payments = useQuery({
    queryKey: billingKeys.transactions(params),
    queryFn: () => listTransactions(params),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  return (
    <Panel title="Refund a payment">
      <SearchBox
        label="Search payments by patient, invoice or reference"
        value={q}
        onChange={setQ}
      />
      <DataState
        isLoading={payments.isLoading}
        error={payments.error}
        isEmpty={(payments.data?.items.length ?? 0) === 0}
        loading={<LoadingRows rows={3} />}
        empty={<EmptyBlock title="No payments found" message="Try another search." />}
      >
        <ul className="space-y-2" aria-label="Payments">
          {payments.data?.items.map((transaction) => (
            <li
              key={transaction.id}
              aria-label={`${transaction.invoice_number ?? ""} ${transaction.patient_name ?? ""}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {transaction.patient_name ?? "Patient"} ·{" "}
                  {formatKshMinor(transaction.amount_minor)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[
                    transaction.invoice_number,
                    paymentMethodLabel(transaction.method),
                    transaction.reference,
                    formatDateTime(transaction.paid_at ?? transaction.created_at),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onRefund(transaction)}>
                <HandCoins /> Request refund
              </Button>
            </li>
          ))}
        </ul>
      </DataState>
    </Panel>
  );
}

function InvoiceSearch({ onVoid }: { onVoid: (invoice: Invoice) => void }) {
  const [q, setQ] = useState("");
  const params = { q: q.trim() || undefined, page_size: 8 };
  const invoices = useQuery({
    queryKey: billingKeys.invoices(params),
    queryFn: () => listInvoices(params),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const voidable = (invoices.data?.items ?? []).filter(
    (invoice) => invoice.status !== "VOIDED" && invoice.status !== "DRAFT",
  );
  return (
    <Panel title="Void an invoice">
      <SearchBox label="Search invoices by number or patient" value={q} onChange={setQ} />
      <p className="mb-3 text-xs text-muted-foreground">
        An invoice can only be voided once its payments are refunded and its SHA claims closed.
      </p>
      <DataState
        isLoading={invoices.isLoading}
        error={invoices.error}
        isEmpty={voidable.length === 0}
        loading={<LoadingRows rows={3} />}
        empty={<EmptyBlock title="No invoices found" message="Try another search." />}
      >
        <ul className="space-y-2" aria-label="Invoices">
          {voidable.map((invoice) => (
            <li
              key={invoice.id}
              aria-label={invoice.invoice_number ?? invoice.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {invoice.invoice_number} · {formatKshMinor(invoice.total_minor)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {invoice.patient_name ?? "Patient"} · paid{" "}
                  {formatKshMinor(invoice.amount_paid_minor)}
                </p>
              </div>
              <Badge>{titleize(invoice.status)}</Badge>
              <Button size="sm" variant="outline" onClick={() => onVoid(invoice)}>
                <Undo2 /> Request void
              </Button>
            </li>
          ))}
        </ul>
      </DataState>
    </Panel>
  );
}

function RequestDialog({ target, onClose }: { target: NonNullable<Target>; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(
    target.kind === "refund" ? String(target.transaction.amount_minor / 100) : "",
  );
  const [reason, setReason] = useState("");
  const [requestKey] = useState(() => newIdempotencyKey());
  const submit = useMutation({
    mutationFn: (): Promise<Refund | VoidRequest> => {
      if (!reason.trim()) throw new Error("A reason is required");
      if (target.kind === "void") {
        return requestVoid(target.invoice.id, { reason: reason.trim() }, requestKey);
      }
      const amountMinor = kesToMinor(amount);
      if (amountMinor === null) throw new Error("Enter a valid refund amount");
      if (amountMinor > target.transaction.amount_minor) {
        throw new Error("A refund cannot exceed the payment");
      }
      return requestRefund(
        target.transaction.id,
        {
          amount_minor: amountMinor,
          reason: reason.trim(),
        },
        requestKey,
      );
    },
    onSuccess: () => {
      toast.success(
        target.kind === "refund"
          ? "Refund requested · awaiting admin approval"
          : "Void requested · awaiting admin approval",
      );
      void queryClient.invalidateQueries({ queryKey: billingKeys.all });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const title = target.kind === "refund" ? "Request refund" : "Request void";
  const subtitle =
    target.kind === "refund"
      ? `${target.transaction.patient_name ?? "Patient"} · ${paymentMethodLabel(target.transaction.method)} ${formatKshMinor(target.transaction.amount_minor)}`
      : `${target.invoice.invoice_number ?? "Invoice"} · ${target.invoice.patient_name ?? "Patient"}`;
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending ? "Sending…" : title}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {target.kind === "refund" && (
          <Field label="Refund amount (KES)">
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
        )}
        <Field label="Reason">
          <textarea
            className={textareaCls}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

function RequestLists() {
  const refunds = useQuery({
    queryKey: billingKeys.refunds({ page_size: 10 }),
    queryFn: () => listRefunds({ page_size: 10 }),
    staleTime: 15_000,
  });
  const voids = useQuery({
    queryKey: billingKeys.voids({ page_size: 10 }),
    queryFn: () => listVoidRequests({ page_size: 10 }),
    staleTime: 15_000,
  });
  return (
    <Panel title="Recent requests">
      <div className={tableWrap}>
        <table className="w-full" aria-label="Recent requests">
          <thead>
            <tr className={theadRow}>
              <th className={th}>Type</th>
              <th className={th}>Invoice</th>
              <th className={th}>Patient</th>
              <th className={th}>Amount</th>
              <th className={th}>Reason</th>
              <th className={th}>Requested</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {refunds.isLoading || voids.isLoading ? (
              <tr>
                <td colSpan={7} className="p-3">
                  <LoadingRows rows={3} />
                </td>
              </tr>
            ) : (
              <>
                {refunds.data?.items.map((item) => (
                  <tr key={`r-${item.id}`} className={tbodyRow}>
                    <td className={td}>Refund</td>
                    <td className={td}>{item.invoice_number ?? "—"}</td>
                    <td className={td}>{item.patient_name ?? "—"}</td>
                    <td className={td}>{formatKshMinor(item.amount_minor)}</td>
                    <td className={cn(td, "max-w-56 truncate")}>{item.reason}</td>
                    <td className={td}>{formatDateTime(item.created_at)}</td>
                    <td className={td}>
                      <Badge>{titleize(item.status)}</Badge>
                    </td>
                  </tr>
                ))}
                {voids.data?.items.map((item) => (
                  <tr key={`v-${item.id}`} className={tbodyRow}>
                    <td className={td}>Void</td>
                    <td className={td}>{item.invoice_number ?? "—"}</td>
                    <td className={td}>{item.patient_name ?? "—"}</td>
                    <td className={td}>—</td>
                    <td className={cn(td, "max-w-56 truncate")}>{item.reason}</td>
                    <td className={td}>{formatDateTime(item.created_at)}</td>
                    <td className={td}>
                      <Badge>{titleize(item.status)}</Badge>
                    </td>
                  </tr>
                ))}
                {(refunds.data?.items.length ?? 0) + (voids.data?.items.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      No refund or void requests yet.
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
