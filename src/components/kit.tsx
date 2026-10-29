import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { AuditType } from "@/lib/data";

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl bg-card p-4 shadow-card sm:p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-base font-semibold sm:text-lg">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const grads = { teal: "bg-grad-teal", yellow: "bg-grad-yellow", pink: "bg-grad-pink", purple: "bg-grad-purple" };

export function StatCard({ label, value, change, icon: Icon, tone }: { label: string; value: string; change: number; icon: LucideIcon; tone: keyof typeof grads }) {
  const dark = tone === "yellow" || tone === "pink";
  const up = change >= 0;
  return (
    <div className={cn("relative overflow-hidden rounded-2xl p-5 shadow-card", grads[tone], dark ? "text-ink" : "text-on-gradient")}>
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-on-gradient/15" />
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-on-gradient/25"><Icon className="h-5 w-5" /></span>
        <span className="min-w-0 truncate font-semibold">{label}</span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-2">
        <span className="text-2xl font-bold tracking-tight xl:text-3xl">{value}</span>
        <div className="text-right">
          <span className="inline-flex items-center gap-1 rounded-full bg-on-gradient/35 px-2.5 py-1 text-xs font-semibold">
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {up ? "+" : ""}{change}%
          </span>
          <p className="mt-1 text-[11px] opacity-80">vs last month</p>
        </div>
      </div>
    </div>
  );
}

const tones: Record<string, string> = {
  success: "bg-success/15 text-success",
  danger: "bg-destructive/15 text-destructive",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/15 text-info",
  muted: "bg-muted text-muted-foreground",
  sha: "bg-sha/15 text-sha",
  mpesa: "bg-mpesa/15 text-mpesa",
  cash: "bg-cash/15 text-cash",
};
const statusTone: Record<string, keyof typeof tones> = {
  paid: "success", approved: "success", discharged: "success", "on duty": "success", balanced: "success",
  pending: "warning", submitted: "info", "under review": "warning", admitted: "info", transferred: "warning",
  voided: "danger", rejected: "danger", "off duty": "muted", discrepancy: "danger",
  sha: "sha", "m-pesa": "mpesa", cash: "cash",
};

export function Badge({ children, tone }: { children: string; tone?: keyof typeof tones }) {
  const t = tone ?? statusTone[children.toLowerCase()] ?? "muted";
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold capitalize", tones[t])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function FilterSelect({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: string[]; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 rounded-xl border border-input bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="All">{label}: All</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export const th = "px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap";
export const td = "px-3 py-3.5 text-sm whitespace-nowrap";
export const tableWrap = "overflow-x-auto rounded-xl border border-border";
export const theadRow = "bg-secondary";
export const tbodyRow = "border-t border-border transition-colors hover:bg-accent/50";

export const auditColor: Record<AuditType, { bg: string; text: string; label: string }> = {
  void: { bg: "bg-destructive/15", text: "text-destructive", label: "Void" },
  delete: { bg: "bg-destructive/15", text: "text-destructive", label: "Delete" },
  edit: { bg: "bg-info/15", text: "text-info", label: "Edit" },
  approve: { bg: "bg-success/15", text: "text-success", label: "Approve" },
  create: { bg: "bg-primary/15", text: "text-primary", label: "Create" },
  login: { bg: "bg-muted", text: "text-muted-foreground", label: "Sign-in" },
};
