import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/cashier/reconciliation")({
  ...placeholderRoute({
    title: "Cash Reconciliation",
    description: "Reconcile shift cash against system totals and resolve discrepancies.",
    icon: Wallet,
    items: [
      "Opening and closing cash per shift",
      "Expected vs counted totals with variance",
      "Unconfirmed transaction resolution queue",
    ],
  }),
});
