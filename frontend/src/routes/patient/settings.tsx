import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/patient/settings")({
  ...placeholderRoute({
    title: "Settings",
    description: "Your profile, contact details and communication preferences.",
    icon: Settings,
    items: [
      "Profile and contact details",
      "WhatsApp and email consent",
      "Password and verification settings",
    ],
  }),
});
