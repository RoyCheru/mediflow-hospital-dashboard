import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { roleNavigation } from "@/lib/navigation";
import { requireRole } from "@/lib/roleGuard";

export const Route = createFileRoute("/cashier")({
  beforeLoad: requireRole(["CASHIER"]),
  component: CashierLayout,
});

function CashierLayout() {
  return (
    <RoleGate roles={["CASHIER"]}>
      <AppShell nav={roleNavigation.cashier}>
        <Outlet />
      </AppShell>
    </RoleGate>
  );
}
