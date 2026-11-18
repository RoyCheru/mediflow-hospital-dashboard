import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  MessageSquare,
  ChevronDown,
  CheckCheck,
  ArrowLeft,
  Send,
  UserRound,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
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
import { cn } from "@/lib/utils";
import type { TopBarLinks } from "@/lib/navigation";

const initialAlerts = [
  {
    id: 1,
    title: "SHA claim requires review",
    detail: "A rejected claim needs the finance team's attention.",
    time: "5 min ago",
    to: "claims",
    read: false,
  },
  {
    id: 2,
    title: "Cardiology appointment",
    detail: "An upcoming appointment is awaiting check-in.",
    time: "12 min ago",
    to: "appointments",
    read: false,
  },
  {
    id: 3,
    title: "Maternity bed capacity",
    detail: "Review current bed availability in Maternity.",
    time: "25 min ago",
    to: "departments",
    read: false,
  },
  {
    id: 4,
    title: "Notification delivery failed",
    detail: "A WhatsApp reminder failed after 3 attempts.",
    time: "40 min ago",
    to: "notifications",
    read: false,
  },
  {
    id: 5,
    title: "Cash variance detected",
    detail: "Yesterday's cash reconciliation is short by KSh 500.",
    time: "1 hr ago",
    to: "billing",
    read: false,
  },
] as const;
const contacts = [
  {
    id: "finance",
    name: "Grace Mutua",
    role: "Finance Officer",
    initials: "GM",
    preview: "Please review the pending SHA claims.",
  },
  {
    id: "reception",
    name: "Joy Wairimu",
    role: "Receptionist",
    initials: "JW",
    preview: "The afternoon appointments are ready for check-in.",
  },
  {
    id: "doctor",
    name: "Dr. Peter Kiprono",
    role: "Cardiology",
    initials: "PK",
    preview: "The Cardiology schedule has been updated.",
  },
];
type Message = { id: number; text: string; mine: boolean; time: string };

