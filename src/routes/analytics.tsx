import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp, Users, BedDouble, Timer } from "lucide-react";
import { PageHeader, Panel, StatCard } from "@/components/kit";
import { revenueByDept, revenueByMethod } from "@/lib/data";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — MediFlow" },
      { name: "description", content: "Operational and financial insights." },
      { property: "og:title", content: "Analytics — MediFlow" },
      { property: "og:description", content: "Operational and financial insights." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const visits = [
  { month: "May", Outpatient: 2140, Inpatient: 410 },
  { month: "Jun", Outpatient: 2260, Inpatient: 438 },
  { month: "Jul", Outpatient: 2390, Inpatient: 452 },
  { month: "Aug", Outpatient: 2310, Inpatient: 470 },
  { month: "Sep", Outpatient: 2480, Inpatient: 495 },
  { month: "Oct", Outpatient: 2620, Inpatient: 512 },
];
const diagnoses = [["Malaria", 412], ["Hypertension", 336], ["Upper respiratory infection", 298], ["Type 2 diabetes", 214], ["Antenatal care", 188]] as const;
const tip = { contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)" } };
const axis = { stroke: "var(--muted-foreground)", fontSize: 12, tickLine: false, axisLine: false };

function Page() {
  const totals = revenueByMethod.map((r) => ({ month: r.month, Revenue: +(r.SHA + r["M-Pesa"] + r.Cash).toFixed(2) }));
  return (
    <div>
      <PageHeader title="Analytics" subtitle="Operational and financial insights · May – Oct 2026." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="teal" icon={TrendingUp} label="6-Month Revenue" value="KSh 21.5M" change={14.8} />
        <StatCard tone="yellow" icon={Users} label="Patient Visits" value="17,477" change={7.9} />
        <StatCard tone="pink" icon={BedDouble} label="Avg. Length of Stay" value="3.8 days" change={-5.0} />
        <StatCard tone="purple" icon={Timer} label="Claim Turnaround" value="16 days" change={-9.2} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Total revenue (KSh M)">
          <div className="h-72"><ResponsiveContainer><LineChart data={totals}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="month" {...axis} /><YAxis {...axis} /><Tooltip {...tip} /><Line type="monotone" dataKey="Revenue" stroke="var(--chart-1)" strokeWidth={3} dot={{ r: 4 }} /></LineChart></ResponsiveContainer></div>
        </Panel>
        <Panel title="Patient visits">
          <div className="h-72"><ResponsiveContainer><BarChart data={visits}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="month" {...axis} /><YAxis {...axis} /><Tooltip {...tip} cursor={{ fill: "var(--accent)" }} /><Legend /><Bar dataKey="Outpatient" fill="var(--chart-1)" radius={[6, 6, 0, 0]} /><Bar dataKey="Inpatient" fill="var(--chart-4)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </Panel>
        <Panel title="Revenue by department (KSh M)">
          <div className="h-72"><ResponsiveContainer><BarChart data={revenueByDept}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="month" {...axis} /><YAxis {...axis} /><Tooltip {...tip} cursor={{ fill: "var(--accent)" }} /><Legend />{["Cardiology", "Pediatrics", "Maternity", "Outpatient"].map((k, i) => <Bar key={k} dataKey={k} stackId="a" fill={`var(--chart-${i + 1})`} />)}</BarChart></ResponsiveContainer></div>
        </Panel>
        <Panel title="Top diagnoses this month">
          <ul className="space-y-4">
            {diagnoses.map(([n, v]) => (
              <li key={n}>
                <div className="mb-1.5 flex justify-between text-sm"><span>{n}</span><span className="font-semibold">{v}</span></div>
                <div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-grad-teal" style={{ width: `${(v / 412) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
