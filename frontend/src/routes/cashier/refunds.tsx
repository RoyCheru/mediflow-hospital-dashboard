import { createFileRoute } from "@tanstack/react-router";
import { HandCoins } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/cashier/refunds")({
  ...placeholderRoute({
    title: "Refunds & Voids",
    description: "Request refunds and invoice voids with mandatory reasons and dual approval.",
    icon: HandCoins,
    items: [
      "Refund requests with mandatory reason",
      "Invoice void requests",
      "Admin approval tracking",
      "No hard deletes: full history retained",
    ],
  }),
});
