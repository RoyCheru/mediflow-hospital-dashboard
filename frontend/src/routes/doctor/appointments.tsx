import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/doctor/appointments")({
  ...placeholderRoute({
    title: "Appointments",
    description: "Scheduled and same-day appointments for the signed-in doctor.",
    icon: CalendarDays,
    items: [
      "Daily and weekly schedule",
      "Reschedule and cancellation actions",
      "Follow-up bookings created from visits",
    ],
  }),
});
