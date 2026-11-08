import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bell,
  CheckCircle2,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
  Smartphone,
  BellRing,
  Eye,
  Plus,
} from "lucide-react";
import {
  Badge,
  EmptyState,
  Field,
  FilterSelect,
  Modal,
  PageHeader,
  Panel,
  StatCard,
  inputCls,
  textareaCls,
  th,
  td,
  tableWrap,
  theadRow,
  tbodyRow,
} from "@/components/kit";
import {
  notifications as seedNotifications,
  notificationTemplates as seedTemplates,
  titleize,
  type Notification,
  type NotificationChannel,
  type NotificationStatus,
  type NotificationTemplate,
} from "@/lib/data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — MediFlow" },
      {
        name: "description",
        content: "Delivery logs, retries and message templates for patients and staff.",
      },
      { property: "og:title", content: "Notifications — MediFlow" },
      {
        property: "og:description",
        content: "Delivery logs, retries and message templates for patients and staff.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Tab = "log" | "templates" | "retry";
const channels: NotificationChannel[] = ["WHATSAPP", "EMAIL", "SMS", "IN_APP"];
const statuses: NotificationStatus[] = [
  "QUEUED",
  "SENDING",
  "SENT",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
];
const channelIcon = {
  WHATSAPP: MessageSquare,
  EMAIL: Mail,
  SMS: Smartphone,
  IN_APP: BellRing,
} as const;

function Page() {
  const [tab, setTab] = useState<Tab>("log");
  const [logs, setLogs] = useState<Notification[]>(seedNotifications);
  const [templates, setTemplates] = useState<NotificationTemplate[]>(seedTemplates);
  const [channel, setChannel] = useState("All");
  const [status, setStatus] = useState("All");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<null | "view" | "template" | "test">(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState({ subject: "", body: "", active: true });
  const [testForm, setTestForm] = useState({
    channel: "WHATSAPP" as NotificationChannel,
    template: "booking_confirmation",
    recipient: "",
  });

  const current = logs.find((n) => n.id === targetId);
  const currentTemplate = templates.find((t) => t.id === targetId);
  const list = logs.filter(
    (n) =>
      (channel === "All" || n.channel === channel) &&
      (status === "All" || n.status === status) &&
      `${n.id} ${n.template} ${n.recipient}`.toLowerCase().includes(q.toLowerCase()),
  );
  const failed = logs.filter((n) => n.status === "FAILED");
  const delivered = logs.filter((n) => n.status === "DELIVERED").length;
  const queued = logs.filter((n) => n.status === "QUEUED" || n.status === "SENDING").length;

  const retry = (id: string) => {
    setLogs((list) =>
      list.map((n) => {
        if (n.id !== id) return n;
        const { error: _error, ...rest } = n;
        return {
          ...rest,
          status: "SENT",
          sent: "29 Oct 2026, 17:20",
          attempts: n.attempts + 1,
          log: [...n.log, { attempt: n.attempts + 1, status: "SUCCESS", at: "29 Oct 2026, 17:20" }],
        };
      }),
    );
    toast.success("Notification retried successfully");
  };

  const retryAll = () => {
    setLogs((list) =>
      list.map((n) => {
        if (n.status !== "FAILED") return n;
        const { error: _error, ...rest } = n;
        return {
          ...rest,
          status: "SENT",
          sent: "29 Oct 2026, 17:20",
          attempts: n.attempts + 1,
          log: [...n.log, { attempt: n.attempts + 1, status: "SUCCESS", at: "29 Oct 2026, 17:20" }],
        };
      }),
    );
    toast.success(`${failed.length} notifications queued for retry`);
  };

  const openTemplate = (t: NotificationTemplate) => {
    setTargetId(t.id);
    setTemplateForm({ subject: t.subject, body: t.body, active: t.active });
    setModal("template");
  };

  const saveTemplate = () => {
    if (!currentTemplate) return;
    setTemplates((list) =>
      list.map((t) =>
        t.id === currentTemplate.id
          ? {
              ...t,
              subject: templateForm.subject,
              body: templateForm.body,
              active: templateForm.active,
              version: t.version + 1,
            }
          : t,
      ),
    );
    setModal(null);
    toast.success(`Template ${currentTemplate.key} published as v${currentTemplate.version + 1}`);
  };

  const sendTest = () => {
    if (!testForm.recipient.trim()) {
      toast.error("Recipient is required");
      return;
    }
    const next: Notification = {
      id: `nt-${6102 + logs.length}`,
      channel: testForm.channel,
      template: testForm.template,
      recipient: testForm.recipient,
      status: "QUEUED",
      attempts: 0,
      scheduled: "29 Oct 2026, 17:25",
      createdAt: "29 Oct 2026, 17:24",
      log: [],
    };
    setLogs((list) => [next, ...list]);
    setModal(null);
    setTestForm({ channel: "WHATSAPP", template: "booking_confirmation", recipient: "" });
    toast.success("Test notification queued");
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Delivery logs, retries and message templates for patients and staff."
        actions={
          <button
            onClick={() => setModal("test")}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <Send className="h-4 w-4" />
            Send test
          </button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={Send}
          label="Sent Today"
          value={String(logs.filter((n) => n.status === "SENT" || n.status === "DELIVERED").length)}
          change={7.2}
        />
        <StatCard
          tone="yellow"
          icon={CheckCircle2}
          label="Delivered"
          value={String(delivered)}
          change={5.8}
        />
        <StatCard
          tone="pink"
          icon={RefreshCw}
          label="Failed"
          value={String(failed.length)}
          change={-1.9}
        />
        <StatCard tone="purple" icon={Bell} label="Queued" value={String(queued)} change={2.4} />
      </div>

      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex overflow-x-auto rounded-xl bg-secondary p-1">
            {(
              [
                ["log", "Delivery log"],
                ["templates", "Templates"],
                ["retry", `Retry queue (${failed.length})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition",
                  tab === id
                    ? "bg-primary text-primary-foreground shadow-glow"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "log" && (
            <div className="flex flex-wrap gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search recipient or template…"
                className="h-10 min-w-52 rounded-xl border border-input bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <FilterSelect
                label="Channel"
                value={channel}
                onChange={setChannel}
                options={channels}
              />
              <FilterSelect label="Status" value={status} onChange={setStatus} options={statuses} />
            </div>
          )}
          {tab === "templates" && (
            <button
              onClick={() => setModal("test")}
              className="inline-flex items-center gap-2 rounded-xl border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
            >
              <Plus className="h-4 w-4" />
              Send test
            </button>
          )}
          {tab === "retry" && (
            <button
              onClick={retryAll}
              disabled={failed.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              <RefreshCw className="h-4 w-4" />
              Retry all
            </button>
          )}
        </div>

        {tab === "log" && (
          <div className={cn(tableWrap, "mt-5")}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  {[
                    "ID",
                    "Channel",
                    "Template",
                    "Recipient",
                    "Status",
                    "Attempts",
                    "Scheduled",
                    "Actions",
                  ].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((n) => {
                  const Icon = channelIcon[n.channel];
                  return (
                    <tr key={n.id} className={tbodyRow}>
                      <td className={cn(td, "font-mono text-xs")}>{n.id}</td>
                      <td className={td}>
                        <span className="inline-flex items-center gap-1.5">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          {titleize(n.channel)}
                        </span>
                      </td>
                      <td className={cn(td, "font-mono text-xs")}>{n.template}</td>
                      <td className={cn(td, "max-w-56 truncate")}>{n.recipient}</td>
                      <td className={td}>
                        <Badge
                          tone={
                            n.status === "FAILED"
                              ? "danger"
                              : n.status === "DELIVERED"
                                ? "success"
                                : n.status === "SENT"
                                  ? "info"
                                  : "warning"
                          }
                        >
                          {titleize(n.status)}
                        </Badge>
                      </td>
                      <td className={td}>{n.attempts}</td>
                      <td className={cn(td, "text-muted-foreground")}>{n.sent ?? n.scheduled}</td>
                      <td className={td}>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => {
                              setTargetId(n.id);
                              setModal("view");
                            }}
                            aria-label="View delivery log"
                            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {n.status === "FAILED" && (
                            <button
                              onClick={() => retry(n.id)}
                              aria-label="Retry notification"
                              className="rounded-lg p-2 text-warning hover:bg-warning/15"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {list.length === 0 && <EmptyState cols={8} />}
              </tbody>
            </table>
          </div>
        )}

        {tab === "templates" && (
          <div className={cn(tableWrap, "mt-5")}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  {["Template", "Channel", "Subject", "Version", "Status", "Actions"].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className={tbodyRow}>
                    <td className={td}>
                      <div className="font-medium">{t.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{t.key}</div>
                    </td>
                    <td className={td}>
                      <Badge tone="info">{titleize(t.channel)}</Badge>
                    </td>
                    <td className={cn(td, "max-w-64 truncate text-muted-foreground")}>
                      {t.subject}
                    </td>
                    <td className={td}>v{t.version}</td>
                    <td className={td}>
                      <Badge tone={t.active ? "success" : "muted"}>
                        {t.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className={td}>
                      <button
                        onClick={() => openTemplate(t)}
                        className="rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "retry" && (
          <div className="mt-5 space-y-2">
            {failed.map((n) => (
              <div
                key={n.id}
                className="flex flex-col gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {n.template} · {n.recipient}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {n.channel} · {n.attempts} attempts · {n.error}
                  </p>
                </div>
                <button
                  onClick={() => retry(n.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry now
                </button>
              </div>
            ))}
            {failed.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No failed notifications. You're all caught up.
              </p>
            )}
          </div>
        )}
      </Panel>

      {current && (
        <Modal
          open={modal === "view"}
          onClose={() => setModal(null)}
          title={`Delivery ${current.id}`}
          subtitle={`${current.template} · ${current.recipient}`}
          footer={
            <button
              onClick={() => setModal(null)}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Close
            </button>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Channel</p>
                <p className="mt-1 text-sm font-semibold">{titleize(current.channel)}</p>
              </div>
              <div className="rounded-xl bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="mt-1">
                  <Badge
                    tone={
                      current.status === "FAILED"
                        ? "danger"
                        : current.status === "DELIVERED"
                          ? "success"
                          : "info"
                    }
                  >
                    {titleize(current.status)}
                  </Badge>
                </p>
              </div>
              <div className="rounded-xl bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Attempts</p>
                <p className="mt-1 text-sm font-semibold">{current.attempts}</p>
              </div>
            </div>
            {current.error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {current.error}
              </div>
            )}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Attempt history
              </p>
              {current.log.length === 0 ? (
                <p className="text-sm text-muted-foreground">No attempts yet.</p>
              ) : (
                <ol className="space-y-2">
                  {current.log.map((a) => (
                    <li
                      key={a.attempt}
                      className="flex items-center justify-between rounded-xl bg-secondary p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          Attempt {a.attempt} · {a.status}
                        </p>
                        {a.error && <p className="text-xs text-destructive">{a.error}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground">{a.at}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            {current.status === "FAILED" && (
              <button
                onClick={() => {
                  retry(current.id);
                  setModal(null);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                <RefreshCw className="h-4 w-4" />
                Retry now
              </button>
            )}
          </div>
        </Modal>
      )}

      {currentTemplate && (
        <Modal
          open={modal === "template"}
          onClose={() => setModal(null)}
          wide
          title={`Edit template · ${currentTemplate.name}`}
          subtitle={`PATCH /admin/notification-templates/${currentTemplate.id}`}
          footer={
            <>
              <button
                onClick={() => setModal(null)}
                className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={saveTemplate}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Publish v{currentTemplate.version + 1}
              </button>
            </>
          }
        >
          <div className="grid gap-3">
            <Field label="Subject">
              <input
                className={inputCls}
                value={templateForm.subject}
                onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
              />
            </Field>
            <Field label="Body">
              <textarea
                className={textareaCls}
                value={templateForm.body}
                onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={templateForm.active}
                onChange={(e) => setTemplateForm({ ...templateForm, active: e.target.checked })}
              />
              Active
            </label>
            <p className="text-xs text-muted-foreground">
              Placeholders such as {"{patient_name}"} and {"{scheduled_start}"} are rendered at send
              time.
            </p>
          </div>
        </Modal>
      )}

      <Modal
        open={modal === "test"}
        onClose={() => setModal(null)}
        title="Send test notification"
        subtitle="POST /admin/notifications/:id/retry · simulated delivery"
        footer={
          <>
            <button
              onClick={() => setModal(null)}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={sendTest}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Queue test
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Channel">
            <select
              className={inputCls}
              value={testForm.channel}
              onChange={(e) =>
                setTestForm({ ...testForm, channel: e.target.value as NotificationChannel })
              }
            >
              {channels.map((c) => (
                <option key={c} value={c}>
                  {titleize(c)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Template">
            <select
              className={inputCls}
              value={testForm.template}
              onChange={(e) => setTestForm({ ...testForm, template: e.target.value })}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Recipient" className="sm:col-span-2">
            <input
              className={inputCls}
              value={testForm.recipient}
              onChange={(e) => setTestForm({ ...testForm, recipient: e.target.value })}
              placeholder="0712 345 678 or name@example.com"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
