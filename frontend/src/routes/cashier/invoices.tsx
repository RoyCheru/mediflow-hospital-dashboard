import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/cashier/invoices")({
  ...placeholderRoute({
    title: "Invoices",
    description: "Find invoices, review line items and follow outstanding balances.",
    icon: FileText,
    items: [
      "Invoice search by number, patient or status",
      "Line items, totals and balances",
      "Invoice PDF and receipt downloads",
    ],
  }),
});
