import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Pill } from "lucide-react";
import { Badge, PageHeader, Panel } from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { getMyPrescriptions } from "@/lib/api/patient";
import { formatDateTime, titleize } from "@/lib/format";

export const Route = createFileRoute("/patient/prescriptions")({
  head: () => ({ meta: [{ title: "Prescriptions — MediFlow" }] }),
  component: PatientPrescriptionsPage,
});

function PatientPrescriptionsPage() {
  const prescriptions = useQuery({
    queryKey: ["patient", "prescriptions"],
    queryFn: getMyPrescriptions,
    staleTime: 30_000,
  });
  const items = prescriptions.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Prescriptions"
        subtitle="Current and past medicines prescribed by your care team."
      />
      <Panel>
        {prescriptions.isLoading ? (
          <LoadingRows rows={4} />
        ) : prescriptions.error ? (
          <ErrorBlock error={prescriptions.error} onRetry={() => void prescriptions.refetch()} />
        ) : items.length === 0 ? (
          <EmptyBlock
            title="No prescriptions"
            message="Prescribed medicines will appear here after your consultation."
            icon={<Pill className="h-5 w-5" />}
          />
        ) : (
          <ul className="space-y-4">
            {items.map((prescription) => (
              <li key={prescription.id} className="rounded-xl border border-border p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      Prescription {prescription.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(prescription.issued_at)}
                    </p>
                  </div>
                  <Badge>{titleize(prescription.status)}</Badge>
                </div>
                <div className="space-y-2">
                  {prescription.items.map((item) => (
                    <div key={item.id} className="rounded-lg bg-secondary/50 p-3 text-sm">
                      <p className="font-semibold">
                        {item.drug_name} · {item.dose}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[item.frequency, item.duration, item.route, item.instructions]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  ))}
                </div>
                {prescription.notes && (
                  <p className="mt-2 text-xs text-muted-foreground">{prescription.notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
