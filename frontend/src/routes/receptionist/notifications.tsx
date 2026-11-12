import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/receptionist/notifications")({
  ...placeholderRoute({
    title: "Notifications",
    description: "Patient communication status and front-desk alerts.",
    icon: Bell,
    items: [
      "Booking confirmations and reminders",
      "Failed WhatsApp messages and retries",
      "Aging claims and cash variance alerts",
    ],
  }),
});
