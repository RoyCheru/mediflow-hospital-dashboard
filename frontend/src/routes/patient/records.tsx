import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/patient/records")({
  ...placeholderRoute({
    title: "Medical Records",
    description: "Your chronological timeline of visits, diagnoses and prescriptions.",
    icon: BookOpen,
    items: [
      "Chronological visit timeline",
      "Diagnoses, notes and treatment plans",
      "Uploaded lab reports and scans",
    ],
  }),
});
