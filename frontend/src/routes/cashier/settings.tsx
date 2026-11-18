import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/cashier/settings")({
  ...placeholderRoute({
    title: "Settings",
    description: "Cashier profile and payment-desk preferences.",
    icon: Settings,
    items: [
      "Profile and contact details",
      "Shift and cash-drawer preferences",
      "Receipt and notification preferences",
    ],
  }),
});
