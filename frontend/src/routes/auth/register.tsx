import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AuthField, AuthPanel } from "@/components/AuthPanel";
import { errorMessage } from "@/lib/api/client";
import { registerPatient } from "@/lib/api/auth";

export const Route = createFileRoute("/auth/register")({
  head: () => ({ meta: [{ title: "Create patient account — MediFlow" }] }),
  component: RegisterPage,
});

const initialForm = {
  first_name: "",
  last_name: "",
  date_of_birth: "",
  sex: "FEMALE",
  national_id: "",
  phone: "",
  email: "",
  sha_number: "",
  password: "",
  confirm_password: "",
  consent: true,
};

function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (key: keyof typeof initialForm, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (form.password !== form.confirm_password) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const result = await registerPatient({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        date_of_birth: form.date_of_birth,
        sex: form.sex,
        national_id: form.national_id.trim() || undefined,
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        sha_number: form.sha_number.trim() || undefined,
        password: form.password,
        whatsapp_consent: form.consent,
        email_consent: form.consent,
      });
      if (result.verification_token) {
        sessionStorage.setItem("mediflow.verification_token", result.verification_token);
      }
      toast.success("Account created. Verify your email or phone to continue.");
      navigate({ to: "/auth/verify" });
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
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
          <AuthField
            label="First name"
            autoComplete="given-name"
            value={form.first_name}
            onChange={(event) => set("first_name", event.target.value)}
            required
          />
          <AuthField
            label="Last name"
            autoComplete="family-name"
            value={form.last_name}
            onChange={(event) => set("last_name", event.target.value)}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <AuthField
            label="Date of birth"
            type="date"
            value={form.date_of_birth}
            onChange={(event) => set("date_of_birth", event.target.value)}
            required
          />
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted-foreground">Sex</span>
            <select
              required
              value={form.sex}
              onChange={(event) => set("sex", event.target.value)}
              className="h-10 w-full rounded-xl border border-input bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="FEMALE">Female</option>
              <option value="MALE">Male</option>
              <option value="OTHER">Other</option>
              <option value="UNKNOWN">Prefer not to say</option>
            </select>
          </label>
        </div>
        <AuthField
          label="National ID / birth certificate"
          autoComplete="off"
          value={form.national_id}
          onChange={(event) => set("national_id", event.target.value)}
          required
        />
        <AuthField
          label="Phone number"
          type="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={(event) => set("phone", event.target.value)}
          required
        />
        <AuthField
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(event) => set("email", event.target.value)}
          required
        />
        <AuthField
          label="SHA member number (optional)"
          autoComplete="off"
          value={form.sha_number}
          onChange={(event) => set("sha_number", event.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <AuthField
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={form.password}
            onChange={(event) => set("password", event.target.value)}
            required
          />
          <AuthField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={form.confirm_password}
            onChange={(event) => set("confirm_password", event.target.value)}
            required
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-primary"
            checked={form.consent}
            onChange={(event) => set("consent", event.target.checked)}
          />
          <span>
            I consent to receive appointment and billing notifications by email and WhatsApp.
          </span>
        </label>
        {error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthPanel>
  );
}
