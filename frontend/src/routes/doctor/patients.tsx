import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/doctor/patients")({
  ...placeholderRoute({
    title: "My Patients",
    description: "Patients treated by the signed-in doctor, with quick patient search.",
    icon: Users,
    items: [
      "Patient search by name, number or phone",
      "Allergy and chronic-condition banners",
      "Chronological visit and prescription history",
    ],
  }),
});
