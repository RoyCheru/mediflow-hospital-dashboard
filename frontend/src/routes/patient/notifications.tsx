import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Badge, PageHeader, Panel } from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { listMyNotifications } from "@/lib/api/patient";
import { formatDateTime, titleize } from "@/lib/format";

export const Route = createFileRoute("/patient/notifications")({
  head: () => ({ meta: [{ title: "Notifications — MediFlow" }] }),
  component: PatientNotificationsPage,
});

function PatientNotificationsPage() {
  const notifications = useQuery({
    queryKey: ["patient", "notifications", { page_size: 50 }],
    queryFn: () => listMyNotifications({ page_size: 50 }),
    staleTime: 30_000,
  });
  const items = notifications.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Appointment reminders, results and messages from your care team."
      />
      <Panel>
        {notifications.isLoading ? (
          <LoadingRows rows={4} />
        ) : notifications.error ? (
          <ErrorBlock error={notifications.error} onRetry={() => void notifications.refetch()} />
        ) : items.length === 0 ? (
          <EmptyBlock
            title="No notifications"
            message="Appointment and billing messages will appear here."
            icon={<Bell className="h-5 w-5" />}
          />
        ) : (
          <ul className="space-y-3">
            {items.map((notification) => (
              <li key={notification.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{titleize(notification.template_key)}</p>
                  <Badge>{titleize(notification.status)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[titleize(notification.channel), formatDateTime(notification.created_at)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {notification.last_error && (
                  <p className="mt-2 text-xs text-destructive">{notification.last_error}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
