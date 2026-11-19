import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { roleNavigation } from "@/lib/navigation";
import { requireRole } from "@/lib/roleGuard";

export const Route = createFileRoute("/doctor")({
  beforeLoad: requireRole(["DOCTOR"]),
  component: DoctorLayout,
});

function DoctorLayout() {
  return (
    <RoleGate roles={["DOCTOR"]}>
      <AppShell nav={roleNavigation.doctor}>
        <Outlet />
      </AppShell>
    </RoleGate>
  );
}
