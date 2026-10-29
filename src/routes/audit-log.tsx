import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Search, Monitor } from "lucide-react";
import { PageHeader, Panel, FilterSelect, th, td, tableWrap, theadRow, tbodyRow } from "@/components/kit";
import { audit, type AuditType } from "@/lib/data";
import { cn } from "@/lib/utils";

export const auditColor: Record<AuditType, { bg: string; text: string; label: string }> = {
  void: { bg: "bg-destructive/15", text: "text-destructive", label: "Void" },
  delete: { bg: "bg-destructive/15", text: "text-destructive", label: "Delete" },
  edit: { bg: "bg-info/15", text: "text-info", label: "Edit" },
  approve: { bg: "bg-success/15", text: "text-success", label: "Approve" },
  create: { bg: "bg-primary/15", text: "text-primary", label: "Create" },
  login: { bg: "bg-muted", text: "text-muted-foreground", label: "Sign-in" },
};

export const Route = createFileRoute("/audit-log")({
  head: () => ({
    meta: [
      { title: "Audit Log — MediFlow" },
      { name: "description", content: "Searchable compliance trail of every void, edit and approval across MediFlow." },
      { property: "og:title", content: "Audit Log — MediFlow" },
      { property: "og:description", content: "Searchable compliance trail of every void, edit and approval." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditLog,
});

const dateOf = (ts: string) => ts.split(", ")[0];

function AuditLog() {
  const [q, setQ] = useState("");
  const [user, setUser] = useState("All");
  const [type, setType] = useState("All");
  const [role, setRole] = useState("All");
  const [date, setDate] = useState("All");
  const users = [...new Set(audit.map((a) => a.user))];
  const roles = [...new Set(audit.map((a) => a.role))];
  const dates = [...new Set(audit.map((a) => dateOf(a.ts)))];
  const rows = useMemo(() => audit.filter((a) =>
    (user === "All" || a.user === user) && (role === "All" || a.role === role) && (date === "All" || dateOf(a.ts) === date) &&
    (type === "All" || auditColor[a.type].label === type) &&
    `${a.action} ${a.record} ${a.user}`.toLowerCase().includes(q.toLowerCase())), [q, user, type, role, date]);

  const exportCsv = () => {
    const head = ["Timestamp", "User", "Role", "Action Type", "Action", "Record", "IP/Device"];
    const lines = [head, ...rows.map((a) => [a.ts, a.user, a.role, auditColor[a.type].label, a.action, a.record, a.device])]
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const el = document.createElement("a"); el.href = url; el.download = "mediflow-audit-log.csv"; el.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Every sensitive action, who did it, and from where."
        actions={<button onClick={exportCsv} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-glow hover:opacity-90"><Download className="h-4 w-4" />Export CSV</button>}
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {Object.values(auditColor).map((c) => (
          <span key={c.label} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", c.bg, c.text)}><span className="h-1.5 w-1.5 rounded-full bg-current" />{c.label}</span>
        ))}
      </div>
      <Panel>
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search actions or record IDs" className="h-10 w-full rounded-xl border border-input bg-transparent pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterSelect label="User" value={user} onChange={setUser} options={users} />
            <FilterSelect label="Action" value={type} onChange={setType} options={Object.values(auditColor).map((c) => c.label)} />
            <FilterSelect label="Role" value={role} onChange={setRole} options={roles} />
            <FilterSelect label="Date" value={date} onChange={setDate} options={dates} />
          </div>
        </div>
        <div className={cn(tableWrap, "mt-4")}>
          <table className="w-full">
            <thead><tr className={theadRow}><th className={th}>Timestamp</th><th className={th}>User</th><th className={th}>Action</th><th className={th}>Record</th><th className={th}>IP / Device</th></tr></thead>
            <tbody>
              {rows.map((a) => {
                const c = auditColor[a.type];
                return (
                  <tr key={a.ts + a.action} className={tbodyRow}>
                    <td className={cn(td, "text-muted-foreground")}>{a.ts}</td>
                    <td className={td}>
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold">{a.user.replace(/^(Dr\.|Nurse) /, "").split(" ").map((w) => w[0]).join("")}</span>
                        <div><p className="font-medium">{a.user}</p><p className="text-xs text-muted-foreground">{a.role}</p></div>
                      </div>
                    </td>
                    <td className={td}>
                      <span className={cn("mr-2 inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold uppercase", c.bg, c.text)}>{c.label}</span>
                      {a.action}
                    </td>
                    <td className={cn(td, "font-mono text-xs")}>{a.record}</td>
                    <td className={cn(td, "text-xs text-muted-foreground")}><Monitor className="mr-1.5 inline h-3.5 w-3.5" />{a.device}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-sm text-muted-foreground">No log entries match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Showing {rows.length} of {audit.length} entries · Logs retained for 7 years</p>
      </Panel>
    </div>
  );
}
