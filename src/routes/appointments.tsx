import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, CalendarCheck, Clock, UserX, Plus, Check, X } from "lucide-react";
import { Badge, FilterSelect, PageHeader, Panel, StatCard, th, td, tableWrap, theadRow, tbodyRow } from "@/components/kit";
import { departments } from "@/lib/data";

export const Route = createFileRoute("/appointments")({
  head: () => ({
    meta: [
      { title: "Appointments — MediFlow" },
      { name: "description", content: "Book, reschedule and track patient visits." },
      { property: "og:title", content: "Appointments — MediFlow" },
      { property: "og:description", content: "Book, reschedule and track patient visits." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Appt = { id: string; time: string; patient: string; doctor: string; dept: string; type: string; status: string };
const seed: Appt[] = [
  { id: "A-7801", time: "08:30", patient: "Hassan Abdi", doctor: "Dr. Njoroge", dept: "Outpatient", type: "Review", status: "Checked In" },
  { id: "A-7802", time: "09:00", patient: "Brian Otieno", doctor: "Dr. Kiprono", dept: "Cardiology", type: "Stress test", status: "In Progress" },
  { id: "A-7803", time: "10:30", patient: "Wanjiru Kamau", doctor: "Dr. Mutua", dept: "Maternity", type: "Antenatal scan", status: "Scheduled" },
  { id: "A-7804", time: "11:15", patient: "Halima Said", doctor: "Dr. Achieng", dept: "Radiology", type: "CT scan", status: "Scheduled" },
  { id: "A-7805", time: "12:00", patient: "Mercy Chebet", doctor: "Dr. Odhiambo", dept: "Pediatrics", type: "Follow-up", status: "Scheduled" },
  { id: "A-7806", time: "13:30", patient: "Samuel Kiptoo", doctor: "Dr. Kiprono", dept: "Cardiology", type: "ECG", status: "Cancelled" },
  { id: "A-7807", time: "14:15", patient: "Kevin Mwangi", doctor: "Dr. Waweru", dept: "Orthopedics", type: "Cast review", status: "Scheduled" },
  { id: "A-7808", time: "15:00", patient: "Amina Yusuf", doctor: "Dr. Njoroge", dept: "Outpatient", type: "Consultation", status: "No Show" },
];
const tone = (s: string) => (s === "Checked In" || s === "Completed" ? "success" : s === "In Progress" ? "info" : s === "Scheduled" ? "warning" : s === "Cancelled" || s === "No Show" ? "danger" : "muted") as "success";
const days = ["Mon 26", "Tue 27", "Wed 28", "Thu 29", "Fri 30", "Sat 31"];

function Page() {
  const [list, setList] = useState(seed);
  const [dept, setDept] = useState("All");
  const [status, setStatus] = useState("All");
  const [day, setDay] = useState("Thu 29");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ patient: "", doctor: "Dr. Njoroge", dept: "Outpatient", time: "16:00" });
  const rows = useMemo(() => list.filter((a) => (dept === "All" || a.dept === dept) && (status === "All" || a.status === status)), [list, dept, status]);
  const set = (id: string, s: string) => setList((l) => l.map((a) => (a.id === id ? { ...a, status: s } : a)));
  const book = () => {
    if (!form.patient.trim()) return;
    setList((l) => [...l, { id: `A-78${10 + l.length}`, type: "Consultation", status: "Scheduled", ...form }].sort((a, b) => a.time.localeCompare(b.time)));
    setOpen(false);
    setForm({ ...form, patient: "" });
  };
  const input = "h-10 w-full rounded-xl border border-input bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div>
      <PageHeader title="Appointments" subtitle="Book, reschedule and track patient visits." actions={
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" />Book appointment</button>
      } />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="teal" icon={CalendarDays} label="Today's Appointments" value={String(list.length)} change={8.4} />
        <StatCard tone="yellow" icon={CalendarCheck} label="Checked In" value={String(list.filter((a) => a.status === "Checked In" || a.status === "In Progress").length)} change={5.2} />
        <StatCard tone="pink" icon={Clock} label="Avg. Wait Time" value="18 min" change={-6.1} />
        <StatCard tone="purple" icon={UserX} label="No-shows" value={String(list.filter((a) => a.status === "No Show").length)} change={-2.0} />
      </div>
      <Panel title="October 2026" action={<div className="flex gap-2"><FilterSelect label="Department" value={dept} onChange={setDept} options={departments} /><FilterSelect label="Status" value={status} onChange={setStatus} options={["Scheduled", "Checked In", "In Progress", "Cancelled", "No Show"]} /></div>}>
        <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {days.map((d) => (
            <button key={d} onClick={() => setDay(d)} className={`rounded-xl px-3 py-3 text-center text-sm font-semibold transition-colors ${d === day ? "bg-grad-teal text-on-gradient shadow-glow" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>{d}</button>
          ))}
        </div>
        <div className={tableWrap}>
          <table className="w-full">
            <thead><tr className={theadRow}>{["Time", "Patient", "Doctor", "Department", "Visit", "Status", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {(day === "Thu 29" ? rows : rows.slice(0, 3)).map((a) => (
                <tr key={a.id} className={tbodyRow}>
                  <td className={`${td} font-semibold text-primary`}>{a.time}</td>
                  <td className={td}><div className="font-medium">{a.patient}</div><div className="text-xs text-muted-foreground">{a.id}</div></td>
                  <td className={td}>{a.doctor}</td>
                  <td className={td}>{a.dept}</td>
                  <td className={td}>{a.type}</td>
                  <td className={td}><Badge tone={tone(a.status)}>{a.status}</Badge></td>
                  <td className={td}>
                    {a.status === "Scheduled" && (
                      <div className="flex gap-1.5">
                        <button aria-label="Check in" onClick={() => set(a.id, "Checked In")} className="grid h-8 w-8 place-items-center rounded-lg bg-success/15 text-success"><Check className="h-4 w-4" /></button>
                        <button aria-label="Cancel" onClick={() => set(a.id, "Cancelled")} className="grid h-8 w-8 place-items-center rounded-lg bg-destructive/15 text-destructive"><X className="h-4 w-4" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Book appointment</h2>
            <div className="mt-4 space-y-3">
              <input className={input} placeholder="Patient name" value={form.patient} onChange={(e) => setForm({ ...form, patient: e.target.value })} />
              <select className={input} value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })}>{departments.map((d) => <option key={d}>{d}</option>)}</select>
              <select className={input} value={form.doctor} onChange={(e) => setForm({ ...form, doctor: e.target.value })}>{["Dr. Njoroge", "Dr. Kiprono", "Dr. Mutua", "Dr. Odhiambo", "Dr. Waweru", "Dr. Achieng"].map((d) => <option key={d}>{d}</option>)}</select>
              <input type="time" className={input} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold">Cancel</button>
              <button onClick={book} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Book</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
