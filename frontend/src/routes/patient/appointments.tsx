import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/patient/appointments")({
  ...placeholderRoute({
    title: "My Appointments",
    description: "Upcoming and past appointments with reschedule and cancel actions.",
    icon: CalendarDays,
    items: [
      "Upcoming and past appointments",
      "Reschedule and cancel within cut-off rules",
      "Booking confirmations and reminders",
    ],
  }),
});
