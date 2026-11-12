import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { CalendarCheck, HeartPulse, ShieldCheck, Sparkles } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthLayout,
});

const highlights = [
  { icon: CalendarCheck, text: "One record across reception, doctor and billing" },
  { icon: ShieldCheck, text: "SHA, M-Pesa and cash in a single billing model" },
  { icon: Sparkles, text: "Assistive AI triage and visit summaries" },
];

function AuthLayout() {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-sidebar p-10 lg:flex lg:flex-col lg:justify-between">
        <div>
          <Link to="/auth/login" className="flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-grad-teal text-on-gradient shadow-glow">
              <HeartPulse className="h-5 w-5" />
            </span>
            <span className="text-2xl font-bold tracking-tight">
              Medi<span className="text-primary">Flow</span>
            </span>
          </Link>
          <h2 className="mt-16 max-w-md text-4xl font-bold leading-tight tracking-tight">
            One system of record for the whole patient journey.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
            Registration, scheduling, clinical records, billing, SHA claims and audit — built for
            Kenyan hospitals and role-scoped access.
          </p>
          <ul className="mt-10 space-y-4">
            {highlights.map((item) => (
              <li key={item.text} className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                  <item.icon className="h-4 w-4" />
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">
          Role-based access is enforced by the API, not only the interface.
        </p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <Link to="/auth/login" className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-grad-teal text-on-gradient shadow-glow">
              <HeartPulse className="h-5 w-5" />
            </span>
            <span className="text-2xl font-bold tracking-tight">
              Medi<span className="text-primary">Flow</span>
            </span>
          </Link>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
