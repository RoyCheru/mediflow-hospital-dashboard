import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Clock, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { Badge, DetailRow, Field, Modal, inputCls, textareaCls } from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import {
  adminViewKeys,
  createAvailabilityException,
  createAvailabilityRule,
  deleteAvailabilityException,
  deleteAvailabilityRule,
  getStaffAvailability,
  updateAvailabilityException,
  updateAvailabilityRule,
} from "@/lib/api/adminViews";
import {
  formatDate,
  formatDateTime,
  formatKshMinor,
  titleize,
  toHospitalDateTimeInput,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type {
  AdminStaff,
  AvailabilityException,
  AvailabilityRule,
  StaffTodayStatus,
} from "@/types/api";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const blankRuleForm = { weekday: "1", start: "08:00", end: "17:00", slot_minutes: "30" };
const blankExceptionForm = { start: "", end: "", kind: "LEAVE", reason: "" };

function statusTone(status: StaffTodayStatus): "success" | "info" | "warning" | "muted" {
  if (status === "available") return "success";
  if (status === "in_consultation") return "info";
  if (status === "on_leave") return "warning";
  return "muted";
}

function statusLabel(status: StaffTodayStatus): string {
  if (status === "available") return "Available";
  if (status === "in_consultation") return "In consultation";
  if (status === "on_leave") return "On leave";
  return "Off today";
}

export function StaffAvailabilityPanel({
  staff,
  onClose,
}: {
  staff: AdminStaff;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"profile" | "availability">("availability");
  const [ruleForm, setRuleForm] = useState(blankRuleForm);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [exceptionForm, setExceptionForm] = useState(blankExceptionForm);
  const [editingExceptionId, setEditingExceptionId] = useState<string | null>(null);

  const startRuleEdit = (rule: AvailabilityRule) => {
    setEditingRuleId(rule.id);
    setRuleForm({
      weekday: String(rule.weekday),
      start: rule.start_time.slice(0, 5),
      end: rule.end_time.slice(0, 5),
      slot_minutes: String(rule.slot_minutes),
    });
  };
  const resetRuleForm = () => {
    setEditingRuleId(null);
    setRuleForm(blankRuleForm);
  };
  const startExceptionEdit = (item: AvailabilityException) => {
    setEditingExceptionId(item.id);
    setExceptionForm({
      start: toHospitalDateTimeInput(item.start_at),
      end: toHospitalDateTimeInput(item.end_at),
      kind: item.kind,
      reason: item.reason ?? "",
    });
  };
  const resetExceptionForm = () => {
    setEditingExceptionId(null);
    setExceptionForm(blankExceptionForm);
  };

  const availability = useQuery({
    queryKey: adminViewKeys.staffAvailability(staff.user_id),
    queryFn: () => getStaffAvailability(staff.user_id),
    staleTime: 20_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["admin", "staff-availability", staff.user_id],
    });
    void queryClient.invalidateQueries({ queryKey: ["admin", "admin-staff"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "working-today"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "admin-queue"] });
  };

  const ruleMutation = useMutation({
    mutationFn: () => {
      if (!ruleForm.start || !ruleForm.end) throw new Error("Start and end times are required");
      if (ruleForm.end <= ruleForm.start) throw new Error("End time must be after start time");
      const body = {
        weekday: Number(ruleForm.weekday),
        start_time: ruleForm.start,
        end_time: ruleForm.end,
        slot_minutes: Number(ruleForm.slot_minutes) || 30,
      };
      return editingRuleId
        ? updateAvailabilityRule(staff.user_id, editingRuleId, body)
        : createAvailabilityRule(staff.user_id, body);
    },
    onSuccess: () => {
      toast.success(editingRuleId ? "Working hours updated" : "Working hours added");
      resetRuleForm();
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const exceptionMutation = useMutation({
    mutationFn: () => {
      if (!exceptionForm.start || !exceptionForm.end) {
        throw new Error("Start and end are required");
      }
      if (exceptionForm.end <= exceptionForm.start) {
        throw new Error("End must be after start");
      }
      // datetime-local values are sent without an offset; the API reads them
      // as hospital time.
      const body = {
        start_at: exceptionForm.start,
        end_at: exceptionForm.end,
        kind: exceptionForm.kind,
        reason: exceptionForm.reason || null,
      };
      return editingExceptionId
        ? updateAvailabilityException(staff.user_id, editingExceptionId, body)
        : createAvailabilityException(staff.user_id, body);
    },
    onSuccess: () => {
      toast.success(editingExceptionId ? "Time off updated" : "Time off added");
      resetExceptionForm();
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (ruleId: string) => deleteAvailabilityRule(staff.user_id, ruleId),
    onSuccess: () => {
      toast.success("Working hours removed");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteExceptionMutation = useMutation({
    mutationFn: (exceptionId: string) => deleteAvailabilityException(staff.user_id, exceptionId),
    onSuccess: () => {
      toast.success("Time off removed");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={staff.full_name}
      subtitle={`${titleize(staff.role)} · ${staff.department.name ?? "No department"}`}
      wide
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(staff.today_status)}>{statusLabel(staff.today_status)}</Badge>
          {staff.today_working_hours.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              Today:{" "}
              {staff.today_working_hours.map((hours) => `${hours.start}–${hours.end}`).join(", ")}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No working hours today</span>
          )}
          {staff.next_available_slot && (
            <span className="text-xs text-muted-foreground">
              Next slot: {formatDateTime(staff.next_available_slot)}
            </span>
          )}
        </div>

        <div className="flex gap-1 rounded-xl bg-secondary p-1">
          {(["profile", "availability"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                tab === value
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "profile" ? (
                <UserRound className="h-4 w-4" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
              {value === "profile" ? "Profile" : "Availability"}
            </button>
          ))}
        </div>

        {tab === "profile" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailRow label="Name" value={staff.full_name} />
            <DetailRow label="Role" value={titleize(staff.role)} />
            <DetailRow label="Email" value={staff.email ?? "—"} />
            <DetailRow label="Phone" value={staff.phone ?? "—"} />
            <DetailRow label="Department" value={staff.department.name ?? "—"} />
            <DetailRow label="Specialty" value={staff.specialty ?? "—"} />
            <DetailRow label="License" value={staff.license_number ?? "—"} />
            <DetailRow
              label="Consultation fee"
              value={
                staff.consultation_fee_minor === null
                  ? "—"
                  : formatKshMinor(staff.consultation_fee_minor)
              }
            />
            <DetailRow label="Account status" value={titleize(staff.status)} />
          </div>
        ) : availability.isLoading ? (
          <LoadingRows rows={4} />
        ) : availability.error ? (
          <ErrorBlock error={availability.error} onRetry={() => void availability.refetch()} />
        ) : availability.data ? (
          <div className="space-y-5">
            <div className="grid gap-4 xl:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold">Weekly pattern</h3>
                <div className="space-y-2">
                  {availability.data.weekly_pattern.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between gap-2 rounded-xl bg-secondary/50 p-3"
                    >
                      <div>
                        <p className="text-sm font-semibold">
                          {weekdays[rule.weekday]} · {rule.start_time.slice(0, 5)}–
                          {rule.end_time.slice(0, 5)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {rule.slot_minutes} min · {rule.timezone}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          aria-label="Edit working hours"
                          onClick={() => startRuleEdit(rule)}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          aria-label="Delete working hours"
                          onClick={() => {
                            if (editingRuleId === rule.id) resetRuleForm();
                            deleteRuleMutation.mutate(rule.id);
                          }}
                          className="rounded-lg p-2 text-destructive hover:bg-destructive/15"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {availability.data.weekly_pattern.length === 0 && (
                    <p className="rounded-xl bg-secondary/50 p-4 text-center text-sm text-muted-foreground">
                      No working hours configured.
                    </p>
                  )}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Upcoming time off</h3>
                <div className="space-y-2">
                  {availability.data.upcoming_exceptions.map((item) => (
                    <div
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
                      <div className="flex shrink-0 gap-1">
                        <button
                          aria-label="Edit time off"
                          onClick={() => startExceptionEdit(item)}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          aria-label="Delete time off"
                          onClick={() => {
                            if (editingExceptionId === item.id) resetExceptionForm();
                            deleteExceptionMutation.mutate(item.id);
                          }}
                          className="rounded-lg p-2 text-destructive hover:bg-destructive/15"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {availability.data.upcoming_exceptions.length === 0 && (
                    <p className="rounded-xl bg-secondary/50 p-4 text-center text-sm text-muted-foreground">
                      No upcoming time off.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <h3 className="text-sm font-semibold">Edit availability</h3>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-border p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  {editingRuleId ? (
                    <Pencil className="h-4 w-4 text-primary" />
                  ) : (
                    <Plus className="h-4 w-4 text-primary" />
                  )}
                  {editingRuleId ? "Edit working hours" : "New working hours"}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Weekday">
                    <select
                      className={inputCls}
                      value={ruleForm.weekday}
                      onChange={(event) =>
                        setRuleForm({ ...ruleForm, weekday: event.target.value })
                      }
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
                      min="5"
                      max="240"
                      className={inputCls}
                      value={ruleForm.slot_minutes}
                      onChange={(event) =>
                        setRuleForm({ ...ruleForm, slot_minutes: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Start">
                    <input
                      type="time"
                      className={inputCls}
                      value={ruleForm.start}
                      onChange={(event) => setRuleForm({ ...ruleForm, start: event.target.value })}
                    />
                  </Field>
                  <Field label="End">
                    <input
                      type="time"
                      className={inputCls}
                      value={ruleForm.end}
                      onChange={(event) => setRuleForm({ ...ruleForm, end: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => ruleMutation.mutate()}
                    disabled={ruleMutation.isPending}
                  >
                    <CalendarPlus />{" "}
                    {ruleMutation.isPending
                      ? "Saving…"
                      : editingRuleId
                        ? "Save working hours"
                        : "Add working hours"}
                  </Button>
                  {editingRuleId && (
                    <Button variant="outline" onClick={resetRuleForm}>
                      Cancel edit
                    </Button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Clock className="h-4 w-4 text-primary" />{" "}
                  {editingExceptionId ? "Edit time off" : "New time off"}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Start (hospital time)">
                    <input
                      type="datetime-local"
                      className={inputCls}
                      value={exceptionForm.start}
                      onChange={(event) =>
                        setExceptionForm({ ...exceptionForm, start: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="End (hospital time)">
                    <input
                      type="datetime-local"
                      className={inputCls}
                      value={exceptionForm.end}
                      onChange={(event) =>
                        setExceptionForm({ ...exceptionForm, end: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Kind">
                    <select
                      className={inputCls}
                      value={exceptionForm.kind}
                      onChange={(event) =>
                        setExceptionForm({ ...exceptionForm, kind: event.target.value })
                      }
                    >
                      <option value="LEAVE">Leave</option>
                      <option value="BLOCKED">Blocked</option>
                      <option value="EXTRA">Extra session</option>
                    </select>
                  </Field>
                  <Field label="Reason">
                    <input
                      className={inputCls}
                      value={exceptionForm.reason}
                      onChange={(event) =>
                        setExceptionForm({ ...exceptionForm, reason: event.target.value })
                      }
                    />
                  </Field>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => exceptionMutation.mutate()}
                    disabled={exceptionMutation.isPending}
                  >
                    <Clock />{" "}
                    {exceptionMutation.isPending
                      ? "Saving…"
                      : editingExceptionId
                        ? "Save time off"
                        : "Add time off"}
                  </Button>
                  {editingExceptionId && (
                    <Button variant="outline" onClick={resetExceptionForm}>
                      Cancel edit
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">One-week calendar</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {availability.data.days.map((day) => {
                  const booked = day.slots.filter((slot) => slot.appointment);
                  return (
                    <div key={day.date} className="rounded-xl bg-secondary/50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{formatDate(day.date)}</p>
                        {day.on_leave ? (
                          <Badge tone="warning">On leave</Badge>
                        ) : day.working_hours.length === 0 ? (
                          <Badge tone="muted">Off</Badge>
                        ) : (
                          <Badge tone="success">Working</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {day.on_leave
                          ? "Time off"
                          : day.working_hours
                              .map((hours) => `${hours.start}–${hours.end}`)
                              .join(", ") || "No hours"}
                      </p>
                      {availability.data?.is_doctor && (
                        <div className="mt-2 space-y-1">
                          <p className="text-[11px] text-muted-foreground">
                            {booked.length} booked ·{" "}
                            {day.slots.filter((slot) => slot.available).length} open
                          </p>
                          {booked.slice(0, 3).map((slot) => (
                            <p
                              key={slot.start}
                              className="truncate text-[11px] text-muted-foreground"
                            >
                              {formatDateTime(slot.start)} ·{" "}
                              {slot.appointment?.patient_name ?? "Patient"}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
