import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/kit";
import { CashReconciliationPanel } from "@/components/billing/CashReconciliationPanel";

export const Route = createFileRoute("/cashier/reconciliation")({
  head: () => ({ meta: [{ title: "Cash Reconciliation — MediFlow" }] }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader
        title="Cash Reconciliation"
        subtitle="Count the drawer against today's expected cash and settle unconfirmed payments."
      />
      <CashReconciliationPanel />
    </div>
  );
}
