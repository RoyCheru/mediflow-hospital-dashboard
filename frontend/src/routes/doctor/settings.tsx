import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/doctor/settings")({
  ...placeholderRoute({
    title: "Settings",
    description: "Doctor profile, consultation fee, signature and notification preferences.",
    icon: Settings,
    items: [
      "Profile and licence details",
      "Consultation fee and department",
      "Signature and notification preferences",
    ],
  }),
});
