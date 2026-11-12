import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/doctor/availability")({
  ...placeholderRoute({
    title: "My Availability",
    description: "Recurring weekly availability templates and one-off exceptions.",
    icon: CalendarCheck,
    items: [
      "Weekly availability rules by day",
      "Leave, blocked slots and extra sessions",
      "Booking cut-off and slot duration settings",
    ],
  }),
});
