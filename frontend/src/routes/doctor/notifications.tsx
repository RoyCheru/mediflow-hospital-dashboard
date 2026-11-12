import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/doctor/notifications")({
  ...placeholderRoute({
    title: "Notifications",
    description: "New results, schedule changes and alerts relevant to the signed-in doctor.",
    icon: Bell,
    items: [
      "New lab results and uploaded reports",
      "Schedule changes and cancellations",
      "Urgent patient alerts",
    ],
  }),
});
