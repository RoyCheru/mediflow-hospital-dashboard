import { createFileRoute, Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { PageHeader, Panel } from "@/components/kit";

export const Route = createFileRoute("/patients")({
  head: () => ({
    meta: [
      { title: "Patients — MediFlow" },
      { name: "description", content: "Patient registry, records and admission history." },
      { property: "og:title", content: "Patients — MediFlow" },
      { property: "og:description", content: "Patient registry, records and admission history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="Patients" subtitle="Patient registry, records and admission history." />
      <Panel className="grid place-items-center py-20 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-grad-teal text-on-gradient shadow-glow"><Users className="h-6 w-6" /></span>
        <h2 className="mt-4 text-lg font-semibold">This module is next on the roadmap</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">Explore the Dashboard, Billing & Claims and Audit Log screens for the full experience.</p>
        <Link to="/" className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Back to Dashboard</Link>
      </Panel>
    </div>
  );
}
