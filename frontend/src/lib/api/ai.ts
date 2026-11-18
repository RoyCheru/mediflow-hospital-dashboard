import { api } from "@/lib/api/client";
import type { AIInteraction, ListParams, Paginated } from "@/types/api";

export const aiKeys = {
  interactions: (params?: ListParams) => ["admin", "ai", "interactions", params] as const,
};

export function listAIInteractions(params?: ListParams) {
  return api.get<Paginated<AIInteraction>>("/admin/ai-interactions", params);
}

export function runTriage(symptoms: string, patientId?: string) {
  return api.post<{
    triage: {
      suggested_department?: string;
      urgency?: string;
      notice?: string;
      emergency?: boolean;
      [key: string]: unknown;
    };
    ai_interaction_id: string;
    ai_generated: true;
  }>("/ai/triage", { symptoms, patient_id: patientId });
}

export function reportQuery(query: string) {
  return api.post<Record<string, unknown>>("/admin/report-queries", { query });
}
