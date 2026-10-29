import { createFileRoute } from "@tanstack/react-router";
import { Building2, BedDouble, Activity, Clock, Heart, Baby, Bone, Stethoscope, ScanLine, Users } from "lucide-react";
import { PageHeader, Panel, StatCard } from "@/components/kit";
import { ksh } from "@/lib/data";

export const Route = createFileRoute("/departments")({
  head: () => ({
    meta: [
      { title: "Departments — MediFlow" },
      { name: "description", content: "Capacity and performance across departments." },
      { property: "og:title", content: "Departments — MediFlow" },
      { property: "og:description", content: "Capacity and performance across departments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const depts = [
  { name: "Cardiology", head: "Dr. Peter Kiprono", icon: Heart, beds: 32, used: 27, staff: 34, revenue: 1270000, wait: 22, grad: "bg-grad-pink" },
  { name: "Pediatrics", head: "Dr. Achieng Odhiambo", icon: Users, beds: 40, used: 31, staff: 41, revenue: 790000, wait: 15, grad: "bg-grad-teal" },
  { name: "Maternity", head: "Dr. Lilian Mutua", icon: Baby, beds: 48, used: 45, staff: 52, revenue: 1100000, wait: 12, grad: "bg-grad-purple" },
  { name: "Orthopedics", head: "Dr. John Waweru", icon: Bone, beds: 24, used: 16, staff: 22, revenue: 640000, wait: 28, grad: "bg-grad-yellow" },
  { name: "Outpatient", head: "Dr. Paul Njoroge", icon: Stethoscope, beds: 10, used: 4, staff: 38, revenue: 600000, wait: 34, grad: "bg-grad-teal" },
  { name: "Radiology", head: "Dr. Ruth Achieng", icon: ScanLine, beds: 0, used: 0, staff: 18, revenue: 420000, wait: 19, grad: "bg-grad-pink" },
];

function Page() {
  const beds = depts.reduce((a, d) => a + d.beds, 0);
  const used = depts.reduce((a, d) => a + d.used, 0);
  return (
    <div>
      <PageHeader title="Departments" subtitle="Capacity and performance across departments." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="teal" icon={Building2} label="Departments" value={String(depts.length)} change={0} />
        <StatCard tone="yellow" icon={BedDouble} label="Bed Occupancy" value={`${Math.round((used / beds) * 100)}%`} change={3.8} />
        <StatCard tone="pink" icon={Activity} label="Admissions Today" value="37" change={6.5} />
        <StatCard tone="purple" icon={Clock} label="Avg. Wait" value="21 min" change={-4.2} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {depts.map((d) => {
          const pct = d.beds ? Math.round((d.used / d.beds) * 100) : 0;
          const bar = pct >= 90 ? "bg-destructive" : pct >= 75 ? "bg-warning" : "bg-success";
          return (
            <Panel key={d.name}>
              <div className="flex items-center gap-3">
                <span className={`grid h-11 w-11 place-items-center rounded-xl ${d.grad} ${d.grad.includes("yellow") || d.grad.includes("pink") ? "text-ink" : "text-on-gradient"}`}><d.icon className="h-5 w-5" /></span>
                <div className="min-w-0"><p className="font-semibold">{d.name}</p><p className="truncate text-xs text-muted-foreground">Head: {d.head}</p></div>
              </div>
              <div className="mt-5">
                <div className="mb-1.5 flex justify-between text-xs"><span className="text-muted-foreground">Bed occupancy</span><span className="font-semibold">{d.beds ? `${d.used}/${d.beds} · ${pct}%` : "Day service"}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} /></div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-secondary p-2.5"><p className="text-muted-foreground">Staff</p><p className="mt-0.5 font-semibold">{d.staff}</p></div>
                <div className="rounded-xl bg-secondary p-2.5"><p className="text-muted-foreground">Wait</p><p className="mt-0.5 font-semibold">{d.wait} min</p></div>
                <div className="rounded-xl bg-secondary p-2.5"><p className="text-muted-foreground">Oct revenue</p><p className="mt-0.5 font-semibold">{ksh(d.revenue / 1000)}K</p></div>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
