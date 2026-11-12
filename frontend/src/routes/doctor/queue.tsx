import { createFileRoute } from "@tanstack/react-router";
import { ListOrdered } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/doctor/queue")({
  ...placeholderRoute({
    title: "Today's Queue",
    description: "Live doctor queue with checked-in patients, walk-ins and urgent cases first.",
    icon: ListOrdered,
    items: [
      "Checked-in patients ready for consultation",
      "Walk-in registrations from reception",
      "Urgent-priority flag and ordering",
    ],
  }),
});
