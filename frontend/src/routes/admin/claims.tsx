import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  FileClock,
  RefreshCw,
  ShieldCheck,
  XCircle,
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
  td,
  th,
  tableWrap,
  tbodyRow,
  theadRow,
} from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingCards, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import {
  claimKeys,
  getClaim,
  getClaimAging,
  listClaims,
  resubmitClaim,
  updateClaimStatus,
} from "@/lib/api/claims";
import { formatDateTime, formatKshMinor, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Claim, ClaimStatus } from "@/types/api";

export const Route = createFileRoute("/admin/claims")({
  head: () => ({
    meta: [
      { title: "SHA Claims — MediFlow" },
      { name: "description", content: "SHA eligibility, claims tracker and aging follow-up." },
      { property: "og:title", content: "SHA Claims — MediFlow" },
      {
        property: "og:description",
        content: "SHA eligibility, claims tracker and aging follow-up.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Tab = "claims" | "aging";
const statuses = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "PAID",
  "CANCELLED",
];
const nextStatuses: Partial<Record<ClaimStatus, ClaimStatus[]>> = {
  SUBMITTED: ["UNDER_REVIEW", "APPROVED", "REJECTED", "CANCELLED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PAID"],
};

const agingBucketRows: {
  key: string;
  label: string;
  tone: "success" | "warning" | "danger";
}[] = [
  { key: "current", label: "0–13 days", tone: "success" },
  { key: "14_days", label: "14–29 days", tone: "warning" },
  { key: "30_days", label: "30–59 days", tone: "warning" },
  { key: "60_days", label: "60+ days", tone: "danger" },
];

function Page() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("claims");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [bucket, setBucket] = useState("All");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<Claim | null>(null);
  const [statusForm, setStatusForm] = useState({
    status: "UNDER_REVIEW" as ClaimStatus,
    approved_amount: "",
    rejection_reason: "",
    note: "",
  });
  const [resubmitTarget, setResubmitTarget] = useState<Claim | null>(null);
  const [resubmitForm, setResubmitForm] = useState({ amount: "", note: "" });

  const params = {
    page,
    page_size: 10,
    q: q || undefined,
    status: status === "All" ? undefined : status,
    aging_bucket: bucket === "All" ? undefined : bucket,
  };
  const claimsQuery = useQuery({
    queryKey: claimKeys.list(params),
    queryFn: () => listClaims(params),
    staleTime: 30_000,
  });
  const agingQuery = useQuery({
    queryKey: claimKeys.aging,
    queryFn: getClaimAging,
    staleTime: 60_000,
  });
  const detailQuery = useQuery({
    queryKey: claimKeys.detail(selectedId ?? ""),
    queryFn: () => getClaim(selectedId as string),
    enabled: Boolean(selectedId),
  });

  const invalidateClaims = () => queryClient.invalidateQueries({ queryKey: claimKeys.all });

  const statusMutation = useMutation({
    mutationFn: async () => {
      if (!statusTarget) throw new Error("No claim selected");
      return updateClaimStatus(statusTarget.id, {
        status: statusForm.status,
        approved_amount_minor: statusForm.approved_amount
          ? Math.round(Number(statusForm.approved_amount) * 100)
          : undefined,
        rejection_reason: statusForm.rejection_reason || undefined,
        note: statusForm.note || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Claim status updated");
      setStatusTarget(null);
      void invalidateClaims();
      void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resubmitMutation = useMutation({
    mutationFn: async () => {
      if (!resubmitTarget) throw new Error("No claim selected");
      return resubmitClaim(resubmitTarget.id, {
        amount_minor: resubmitForm.amount
          ? Math.round(Number(resubmitForm.amount) * 100)
          : undefined,
        note: resubmitForm.note || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Claim resubmitted");
      setResubmitTarget(null);
      setResubmitForm({ amount: "", note: "" });
      void invalidateClaims();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const aging = agingQuery.data;
  const byStatus = aging?.by_status ?? {};
  const pending = (byStatus["SUBMITTED"] ?? 0) + (byStatus["UNDER_REVIEW"] ?? 0);
  const approved = (byStatus["APPROVED"] ?? 0) + (byStatus["PAID"] ?? 0);
  const rejected = byStatus["REJECTED"] ?? 0;

  const resetPage = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="SHA Claims"
        subtitle="Claims created from live invoices, with aging and status history."
      />

      {agingQuery.isLoading ? (
        <div className="mb-6">
          <LoadingCards />
        </div>
      ) : agingQuery.error ? (
        <div className="mb-6">
          <ErrorBlock error={agingQuery.error} onRetry={() => void agingQuery.refetch()} />
        </div>
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            tone="teal"
            icon={ShieldCheck}
            label="Total claims"
            value={String(aging?.total_claims ?? 0)}
            change={null}
          />
          <StatCard
            tone="yellow"
            icon={FileClock}
            label="Pending decision"
            value={String(pending)}
            change={null}
          />
          <StatCard
            tone="pink"
            icon={CheckCircle2}
            label="Approved / paid"
            value={String(approved)}
            change={null}
          />
          <StatCard
            tone="purple"
            icon={XCircle}
            label="Rejected"
            value={String(rejected)}
            change={null}
          />
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {(["claims", "aging"] as const).map((value) => (
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
            {value === "claims" ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <FileClock className="h-4 w-4" />
            )}
            {value === "claims" ? "Claims tracker" : "Aging"}
          </button>
        ))}
      </div>

      {tab === "claims" && (
        <Panel>
          <div className="flex flex-col gap-3 xl:flex-row">
            <input
              value={q}
              onChange={(event) => resetPage(() => setQ(event.target.value))}
              placeholder="Search claim, invoice or patient"
              className={cn(inputCls, "flex-1")}
            />
            <div className="flex flex-wrap gap-2">
              <FilterSelect
                label="Status"
                value={status}
                onChange={(value) => resetPage(() => setStatus(value))}
                options={statuses}
              />
              <FilterSelect
                label="Aging"
                value={bucket}
                onChange={(value) => resetPage(() => setBucket(value))}
                options={["current", "14", "30", "60"]}
              />
            </div>
          </div>

          <div className={cn(tableWrap, "mt-4")}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Claim</th>
                  <th className={th}>Invoice</th>
                  <th className={th}>Patient</th>
                  <th className={th}>Claimed</th>
                  <th className={th}>Approved</th>
                  <th className={th}>Status</th>
                  <th className={th}>Age</th>
                  <th className={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {claimsQuery.isLoading ? (
                  <tr>
                    <td colSpan={8} className="p-0">
                      <LoadingRows rows={4} className="p-3" />
                    </td>
                  </tr>
                ) : claimsQuery.error ? (
                  <tr>
                    <td colSpan={8} className="p-3">
                      <ErrorBlock
                        error={claimsQuery.error}
                        onRetry={() => void claimsQuery.refetch()}
                      />
                    </td>
                  </tr>
                ) : (claimsQuery.data?.items.length ?? 0) === 0 ? (
                  <EmptyState cols={8} message="No claims match these filters." />
                ) : (
                  claimsQuery.data?.items.map((claim) => (
                    <tr key={claim.id} className={tbodyRow}>
                      <td className={cn(td, "font-mono text-xs")}>{claim.id.slice(0, 8)}</td>
                      <td className={td}>{claim.invoice_number ?? "—"}</td>
                      <td className={td}>{claim.patient_name ?? "—"}</td>
                      <td className={td}>{formatKshMinor(claim.claimed_amount_minor)}</td>
                      <td className={td}>
                        {claim.approved_amount_minor === null
                          ? "—"
                          : formatKshMinor(claim.approved_amount_minor)}
                      </td>
                      <td className={td}>
                        <Badge>{titleize(claim.status)}</Badge>
                      </td>
                      <td
                        className={cn(
                          td,
                          claim.age_days !== null && claim.age_days >= 30
                            ? "font-semibold text-destructive"
                            : claim.age_days !== null && claim.age_days >= 14
                              ? "font-semibold text-warning"
                              : "text-muted-foreground",
                        )}
                      >
                        {claim.age_days === null ? "—" : `${claim.age_days}d`}
                      </td>
                      <td className={cn(td, "space-x-2")}>
                        <Button size="sm" variant="outline" onClick={() => setSelectedId(claim.id)}>
                          View
                        </Button>
                        {nextStatuses[claim.status] && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setStatusTarget(claim);
                              setStatusForm({
                                status: nextStatuses[claim.status]?.[0] ?? "UNDER_REVIEW",
                                approved_amount: String(claim.claimed_amount_minor / 100),
                                rejection_reason: "",
                                note: "",
                              });
                            }}
                          >
                            Update
                          </Button>
                        )}
                        {claim.status === "REJECTED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setResubmitTarget(claim);
                              setResubmitForm({
                                amount: String(claim.claimed_amount_minor / 100),
                                note: "",
                              });
                            }}
                          >
                            <RefreshCw /> Resubmit
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              Page {page} of {Math.max(claimsQuery.data?.meta.pages ?? 1, 1)} ·{" "}
              {claimsQuery.data?.meta.total ?? 0} claims
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((value) => value + 1)}
                disabled={page >= (claimsQuery.data?.meta.pages ?? 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {tab === "aging" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Aging buckets">
            {agingQuery.isLoading ? (
              <LoadingRows rows={4} />
            ) : agingQuery.error ? (
              <ErrorBlock error={agingQuery.error} onRetry={() => void agingQuery.refetch()} />
            ) : (
              <ul className="space-y-3">
                {agingBucketRows.map((bucketRow) => (
                  <li
                    key={bucketRow.key}
                    className="flex items-center justify-between rounded-xl bg-secondary/50 p-3"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      {bucketRow.key === "60_days" && (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      )}
                      {bucketRow.label}
                    </span>
                    <Badge tone={bucketRow.tone}>
                      {String(aging?.aging_buckets[bucketRow.key] ?? 0)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Claims by status">
            {agingQuery.isLoading ? (
              <LoadingRows rows={4} />
            ) : agingQuery.error ? (
              <ErrorBlock error={agingQuery.error} onRetry={() => void agingQuery.refetch()} />
            ) : Object.keys(byStatus).length === 0 ? (
              <EmptyBlock
                title="No claims yet"
                message="Status counts appear when claims are created."
              />
            ) : (
              <ul className="space-y-3">
                {Object.entries(byStatus).map(([key, value]) => (
                  <li
                    key={key}
                    className="flex items-center justify-between rounded-xl bg-secondary/50 p-3 text-sm"
                  >
                    <span>{titleize(key)}</span>
                    <Badge>{String(value)}</Badge>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <DetailRow
                label="Approval rate"
                value={
                  aging?.approval_rate === null || aging?.approval_rate === undefined
                    ? "—"
                    : `${(aging.approval_rate * 100).toFixed(1)}%`
                }
              />
              <DetailRow
                label="Avg days to payment"
                value={
                  aging?.average_days_to_payment === null ||
                  aging?.average_days_to_payment === undefined
                    ? "—"
                    : `${aging.average_days_to_payment} days`
                }
              />
            </div>
          </Panel>
        </div>
      )}

      <Modal
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title={detailQuery.data ? `Claim ${detailQuery.data.id.slice(0, 8)}` : "Claim"}
        subtitle={detailQuery.data ? (detailQuery.data.patient_name ?? "Patient") : undefined}
        wide
        footer={
          <Button variant="outline" onClick={() => setSelectedId(null)}>
            Close
          </Button>
        }
      >
        {detailQuery.isLoading ? (
          <LoadingRows rows={3} />
        ) : detailQuery.error ? (
          <ErrorBlock error={detailQuery.error} onRetry={() => void detailQuery.refetch()} />
        ) : detailQuery.data ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <DetailRow
                label="Claimed"
                value={formatKshMinor(detailQuery.data.claimed_amount_minor)}
              />
              <DetailRow
                label="Approved"
                value={
                  detailQuery.data.approved_amount_minor === null
                    ? "—"
                    : formatKshMinor(detailQuery.data.approved_amount_minor)
                }
              />
              <DetailRow label="Status" value={titleize(detailQuery.data.status)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="Invoice" value={detailQuery.data.invoice_number ?? "—"} />
              <DetailRow label="Submitted" value={formatDateTime(detailQuery.data.submitted_at)} />
            </div>
            {detailQuery.data.rejection_reason && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs font-semibold text-destructive">Rejection reason</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {detailQuery.data.rejection_reason}
                </p>
              </div>
            )}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Status history</h3>
              <ul className="space-y-2">
                {detailQuery.data.history.map((item) => (
                  <li key={item.id} className="rounded-xl bg-secondary/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {item.from_status ? `${titleize(item.from_status)} → ` : ""}
                        {titleize(item.to_status)}
                      </p>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDateTime(item.created_at)}
                      </span>
                    </div>
                    {item.note && <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        title="Update claim status"
        subtitle={
          statusTarget
            ? `${statusTarget.patient_name ?? "Patient"} · ${titleize(statusTarget.status)}`
            : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setStatusTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => statusMutation.mutate()} disabled={statusMutation.isPending}>
              {statusMutation.isPending ? "Saving…" : "Save status"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="New status">
            <select
              className={inputCls}
              value={statusForm.status}
              onChange={(event) =>
                setStatusForm((current) => ({
                  ...current,
                  status: event.target.value as ClaimStatus,
                }))
              }
            >
              {(statusTarget ? (nextStatuses[statusTarget.status] ?? []) : []).map((value) => (
                <option key={value} value={value}>
                  {titleize(value)}
                </option>
              ))}
            </select>
          </Field>
          {statusForm.status === "APPROVED" && (
            <Field label="Approved amount (KES)">
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                value={statusForm.approved_amount}
                onChange={(event) =>
                  setStatusForm((current) => ({
                    ...current,
                    approved_amount: event.target.value,
                  }))
                }
              />
            </Field>
          )}
          {statusForm.status === "REJECTED" && (
            <Field label="Rejection reason">
              <textarea
                className={textareaCls}
                value={statusForm.rejection_reason}
                onChange={(event) =>
                  setStatusForm((current) => ({
                    ...current,
                    rejection_reason: event.target.value,
                  }))
                }
              />
            </Field>
          )}
          <Field label="Note">
            <textarea
              className={textareaCls}
              value={statusForm.note}
              onChange={(event) =>
                setStatusForm((current) => ({ ...current, note: event.target.value }))
              }
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(resubmitTarget)}
        onClose={() => setResubmitTarget(null)}
        title="Resubmit rejected claim"
        subtitle={resubmitTarget?.invoice_number ?? undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setResubmitTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => resubmitMutation.mutate()} disabled={resubmitMutation.isPending}>
              {resubmitMutation.isPending ? "Submitting…" : "Resubmit"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Amount (KES)">
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              value={resubmitForm.amount}
              onChange={(event) =>
                setResubmitForm((current) => ({ ...current, amount: event.target.value }))
              }
            />
          </Field>
          <Field label="Correction note">
            <textarea
              className={textareaCls}
              value={resubmitForm.note}
              onChange={(event) =>
                setResubmitForm((current) => ({ ...current, note: event.target.value }))
              }
              placeholder="What was corrected before resubmission?"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
