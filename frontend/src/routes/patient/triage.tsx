import { createFileRoute } from "@tanstack/react-router";
import { Brain } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/patient/triage")({
  ...placeholderRoute({
    title: "AI Triage",
    description: "Describe your symptoms to get a suggested department and urgency level.",
    icon: Brain,
    items: [
      "Symptom description with a not-a-diagnosis notice",
      "Suggested department and urgency",
      "Emergency instructions for red-flag symptoms",
      "Doctor and slot suggestions",
    ],
  }),
});
