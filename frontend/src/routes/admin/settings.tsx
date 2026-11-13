import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, LogOut, Server, Settings, ShieldCheck, Users } from "lucide-react";
import {
  Badge,
  DetailRow,
  EmptyState,
  PageHeader,
  Panel,
  td,
  th,
  tableWrap,
  tbodyRow,
  theadRow,
} from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api/client";
import { listUsers, managementKeys, updateUser } from "@/lib/api/management";
import { useAuth } from "@/lib/auth";
import { titleize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { UserStatus } from "@/types/api";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "Settings — MediFlow" },
      { name: "description", content: "Admin profile, account security and staff access." },
      { property: "og:title", content: "Settings — MediFlow" },
      { property: "og:description", content: "Admin profile, account security and staff access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"profile" | "users">("profile");

  const usersQuery = useQuery({
    queryKey: managementKeys.users({ page_size: 20, sort: "-created_at" }),
    queryFn: () => listUsers({ page_size: 20, sort: "-created_at" }),
    staleTime: 60_000,
    enabled: tab === "users",
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; status: UserStatus }) =>
      updateUser(payload.id, { status: payload.status }),
    onSuccess: () => {
      toast.success("User access updated");
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Your admin profile, session security and staff access."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {(["profile", "users"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              tab === value
                ? "bg-primary text-primary-foreground shadow-glow"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "profile" ? <Settings className="h-4 w-4" /> : <Users className="h-4 w-4" />}
            {value === "profile" ? "Profile & security" : "Staff access"}
          </button>
        ))}
      </div>

      {tab === "profile" ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Admin profile">
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="Name" value={user?.full_name ?? "—"} />
              <DetailRow label="Role" value={titleize(user?.role)} />
              <DetailRow label="Email" value={user?.email ?? "—"} />
              <DetailRow label="Phone" value={user?.phone ?? "—"} />
              <DetailRow label="Email verified" value={user?.email_verified ? "Yes" : "No"} />
              <DetailRow label="Phone verified" value={user?.phone_verified ? "Yes" : "No"} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void logout()}>
                <LogOut /> Sign out
              </Button>
              <Button asChild variant="outline">
                <Link to="/auth/forgot-password">Reset password</Link>
              </Button>
            </div>
          </Panel>

          <Panel title="Session & security">
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl bg-secondary/50 p-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Server-enforced access</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Every admin endpoint checks the JWT role on the server. Frontend guards are only
                    a convenience.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl bg-secondary/50 p-3">
                <BadgeCheck className="mt-0.5 h-5 w-5 text-success" />
                <div>
                  <p className="text-sm font-semibold">Staff inactivity timeout</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Staff sessions expire after the configured inactivity window and return a 401,
                    which signs this client out.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl bg-secondary/50 p-3">
                <Server className="mt-0.5 h-5 w-5 text-info" />
                <div>
                  <p className="text-sm font-semibold">API endpoint</p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">{API_URL}</p>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      ) : (
        <Panel title="Staff access">
          {usersQuery.isLoading ? (
            <LoadingRows rows={5} />
          ) : usersQuery.error ? (
            <ErrorBlock error={usersQuery.error} onRetry={() => void usersQuery.refetch()} />
          ) : (usersQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState cols={5} message="No staff accounts found." />
          ) : (
            <div className={tableWrap}>
              <table className="w-full">
                <thead>
                  <tr className={theadRow}>
                    <th className={th}>Name</th>
                    <th className={th}>Email</th>
                    <th className={th}>Role</th>
                    <th className={th}>Status</th>
                    <th className={th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {usersQuery.data?.items.map((member) => (
                    <tr key={member.id} className={tbodyRow}>
                      <td className={cn(td, "font-medium")}>{member.full_name}</td>
                      <td className={td}>{member.email ?? "—"}</td>
                      <td className={td}>
                        <Badge tone="muted">{titleize(member.role)}</Badge>
                      </td>
                      <td className={td}>
                        <Badge>{titleize(member.status)}</Badge>
                      </td>
                      <td className={td}>
                        {member.status === "ACTIVE" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              statusMutation.mutate({ id: member.id, status: "INACTIVE" })
                            }
                            disabled={member.id === user?.id}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() =>
                              statusMutation.mutate({ id: member.id, status: "ACTIVE" })
                            }
                          >
                            Activate
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
