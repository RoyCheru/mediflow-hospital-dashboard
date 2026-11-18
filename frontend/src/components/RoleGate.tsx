import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/types/api";

/** Client-side session check for a role area, mirroring the admin layout. */
export function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const allowed = Boolean(user && roles.includes(user.role));

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      navigate({ to: "/auth/login", replace: true });
      return;
    }
    if (!allowed) {
      navigate({ to: "/unauthorized", replace: true });
    }
  }, [allowed, isLoading, navigate, user]);

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <p className="text-sm text-muted-foreground">Checking your session…</p>
      </div>
    );
  }
  if (!allowed) return null;
  return <>{children}</>;
}
