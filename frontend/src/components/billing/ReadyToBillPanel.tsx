import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2 } from "lucide-react";
import {
  Badge,
  DetailRow,
  EmptyState,
  Field,
  Modal,
  Panel,
  inputCls,
  td,
  th,
  tableWrap,
  tbodyRow,
  theadRow,
} from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { billingKeys, createInvoice, listReadyToBill } from "@/lib/api/billing";
import { kesToMinor } from "@/lib/billingShares";
import { formatDateTime, formatKshMinor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ReadyToBillVisit } from "@/types/api";
import { ListPagination } from "./ListPagination";

/** Completed visits without an invoice; creating one opens checkout. */
export function ReadyToBillPanel({ onInvoiced }: { onInvoiced: (invoiceId: string) => void }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<ReadyToBillVisit | null>(null);
  const [discount, setDiscount] = useState({ amount: "", reason: "" });

  const params = { page, page_size: 10 };
  const readyQuery = useQuery({
    queryKey: billingKeys.readyToBill(params),
    queryFn: () => listReadyToBill(params),
    staleTime: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!target) throw new Error("No visit selected");
      const amount = discount.amount ? kesToMinor(discount.amount) : null;
      if (discount.amount && amount === null) throw new Error("Enter a valid discount");
      if (amount && !discount.reason.trim()) throw new Error("A discount needs a reason");
      return createInvoice(
        target.visit_id,
        amount ? { discount_minor: amount, discount_reason: discount.reason.trim() } : {},
      );
    },
    onSuccess: (invoice) => {
      toast.success(
        invoice.discount_status === "PENDING_APPROVAL"
          ? `Invoice ${invoice.invoice_number} created; discount awaiting admin approval`
          : `Invoice ${invoice.invoice_number} created`,
      );
      setTarget(null);
      setDiscount({ amount: "", reason: "" });
      void queryClient.invalidateQueries({ queryKey: billingKeys.all });
      onInvoiced(invoice.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = readyQuery.data?.items ?? [];

  return (
    <Panel title="Ready to bill">
      <div className={cn(tableWrap)}>
        <table className="w-full">
          <thead>
            <tr className={theadRow}>
              <th className={th}>Completed</th>
              <th className={th}>Patient</th>
              <th className={th}>Doctor</th>
              <th className={th}>Department</th>
              <th className={th}>Charge</th>
              <th className={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {readyQuery.isLoading ? (
              <tr>
                <td colSpan={6} className="p-0">
                  <LoadingRows rows={4} className="p-3" />
                </td>
              </tr>
            ) : readyQuery.error ? (
              <tr>
                <td colSpan={6} className="p-3">
                  <ErrorBlock error={readyQuery.error} onRetry={() => void readyQuery.refetch()} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <EmptyState cols={6} message="No completed visits are waiting to be billed." />
            ) : (
              rows.map((visit) => (
                <tr key={visit.visit_id} className={tbodyRow}>
                  <td className={td}>{formatDateTime(visit.completed_at)}</td>
                  <td className={cn(td, "font-medium")}>
                    {visit.patient.name ?? "—"}
                    <p className="text-xs text-muted-foreground">{visit.patient.number ?? ""}</p>
                    {visit.patient.has_sha_number && <Badge tone="sha">SHA</Badge>}
                  </td>
                  <td className={td}>{visit.doctor_name ?? "—"}</td>
                  <td className={td}>{visit.department_name ?? "—"}</td>
                  <td className={td}>
                    {visit.expected_line ? (
                      <>
                        {formatKshMinor(visit.expected_line.unit_price_minor)}
                        <p className="text-xs text-muted-foreground">
                          {visit.expected_line.description}
                        </p>
                      </>
                    ) : (
                      "No priced service"
                    )}
                  </td>
                  <td className={td}>
                    <Button
                      size="sm"
                      onClick={() => setTarget(visit)}
                      disabled={!visit.expected_line}
                    >
                      <FilePlus2 /> Create invoice
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <ListPagination
        page={page}
        pages={readyQuery.data?.meta.pages ?? 1}
        total={readyQuery.data?.meta.total ?? 0}
        noun="visits"
        onPage={setPage}
      />

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title="Create invoice"
        subtitle={target?.patient.name ?? undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create invoice"}
            </Button>
          </>
        }
      >
        {target?.expected_line && (
          <div className="space-y-3">
            <DetailRow
              label={target.expected_line.description}
              value={formatKshMinor(target.expected_line.unit_price_minor)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Discount (KES, optional)"
                hint="Above 10% or KES 1,000 needs admin approval"
              >
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
              <Field label="Discount reason">
                <input
                  className={inputCls}
                  value={discount.reason}
                  onChange={(event) =>
                    setDiscount((current) => ({ ...current, reason: event.target.value }))
                  }
                />
              </Field>
            </div>
          </div>
        )}
      </Modal>
    </Panel>
  );
}
