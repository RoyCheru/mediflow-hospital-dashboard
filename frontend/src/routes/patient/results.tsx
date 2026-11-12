import { createFileRoute } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/patient/results")({
  ...placeholderRoute({
    title: "Test Results",
    description: "Lab reports and scans uploaded by your care team.",
    icon: FlaskConical,
    items: [
      "Lab reports and scans",
      "Secure short-lived download links",
      "Result-ready notifications",
    ],
  }),
});
