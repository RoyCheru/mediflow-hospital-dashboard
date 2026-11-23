import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Eye, Plus, Search, UserPlus, UserRound } from "lucide-react";
import {
  Badge,
  DetailRow,
  EmptyState,
  FilterSelect,
  Modal,
  PageHeader,
  Panel,
  inputCls,
  td,
  th,
  tableWrap,
  tbodyRow,
  theadRow,
} from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { BookingDialog, type BookingKind } from "@/components/frontdesk/BookingDialog";
import { PatientRegisterDialog } from "@/components/frontdesk/PatientRegisterDialog";
import { Button } from "@/components/ui/button";
import { getPatient, listPatients, managementKeys, updatePatient } from "@/lib/api/management";
import { formatDate, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { PatientBrief } from "@/types/api";

export const Route = createFileRoute("/admin/patients")({
  head: () => ({
    meta: [
      { title: "Patients — MediFlow" },
      { name: "description", content: "Search, register and review patient records." },
      { property: "og:title", content: "Patients — MediFlow" },
      { property: "og:description", content: "Search, register and review patient records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [sex, setSex] = useState("All");
  const [active, setActive] = useState("All");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [booking, setBooking] = useState<{ kind: BookingKind; patient: PatientBrief } | null>(null);

  const params = {
    page,
    page_size: 15,
    sort: "name",
    q: q || undefined,
    sex: sex === "All" ? undefined : sex,
    is_active: active === "All" ? undefined : active,
  };
  const patientsQuery = useQuery({
    queryKey: managementKeys.patients(params),
    queryFn: () => listPatients(params),
    staleTime: 30_000,
  });
  const detailQuery = useQuery({
    queryKey: managementKeys.patient(selectedId ?? ""),
    queryFn: () => getPatient(selectedId as string),
    enabled: Boolean(selectedId),
  });

  const activeMutation = useMutation({
    mutationFn: (payload: { id: string; is_active: boolean }) =>
      updatePatient(payload.id, { is_active: payload.is_active }),
    onSuccess: () => {
      toast.success("Patient record updated");
      void queryClient.invalidateQueries({ queryKey: ["admin", "patient"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "patients"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resetPage = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Patients"
        subtitle="Live patient register from the MediFlow API."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> Register patient
          </Button>
        }
      />

      <Panel>
        <div className="flex flex-col gap-3 xl:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(event) => resetPage(() => setQ(event.target.value))}
              placeholder="Search name, patient number or phone"
              className={cn(inputCls, "pl-10")}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              label="Sex"
              value={sex}
              onChange={(value) => resetPage(() => setSex(value))}
              options={["MALE", "FEMALE", "OTHER", "UNKNOWN"]}
            />
            <FilterSelect
              label="Active"
              value={active}
              onChange={(value) => resetPage(() => setActive(value))}
              options={["true", "false"]}
            />
          </div>
        </div>

        <div className={cn(tableWrap, "mt-4")}>
          <table className="w-full">
            <thead>
              <tr className={theadRow}>
                <th className={th}>Patient number</th>
                <th className={th}>Name</th>
                <th className={th}>Sex</th>
                <th className={th}>Date of birth</th>
                <th className={th}>Phone</th>
                <th className={th}>Allergies</th>
                <th className={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {patientsQuery.isLoading ? (
                <tr>
                  <td colSpan={7} className="p-0">
                    <LoadingRows rows={5} className="p-3" />
                  </td>
                </tr>
              ) : patientsQuery.error ? (
                <tr>
                  <td colSpan={7} className="p-3">
                    <ErrorBlock
                      error={patientsQuery.error}
                      onRetry={() => void patientsQuery.refetch()}
                    />
                  </td>
                </tr>
              ) : (patientsQuery.data?.items.length ?? 0) === 0 ? (
                <EmptyState cols={7} message="No patients match these filters." />
              ) : (
                patientsQuery.data?.items.map((patient) => (
                  <tr key={patient.id} className={tbodyRow}>
                    <td className={cn(td, "font-mono text-xs")}>{patient.patient_number}</td>
                    <td className={cn(td, "font-medium")}>
                      {patient.first_name} {patient.last_name}
                    </td>
                    <td className={td}>{titleize(patient.sex)}</td>
                    <td className={td}>{formatDate(patient.date_of_birth)}</td>
                    <td className={td}>{patient.phone}</td>
                    <td className={td}>
                      {patient.allergies ? (
                        <Badge tone="danger">{patient.allergies}</Badge>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </td>
                    <td className={cn(td, "space-x-2 whitespace-nowrap")}>
                      <Button size="sm" variant="outline" onClick={() => setSelectedId(patient.id)}>
                        <Eye /> View
                      </Button>
                      <Button size="sm" onClick={() => setBooking({ kind: "walk-in", patient })}>
                        <UserPlus /> Walk-in
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setBooking({ kind: "scheduled", patient })}
                      >
                        <CalendarPlus /> Book
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Page {page} of {Math.max(patientsQuery.data?.meta.pages ?? 1, 1)} ·{" "}
            {patientsQuery.data?.meta.total ?? 0} patients
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
              disabled={page >= (patientsQuery.data?.meta.pages ?? 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Panel>

      <Modal
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title={
          detailQuery.data
            ? `${detailQuery.data.first_name} ${detailQuery.data.last_name}`
            : "Patient record"
        }
        subtitle={detailQuery.data?.patient_number}
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setSelectedId(null)}>
              Close
            </Button>
            {detailQuery.data && (
              <Button
                variant={detailQuery.data.is_active ? "outline" : "default"}
                onClick={() =>
                  activeMutation.mutate({
                    id: detailQuery.data.id,
                    is_active: !detailQuery.data.is_active,
                  })
                }
                disabled={activeMutation.isPending}
              >
                <UserRound />
                {detailQuery.data.is_active ? "Deactivate" : "Reactivate"}
              </Button>
            )}
          </>
        }
      >
        {detailQuery.isLoading ? (
          <LoadingRows rows={4} />
        ) : detailQuery.error ? (
          <ErrorBlock error={detailQuery.error} onRetry={() => void detailQuery.refetch()} />
        ) : detailQuery.data ? (
          <div className="space-y-4">
            {detailQuery.data.allergies && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-semibold text-destructive">
                  Allergy alert: {detailQuery.data.allergies}
                </p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="Phone" value={detailQuery.data.phone} />
              <DetailRow label="Email" value={detailQuery.data.email ?? "—"} />
              <DetailRow label="Sex" value={titleize(detailQuery.data.sex)} />
              <DetailRow label="Date of birth" value={formatDate(detailQuery.data.date_of_birth)} />
              <DetailRow label="Blood group" value={detailQuery.data.blood_group ?? "—"} />
              <DetailRow label="SHA number" value={detailQuery.data.sha_number ?? "—"} />
              <DetailRow
                label="Chronic conditions"
                value={detailQuery.data.chronic_conditions ?? "—"}
              />
              <DetailRow
                label="Current medications"
                value={detailQuery.data.current_medications ?? "—"}
              />
              <DetailRow label="Next of kin" value={detailQuery.data.next_of_kin_name ?? "—"} />
              <DetailRow
                label="Next of kin phone"
                value={detailQuery.data.next_of_kin_phone ?? "—"}
              />
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={detailQuery.data.is_active ? "success" : "muted"}>
                {detailQuery.data.is_active ? "Active" : "Inactive"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Registered {formatDate(detailQuery.data.created_at)}
              </span>
            </div>
          </div>
        ) : null}
      </Modal>

      <PatientRegisterDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onDone={(patient) => setSelectedId(patient.id)}
      />

      {booking && (
        <BookingDialog
          key={`${booking.kind}-${booking.patient.id}`}
          open
          initialKind={booking.kind}
          initialPatient={booking.patient}
          onClose={() => setBooking(null)}
        />
      )}
    </div>
  );
}
