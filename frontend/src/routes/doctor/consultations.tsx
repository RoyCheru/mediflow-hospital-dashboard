import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/doctor/consultations")({
  ...placeholderRoute({
    title: "Consultations",
    description: "Visit notes, diagnoses, structured prescriptions and AI-assisted summaries.",
    icon: ClipboardList,
    items: [
      "Presenting complaint, vitals, notes and plan",
      "Structured prescription writer",
      "AI summary draft with doctor approval",
      "Referral letter and follow-up scheduling",
    ],
  }),
});
