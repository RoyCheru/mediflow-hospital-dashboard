import { createFileRoute } from "@tanstack/react-router";
import { ListOrdered } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/receptionist/queue")({
  ...placeholderRoute({
    title: "Queue & Check-in",
    description: "Check patients in and monitor the live queue per doctor.",
    icon: ListOrdered,
    items: [
      "Check-in for scheduled appointments",
      "Walk-in queue placement",
      "Live queue per doctor with urgent priority",
    ],
  }),
});
