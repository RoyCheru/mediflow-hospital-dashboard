import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Users, CalendarCheck, Wallet, FileClock, Search, SlidersHorizontal, ChevronLeft, ChevronRight, Plus, Clock, ArrowUpRight } from "lucide-react";
import { auditColor, Badge, Panel, StatCard, FilterSelect, th, td, tableWrap, theadRow, tbodyRow } from "@/components/kit";
import { audit, claims, departments, ksh, paymentSplit, people, revenueByDept, revenueByMethod, schedule } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — MediFlow Hospital Management" },
      { name: "description", content: "Live overview of patients, appointments, revenue and SHA claims at your hospital." },
      { property: "og:title", content: "Dashboard — MediFlow Hospital Management" },
      { property: "og:description", content: "Live overview of patients, appointments, revenue and SHA claims." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const methodKeys = [
  { k: "SHA", c: "var(--sha)" }, { k: "M-Pesa", c: "var(--mpesa)" }, { k: "Cash", c: "var(--cash)" },
];
const deptKeys = [
  { k: "Cardiology", c: "var(--chart-1)" }, { k: "Pediatrics", c: "var(--chart-2)" }, { k: "Maternity", c: "var(--chart-3)" }, { k: "Outpatient", c: "var(--chart-4)" },
];

function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Habari, Samuel 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">Here's what's happening at MediFlow General Hospital today.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="teal" icon={Users} label="Total Patients" value="12,486" change={10.4} />
        <StatCard tone="yellow" icon={CalendarCheck} label="Total Appointments" value="1,284" change={8.6} />
        <StatCard tone="pink" icon={Wallet} label="Revenue (Oct)" value="KSh 3.76M" change={16.2} />
        <StatCard tone="purple" icon={FileClock} label="Pending SHA Claims" value="47" change={-4.3} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_280px]">
            <RevenueChart />
            <PaymentDonut />
          </div>
          <PeopleTable />
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-1 xl:content-start">
          <ScheduleCard />
          <div className="space-y-6">
            <ClaimsPreview />
            <AuditPreview />
          </div>
        </div>
      </div>
    </div>
  );
}

