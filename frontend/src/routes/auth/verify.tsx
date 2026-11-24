import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AuthField, AuthPanel } from "@/components/AuthPanel";
import { errorMessage } from "@/lib/api/client";
import { verifyAccount } from "@/lib/api/auth";

export const Route = createFileRoute("/auth/verify")({
  head: () => ({ meta: [{ title: "Verify your account — MediFlow" }] }),
  component: VerifyPage,
});

function VerifyPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("mediflow.verification_token");
    if (stored) setToken(stored);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await verifyAccount(token.trim());
      sessionStorage.removeItem("mediflow.verification_token");
      toast.success("Account verified. You can sign in now.");
      navigate({ to: "/auth/login" });
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
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
          autoComplete="one-time-code"
          placeholder="Paste your verification code"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          required
        />
        {error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Verifying…" : "Verify account"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Verification codes expire after a short period. Request a new code if yours has expired.
        </p>
      </form>
    </AuthPanel>
  );
}
