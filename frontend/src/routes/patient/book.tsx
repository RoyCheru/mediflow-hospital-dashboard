import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarPlus, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { Field, PageHeader, Panel, inputCls } from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import {
  createAppointment,
  getAvailability,
  listDoctors,
  listServices,
} from "@/lib/api/management";
import { errorMessage } from "@/lib/api/client";
import { formatDate, formatKshMinor, formatTime, hospitalTodayIso } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/patient/book")({
  head: () => ({ meta: [{ title: "Book Appointment — MediFlow" }] }),
  component: BookAppointmentPage,
});

function BookAppointmentPage() {
  const navigate = useNavigate();
  const [doctorId, setDoctorId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(hospitalTodayIso());
  const [slot, setSlot] = useState<string | null>(null);

  const doctors = useQuery({
    queryKey: ["patient", "booking", "doctors"],
    queryFn: () => listDoctors({}),
    staleTime: 120_000,
  });
  const services = useQuery({
    queryKey: ["patient", "booking", "services"],
    queryFn: () => listServices({}),
    staleTime: 120_000,
  });
  const availability = useQuery({
    queryKey: ["patient", "booking", "availability", doctorId, date],
    queryFn: () => getAvailability(doctorId, date),
    enabled: Boolean(doctorId && date),
    staleTime: 15_000,
  });

  const selectedDoctor = doctors.data?.items.find((doctor) => doctor.id === doctorId);
  const slots = (availability.data?.slots ?? []).filter((item) => item.available);
  const book = useMutation({
    mutationFn: () => {
      if (!doctorId) throw new Error("Choose a doctor");
      if (!slot) throw new Error("Choose an available slot");
      return createAppointment({
        doctor_id: doctorId,
        service_id: serviceId || undefined,
        scheduled_start: slot,
      });
    },
    onSuccess: () => {
      toast.success("Appointment booked");
      navigate({ to: "/patient/appointments" });
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  return (
    <div>
      <PageHeader
        title="Book Appointment"
        subtitle="Choose a doctor, date and available slot. Confirmation is sent by email and WhatsApp."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Choose your visit">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Doctor">
              <select
                className={inputCls}
                value={doctorId}
                onChange={(event) => {
                  setDoctorId(event.target.value);
                  setSlot(null);
                }}
              >
                <option value="">Select doctor</option>
                {(doctors.data?.items ?? []).map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.name ?? doctor.id} · {doctor.specialty ?? "Doctor"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Service (optional)">
              <select
                className={inputCls}
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
              >
                <option value="">No specific service</option>
                {(services.data?.items ?? []).map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                    {service.current_price_minor !== null
                      ? ` · ${formatKshMinor(service.current_price_minor)}`
                      : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input
                type="date"
                className={inputCls}
                min={hospitalTodayIso()}
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setSlot(null);
                }}
              />
            </Field>
          </div>

          {selectedDoctor && (
            <div className="mt-4 rounded-xl bg-secondary/50 p-3 text-sm">
              <p className="font-semibold">{selectedDoctor.name}</p>
              <p className="text-xs text-muted-foreground">
                {selectedDoctor.specialty ?? "General practice"} · consultation{" "}
                {formatKshMinor(selectedDoctor.consultation_fee_minor)}
              </p>
            </div>
          )}

          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold">
              {doctorId ? `Available slots · ${formatDate(date)}` : "Select a doctor to see slots"}
            </p>
            {!doctorId ? (
              <EmptyBlock
                title="Choose a doctor"
                message="Available appointment times will appear here."
                icon={<Stethoscope className="h-5 w-5" />}
              />
            ) : availability.isLoading ? (
              <LoadingRows rows={2} />
            ) : availability.error ? (
              <ErrorBlock error={availability.error} onRetry={() => void availability.refetch()} />
            ) : slots.length === 0 ? (
              <EmptyBlock
                title="No open slots"
                message="Try another date or choose a different doctor."
              />
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {slots.map((item) => (
                  <button
                    key={item.start}
                    type="button"
                    onClick={() => setSlot(item.start)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-sm font-semibold transition-colors",
                      slot === item.start
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-secondary hover:bg-accent",
                    )}
                  >
                    {formatTime(item.start)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Booking summary" className="h-fit">
          <div className="space-y-2 text-sm">
            <p className="flex justify-between gap-3">
              <span className="text-muted-foreground">Doctor</span>
              <span className="text-right font-semibold">{selectedDoctor?.name ?? "—"}</span>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-muted-foreground">Date</span>
              <span className="font-semibold">{date ? formatDate(date) : "—"}</span>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-muted-foreground">Time</span>
              <span className="font-semibold">{slot ? formatTime(slot) : "—"}</span>
            </p>
          </div>
          <Button
            className="mt-5 w-full"
            onClick={() => book.mutate()}
            disabled={book.isPending || !slot}
          >
            <CalendarPlus /> {book.isPending ? "Booking…" : "Confirm booking"}
          </Button>
        </Panel>
      </div>
    </div>
  );
}
