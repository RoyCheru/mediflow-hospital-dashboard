import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileClock, FilePlus2 } from "lucide-react";
import { PageHeader } from "@/components/kit";
import { InvoiceCheckout } from "@/components/billing/InvoiceCheckout";
import { InvoiceListPanel } from "@/components/billing/InvoiceListPanel";
import { ReadyToBillPanel } from "@/components/billing/ReadyToBillPanel";
import { AWAITING_PAYMENT } from "@/lib/invoices";
import { cn } from "@/lib/utils";

type BillingTab = "ready" | "invoices";

export const Route = createFileRoute("/receptionist/billing")({
  validateSearch: (search: Record<string, unknown>): { tab: BillingTab } => ({
    // Invoices awaiting payment first; "ready" lists visits still without a final bill.
    tab: search["tab"] === "ready" ? "ready" : "invoices",
  }),
  head: () => ({
    meta: [
      { title: "Billing & Payments — MediFlow" },
      {
        name: "description",
        content: "Collect payment for finalized invoices, verify SHA and split co-pays.",
      },
    ],
  }),
  component: Page,
});

const tabs: { id: BillingTab; label: string; icon: typeof FileClock }[] = [
  { id: "invoices", label: "Invoices", icon: FileClock },
  { id: "ready", label: "Unbilled visits", icon: FilePlus2 },
];

function Page() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="Billing & Payments"
        subtitle="Invoices are finalized when the doctor completes the visit. Collect payment, verify SHA and split co-pays."
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => void navigate({ search: { tab: id } })}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              tab === id
                ? "bg-primary text-primary-foreground shadow-glow"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "ready" ? (
        <ReadyToBillPanel />
      ) : (
        <InvoiceListPanel onOpen={setOpenInvoiceId} defaultStatus={AWAITING_PAYMENT} />
      )}

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
