import type { InputHTMLAttributes, ReactNode } from "react";
import { Input } from "@/components/ui/input";

export function AuthPanel({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-6">{children}</div>
      {footer && <div className="mt-6 border-t border-border pt-4 text-sm">{footer}</div>}
    </div>
  );
}

export function AuthField({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-muted-foreground">{label}</span>
      <Input {...props} />
    </label>
  );
}
