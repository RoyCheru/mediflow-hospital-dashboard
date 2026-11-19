import { redirect } from "@tanstack/react-router";
import { getStoredSession } from "@/lib/auth-storage";
import type { Role } from "@/types/api";

export type RoleHome = "/admin" | "/doctor" | "/receptionist" | "/cashier" | "/unauthorized";

/** Where each role lands after sign-in. Roles without a live area stay on /unauthorized. */
export function homeForRole(role: Role): RoleHome {
  if (role === "ADMIN") return "/admin";
  if (role === "DOCTOR") return "/doctor";
  if (role === "RECEPTIONIST") return "/receptionist";
  if (role === "CASHIER") return "/cashier";
  return "/unauthorized";
}

/**
 * Route beforeLoad guard. Tokens live in localStorage, which is unavailable
 * during SSR, so the layout (RoleGate) re-validates on the client. The API
 * enforces roles server-side regardless.
 */
export function requireRole(roles: Role[]) {
  return () => {
    if (typeof window === "undefined") return;
    const session = getStoredSession();
    if (!session) {
      throw redirect({ to: "/auth/login" });
    }
    if (!roles.includes(session.user.role)) {
      throw redirect({ to: "/unauthorized" });
    }
  };
}
