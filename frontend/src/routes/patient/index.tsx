import { createFileRoute } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/patient/")({
  ...placeholderRoute({
    title: "Patient Dashboard",
    description: "Upcoming appointments, health record, invoices and notification preferences.",
    icon: LayoutGrid,
    items: [
      "Upcoming appointments and reminders",
      "Book or reschedule with AI triage",
      "Medical history, prescriptions and results",
      "Invoices, payments and receipts",
    ],
  }),
});
