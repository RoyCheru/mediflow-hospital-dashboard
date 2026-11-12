import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { roleNavigation } from "@/lib/navigation";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <AppShell nav={roleNavigation.admin}>
      <Outlet />
    </AppShell>
  );
}
