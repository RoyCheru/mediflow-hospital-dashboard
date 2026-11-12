import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/doctor/ai")({
  ...placeholderRoute({
    title: "AI Assistant",
    description: "Assistive triage and visit-summary tooling with mandatory doctor approval.",
    icon: Sparkles,
    items: [
      "Draft visit summaries from doctor notes",
      "Triage suggestions with safety notices",
      "Every AI interaction logged and labelled",
    ],
  }),
});
