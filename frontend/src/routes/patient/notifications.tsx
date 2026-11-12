import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/patient/notifications")({
  ...placeholderRoute({
    title: "Notifications",
    description: "Reminders, results and messages from your care team.",
    icon: Bell,
    items: [
      "Appointment confirmations and reminders",
      "Prescription and result alerts",
      "WhatsApp and email consent preferences",
    ],
  }),
});
