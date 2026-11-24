import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Field,
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
  createCashReconciliation,
  getCashSummary,
  getReconciliationQueue,
  listCashReconciliations,
  resolvePaymentIntent,
  resolveTransaction,
} from "@/lib/api/billing";
import {
  formatDate,
  formatDateTime,
  formatKshMinor,
  hospitalTodayIso,
  paymentMethodLabel,
  titleize,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PaymentIntent, Transaction } from "@/types/api";

/** Counted cash in minor units; zero is a valid count. Null when blank or invalid. */
function countedMinor(value: string): number | null {
  const text = value.replace(/,/g, "").trim();
  if (!text) return null;
  const amount = Math.round(Number(text) * 100);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/**
 * Daily cash reconciliation for the hospital business day: expected cash by
 * method, the counted amount with variance, the queue of parked payments to
 * resolve, and past reconciliations. Used by the cashier page and the admin
 * billing tab.
 */
export function CashReconciliationPanel() {
  const queryClient = useQueryClient();
  const today = hospitalTodayIso();
  const [form, setForm] = useState({ counted: "", notes: "" });

  const cash = useQuery({
    queryKey: billingKeys.cashSummary({}),
    queryFn: () => getCashSummary(),
    staleTime: 30_000,
  });
  const queue = useQuery({
    queryKey: billingKeys.reconciliationQueue,
    queryFn: getReconciliationQueue,
    staleTime: 15_000,
  });
  const history = useQuery({
    queryKey: billingKeys.reconciliations({ page_size: 10 }),
    queryFn: () => listCashReconciliations({ page_size: 10 }),
    staleTime: 30_000,
  });

  const counted = countedMinor(form.counted);
  const expected = cash.data?.cash_expected_minor ?? 0;
  const variance = counted === null ? null : counted - expected;

  const save = useMutation({
    mutationFn: () => {
      if (counted === null) throw new Error("Enter the counted cash in KES");
      if (variance !== 0 && !form.notes.trim()) {
        throw new Error("Explain the variance in the notes");
      }
      return createCashReconciliation({
        business_date: cash.data?.business_date ?? today,
        counted_cash_minor: counted,
        notes: form.notes.trim() || undefined,
      });
    },
    onSuccess: (item) => {
      toast.success(
        item.variance_minor === 0
          ? "Cash reconciliation saved · balanced"
          : `Cash reconciliation saved · variance ${formatKshMinor(item.variance_minor)}`,
      );
      setForm({ counted: "", notes: "" });
      void queryClient.invalidateQueries({ queryKey: billingKeys.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const queueCount =
    (queue.data?.payment_intents.length ?? 0) + (queue.data?.transactions.length ?? 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Cash expected">
          <p className="text-2xl font-bold" aria-label="Cash expected">
            {formatKshMinor(expected)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(cash.data?.business_date ?? today)} · successful cash payments
          </p>
          <ul className="mt-3 space-y-2">
            {(cash.data?.methods ?? []).map((item) => (
              <li key={item.method} className="flex justify-between text-sm">
                <span>
                  {paymentMethodLabel(item.method)}{" "}
                  <span className="text-xs text-muted-foreground">×{item.count}</span>
                </span>
                <span className="font-semibold">{formatKshMinor(item.amount_minor)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Record reconciliation">
          <form
            className="space-y-3"
            aria-label="Record reconciliation"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <Field label="Counted cash (KES)">
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                value={form.counted}
                onChange={(event) => setForm({ ...form, counted: event.target.value })}
              />
            </Field>
            {variance !== null && (
              <p
                className={cn(
                  "text-sm font-semibold",
                  variance === 0 ? "text-success" : "text-destructive",
                )}
                aria-live="polite"
              >
                {variance === 0 ? "Balanced" : `Variance ${formatKshMinor(variance)}`}
              </p>
            )}
            <Field label="Notes" hint="Required when the count does not match">
              <textarea
                className={textareaCls}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Any variance explanation"
              />
            </Field>
            <Button type="submit" className="w-full" disabled={save.isPending}>
              <Plus /> {save.isPending ? "Saving…" : "Save reconciliation"}
            </Button>
          </form>
        </Panel>

        <Panel
          title="Unconfirmed payments"
          action={queueCount > 0 ? <Badge tone="warning">{`${queueCount} to review`}</Badge> : null}
        >
          <DataState
            isLoading={queue.isLoading}
            error={queue.error}
            isEmpty={queueCount === 0}
            loading={<LoadingRows rows={3} />}
            empty={
              <EmptyBlock
                title="Queue is clear"
                message="No unconfirmed payments need attention."
              />
            }
          >
            <ul className="space-y-2 text-sm" aria-label="Unconfirmed payments">
              {queue.data?.transactions.map((transaction) => (
                <ParkedPaymentRow key={transaction.id} transaction={transaction} />
              ))}
              {queue.data?.payment_intents.map((intent) => (
                <ParkedIntentRow key={intent.id} intent={intent} />
              ))}
            </ul>
          </DataState>
        </Panel>
      </div>

      <Panel title="Reconciliation history">
        <DataState
          isLoading={history.isLoading}
          error={history.error}
          isEmpty={(history.data?.items.length ?? 0) === 0}
          loading={<LoadingRows rows={3} />}
          empty={<EmptyBlock title="No reconciliations yet" message="Saved days appear here." />}
        >
          <div className={tableWrap}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Date</th>
                  <th className={th}>Expected</th>
                  <th className={th}>Counted</th>
                  <th className={th}>Variance</th>
                  <th className={th}>Status</th>
                  <th className={th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {history.data?.items.map((item) => (
                  <tr key={item.id} className={tbodyRow}>
                    <td className={td}>{formatDate(item.business_date)}</td>
                    <td className={td}>{formatKshMinor(item.expected_cash_minor)}</td>
                    <td className={td}>{formatKshMinor(item.counted_cash_minor)}</td>
                    <td className={cn(td, item.variance_minor !== 0 && "text-destructive")}>
                      {formatKshMinor(item.variance_minor)}
                    </td>
                    <td className={td}>
                      <Badge>{titleize(item.status)}</Badge>
                    </td>
                    <td className={cn(td, "max-w-64 truncate text-muted-foreground")}>
                      {item.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </Panel>
    </div>
  );
}

function ParkedPaymentRow({ transaction }: { transaction: Transaction }) {
  const queryClient = useQueryClient();
  const resolve = useMutation({
    mutationFn: (resolution: "SUCCESS" | "FAILED") =>
      resolveTransaction(transaction.id, {
        resolution,
        notes:
          resolution === "SUCCESS"
            ? "Accepted at reconciliation"
            : "Marked failed at reconciliation; money returned to payer",
      }),
    onSuccess: (_, resolution) => {
      toast.success(resolution === "SUCCESS" ? "Payment accepted" : "Payment marked failed");
      void queryClient.invalidateQueries({ queryKey: billingKeys.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <li
      className="space-y-2 rounded-lg bg-secondary/50 p-2"
      aria-label={transaction.reference ?? transaction.id}
    >
      <div className="flex justify-between gap-2">
        <span>
          {paymentMethodLabel(transaction.method)} · {transaction.reference ?? "no reference"}
          <span className="block text-xs text-muted-foreground">
            {[
              transaction.invoice_number,
              transaction.patient_name,
              formatDateTime(transaction.created_at),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="font-semibold">{formatKshMinor(transaction.amount_minor)}</span>
      </div>
      {transaction.notes && <p className="text-xs text-warning">{transaction.notes}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => resolve.mutate("SUCCESS")}
          disabled={resolve.isPending}
        >
          <CheckCircle2 /> Accept
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => resolve.mutate("FAILED")}
          disabled={resolve.isPending}
        >
          <XCircle /> Mark failed
        </Button>
      </div>
    </li>
  );
}

function ParkedIntentRow({ intent }: { intent: PaymentIntent }) {
  const queryClient = useQueryClient();
  const resolve = useMutation({
    mutationFn: (resolution: "SUCCESS" | "FAILED") =>
      resolvePaymentIntent(intent.id, {
        resolution,
        notes:
          resolution === "SUCCESS"
            ? "Confirmed manually at reconciliation"
            : "Marked failed at reconciliation; return the money to the payer",
      }),
    onSuccess: (_, resolution) => {
      toast.success(
        resolution === "SUCCESS"
          ? "Payment request confirmed and posted"
          : "Payment request marked failed",
      );
      void queryClient.invalidateQueries({ queryKey: billingKeys.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <li className="space-y-2 rounded-lg bg-secondary/50 p-2" aria-label={intent.id}>
      <div className="flex justify-between gap-2">
        <span>
          M-Pesa request awaiting confirmation
          <span className="block text-xs text-muted-foreground">
            {[intent.phone, formatDateTime(intent.created_at)].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="font-semibold">{formatKshMinor(intent.amount_minor)}</span>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => resolve.mutate("SUCCESS")}
          disabled={resolve.isPending}
        >
          <CheckCircle2 /> Accept
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => resolve.mutate("FAILED")}
          disabled={resolve.isPending}
        >
          <XCircle /> Mark failed
        </Button>
      </div>
    </li>
  );
}
