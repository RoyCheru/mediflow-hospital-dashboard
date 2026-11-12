import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { placeholderRoute } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/receptionist/claims")({
  ...placeholderRoute({
    title: "SHA Claims",
    description: "Create claims after eligibility checks and follow their status.",
    icon: ShieldCheck,
    items: [
      "Eligibility check before claim creation",
      "Create claims for active SHA members",
      "Track submitted, approved and rejected claims",
    ],
  }),
});
