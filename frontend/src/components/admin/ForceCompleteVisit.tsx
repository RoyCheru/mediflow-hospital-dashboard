import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge, DetailRow, Field, textareaCls } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { clinicalKeys, getVisitInvoice } from "@/lib/api/clinical";
import { forceCompleteVisit } from "@/lib/api/visits";
import { invoiceStatusHint, invoiceStatusLabel } from "@/lib/format";
import type { Visit } from "@/types/api";

const MIN_REASON = 10;

/**
 * The visit's bill, and the admin "Force-complete visit" action (BIL-17). It is
 * offered while the visit is open, or when a completed visit has no finalized
 * bill (left in draft, or voided and awaiting a reissue). The reason is
 * mandatory and audit-logged; the server finalizes the bill in the same step.
 */
export function ForceCompleteVisit({ visit }: { visit: Visit }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const bill = useQuery({
    queryKey: clinicalKeys.visitInvoice(visit.id),
    queryFn: () => getVisitInvoice(visit.id),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const noBill = bill.error instanceof ApiError && bill.error.status === 404;
  const draft = bill.data?.status === "DRAFT";
  const canForce = !visit.completed_at || draft || noBill;

  const force = useMutation({
    mutationFn: () => forceCompleteVisit(visit.id, reason.trim()),
    onSuccess: (result) => {
      toast.success(
        result.invoice
          ? `Visit completed. Invoice ${result.invoice.invoice_number ?? ""} finalized.`
          : "Visit completed.",
      );
      setOpen(false);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["clinical"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section aria-label="Visit bill" className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">Bill</p>
        {bill.data ? (
          <>
            <Badge>{invoiceStatusLabel(bill.data.status)}</Badge>
            <span className="text-xs text-muted-foreground">
              {[bill.data.invoice_number, invoiceStatusHint(bill.data.status)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            {noBill ? "No bill for this visit" : "Loading…"}
          </span>
        )}
      </div>
      {canForce && !open && (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <ShieldAlert /> Force-complete visit
        </Button>
      )}
      {open && (
        <form
          aria-label="Force-complete visit"
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason.trim().length < MIN_REASON) {
              toast.error(`Give a reason of at least ${MIN_REASON} characters`);
              return;
            }
            force.mutate();
          }}
        >
          <DetailRow
            label="What happens"
            value="The visit is completed and its bill finalized for payment. Your reason is recorded in the audit log."
          />
          <Field label="Reason (required)">
            <textarea
              className={textareaCls}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Doctor left before completing; patient was seen and discharged"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={force.isPending}>
              {force.isPending ? "Completing…" : "Force-complete"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
