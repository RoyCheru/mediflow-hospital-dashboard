import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, Users, Plug, Bell } from "lucide-react";
import { Badge, PageHeader, Panel, th, td, tableWrap, theadRow, tbodyRow } from "@/components/kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — MediFlow" },
      { name: "description", content: "Hospital profile, users, roles and integrations." },
      { property: "og:title", content: "Settings — MediFlow" },
      { property: "og:description", content: "Hospital profile, users, roles and integrations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const tabs = [
  { id: "profile", label: "Hospital profile", icon: Building2 },
  { id: "users", label: "Users & roles", icon: Users },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "notifications", label: "Notifications", icon: Bell },
] as const;
type Tab = (typeof tabs)[number]["id"];

const users = [
  { name: "Samuel Ndegwa", email: "s.ndegwa@mediflow.co.ke", role: "Administrator", last: "Today, 13:05" },
  { name: "Grace Mutua", email: "g.mutua@mediflow.co.ke", role: "Finance Officer", last: "Today, 16:21" },
  { name: "Joy Wairimu", email: "j.wairimu@mediflow.co.ke", role: "Receptionist", last: "Today, 15:58" },
  { name: "Ali Hassan", email: "a.hassan@mediflow.co.ke", role: "Receptionist", last: "Today, 14:40" },
  { name: "Dr. Peter Kiprono", email: "p.kiprono@mediflow.co.ke", role: "Doctor", last: "Today, 15:12" },
];
const input = "h-10 w-full rounded-xl border border-input bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={onClick} className={cn("relative h-6 w-11 rounded-full transition-colors", on ? "bg-primary" : "bg-muted")}>
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-foreground transition-all", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

function Page() {
  const [tab, setTab] = useState<Tab>("profile");
  const [saved, setSaved] = useState(false);
  const [ints, setInts] = useState({ SHA: true, "M-Pesa": true, SMS: false, "KRA eTIMS": true });
  const [notes, setNotes] = useState({ "Claim rejected": true, "Cash discrepancy": true, "Low bed capacity": true, "Daily summary email": false });

  return (
    <div>
      <PageHeader title="Settings" subtitle="Hospital profile, users, roles and integrations." />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="flex gap-2 overflow-x-auto lg:flex-col">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn("flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors", tab === t.id ? "bg-grad-teal text-on-gradient shadow-glow" : "bg-card text-muted-foreground hover:text-foreground")}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </nav>

        {tab === "profile" && (
          <Panel title="Hospital profile">
            <div className="grid gap-4 sm:grid-cols-2">
              {[["Hospital name", "MediFlow General Hospital"], ["KMPDC licence no.", "KMPDC/H/2019/0481"], ["SHA facility code", "FID-22-104917"], ["Phone", "+254 20 765 4300"], ["Email", "info@mediflow.co.ke"], ["Location", "Upper Hill, Nairobi"]].map(([l, v]) => (
                <label key={l} className="text-sm"><span className="mb-1.5 block text-muted-foreground">{l}</span><input className={input} defaultValue={v} /></label>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-end gap-3">
              {saved && <span className="text-sm text-success">Changes saved</span>}
              <button onClick={() => setSaved(true)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Save changes</button>
            </div>
          </Panel>
        )}

        {tab === "users" && (
          <Panel title="Users & roles" action={<button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Invite user</button>}>
            <div className={tableWrap}>
              <table className="w-full">
                <thead><tr className={theadRow}>{["User", "Role", "Last active", "Status"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.email} className={tbodyRow}>
                      <td className={td}><div className="font-medium">{u.name}</div><div className="text-xs text-muted-foreground">{u.email}</div></td>
                      <td className={td}><Badge tone="info">{u.role}</Badge></td>
                      <td className={td}>{u.last}</td>
                      <td className={td}><Badge tone="success">Active</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {tab === "integrations" && (
          <Panel title="Integrations">
            <div className="grid gap-4 sm:grid-cols-2">
              {(Object.keys(ints) as (keyof typeof ints)[]).map((k) => (
                <div key={k} className="flex items-center justify-between rounded-2xl border border-border bg-secondary/50 p-4">
                  <div><p className="font-semibold">{k}</p><p className="text-xs text-muted-foreground">{ints[k] ? "Connected" : "Not connected"}</p></div>
                  <Toggle label={k} on={ints[k]} onClick={() => setInts({ ...ints, [k]: !ints[k] })} />
                </div>
              ))}
            </div>
          </Panel>
        )}

        {tab === "notifications" && (
          <Panel title="Notifications">
            <ul className="divide-y divide-border">
              {(Object.keys(notes) as (keyof typeof notes)[]).map((k) => (
                <li key={k} className="flex items-center justify-between py-4"><span className="text-sm font-medium">{k}</span><Toggle label={k} on={notes[k]} onClick={() => setNotes({ ...notes, [k]: !notes[k] })} /></li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}
