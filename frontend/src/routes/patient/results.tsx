import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel } from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { downloadAttachment } from "@/lib/api/clinical";
import { getMyTimeline } from "@/lib/api/patient";
import { formatDateTime, titleize } from "@/lib/format";

export const Route = createFileRoute("/patient/results")({
  head: () => ({ meta: [{ title: "Test Results — MediFlow" }] }),
  component: PatientResultsPage,
});

function PatientResultsPage() {
  const timeline = useQuery({
    queryKey: ["patient", "timeline"],
    queryFn: getMyTimeline,
    staleTime: 30_000,
  });
  const attachments = (timeline.data?.items ?? []).filter((event) => event.type === "attachment");

  async function download(id: string, fileName: string) {
    try {
      const blob = await downloadAttachment(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Unable to download this file");
    }
  }

  return (
    <div>
      <PageHeader
        title="Test Results"
        subtitle="Lab reports and scans uploaded by your care team."
      />
      <Panel>
        {timeline.isLoading ? (
          <LoadingRows rows={3} />
        ) : timeline.error ? (
          <ErrorBlock error={timeline.error} onRetry={() => void timeline.refetch()} />
        ) : attachments.length === 0 ? (
          <EmptyBlock
            title="No results uploaded"
            message="Lab reports and scans will appear here when ready."
            icon={<FlaskConical className="h-5 w-5" />}
          />
        ) : (
          <ul className="space-y-2">
            {attachments.map((event) => {
              const fileName = String(event.summary["file_name"] ?? "result");
              return (
                <li
                  key={event.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-info/15 text-info">
                    <FlaskConical className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {titleize(String(event.summary["attachment_type"] ?? "Report"))} ·{" "}
                      {formatDateTime(event.occurred_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                    onClick={() => void download(event.id, fileName)}
                  >
                    <Download className="h-4 w-4" /> Download
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
