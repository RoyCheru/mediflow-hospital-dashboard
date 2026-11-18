import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AuthField, AuthPanel } from "@/components/AuthPanel";

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({ meta: [{ title: "Choose a new password — MediFlow" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ to: "/auth/login" });
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
          label="New password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
        />
        <AuthField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
        />
        <Button type="submit" className="w-full">
          Update password
        </Button>
      </form>
    </AuthPanel>
  );
}
