import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/kit";
import { TransactionListPanel } from "@/components/billing/TransactionListPanel";

export const Route = createFileRoute("/cashier/payments")({
  head: () => ({
    meta: [
      { title: "Payments — MediFlow" },
      { name: "description", content: "Cash, M-Pesa, card and SHA payments recorded at the desk." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Cash, M-Pesa, card and SHA payments recorded at the desk."
      />
      <TransactionListPanel />
    </div>
  );
}
