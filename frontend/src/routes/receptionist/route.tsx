import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { roleNavigation } from "@/lib/navigation";

export const Route = createFileRoute("/receptionist")({
  component: ReceptionistLayout,
});

function ReceptionistLayout() {
  return (
    <AppShell nav={roleNavigation.receptionist}>
      <Outlet />
    </AppShell>
  );
}
