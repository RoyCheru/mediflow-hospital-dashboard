import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Wallet, FileClock, BadgeCheck, Banknote, Eye, Ban, RotateCcw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge, PageHeader, Panel, StatCard, FilterSelect, th, td, tableWrap, theadRow, tbodyRow } from "@/components/kit";
import { claims as seedClaims, departments, invoices as seedInvoices, ksh, reconciliation } from "@/lib/data";
import { cn } from "@/lib/utils";

type Tab = "invoices" | "claims" | "reconciliation";

export const Route = createFileRoute("/billing")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } =>
    s.tab === "claims" || s.tab === "reconciliation" || s.tab === "invoices" ? { tab: s.tab } : {},
  head: () => ({
    meta: [
      { title: "Billing & Claims — MediFlow" },
      { name: "description", content: "Invoices, SHA claims tracking and daily cash reconciliation for your hospital." },
      { property: "og:title", content: "Billing & Claims — MediFlow" },
      { property: "og:description", content: "Invoices, SHA claims tracking and daily cash reconciliation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Billing,
});

const dates = ["Last 7 days", "Last 30 days", "This month"];

function Billing() {
  const { tab = "invoices" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [range, setRange] = useState("All");
  const [method, setMethod] = useState("All");
  const [status, setStatus] = useState("All");
  const [dept, setDept] = useState("All");
  const [invoices, setInvoices] = useState(seedInvoices);
  const [claims, setClaims] = useState(seedClaims);

  const statusOpts = tab === "claims" ? ["submitted", "under review", "approved", "rejected"] : tab === "invoices" ? ["paid", "pending", "voided"] : ["Balanced", "Discrepancy"];

  const inv = useMemo(() => invoices.filter((i) => (method === "All" || i.method === method) && (status === "All" || i.status === status) && (dept === "All" || i.dept === dept)), [invoices, method, status, dept]);
  const cl = useMemo(() => claims.filter((c) => (status === "All" || c.status === status) && (dept === "All" || c.dept === dept) && (method === "All" || method === "SHA")), [claims, status, dept, method]);
  const rec = reconciliation.filter((r) => status === "All" || (status === "Balanced") === (r.logged === r.system));

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "invoices", label: "All Invoices", count: invoices.length },
    { id: "claims", label: "SHA Claims Tracker", count: claims.length },
    { id: "reconciliation", label: "Reconciliation", count: reconciliation.filter((r) => r.logged !== r.system).length },
  ];

  return (
    <div>
      <PageHeader title="Billing & Claims" subtitle="Track invoices, SHA claims and cash at the front desk." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="teal" icon={Wallet} label="Revenue This Month" value="KSh 3.76M" change={16.2} />
        <StatCard tone="yellow" icon={FileClock} label="SHA Pending" value="KSh 1.24M" change={-4.3} />
        <StatCard tone="pink" icon={BadgeCheck} label="SHA Approved" value="KSh 2.04M" change={9.8} />
        <StatCard tone="purple" icon={Banknote} label="Cash Collected Today" value="KSh 18,400" change={3.1} />
      </div>
      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex overflow-x-auto rounded-xl bg-secondary p-1">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => { setStatus("All"); navigate({ search: { tab: t.id } }); }}
                className={cn("flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition", tab === t.id ? "bg-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:text-foreground")}>
                {t.label}<span className={cn("rounded-full px-1.5 text-[11px]", tab === t.id ? "bg-primary-foreground/20" : "bg-muted")}>{t.count}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterSelect label="Date" value={range} onChange={setRange} options={dates} />
            <FilterSelect label="Method" value={method} onChange={setMethod} options={["SHA", "M-Pesa", "Cash"]} />
            <FilterSelect label="Status" value={status} onChange={setStatus} options={statusOpts} />
            <FilterSelect label="Dept" value={dept} onChange={setDept} options={departments} />
          </div>
        </div>

        <div className={cn(tableWrap, "mt-5")}>
          {tab === "invoices" && (
            <table className="w-full">
              <thead><tr className={theadRow}>{["Invoice ID", "Patient", "Doctor", "Amount", "Method", "Status", "Date", "Actions"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {inv.map((i) => (
                  <tr key={i.id} className={cn(tbodyRow, i.status === "voided" && "opacity-60")}>
                    <td className={cn(td, "font-mono text-xs")}>{i.id}</td>
                    <td className={cn(td, "font-medium")}>{i.patient}<p className="text-xs font-normal text-muted-foreground">{i.dept}</p></td>
                    <td className={td}>{i.doctor}</td>
                    <td className={cn(td, "font-semibold")}>{ksh(i.amount)}</td>
                    <td className={td}><Badge>{i.method}</Badge></td>
                    <td className={td}><Badge>{i.status}</Badge></td>
                    <td className={cn(td, "text-muted-foreground")}>{i.date}</td>
                    <td className={td}>
                      <div className="flex gap-1">
                        <button aria-label="View invoice" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"><Eye className="h-4 w-4" /></button>
                        <button aria-label="Void invoice" disabled={i.status === "voided"} onClick={() => setInvoices((list) => list.map((x) => x.id === i.id ? { ...x, status: "voided" } : x))}
                          className="rounded-lg p-2 text-destructive hover:bg-destructive/15 disabled:pointer-events-none disabled:opacity-30"><Ban className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {inv.length === 0 && <Empty cols={8} />}
              </tbody>
            </table>
          )}

          {tab === "claims" && (
            <table className="w-full">
              <thead><tr className={theadRow}>{["Claim ID", "Patient", "Amount", "Submitted", "Status", "Days Pending", "Action"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {cl.map((c) => (
                  <tr key={c.id} className={tbodyRow}>
                    <td className={cn(td, "font-mono text-xs")}>{c.id}</td>
                    <td className={cn(td, "font-medium")}>{c.patient}<p className="text-xs font-normal text-muted-foreground">{c.dept}</p></td>
                    <td className={cn(td, "font-semibold")}>{ksh(c.amount)}</td>
                    <td className={cn(td, "text-muted-foreground")}>{c.submitted}</td>
                    <td className={td}><Badge>{c.status}</Badge></td>
                    <td className={td}>
                      {c.status === "approved" ? <span className="text-muted-foreground">—</span> : (
                        <span className={cn("inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold",
                          c.days >= 21 ? "bg-destructive/15 text-destructive" : c.days >= 14 ? "bg-warning/15 text-warning" : "text-muted-foreground")}>
                          {c.days >= 14 && <AlertTriangle className="h-3 w-3" />}{c.days} days
                        </span>
                      )}
                    </td>
                    <td className={td}>
                      {c.status === "rejected" ? (
                        <button onClick={() => setClaims((list) => list.map((x) => x.id === c.id ? { ...x, status: "submitted", days: 0 } : x))}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10">
                          <RotateCcw className="h-3.5 w-3.5" />Resubmit
                        </button>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
                {cl.length === 0 && <Empty cols={7} />}
              </tbody>
            </table>
          )}

          {tab === "reconciliation" && (
            <table className="w-full">
              <thead><tr className={theadRow}>{["Date", "Receptionist", "Cash Logged", "System Total", "Difference", "Status"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {rec.map((r) => {
                  const diff = r.logged - r.system;
                  return (
                    <tr key={r.date} className={cn(tbodyRow, diff !== 0 && "bg-destructive/5")}>
                      <td className={td}>{r.date}</td>
                      <td className={cn(td, "font-medium")}>{r.clerk}</td>
                      <td className={td}>{ksh(r.logged)}</td>
                      <td className={td}>{ksh(r.system)}</td>
                      <td className={cn(td, "font-semibold", diff === 0 ? "text-muted-foreground" : "text-destructive")}>{diff === 0 ? "—" : `${diff > 0 ? "+" : "−"}${ksh(Math.abs(diff))}`}</td>
                      <td className={td}>
                        {diff === 0
                          ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success"><CheckCircle2 className="h-4 w-4" />Balanced</span>
                          : <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive"><AlertTriangle className="h-4 w-4" />{diff > 0 ? "Over" : "Short"} — review</span>}
                      </td>
                    </tr>
                  );
                })}
                {rec.length === 0 && <Empty cols={6} />}
              </tbody>
            </table>
          )}
        </div>
        {tab === "claims" && <p className="mt-3 text-xs text-muted-foreground"><span className="text-warning">Orange</span> = pending 14+ days · <span className="text-destructive">Red</span> = 21+ days, escalate to SHA.</p>}
      </Panel>
    </div>
  );
}

function Empty({ cols }: { cols: number }) {
  return <tr><td colSpan={cols} className="py-10 text-center text-sm text-muted-foreground">Nothing matches these filters.</td></tr>;
}
