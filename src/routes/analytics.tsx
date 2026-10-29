import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { PageHeader, Panel } from "@/components/kit";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — MediFlow" },
      { name: "description", content: "Operational and financial insights." },
      { property: "og:title", content: "Analytics — MediFlow" },
      { property: "og:description", content: "Operational and financial insights." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="Analytics" subtitle="Operational and financial insights." />
      <Panel className="grid place-items-center py-20 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-grad-teal text-on-gradient shadow-glow"><BarChart3 className="h-6 w-6" /></span>
        <h2 className="mt-4 text-lg font-semibold">This module is next on the roadmap</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">Explore the Dashboard, Billing & Claims and Audit Log screens for the full experience.</p>
        <Link to="/" className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Back to Dashboard</Link>
      </Panel>
    </div>
  );
}
