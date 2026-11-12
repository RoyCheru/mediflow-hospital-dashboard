import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ShieldCheck,
  FileClock,
  BadgeCheck,
  XCircle,
  Eye,
  Plus,
  RefreshCw,
  Activity,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  Badge,
  DetailRow,
  EmptyState,
  Field,
  FilterSelect,
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
  claims as seedClaims,
  departments,
  eligibilityChecks as seedChecks,
  invoices,
  ksh,
  titleize,
  type Claim,
  type ClaimStatus,
  type EligibilityCheck,
  type EligibilityStatus,
} from "@/lib/data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/claims")({
  head: () => ({
    meta: [
      { title: "SHA Claims — MediFlow" },
      {
        name: "description",
        content: "SHA eligibility checks, claim submission, aging and resubmissions.",
      },
      { property: "og:title", content: "SHA Claims — MediFlow" },
      {
        property: "og:description",
        content: "SHA eligibility checks, claim submission, aging and resubmissions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Tab = "claims" | "eligibility" | "aging";
const statuses: ClaimStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "PAID",
  "CANCELLED",
];
const eligibilityStatuses: EligibilityStatus[] = [
  "ACTIVE",
  "INACTIVE",
  "LIMIT_EXHAUSTED",
  "UNKNOWN",
];

function Page() {
  const [tab, setTab] = useState<Tab>("claims");
  const [claims, setClaims] = useState<Claim[]>(seedClaims);
  const [checks, setChecks] = useState<EligibilityCheck[]>(seedChecks);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [dept, setDept] = useState("All");
  const [modal, setModal] = useState<null | "view" | "status" | "create" | "eligibility">(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [statusForm, setStatusForm] = useState({
    status: "UNDER_REVIEW" as ClaimStatus,
    note: "",
    approved: "",
  });
  const [claimForm, setClaimForm] = useState({
    invoice: invoices[0]?.number ?? "",
    claimed: String(invoices[0]?.total ?? 0),
  });
  const [eligibilityForm, setEligibilityForm] = useState({
    invoice: invoices[0]?.number ?? "",
    status: "ACTIVE" as EligibilityStatus,
    limit: "500000",
    consumed: "0",
  });

  const current = claims.find((c) => c.id === targetId);
  const list = claims.filter(
    (c) =>
      (status === "All" || c.status === status) &&
      (dept === "All" || c.dept === dept) &&
      `${c.id} ${c.patient} ${c.invoice}`.toLowerCase().includes(q.toLowerCase()),
  );
  const openClaims = claims.filter((c) => !["PAID", "CANCELLED"].includes(c.status));
  const totalClaimed = claims.reduce((a, c) => a + c.claimed, 0);
  const totalApproved = claims.reduce((a, c) => a + (c.approved ?? 0), 0);
  const rejected = claims.filter((c) => c.status === "REJECTED").length;
  const aging = claims
    .filter((c) => c.days > 0 && !["PAID", "CANCELLED"].includes(c.status))
    .sort((a, b) => b.days - a.days);
  const buckets = [
    { label: "0–7 days", min: 0, max: 7 },
    { label: "8–14 days", min: 8, max: 14 },
    { label: "15–21 days", min: 15, max: 21 },
    { label: "22+ days", min: 22, max: 9999 },
  ].map((b) => ({
    ...b,
    count: aging.filter((c) => c.days >= b.min && c.days <= b.max).length,
    amount: aging
      .filter((c) => c.days >= b.min && c.days <= b.max)
      .reduce((a, c) => a + c.claimed, 0),
  }));

  const patch = (id: string, fn: (c: Claim) => Claim) =>
    setClaims((list) => list.map((c) => (c.id === id ? fn(c) : c)));

  const openStatus = (claim: Claim) => {
    setTargetId(claim.id);
    setStatusForm({
      status: claim.status,
      note: "",
      approved: claim.approved ? String(claim.approved) : "",
    });
    setModal("status");
  };

  const saveStatus = () => {
    if (!current) return;
    const next = statusForm.status;
    patch(current.id, (c) => ({
      ...c,
      status: next,
      ...(next === "APPROVED" ? { approved: Number(statusForm.approved) || c.claimed } : {}),
      ...(next === "REJECTED"
        ? { rejectionReason: statusForm.note || "Rejected by reviewer", days: 0 }
        : {}),
      ...(next === "PAID" ? { paid: "29 Oct 2026", days: 0 } : {}),
      history: [
        ...c.history,
        {
          from: c.status,
          to: next,
          note: statusForm.note || `Status changed to ${titleize(next)}`,
          at: "29 Oct 2026",
        },
      ],
    }));
    setModal("view");
    toast.success(`Claim ${current.id} moved to ${titleize(next)}`);
  };

  const resubmit = (claim: Claim) => {
    patch(claim.id, (c) => {
      const { rejectionReason: _rejectionReason, ...rest } = c;
      return {
        ...rest,
        status: "SUBMITTED",
        days: 0,
        history: [
          ...c.history,
          {
            from: c.status,
            to: "SUBMITTED",
            note: "Resubmitted after correction",
            at: "29 Oct 2026",
          },
        ],
      };
    });
    toast.success(`Claim ${claim.id} resubmitted to SHA`);
  };

  const createClaim = () => {
    const invoice = invoices.find((i) => i.number === claimForm.invoice);
    if (!invoice) {
      toast.error("Select an invoice");
      return;
    }
    const next: Claim = {
      id: `SHA-${342 + claims.length}`,
      invoice: invoice.number,
      invoiceId: invoice.id,
      patient: invoice.patient,
      dept: invoice.dept,
      claimed: Number(claimForm.claimed) || invoice.total,
      status: "SUBMITTED",
      submitted: "29 Oct 2026",
      days: 0,
      externalRef: `SHA-CLM-${342 + claims.length}`,
      history: [{ to: "SUBMITTED", note: "Claim created and submitted", at: "29 Oct 2026" }],
    };
    setClaims((c) => [next, ...c]);
    setModal(null);
    toast.success(`Claim ${next.id} submitted`);
  };

  const runEligibility = () => {
    const invoice = invoices.find((i) => i.number === eligibilityForm.invoice);
    if (!invoice) {
      toast.error("Select an invoice");
      return;
    }
    const next: EligibilityCheck = {
      id: `el-${2202 + checks.length}`,
      patient: invoice.patient,
      invoice: invoice.number,
      status: eligibilityForm.status,
      limit: Number(eligibilityForm.limit) || 0,
      consumed: Number(eligibilityForm.consumed) || 0,
      provider: "simulated",
      reference: `SHA-EL-${2202 + checks.length}`,
      checkedAt: "29 Oct 2026, 17:10",
    };
    setChecks((c) => [next, ...c]);
    setModal(null);
    toast.success(`Eligibility: ${titleize(next.status)}`);
  };

  return (
    <div>
      <PageHeader
        title="SHA Claims"
        subtitle="Eligibility checks, claim submission, aging and resubmissions."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setEligibilityForm({
                  invoice: invoices[0]?.number ?? "",
                  status: "ACTIVE",
                  limit: "500000",
                  consumed: "0",
                });
                setModal("eligibility");
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-primary px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10"
            >
              <Activity className="h-4 w-4" />
              Check eligibility
            </button>
            <button
              onClick={() => {
                setClaimForm({
                  invoice: invoices[0]?.number ?? "",
                  claimed: String(invoices[0]?.total ?? 0),
                });
                setModal("create");
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              Create claim
            </button>
          </div>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={ShieldCheck}
          label="Open Claims"
          value={String(openClaims.length)}
          change={4.6}
        />
        <StatCard
          tone="yellow"
          icon={FileClock}
          label="Claimed Value"
          value={ksh(totalClaimed)}
          change={12.3}
        />
        <StatCard
          tone="pink"
          icon={BadgeCheck}
          label="Approved Value"
          value={ksh(totalApproved)}
          change={9.1}
        />
        <StatCard
          tone="purple"
          icon={XCircle}
          label="Rejected"
          value={String(rejected)}
          change={-3.4}
        />
      </div>

      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex overflow-x-auto rounded-xl bg-secondary p-1">
            {(
              [
                ["claims", "Claims"],
                ["eligibility", "Eligibility checks"],
                ["aging", "Aging"],
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
          {tab !== "aging" && (
            <div className="flex flex-wrap gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search claim, patient, invoice…"
                className="h-10 min-w-52 rounded-xl border border-input bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              {tab === "claims" && (
                <FilterSelect
                  label="Status"
                  value={status}
                  onChange={setStatus}
                  options={statuses}
                />
              )}
              <FilterSelect label="Dept" value={dept} onChange={setDept} options={departments} />
            </div>
          )}
        </div>

        {tab === "claims" && (
          <div className={cn(tableWrap, "mt-5")}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  {[
                    "Claim",
                    "Invoice",
                    "Patient",
                    "Dept",
                    "Claimed",
                    "Approved",
                    "Status",
                    "Age",
                    "Actions",
                  ].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className={tbodyRow}>
                    <td className={cn(td, "font-mono text-xs")}>
                      {c.id}
                      <p className="font-sans text-[11px] text-muted-foreground">{c.externalRef}</p>
                    </td>
                    <td className={cn(td, "font-mono text-xs")}>{c.invoice}</td>
                    <td className={cn(td, "font-medium")}>{c.patient}</td>
                    <td className={td}>{c.dept}</td>
                    <td className={cn(td, "font-semibold")}>{ksh(c.claimed)}</td>
                    <td className={td}>
                      {c.approved ? (
                        ksh(c.approved)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={td}>
                      <Badge
                        tone={
                          c.status === "REJECTED"
                            ? "danger"
                            : c.status === "PAID" || c.status === "APPROVED"
                              ? "success"
                              : c.status === "SUBMITTED"
                                ? "info"
                                : "warning"
                        }
                      >
                        {titleize(c.status)}
                      </Badge>
                    </td>
                    <td className={td}>
                      {c.days > 0 ? (
                        <span
                          className={cn(
                            "font-semibold",
                            c.days >= 21
                              ? "text-destructive"
                              : c.days >= 14
                                ? "text-warning"
                                : "text-muted-foreground",
                          )}
                        >
                          {c.days} days
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={td}>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => {
                            setTargetId(c.id);
                            setModal("view");
                          }}
                          aria-label="View claim"
                          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openStatus(c)}
                          aria-label="Update status"
                          className="rounded-lg p-2 text-primary hover:bg-primary/15"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                        {c.status === "REJECTED" && (
                          <button
                            onClick={() => resubmit(c)}
                            aria-label="Resubmit claim"
                            className="rounded-lg p-2 text-warning hover:bg-warning/15"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && <EmptyState cols={9} />}
              </tbody>
            </table>
          </div>
        )}

        {tab === "eligibility" && (
          <div className={cn(tableWrap, "mt-5")}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  {[
                    "Patient",
                    "Invoice",
                    "Status",
                    "Annual limit",
                    "Consumed",
                    "Provider",
                    "Reference",
                    "Checked",
                  ].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {checks.map((e) => (
                  <tr key={e.id} className={tbodyRow}>
                    <td className={cn(td, "font-medium")}>{e.patient}</td>
                    <td className={cn(td, "font-mono text-xs")}>{e.invoice}</td>
                    <td className={td}>
                      <Badge
                        tone={
                          e.status === "ACTIVE"
                            ? "success"
                            : e.status === "LIMIT_EXHAUSTED"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {titleize(e.status)}
                      </Badge>
                    </td>
                    <td className={td}>{ksh(e.limit)}</td>
                    <td className={td}>{ksh(e.consumed)}</td>
                    <td className={td}>{e.provider}</td>
                    <td className={cn(td, "font-mono text-xs")}>{e.reference}</td>
                    <td className={cn(td, "text-muted-foreground")}>{e.checkedAt}</td>
                  </tr>
                ))}
                {checks.length === 0 && <EmptyState cols={8} />}
              </tbody>
            </table>
          </div>
        )}

        {tab === "aging" && (
          <div className="mt-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {buckets.map((b) => (
                <div key={b.label} className="rounded-2xl border border-border bg-secondary/40 p-4">
                  <p className="text-sm font-semibold">{b.label}</p>
                  <p className="mt-2 text-2xl font-bold">{b.count}</p>
                  <p className="text-xs text-muted-foreground">{ksh(b.amount)} claimed</p>
                </div>
              ))}
            </div>
            <div className={tableWrap}>
              <table className="w-full">
                <thead>
                  <tr className={theadRow}>
                    {[
                      "Claim",
                      "Patient",
                      "Dept",
                      "Status",
                      "Days pending",
                      "Claimed",
                      "Priority",
                    ].map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {aging.map((c) => (
                    <tr key={c.id} className={cn(tbodyRow, c.days >= 21 && "bg-destructive/5")}>
                      <td className={cn(td, "font-mono text-xs")}>{c.id}</td>
                      <td className={cn(td, "font-medium")}>{c.patient}</td>
                      <td className={td}>{c.dept}</td>
                      <td className={td}>
                        <Badge>{titleize(c.status)}</Badge>
                      </td>
                      <td
                        className={cn(
                          td,
                          "font-semibold",
                          c.days >= 21 ? "text-destructive" : c.days >= 14 ? "text-warning" : "",
                        )}
                      >
                        {c.days}
                      </td>
                      <td className={td}>{ksh(c.claimed)}</td>
                      <td className={td}>
                        {c.days >= 21 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Escalate
                          </span>
                        ) : c.days >= 14 ? (
                          <span className="text-xs font-semibold text-warning">Follow up</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Normal</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {aging.length === 0 && <EmptyState cols={7} message="No aging claims." />}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>

      {current && (
        <Modal
          open={modal === "view"}
          onClose={() => setModal(null)}
          wide
          title={`Claim ${current.id}`}
          subtitle={`${current.patient} · ${current.invoice}`}
          footer={
            <>
              <button
                onClick={() => setModal(null)}
                className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
              >
                Close
              </button>
              {current.status === "REJECTED" && (
                <button
                  onClick={() => {
                    resubmit(current);
                    setModal(null);
                  }}
                  className="rounded-xl bg-warning px-4 py-2.5 text-sm font-semibold text-ink"
                >
                  Resubmit
                </button>
              )}
              <button
                onClick={() => openStatus(current)}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Update status
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-4">
              <DetailRow label="Claimed" value={ksh(current.claimed)} />
              <DetailRow label="Approved" value={current.approved ? ksh(current.approved) : "—"} />
              <DetailRow label="Status" value={titleize(current.status)} />
              <DetailRow
                label="Age"
                value={current.days > 0 ? `${current.days} days` : "Decided"}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <DetailRow label="Department" value={current.dept} />
              <DetailRow label="Submitted" value={current.submitted} />
              <DetailRow label="External ref" value={current.externalRef ?? "—"} />
            </div>
            {current.rejectionReason && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Rejection: {current.rejectionReason}
              </div>
            )}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Claim history
              </p>
              <ol className="space-y-2">
                {current.history.map((h, i) => (
                  <li key={`${h.at}-${i}`} className="flex gap-3 rounded-xl bg-secondary p-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{titleize(h.to)}</p>
                      <p className="text-xs text-muted-foreground">
                        {h.note} · {h.at}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Modal>
      )}

      <Modal
        open={modal === "status"}
        onClose={() => setModal("view")}
        title="Update claim status"
        subtitle={current ? `POST /claims/${current.id}/status` : undefined}
        footer={
          <>
            <button
              onClick={() => setModal("view")}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={saveStatus}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Save status
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Status">
            <select
              className={inputCls}
              value={statusForm.status}
              onChange={(e) =>
                setStatusForm({ ...statusForm, status: e.target.value as ClaimStatus })
              }
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {titleize(s)}
                </option>
              ))}
            </select>
          </Field>
          {statusForm.status === "APPROVED" && (
            <Field label="Approved amount (KSh)">
              <input
                type="number"
                className={inputCls}
                value={statusForm.approved}
                onChange={(e) => setStatusForm({ ...statusForm, approved: e.target.value })}
              />
            </Field>
          )}
          <Field label="Note">
            <textarea
              className={textareaCls}
              value={statusForm.note}
              onChange={(e) => setStatusForm({ ...statusForm, note: e.target.value })}
              placeholder="Reason or reviewer note"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={modal === "create"}
        onClose={() => setModal(null)}
        title="Create SHA claim"
        subtitle="POST /invoices/:id/claims"
        footer={
          <>
            <button
              onClick={() => setModal(null)}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={createClaim}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Submit claim
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Invoice">
            <select
              className={inputCls}
              value={claimForm.invoice}
              onChange={(e) => {
                const inv = invoices.find((i) => i.number === e.target.value);
                setClaimForm({ invoice: e.target.value, claimed: String(inv?.total ?? 0) });
              }}
            >
              {invoices.map((i) => (
                <option key={i.id} value={i.number}>
                  {i.number} · {i.patient} · {ksh(i.total)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Claimed amount (KSh)">
            <input
              type="number"
              className={inputCls}
              value={claimForm.claimed}
              onChange={(e) => setClaimForm({ ...claimForm, claimed: e.target.value })}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Eligibility should be checked before submission. Claims are simulated against the SHA
            adapter.
          </p>
        </div>
      </Modal>

      <Modal
        open={modal === "eligibility"}
        onClose={() => setModal(null)}
        title="Run eligibility check"
        subtitle="POST /invoices/:id/claims/eligibility-check"
        footer={
          <>
            <button
              onClick={() => setModal(null)}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={runEligibility}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Run check
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Invoice" className="sm:col-span-2">
            <select
              className={inputCls}
              value={eligibilityForm.invoice}
              onChange={(e) => setEligibilityForm({ ...eligibilityForm, invoice: e.target.value })}
            >
              {invoices.map((i) => (
                <option key={i.id} value={i.number}>
                  {i.number} · {i.patient}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Result">
            <select
              className={inputCls}
              value={eligibilityForm.status}
              onChange={(e) =>
                setEligibilityForm({
                  ...eligibilityForm,
                  status: e.target.value as EligibilityStatus,
                })
              }
            >
              {eligibilityStatuses.map((s) => (
                <option key={s} value={s}>
                  {titleize(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Annual limit (KSh)">
            <input
              type="number"
              className={inputCls}
              value={eligibilityForm.limit}
              onChange={(e) => setEligibilityForm({ ...eligibilityForm, limit: e.target.value })}
            />
          </Field>
          <Field label="Consumed (KSh)">
            <input
              type="number"
              className={inputCls}
              value={eligibilityForm.consumed}
              onChange={(e) => setEligibilityForm({ ...eligibilityForm, consumed: e.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
