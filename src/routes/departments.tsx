import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { PageHeader, Panel } from "@/components/kit";

export const Route = createFileRoute("/departments")({
  head: () => ({
    meta: [
      { title: "Departments — MediFlow" },
      { name: "description", content: "Capacity and performance across departments." },
      { property: "og:title", content: "Departments — MediFlow" },
      { property: "og:description", content: "Capacity and performance across departments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="Departments" subtitle="Capacity and performance across departments." />
      <Panel className="grid place-items-center py-20 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-grad-teal text-on-gradient shadow-glow"><Building2 className="h-6 w-6" /></span>
        <h2 className="mt-4 text-lg font-semibold">This module is next on the roadmap</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">Explore the Dashboard, Billing & Claims and Audit Log screens for the full experience.</p>
        <Link to="/" className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Back to Dashboard</Link>
      </Panel>
    </div>
  );
}
