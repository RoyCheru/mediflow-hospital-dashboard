import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AuthField, AuthPanel } from "@/components/AuthPanel";
import { roleHome, type Role } from "@/lib/navigation";

const demoRoles: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "doctor", label: "Doctor" },
  { value: "receptionist", label: "Reception" },
  { value: "cashier", label: "Cashier" },
  { value: "patient", label: "Patient" },
];

export const Route = createFileRoute("/auth/login")({
  head: () => ({ meta: [{ title: "Sign in — MediFlow" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("admin");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ to: roleHome[role] });
  }

  return (
    <AuthPanel
      title="Sign in"
      description="Access your MediFlow workspace."
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
        <AuthField label="Email" type="email" placeholder="you@mediflow.co.ke" required />
        <AuthField
          label="Password"
          type="password"
          placeholder="Enter your password"
          autoComplete="current-password"
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
        <label className="block text-sm">
          <span className="mb-1.5 block text-muted-foreground">Demo role</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            className="h-10 w-full rounded-xl border border-input bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {demoRoles.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" className="w-full">
          Sign in
        </Button>
      </form>
      <div className="mt-6 border-t border-border pt-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Preview a role workspace
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {demoRoles.map((option) => (
            <Link
              key={option.value}
              to={roleHome[option.value]}
              className="rounded-lg bg-secondary px-3 py-2 text-center text-xs font-semibold text-foreground transition-colors hover:bg-accent"
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>
    </AuthPanel>
  );
}
