import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import {
  Badge,
  DetailRow,
  Modal,
  PageHeader,
  Panel,
  inputCls,
  tableWrap,
  td,
  th,
  tbodyRow,
  theadRow,
} from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { ListPagination } from "@/components/billing/ListPagination";
import { getPatient, getPatientTimeline, listPatients } from "@/lib/api/management";
import { formatDate, formatDateTime, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/doctor/patients")({
  head: () => ({ meta: [{ title: "My Patients — MediFlow" }] }),
  component: DoctorPatientsPage,
});

function DoctorPatientsPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const params = { q: q.trim() || undefined, page, page_size: 15, sort: "name" };
  const patients = useQuery({
    queryKey: ["doctor", "patients", params],
    queryFn: () => listPatients(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const detail = useQuery({
    queryKey: ["doctor", "patient", selectedId],
    queryFn: () => getPatient(selectedId as string),
    enabled: Boolean(selectedId),
  });
  const timeline = useQuery({
    queryKey: ["doctor", "patient-timeline", selectedId],
    queryFn: () => getPatientTimeline(selectedId as string),
    enabled: Boolean(selectedId),
  });
  const items = patients.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="My Patients"
        subtitle="Patients you have seen, with allergies and clinical history."
      />
      <Panel>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder="Search name, patient number or phone"
            className={cn(inputCls, "pl-10")}
          />
        </div>

        {patients.isLoading ? (
          <LoadingRows rows={6} />
        ) : patients.error ? (
          <ErrorBlock error={patients.error} onRetry={() => void patients.refetch()} />
        ) : items.length === 0 ? (
          <EmptyBlock
            title="No patients found"
            message="Patients you treat will appear here."
            icon={<Users className="h-5 w-5" />}
          />
        ) : (
          <>
            <div className={tableWrap}>
              <table className="w-full">
                <thead>
                  <tr className={theadRow}>
                    <th className={th}>Patient</th>
                    <th className={th}>Phone</th>
                    <th className={th}>Age / sex</th>
                    <th className={th}>Allergies</th>
                    <th className={th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((patient) => (
                    <tr key={patient.id} className={tbodyRow}>
                      <td className={td}>
                        <p className="font-semibold">
                          {patient.first_name} {patient.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">{patient.patient_number}</p>
                      </td>
                      <td className={td}>{patient.phone}</td>
                      <td className={td}>
                        {formatDate(patient.date_of_birth)} · {titleize(patient.sex)}
                      </td>
                      <td className={td}>
                        {patient.allergies ? (
                          <Badge tone="danger">{patient.allergies}</Badge>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </td>
                      <td className={td}>
                        <button
                          type="button"
                          className="text-sm font-semibold text-primary hover:underline"
                          onClick={() => setSelectedId(patient.id)}
                        >
                          View record
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPagination
              page={patients.data?.meta.page ?? 1}
              pages={patients.data?.meta.pages ?? 1}
              total={patients.data?.meta.total ?? 0}
              noun="patients"
              onPage={setPage}
            />
          </>
        )}
      </Panel>

      <Modal
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title={
          detail.data ? `${detail.data.first_name} ${detail.data.last_name}` : "Patient record"
        }
        subtitle={detail.data?.patient_number}
        wide
        footer={
          <button
            type="button"
            className="rounded-xl border border-input px-4 py-2 text-sm font-semibold"
            onClick={() => setSelectedId(null)}
          >
            Close
          </button>
        }
      >
        {detail.isLoading ? (
          <LoadingRows rows={4} />
        ) : detail.error ? (
          <ErrorBlock error={detail.error} onRetry={() => void detail.refetch()} />
        ) : detail.data ? (
          <div className="space-y-4">
            {detail.data.allergies && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <span className="font-semibold">Allergy alert:</span> {detail.data.allergies}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="Phone" value={detail.data.phone} />
              <DetailRow label="Email" value={detail.data.email ?? "—"} />
              <DetailRow label="Date of birth" value={formatDate(detail.data.date_of_birth)} />
              <DetailRow label="Sex" value={titleize(detail.data.sex)} />
              <DetailRow label="Blood group" value={detail.data.blood_group ?? "—"} />
              <DetailRow label="SHA number" value={detail.data.sha_number ?? "—"} />
              <DetailRow label="Chronic conditions" value={detail.data.chronic_conditions ?? "—"} />
              <DetailRow
                label="Current medications"
                value={detail.data.current_medications ?? "—"}
              />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Clinical timeline</h3>
              {timeline.isLoading ? (
                <LoadingRows rows={2} />
              ) : timeline.error ? (
                <ErrorBlock error={timeline.error} onRetry={() => void timeline.refetch()} />
              ) : (timeline.data?.items.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No visits recorded yet.</p>
              ) : (
                <ul className="space-y-2">
                  {timeline.data?.items.map((event) => (
                    <li
                      key={`${event.type}-${event.id}`}
                      className="rounded-xl bg-secondary/50 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{titleize(event.type)}</p>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(event.occurred_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {String(
                          event.summary["diagnosis"] ??
                            event.summary["complaint"] ??
                            event.summary["file_name"] ??
                            "Record updated",
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
