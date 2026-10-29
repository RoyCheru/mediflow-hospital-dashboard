import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { PageHeader, Panel } from "@/components/kit";

export const Route = createFileRoute("/appointments")({
  head: () => ({
    meta: [
      { title: "Appointments — MediFlow" },
      { name: "description", content: "Book, reschedule and track patient visits." },
      { property: "og:title", content: "Appointments — MediFlow" },
      { property: "og:description", content: "Book, reschedule and track patient visits." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="Appointments" subtitle="Book, reschedule and track patient visits." />
      <Panel className="grid place-items-center py-20 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-grad-teal text-on-gradient shadow-glow"><CalendarDays className="h-6 w-6" /></span>
        <h2 className="mt-4 text-lg font-semibold">This module is next on the roadmap</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">Explore the Dashboard, Billing & Claims and Audit Log screens for the full experience.</p>
        <Link to="/" className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Back to Dashboard</Link>
      </Panel>
    </div>
  );
}
