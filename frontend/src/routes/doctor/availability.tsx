import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Field, PageHeader, Panel, inputCls } from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import {
  createMyException,
  createMyRule,
  deleteMyException,
  deleteMyRule,
  doctorKeys,
  getMyAvailability,
} from "@/lib/api/doctor";
import { errorMessage } from "@/lib/api/client";
import { formatDateTime, titleize } from "@/lib/format";

export const Route = createFileRoute("/doctor/availability")({
  head: () => ({ meta: [{ title: "My Availability — MediFlow" }] }),
  component: DoctorAvailabilityPage,
});

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const blankRule = { weekday: "1", start: "08:00", end: "17:00", slot_minutes: "30" };
const blankException = { start: "", end: "", kind: "LEAVE", reason: "" };

function DoctorAvailabilityPage() {
  const queryClient = useQueryClient();
  const [rule, setRule] = useState(blankRule);
  const [exception, setException] = useState(blankException);

  const availability = useQuery({
    queryKey: doctorKeys.availability,
    queryFn: getMyAvailability,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: doctorKeys.availability });

  const addRule = useMutation({
    mutationFn: () => {
      if (!rule.start || !rule.end) throw new Error("Start and end times are required");
      if (rule.end <= rule.start) throw new Error("End time must be after start time");
      return createMyRule({
        weekday: Number(rule.weekday),
        start_time: rule.start,
        end_time: rule.end,
        slot_minutes: Number(rule.slot_minutes) || 30,
      });
    },
    onSuccess: () => {
      toast.success("Working hours added");
      setRule(blankRule);
      void invalidate();
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const removeRule = useMutation({
    mutationFn: (id: string) => deleteMyRule(id),
    onSuccess: () => {
      toast.success("Working hours removed");
      void invalidate();
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const addException = useMutation({
    mutationFn: () => {
      if (!exception.start || !exception.end) throw new Error("Start and end are required");
      if (exception.end <= exception.start) throw new Error("End must be after start");
      return createMyException({
        start_at: exception.start,
        end_at: exception.end,
        kind: exception.kind,
        reason: exception.reason || null,
      });
    },
    onSuccess: () => {
      toast.success("Time off added");
      setException(blankException);
      void invalidate();
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const removeException = useMutation({
    mutationFn: (id: string) => deleteMyException(id),
    onSuccess: () => {
      toast.success("Time off removed");
      void invalidate();
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  return (
    <div>
      <PageHeader
        title="My Availability"
        subtitle="Recurring weekly availability and one-off blocked sessions."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Weekly working hours">
          {availability.isLoading ? (
            <LoadingRows rows={3} />
          ) : availability.error ? (
            <ErrorBlock error={availability.error} onRetry={() => void availability.refetch()} />
          ) : (availability.data?.rules.length ?? 0) === 0 ? (
            <EmptyBlock
              title="No working hours"
              message="Add a weekly rule so patients can book you."
              icon={<CalendarCheck className="h-5 w-5" />}
            />
          ) : (
            <ul className="space-y-2">
              {availability.data?.rules.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-secondary/50 p-3"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {weekdays[item.weekday]} · {item.start_time.slice(0, 5)}–
                      {item.end_time.slice(0, 5)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.slot_minutes} minute slots · {item.timezone}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${weekdays[item.weekday]} hours`}
                    onClick={() => removeRule.mutate(item.id)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              addRule.mutate();
            }}
          >
            <Field label="Weekday">
              <select
                className={inputCls}
                value={rule.weekday}
                onChange={(event) => setRule({ ...rule, weekday: event.target.value })}
              >
                {weekdays.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Slot minutes">
              <input
                type="number"
                min={5}
                max={240}
                className={inputCls}
                value={rule.slot_minutes}
                onChange={(event) => setRule({ ...rule, slot_minutes: event.target.value })}
              />
            </Field>
            <Field label="Start">
              <input
                type="time"
                className={inputCls}
                value={rule.start}
                onChange={(event) => setRule({ ...rule, start: event.target.value })}
              />
            </Field>
            <Field label="End">
              <input
                type="time"
                className={inputCls}
                value={rule.end}
                onChange={(event) => setRule({ ...rule, end: event.target.value })}
              />
            </Field>
            <Button type="submit" className="sm:col-span-2" disabled={addRule.isPending}>
              <Plus /> {addRule.isPending ? "Adding…" : "Add working hours"}
            </Button>
          </form>
        </Panel>

        <Panel title="Leave and blocked time">
          {availability.isLoading ? (
            <LoadingRows rows={3} />
          ) : (availability.data?.exceptions.length ?? 0) === 0 ? (
            <EmptyBlock
              title="No time off"
              message="Your leave and blocked sessions appear here."
            />
          ) : (
            <ul className="space-y-2">
              {availability.data?.exceptions.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-secondary/50 p-3"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {titleize(item.kind)} · {formatDateTime(item.start_at)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(item.end_at)}
                      {item.reason ? ` · ${item.reason}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Delete time off"
                    onClick={() => removeException.mutate(item.id)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              addException.mutate();
            }}
          >
            <Field label="Start">
              <input
                type="datetime-local"
                className={inputCls}
                value={exception.start}
                onChange={(event) => setException({ ...exception, start: event.target.value })}
              />
            </Field>
            <Field label="End">
              <input
                type="datetime-local"
                className={inputCls}
                value={exception.end}
                onChange={(event) => setException({ ...exception, end: event.target.value })}
              />
            </Field>
            <Field label="Kind">
              <select
                className={inputCls}
                value={exception.kind}
                onChange={(event) => setException({ ...exception, kind: event.target.value })}
              >
                <option value="LEAVE">Leave</option>
                <option value="BLOCKED">Blocked</option>
                <option value="EXTRA">Extra session</option>
              </select>
            </Field>
            <Field label="Reason">
              <input
                className={inputCls}
                value={exception.reason}
                onChange={(event) => setException({ ...exception, reason: event.target.value })}
              />
            </Field>
            <Button type="submit" className="sm:col-span-2" disabled={addException.isPending}>
              <Plus /> {addException.isPending ? "Adding…" : "Add time off"}
            </Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
