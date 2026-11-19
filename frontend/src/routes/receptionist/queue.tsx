import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarPlus, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { BookingDialog, type BookingKind } from "@/components/frontdesk/BookingDialog";
import { CheckInList } from "@/components/frontdesk/CheckInList";
import { QueueBoard } from "@/components/frontdesk/QueueBoard";
import { formatDate, hospitalTodayIso } from "@/lib/format";

export const Route = createFileRoute("/receptionist/queue")({
  head: () => ({ meta: [{ title: "Queue & Check-in — MediFlow" }] }),
  component: ReceptionQueuePage,
});

function ReceptionQueuePage() {
  const [booking, setBooking] = useState<BookingKind | null>(null);
  return (
    <>
      <PageHeader
        title="Queue & Check-in"
        subtitle={`${formatDate(hospitalTodayIso())} · check in booked patients, add walk-ins and watch the live queue`}
        actions={
          <>
            <Button variant="outline" onClick={() => setBooking("scheduled")}>
              <CalendarPlus /> Book appointment
            </Button>
            <Button onClick={() => setBooking("walk-in")}>
              <UserPlus /> Add walk-in
            </Button>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <CheckInList />
        <QueueBoard />
      </div>
      {booking && (
        <BookingDialog key={booking} open initialKind={booking} onClose={() => setBooking(null)} />
      )}
    </>
  );
}
