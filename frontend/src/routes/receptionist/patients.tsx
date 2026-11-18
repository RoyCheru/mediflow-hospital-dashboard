import { createFileRoute } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/receptionist/patients")({
  ...placeholderRoute({
    title: "Register Patient",
    description: "Search existing patients and register new walk-in or returning patients.",
    icon: UserPlus,
    items: [
      "Search by name, patient number or phone",
      "Duplicate detection before registration",
      "Demographics, next of kin and SHA details",
      "Consent capture for WhatsApp and email",
    ],
  }),
});
