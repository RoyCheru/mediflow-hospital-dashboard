import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, HeartPulse, Lock, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";

export const Route = createFileRoute("/signin")({
  head: () => ({
    meta: [
      { title: "Sign in — MediFlow Hospital Management" },
      {
        name: "description",
        content: "Sign in to MediFlow, or continue as a guest to explore the dashboard.",
      },
    ],
  }),
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Demo only: there is no authentication backend. Any values take you to the dashboard.
    navigate({ to: "/" });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -right-32 h-96 w-96 rounded-full bg-grad-purple/20 blur-3xl"
      />

      <div className="relative w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-grad-teal text-on-gradient shadow-glow">
            <HeartPulse className="h-5 w-5" />
          </span>
          <span className="text-2xl font-bold tracking-tight">
            Medi<span className="text-primary">Flow</span>
          </span>
        </Link>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Access the MediFlow hospital workspace.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                Work email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@hospital.co.ke"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-11 w-full rounded-xl bg-secondary pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 w-full rounded-xl bg-secondary pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <button
              type="submit"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-glow transition-opacity hover:opacity-90"
            >
              Sign in
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              or
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Link
            to="/"
            className="flex h-11 w-full items-center justify-center rounded-xl border border-border bg-secondary/60 text-sm font-semibold transition-colors hover:bg-accent"
          >
            Continue as guest
          </Link>

          <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
            Trouble signing in? Use the support button in the bottom-right corner to raise a request
            without an account.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Demo sign-in — no credentials are sent or stored.
        </p>
      </div>
    </div>
  );
}
