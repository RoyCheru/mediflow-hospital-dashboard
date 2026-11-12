import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { HeartPulse, LogOut, Menu, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TopBarActions } from "@/components/TopBarActions";
import type { RoleNavigation } from "@/lib/navigation";

function Nav({ nav, onNavigate }: { nav: RoleNavigation; onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex h-full flex-col px-5 py-6">
      <Link to={nav.home} className="flex items-center gap-2 px-1" onClick={onNavigate}>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-grad-teal text-on-gradient shadow-glow">
          <HeartPulse className="h-5 w-5" />
        </span>
        <span className="text-2xl font-bold tracking-tight">
          Medi<span className="text-primary">Flow</span>
        </span>
      </Link>
      <nav className="mt-8 flex-1 space-y-6 overflow-y-auto">
        {nav.groups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active =
                  item.to === nav.home
                    ? path === item.to || path === `${item.to}/`
                    : path === item.to || path.startsWith(`${item.to}/`);
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground shadow-glow"
                          : "text-sidebar-foreground hover:bg-sidebar-accent",
                      )}
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {"badge" in item && item.badge !== undefined && (
                        <span
                          className={cn(
                            "grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold",
                            active ? "bg-primary-foreground text-primary" : "bg-cash text-ink",
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <Link
        to="/auth/login"
        className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      >
        <LogOut className="h-[18px] w-[18px]" /> Log out
      </Link>
    </div>
  );
}

export function AppShell({ nav, children }: { nav: RoleNavigation; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <Nav nav={nav} />
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-sidebar-border bg-sidebar animate-in slide-in-from-left">
            <button
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-6 rounded-lg p-2 hover:bg-sidebar-accent"
            >
              <X className="h-5 w-5" />
            </button>
            <Nav nav={nav} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <button
              aria-label="Open menu"
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 hover:bg-secondary lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="relative min-w-0 flex-1 md:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Search patients, invoices, claims…"
                className="h-11 w-full rounded-xl bg-secondary pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
              <TopBarActions
                roleLabel={nav.label}
                links={nav.topBar}
                userName={nav.user.name}
                userEmail={nav.user.email}
              />
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
