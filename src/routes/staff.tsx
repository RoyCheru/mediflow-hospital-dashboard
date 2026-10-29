import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Stethoscope, UserCheck, CalendarClock, Star, Phone, Mail } from "lucide-react";
import { Badge, FilterSelect, PageHeader, Panel, StatCard } from "@/components/kit";
import { departments } from "@/lib/data";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Doctors & Staff — MediFlow" },
      { name: "description", content: "Rosters, duty schedules and staff profiles." },
      { property: "og:title", content: "Doctors & Staff — MediFlow" },
      { property: "og:description", content: "Rosters, duty schedules and staff profiles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const staff = [
  { name: "Dr. Peter Kiprono", role: "Cardiologist", dept: "Cardiology", status: "On Duty", shift: "08:00 – 17:00", patients: 14, rating: 4.9, grad: "bg-grad-teal" },
  { name: "Dr. Achieng Odhiambo", role: "Consultant Pediatrician", dept: "Pediatrics", status: "On Duty", shift: "08:00 – 17:00", patients: 18, rating: 4.8, grad: "bg-grad-pink" },
  { name: "Dr. Lilian Mutua", role: "Obstetrician", dept: "Maternity", status: "On Duty", shift: "07:00 – 19:00", patients: 11, rating: 4.7, grad: "bg-grad-purple" },
  { name: "Dr. John Waweru", role: "Orthopedic Surgeon", dept: "Orthopedics", status: "In Theatre", shift: "09:00 – 18:00", patients: 6, rating: 4.8, grad: "bg-grad-yellow" },
  { name: "Dr. Paul Njoroge", role: "General Practitioner", dept: "Outpatient", status: "On Duty", shift: "08:00 – 16:00", patients: 26, rating: 4.6, grad: "bg-grad-teal" },
  { name: "Dr. Ruth Achieng", role: "Radiologist", dept: "Radiology", status: "Off Duty", shift: "Night · 19:00 – 07:00", patients: 0, rating: 4.7, grad: "bg-grad-pink" },
  { name: "Nurse Faith Njeri", role: "Midwife", dept: "Maternity", status: "Off Duty", shift: "Night · 19:00 – 07:00", patients: 0, rating: 4.9, grad: "bg-grad-purple" },
  { name: "Nurse Daniel Kibet", role: "Ward Nurse", dept: "Cardiology", status: "On Duty", shift: "07:00 – 19:00", patients: 9, rating: 4.5, grad: "bg-grad-yellow" },
];
const week = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const roster = [
  ["Dr. Kiprono", "D", "D", "D", "D", "D", "—", "—"],
  ["Dr. Odhiambo", "D", "D", "—", "D", "D", "D", "—"],
  ["Dr. Mutua", "N", "N", "D", "D", "—", "—", "D"],
  ["Dr. Achieng", "N", "N", "N", "—", "—", "N", "N"],
  ["Nurse Njeri", "D", "—", "N", "N", "N", "—", "D"],
];

function Page() {
  const [dept, setDept] = useState("All");
  const [status, setStatus] = useState("All");
  const list = staff.filter((s) => (dept === "All" || s.dept === dept) && (status === "All" || s.status === status));
  return (
    <div>
      <PageHeader title="Doctors & Staff" subtitle="Rosters, duty schedules and staff profiles." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="teal" icon={Stethoscope} label="Total Staff" value="246" change={2.1} />
        <StatCard tone="yellow" icon={UserCheck} label="On Duty Now" value="88" change={4.0} />
        <StatCard tone="pink" icon={CalendarClock} label="Open Shifts" value="5" change={-12.5} />
        <StatCard tone="purple" icon={Star} label="Patient Rating" value="4.7 / 5" change={1.3} />
      </div>
      <Panel title="Team" action={<div className="flex gap-2"><FilterSelect label="Department" value={dept} onChange={setDept} options={departments} /><FilterSelect label="Status" value={status} onChange={setStatus} options={["On Duty", "In Theatre", "Off Duty"]} /></div>}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {list.map((s) => (
            <div key={s.name} className="rounded-2xl border border-border bg-secondary/50 p-4">
              <div className="flex items-start justify-between">
                <span className={`grid h-12 w-12 place-items-center rounded-full font-bold ${s.grad} ${s.grad.includes("yellow") || s.grad.includes("pink") ? "text-ink" : "text-on-gradient"}`}>{s.name.replace(/^(Dr\.|Nurse) /, "").split(" ").map((n) => n[0]).join("")}</span>
                <Badge tone={s.status === "In Theatre" ? "info" : undefined}>{s.status}</Badge>
              </div>
              <p className="mt-3 font-semibold">{s.name}</p>
              <p className="text-xs text-muted-foreground">{s.role} · {s.dept}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-card p-2"><p className="text-muted-foreground">Patients today</p><p className="font-semibold">{s.patients}</p></div>
                <div className="rounded-lg bg-card p-2"><p className="text-muted-foreground">Rating</p><p className="font-semibold">★ {s.rating}</p></div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Shift: {s.shift}</p>
              <div className="mt-3 flex gap-2">
                <button aria-label="Call" className="grid h-8 flex-1 place-items-center rounded-lg bg-primary/15 text-primary"><Phone className="h-4 w-4" /></button>
                <button aria-label="Email" className="grid h-8 flex-1 place-items-center rounded-lg bg-primary/15 text-primary"><Mail className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Weekly roster" className="mt-6" action={<span className="text-xs text-muted-foreground">D = Day · N = Night</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr><th className="py-2 text-left text-xs text-muted-foreground">Staff</th>{week.map((d) => <th key={d} className="py-2 text-xs text-muted-foreground">{d}</th>)}</tr></thead>
            <tbody>
              {roster.map(([n, ...cells]) => (
                <tr key={n}>
                  <td className="py-1.5 pr-3 font-medium">{n}</td>
                  {cells.map((c, i) => (
                    <td key={i} className="p-1"><div className={`rounded-lg py-2 text-center text-xs font-semibold ${c === "D" ? "bg-primary/20 text-primary" : c === "N" ? "bg-info/20 text-info" : "bg-muted text-muted-foreground"}`}>{c}</div></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