export function TopBarActions({
  roleLabel = "Administrator",
  userName = "Samuel Ndegwa",
  userEmail = "s.ndegwa@mediflow.co.ke",
  links = {
    claims: "/admin/claims",
    appointments: "/admin/appointments",
    departments: "/admin/departments",
    notifications: "/admin/notifications",
    billing: "/admin/billing",
    settings: "/admin/settings",
  },
}: {
  roleLabel?: string;
  userName?: string;
  userEmail?: string;
  links?: TopBarLinks;
}) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [alerts, setAlerts] = useState(initialAlerts.map((a) => ({ ...a, read: Boolean(a.read) })));
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [contactId, setContactId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [threads, setThreads] = useState<Record<string, Message[]>>(() =>
    Object.fromEntries(
      contacts.map((c) => [c.id, [{ id: 0, text: c.preview, mine: false, time: "13:20" }]]),
    ),
  );
  const [unreadChats, setUnreadChats] = useState(contacts.map((c) => c.id));
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState({
    name: user?.full_name || userName,
    email: user?.email || userEmail,
    phone: user?.phone || "+254 712 345 678",
  });
  const [profileDraft, setProfileDraft] = useState(profile);
  const unread = alerts.filter((a) => !a.read).length;
  const contact = contacts.find((c) => c.id === contactId);
  const initials = profile.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!contact || !text) return;
    const message = {
      id: Date.now(),
      text,
      mine: true,
      time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    };
    setThreads((previous) => ({
      ...previous,
      [contact.id]: [...(previous[contact.id] ?? []), message],
    }));
    setDraft("");
  }

  return (
    <>
      <Popover open={chatOpen} onOpenChange={setChatOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Messages"
            title="Messages"
            className="relative h-10 w-10 rounded-full hover:bg-secondary [&_svg]:size-5"
          >
            <MessageSquare />
            {unreadChats.length > 0 && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={12}
          collisionPadding={12}
          className="w-[360px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl p-0 shadow-card"
        >
          <div className="flex items-center gap-2 border-b border-border p-4">
            {contact && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Back to conversations"
                onClick={() => {
                  setContactId(null);
                  setDraft("");
                }}
              >
                <ArrowLeft />
              </Button>
            )}
            <div className="min-w-0">
              <h2 className="truncate font-semibold">{contact?.name ?? "Messages"}</h2>
              <p className="text-xs text-muted-foreground">
                {contact ? `${contact.role} · Demo conversation` : "Staff conversations · Demo"}
              </p>
            </div>
          </div>
          {!contact ? (
            <div className="divide-y divide-border">
              {contacts.map((c) => (
                <Button
                  key={c.id}
                  variant="ghost"
                  onClick={() => {
                    setContactId(c.id);
                    setUnreadChats((ids) => ids.filter((id) => id !== c.id));
                  }}
                  className="h-auto w-full justify-start whitespace-normal rounded-none p-4 text-left hover:bg-secondary"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                    {c.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {threads[c.id]?.at(-1)?.text}
                    </span>
                  </span>
                  {unreadChats.includes(c.id) && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </Button>
              ))}
            </div>
          ) : (
            <>
              <div
                role="log"
                aria-label="Conversation"
                aria-live="polite"
                className="flex h-64 flex-col-reverse overflow-y-auto p-4"
              >
                <div className="space-y-3">
                  {threads[contact.id]?.map((m) => (
                    <div
                      key={m.id}
                      className={cn("flex flex-col", m.mine ? "items-end" : "items-start")}
                    >
                      <p
                        className={cn(
                          "max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm",
                          m.mine ? "bg-primary text-primary-foreground" : "bg-secondary",
                        )}
                      >
                        {m.text}
                      </p>
                      <span className="mt-1 text-[10px] text-muted-foreground">
                        {m.time}
                        {m.mine ? " · Local only" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <form onSubmit={sendMessage} className="flex gap-2 border-t border-border p-3">
                <input
                  aria-label="Message"
                  placeholder="Write a message…"
                  value={draft}
                  maxLength={2000}
                  onChange={(e) => setDraft(e.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-lg bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  aria-label="Send message"
                  title="Send message"
                  disabled={!draft.trim()}
                >
                  <Send />
                </Button>
              </form>
            </>
          )}
        </PopoverContent>
      </Popover>

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
              onClick={() => setAlerts((previous) => previous.map((a) => ({ ...a, read: true })))}
            >
              <CheckCheck />
            </Button>
          </div>
          <div className="divide-y divide-border">
            {alerts.map((a) => (
              <Link
                key={a.id}
                to={links[a.to]}
                onClick={() => {
                  setAlerts((previous) =>
                    previous.map((item) => (item.id === a.id ? { ...item, read: true } : item)),
                  );
                  setAlertsOpen(false);
                }}
                className={cn(
                  "flex gap-3 p-4 transition-colors hover:bg-secondary",
                  !a.read && "bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    a.read ? "bg-muted" : "bg-primary",
                  )}
                />
                <div>
                  <p className="text-sm font-semibold">{a.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.detail}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">{a.time}</p>
                </div>
              </Link>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-2">
            <p className="text-xs text-muted-foreground">Sample hospital alerts</p>
            <Link
              to={links.notifications}
              onClick={() => setAlertsOpen(false)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              View delivery log
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
              {initials}
            </span>
            <span className="hidden max-w-40 text-left leading-tight md:block">
              <span className="block truncate text-sm font-semibold">{profile.name}</span>
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
            <span className="block truncate">{profile.name}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {profile.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setProfileDraft(profile);
              setProfileOpen(true);
            }}
          >
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
            <DialogDescription>{roleLabel} · MediFlow General Hospital</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!profileDraft.name.trim()) return;
              setProfile({ ...profileDraft, name: profileDraft.name.trim() });
              setProfileOpen(false);
            }}
            className="space-y-4"
          >
            {(
              [
                ["name", "Full name"],
                ["email", "Email"],
                ["phone", "Phone"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="mb-1.5 block text-muted-foreground">{label}</span>
                <input
                  required={key !== "phone"}
                  type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
                  maxLength={key === "name" ? 80 : 160}
                  value={profileDraft[key]}
                  onChange={(e) =>
                    setProfileDraft((previous) => ({ ...previous, [key]: e.target.value }))
                  }
                  className="h-10 w-full rounded-xl border border-input bg-secondary px-3 outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
            ))}
            <p className="text-xs text-muted-foreground">
              Demo profile. Changes last until the page is reloaded.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setProfileOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!profileDraft.name.trim()}>
                Save changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
