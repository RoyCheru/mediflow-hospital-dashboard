import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/unauthorized")({
  head: () => ({ meta: [{ title: "Unauthorized — MediFlow" }] }),
  component: UnauthorizedPage,
});

function UnauthorizedPage() {
  const { user, logout } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-destructive/15 text-destructive">
          <ShieldAlert className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Admin access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {user
            ? `Your account role (${user.role.toLowerCase()}) cannot open the admin workspace.`
            : "You do not have permission to open the admin workspace."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to="/auth/login"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to sign in
          </Link>
          {user && (
            <button
              onClick={() => void logout()}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
