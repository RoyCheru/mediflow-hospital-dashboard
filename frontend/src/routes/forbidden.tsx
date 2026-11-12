import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/forbidden")({
  head: () => ({ meta: [{ title: "Access denied — MediFlow" }] }),
  component: ForbiddenPage,
});

function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-destructive/15 text-destructive">
          <ShieldAlert className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your role does not have permission to open this page. If you think this is a mistake,
          contact a hospital administrator.
        </p>
        <Link
          to="/auth/login"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
