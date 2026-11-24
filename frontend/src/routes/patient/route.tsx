import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { roleNavigation } from "@/lib/navigation";
import { requireRole } from "@/lib/roleGuard";

export const Route = createFileRoute("/patient")({
  beforeLoad: requireRole(["PATIENT"]),
  component: PatientLayout,
});

function PatientLayout() {
  return (
    <RoleGate roles={["PATIENT"]}>
      <AppShell nav={roleNavigation.patient}>
        <Outlet />
      </AppShell>
    </RoleGate>
  );
}
