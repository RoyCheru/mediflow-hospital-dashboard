import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { PageHeader } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { AllAppointments } from "@/components/admin/AllAppointments";
import { LiveQueuePanel } from "@/components/admin/LiveQueuePanel";
import { BookingDialog } from "@/components/frontdesk/BookingDialog";
import { queueRefetchInterval } from "@/lib/queuePolling";
import { adminViewKeys, getAdminQueue } from "@/lib/api/adminViews";
import { cn } from "@/lib/utils";

type AppointmentsTab = "all" | "queue";

export const Route = createFileRoute("/admin/appointments")({
  validateSearch: (search: Record<string, unknown>): { tab: AppointmentsTab } => ({
    tab: search["tab"] === "queue" ? "queue" : "all",
  }),
  head: () => ({
    meta: [
      { title: "Appointments — MediFlow" },
      { name: "description", content: "All appointments and today's live queue." },
      { property: "og:title", content: "Appointments — MediFlow" },
      { property: "og:description", content: "All appointments and today's live queue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { tab } = Route.useSearch();
  const [bookingOpen, setBookingOpen] = useState(false);

  const queueSummary = useQuery({
    queryKey: adminViewKeys.queue({}),
    queryFn: () => getAdminQueue(),
    // Shares the unfiltered queue cache entry with LiveQueuePanel, so the tab
    // label count and the panel never issue duplicate requests.
    refetchInterval: tab === "queue" ? queueRefetchInterval : false,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });

  const waiting = queueSummary.data?.total_waiting ?? 0;

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle="All appointments across every date, plus today's live queue."
        actions={
          <Button onClick={() => setBookingOpen(true)}>
            <CalendarPlus /> Book / walk-in
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            ["all", "All Appointments"],
            ["queue", `Live Queue${waiting ? ` (${waiting})` : ""}`],
          ] as const
        ).map(([id, label]) => (
          <Link
            key={id}
            to="/admin/appointments"
            search={{ tab: id }}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              tab === id
                ? "bg-primary text-primary-foreground shadow-glow"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === "queue" ? (
        <LiveQueuePanel />
      ) : (
        <AllAppointments onBook={() => setBookingOpen(true)} />
      )}

      <BookingDialog open={bookingOpen} onClose={() => setBookingOpen(false)} />
    </div>
  );
}
