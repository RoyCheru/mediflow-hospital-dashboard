import { CheckCircle2, type LucideIcon } from "lucide-react";

export type PlaceholderConfig = {
  title: string;
  description: string;
  icon: LucideIcon;
  items?: readonly string[];
};

export function PlaceholderPage({ title, description, icon: Icon, items = [] }: PlaceholderConfig) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      <section className="rounded-2xl border border-dashed border-border bg-secondary/40 p-8">
        <div className="mx-auto max-w-lg text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Icon className="h-7 w-7" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Page scaffold ready</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This route is wired into its role layout and navigation. Connect it to the matching API
            endpoints when the backend integration starts.
          </p>
          {items.length > 0 && (
            <ul className="mt-6 space-y-2 text-left">
              {items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

export function placeholderRoute(config: PlaceholderConfig) {
  return {
    head: () => ({ meta: [{ title: `${config.title} — MediFlow` }] }),
    component: () => <PlaceholderPage {...config} />,
  };
}
