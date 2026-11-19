import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Search } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { billingKeys, listInvoices } from "@/lib/api/billing";
import { payerShares } from "@/lib/billingShares";
import { formatDate, formatKshMinor, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ListPagination } from "./ListPagination";

const statuses = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "VOIDED", "REFUNDED"];

/** Searchable invoice list; a row opens checkout via ``onOpen``. */
export function InvoiceListPanel({
  onOpen,
  defaultStatus = "All",
}: {
  onOpen: (invoiceId: string) => void;
  defaultStatus?: string;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(defaultStatus);
  const [page, setPage] = useState(1);

  const params = {
    page,
    page_size: 10,
    q: q || undefined,
    status: status === "All" ? undefined : status,
  };
  const invoicesQuery = useQuery({
    queryKey: billingKeys.invoices(params),
    queryFn: () => listInvoices(params),
    staleTime: 15_000,
  });
  const rows = invoicesQuery.data?.items ?? [];

  return (
    <Panel title="Invoices">
      <div className="flex flex-col gap-3 xl:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder="Search invoice number or patient"
            className={cn(inputCls, "pl-10")}
          />
        </div>
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
              <th className={th}>Invoice</th>
              <th className={th}>Patient</th>
              <th className={th}>Total</th>
              <th className={th}>Patient due</th>
              <th className={th}>SHA pending</th>
              <th className={th}>Status</th>
              <th className={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {invoicesQuery.isLoading ? (
              <tr>
                <td colSpan={7} className="p-0">
                  <LoadingRows rows={5} className="p-3" />
                </td>
              </tr>
            ) : invoicesQuery.error ? (
              <tr>
                <td colSpan={7} className="p-3">
                  <ErrorBlock
                    error={invoicesQuery.error}
                    onRetry={() => void invoicesQuery.refetch()}
                  />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <EmptyState cols={7} message="No invoices match these filters." />
            ) : (
              rows.map((invoice) => {
                const shares = payerShares(invoice);
                return (
                  <tr key={invoice.id} className={tbodyRow}>
                    <td className={cn(td, "font-medium")}>
                      {invoice.invoice_number ?? "Draft"}
                      <p className="text-xs text-muted-foreground">
                        {formatDate(invoice.issued_at ?? invoice.created_at)}
                      </p>
                    </td>
                    <td className={td}>{invoice.patient_name ?? "—"}</td>
                    <td className={td}>{formatKshMinor(invoice.total_minor)}</td>
                    <td className={td}>{formatKshMinor(shares.patientDue)}</td>
                    <td className={td}>{formatKshMinor(shares.payerPending)}</td>
                    <td className={td}>
                      <Badge>{titleize(invoice.status)}</Badge>
                    </td>
                    <td className={td}>
                      <Button size="sm" variant="outline" onClick={() => onOpen(invoice.id)}>
                        <Eye /> Open
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <ListPagination
        page={page}
        pages={invoicesQuery.data?.meta.pages ?? 1}
        total={invoicesQuery.data?.meta.total ?? 0}
        noun="invoices"
        onPage={setPage}
      />
    </Panel>
  );
}
