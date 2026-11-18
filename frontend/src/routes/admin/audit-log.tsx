import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, FileText, Monitor, Search, ShieldCheck } from "lucide-react";
import {
  Badge,
  DetailRow,
  EmptyState,
  FilterSelect,
  Modal,
  PageHeader,
  Panel,
  StatCard,
  inputCls,
  td,
  th,
  tableWrap,
  tbodyRow,
  theadRow,
} from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { auditKeys, exportAuditCsv, listAuditEvents } from "@/lib/api/audit";
import { formatDateTime, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { AuditEntry } from "@/types/api";

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
        content: "Searchable compliance trail of every sensitive action.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditLog,
});

const roles = ["ADMIN", "DOCTOR", "RECEPTIONIST", "CASHIER", "PATIENT"];

function AuditLog() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("All");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const params = {
    page,
    page_size: 15,
    sort: "-created_at",
    q: q || undefined,
    role: role === "All" ? undefined : role,
    action: action || undefined,
    entity_type: entity || undefined,
    start_date: startDate || undefined,
    end_date: endDate || undefined,
  };
  const auditQuery = useQuery({
    queryKey: auditKeys.list(params),
    queryFn: () => listAuditEvents(params),
    staleTime: 20_000,
  });

  const rows = auditQuery.data?.items ?? [];
  const sensitive = rows.filter((item) => /void|delete|approve|reject/i.test(item.action)).length;
  const exports = rows.filter((item) => /export/i.test(item.action)).length;

  const resetPage = (fn: () => void) => {
    fn();
    setPage(1);
  };

  async function exportCsv() {
    try {
      const blob = await exportAuditCsv(params);
      const url = URL.createObjectURL(blob);
      const element = document.createElement("a");
      element.href = url;
      element.download = "mediflow-audit-log.csv";
      element.click();
      URL.revokeObjectURL(url);
      toast.success("Audit log exported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to export the audit log");
    }
  }

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Every sensitive action, who did it, and from where."
        actions={
          <Button onClick={() => void exportCsv()}>
            <Download /> Export CSV
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={FileText}
          label="Audit events"
          value={String(auditQuery.data?.meta.total ?? 0)}
          change={null}
        />
        <StatCard
          tone="yellow"
          icon={Monitor}
          label="On this page"
          value={String(rows.length)}
          change={null}
        />
        <StatCard
          tone="pink"
          icon={ShieldCheck}
          label="Sensitive (page)"
          value={String(sensitive)}
          change={null}
        />
        <StatCard
          tone="purple"
          icon={Download}
          label="Exports (page)"
          value={String(exports)}
          change={null}
        />
      </div>

      <Panel>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          <div className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(event) => resetPage(() => setQ(event.target.value))}
              placeholder="Search actor, action, entity or request ID"
              className={cn(inputCls, "pl-10")}
            />
          </div>
          <FilterSelect
            label="Role"
            value={role}
            onChange={(value) => resetPage(() => setRole(value))}
            options={roles}
          />
          <input
            value={action}
            onChange={(event) => resetPage(() => setAction(event.target.value))}
            placeholder="Filter action e.g. invoice.create"
            className={inputCls}
          />
          <input
            value={entity}
            onChange={(event) => resetPage(() => setEntity(event.target.value))}
            placeholder="Filter entity type"
            className={inputCls}
          />
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted-foreground">From</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => resetPage(() => setStartDate(event.target.value))}
              className={inputCls}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted-foreground">To</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => resetPage(() => setEndDate(event.target.value))}
              className={inputCls}
            />
          </label>
        </div>

        <div className={cn(tableWrap, "mt-4")}>
          <table className="w-full">
            <thead>
              <tr className={theadRow}>
                <th className={th}>Timestamp</th>
                <th className={th}>Actor</th>
                <th className={th}>Role</th>
                <th className={th}>Action</th>
                <th className={th}>Entity</th>
                <th className={th}>Entity ID</th>
                <th className={th}>IP / device</th>
                <th className={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {auditQuery.isLoading ? (
                <tr>
                  <td colSpan={8} className="p-0">
                    <LoadingRows rows={5} className="p-3" />
                  </td>
                </tr>
              ) : auditQuery.error ? (
                <tr>
                  <td colSpan={8} className="p-3">
                    <ErrorBlock
                      error={auditQuery.error}
                      onRetry={() => void auditQuery.refetch()}
                    />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <EmptyState cols={8} message="No audit events match these filters." />
              ) : (
                rows.map((entry) => (
                  <tr key={entry.id} className={tbodyRow}>
                    <td className={cn(td, "text-muted-foreground")}>
                      {formatDateTime(entry.created_at)}
                    </td>
                    <td className={cn(td, "font-medium")}>{entry.actor_name ?? "System"}</td>
                    <td className={td}>
                      {entry.actor_role ? (
                        <Badge tone="muted">{titleize(entry.actor_role)}</Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={td}>{titleize(entry.action)}</td>
                    <td className={td}>{titleize(entry.entity_type)}</td>
                    <td className={cn(td, "font-mono text-xs text-muted-foreground")}>
                      {entry.entity_id?.slice(0, 12) ?? "—"}
                    </td>
                    <td className={cn(td, "max-w-64 truncate text-muted-foreground")}>
                      {entry.ip_address ?? entry.user_agent ?? "—"}
                    </td>
                    <td className={td}>
                      <Button size="sm" variant="outline" onClick={() => setSelected(entry)}>
                        <Eye /> View
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
            Page {page} of {Math.max(auditQuery.data?.meta.pages ?? 1, 1)} ·{" "}
            {auditQuery.data?.meta.total ?? 0} events
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
              disabled={page >= (auditQuery.data?.meta.pages ?? 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Panel>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Audit event"
        subtitle={selected ? formatDateTime(selected.created_at) : undefined}
        wide
        footer={
          <Button variant="outline" onClick={() => setSelected(null)}>
            Close
          </Button>
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="Actor" value={selected.actor_name ?? "System"} />
              <DetailRow label="Role" value={titleize(selected.actor_role)} />
              <DetailRow label="Action" value={titleize(selected.action)} />
              <DetailRow label="Entity" value={titleize(selected.entity_type)} />
              <DetailRow label="Entity ID" value={selected.entity_id ?? "—"} />
              <DetailRow label="Request ID" value={selected.request_id ?? "—"} />
              <DetailRow label="IP address" value={selected.ip_address ?? "—"} />
              <DetailRow label="User agent" value={selected.user_agent ?? "—"} />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Before
                </p>
                <pre className="max-h-64 overflow-auto rounded-xl bg-secondary/60 p-3 text-xs">
                  {selected.before ? JSON.stringify(selected.before, null, 2) : "—"}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  After
                </p>
                <pre className="max-h-64 overflow-auto rounded-xl bg-secondary/60 p-3 text-xs">
                  {selected.after ? JSON.stringify(selected.after, null, 2) : "—"}
                </pre>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
