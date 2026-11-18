import { createFileRoute } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/receptionist/")({
  ...placeholderRoute({
    title: "Reception Dashboard",
    description:
      "Front-desk overview: registration, queue and check-in, bookings and cash summary.",
    icon: LayoutGrid,
    items: [
      "Same-day queue and check-in status",
      "Bookings on behalf of patients",
      "Today's cash summary",
      "No-show risk flags",
    ],
  }),
});
