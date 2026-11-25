import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Receipt, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Field, Panel, inputCls } from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { addInvoiceLine, finalizeVisitInvoice, removeInvoiceLine } from "@/lib/api/billing";
import { ApiError } from "@/lib/api/client";
import { clinicalKeys, getVisitInvoice } from "@/lib/api/clinical";
import { listServices, managementKeys } from "@/lib/api/management";
import { formatKshMinor, invoiceStatusLabel } from "@/lib/format";
import type { Invoice } from "@/types/api";

/**
 * The encounter bill in the consulting room. The doctor orders services from the
 * price list (the API prices them and recalculates the total) and submits the
 * bill once the visit is completed. Prices cannot be typed in.
 */
export function EncounterBillPanel({
  visitId,
  completed,
  consultationServiceId,
}: {
  visitId: string;
  completed: boolean;
  consultationServiceId: string | null | undefined;
}) {
  const queryClient = useQueryClient();
  const [serviceId, setServiceId] = useState("");
  const [quantity, setQuantity] = useState("1");

  const bill = useQuery({
    queryKey: clinicalKeys.visitInvoice(visitId),
    queryFn: () => getVisitInvoice(visitId),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const services = useQuery({
    queryKey: managementKeys.services({}),
    queryFn: () => listServices({}),
    staleTime: 300_000,
  });
  const orderable = (services.data?.items ?? []).filter(
    (service) => service.is_active && service.current_price_minor !== null,
  );

  const onChanged = (invoice: Invoice) => {
    queryClient.setQueryData(clinicalKeys.visitInvoice(visitId), invoice);
    void queryClient.invalidateQueries({ queryKey: ["admin", "billing"] });
  };
  const add = useMutation({
    mutationFn: (invoiceId: string) => {
      const qty = Number(quantity);
      if (!serviceId) throw new Error("Choose a service to order");
      if (!Number.isInteger(qty) || qty < 1) throw new Error("Quantity must be a whole number");
      return addInvoiceLine(invoiceId, { service_id: serviceId, quantity: qty });
    },
    onSuccess: (invoice) => {
      onChanged(invoice);
      setServiceId("");
      setQuantity("1");
      toast.success("Service added to the bill");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: ({ invoiceId, lineId }: { invoiceId: string; lineId: string }) =>
      removeInvoiceLine(invoiceId, lineId),
    onSuccess: (invoice) => {
      onChanged(invoice);
      toast.success("Service removed from the bill");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const submit = useMutation({
    mutationFn: () => finalizeVisitInvoice(visitId),
    onSuccess: (invoice) => {
      onChanged(invoice);
      toast.success(`Bill ${invoice.invoice_number ?? ""} submitted for payment`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (bill.isLoading) {
    return (
      <Panel title="Encounter bill">
        <LoadingRows rows={3} />
      </Panel>
    );
  }
  if (bill.error) {
    const missing = bill.error instanceof ApiError && bill.error.status === 404;
    return (
      <Panel title="Encounter bill">
        {missing ? (
          <p className="text-sm text-muted-foreground">
            This encounter has no bill yet. It opens when the patient is checked in.
          </p>
        ) : (
          <ErrorBlock error={bill.error} onRetry={() => void bill.refetch()} />
        )}
      </Panel>
    );
  }
  const invoice = bill.data;
  if (!invoice) return null;
  const draft = invoice.status === "DRAFT";

  return (
    <Panel
      title="Encounter bill"
      action={
        <div className="flex items-center gap-2">
          {invoice.invoice_number && (
            <span className="text-xs text-muted-foreground">{invoice.invoice_number}</span>
          )}
          <Badge>{invoiceStatusLabel(invoice.status)}</Badge>
        </div>
      }
    >
      <ul
        className="divide-y divide-border rounded-xl border border-border"
        aria-label="Bill lines"
      >
        {invoice.lines.map((line) => {
          const isConsultation = Boolean(
            consultationServiceId && line.service_id === consultationServiceId,
          );
          return (
            <li key={line.id} aria-label={line.description} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{line.description}</p>
                <p className="text-xs text-muted-foreground">
                  {line.quantity} × {formatKshMinor(line.unit_price_minor)}
                  {isConsultation ? " · consultation" : ""}
                </p>
              </div>
              <span className="text-sm font-semibold">{formatKshMinor(line.line_total_minor)}</span>
              {draft && !isConsultation && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${line.description}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ invoiceId: invoice.id, lineId: line.id })}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          );
        })}
        {invoice.discount_minor > 0 && (
          <li className="flex justify-between p-3 text-sm">
            <span>Discount</span>
            <span>−{formatKshMinor(invoice.discount_minor)}</span>
          </li>
        )}
        <li className="flex justify-between p-3 text-sm font-semibold">
          <span>Total</span>
          <span aria-label="Bill total">{formatKshMinor(invoice.total_minor)}</span>
        </li>
      </ul>

      {draft ? (
        <>
          <form
            aria-label="Order a service"
            className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_90px_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              add.mutate(invoice.id);
            }}
          >
            <Field label="Order service">
              <select
                className={inputCls}
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
              >
                <option value="">Lab test, imaging, procedure…</option>
                {orderable.map((service) => (
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
              <Plus /> Add to bill
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Prices come from the price list; the total is recalculated on the server.
          </p>
          {completed && (
            <Button
              className="mt-4 w-full"
              onClick={() => submit.mutate()}
              disabled={submit.isPending}
            >
              <Send /> {submit.isPending ? "Submitting…" : "Submit bill for payment"}
            </Button>
          )}
        </>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Receipt className="h-4 w-4" />
          Submitted for payment. Changes now go through the billing desk.
        </p>
      )}
    </Panel>
  );
}
