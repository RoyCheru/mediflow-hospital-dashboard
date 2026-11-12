import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/receptionist/appointments")({
  ...placeholderRoute({
    title: "Appointments",
    description: "Book, reschedule and cancel appointments for any patient or doctor.",
    icon: CalendarDays,
    items: [
      "Booking across departments and doctors",
      "Walk-in registration into the same-day queue",
      "Reschedule and cancellation with cut-off rules",
      "No-show risk shown before booking",
    ],
  }),
});
