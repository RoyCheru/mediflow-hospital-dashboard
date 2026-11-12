import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/cashier/notifications")({
  ...placeholderRoute({
    title: "Notifications",
    description: "Billing alerts and failed payment notifications.",
    icon: Bell,
    items: ["Failed M-Pesa callbacks", "Unusual cash variance alerts", "Refund and void decisions"],
  }),
});
