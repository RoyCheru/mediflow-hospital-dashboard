import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Brain, Send, Sparkles } from "lucide-react";
import {
  Badge,
  Field,
  Modal,
  PageHeader,
  Panel,
  textareaCls,
  td,
  th,
  tableWrap,
  tbodyRow,
  theadRow,
} from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { aiKeys, listAIInteractions, reportQuery, runTriage } from "@/lib/api/ai";
import { formatDateTime, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AIInteraction } from "@/types/api";

export const Route = createFileRoute("/admin/ai")({
  head: () => ({
    meta: [
      { title: "AI Assistant — MediFlow" },
      {
        name: "description",
        content: "Assistive triage, visit summaries and allowlisted report queries.",
      },
      { property: "og:title", content: "AI Assistant — MediFlow" },
      {
        property: "og:description",
        content: "Assistive triage, visit summaries and report queries.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Tab = "triage" | "interactions" | "reports";

function Page() {
  const [tab, setTab] = useState<Tab>("triage");
  const [symptoms, setSymptoms] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AIInteraction | null>(null);

  const interactionsQuery = useQuery({
    queryKey: aiKeys.interactions({ page_size: 20 }),
    queryFn: () => listAIInteractions({ page_size: 20 }),
    staleTime: 30_000,
    enabled: tab === "interactions",
  });

  const triageMutation = useMutation({
    mutationFn: () => runTriage(symptoms),
    onError: (error: Error) => {
      setTriageError(error.message);
    },
  });

  const [triageError, setTriageError] = useState<string | null>(null);

  const queryMutation = useMutation({
    mutationFn: () => reportQuery(query),
  });

  return (
    <div>
      <PageHeader
        title="AI Assistant"
        subtitle="Assistive tools only. Clinicians review every AI-generated output."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {(["triage", "interactions", "reports"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              tab === value
                ? "bg-primary text-primary-foreground shadow-glow"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "triage" ? (
              <Brain className="h-4 w-4" />
            ) : value === "interactions" ? (
              <Sparkles className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {titleize(value)}
          </button>
        ))}
      </div>

      {tab === "triage" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Triage assistant">
            <div className="space-y-3">
              <Field label="Symptoms">
                <textarea
                  className={textareaCls}
                  value={symptoms}
                  onChange={(event) => setSymptoms(event.target.value)}
                  placeholder="Describe the patient's symptoms"
                />
              </Field>
              {triageError && (
                <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {triageError}
                </p>
              )}
              <Button
                onClick={() => {
                  setTriageError(null);
                  triageMutation.mutate();
                }}
                disabled={!symptoms.trim() || triageMutation.isPending}
              >
                <Send /> {triageMutation.isPending ? "Assessing…" : "Run triage"}
              </Button>
              <p className="text-xs text-muted-foreground">
                This is not a diagnosis. Red-flag symptoms must follow the emergency pathway.
              </p>
            </div>
          </Panel>
          <Panel title="Triage result">
            {triageMutation.data ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {triageMutation.data.triage.suggested_department && (
                    <Badge tone="info">
                      {String(triageMutation.data.triage.suggested_department)}
                    </Badge>
                  )}
                  {triageMutation.data.triage.urgency && (
                    <Badge tone="warning">{String(triageMutation.data.triage.urgency)}</Badge>
                  )}
                  {triageMutation.data.triage.emergency && <Badge tone="danger">Emergency</Badge>}
                </div>
                <pre className="max-h-80 overflow-auto rounded-xl bg-secondary/60 p-3 text-xs">
                  {JSON.stringify(triageMutation.data.triage, null, 2)}
                </pre>
                <p className="text-xs text-muted-foreground">
                  Interaction {triageMutation.data.ai_interaction_id.slice(0, 8)} logged.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Run the assistant to see a suggested department and urgency.
              </p>
            )}
          </Panel>
        </div>
      )}

      {tab === "interactions" && (
        <Panel title="AI interaction log">
          {interactionsQuery.isLoading ? (
            <LoadingRows rows={5} />
          ) : interactionsQuery.error ? (
            <ErrorBlock
              error={interactionsQuery.error}
              onRetry={() => void interactionsQuery.refetch()}
            />
          ) : (
            <div className={tableWrap}>
              <table className="w-full">
                <thead>
                  <tr className={theadRow}>
                    <th className={th}>Feature</th>
                    <th className={th}>Status</th>
                    <th className={th}>Input</th>
                    <th className={th}>Provider</th>
                    <th className={th}>Created</th>
                    <th className={th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(interactionsQuery.data?.items.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        No AI interactions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    interactionsQuery.data?.items.map((item) => (
                      <tr key={item.id} className={tbodyRow}>
                        <td className={td}>{titleize(item.feature)}</td>
                        <td className={td}>
                          <Badge>{titleize(item.status)}</Badge>
                        </td>
                        <td className={cn(td, "max-w-80 truncate")}>{item.input_summary}</td>
                        <td className={td}>{item.provider}</td>
                        <td className={td}>{formatDateTime(item.created_at)}</td>
                        <td className={td}>
                          <Button size="sm" variant="outline" onClick={() => setSelected(item)}>
                            View
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {tab === "reports" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Natural-language report query">
            <div className="space-y-3">
              <Field label="Query">
                <textarea
                  className={textareaCls}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="e.g. show claims over 30 days old"
                />
              </Field>
              <Button
                onClick={() => queryMutation.mutate()}
                disabled={!query.trim() || queryMutation.isPending}
              >
                <Send /> {queryMutation.isPending ? "Running…" : "Run query"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Queries are mapped to an allowlisted, read-only report function. Raw SQL is never
                executed.
              </p>
            </div>
          </Panel>
          <Panel title="Result">
            {queryMutation.error ? (
              <ErrorBlock error={queryMutation.error} />
            ) : queryMutation.data ? (
              <pre className="max-h-96 overflow-auto rounded-xl bg-secondary/60 p-3 text-xs">
                {JSON.stringify(queryMutation.data, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">
                Results appear here after running an allowlisted query.
              </p>
            )}
          </Panel>
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="AI interaction"
        subtitle={selected ? titleize(selected.feature) : undefined}
        wide
        footer={
          <Button variant="outline" onClick={() => setSelected(null)}>
            Close
          </Button>
        }
      >
        {selected && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge>{titleize(selected.status)}</Badge>
              <Badge tone="muted">{selected.provider}</Badge>
              {selected.approved && <Badge tone="success">Approved</Badge>}
            </div>
            <div className="rounded-xl bg-secondary/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Input summary
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{selected.input_summary}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Output
              </p>
              <pre className="max-h-80 overflow-auto rounded-xl bg-secondary/60 p-3 text-xs">
                {JSON.stringify(selected.output, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
