import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AuthField, AuthPanel } from "@/components/AuthPanel";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — MediFlow" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(true);
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
          <p>
            If an account exists for that email, a reset link is on its way. Follow the link to
            choose a new password.
          </p>
          <Button asChild className="w-full">
            <Link to="/auth/reset-password">Continue to reset form</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthField label="Email" type="email" autoComplete="email" required />
          <Button type="submit" className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthPanel>
  );
}
