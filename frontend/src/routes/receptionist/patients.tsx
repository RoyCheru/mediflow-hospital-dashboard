import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarPlus, Search, UserPlus, Users } from "lucide-react";
import {
  PageHeader,
  Panel,
  inputCls,
  tableWrap,
  tbodyRow,
  td,
  th,
  theadRow,
} from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { ListPagination } from "@/components/billing/ListPagination";
import { BookingDialog, type BookingKind } from "@/components/frontdesk/BookingDialog";
import { PatientRegisterDialog } from "@/components/frontdesk/PatientRegisterDialog";
import { Button } from "@/components/ui/button";
import { listPatients } from "@/lib/api/management";
import { formatDate, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PatientBrief } from "@/types/api";

export const Route = createFileRoute("/receptionist/patients")({
  head: () => ({ meta: [{ title: "Patients — MediFlow" }] }),
  component: ReceptionPatientsPage,
});

function ReceptionPatientsPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [booking, setBooking] = useState<{ kind: BookingKind; patient: PatientBrief } | null>(null);
  const params = { q: q.trim() || undefined, page, page_size: 15, sort: "name" };
  const patients = useQuery({
    queryKey: ["frontdesk", "patients", "list", params],
    queryFn: () => listPatients(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const items = patients.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Patients"
        subtitle="Search by name, patient number or phone before registering a new patient."
        actions={
          <Button onClick={() => setRegisterOpen(true)}>
            <UserPlus /> Register patient
          </Button>
        }
      />
      <Panel>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label="Search patients"
            placeholder="Search name, patient number or phone"
            className={cn(inputCls, "pl-10")}
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
          />
        </div>

        {patients.isLoading ? (
          <LoadingRows rows={6} />
        ) : patients.error ? (
          <ErrorBlock error={patients.error} onRetry={() => void patients.refetch()} />
        ) : items.length === 0 ? (
          <EmptyBlock
            title={q.trim() ? "No matching patients" : "No patients yet"}
            message="Register the patient to create a record and patient number."
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
                    <th className={th}>Date of birth</th>
                    <th className={th}>Sex</th>
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
                      <td className={td}>{formatDate(patient.date_of_birth)}</td>
                      <td className={td}>{titleize(patient.sex)}</td>
                      <td className={td}>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => setBooking({ kind: "walk-in", patient })}
                          >
                            <UserPlus /> Walk-in
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setBooking({ kind: "scheduled", patient })}
                          >
                            <CalendarPlus /> Book
                          </Button>
                        </div>
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

      <PatientRegisterDialog
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onDone={(patient) => {
          setQ(patient.patient_number);
          setPage(1);
        }}
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
    </>
  );
}
