import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { roleNavigation } from "@/lib/navigation";
import { requireRole } from "@/lib/roleGuard";

export const Route = createFileRoute("/receptionist")({
  beforeLoad: requireRole(["RECEPTIONIST"]),
  component: ReceptionistLayout,
});

function ReceptionistLayout() {
  return (
    <RoleGate roles={["RECEPTIONIST"]}>
      <AppShell nav={roleNavigation.receptionist}>
        <Outlet />
      </AppShell>
    </RoleGate>
  );
}
