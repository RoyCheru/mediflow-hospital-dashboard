import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/kit";
import { InvoiceCheckout } from "@/components/billing/InvoiceCheckout";
import { InvoiceListPanel } from "@/components/billing/InvoiceListPanel";
import { AWAITING_PAYMENT } from "@/lib/invoices";

export const Route = createFileRoute("/cashier/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — MediFlow" },
      {
        name: "description",
        content: "Find invoices, review line items and collect outstanding balances.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Finalized invoices awaiting payment. Review the charges, collect payment and print receipts."
      />
      <InvoiceListPanel onOpen={setOpenInvoiceId} defaultStatus={AWAITING_PAYMENT} />
      {openInvoiceId && (
        <InvoiceCheckout
          key={openInvoiceId}
          invoiceId={openInvoiceId}
          onClose={() => setOpenInvoiceId(null)}
        />
      )}
    </div>
  );
}
