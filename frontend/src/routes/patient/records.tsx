import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, Pill, Stethoscope } from "lucide-react";
import { Badge, DetailRow, Modal, PageHeader, Panel } from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { getClinicalVisit, listPrescriptions } from "@/lib/api/clinical";
import { getMyTimeline } from "@/lib/api/patient";
import { formatDate, formatDateTime, titleize } from "@/lib/format";

export const Route = createFileRoute("/patient/records")({
  head: () => ({ meta: [{ title: "Medical Records — MediFlow" }] }),
  component: PatientRecordsPage,
});

function eventSummary(event: { type: string; summary: Record<string, unknown> }): string {
  if (event.type === "visit") {
    return String(event.summary["diagnosis"] ?? event.summary["complaint"] ?? "Visit recorded");
  }
  if (event.type === "prescription") {
    const drugs = event.summary["drugs"];
    return Array.isArray(drugs) ? drugs.join(", ") : "Prescription issued";
  }
  if (event.type === "attachment") {
    return String(event.summary["file_name"] ?? "Attachment uploaded");
  }
  return "Record updated";
}

function PatientRecordsPage() {
  const [visitId, setVisitId] = useState<string | null>(null);
  const timeline = useQuery({
    queryKey: ["patient", "timeline"],
    queryFn: getMyTimeline,
    staleTime: 30_000,
  });
  const visit = useQuery({
    queryKey: ["patient", "visit", visitId],
    queryFn: () => getClinicalVisit(visitId as string),
    enabled: Boolean(visitId),
  });
  const prescriptions = useQuery({
    queryKey: ["patient", "visit-prescriptions", visitId],
    queryFn: () => listPrescriptions(visitId as string),
    enabled: Boolean(visitId),
  });

  const items = timeline.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Medical Records"
        subtitle="Your chronological visits, prescriptions and uploaded reports."
      />
      <Panel>
        {timeline.isLoading ? (
          <LoadingRows rows={6} />
        ) : timeline.error ? (
          <ErrorBlock error={timeline.error} onRetry={() => void timeline.refetch()} />
        ) : items.length === 0 ? (
          <EmptyBlock
            title="No records yet"
            message="Visits, prescriptions and results will appear here."
            icon={<BookOpen className="h-5 w-5" />}
          />
        ) : (
          <ol className="space-y-3">
            {items.map((event) => (
              <li
                key={`${event.type}-${event.id}`}
                className="flex gap-3 rounded-xl border border-border bg-secondary/40 p-3"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  {event.type === "prescription" ? (
                    <Pill className="h-4 w-4" />
                  ) : event.type === "attachment" ? (
                    <FileText className="h-4 w-4" />
                  ) : (
                    <Stethoscope className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{titleize(event.type)}</p>
                    <Badge tone="muted">{formatDate(event.occurred_at)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{eventSummary(event)}</p>
                  {event.type === "visit" && (
                    <button
                      type="button"
                      className="mt-2 text-xs font-semibold text-primary hover:underline"
                      onClick={() => setVisitId(event.id)}
                    >
                      Open visit details
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Modal
        open={Boolean(visitId)}
        onClose={() => setVisitId(null)}
        title="Visit details"
        subtitle={visit.data?.doctor_name ?? undefined}
        wide
        footer={
          <button
            type="button"
            className="rounded-xl border border-input px-4 py-2 text-sm font-semibold"
            onClick={() => setVisitId(null)}
          >
            Close
          </button>
        }
      >
        {visit.isLoading ? (
          <LoadingRows rows={4} />
        ) : visit.error ? (
          <ErrorBlock error={visit.error} onRetry={() => void visit.refetch()} />
        ) : visit.data ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="Doctor" value={visit.data.doctor_name ?? "—"} />
              <DetailRow label="Department" value={visit.data.department_name ?? "—"} />
              <DetailRow label="Started" value={formatDateTime(visit.data.started_at)} />
              <DetailRow label="Completed" value={formatDateTime(visit.data.completed_at)} />
              <DetailRow label="Diagnosis" value={visit.data.diagnosis ?? "—"} />
              <DetailRow label="Follow-up" value={visit.data.follow_up_date ?? "—"} />
            </div>
            {visit.data.presenting_complaint && (
              <div className="rounded-xl bg-secondary/50 p-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Presenting complaint
                </p>
                <p className="mt-1">{visit.data.presenting_complaint}</p>
              </div>
            )}
            {visit.data.plan && (
              <div className="rounded-xl bg-secondary/50 p-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Plan
                </p>
                <p className="mt-1">{visit.data.plan}</p>
              </div>
            )}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Prescriptions</h3>
              {prescriptions.isLoading ? (
                <LoadingRows rows={2} />
              ) : (prescriptions.data?.items.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No prescriptions on this visit.</p>
              ) : (
                <ul className="space-y-2">
                  {prescriptions.data?.items.flatMap((prescription) =>
                    prescription.items.map((item) => (
                      <li key={item.id} className="rounded-xl bg-secondary/50 p-3 text-sm">
                        <p className="font-semibold">
                          {item.drug_name} · {item.dose}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[item.frequency, item.duration, item.instructions]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </li>
                    )),
                  )}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
