import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Download,
  Search,
  Monitor,
  Eye,
  ShieldCheck,
  ScrollText,
  FileText,
  Clock,
} from "lucide-react";
import {
  auditColor,
  Badge,
  EmptyState,
  DetailRow,
  FilterSelect,
  Modal,
  PageHeader,
  Panel,
  StatCard,
  th,
  td,
  tableWrap,
  theadRow,
  tbodyRow,
} from "@/components/kit";
import { audit, type AuditEntry } from "@/lib/data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/audit-log")({
  head: () => ({
    meta: [
      { title: "Audit Log — MediFlow" },
      {
        name: "description",
        content: "Searchable compliance trail of every void, edit, approval, export and AI action.",
      },
      { property: "og:title", content: "Audit Log — MediFlow" },
      {
        property: "og:description",
        content: "Searchable compliance trail of every void, edit, approval, export and AI action.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditLog,
});

const dateOf = (ts: string) => ts.split(", ")[0] ?? ts;

function AuditLog() {
  const [q, setQ] = useState("");
  const [user, setUser] = useState("All");
  const [type, setType] = useState("All");
  const [role, setRole] = useState("All");
  const [date, setDate] = useState("All");
  const [entity, setEntity] = useState("All");
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const users = [...new Set(audit.map((a) => a.user))];
  const roles = [...new Set(audit.map((a) => a.role))];
  const dates = [...new Set(audit.map((a) => dateOf(a.ts)))];
  const types = [...new Set(audit.map((a) => a.type))];
  const entities = [...new Set(audit.map((a) => a.entityType))];

  const rows = useMemo(
    () =>
      audit.filter(
        (a) =>
          (user === "All" || a.user === user) &&
          (role === "All" || a.role === role) &&
          (date === "All" || dateOf(a.ts) === date) &&
          (type === "All" || a.type === type) &&
          (entity === "All" || a.entityType === entity) &&
          `${a.action} ${a.record} ${a.user} ${a.requestId} ${a.entityId}`
            .toLowerCase()
            .includes(q.toLowerCase()),
      ),
    [q, user, type, role, date, entity],
  );

  const sensitive = audit.filter(
    (a) => a.type === "void" || a.type === "delete" || a.type === "approve",
  ).length;

  const exportCsv = () => {
    const head = [
      "Timestamp",
      "User",
      "Role",
      "Action Type",
      "Action",
      "Entity",
      "Record",
      "Request ID",
      "IP/Device",
    ];
    const lines = [
      head,
      ...rows.map((a) => [
        a.ts,
        a.user,
        a.role,
        auditColor[a.type].label,
        a.action,
        a.entityType,
        a.record,
        a.requestId,
        a.device,
      ]),
    ].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const el = document.createElement("a");
    el.href = url;
    el.download = "mediflow-audit-log.csv";
    el.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} audit events`);
  };

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Every sensitive action, who did it, and from where."
        actions={
          <button
            onClick={exportCsv}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-glow hover:opacity-90"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={ScrollText}
          label="Audit Events"
          value={String(audit.length)}
          change={8.2}
        />
        <StatCard
          tone="yellow"
          icon={Clock}
          label="Today"
          value={String(audit.filter((a) => dateOf(a.ts) === "29 Oct 2026").length)}
          change={3.4}
        />
        <StatCard
          tone="pink"
          icon={ShieldCheck}
          label="Sensitive Actions"
          value={String(sensitive)}
          change={-1.7}
        />
        <StatCard
          tone="purple"
          icon={FileText}
          label="Exports"
          value={String(audit.filter((a) => a.type === "export").length)}
          change={2.1}
        />
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {Object.values(auditColor).map((c) => (
          <span
            key={c.label}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
              c.bg,
              c.text,
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {c.label}
          </span>
        ))}
      </div>
      <Panel>
        <div className="flex flex-col gap-3 xl:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search actions, record IDs or request IDs"
              className="h-10 w-full rounded-xl border border-input bg-transparent pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterSelect label="User" value={user} onChange={setUser} options={users} />
            <FilterSelect label="Action" value={type} onChange={setType} options={types} />
            <FilterSelect label="Role" value={role} onChange={setRole} options={roles} />
            <FilterSelect label="Entity" value={entity} onChange={setEntity} options={entities} />
            <FilterSelect label="Date" value={date} onChange={setDate} options={dates} />
          </div>
        </div>
        <div className={cn(tableWrap, "mt-4")}>
          <table className="w-full">
            <thead>
              <tr className={theadRow}>
                {[
                  "Timestamp",
                  "Actor",
                  "Action",
                  "Entity",
                  "Record",
                  "Request",
                  "IP / Device",
                  "Details",
                ].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const c = auditColor[a.type];
                return (
                  <tr key={a.id} className={tbodyRow}>
                    <td className={cn(td, "text-muted-foreground")}>{a.ts}</td>
                    <td className={td}>
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold">
                          {a.user
                            .replace(/^(Dr\.|Nurse) /, "")
                            .split(" ")
                            .map((w) => w[0])
                            .join("")}
                        </span>
                        <div>
                          <p className="font-medium">{a.user}</p>
                          <p className="text-xs text-muted-foreground">{a.role}</p>
                        </div>
                      </div>
                    </td>
                    <td className={td}>
                      <span
                        className={cn(
                          "mr-2 inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold uppercase",
                          c.bg,
                          c.text,
                        )}
                      >
                        {c.label}
                      </span>
                      {a.action}
                    </td>
                    <td className={td}>
                      <Badge tone="info">{a.entityType}</Badge>
                    </td>
                    <td className={cn(td, "font-mono text-xs")}>{a.record}</td>
                    <td className={cn(td, "font-mono text-xs text-muted-foreground")}>
                      {a.requestId}
                    </td>
                    <td className={cn(td, "text-xs text-muted-foreground")}>
                      <Monitor className="mr-1.5 inline h-3.5 w-3.5" />
                      {a.device}
                    </td>
                    <td className={td}>
                      <button
                        onClick={() => setSelected(a)}
                        aria-label="View audit details"
                        className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <EmptyState cols={8} message="No log entries match these filters." />
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Showing {rows.length} of {audit.length} entries · Logs retained for 7 years · Immutable
          audit trail
        </p>
      </Panel>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        wide
        title={selected ? `Audit ${selected.id}` : "Audit event"}
        subtitle={selected ? `${selected.action} · ${selected.ts}` : undefined}
        footer={
          <button
            onClick={() => setSelected(null)}
            className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
          >
            Close
          </button>
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <DetailRow label="Actor" value={`${selected.user} (${selected.role})`} />
              <DetailRow label="Action type" value={auditColor[selected.type].label} />
              <DetailRow label="Entity" value={`${selected.entityType} · ${selected.entityId}`} />
              <DetailRow label="Record" value={selected.record} />
              <DetailRow label="Request ID" value={selected.requestId} />
              <DetailRow label="IP address" value={selected.ip} />
            </div>
            <div className="rounded-xl bg-secondary p-3">
              <p className="text-xs text-muted-foreground">Device</p>
              <p className="mt-1 text-sm font-semibold">{selected.device}</p>
            </div>
            {(selected.before || selected.after) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Before
                  </p>
                  <pre className="overflow-x-auto rounded-xl bg-secondary p-3 text-xs">
                    {selected.before ? JSON.stringify(selected.before, null, 2) : "—"}
                  </pre>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    After
                  </p>
                  <pre className="overflow-x-auto rounded-xl bg-secondary p-3 text-xs">
                    {selected.after ? JSON.stringify(selected.after, null, 2) : "—"}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
