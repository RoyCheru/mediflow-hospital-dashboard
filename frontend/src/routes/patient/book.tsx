import { createFileRoute } from "@tanstack/react-router";
import { CalendarPlus } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/patient/book")({
  ...placeholderRoute({
    title: "Book Appointment",
    description: "Choose a department, doctor and available slot, then confirm your booking.",
    icon: CalendarPlus,
    items: [
      "Department and service selection",
      "Available doctors and slots",
      "Booking confirmation by WhatsApp and email",
    ],
  }),
});
