import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/doctor/reports")({
  ...placeholderRoute({
    title: "Reports & Stats",
    description: "The doctor's own monthly revenue, patients seen and consultation metrics.",
    icon: BarChart3,
    items: [
      "Monthly revenue from own consultations",
      "Patients seen and average consultation time",
      "Claim status for own consultations",
      "CSV and PDF export",
    ],
  }),
});
