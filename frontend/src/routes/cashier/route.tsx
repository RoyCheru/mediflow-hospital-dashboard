import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { roleNavigation } from "@/lib/navigation";

export const Route = createFileRoute("/cashier")({
  component: CashierLayout,
});

function CashierLayout() {
  return (
    <AppShell nav={roleNavigation.cashier}>
      <Outlet />
    </AppShell>
  );
}
