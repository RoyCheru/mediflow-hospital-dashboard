import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileClock, FilePlus2 } from "lucide-react";
import { PageHeader } from "@/components/kit";
import { InvoiceCheckout } from "@/components/billing/InvoiceCheckout";
import { InvoiceListPanel } from "@/components/billing/InvoiceListPanel";
import { ReadyToBillPanel } from "@/components/billing/ReadyToBillPanel";
import { cn } from "@/lib/utils";

type BillingTab = "ready" | "invoices";

export const Route = createFileRoute("/receptionist/billing")({
  validateSearch: (search: Record<string, unknown>): { tab: BillingTab } => ({
    tab: search["tab"] === "invoices" ? "invoices" : "ready",
  }),
  head: () => ({
    meta: [
      { title: "Billing & Payments — MediFlow" },
      {
        name: "description",
        content: "Invoice completed visits, verify SHA, split co-pays and take payment.",
      },
    ],
  }),
  component: Page,
});

const tabs: { id: BillingTab; label: string; icon: typeof FileClock }[] = [
  { id: "ready", label: "Ready to bill", icon: FilePlus2 },
  { id: "invoices", label: "Invoices", icon: FileClock },
];

function Page() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="Billing & Payments"
        subtitle="Invoice completed visits, verify SHA, split co-pays and take payment."
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
        <ReadyToBillPanel onInvoiced={setOpenInvoiceId} />
      ) : (
        <InvoiceListPanel onOpen={setOpenInvoiceId} defaultStatus="ISSUED" />
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
