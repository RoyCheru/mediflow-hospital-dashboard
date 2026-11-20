import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Field, inputCls } from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { addInvoiceLine, billingKeys, getInvoice, removeInvoiceLine } from "@/lib/api/billing";
import { listServices, managementKeys } from "@/lib/api/management";
import { formatKshMinor } from "@/lib/format";
import type { Invoice } from "@/types/api";

/**
 * Lines on an encounter draft. Lines can be added from the service price list
 * (the API prices them) or removed, only while the invoice is still a DRAFT.
 */
export function DraftLinesEditor({ invoiceId }: { invoiceId: string }) {
  const queryClient = useQueryClient();
  const [serviceId, setServiceId] = useState("");
  const [quantity, setQuantity] = useState("1");

  const draft = useQuery({
    queryKey: billingKeys.invoice(invoiceId),
    queryFn: () => getInvoice(invoiceId),
  });
  const services = useQuery({
    queryKey: managementKeys.services({ page_size: 100 }),
    queryFn: () => listServices({ page_size: 100 }),
    staleTime: 300_000,
  });
  const priced = (services.data?.items ?? []).filter(
    (service) => service.is_active && service.current_price_minor !== null,
  );

  const onChanged = (invoice: Invoice) => {
    queryClient.setQueryData(billingKeys.invoice(invoiceId), invoice);
    void queryClient.invalidateQueries({ queryKey: ["admin", "billing", "ready-to-bill"] });
  };
  const add = useMutation({
    mutationFn: () => {
      const qty = Number(quantity);
      if (!serviceId) throw new Error("Choose a service");
      if (!Number.isInteger(qty) || qty < 1) throw new Error("Quantity must be a whole number");
      return addInvoiceLine(invoiceId, { service_id: serviceId, quantity: qty });
    },
    onSuccess: (invoice) => {
      onChanged(invoice);
      setServiceId("");
      setQuantity("1");
      toast.success("Line added");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (lineId: string) => removeInvoiceLine(invoiceId, lineId),
    onSuccess: (invoice) => {
      onChanged(invoice);
      toast.success("Line removed");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (draft.isLoading) return <LoadingRows rows={2} />;
  if (draft.error || !draft.data) {
    return <ErrorBlock error={draft.error} onRetry={() => void draft.refetch()} />;
  }
  const invoice = draft.data;
  const editable = invoice.status === "DRAFT";

  return (
    <div className="space-y-3">
      <ul
        className="divide-y divide-border rounded-xl border border-border"
        aria-label="Draft lines"
      >
        {invoice.lines.length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">
            No lines. Finalizing adds the default consultation charge back.
          </li>
        ) : (
          invoice.lines.map((line) => (
            <li key={line.id} aria-label={line.description} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{line.description}</p>
                <p className="text-xs text-muted-foreground">
                  {line.quantity} × {formatKshMinor(line.unit_price_minor)}
                </p>
              </div>
              <span className="text-sm font-semibold">{formatKshMinor(line.line_total_minor)}</span>
              {editable && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${line.description}`}
                  onClick={() => remove.mutate(line.id)}
                  disabled={remove.isPending}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))
        )}
        <li className="flex items-center justify-between p-3 text-sm font-semibold">
          <span>Draft subtotal</span>
          <span>{formatKshMinor(invoice.subtotal_minor)}</span>
        </li>
      </ul>

      {editable && (
        <form
          aria-label="Add line"
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_90px_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            add.mutate();
          }}
        >
          <Field label="Add service">
            <select
              className={inputCls}
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
            >
              <option value="">Choose a priced service</option>
              {priced.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · {formatKshMinor(service.current_price_minor)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Qty">
            <input
              type="number"
              min={1}
              step={1}
              className={inputCls}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>
          <Button type="submit" variant="outline" disabled={add.isPending}>
            <Plus /> Add line
          </Button>
        </form>
      )}
    </div>
  );
}
