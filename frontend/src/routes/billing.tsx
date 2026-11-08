import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Wallet,
  FileClock,
  BadgeCheck,
  Banknote,
  Eye,
  Ban,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Plus,
  CreditCard,
  Receipt,
  ShieldCheck,
  Download,
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
  th,
  td,
  tableWrap,
  theadRow,
  tbodyRow,
} from "@/components/kit";
import {
  cashReconciliations as seedReconciliations,
  cashSummary,
  departments,
  doctorNames,
  invoices as seedInvoices,
  ksh,
  methodLabel,
  patients,
  paymentIntents as seedIntents,
  refunds as seedRefunds,
  services,
  titleize,
  transactions as seedTransactions,
  voidRequests as seedVoids,
  type Allocation,
  type CashReconciliation,
  type Invoice,
  type InvoiceStatus,
  type PayMethod,
  type PaymentIntent,
  type Refund,
  type Transaction,
  type VoidRequest,
} from "@/lib/data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/billing")({
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
const invoiceStatuses: InvoiceStatus[] = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "VOIDED",
  "REFUNDED",
];
const methods = Object.keys(methodLabel) as PayMethod[];
const txnStatuses = ["PENDING", "SUCCESS", "FAILED", "UNCONFIRMED", "REVERSED"] as const;

function Page() {
  const [tab, setTab] = useState<Tab>("invoices");
  const [invoices, setInvoices] = useState<Invoice[]>(seedInvoices);
  const [txns, setTxns] = useState<Transaction[]>(seedTransactions);
  const [intents, setIntents] = useState<PaymentIntent[]>(seedIntents);
  const [refunds, setRefunds] = useState<Refund[]>(seedRefunds);
  const [voids, setVoids] = useState<VoidRequest[]>(seedVoids);
  const [recons, setRecons] = useState<CashReconciliation[]>(seedReconciliations);
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("All");
  const [status, setStatus] = useState("All");
  const [dept, setDept] = useState("All");
  const [modal, setModal] = useState<
    null | "view" | "payment" | "refund" | "void" | "invoice" | "reconcile"
  >(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    method: "CASH" as PayMethod,
    reference: "",
    tendered: "",
    notes: "",
  });
  const [refundForm, setRefundForm] = useState({ transaction: "", amount: "", reason: "" });
  const [voidForm, setVoidForm] = useState({ reason: "" });
  const [invoiceForm, setInvoiceForm] = useState({
    patient: patients[0]?.name ?? "",
    dept: departments[0] ?? "Outpatient",
    doctor: doctorNames[0] ?? "",
    service: services[0]?.name ?? "",
    amount: String(services[0]?.price ?? 0),
    method: "CASH" as PayMethod,
  });
  const [reconForm, setReconForm] = useState({
    clerk: "Grace Mutua",
    expected: "",
    counted: "",
    notes: "",
  });

  const current = invoices.find((i) => i.id === targetId);
  const currentTxns = current ? txns.filter((t) => t.invoiceId === current.id) : [];
  const currentIntents = current ? intents.filter((i) => i.invoiceId === current.id) : [];

  const invList = invoices.filter(
    (i) =>
      (method === "All" || i.method === method) &&
      (status === "All" || i.status === status) &&
      (dept === "All" || i.dept === dept) &&
      `${i.number} ${i.patient} ${i.doctor}`.toLowerCase().includes(q.toLowerCase()),
  );
  const txnList = txns.filter(
    (t) =>
      (method === "All" || t.method === method) &&
      (status === "All" || t.status === status) &&
      `${t.id} ${t.invoice} ${t.reference}`.toLowerCase().includes(q.toLowerCase()),
  );
  const pendingRefunds = refunds.filter((r) => r.status === "PENDING");
  const pendingVoids = voids.filter((v) => v.status === "PENDING");

  const outstanding = invoices
    .filter((i) => i.status !== "VOIDED")
    .reduce((a, i) => a + i.balance, 0);
  const collected = invoices.reduce((a, i) => a + i.paid, 0);
  const pendingApprovals = pendingRefunds.length + pendingVoids.length;

  const patchInvoice = (id: string, fn: (i: Invoice) => Invoice) =>
    setInvoices((list) => list.map((i) => (i.id === id ? fn(i) : i)));

  const openInvoice = (id: string) => {
    setTargetId(id);
    setModal("view");
  };

  const openPayment = (invoice: Invoice) => {
    setTargetId(invoice.id);
    setPaymentForm({
      amount: String(invoice.balance),
      method: invoice.method === "SHA" ? "SHA" : "CASH",
      reference: "",
      tendered: "",
      notes: "",
    });
    setModal("payment");
  };

  const recordPayment = () => {
    if (!current) return;
    const amount = Number(paymentForm.amount) || 0;
    if (amount <= 0) {
      toast.error("Enter a payment amount");
      return;
    }
    const paid = Math.min(current.total, current.paid + amount);
    const balance = Math.max(0, current.total - paid);
    const nextStatus: InvoiceStatus = balance === 0 ? "PAID" : "PARTIALLY_PAID";
    const reference = paymentForm.reference || `REF-${9007 + txns.length}`;
    const txn: Transaction = {
      id: `txn-${9007 + txns.length}`,
      invoice: current.number,
      invoiceId: current.id,
      method: paymentForm.method,
      amount,
      status: "SUCCESS",
      reference,
      paidAt: "29 Oct 2026, 17:40",
      notes: paymentForm.notes,
    };
    const allocation: Allocation = {
      id: `al-${9007 + txns.length}`,
      payer: paymentForm.method === "SHA" ? "SHA" : "PATIENT",
      amount,
      status: "PAID",
      reference,
    };
    setTxns((list) => [txn, ...list]);
    patchInvoice(current.id, (i) => ({
      ...i,
      paid,
      balance,
      status: nextStatus,
      method: paymentForm.method,
      allocations: [...i.allocations, allocation],
    }));
    setModal("view");
    toast.success(`Payment of ${ksh(amount)} recorded via ${methodLabel[paymentForm.method]}`);
  };

  const requestRefund = () => {
    if (!current) return;
    const txn = currentTxns.find((t) => t.id === refundForm.transaction);
    const amount = Number(refundForm.amount) || 0;
    if (!txn || amount <= 0) {
      toast.error("Select a transaction and amount");
      return;
    }
    const next: Refund = {
      id: `rf-${502 + refunds.length}`,
      invoice: current.number,
      transaction: txn.id,
      amount,
      reason: refundForm.reason || "Patient request",
      status: "PENDING",
      requestedBy: "Samuel Ndegwa",
    };
    setRefunds((list) => [next, ...list]);
    setModal("view");
    toast.success("Refund request submitted for approval");
  };

  const requestVoid = () => {
    if (!current) return;
    if (!voidForm.reason.trim()) {
      toast.error("A void reason is required");
      return;
    }
    const next: VoidRequest = {
      id: `vr-${302 + voids.length}`,
      invoice: current.number,
      reason: voidForm.reason,
      status: "PENDING",
      requestedBy: "Samuel Ndegwa",
    };
    setVoids((list) => [next, ...list]);
    setModal("view");
    toast.success("Void request submitted for approval");
  };

  const decideRefund = (refund: Refund, decision: "APPROVED" | "REJECTED") => {
    setRefunds((list) =>
      list.map((r) =>
        r.id === refund.id
          ? { ...r, status: decision, approvedBy: "Samuel Ndegwa", decidedAt: "29 Oct 2026" }
          : r,
      ),
    );
    toast.success(`Refund ${refund.id} ${decision.toLowerCase()}`);
  };

  const decideVoid = (request: VoidRequest, decision: "APPROVED" | "REJECTED") => {
    setVoids((list) =>
      list.map((v) =>
        v.id === request.id
          ? { ...v, status: decision, reviewedBy: "Samuel Ndegwa", decidedAt: "29 Oct 2026" }
          : v,
      ),
    );
    if (decision === "APPROVED") {
      const invoice = invoices.find((i) => i.number === request.invoice);
      if (invoice) patchInvoice(invoice.id, (i) => ({ ...i, status: "VOIDED", balance: 0 }));
    }
    toast.success(`Void request ${request.id} ${decision.toLowerCase()}`);
  };

  const resolveTxn = (txn: Transaction) => {
    setTxns((list) => list.map((t) => (t.id === txn.id ? { ...t, status: "SUCCESS" } : t)));
    toast.success(`Transaction ${txn.id} resolved`);
  };

  const resolveIntent = (intent: PaymentIntent) => {
    setIntents((list) => list.map((i) => (i.id === intent.id ? { ...i, status: "SUCCESS" } : i)));
    toast.success(`Payment intent ${intent.id} confirmed`);
  };

  const createInvoice = () => {
    const amount = Number(invoiceForm.amount) || 0;
    if (!invoiceForm.patient || amount <= 0) {
      toast.error("Patient and amount are required");
      return;
    }
    const patient = patients.find((p) => p.name === invoiceForm.patient);
    const next: Invoice = {
      id: `inv-${1191 + invoices.length}`,
      number: `INV-2026-00${1191 + invoices.length}`,
      patient: invoiceForm.patient,
      patientId: patient?.id ?? "P-0000",
      visitId: "—",
      doctor: invoiceForm.doctor,
      dept: invoiceForm.dept,
      subtotal: amount,
      discount: 0,
      total: amount,
      paid: 0,
      balance: amount,
      status: "ISSUED",
      method: invoiceForm.method,
      date: "29 Oct 2026",
      dueDate: "05 Nov 2026",
      lines: [
        {
          description: invoiceForm.service,
          code: "SVC",
          quantity: 1,
          unitPrice: amount,
          total: amount,
        },
      ],
      allocations: [],
    };
    setInvoices((list) => [next, ...list]);
    setModal(null);
    toast.success(`Invoice ${next.number} created`);
  };

  const createReconciliation = () => {
    const expected = Number(reconForm.expected) || 0;
    const counted = Number(reconForm.counted) || 0;
    const variance = counted - expected;
    const next: CashReconciliation = {
      id: `cr-${802 + recons.length}`,
      date: "29 Oct 2026",
      clerk: reconForm.clerk,
      expected,
      counted,
      variance,
      status: variance === 0 ? "BALANCED" : "DISCREPANCY",
      notes: reconForm.notes,
    };
    setRecons((list) => [next, ...list]);
    setModal(null);
    toast.success(
      variance === 0 ? "Cash reconciliation balanced" : `Variance of ${ksh(variance)} recorded`,
    );
  };

  const markBalanced = (recon: CashReconciliation) => {
    setRecons((list) =>
      list.map((r) =>
        r.id === recon.id
          ? {
              ...r,
              counted: r.expected,
              variance: 0,
              status: "BALANCED",
              notes: "Resolved by admin",
            }
          : r,
      ),
    );
    toast.success("Reconciliation marked balanced");
  };

  return (
    <div>
      <PageHeader
        title="Billing & Payments"
        subtitle="Invoices, payments, refunds, void approvals and cash reconciliation."
        actions={
          <button
            onClick={() => setModal("invoice")}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            Create invoice
          </button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={Wallet}
          label="Collected"
          value={ksh(collected)}
          change={16.2}
        />
        <StatCard
          tone="yellow"
          icon={FileClock}
          label="Outstanding"
          value={ksh(outstanding)}
          change={-4.3}
        />
        <StatCard
          tone="pink"
          icon={Banknote}
          label="Cash Today"
          value={ksh(cashSummary.counted)}
          change={3.1}
        />
        <StatCard
          tone="purple"
          icon={ShieldCheck}
          label="Pending Approvals"
          value={String(pendingApprovals)}
          change={2.2}
        />
      </div>

      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex overflow-x-auto rounded-xl bg-secondary p-1">
            {(
              [
                ["invoices", `Invoices (${invoices.length})`],
                ["payments", "Payments"],
                ["approvals", `Approvals (${pendingApprovals})`],
                ["reconciliation", "Reconciliation"],
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
          {(tab === "invoices" || tab === "payments") && (
            <div className="flex flex-wrap gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search invoice or reference…"
                className="h-10 min-w-48 rounded-xl border border-input bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <FilterSelect label="Method" value={method} onChange={setMethod} options={methods} />
              <FilterSelect
                label="Status"
                value={status}
                onChange={setStatus}
                options={tab === "invoices" ? invoiceStatuses : [...txnStatuses]}
              />
              {tab === "invoices" && (
                <FilterSelect label="Dept" value={dept} onChange={setDept} options={departments} />
              )}
            </div>
          )}
        </div>

        {tab === "invoices" && (
          <div className={cn(tableWrap, "mt-5")}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  {[
                    "Invoice",
                    "Patient",
                    "Dept",
                    "Total",
                    "Paid",
                    "Balance",
                    "Method",
                    "Status",
                    "Date",
                    "Actions",
                  ].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invList.map((i) => (
                  <tr key={i.id} className={cn(tbodyRow, i.status === "VOIDED" && "opacity-60")}>
                    <td className={cn(td, "font-mono text-xs")}>{i.number}</td>
                    <td className={cn(td, "font-medium")}>
                      {i.patient}
                      <p className="text-xs font-normal text-muted-foreground">{i.doctor}</p>
                    </td>
                    <td className={td}>{i.dept}</td>
                    <td className={cn(td, "font-semibold")}>{ksh(i.total)}</td>
                    <td className={td}>{ksh(i.paid)}</td>
                    <td
                      className={cn(
                        td,
                        i.balance > 0 ? "font-semibold text-warning" : "text-muted-foreground",
                      )}
                    >
                      {ksh(i.balance)}
                    </td>
                    <td className={td}>
                      <Badge
                        tone={
                          i.method === "SHA"
                            ? "sha"
                            : i.method === "MPESA"
                              ? "mpesa"
                              : i.method === "CASH"
                                ? "cash"
                                : "muted"
                        }
                      >
                        {methodLabel[i.method]}
                      </Badge>
                    </td>
                    <td className={td}>
                      <Badge
                        tone={
                          i.status === "PAID"
                            ? "success"
                            : i.status === "VOIDED"
                              ? "danger"
                              : i.status === "PARTIALLY_PAID"
                                ? "warning"
                                : "info"
                        }
                      >
                        {titleize(i.status)}
                      </Badge>
                    </td>
                    <td className={cn(td, "text-muted-foreground")}>{i.date}</td>
                    <td className={td}>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openInvoice(i.id)}
                          aria-label="View invoice"
                          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openPayment(i)}
                          disabled={i.status === "VOIDED" || i.balance === 0}
                          aria-label="Record payment"
                          className="rounded-lg p-2 text-primary hover:bg-primary/15 disabled:pointer-events-none disabled:opacity-30"
                        >
                          <CreditCard className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {invList.length === 0 && <EmptyState cols={10} />}
              </tbody>
            </table>
          </div>
        )}

        {tab === "payments" && (
          <div className="mt-5 space-y-6">
            <div>
              <h3 className="mb-3 text-sm font-semibold">Transactions</h3>
              <div className={tableWrap}>
                <table className="w-full">
                  <thead>
                    <tr className={theadRow}>
                      {[
                        "Transaction",
                        "Invoice",
                        "Method",
                        "Amount",
                        "Reference",
                        "Status",
                        "Paid at",
                        "Actions",
                      ].map((h) => (
                        <th key={h} className={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {txnList.map((t) => (
                      <tr key={t.id} className={tbodyRow}>
                        <td className={cn(td, "font-mono text-xs")}>{t.id}</td>
                        <td className={cn(td, "font-mono text-xs")}>{t.invoice}</td>
                        <td className={td}>
                          <Badge
                            tone={
                              t.method === "SHA"
                                ? "sha"
                                : t.method === "MPESA"
                                  ? "mpesa"
                                  : t.method === "CASH"
                                    ? "cash"
                                    : "muted"
                            }
                          >
                            {methodLabel[t.method]}
                          </Badge>
                        </td>
                        <td className={cn(td, "font-semibold")}>{ksh(t.amount)}</td>
                        <td className={cn(td, "font-mono text-xs")}>{t.reference}</td>
                        <td className={td}>
                          <Badge
                            tone={
                              t.status === "SUCCESS"
                                ? "success"
                                : t.status === "FAILED" || t.status === "REVERSED"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {titleize(t.status)}
                          </Badge>
                        </td>
                        <td className={cn(td, "text-muted-foreground")}>{t.paidAt}</td>
                        <td className={td}>
                          {t.status === "UNCONFIRMED" && (
                            <button
                              onClick={() => resolveTxn(t)}
                              className="rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                            >
                              Resolve
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {txnList.length === 0 && <EmptyState cols={8} />}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold">M-Pesa payment intents</h3>
              <div className={tableWrap}>
                <table className="w-full">
                  <thead>
                    <tr className={theadRow}>
                      {[
                        "Intent",
                        "Invoice",
                        "Phone",
                        "Amount",
                        "Checkout ID",
                        "Status",
                        "Created",
                        "Actions",
                      ].map((h) => (
                        <th key={h} className={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {intents.map((i) => (
                      <tr key={i.id} className={tbodyRow}>
                        <td className={cn(td, "font-mono text-xs")}>{i.id}</td>
                        <td className={cn(td, "font-mono text-xs")}>{i.invoice}</td>
                        <td className={td}>{i.phone}</td>
                        <td className={td}>{ksh(i.amount)}</td>
                        <td className={cn(td, "font-mono text-xs")}>{i.checkoutId}</td>
                        <td className={td}>
                          <Badge
                            tone={
                              i.status === "SUCCESS"
                                ? "success"
                                : i.status === "FAILED" || i.status === "TIMEOUT"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {titleize(i.status)}
                          </Badge>
                        </td>
                        <td className={cn(td, "text-muted-foreground")}>{i.created}</td>
                        <td className={td}>
                          {(i.status === "PENDING" || i.status === "UNCONFIRMED") && (
                            <button
                              onClick={() => resolveIntent(i)}
                              className="rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                            >
                              Confirm
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "approvals" && (
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold">Refund requests</h3>
              <div className="space-y-2">
                {refunds.map((r) => (
                  <div key={r.id} className="rounded-xl border border-border bg-secondary/40 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">
                        {r.id} · {r.invoice}
                      </p>
                      <Badge
                        tone={
                          r.status === "APPROVED"
                            ? "success"
                            : r.status === "REJECTED"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {titleize(r.status)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ksh(r.amount)} · {r.reason} · requested by {r.requestedBy}
                    </p>
                    {r.status === "PENDING" && (
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => decideRefund(r, "APPROVED")}
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => decideRefund(r, "REJECTED")}
                          className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {refunds.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No refund requests.
                  </p>
                )}
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold">Void requests</h3>
              <div className="space-y-2">
                {voids.map((v) => (
                  <div key={v.id} className="rounded-xl border border-border bg-secondary/40 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">
                        {v.id} · {v.invoice}
                      </p>
                      <Badge
                        tone={
                          v.status === "APPROVED"
                            ? "success"
                            : v.status === "REJECTED"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {titleize(v.status)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {v.reason} · requested by {v.requestedBy}
                    </p>
                    {v.status === "PENDING" && (
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => decideVoid(v, "APPROVED")}
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                        >
                          Approve void
                        </button>
                        <button
                          onClick={() => decideVoid(v, "REJECTED")}
                          className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {voids.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No void requests.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "reconciliation" && (
          <div className="mt-5 space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {cashSummary.byMethod.map((m) => (
                <div
                  key={m.method}
                  className="rounded-2xl border border-border bg-secondary/40 p-4"
                >
                  <p className="text-xs text-muted-foreground">{m.method}</p>
                  <p className="mt-1 text-xl font-bold">{ksh(m.amount)}</p>
                  <p className="text-xs text-muted-foreground">{m.count} payments</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Cash reconciliations</h3>
              <button
                onClick={() => {
                  setReconForm({
                    clerk: "Grace Mutua",
                    expected: String(cashSummary.expected),
                    counted: String(cashSummary.counted),
                    notes: "",
                  });
                  setModal("reconcile");
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-primary px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10"
              >
                <Plus className="h-3.5 w-3.5" />
                New reconciliation
              </button>
            </div>
            <div className={tableWrap}>
              <table className="w-full">
                <thead>
                  <tr className={theadRow}>
                    {[
                      "Date",
                      "Clerk",
                      "Expected",
                      "Counted",
                      "Variance",
                      "Status",
                      "Notes",
                      "Actions",
                    ].map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recons.map((r) => (
                    <tr
                      key={r.id}
                      className={cn(tbodyRow, r.status === "DISCREPANCY" && "bg-destructive/5")}
                    >
                      <td className={td}>{r.date}</td>
                      <td className={cn(td, "font-medium")}>{r.clerk}</td>
                      <td className={td}>{ksh(r.expected)}</td>
                      <td className={td}>{ksh(r.counted)}</td>
                      <td
                        className={cn(
                          td,
                          "font-semibold",
                          r.variance === 0 ? "text-muted-foreground" : "text-destructive",
                        )}
                      >
                        {r.variance === 0 ? "—" : ksh(r.variance)}
                      </td>
                      <td className={td}>
                        <Badge
                          tone={
                            r.status === "BALANCED"
                              ? "success"
                              : r.status === "DISCREPANCY"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {titleize(r.status)}
                        </Badge>
                      </td>
                      <td className={cn(td, "max-w-48 truncate text-muted-foreground")}>
                        {r.notes || "—"}
                      </td>
                      <td className={td}>
                        {r.status === "DISCREPANCY" && (
                          <button
                            onClick={() => markBalanced(r)}
                            className="rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                          >
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
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
          title={current.number}
          subtitle={`${current.patient} · ${current.dept} · ${current.doctor}`}
          footer={
            <>
              <button
                onClick={() => setModal(null)}
                className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
              >
                Close
              </button>
              <button
                onClick={() => toast.success("Receipt downloaded (demo)")}
                className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
              >
                <Download className="h-4 w-4" />
                Receipt
              </button>
              <button
                onClick={() => openPayment(current)}
                disabled={current.status === "VOIDED" || current.balance === 0}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                Record payment
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-4">
              <DetailRow label="Total" value={ksh(current.total)} />
              <DetailRow label="Paid" value={ksh(current.paid)} />
              <DetailRow label="Balance" value={ksh(current.balance)} />
              <DetailRow label="Status" value={titleize(current.status)} />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <DetailRow label="Method" value={methodLabel[current.method]} />
              <DetailRow label="Issued" value={current.date} />
              <DetailRow label="Due" value={current.dueDate} />
            </div>
            <div className={tableWrap}>
              <table className="w-full">
                <thead>
                  <tr className={theadRow}>
                    {["Description", "Code", "Qty", "Unit", "Total"].map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {current.lines.map((l) => (
                    <tr key={l.code} className={tbodyRow}>
                      <td className={td}>{l.description}</td>
                      <td className={cn(td, "font-mono text-xs")}>{l.code}</td>
                      <td className={td}>{l.quantity}</td>
                      <td className={td}>{ksh(l.unitPrice)}</td>
                      <td className={cn(td, "font-semibold")}>{ksh(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Allocations
                </p>
                {current.allocations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No allocations.</p>
                ) : (
                  current.allocations.map((a) => (
                    <div
                      key={a.id}
                      className="mb-1 flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-xs"
                    >
                      <span>
                        {a.payer} · {a.reference ?? "—"}
                      </span>
                      <span className="font-semibold">
                        {ksh(a.amount)} · {titleize(a.status)}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Transactions
                </p>
                {currentTxns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transactions.</p>
                ) : (
                  currentTxns.map((t) => (
                    <div
                      key={t.id}
                      className="mb-1 flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-xs"
                    >
                      <span>{t.reference}</span>
                      <span className="font-semibold">
                        {ksh(t.amount)} · {titleize(t.status)}
                      </span>
                    </div>
                  ))
                )}
                {currentIntents.map((i) => (
                  <div
                    key={i.id}
                    className="mb-1 flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-xs"
                  >
                    <span>Intent {i.checkoutId}</span>
                    <span className="font-semibold">{titleize(i.status)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setRefundForm({
                    transaction: currentTxns[0]?.id ?? "",
                    amount: String(current.paid),
                    reason: "",
                  });
                  setModal("refund");
                }}
                disabled={currentTxns.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Refund
              </button>
              <button
                onClick={() => {
                  setVoidForm({ reason: "" });
                  setModal("void");
                }}
                disabled={current.status === "VOIDED"}
                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-40"
              >
                <Ban className="h-3.5 w-3.5" />
                Request void
              </button>
              <Link
                to="/claims"
                className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                SHA claims
              </Link>
            </div>
          </div>
        </Modal>
      )}

      <Modal
        open={modal === "payment"}
        onClose={() => setModal("view")}
        title="Record payment"
        subtitle={current ? `${current.number} · balance ${ksh(current.balance)}` : undefined}
        footer={
          <>
            <button
              onClick={() => setModal("view")}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={recordPayment}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Record payment
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (KSh)">
            <input
              type="number"
              className={inputCls}
              value={paymentForm.amount}
              onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
            />
          </Field>
          <Field label="Method">
            <select
              className={inputCls}
              value={paymentForm.method}
              onChange={(e) =>
                setPaymentForm({ ...paymentForm, method: e.target.value as PayMethod })
              }
            >
              {methods.map((m) => (
                <option key={m} value={m}>
                  {methodLabel[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reference">
            <input
              className={inputCls}
              value={paymentForm.reference}
              onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
              placeholder="M-Pesa / SHA / cash ref"
            />
          </Field>
          <Field label="Cash tendered (optional)">
            <input
              type="number"
              className={inputCls}
              value={paymentForm.tendered}
              onChange={(e) => setPaymentForm({ ...paymentForm, tendered: e.target.value })}
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea
              className={textareaCls}
              value={paymentForm.notes}
              onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
            />
          </Field>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          POST /invoices/:id/payments/{paymentForm.method === "CASH" ? "cash" : "payment-intent"} ·
          demo records instantly.
        </p>
      </Modal>

      <Modal
        open={modal === "refund"}
        onClose={() => setModal("view")}
        title="Request refund"
        subtitle={current ? `POST /invoices/${current.id}/refund-requests` : undefined}
        footer={
          <>
            <button
              onClick={() => setModal("view")}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={requestRefund}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Submit request
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Transaction">
            <select
              className={inputCls}
              value={refundForm.transaction}
              onChange={(e) => setRefundForm({ ...refundForm, transaction: e.target.value })}
            >
              {currentTxns.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} · {ksh(t.amount)} · {t.reference}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount (KSh)">
            <input
              type="number"
              className={inputCls}
              value={refundForm.amount}
              onChange={(e) => setRefundForm({ ...refundForm, amount: e.target.value })}
            />
          </Field>
          <Field label="Reason">
            <textarea
              className={textareaCls}
              value={refundForm.reason}
              onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={modal === "void"}
        onClose={() => setModal("view")}
        title="Request invoice void"
        subtitle={current ? `POST /invoices/${current.id}/void-requests` : undefined}
        footer={
          <>
            <button
              onClick={() => setModal("view")}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={requestVoid}
              className="rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground"
            >
              Submit void request
            </button>
          </>
        }
      >
        <Field label="Reason">
          <textarea
            className={textareaCls}
            value={voidForm.reason}
            onChange={(e) => setVoidForm({ reason: e.target.value })}
            placeholder="Why should this invoice be voided?"
          />
        </Field>
        <p className="mt-3 text-xs text-muted-foreground">
          Voids require approval and are written to the audit log.
        </p>
      </Modal>

      <Modal
        open={modal === "invoice"}
        onClose={() => setModal(null)}
        wide
        title="Create invoice"
        subtitle="POST /visits/:id/invoices · demo"
        footer={
          <>
            <button
              onClick={() => setModal(null)}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={createInvoice}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Create invoice
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Patient">
            <select
              className={inputCls}
              value={invoiceForm.patient}
              onChange={(e) => setInvoiceForm({ ...invoiceForm, patient: e.target.value })}
            >
              {patients.map((p) => (
                <option key={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Department">
            <select
              className={inputCls}
              value={invoiceForm.dept}
              onChange={(e) => setInvoiceForm({ ...invoiceForm, dept: e.target.value })}
            >
              {departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="Doctor">
            <select
              className={inputCls}
              value={invoiceForm.doctor}
              onChange={(e) => setInvoiceForm({ ...invoiceForm, doctor: e.target.value })}
            >
              {doctorNames.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="Service">
            <select
              className={inputCls}
              value={invoiceForm.service}
              onChange={(e) => {
                const svc = services.find((s) => s.name === e.target.value);
                setInvoiceForm({
                  ...invoiceForm,
                  service: e.target.value,
                  amount: String(svc?.price ?? invoiceForm.amount),
                });
              }}
            >
              {services.map((s) => (
                <option key={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Amount (KSh)">
            <input
              type="number"
              className={inputCls}
              value={invoiceForm.amount}
              onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })}
            />
          </Field>
          <Field label="Method">
            <select
              className={inputCls}
              value={invoiceForm.method}
              onChange={(e) =>
                setInvoiceForm({ ...invoiceForm, method: e.target.value as PayMethod })
              }
            >
              {methods.map((m) => (
                <option key={m} value={m}>
                  {methodLabel[m]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={modal === "reconcile"}
        onClose={() => setModal(null)}
        title="New cash reconciliation"
        subtitle="POST /cash-reconciliations"
        footer={
          <>
            <button
              onClick={() => setModal(null)}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={createReconciliation}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Save reconciliation
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Clerk">
            <input
              className={inputCls}
              value={reconForm.clerk}
              onChange={(e) => setReconForm({ ...reconForm, clerk: e.target.value })}
            />
          </Field>
          <Field label="Expected (KSh)">
            <input
              type="number"
              className={inputCls}
              value={reconForm.expected}
              onChange={(e) => setReconForm({ ...reconForm, expected: e.target.value })}
            />
          </Field>
          <Field label="Counted (KSh)">
            <input
              type="number"
              className={inputCls}
              value={reconForm.counted}
              onChange={(e) => setReconForm({ ...reconForm, counted: e.target.value })}
            />
          </Field>
          <Field label="Notes">
            <input
              className={inputCls}
              value={reconForm.notes}
              onChange={(e) => setReconForm({ ...reconForm, notes: e.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
