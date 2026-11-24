import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck, ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { updateMe } from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/client";
import { listMyNotifications } from "@/lib/api/patient";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime, initials, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TopBarLinks } from "@/lib/navigation";

export function TopBarActions({
  roleLabel = "Staff",
  links,
}: {
  roleLabel?: string;
  links: TopBarLinks;
}) {
  const navigate = useNavigate();
  const { user, logout, refreshUser } = useAuth();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
  });

  const notifications = useQuery({
    queryKey: ["topbar", "notifications"],
    queryFn: () => listMyNotifications({ page_size: 8 }),
    staleTime: 30_000,
  });
  const items = notifications.data?.items ?? [];
  const unread = items.filter((item) => !readIds.has(item.id)).length;
  const name = user?.full_name || "MediFlow user";

  const saveProfile = useMutation({
    mutationFn: () =>
      updateMe({
        first_name: profileDraft.first_name.trim(),
        last_name: profileDraft.last_name.trim(),
        email: profileDraft.email.trim() || null,
        phone: profileDraft.phone.trim() || null,
      }),
    onSuccess: async () => {
      await refreshUser();
      toast.success("Profile updated");
      setProfileOpen(false);
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  function openProfile() {
    setProfileDraft({
      first_name: user?.first_name ?? "",
      last_name: user?.last_name ?? "",
      email: user?.email ?? "",
      phone: user?.phone ?? "",
    });
    setProfileOpen(true);
  }

  function markRead(ids: string[]) {
    setReadIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function sendProfile(event: FormEvent) {
    event.preventDefault();
    if (!profileDraft.first_name.trim() || !profileDraft.last_name.trim()) {
      toast.error("First and last name are required");
      return;
    }
    saveProfile.mutate();
  }

  return (
    <>
      <Popover open={alertsOpen} onOpenChange={setAlertsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Notifications"
            title="Notifications"
            className="relative h-10 w-10 rounded-full hover:bg-secondary [&_svg]:size-5"
          >
            <Bell />
            {unread > 0 && (
              <span
                data-testid="notification-dot"
                className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive ring-2 ring-background"
              />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={12}
          collisionPadding={12}
          className="w-[380px] max-w-[calc(100vw-24px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto rounded-xl p-0 shadow-card"
        >
          <div className="flex items-center justify-between border-b border-border p-4">
            <div>
              <h2 className="font-semibold">Notifications</h2>
              <p className="text-xs text-muted-foreground">
                {unread ? `${unread} unread` : "You're all caught up"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mark all as read"
              title="Mark all as read"
              disabled={!unread}
              onClick={() => markRead(items.map((item) => item.id))}
            >
              <CheckCheck />
            </Button>
          </div>
          {notifications.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading notifications…</p>
          ) : notifications.error ? (
            <p className="p-4 text-sm text-destructive">Unable to load notifications.</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {items.map((item) => {
                const read = readIds.has(item.id);
                return (
                  <Link
                    key={item.id}
                    to={links.notifications}
                    onClick={() => {
                      markRead([item.id]);
                      setAlertsOpen(false);
                    }}
                    className={cn(
                      "flex gap-3 p-4 transition-colors hover:bg-secondary",
                      !read && "bg-primary/5",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        read ? "bg-muted" : "bg-primary",
                      )}
                    />
                    <div>
                      <p className="text-sm font-semibold">{titleize(item.template_key)}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {titleize(item.channel)} · {titleize(item.status)}
                      </p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {formatDateTime(item.created_at)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border px-4 py-2">
            <p className="text-xs text-muted-foreground">Your delivery history</p>
            <Link
              to={links.notifications}
              onClick={() => setAlertsOpen(false)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              View all
            </Link>
          </div>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            aria-label="Profile menu"
            className="h-auto gap-2.5 rounded-full py-1 pl-1 pr-2 hover:bg-secondary"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-grad-pink text-sm font-bold text-ink">
              {initials(name)}
            </span>
            <span className="hidden max-w-40 text-left leading-tight md:block">
              <span className="block truncate text-sm font-semibold">{name}</span>
              <span className="block text-xs text-muted-foreground">{roleLabel}</span>
            </span>
            <ChevronDown className="hidden text-muted-foreground md:block" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={12}
          className="w-64 max-w-[calc(100vw-24px)] rounded-xl p-2 shadow-card"
        >
          <DropdownMenuLabel>
            <span className="block truncate">{name}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {user?.email ?? user?.phone ?? "—"}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openProfile}>
            <UserRound />
            My profile
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={links.settings}>
              <Settings />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void logout().then(() => navigate({ to: "/auth/login", replace: true }));
            }}
          >
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-h-[calc(100dvh-24px)] w-[calc(100%-24px)] overflow-y-auto rounded-xl bg-card">
          <DialogHeader>
            <DialogTitle>My profile</DialogTitle>
            <DialogDescription>
              {roleLabel} · {user?.status ? titleize(user.status) : "—"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={sendProfile} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block text-muted-foreground">First name</span>
                <input
                  required
                  value={profileDraft.first_name}
                  onChange={(event) =>
                    setProfileDraft((current) => ({ ...current, first_name: event.target.value }))
                  }
                  className="h-10 w-full rounded-xl border border-input bg-secondary px-3 outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-muted-foreground">Last name</span>
                <input
                  required
                  value={profileDraft.last_name}
                  onChange={(event) =>
                    setProfileDraft((current) => ({ ...current, last_name: event.target.value }))
                  }
                  className="h-10 w-full rounded-xl border border-input bg-secondary px-3 outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted-foreground">Email</span>
              <input
                type="email"
                value={profileDraft.email}
                onChange={(event) =>
                  setProfileDraft((current) => ({ ...current, email: event.target.value }))
                }
                className="h-10 w-full rounded-xl border border-input bg-secondary px-3 outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted-foreground">Phone</span>
              <input
                type="tel"
                value={profileDraft.phone}
                onChange={(event) =>
                  setProfileDraft((current) => ({ ...current, phone: event.target.value }))
                }
                className="h-10 w-full rounded-xl border border-input bg-secondary px-3 outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setProfileOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveProfile.isPending}>
                {saveProfile.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
