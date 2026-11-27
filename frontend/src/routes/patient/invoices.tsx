import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileText, Receipt } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  DetailRow,
  Field,
  Modal,
  PageHeader,
  Panel,
  inputCls,
  tableWrap,
  td,
  th,
  tbodyRow,
  theadRow,
} from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { createPaymentIntent, downloadInvoicePdf, getInvoice } from "@/lib/api/billing";
import { newIdempotencyKey } from "@/lib/billingShares";
import { getMyInvoices } from "@/lib/api/patient";
import { errorMessage } from "@/lib/api/client";
import { formatDateTime, formatKshMinor, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isPayableStatus } from "@/lib/invoices";

export const Route = createFileRoute("/patient/invoices")({
  head: () => ({ meta: [{ title: "Invoices & Payments — MediFlow" }] }),
  component: PatientInvoicesPage,
});

function PatientInvoicesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentKey, setPaymentKey] = useState(() => newIdempotencyKey());
  const invoices = useQuery({
    queryKey: ["patient", "invoices", { page_size: 50 }],
    queryFn: () => getMyInvoices({ page_size: 50 }),
    staleTime: 30_000,
  });
  const detail = useQuery({
    queryKey: ["patient", "invoice", selectedId],
    queryFn: () => getInvoice(selectedId as string),
    enabled: Boolean(selectedId),
  });

  const pay = useMutation({
    mutationFn: () => {
      if (!detail.data) throw new Error("Invoice is not loaded");
      if (!phone.trim()) throw new Error("Enter the M-Pesa phone number");
      const minor = Math.round(Number(amount) * 100);
      if (!Number.isFinite(minor) || minor <= 0) throw new Error("Enter a valid amount");
      return createPaymentIntent(
        detail.data.id,
        {
          amount_minor: minor,
          phone: phone.trim(),
        },
        paymentKey,
      );
    },
    onSuccess: () => {
      toast.success("M-Pesa STK push sent. Confirm it on your phone.");
      setPaymentOpen(false);
      setPhone("");
      setPaymentKey(newIdempotencyKey());
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  async function downloadPdf(id: string) {
    try {
      const blob = await downloadInvoicePdf(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${detail.data?.invoice_number ?? "invoice"}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Unable to download this invoice");
    }
  }

  return (
    <div>
      <PageHeader
        title="Invoices & Payments"
        subtitle="Your invoices, balances and downloadable receipts."
      />
      <Panel>
        {invoices.isLoading ? (
          <LoadingRows rows={4} />
        ) : invoices.error ? (
          <ErrorBlock error={invoices.error} onRetry={() => void invoices.refetch()} />
        ) : (invoices.data?.items.length ?? 0) === 0 ? (
          <EmptyBlock
            title="No invoices"
            message="Invoices from your visits will appear here."
            icon={<Receipt className="h-5 w-5" />}
          />
        ) : (
          <div className={tableWrap}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Invoice</th>
                  <th className={th}>Date</th>
                  <th className={th}>Total</th>
                  <th className={th}>Balance</th>
                  <th className={th}>Status</th>
                  <th className={th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.data?.items.map((invoice) => (
                  <tr key={invoice.id} className={tbodyRow}>
                    <td className={cn(td, "font-semibold")}>{invoice.invoice_number ?? "Draft"}</td>
                    <td className={td}>{formatDateTime(invoice.created_at)}</td>
                    <td className={td}>{formatKshMinor(invoice.total_minor)}</td>
                    <td className={td}>{formatKshMinor(invoice.balance_minor)}</td>
                    <td className={td}>
                      <Badge>{titleize(invoice.status)}</Badge>
                    </td>
                    <td className={td}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                        onClick={() => setSelectedId(invoice.id)}
                      >
                        <FileText className="h-4 w-4" /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title={detail.data?.invoice_number ?? "Invoice"}
        subtitle={detail.data?.patient_name ?? undefined}
        wide
        footer={
          <>
            <button
              type="button"
              className="rounded-xl border border-input px-4 py-2 text-sm font-semibold"
              onClick={() => setSelectedId(null)}
            >
              Close
            </button>
            {detail.data &&
              detail.data.balance_minor > 0 &&
              isPayableStatus(detail.data.status) && (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  onClick={() => {
                    setAmount(String(detail.data.balance_minor / 100));
                    setPaymentKey(newIdempotencyKey());
                    setPaymentOpen(true);
                  }}
                >
                  <Receipt className="h-4 w-4" /> Pay by M-Pesa
                </button>
              )}
            {detail.data && (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-input px-4 py-2 text-sm font-semibold"
                onClick={() => void downloadPdf(detail.data.id)}
              >
                <Download className="h-4 w-4" /> Download invoice
              </button>
            )}
          </>
        }
      >
        {detail.isLoading ? (
          <LoadingRows rows={3} />
        ) : detail.error ? (
          <ErrorBlock error={detail.error} onRetry={() => void detail.refetch()} />
        ) : detail.data ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <DetailRow label="Total" value={formatKshMinor(detail.data.total_minor)} />
              <DetailRow label="Paid" value={formatKshMinor(detail.data.amount_paid_minor)} />
              <DetailRow label="Balance" value={formatKshMinor(detail.data.balance_minor)} />
            </div>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {detail.data.lines.map((line) => (
                <li key={line.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span>
                    {line.description}
                    <span className="block text-xs text-muted-foreground">
                      {line.quantity} × {formatKshMinor(line.unit_price_minor)}
                    </span>
                  </span>
                  <span className="font-semibold">{formatKshMinor(line.line_total_minor)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title="Pay by M-Pesa"
        subtitle={detail.data?.invoice_number ?? undefined}
        footer={
          <>
            <button
              type="button"
              className="rounded-xl border border-input px-4 py-2 text-sm font-semibold"
              onClick={() => setPaymentOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              onClick={() => pay.mutate()}
              disabled={pay.isPending}
            >
              {pay.isPending ? "Sending…" : "Send STK push"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Amount (KES)">
            <input
              type="number"
              min="1"
              step="1"
              className={inputCls}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label="M-Pesa phone">
            <input
              type="tel"
              className={inputCls}
              placeholder="07xx xxx xxx"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
