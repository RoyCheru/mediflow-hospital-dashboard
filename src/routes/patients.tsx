import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Users, BedDouble, UserPlus, HeartPulse, Search, Phone, ShieldCheck } from "lucide-react";
import { Badge, FilterSelect, PageHeader, Panel, StatCard, th, td, tableWrap, theadRow, tbodyRow } from "@/components/kit";
import { departments } from "@/lib/data";

export const Route = createFileRoute("/patients")({
  head: () => ({
    meta: [
      { title: "Patients — MediFlow" },
      { name: "description", content: "Patient registry, records and admission history." },
      { property: "og:title", content: "Patients — MediFlow" },
      { property: "og:description", content: "Patient registry, records and admission history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type P = { id: string; name: string; age: number; sex: string; phone: string; dept: string; condition: string; visit: string; sha: boolean; status: string; blood: string };
const patients: P[] = [
  { id: "P-4021", name: "Wanjiru Kamau", age: 29, sex: "F", phone: "0712 448 201", dept: "Maternity", condition: "Antenatal review", visit: "27 Oct 2026", sha: true, status: "Admitted", blood: "O+" },
  { id: "P-4022", name: "Brian Otieno", age: 54, sex: "M", phone: "0722 190 554", dept: "Cardiology", condition: "Hypertension", visit: "26 Oct 2026", sha: true, status: "Discharged", blood: "A+" },
  { id: "P-4023", name: "Mercy Chebet", age: 6, sex: "F", phone: "0733 902 117", dept: "Pediatrics", condition: "Malaria", visit: "28 Oct 2026", sha: false, status: "Admitted", blood: "B+" },
  { id: "P-4024", name: "Kevin Mwangi", age: 31, sex: "M", phone: "0701 556 820", dept: "Orthopedics", condition: "Fractured tibia", visit: "24 Oct 2026", sha: true, status: "Transferred", blood: "O-" },
  { id: "P-4025", name: "Hassan Abdi", age: 47, sex: "M", phone: "0745 310 662", dept: "Outpatient", condition: "Type 2 diabetes", visit: "29 Oct 2026", sha: false, status: "Discharged", blood: "AB+" },
  { id: "P-4026", name: "Samuel Kiptoo", age: 63, sex: "M", phone: "0710 884 093", dept: "Cardiology", condition: "Arrhythmia", visit: "29 Oct 2026", sha: true, status: "Admitted", blood: "A-" },
  { id: "P-4027", name: "Esther Moraa", age: 34, sex: "F", phone: "0729 671 445", dept: "Maternity", condition: "Post-natal care", visit: "25 Oct 2026", sha: true, status: "Discharged", blood: "O+" },
  { id: "P-4028", name: "Halima Said", age: 41, sex: "F", phone: "0757 223 908", dept: "Radiology", condition: "Chest imaging", visit: "25 Oct 2026", sha: true, status: "Discharged", blood: "B-" },
];

function Page() {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("All");
  const [status, setStatus] = useState("All");
  const [sel, setSel] = useState<P>(patients[0]);
  const rows = useMemo(() => patients.filter((p) => (dept === "All" || p.dept === dept) && (status === "All" || p.status === status) && (p.name + p.id).toLowerCase().includes(q.toLowerCase())), [q, dept, status]);

  return (
    <div>
      <PageHeader title="Patients" subtitle="Patient registry, records and admission history." actions={<button className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><UserPlus className="h-4 w-4" />Register patient</button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="teal" icon={Users} label="Total Patients" value="12,486" change={4.6} />
        <StatCard tone="yellow" icon={BedDouble} label="Currently Admitted" value="142" change={2.3} />
        <StatCard tone="pink" icon={UserPlus} label="New This Month" value="318" change={11.7} />
        <StatCard tone="purple" icon={HeartPulse} label="SHA Coverage" value="71%" change={3.4} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Panel>
          <div className="mb-4 flex flex-wrap gap-2">
            <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-input bg-secondary px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or patient ID" className="w-full bg-transparent text-sm outline-none" />
            </label>
            <FilterSelect label="Department" value={dept} onChange={setDept} options={departments} />
            <FilterSelect label="Status" value={status} onChange={setStatus} options={["Admitted", "Discharged", "Transferred"]} />
          </div>
          <div className={tableWrap}>
            <table className="w-full">
              <thead><tr className={theadRow}>{["Patient", "Age / Sex", "Department", "Condition", "Last Visit", "Status"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} onClick={() => setSel(p)} className={`${tbodyRow} cursor-pointer ${sel.id === p.id ? "bg-accent/60" : ""}`}>
                    <td className={td}><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">#{p.id}</div></td>
                    <td className={td}>{p.age} · {p.sex}</td>
                    <td className={td}>{p.dept}</td>
                    <td className={td}>{p.condition}</td>
                    <td className={td}>{p.visit}</td>
                    <td className={td}><Badge>{p.status}</Badge></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No patients match your filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Patient profile">
          <div className="flex items-center gap-3">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-grad-purple text-lg font-bold text-on-gradient">{sel.name.split(" ").map((n) => n[0]).join("")}</span>
            <div><p className="font-semibold">{sel.name}</p><p className="text-xs text-muted-foreground">#{sel.id} · {sel.age} yrs · {sel.sex === "F" ? "Female" : "Male"}</p></div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            {[["Blood group", sel.blood], ["Department", sel.dept], ["Condition", sel.condition], ["Last visit", sel.visit]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-secondary p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-0.5 font-semibold">{v}</p></div>
            ))}
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-primary" />{sel.phone}</p>
            <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />{sel.sha ? "SHA member · active" : "No SHA cover · self-pay"}</p>
          </div>
          <h3 className="mt-5 text-sm font-semibold">Recent history</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {[["Consultation", sel.visit], ["Lab: full blood count", "20 Oct 2026"], ["Prescription refill", "12 Oct 2026"]].map(([a, d]) => (
              <li key={a} className="flex justify-between rounded-xl border border-border px-3 py-2"><span>{a}</span><span className="text-muted-foreground">{d}</span></li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
