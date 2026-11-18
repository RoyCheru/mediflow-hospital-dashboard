import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Ban,
  Banknote,
  CheckCircle2,
  CreditCard,
  Eye,
  FileClock,
  Plus,
  ShieldCheck,
  Wallet,
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
import { DataState, EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import {
  billingKeys,
  createCashReconciliation,
  createPaymentIntent,
  decideRefund,
  decideVoid,
  getCashSummary,
  getInvoice,
  getReconciliationQueue,
  listCashReconciliations,
  listInvoices,
  listRefunds,
  listTransactions,
  listVoidRequests,
  recordPayment,
} from "@/lib/api/billing";
import { getInvoiceTotals } from "@/lib/api/dashboard";
import { listDepartments } from "@/lib/api/management";
import {
  formatDate,
  formatDateTime,
  formatKshMinor,
  paymentMethodLabel,
  titleize,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { PaymentMethod } from "@/types/api";

export const Route = createFileRoute("/admin/billing")({
  head: () => ({
    meta: [
      { title: "Billing & Payments — MediFlow" },
      {
        name: "description",
        content: "Invoices, payments, refunds, void approvals and cash reconciliation.",
      },
      { property: "og:title", content: "Billing & Payments — MediFlow" },
      {
        property: "og:description",
        content: "Invoices, payments, refunds, void approvals and cash reconciliation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Tab = "invoices" | "payments" | "approvals" | "reconciliation";
const tabs: { id: Tab; label: string; icon: typeof Wallet }[] = [
  { id: "invoices", label: "Invoices", icon: FileClock },
  { id: "payments", label: "Payments", icon: Banknote },
  { id: "approvals", label: "Approvals", icon: ShieldCheck },
  { id: "reconciliation", label: "Reconciliation", icon: Wallet },
];
const invoiceStatuses = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "VOIDED", "REFUNDED"];
const paymentMethods = ["SHA", "MPESA", "CASH", "CARD", "BANK", "SELF_PAY"];
const transactionStatuses = ["PENDING", "SUCCESS", "FAILED", "UNCONFIRMED", "REVERSED"];

function Page() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("invoices");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [method, setMethod] = useState("All");
  const [department, setDepartment] = useState("All");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    method: "CASH" as PaymentMethod,
    phone: "",
    reference: "",
    tendered: "",
    notes: "",
  });
  const [decision, setDecision] = useState<{
    kind: "void" | "refund";
    id: string;
    approve: boolean;
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [reconForm, setReconForm] = useState({ counted: "", notes: "" });

  const departmentsQuery = useQuery({
    queryKey: ["admin", "departments"],
    queryFn: listDepartments,
    staleTime: 300_000,
  });
  const totalsQuery = useQuery({
    queryKey: ["admin", "dashboard", "invoice-totals"],
    queryFn: getInvoiceTotals,
    staleTime: 60_000,
  });
  const cashQuery = useQuery({
    queryKey: billingKeys.cashSummary({}),
    queryFn: () => getCashSummary(),
    staleTime: 30_000,
  });

  const departmentId = useMemo(
    () => departmentsQuery.data?.items.find((item) => item.name === department)?.id,
    [department, departmentsQuery.data],
  );

  const invoiceParams = {
    page,
    page_size: 10,
    q: q || undefined,
    status: status === "All" ? undefined : status,
    method: method === "All" ? undefined : method,
    department_id: departmentId,
  };
  const invoicesQuery = useQuery({
    queryKey: billingKeys.invoices(invoiceParams),
    queryFn: () => listInvoices(invoiceParams),
    staleTime: 30_000,
    enabled: tab === "invoices",
  });
  const invoiceQuery = useQuery({
    queryKey: billingKeys.invoice(selectedId ?? ""),
    queryFn: () => getInvoice(selectedId as string),
    enabled: Boolean(selectedId),
  });

  const paymentParams = {
    page,
    page_size: 10,
    q: q || undefined,
    status: status === "All" ? undefined : status,
    method: method === "All" ? undefined : method,
  };
  const transactionsQuery = useQuery({
    queryKey: billingKeys.transactions(paymentParams),
    queryFn: () => listTransactions(paymentParams),
    staleTime: 30_000,
    enabled: tab === "payments",
  });

  const voidsQuery = useQuery({
    queryKey: billingKeys.voids({ status: "PENDING", page_size: 20 }),
    queryFn: () => listVoidRequests({ status: "PENDING", page_size: 20 }),
    staleTime: 15_000,
    enabled: tab === "approvals",
  });
  const refundsQuery = useQuery({
    queryKey: billingKeys.refunds({ status: "PENDING", page_size: 20 }),
    queryFn: () => listRefunds({ status: "PENDING", page_size: 20 }),
    staleTime: 15_000,
    enabled: tab === "approvals",
  });
  const queueQuery = useQuery({
    queryKey: billingKeys.reconciliationQueue,
    queryFn: getReconciliationQueue,
    staleTime: 15_000,
    enabled: tab === "reconciliation",
  });
  const reconciliationsQuery = useQuery({
    queryKey: billingKeys.reconciliations({ page_size: 10 }),
    queryFn: () => listCashReconciliations({ page_size: 10 }),
    staleTime: 30_000,
    enabled: tab === "reconciliation",
  });

  const invalidateBilling = () => queryClient.invalidateQueries({ queryKey: billingKeys.all });

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("No invoice selected");
      const amountMinor = Math.round(Number(paymentForm.amount) * 100);
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
        throw new Error("Enter a valid payment amount");
      }
      if (paymentForm.method === "MPESA") {
        return createPaymentIntent(selectedId, {
          amount_minor: amountMinor,
          phone: paymentForm.phone,
        });
      }
      return recordPayment(selectedId, {
        method: paymentForm.method,
        amount_minor: amountMinor,
        tendered_minor: paymentForm.tendered
          ? Math.round(Number(paymentForm.tendered) * 100)
          : undefined,
        reference: paymentForm.reference || undefined,
        notes: paymentForm.notes || undefined,
      });
    },
    onSuccess: () => {
      toast.success(
        paymentForm.method === "MPESA"
          ? "M-Pesa STK push requested"
          : "Payment recorded successfully",
      );
      setPaymentOpen(false);
      setPaymentForm({
        amount: "",
        method: "CASH",
        phone: "",
        reference: "",
        tendered: "",
        notes: "",
      });
      void invalidateBilling();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const decisionMutation = useMutation({
    mutationFn: async () => {
      if (!decision) throw new Error("No approval selected");
      const body = { approve: decision.approve, reason: decisionReason || undefined };
      return decision.kind === "void"
        ? decideVoid(decision.id, body)
        : decideRefund(decision.id, body);
    },
    onSuccess: () => {
      toast.success(decision?.approve ? "Approval accepted" : "Request rejected");
      setDecision(null);
      setDecisionReason("");
      void invalidateBilling();
      void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reconMutation = useMutation({
    mutationFn: async () => {
      const countedMinor = Math.round(Number(reconForm.counted) * 100);
      if (!Number.isFinite(countedMinor) || countedMinor < 0) {
        throw new Error("Enter a valid counted cash amount");
      }
      const today = new Date().toISOString().slice(0, 10);
      return createCashReconciliation({
        business_date: today,
        counted_cash_minor: countedMinor,
        notes: reconForm.notes || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Cash reconciliation saved");
      setReconForm({ counted: "", notes: "" });
      void invalidateBilling();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const totals = totalsQuery.data ?? {};
  const outstanding = Object.values(totals).reduce((sum, item) => sum + item.balance_minor, 0);
  const pendingApprovals =
    (voidsQuery.data?.meta.total ?? 0) + (refundsQuery.data?.meta.total ?? 0);
  const cashCollected =
    cashQuery.data?.methods.reduce((sum, item) => sum + item.amount_minor, 0) ?? 0;

  const resetPage = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Billing & Payments"
        subtitle="Invoices, payments, approvals and cash reconciliation from the live API."
        actions={
          <Button asChild variant="outline">
            <Link to="/admin/claims">
              <ShieldCheck /> SHA claims
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={Wallet}
          label="Outstanding balance"
          value={formatKshMinor(outstanding)}
          change={null}
        />
        <StatCard
          tone="yellow"
          icon={BadgeCheck}
          label="Collected today"
          value={formatKshMinor(cashCollected)}
          change={null}
        />
        <StatCard
          tone="pink"
          icon={FileClock}
          label="Pending approvals"
          value={String(pendingApprovals)}
          change={null}
        />
        <StatCard
          tone="purple"
          icon={Banknote}
          label="Cash expected today"
          value={formatKshMinor(cashQuery.data?.cash_expected_minor ?? 0)}
          change={null}
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setTab(item.id);
              setPage(1);
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              tab === item.id
                ? "bg-primary text-primary-foreground shadow-glow"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </div>

      {tab === "invoices" && (
        <Panel>
          <div className="flex flex-col gap-3 xl:flex-row">
            <input
              value={q}
              onChange={(event) => resetPage(() => setQ(event.target.value))}
              placeholder="Search invoice number or patient"
              className={cn(inputCls, "flex-1")}
            />
            <div className="flex flex-wrap gap-2">
              <FilterSelect
                label="Status"
                value={status}
                onChange={(value) => resetPage(() => setStatus(value))}
                options={invoiceStatuses}
              />
              <FilterSelect
                label="Method"
                value={method}
                onChange={(value) => resetPage(() => setMethod(value))}
                options={paymentMethods}
              />
              <FilterSelect
                label="Department"
                value={department}
                onChange={(value) => resetPage(() => setDepartment(value))}
                options={(departmentsQuery.data?.items ?? []).map((item) => item.name)}
              />
            </div>
          </div>

          <div className={cn(tableWrap, "mt-4")}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Invoice</th>
                  <th className={th}>Patient</th>
                  <th className={th}>Method</th>
                  <th className={th}>Total</th>
                  <th className={th}>Balance</th>
                  <th className={th}>Status</th>
                  <th className={th}>Date</th>
                  <th className={th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {invoicesQuery.isLoading ? (
                  <tr>
                    <td colSpan={8} className="p-0">
                      <LoadingRows rows={4} className="p-3" />
                    </td>
                  </tr>
                ) : invoicesQuery.error ? (
                  <tr>
                    <td colSpan={8} className="p-3">
                      <ErrorBlock
                        error={invoicesQuery.error}
                        onRetry={() => void invoicesQuery.refetch()}
                      />
                    </td>
                  </tr>
                ) : (invoicesQuery.data?.items.length ?? 0) === 0 ? (
                  <EmptyState cols={8} message="No invoices match these filters." />
                ) : (
                  invoicesQuery.data?.items.map((invoice) => (
                    <tr key={invoice.id} className={tbodyRow}>
                      <td className={cn(td, "font-semibold")}>{invoice.invoice_number}</td>
                      <td className={td}>{invoice.patient_name ?? "—"}</td>
                      <td className={td}>
                        {invoice.primary_method ? (
                          <Badge tone={invoice.primary_method === "SHA" ? "sha" : "muted"}>
                            {paymentMethodLabel(invoice.primary_method)}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={td}>{formatKshMinor(invoice.total_minor)}</td>
                      <td className={td}>{formatKshMinor(invoice.balance_minor)}</td>
                      <td className={td}>
                        <Badge>{titleize(invoice.status)}</Badge>
                      </td>
                      <td className={cn(td, "text-muted-foreground")}>
                        {formatDate(invoice.created_at)}
                      </td>
                      <td className={td}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedId(invoice.id)}
                        >
                          <Eye /> View
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pages={invoicesQuery.data?.meta.pages ?? 1}
            total={invoicesQuery.data?.meta.total ?? 0}
            onPrev={() => setPage((value) => Math.max(1, value - 1))}
            onNext={() => setPage((value) => value + 1)}
          />
        </Panel>
      )}

      {tab === "payments" && (
        <Panel title="Transactions">
          <div className="flex flex-col gap-3 xl:flex-row">
            <input
              value={q}
              onChange={(event) => resetPage(() => setQ(event.target.value))}
              placeholder="Search reference or invoice"
              className={cn(inputCls, "flex-1")}
            />
            <div className="flex flex-wrap gap-2">
              <FilterSelect
                label="Status"
                value={status}
                onChange={(value) => resetPage(() => setStatus(value))}
                options={transactionStatuses}
              />
              <FilterSelect
                label="Method"
                value={method}
                onChange={(value) => resetPage(() => setMethod(value))}
                options={paymentMethods}
              />
            </div>
          </div>
          <div className={cn(tableWrap, "mt-4")}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Reference</th>
                  <th className={th}>Invoice</th>
                  <th className={th}>Patient</th>
                  <th className={th}>Method</th>
                  <th className={th}>Amount</th>
                  <th className={th}>Status</th>
                  <th className={th}>Paid</th>
                </tr>
              </thead>
              <tbody>
                <DataState
                  isLoading={transactionsQuery.isLoading}
                  error={transactionsQuery.error}
                  isEmpty={(transactionsQuery.data?.items.length ?? 0) === 0}
                  loading={
                    <tr>
                      <td colSpan={7} className="p-0">
                        <LoadingRows rows={4} className="p-3" />
                      </td>
                    </tr>
                  }
                  empty={<EmptyState cols={7} message="No transactions match these filters." />}
                >
                  {transactionsQuery.data?.items.map((transaction) => (
                    <tr key={transaction.id} className={tbodyRow}>
                      <td className={cn(td, "font-mono text-xs")}>
                        {transaction.reference ?? "—"}
                      </td>
                      <td className={td}>{transaction.invoice_number ?? "—"}</td>
                      <td className={td}>{transaction.patient_name ?? "—"}</td>
                      <td className={td}>{paymentMethodLabel(transaction.method)}</td>
                      <td className={td}>{formatKshMinor(transaction.amount_minor)}</td>
                      <td className={td}>
                        <Badge>{titleize(transaction.status)}</Badge>
                      </td>
                      <td className={cn(td, "text-muted-foreground")}>
                        {formatDateTime(transaction.paid_at)}
                      </td>
                    </tr>
                  ))}
                </DataState>
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pages={transactionsQuery.data?.meta.pages ?? 1}
            total={transactionsQuery.data?.meta.total ?? 0}
            onPrev={() => setPage((value) => Math.max(1, value - 1))}
            onNext={() => setPage((value) => value + 1)}
          />
        </Panel>
      )}

      {tab === "approvals" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel
            title="Void requests"
            action={<Badge tone="warning">{`${voidsQuery.data?.meta.total ?? 0} pending`}</Badge>}
          >
            <DataState
              isLoading={voidsQuery.isLoading}
              error={voidsQuery.error}
              isEmpty={(voidsQuery.data?.items.length ?? 0) === 0}
              loading={<LoadingRows rows={3} />}
              empty={
                <EmptyBlock
                  title="No pending voids"
                  message="Void requests awaiting review appear here."
                />
              }
            >
              <ul className="space-y-3">
                {voidsQuery.data?.items.map((item) => (
                  <li key={item.id} className="rounded-xl bg-secondary/50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {item.invoice_number ?? item.invoice_id?.slice(0, 8)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.patient_name ?? "Patient"} · requested by{" "}
                          {item.requested_by_name ?? "staff"}
                        </p>
                      </div>
                      <Badge>{titleize(item.status)}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{item.reason}</p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setDecision({ kind: "void", id: item.id, approve: true });
                          setDecisionReason("");
                        }}
                      >
                        <CheckCircle2 /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDecision({ kind: "void", id: item.id, approve: false });
                          setDecisionReason("");
                        }}
                      >
                        <Ban /> Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </DataState>
          </Panel>

          <Panel
            title="Refund requests"
            action={<Badge tone="warning">{`${refundsQuery.data?.meta.total ?? 0} pending`}</Badge>}
          >
            <DataState
              isLoading={refundsQuery.isLoading}
              error={refundsQuery.error}
              isEmpty={(refundsQuery.data?.items.length ?? 0) === 0}
              loading={<LoadingRows rows={3} />}
              empty={
                <EmptyBlock
                  title="No pending refunds"
                  message="Refund requests awaiting review appear here."
                />
              }
            >
              <ul className="space-y-3">
                {refundsQuery.data?.items.map((item) => (
                  <li key={item.id} className="rounded-xl bg-secondary/50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {formatKshMinor(item.amount_minor)} · {item.invoice_number ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.patient_name ?? "Patient"} · requested by{" "}
                          {item.requested_by_name ?? "staff"}
                        </p>
                      </div>
                      <Badge>{titleize(item.status)}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{item.reason}</p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setDecision({ kind: "refund", id: item.id, approve: true });
                          setDecisionReason("");
                        }}
                      >
                        <CheckCircle2 /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDecision({ kind: "refund", id: item.id, approve: false });
                          setDecisionReason("");
                        }}
                      >
                        <Ban /> Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </DataState>
          </Panel>
        </div>
      )}

      {tab === "reconciliation" && (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Cash expected">
              <p className="text-2xl font-bold">
                {formatKshMinor(cashQuery.data?.cash_expected_minor ?? 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {cashQuery.data?.business_date ?? new Date().toISOString().slice(0, 10)}
              </p>
              <ul className="mt-3 space-y-2">
                {(cashQuery.data?.methods ?? []).map((item) => (
                  <li key={item.method} className="flex justify-between text-sm">
                    <span>{paymentMethodLabel(item.method)}</span>
                    <span className="font-semibold">{formatKshMinor(item.amount_minor)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Record reconciliation">
              <div className="space-y-3">
                <Field label="Counted cash (KES)">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputCls}
                    value={reconForm.counted}
                    onChange={(event) =>
                      setReconForm((current) => ({ ...current, counted: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Notes">
                  <textarea
                    className={textareaCls}
                    value={reconForm.notes}
                    onChange={(event) =>
                      setReconForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    placeholder="Any variance explanation"
                  />
                </Field>
                <Button
                  className="w-full"
                  onClick={() => reconMutation.mutate()}
                  disabled={reconMutation.isPending}
                >
                  <Plus /> {reconMutation.isPending ? "Saving…" : "Save reconciliation"}
                </Button>
              </div>
            </Panel>
            <Panel title="Reconciliation queue">
              <DataState
                isLoading={queueQuery.isLoading}
                error={queueQuery.error}
                isEmpty={
                  (queueQuery.data?.payment_intents.length ?? 0) +
                    (queueQuery.data?.transactions.length ?? 0) ===
                  0
                }
                loading={<LoadingRows rows={3} />}
                empty={
                  <EmptyBlock
                    title="Queue is clear"
                    message="No unconfirmed payments need attention."
                  />
                }
              >
                <ul className="space-y-2 text-sm">
                  {queueQuery.data?.payment_intents.map((intent) => (
                    <li
                      key={intent.id}
                      className="flex justify-between rounded-lg bg-secondary/50 p-2"
                    >
                      <span>M-Pesa intent</span>
                      <span className="font-semibold">{formatKshMinor(intent.amount_minor)}</span>
                    </li>
                  ))}
                  {queueQuery.data?.transactions.map((transaction) => (
                    <li
                      key={transaction.id}
                      className="flex justify-between rounded-lg bg-secondary/50 p-2"
                    >
                      <span>{paymentMethodLabel(transaction.method)}</span>
                      <span className="font-semibold">
                        {formatKshMinor(transaction.amount_minor)}
                      </span>
                    </li>
                  ))}
                </ul>
              </DataState>
            </Panel>
          </div>

          <Panel title="Reconciliation history">
            <DataState
              isLoading={reconciliationsQuery.isLoading}
              error={reconciliationsQuery.error}
              isEmpty={(reconciliationsQuery.data?.items.length ?? 0) === 0}
              loading={<LoadingRows rows={3} />}
              empty={
                <EmptyBlock
                  title="No reconciliations yet"
                  message="Saved shifts will appear here."
                />
              }
            >
              <div className={tableWrap}>
                <table className="w-full">
                  <thead>
                    <tr className={theadRow}>
                      <th className={th}>Date</th>
                      <th className={th}>Expected</th>
                      <th className={th}>Counted</th>
                      <th className={th}>Variance</th>
                      <th className={th}>Status</th>
                      <th className={th}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconciliationsQuery.data?.items.map((item) => (
                      <tr key={item.id} className={tbodyRow}>
                        <td className={td}>{formatDate(item.business_date)}</td>
                        <td className={td}>{formatKshMinor(item.expected_cash_minor)}</td>
                        <td className={td}>{formatKshMinor(item.counted_cash_minor)}</td>
                        <td className={cn(td, item.variance_minor !== 0 && "text-destructive")}>
                          {formatKshMinor(item.variance_minor)}
                        </td>
                        <td className={td}>
                          <Badge>{titleize(item.status)}</Badge>
                        </td>
                        <td className={cn(td, "max-w-64 truncate text-muted-foreground")}>
                          {item.notes ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DataState>
          </Panel>
        </div>
      )}

      <Modal
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title={invoiceQuery.data?.invoice_number ?? "Invoice"}
        subtitle={
          invoiceQuery.data
            ? `${invoiceQuery.data.patient_name ?? "Patient"} · ${invoiceQuery.data.department_name ?? "Department"}`
            : "Loading invoice…"
        }
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setSelectedId(null)}>
              Close
            </Button>
            <Button
              onClick={() => {
                const balance = invoiceQuery.data?.balance_minor ?? 0;
                setPaymentForm({
                  amount: String(balance / 100),
                  method: "CASH",
                  phone: "",
                  reference: "",
                  tendered: "",
                  notes: "",
                });
                setPaymentOpen(true);
              }}
              disabled={!invoiceQuery.data || (invoiceQuery.data.balance_minor ?? 0) <= 0}
            >
              <CreditCard /> Record payment
            </Button>
          </>
        }
      >
        {invoiceQuery.isLoading ? (
          <LoadingRows rows={3} />
        ) : invoiceQuery.error ? (
          <ErrorBlock error={invoiceQuery.error} onRetry={() => void invoiceQuery.refetch()} />
        ) : invoiceQuery.data ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <DetailRow label="Total" value={formatKshMinor(invoiceQuery.data.total_minor)} />
              <DetailRow label="Paid" value={formatKshMinor(invoiceQuery.data.amount_paid_minor)} />
              <DetailRow label="Balance" value={formatKshMinor(invoiceQuery.data.balance_minor)} />
            </div>
            <div className={tableWrap}>
              <table className="w-full">
                <thead>
                  <tr className={theadRow}>
                    <th className={th}>Description</th>
                    <th className={th}>Qty</th>
                    <th className={th}>Unit price</th>
                    <th className={th}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceQuery.data.lines.map((line) => (
                    <tr key={line.id} className={tbodyRow}>
                      <td className={td}>{line.description}</td>
                      <td className={td}>{line.quantity}</td>
                      <td className={td}>{formatKshMinor(line.unit_price_minor)}</td>
                      <td className={td}>{formatKshMinor(line.line_total_minor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{titleize(invoiceQuery.data.status)}</Badge>
              {invoiceQuery.data.primary_method && (
                <Badge tone="muted">{paymentMethodLabel(invoiceQuery.data.primary_method)}</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                Issued {formatDateTime(invoiceQuery.data.issued_at)}
              </span>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title="Record payment"
        subtitle={invoiceQuery.data?.invoice_number ?? "Invoice"}
        footer={
          <>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => paymentMutation.mutate()} disabled={paymentMutation.isPending}>
              {paymentMutation.isPending ? "Saving…" : "Save payment"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (KES)">
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              value={paymentForm.amount}
              onChange={(event) =>
                setPaymentForm((current) => ({ ...current, amount: event.target.value }))
              }
            />
          </Field>
          <Field label="Method">
            <select
              className={inputCls}
              value={paymentForm.method}
              onChange={(event) =>
                setPaymentForm((current) => ({
                  ...current,
                  method: event.target.value as PaymentMethod,
                }))
              }
            >
              {["CASH", "CARD", "BANK", "MPESA"].map((value) => (
                <option key={value} value={value}>
                  {paymentMethodLabel(value)}
                </option>
              ))}
            </select>
          </Field>
          {paymentForm.method === "MPESA" ? (
            <Field label="Phone" className="sm:col-span-2">
              <input
                className={inputCls}
                value={paymentForm.phone}
                onChange={(event) =>
                  setPaymentForm((current) => ({ ...current, phone: event.target.value }))
                }
                placeholder="07xx xxx xxx"
              />
            </Field>
          ) : (
            <>
              <Field label="Tendered (KES)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputCls}
                  value={paymentForm.tendered}
                  onChange={(event) =>
                    setPaymentForm((current) => ({ ...current, tendered: event.target.value }))
                  }
                />
              </Field>
              <Field label="Reference">
                <input
                  className={inputCls}
                  value={paymentForm.reference}
                  onChange={(event) =>
                    setPaymentForm((current) => ({ ...current, reference: event.target.value }))
                  }
                />
              </Field>
            </>
          )}
          <Field label="Notes" className="sm:col-span-2">
            <textarea
              className={textareaCls}
              value={paymentForm.notes}
              onChange={(event) =>
                setPaymentForm((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={decision?.approve ? "Approve request" : "Reject request"}
        subtitle={decision ? titleize(decision.kind) : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setDecision(null)}>
              Cancel
            </Button>
            <Button onClick={() => decisionMutation.mutate()} disabled={decisionMutation.isPending}>
              {decisionMutation.isPending ? "Saving…" : "Confirm"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {decision?.approve
              ? "This action is audited and cannot be undone."
              : "Provide a reason for rejecting this request."}
          </p>
          <Field label="Reason">
            <textarea
              className={textareaCls}
              value={decisionReason}
              onChange={(event) => setDecisionReason(event.target.value)}
              placeholder="Reason for the decision"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function Pagination({
  page,
  pages,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  pages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        Page {page} of {Math.max(pages, 1)} · {total} records
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onPrev} disabled={page <= 1}>
          Previous
        </Button>
        <Button size="sm" variant="outline" onClick={onNext} disabled={page >= pages}>
          Next
        </Button>
      </div>
    </div>
  );
}
