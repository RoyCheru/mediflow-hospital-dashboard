import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AuthField, AuthPanel } from "@/components/AuthPanel";

export const Route = createFileRoute("/auth/register")({
  head: () => ({ meta: [{ title: "Create patient account — MediFlow" }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ to: "/auth/verify" });
  }

  return (
    <AuthPanel
      title="Create patient account"
      description="Register to book appointments, view results and pay invoices."
      footer={
        <p>
          Already registered?{" "}
          <Link to="/auth/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <AuthField label="First name" autoComplete="given-name" required />
          <AuthField label="Last name" autoComplete="family-name" required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <AuthField label="Date of birth" type="date" required />
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted-foreground">Sex</span>
            <select
              required
              defaultValue=""
              className="h-10 w-full rounded-xl border border-input bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="" disabled>
                Select
              </option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
        <AuthField label="National ID / birth certificate" autoComplete="off" required />
        <AuthField label="Phone number" type="tel" autoComplete="tel" required />
        <AuthField label="Email" type="email" autoComplete="email" required />
        <AuthField label="SHA member number (optional)" autoComplete="off" />
        <AuthField
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
        />
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" required />
          <span>
            I consent to receive appointment and billing notifications by email and WhatsApp.
          </span>
        </label>
        <Button type="submit" className="w-full">
          Create account
        </Button>
      </form>
    </AuthPanel>
  );
}
