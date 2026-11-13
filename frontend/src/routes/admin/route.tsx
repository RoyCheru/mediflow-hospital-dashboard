import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { roleNavigation } from "@/lib/navigation";
import { getStoredSession } from "@/lib/auth-storage";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin")({
  beforeLoad: () => {
    const session = getStoredSession();
    if (!session) {
      throw redirect({ to: "/auth/login" });
    }
    if (session.user.role !== "ADMIN") {
      throw redirect({ to: "/unauthorized" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      navigate({ to: "/auth/login", replace: true });
      return;
    }
    if (user.role !== "ADMIN") {
      navigate({ to: "/unauthorized", replace: true });
    }
  }, [isLoading, navigate, user]);

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <p className="text-sm text-muted-foreground">Checking your session…</p>
      </div>
    );
  }

  if (!user || user.role !== "ADMIN") return null;

  return (
    <AppShell nav={roleNavigation.admin}>
      <Outlet />
    </AppShell>
  );
}
