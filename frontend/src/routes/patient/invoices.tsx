import { createFileRoute } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/patient/invoices")({
  ...placeholderRoute({
    title: "Invoices & Payments",
    description: "View invoices, pay by M-Pesa and download receipts.",
    icon: Receipt,
    items: [
      "Own invoices and outstanding balances",
      "M-Pesa and other payment methods",
      "Receipts delivered by email and WhatsApp",
    ],
  }),
});
