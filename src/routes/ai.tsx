import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Sparkles,
  Brain,
  ShieldAlert,
  FileText,
  Send,
  CheckCircle2,
  RefreshCw,
  Activity,
  Search,
  Users,
} from "lucide-react";
import {
  Badge,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Panel,
  StatCard,
  inputCls,
  textareaCls,
  th,
  td,
  tableWrap,
  theadRow,
  tbodyRow,
} from "@/components/kit";
import {
  aiInteractions as seedInteractions,
  appointments,
  claims,
  invoices,
  ksh,
  patients,
  titleize,
  visits as seedVisits,
  type AIFeature,
  type AIInteraction,
  type Visit,
} from "@/lib/data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "AI Assistant — MediFlow" },
      {
        name: "description",
        content: "Triage, visit summaries, no-show risk and natural-language report queries.",
      },
      { property: "og:title", content: "AI Assistant — MediFlow" },
      {
        property: "og:description",
        content: "Triage, visit summaries, no-show risk and natural-language report queries.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Tab = "triage" | "summaries" | "risk" | "query";
const presets = [
  "Show revenue by payment method this month",
  "How many SHA claims are aging?",
  "Which doctor has the highest workload?",
  "What is today's cash position?",
];

function Page() {
  const [tab, setTab] = useState<Tab>("triage");
  const [interactions, setInteractions] = useState<AIInteraction[]>(seedInteractions);
  const [visits, setVisits] = useState<Visit[]>(seedVisits);
  const [triageForm, setTriageForm] = useState({ symptoms: "", age: "", duration: "" });
  const [triageResult, setTriageResult] = useState<{
    urgency: string;
    dept: string;
    rationale: string;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [queryResult, setQueryResult] = useState<string | null>(null);
  const [modal, setModal] = useState<AIInteraction | null>(null);

  const approvedSummaries = visits.filter((v) => v.aiApproved).length;
  const highRisk = patients.filter((p) => p.noShowScore >= 0.25).length;
  const queryCount = interactions.filter((i) => i.feature === "REPORT_QUERY").length;

  const addInteraction = (feature: AIFeature, input: string, output: string) => {
    const next: AIInteraction = {
      id: `ai-${3302 + interactions.length}`,
      feature,
      input,
      output,
      status: "COMPLETED",
      approved: false,
      provider: "deterministic",
      createdAt: "29 Oct 2026, 17:30",
    };
    setInteractions((list) => [next, ...list]);
  };

  const runTriage = () => {
    if (!triageForm.symptoms.trim()) {
      toast.error("Describe the symptoms first");
      return;
    }
    const text = triageForm.symptoms.toLowerCase();
    const emergency = [
      "chest pain",
      "difficulty breathing",
      "shortness of breath",
      "stiff neck",
      "severe bleeding",
      "unconscious",
      "stroke",
      "seizure",
    ].some((k) => text.includes(k));
    const urgent = ["fever", "vomiting", "abdominal pain", "fracture", "injury", "dizziness"].some(
      (k) => text.includes(k),
    );
    const urgency = emergency ? "EMERGENCY" : urgent ? "URGENT" : "ROUTINE";
    const dept =
      text.includes("chest") || text.includes("heart")
        ? "Cardiology"
        : text.includes("child") || text.includes("baby")
          ? "Pediatrics"
          : text.includes("pregnan") || text.includes("labour")
            ? "Maternity"
            : text.includes("bone") || text.includes("fracture") || text.includes("joint")
              ? "Orthopedics"
              : text.includes("scan") || text.includes("x-ray")
                ? "Radiology"
                : "Outpatient";
    const rationale = emergency
      ? "Red-flag symptoms detected. Escalate immediately to emergency care."
      : urgent
        ? "Symptoms need same-day clinical review. Book the next available slot."
        : "No red flags detected. Routine outpatient review is appropriate.";
    const result = { urgency, dept, rationale };
    setTriageResult(result);
    addInteraction("TRIAGE", triageForm.symptoms, `${urgency} · ${dept} · ${rationale}`);
    toast.success("Triage suggestion ready");
  };

  const generateSummary = (id: string) => {
    const v = visits.find((x) => x.id === id);
    if (!v) return;
    const summary = `${v.patient} presents with ${v.complaint.toLowerCase()}. Vitals: BP ${v.vitals.bp}, pulse ${v.vitals.pulse}, SpO₂ ${v.vitals.spo2}. Diagnosis: ${v.diagnosis}. Plan: ${v.plan}`;
    setVisits((list) =>
      list.map((x) => (x.id === id ? { ...x, aiSummary: summary, aiApproved: false } : x)),
    );
    addInteraction("VISIT_SUMMARY", `Visit ${id} clinical notes`, summary);
    toast.success("Summary draft generated — approval required");
  };

  const approveSummary = (id: string) => {
    setVisits((list) => list.map((x) => (x.id === id ? { ...x, aiApproved: true } : x)));
    toast.success("Summary approved");
  };

  const runQuery = (text = query) => {
    if (!text.trim()) {
      toast.error("Ask a question first");
      return;
    }
    const q = text.toLowerCase();
    let result: string;
    if (q.includes("revenue")) {
      const total = invoices.reduce((a, i) => a + i.total, 0);
      result = `Revenue overview: ${ksh(total)} invoiced across ${invoices.length} invoices. SHA accounts for the largest share of settled value, followed by M-Pesa.`;
    } else if (q.includes("claim")) {
      const open = claims.filter((c) => !["PAID", "CANCELLED"].includes(c.status));
      result = `${open.length} SHA claims are open, worth ${ksh(open.reduce((a, c) => a + c.claimed, 0))}. ${claims.filter((c) => c.days >= 14).length} claims are aging 14+ days and should be escalated.`;
    } else if (q.includes("no-show") || q.includes("no show")) {
      result = `${highRisk} patients are high risk for no-shows. ${patients.filter((p) => p.noShowScore >= 0.15).length} patients score above 0.15; prioritise reminders for the top 5.`;
    } else if (q.includes("workload") || q.includes("doctor")) {
      result =
        "Dr. Paul Njoroge has the highest visit load today (26 patients), followed by Dr. Achieng Odhiambo (18) and Dr. Peter Kiprono (14). Consider redistributing routine reviews.";
    } else if (q.includes("cash")) {
      result =
        "Today's expected cash is KSh 18,400 against KSh 18,400 counted — balanced. M-Pesa contributes KSh 92,600 across 31 payments.";
    } else {
      result =
        "I can answer questions about revenue, SHA claims, no-shows, doctor workload and daily cash. Try one of the suggested prompts.";
    }
    setQueryResult(result);
    addInteraction("REPORT_QUERY", text, result);
    toast.success("Report query answered");
  };

  return (
    <div>
      <PageHeader
        title="AI Assistant"
        subtitle="Triage, visit summaries, no-show risk and natural-language report queries."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={Brain}
          label="AI Interactions"
          value={String(interactions.length)}
          change={11.2}
        />
        <StatCard
          tone="yellow"
          icon={CheckCircle2}
          label="Approved Summaries"
          value={String(approvedSummaries)}
          change={6.4}
        />
        <StatCard
          tone="pink"
          icon={ShieldAlert}
          label="High No-show Risk"
          value={String(highRisk)}
          change={-2.8}
        />
        <StatCard
          tone="purple"
          icon={Search}
          label="Report Queries"
          value={String(queryCount)}
          change={9.5}
        />
      </div>

      <Panel>
        <div className="flex overflow-x-auto rounded-xl bg-secondary p-1">
          {(
            [
              ["triage", "Triage"],
              ["summaries", "Visit summaries"],
              ["risk", "No-show risk"],
              ["query", "Report queries"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition",
                tab === id
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "triage" && (
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              <Field label="Symptoms">
                <textarea
                  className={textareaCls}
                  value={triageForm.symptoms}
                  onChange={(e) => setTriageForm({ ...triageForm, symptoms: e.target.value })}
                  placeholder="e.g. Fever, headache and stiff neck for 2 days"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Age">
                  <input
                    type="number"
                    className={inputCls}
                    value={triageForm.age}
                    onChange={(e) => setTriageForm({ ...triageForm, age: e.target.value })}
                  />
                </Field>
                <Field label="Duration">
                  <input
                    className={inputCls}
                    value={triageForm.duration}
                    onChange={(e) => setTriageForm({ ...triageForm, duration: e.target.value })}
                    placeholder="2 days"
                  />
                </Field>
              </div>
              <button
                onClick={runTriage}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                <Sparkles className="h-4 w-4" />
                Suggest triage
              </button>
              <p className="text-xs text-muted-foreground">
                POST /ai/triage · deterministic demo, not a diagnosis. Clinician review is required.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/40 p-4">
              {triageResult ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Suggested urgency</p>
                    <Badge
                      tone={
                        triageResult.urgency === "EMERGENCY"
                          ? "danger"
                          : triageResult.urgency === "URGENT"
                            ? "warning"
                            : "success"
                      }
                    >
                      {titleize(triageResult.urgency)}
                    </Badge>
                  </div>
                  <div className="rounded-xl bg-card p-3">
                    <p className="text-xs text-muted-foreground">Recommended department</p>
                    <p className="mt-1 text-lg font-bold">{triageResult.dept}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{triageResult.rationale}</p>
                </div>
              ) : (
                <div className="grid h-full place-items-center py-10 text-center">
                  <div>
                    <Brain className="mx-auto h-10 w-10 text-primary" />
                    <p className="mt-3 text-sm font-semibold">Triage suggestions appear here</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Describe symptoms and run the assistant.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "summaries" && (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {visits.map((v) => (
              <div key={v.id} className="rounded-2xl border border-border bg-secondary/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{v.patient}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.id} · {v.doctor} · {v.dept}
                    </p>
                  </div>
                  {v.aiSummary ? (
                    <Badge tone={v.aiApproved ? "success" : "warning"}>
                      {v.aiApproved ? "Approved" : "Draft"}
                    </Badge>
                  ) : (
                    <Badge tone="muted">Not generated</Badge>
                  )}
                </div>
                <p className="mt-3 min-h-12 rounded-xl bg-card p-3 text-xs leading-relaxed text-muted-foreground">
                  {v.aiSummary ??
                    "Generate a draft from the consultation notes. Clinician approval is required before sharing."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => generateSummary(v.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {v.aiSummary ? "Regenerate" : "Generate"}
                  </button>
                  {v.aiSummary && !v.aiApproved && (
                    <button
                      onClick={() => approveSummary(v.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "risk" && (
          <div className={cn(tableWrap, "mt-5")}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  {[
                    "Patient",
                    "Department",
                    "Next appointment",
                    "No-show score",
                    "Risk",
                    "Action",
                  ].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...patients]
                  .sort((a, b) => b.noShowScore - a.noShowScore)
                  .map((p) => {
                    const next = appointments.find(
                      (a) => a.patientId === p.id && a.status === "SCHEDULED",
                    );
                    const risk =
                      p.noShowScore >= 0.3 ? "High" : p.noShowScore >= 0.15 ? "Medium" : "Low";
                    return (
                      <tr key={p.id} className={tbodyRow}>
                        <td className={td}>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.phone}</div>
                        </td>
                        <td className={td}>{p.dept}</td>
                        <td className={td}>
                          {next ? (
                            `${next.date} · ${next.time}`
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className={td}>
                          <span
                            className={cn(
                              "font-semibold",
                              risk === "High"
                                ? "text-destructive"
                                : risk === "Medium"
                                  ? "text-warning"
                                  : "text-success",
                            )}
                          >
                            {p.noShowScore.toFixed(2)}
                          </span>
                        </td>
                        <td className={td}>
                          <Badge
                            tone={
                              risk === "High" ? "danger" : risk === "Medium" ? "warning" : "success"
                            }
                          >
                            {risk}
                          </Badge>
                        </td>
                        <td className={td}>
                          <button
                            onClick={() => {
                              addInteraction(
                                "NO_SHOW_RISK",
                                `${p.name} · ${p.phone}`,
                                `Reminder queued for ${p.name} (score ${p.noShowScore.toFixed(2)})`,
                              );
                              toast.success(`Reminder queued for ${p.name}`);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                          >
                            <Send className="h-3.5 w-3.5" />
                            Send reminder
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                {patients.length === 0 && <EmptyState cols={6} />}
              </tbody>
            </table>
          </div>
        )}

        {tab === "query" && (
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <Field label="Ask about your hospital data">
                <textarea
                  className={textareaCls}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. Show revenue by payment method this month"
                />
              </Field>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => runQuery()}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                >
                  <Search className="h-4 w-4" />
                  Run query
                </button>
                {presets.slice(0, 2).map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setQuery(p);
                      runQuery(p);
                    }}
                    className="rounded-xl bg-secondary px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-border bg-secondary/40 p-4">
                {queryResult ? (
                  <p className="text-sm leading-relaxed">{queryResult}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Ask a natural-language question. The demo answers revenue, claims, no-show,
                    workload and cash queries deterministically.
                  </p>
                )}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Suggested prompts
              </p>
              <div className="space-y-2">
                {presets.map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setQuery(p);
                      runQuery(p);
                    }}
                    className="w-full rounded-xl border border-border bg-secondary/40 p-3 text-left text-sm transition-colors hover:bg-accent/60"
                  >
                    {p}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                POST /admin/report-queries · every query is written to the audit log.
              </p>
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="AI interaction log"
        className="mt-6"
        action={<span className="text-xs text-muted-foreground">Provider: deterministic</span>}
      >
        <div className={tableWrap}>
          <table className="w-full">
            <thead>
              <tr className={theadRow}>
                {["Feature", "Input", "Output", "Status", "Created", "Actions"].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {interactions.map((i) => (
                <tr key={i.id} className={tbodyRow}>
                  <td className={td}>
                    <Badge tone="info">{titleize(i.feature)}</Badge>
                  </td>
                  <td className={cn(td, "max-w-64 truncate")}>{i.input}</td>
                  <td className={cn(td, "max-w-64 truncate text-muted-foreground")}>{i.output}</td>
                  <td className={td}>
                    <Badge
                      tone={
                        i.status === "APPROVED"
                          ? "success"
                          : i.status === "FAILED"
                            ? "danger"
                            : "info"
                      }
                    >
                      {titleize(i.status)}
                    </Badge>
                  </td>
                  <td className={cn(td, "text-muted-foreground")}>{i.createdAt}</td>
                  <td className={td}>
                    <button
                      onClick={() => setModal(i)}
                      className="rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {interactions.length === 0 && <EmptyState cols={6} />}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        wide
        title={modal ? titleize(modal.feature) : "AI interaction"}
        subtitle={modal ? `${modal.id} · ${modal.provider}` : undefined}
        footer={
          <button
            onClick={() => setModal(null)}
            className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
          >
            Close
          </button>
        }
      >
        {modal && (
          <div className="space-y-3">
            <div className="rounded-xl bg-secondary p-3">
              <p className="text-xs text-muted-foreground">Input</p>
              <p className="mt-1 text-sm">{modal.input}</p>
            </div>
            <div className="rounded-xl bg-secondary p-3">
              <p className="text-xs text-muted-foreground">Output</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{modal.output}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>Status: {titleize(modal.status)}</span>
              <span>Approved: {modal.approved ? "Yes" : "No"}</span>
              <span>Created: {modal.createdAt}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              <Activity className="mr-1 inline h-3.5 w-3.5" />
              AI output is decision support only. Clinicians remain responsible for care decisions.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
