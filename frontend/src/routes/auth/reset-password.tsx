import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AuthField, AuthPanel } from "@/components/AuthPanel";
import { errorMessage } from "@/lib/api/client";
import { confirmPasswordReset } from "@/lib/api/auth";

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({ meta: [{ title: "Choose a new password — MediFlow" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("mediflow.reset_token");
    if (stored) setToken(stored);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      await confirmPasswordReset(token.trim(), password);
      sessionStorage.removeItem("mediflow.reset_token");
      toast.success("Password updated. Sign in with your new password.");
      navigate({ to: "/auth/login" });
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPanel
      title="Choose a new password"
      description="Your reset link verifies your account before this step."
      footer={
        <p>
          Need a new link?{" "}
          <Link to="/auth/forgot-password" className="font-semibold text-primary hover:underline">
            Request another
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          label="Reset code"
          autoComplete="one-time-code"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          required
        />
        <AuthField
          label="New password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <AuthField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          required
        />
        {error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Updating…" : "Update password"}
        </Button>
      </form>
    </AuthPanel>
  );
}
