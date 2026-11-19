import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { inputCls } from "@/components/kit";
import { listPatients } from "@/lib/api/management";
import { cn } from "@/lib/utils";
import type { PatientBrief } from "@/types/api";

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Search existing patients by name, patient number or phone and pick one. */
export function PatientPicker({
  value,
  onChange,
  label = "Find patient",
}: {
  value: PatientBrief | null;
  onChange: (patient: PatientBrief | null) => void;
  label?: string;
}) {
  const [term, setTerm] = useState("");
  const q = useDebounced(term.trim(), 250);
  const results = useQuery({
    queryKey: ["frontdesk", "patients", q],
    queryFn: () => listPatients({ q, page_size: 8, sort: "name" }),
    enabled: q.length >= 2 && value === null,
    staleTime: 30_000,
  });

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {value.first_name} {value.last_name}
          </p>
          <p className="text-xs text-muted-foreground">
            {value.patient_number} · {value.phone}
          </p>
        </div>
        <button
          type="button"
          aria-label="Change patient"
          onClick={() => onChange(null)}
          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const items = results.data?.items ?? [];
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          aria-label={label}
          placeholder="Name, patient number or phone"
          className={cn(inputCls, "pl-10")}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
      </div>
      {q.length >= 2 && (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto" aria-label="Patient results">
          {results.isLoading ? (
            <li className="p-2 text-xs text-muted-foreground">Searching…</li>
          ) : items.length === 0 ? (
            <li className="p-2 text-xs text-muted-foreground">No matching patients.</li>
          ) : (
            items.map((patient) => (
              <li key={patient.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(patient);
                    setTerm("");
                  }}
                  className="w-full rounded-lg p-2 text-left hover:bg-accent/60"
                >
                  <span className="text-sm font-semibold">
                    {patient.first_name} {patient.last_name}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {patient.patient_number} · {patient.phone}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