function RevenueChart() {
  const [mode, setMode] = useState<"method" | "dept">("method");
  const data = mode === "method" ? revenueByMethod : revenueByDept;
  const keys = mode === "method" ? methodKeys : deptKeys;
  return (
    <Panel
      title="Revenue Trend"
      action={
        <div className="flex rounded-xl bg-secondary p-1 text-xs font-semibold">
          {(["method", "dept"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn("rounded-lg px-3 py-1.5 transition", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {m === "method" ? "By Payment Method" : "By Department"}
            </button>
          ))}
        </div>
      }
    >
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {keys.map((k) => <span key={k.k} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: k.c }} />{k.k}</span>)}
      </div>
      <div className="h-60">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ left: -18, right: 6, top: 6 }}>
            <defs>
              {keys.map((k, i) => (
                <linearGradient key={k.k} id={`g${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={k.c} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={k.c} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}M`} />
            <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)" }} formatter={(v: number) => `KSh ${v}M`} />
            {keys.map((k, i) => <Area key={k.k} type="monotone" dataKey={k.k} stroke={k.c} strokeWidth={2.5} fill={`url(#g${i})`} />)}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function PaymentDonut() {
  return (
    <Panel title="Payment Methods">
      <div className="relative mx-auto h-44 w-44">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={paymentSplit} dataKey="value" innerRadius={56} outerRadius={80} paddingAngle={3} stroke="none" cornerRadius={6}>
              {paymentSplit.map((p) => <Cell key={p.name} fill={p.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div><p className="text-2xl font-bold">3.76M</p><p className="text-xs text-muted-foreground">KSh this month</p></div>
        </div>
      </div>
      <ul className="mt-4 space-y-2.5">
        {paymentSplit.map((p) => (
          <li key={p.name} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />{p.name}</span>
            <span className="font-semibold">{p.value}%</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function PeopleTable() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("All");
  const [dept, setDept] = useState("All");
  const [adv, setAdv] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const rows = useMemo(() => people.filter((p) =>
    (kind === "All" || p.kind === kind) && (dept === "All" || p.dept === dept) &&
    (p.name.toLowerCase().includes(q.toLowerCase()) || p.id.toLowerCase().includes(q.toLowerCase()))), [q, kind, dept]);
  const all = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <Panel title="Staff & Patient Management" action={<Link to="/patients" className="text-sm font-semibold text-primary hover:underline">See All</Link>}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or ID" className="h-11 w-full rounded-xl border border-input bg-transparent pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <button onClick={() => setAdv((v) => !v)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-glow hover:opacity-90">
          <SlidersHorizontal className="h-4 w-4" /> Advance Filter
        </button>
      </div>
      {adv && (
        <div className="mt-3 flex flex-wrap gap-2 rounded-xl bg-secondary/60 p-3 animate-in fade-in">
          <FilterSelect label="Type" value={kind} onChange={setKind} options={["Patient", "Staff"]} />
          <FilterSelect label="Department" value={dept} onChange={setDept} options={departments} />
          <button onClick={() => { setKind("All"); setDept("All"); setQ(""); }} className="h-10 rounded-xl px-3 text-sm text-muted-foreground hover:text-foreground">Reset</button>
        </div>
      )}
      {sel.size > 0 && <p className="mt-3 text-sm text-primary">{sel.size} selected</p>}
      <div className={cn(tableWrap, "mt-4")}>
        <table className="w-full">
          <thead><tr className={theadRow}>
            <th className={th}><input type="checkbox" aria-label="Select all" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} className="h-4 w-4 accent-primary" /></th>
            <th className={th}>ID</th><th className={th}>Name</th><th className={th}>Type</th><th className={th}>Department</th><th className={th}>Date</th><th className={th}>Details</th><th className={th}>Status</th>
          </tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={tbodyRow}>
                <td className={td}><input type="checkbox" aria-label={`Select ${p.name}`} checked={sel.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-primary" /></td>
                <td className={cn(td, "text-muted-foreground")}>{p.id}</td>
                <td className={cn(td, "font-medium")}>{p.name}</td>
                <td className={td}><Badge tone={p.kind === "Staff" ? "info" : "muted"}>{p.kind}</Badge></td>
                <td className={td}>{p.dept}</td>
                <td className={cn(td, "text-muted-foreground")}>{p.date}</td>
                <td className={td}>{p.detail}</td>
                <td className={td}><Badge>{p.status}</Badge></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">No matches found.</td></tr>}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ScheduleCard() {
  const days = [["Mon", 26], ["Tue", 27], ["Wed", 28], ["Thu", 29], ["Fri", 30]] as const;
  const [day, setDay] = useState(29);
  return (
    <Panel title="October 2026" action={<Link to="/appointments" className="inline-flex items-center gap-1.5 rounded-xl border border-primary px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10"><Plus className="h-4 w-4" />Book</Link>}>
      <div className="flex items-center gap-1">
        <button aria-label="Previous week" className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary"><ChevronLeft className="h-4 w-4" /></button>
        <div className="grid flex-1 grid-cols-5 gap-1.5">
          {days.map(([d, n]) => (
            <button key={n} onClick={() => setDay(n)} className={cn("rounded-xl py-2.5 text-center text-sm transition", day === n ? "bg-primary text-primary-foreground shadow-glow" : "bg-secondary hover:bg-accent")}>
              <span className="block text-xs opacity-80">{d}</span><span className="block font-semibold">{n}</span>
            </button>
          ))}
        </div>
        <button aria-label="Next week" className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <h3 className="font-semibold">Upcoming bookings</h3>
        <span className="text-xs text-muted-foreground">{schedule.length} today</span>
      </div>
      <ul className="mt-3 space-y-3">
        {schedule.map((s) => (
          <li key={s.time} className="flex gap-3 rounded-xl bg-secondary/60 p-3">
            <div className="w-14 shrink-0 text-center"><Clock className="mx-auto h-4 w-4 text-primary" /><p className="mt-1 text-xs font-semibold">{s.time}</p></div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{s.title}</p>
              <p className="truncate text-xs text-muted-foreground">{s.who} · {s.doctor}</p>
            </div>
            <span className="self-center text-[11px] text-muted-foreground">{s.dept}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ClaimsPreview() {
  const urgent = [...claims].filter((c) => c.status !== "approved").sort((a, b) => b.days - a.days).slice(0, 4);
  return (
    <Panel title="Urgent SHA Claims" action={<Link to="/billing" search={{ tab: "claims" }} className="text-sm font-semibold text-primary hover:underline">See All</Link>}>
      <ul className="divide-y divide-border">
        {urgent.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{c.patient}</p>
              <p className="text-xs text-muted-foreground">{c.id} · {ksh(c.amount)}</p>
            </div>
            <div className="text-right">
              <Badge>{c.status}</Badge>
              <p className={cn("mt-1 text-xs font-semibold", c.days >= 21 ? "text-destructive" : c.days >= 14 ? "text-warning" : "text-muted-foreground")}>{c.days}d pending</p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function AuditPreview() {
  return (
    <Panel title="Recent Activity" action={<Link to="/audit-log" className="text-sm font-semibold text-primary hover:underline">See All</Link>}>
      <ul className="space-y-3">
        {audit.slice(0, 4).map((a) => (
          <li key={a.ts + a.action} className="flex gap-3">
            <span className={cn("mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg", auditColor[a.type].bg)}><ArrowUpRight className={cn("h-3.5 w-3.5", auditColor[a.type].text)} /></span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{a.action}</p>
              <p className="truncate text-xs text-muted-foreground">{a.user} · {a.ts.split(", ")[1]}</p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
