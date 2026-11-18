import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { roleNavigation } from "@/lib/navigation";

export const Route = createFileRoute("/patient")({
  component: PatientLayout,
});

function PatientLayout() {
  return (
    <AppShell nav={roleNavigation.patient}>
      <Outlet />
    </AppShell>
  );
}
