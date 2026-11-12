import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/receptionist/settings")({
  ...placeholderRoute({
    title: "Settings",
    description: "Reception profile and front-desk preferences.",
    icon: Settings,
    items: [
      "Profile and contact details",
      "Notification preferences",
      "Default department and booking preferences",
    ],
  }),
});
