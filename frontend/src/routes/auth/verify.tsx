import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AuthField, AuthPanel } from "@/components/AuthPanel";

export const Route = createFileRoute("/auth/verify")({
  head: () => ({ meta: [{ title: "Verify your account — MediFlow" }] }),
  component: VerifyPage,
});

function VerifyPage() {
  const navigate = useNavigate();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ to: "/auth/login" });
  }

  return (
    <AuthPanel
      title="Verify your email or phone"
      description="Enter the verification code we sent you to activate your account."
      footer={
        <p>
          Wrong details?{" "}
          <Link to="/auth/register" className="font-semibold text-primary hover:underline">
            Start again
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6-digit code"
          required
        />
        <Button type="submit" className="w-full">
          Verify account
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Verification codes expire after a short period. Request a new code if yours has expired.
        </p>
      </form>
    </AuthPanel>
  );
}
