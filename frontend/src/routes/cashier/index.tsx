import { createFileRoute } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/cashier/")({
  ...placeholderRoute({
    title: "Cashier Dashboard",
    description: "Billing overview: outstanding invoices, payments and today's cash position.",
    icon: LayoutGrid,
    items: [
      "Today's cash summary",
      "Outstanding balances and partial payments",
      "Pending refunds and void requests",
      "Unconfirmed M-Pesa transactions",
    ],
  }),
});
