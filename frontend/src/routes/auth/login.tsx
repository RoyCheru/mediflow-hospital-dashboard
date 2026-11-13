import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AuthField, AuthPanel } from "@/components/AuthPanel";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/api/client";

export const Route = createFileRoute("/auth/login")({
  head: () => ({ meta: [{ title: "Sign in — MediFlow" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    navigate({
      to: user.role === "ADMIN" ? "/admin" : "/unauthorized",
      replace: true,
    });
  }, [navigate, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const loggedIn = await login(email.trim(), password);
      navigate({
        to: loggedIn.role === "ADMIN" ? "/admin" : "/unauthorized",
        replace: true,
      });
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPanel
      title="Sign in"
      description="Access the MediFlow workspace."
      footer={
        <p>
          New patient?{" "}
          <Link to="/auth/register" className="font-semibold text-primary hover:underline">
            Create an account
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@mediflow.co.ke"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <AuthField
          label="Password"
          type="password"
          placeholder="Enter your password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" className="h-4 w-4 accent-primary" />
            Remember me
          </label>
          <Link to="/auth/forgot-password" className="font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        {error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-4 text-xs text-muted-foreground">
        Admin access is required for the operations workspace. Staff accounts are created by an
        administrator.
      </p>
    </AuthPanel>
  );
}
