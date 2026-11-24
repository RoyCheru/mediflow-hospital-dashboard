import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AuthField, AuthPanel } from "@/components/AuthPanel";
import { errorMessage } from "@/lib/api/client";
import { requestPasswordReset } from "@/lib/api/auth";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — MediFlow" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [tokenReady, setTokenReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await requestPasswordReset(email.trim());
      setSent(true);
      setMessage(result.message);
      if (result.reset_token) {
        sessionStorage.setItem("mediflow.reset_token", result.reset_token);
        setTokenReady(true);
      }
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPanel
      title="Reset your password"
      description="Enter your email and we will send a password-reset link."
      footer={
        <p>
          Remembered it?{" "}
          <Link to="/auth/login" className="font-semibold text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      {sent ? (
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>{message}</p>
          {tokenReady ? (
            <Button asChild className="w-full">
              <Link to="/auth/reset-password">Continue to reset form</Link>
            </Button>
          ) : (
            <p className="text-xs">
              Follow the link in your email to choose a new password. If you do not receive it,
              check your spam folder or request another link.
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          {error && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthPanel>
  );
}
