import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { roleNavigation } from "@/lib/navigation";

export const Route = createFileRoute("/doctor")({
  component: DoctorLayout,
});

function DoctorLayout() {
  return (
    <AppShell nav={roleNavigation.doctor}>
      <Outlet />
    </AppShell>
  );
}
