import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import {
  Badge,
  EmptyState,
  FilterSelect,
  Panel,
  inputCls,
  td,
  th,
  tableWrap,
  tbodyRow,
  theadRow,
} from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { billingKeys, listTransactions } from "@/lib/api/billing";
import { formatDateTime, formatKshMinor, paymentMethodLabel, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ListPagination } from "./ListPagination";

const methods = ["CASH", "MPESA", "CARD", "BANK", "SHA"];
const statuses = ["SUCCESS", "UNCONFIRMED", "FAILED", "REVERSED"];

/** Read-only payment history with method and status filters. */
export function TransactionListPanel() {
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("All");
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(1);
  const params = {
    page,
    page_size: 15,
    q: q || undefined,
    method: method === "All" ? undefined : method,
    status: status === "All" ? undefined : status,
  };
  const query = useQuery({
    queryKey: billingKeys.transactions(params),
    queryFn: () => listTransactions(params),
    staleTime: 15_000,
  });
  const rows = query.data?.items ?? [];

  return (
    <Panel title="Payments">
      <div className="flex flex-col gap-3 xl:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder="Search reference, invoice or patient"
            className={cn(inputCls, "pl-10")}
          />
        </div>
        <FilterSelect
          label="Method"
          value={method}
          onChange={(value) => {
            setMethod(value);
            setPage(1);
          }}
          options={methods}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={statuses}
        />
      </div>
      <div className={cn(tableWrap, "mt-4")}>
        <table className="w-full">
          <thead>
            <tr className={theadRow}>
              <th className={th}>Paid at</th>
              <th className={th}>Invoice</th>
              <th className={th}>Patient</th>
              <th className={th}>Method</th>
              <th className={th}>Amount</th>
              <th className={th}>Reference</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td colSpan={7} className="p-0">
                  <LoadingRows rows={5} className="p-3" />
                </td>
              </tr>
            ) : query.error ? (
              <tr>
                <td colSpan={7} className="p-3">
                  <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <EmptyState cols={7} message="No payments match these filters." />
            ) : (
              rows.map((item) => (
                <tr key={item.id} className={tbodyRow}>
                  <td className={td}>{formatDateTime(item.paid_at)}</td>
                  <td className={td}>{item.invoice_number ?? "—"}</td>
                  <td className={td}>{item.patient_name ?? "—"}</td>
                  <td className={td}>{paymentMethodLabel(item.method)}</td>
                  <td className={td}>{formatKshMinor(item.amount_minor)}</td>
                  <td className={cn(td, "font-mono text-xs")}>{item.reference ?? "—"}</td>
                  <td className={td}>
                    <Badge tone={item.status === "SUCCESS" ? "success" : "warning"}>
                      {titleize(item.status)}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <ListPagination
        page={page}
        pages={query.data?.meta.pages ?? 1}
        total={query.data?.meta.total ?? 0}
        noun="payments"
        onPage={setPage}
      />
    </Panel>
  );
}
