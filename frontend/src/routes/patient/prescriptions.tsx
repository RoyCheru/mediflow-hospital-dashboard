import { createFileRoute } from "@tanstack/react-router";
import { Pill } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/patient/prescriptions")({
  ...placeholderRoute({
    title: "Prescriptions",
    description: "Current and past prescriptions with dosage instructions.",
    icon: Pill,
    items: [
      "Active prescriptions",
      "Dosage, frequency and duration",
      "Prescription-ready notifications",
    ],
  }),
});
