import { createFileRoute } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/receptionist/billing")({
  ...placeholderRoute({
    title: "Billing & Payments",
    description: "Create invoices, select payment method and verify SHA eligibility.",
    icon: Receipt,
    items: [
      "Invoice creation from the visit and price list",
      "Cash, M-Pesa and SHA payment paths",
      "SHA eligibility verification and split billing",
      "Receipt delivery by email and WhatsApp",
    ],
  }),
});
