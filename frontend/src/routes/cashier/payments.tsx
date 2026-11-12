import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/cashier/payments")({
  ...placeholderRoute({
    title: "Payments",
    description: "Record cash, M-Pesa and card payments and allocate them to invoices.",
    icon: CreditCard,
    items: [
      "Cash tendered, change and staff attribution",
      "M-Pesa STK push and callback status",
      "Payment allocation across invoices",
      "Instant receipt generation",
    ],
  }),
});
