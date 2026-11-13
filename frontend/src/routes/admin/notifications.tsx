import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Mail, RefreshCw, Send, Smartphone } from "lucide-react";
import {
  Badge,
  DetailRow,
  EmptyState,
  Field,
  FilterSelect,
  Modal,
  PageHeader,
  Panel,
  StatCard,
  inputCls,
  textareaCls,
  td,
  th,
  tableWrap,
  tbodyRow,
  theadRow,
} from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import {
  listNotifications,
  listTemplates,
  notificationKeys,
  retryNotification,
  updateTemplate,
} from "@/lib/api/notifications";
import { formatDateTime, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { NotificationTemplate } from "@/types/api";

export const Route = createFileRoute("/admin/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — MediFlow" },
      { name: "description", content: "Patient communication delivery log and templates." },
      { property: "og:title", content: "Notifications — MediFlow" },
      {
        property: "og:description",
        content: "Patient communication delivery log and templates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const channels = ["WHATSAPP", "EMAIL", "SMS", "IN_APP"];
const statuses = ["QUEUED", "SENDING", "SENT", "DELIVERED", "FAILED", "CANCELLED"];

function Page() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"log" | "templates">("log");
  const [channel, setChannel] = useState("All");
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(1);
  const [template, setTemplate] = useState<NotificationTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({ subject: "", body: "", active: true });

  const params = {
    page,
    page_size: 15,
    channel: channel === "All" ? undefined : channel,
    status: status === "All" ? undefined : status,
  };
  const notificationsQuery = useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () => listNotifications(params),
    staleTime: 20_000,
  });
  const templatesQuery = useQuery({
    queryKey: notificationKeys.templates,
    queryFn: listTemplates,
    staleTime: 120_000,
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => retryNotification(id),
    onSuccess: () => {
      toast.success("Notification queued for retry");
      void queryClient.invalidateQueries({ queryKey: ["admin", "notifications"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const templateMutation = useMutation({
    mutationFn: () => {
      if (!template) throw new Error("No template selected");
      return updateTemplate(template.id, {
        subject: templateForm.subject || undefined,
        body: templateForm.body,
        is_active: templateForm.active,
      });
    },
    onSuccess: () => {
      toast.success("Template updated");
      setTemplate(null);
      void queryClient.invalidateQueries({ queryKey: notificationKeys.templates });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resetPage = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const rows = notificationsQuery.data?.items ?? [];
  const failed = rows.filter((item) => item.status === "FAILED").length;
  const queued = rows.filter((item) => item.status === "QUEUED").length;
  const sent = rows.filter((item) => ["SENT", "DELIVERED"].includes(item.status)).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Delivery log, provider errors and editable templates."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={Bell}
          label="Notifications"
          value={String(notificationsQuery.data?.meta.total ?? 0)}
          change={null}
        />
        <StatCard
          tone="yellow"
          icon={Send}
          label="Sent (page)"
          value={String(sent)}
          change={null}
        />
        <StatCard
          tone="pink"
          icon={RefreshCw}
          label="Queued (page)"
          value={String(queued)}
          change={null}
        />
        <StatCard
          tone="purple"
          icon={Mail}
          label="Failed (page)"
          value={String(failed)}
          change={null}
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {(["log", "templates"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              tab === value
                ? "bg-primary text-primary-foreground shadow-glow"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "log" ? <Bell className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            {value === "log" ? "Delivery log" : "Templates"}
          </button>
        ))}
      </div>

      {tab === "log" ? (
        <Panel>
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              label="Channel"
              value={channel}
              onChange={(value) => resetPage(() => setChannel(value))}
              options={channels}
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={(value) => resetPage(() => setStatus(value))}
              options={statuses}
            />
          </div>

          <div className={cn(tableWrap, "mt-4")}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Channel</th>
                  <th className={th}>Template</th>
                  <th className={th}>Status</th>
                  <th className={th}>Attempts</th>
                  <th className={th}>Scheduled</th>
                  <th className={th}>Sent</th>
                  <th className={th}>Last error</th>
                  <th className={th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {notificationsQuery.isLoading ? (
                  <tr>
                    <td colSpan={8} className="p-0">
                      <LoadingRows rows={5} className="p-3" />
                    </td>
                  </tr>
                ) : notificationsQuery.error ? (
                  <tr>
                    <td colSpan={8} className="p-3">
                      <ErrorBlock
                        error={notificationsQuery.error}
                        onRetry={() => void notificationsQuery.refetch()}
                      />
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <EmptyState cols={8} message="No notifications match these filters." />
                ) : (
                  rows.map((item) => (
                    <tr key={item.id} className={tbodyRow}>
                      <td className={td}>
                        <span className="inline-flex items-center gap-2">
                          {item.channel === "EMAIL" ? (
                            <Mail className="h-4 w-4" />
                          ) : (
                            <Smartphone className="h-4 w-4" />
                          )}
                          {titleize(item.channel)}
                        </span>
                      </td>
                      <td className={td}>{item.template_key}</td>
                      <td className={td}>
                        <Badge>{titleize(item.status)}</Badge>
                      </td>
                      <td className={td}>{item.attempts}</td>
                      <td className={td}>{formatDateTime(item.scheduled_at)}</td>
                      <td className={td}>{formatDateTime(item.sent_at)}</td>
                      <td className={cn(td, "max-w-64 truncate text-muted-foreground")}>
                        {item.last_error ?? "—"}
                      </td>
                      <td className={td}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => retryMutation.mutate(item.id)}
                          disabled={retryMutation.isPending}
                        >
                          <RefreshCw /> Retry
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              Page {page} of {Math.max(notificationsQuery.data?.meta.pages ?? 1, 1)} ·{" "}
              {notificationsQuery.data?.meta.total ?? 0} notifications
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((value) => value + 1)}
                disabled={page >= (notificationsQuery.data?.meta.pages ?? 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel title="Notification templates">
          {templatesQuery.isLoading ? (
            <LoadingRows rows={5} />
          ) : templatesQuery.error ? (
            <ErrorBlock
              error={templatesQuery.error}
              onRetry={() => void templatesQuery.refetch()}
            />
          ) : (
            <div className={tableWrap}>
              <table className="w-full">
                <thead>
                  <tr className={theadRow}>
                    <th className={th}>Key</th>
                    <th className={th}>Channel</th>
                    <th className={th}>Name</th>
                    <th className={th}>Subject</th>
                    <th className={th}>Status</th>
                    <th className={th}>Version</th>
                    <th className={th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {templatesQuery.data?.items.map((item) => (
                    <tr key={item.id} className={tbodyRow}>
                      <td className={cn(td, "font-mono text-xs")}>{item.key}</td>
                      <td className={td}>{titleize(item.channel)}</td>
                      <td className={td}>{item.name}</td>
                      <td className={cn(td, "max-w-64 truncate")}>{item.subject ?? "—"}</td>
                      <td className={td}>
                        <Badge tone={item.is_active ? "success" : "muted"}>
                          {item.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className={td}>{item.version}</td>
                      <td className={td}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setTemplate(item);
                            setTemplateForm({
                              subject: item.subject ?? "",
                              body: item.body,
                              active: item.is_active,
                            });
                          }}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <Modal
        open={Boolean(template)}
        onClose={() => setTemplate(null)}
        title="Edit notification template"
        subtitle={template ? `${template.key} · ${template.channel}` : undefined}
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setTemplate(null)}>
              Cancel
            </Button>
            <Button onClick={() => templateMutation.mutate()} disabled={templateMutation.isPending}>
              {templateMutation.isPending ? "Saving…" : "Save template"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <DetailRow label="Template name" value={template?.name ?? "—"} />
          <Field label="Subject">
            <input
              className={inputCls}
              value={templateForm.subject}
              onChange={(event) =>
                setTemplateForm({ ...templateForm, subject: event.target.value })
              }
            />
          </Field>
          <Field label="Body">
            <textarea
              className={textareaCls}
              value={templateForm.body}
              onChange={(event) => setTemplateForm({ ...templateForm, body: event.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={templateForm.active}
              onChange={(event) =>
                setTemplateForm({ ...templateForm, active: event.target.checked })
              }
            />
            Active
          </label>
        </div>
      </Modal>
    </div>
  );
}
