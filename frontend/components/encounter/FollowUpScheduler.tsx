import React, { useEffect, useMemo, useState } from "react";
import { formatGridShortLabel } from "../../utils/scheduling";

type FollowUpAvailability = {
  days: Array<{
    date: string;
    dayLabel: string;
    slots: Array<{
      start: string;
      end: string;
      status: "available" | "booked" | "off";
      appointmentIds?: number[];
      appointmentId?: number; // backward compat (unused)
    }>;
  }>;
  timeLabels: string[];
};

type AppointmentLiteForDetails = {
  id: number;
  status: string;
  scheduledAt: string;
  endAt: string | null;
  patientName: string | null;
  patientOvog?: string | null;
  patient?: {
    name: string;
    ovog?: string | null;
    patientBook?: { bookNumber?: string | null } | null;
  } | null;

  // ✅ add this
  branch?: { id: number; name: string } | null;
  
  // Provenance fields for deletion permission tracking
  createdByUserId?: number | null;
  source?: string | null;
  sourceEncounterId?: number | null;
};

type FollowUpSchedulerProps = {
  showFollowUpScheduler: boolean;
  followUpDateFrom: string;
  followUpDateTo: string;
  followUpSlotMinutes: number;

  followUpAvailability: FollowUpAvailability | null;
  followUpLoading: boolean;
  followUpError: string;
  followUpSuccess: string;
  followUpBooking: boolean;

  followUpAppointments?: AppointmentLiteForDetails[];
  followUpNoSchedule?: boolean;
  doctorId?: number; // Add doctorId for QuickAppointmentModal
  encounterId?: number; // Current encounter ID for permission checks

  onToggleScheduler: (checked: boolean) => void;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
  onSlotMinutesChange: (minutes: number) => void;
  onBookAppointment: (slotStart: string, durationMinutes?: number) => void;
  onDeleteAppointment?: (appointmentId: number) => Promise<void>; // Delete handler

  onQuickCreate?: (params: { date: string; time: string; durationMinutes: number }) => void;
  onReloadAvailability?: () => void; // Callback to reload availability after creating appointment
};

function getHmFromIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toTimeString().substring(0, 5);
}
const nameOnly = (label: string) =>
  (label || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
// Constants for grid layout
const COL_WIDTH = 80; // Width of each time slot column in pixels
const MIN_ROW_HEIGHT = 80; // Minimum height for each day row
const BLOCK_BORDER_RADIUS = 4; // Border radius for appointment blocks
const DEFAULT_LANE = 0; // Default lane when both lanes are full

export default function FollowUpScheduler({
  showFollowUpScheduler,
  followUpDateFrom,
  followUpDateTo,
  followUpSlotMinutes,
  followUpAvailability,
  followUpLoading,
  followUpError,
  followUpSuccess,
  followUpBooking,
  followUpAppointments = [],
  followUpNoSchedule = false,
  doctorId,
  encounterId,
  onToggleScheduler,
  onDateFromChange,
  onDateToChange,
  onSlotMinutesChange,
  onBookAppointment,
  onDeleteAppointment,
  onQuickCreate,
  onReloadAvailability,
}: FollowUpSchedulerProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsDate, setDetailsDate] = useState<string>("");
  const [detailsTime, setDetailsTime] = useState<string>("");
  const [detailsSlotStart, setDetailsSlotStart] = useState<string>(""); // ISO string of slot start
  const [detailsAppointmentIds, setDetailsAppointmentIds] = useState<number[]>([]);
  const [deletingAppointmentId, setDeletingAppointmentId] = useState<number | null>(null);

  // Quick create UI (Option 3A)
  const [quickDate, setQuickDate] = useState<string>(followUpDateFrom);
  const [quickTime, setQuickTime] = useState<string>("09:00");
  const [quickDuration, setQuickDuration] = useState<number>(30);

  const [slotModalOpen, setSlotModalOpen] = useState<boolean>(false);
  const [selectedSlot, setSelectedSlot] = useState<string>("");

  const handleDeleteAppointment = async (appointmentId: number) => {
    if (!onDeleteAppointment) return;
    
    if (!confirm("Энэ цагийг устгахдаа итгэлтэй байна уу?")) {
      return;
    }

    try {
      setDeletingAppointmentId(appointmentId);
      await onDeleteAppointment(appointmentId);
      setDetailsOpen(false);
      // Reload will happen in parent
    } catch (err: any) {
      alert(err?.message || "Цаг устгахад алдаа гарлаа");
    } finally {
      setDeletingAppointmentId(null);
    }
  };

  // Check if appointment can be deleted (open mode - no auth required)
  // Only follow-up appointments from current encounter that are in the future can be deleted
  const canDeleteAppointment = (appointment: AppointmentLiteForDetails): boolean => {
    if (!encounterId) return false;
    
    // Must be from follow-up encounter source
    const isFollowUpSource = appointment.source === "FOLLOW_UP_ENCOUNTER";
    
    // Must belong to the current encounter
    const isCurrentEncounter = appointment.sourceEncounterId === encounterId;
    
    // Must be scheduled in the future
    const isFutureAppointment = new Date(appointment.scheduledAt) > new Date();
    
    return isFutureAppointment && isFollowUpSource && isCurrentEncounter;
  };

  const apptById = useMemo(() => {
    const map = new Map<number, AppointmentLiteForDetails>();
    for (const a of followUpAppointments) {
      map.set(a.id, a);
    }
    return map;
  }, [followUpAppointments]);

  const detailsAppointments = useMemo(() => {
    return detailsAppointmentIds.map((id) => apptById.get(id)).filter(Boolean) as AppointmentLiteForDetails[];
  }, [detailsAppointmentIds, apptById]);

  // Calculate how many appointments would overlap if we create a new one at detailsSlotStart
  const calculateOverlapCount = (slotStart: string, durationMinutes: number): number => {
    if (!slotStart) return 0;
    
    const newStart = new Date(slotStart);
    const newEnd = new Date(newStart.getTime() + durationMinutes * 60_000);
    
    // Count appointments that would overlap with the new appointment
    let count = 0;
    for (const apt of followUpAppointments) {
      if (apt.status === "cancelled" || apt.status === "no_show" || apt.status === "completed") {
        continue; // Don't count cancelled/no-show/completed
      }
      
      const aptStart = new Date(apt.scheduledAt);
      const aptEnd = apt.endAt ? new Date(apt.endAt) : new Date(aptStart.getTime() + followUpSlotMinutes * 60_000);
      
      // Check if they overlap: aptStart < newEnd && aptEnd > newStart
      if (aptStart < newEnd && aptEnd > newStart) {
        count++;
      }
    }
    
    // +1 for the new appointment we're trying to add
    return count + 1;
  };

  const canAddAppointment = useMemo(() => {
    if (!detailsSlotStart) return false;
    const overlapCount = calculateOverlapCount(detailsSlotStart, followUpSlotMinutes);
    return overlapCount <= 2;
  }, [detailsSlotStart, followUpSlotMinutes, followUpAppointments]);

  const handleSlotSelection = (slotStart: string) => {
    // Extract date and time from ISO string
    const dt = new Date(slotStart);
    const date = dt.toISOString().split('T')[0];
    const hm = getHmFromIso(slotStart);
    
    // Open details modal to show occupancy and allow adding appointment
    setDetailsSlotStart(slotStart);
    setDetailsDate(date);
    setDetailsTime(hm);
    
    // Find appointments that overlap with this slot
    const slotEnd = new Date(dt.getTime() + followUpSlotMinutes * 60_000);
    const overlappingIds: number[] = [];
    
    for (const apt of followUpAppointments) {
      if (apt.status === "cancelled" || apt.status === "no_show" || apt.status === "completed") {
        continue;
      }
      
      const aptStart = new Date(apt.scheduledAt);
      const aptEnd = apt.endAt ? new Date(apt.endAt) : new Date(aptStart.getTime() + followUpSlotMinutes * 60_000);
      
      if (aptStart < slotEnd && aptEnd > dt) {
        overlappingIds.push(apt.id);
      }
    }
    
    setDetailsAppointmentIds(overlappingIds);
    setDetailsOpen(true);
  };

  const handleBookedSlotClick = (appointmentIds: number[], date: string, time: string, slotStart: string) => {
    setDetailsAppointmentIds(appointmentIds);
    setDetailsDate(date);
    setDetailsTime(time);
    setDetailsSlotStart(slotStart);
    setDetailsOpen(true);
  };


  const [localAvailability, setLocalAvailability] = useState<FollowUpAvailability | null>(followUpAvailability);

useEffect(() => {
  setLocalAvailability(followUpAvailability);
}, [followUpAvailability]);
  
  const handleDurationSelect = (durationMinutes: number) => {
  if (!selectedSlot || !localAvailability) return;

  // 1) Optimistically mark selected slot as booked in local state
  const updatedDays = localAvailability.days.map((day) => ({
    ...day,
    slots: day.slots.map((slot) =>
      slot.start === selectedSlot
        ? { ...slot, status: "booked" as const }
        : slot
    ),
  }));

  setLocalAvailability({ ...localAvailability, days: updatedDays });

  // 2) Call backend
  onBookAppointment(selectedSlot, durationMinutes);

  // 3) Close modal
  setSlotModalOpen(false);
  setSelectedSlot("");

  // 4) Trigger reload after a short delay to get fresh data
  setTimeout(() => {
    onReloadAvailability?.();
  }, 500);
};

  // Compute lane assignments for appointments
  const computeLanes = (appointments: AppointmentLiteForDetails[]): Map<number, 0 | 1> => {
    const lanes = new Map<number, 0 | 1>();
    const DEFAULT_SLOT_DURATION_MS = followUpSlotMinutes * 60_000;
    
    // Sort by start time, then by duration (longer first), then by id
    const sorted = [...appointments].sort((a, b) => {
      const startA = new Date(a.scheduledAt).getTime();
      const startB = new Date(b.scheduledAt).getTime();
      if (startA !== startB) return startA - startB;
      
      const endA = a.endAt ? new Date(a.endAt).getTime() : startA + DEFAULT_SLOT_DURATION_MS;
      const endB = b.endAt ? new Date(b.endAt).getTime() : startB + DEFAULT_SLOT_DURATION_MS;
      const durA = endA - startA;
      const durB = endB - startB;
      
      if (durA !== durB) return durB - durA; // longer first
      return a.id - b.id;
    });
    
    // Track end times for each lane
    const laneEndTime: { lane0: number | null; lane1: number | null } = { lane0: null, lane1: null };
    
    for (const apt of sorted) {
      const start = new Date(apt.scheduledAt).getTime();
      const end = apt.endAt 
        ? new Date(apt.endAt).getTime() 
        : start + DEFAULT_SLOT_DURATION_MS;
      
      // Try to assign to first available lane
      let assignedLane: 0 | 1 = DEFAULT_LANE;
      if (laneEndTime.lane0 === null || start >= laneEndTime.lane0) {
        assignedLane = 0;
        laneEndTime.lane0 = end;
      } else if (laneEndTime.lane1 === null || start >= laneEndTime.lane1) {
        assignedLane = 1;
        laneEndTime.lane1 = end;
      } else {
        // Both lanes are occupied - force to default lane
        assignedLane = DEFAULT_LANE;
        laneEndTime.lane0 = Math.max(laneEndTime.lane0 ?? 0, end);
      }
      
      lanes.set(apt.id, assignedLane);
    }
    
    return lanes;
  };

  const renderGrid = () => {
    if (!localAvailability) return null;
    const { days, timeLabels } = localAvailability;

    // For each day, get appointments for that day
    const dayAppointments = days.map((day) => {
      const aptsThisDay = followUpAppointments.filter((apt) => {
        if (apt.status === "cancelled" || apt.status === "no_show" || apt.status === "completed") {
          return false;
        }
        const aptDate = new Date(apt.scheduledAt).toISOString().split('T')[0];
        return aptDate === day.date;
      });

      // Compute lanes for appointments this day
      const lanes = computeLanes(aptsThisDay);

      return { day, appointments: aptsThisDay, lanes };
    });

    return (
      <div className="overflow-x-auto mt-3 border border-gray-200 rounded-lg">
        <table className="w-full border-separate border-spacing-0 text-xs bg-white">
          <thead>
            <tr>
              <th className="text-center bg-gray-50 p-2 border-b-2 border-b-gray-300 border-r border-r-gray-200 font-bold min-w-[100px]">
                Огноо
              </th>
              {timeLabels.map((timeLabel) => (
                <th
                  key={timeLabel}
                  className="text-center bg-gray-50 border-b-2 border-b-gray-300 border-r border-r-gray-200 p-2 font-bold"
                  style={{ width: COL_WIDTH, maxWidth: COL_WIDTH }}
                >
                  {timeLabel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dayAppointments.map(({ day, appointments, lanes }) => {
              const DEFAULT_SLOT_DURATION_MS = followUpSlotMinutes * 60_000;
              
              // Calculate column spans for appointments
              const getColSpan = (apt: AppointmentLiteForDetails): number => {
                const start = new Date(apt.scheduledAt);
                const end = apt.endAt ? new Date(apt.endAt) : new Date(start.getTime() + DEFAULT_SLOT_DURATION_MS);
                const durationMs = end.getTime() - start.getTime();
                return Math.max(1, Math.ceil(durationMs / DEFAULT_SLOT_DURATION_MS));
              };

              const getStartCol = (apt: AppointmentLiteForDetails): number => {
                const startTime = getHmFromIso(apt.scheduledAt);
                return timeLabels.indexOf(startTime);
              };

              return (
                <tr key={day.date}>
                  {/* Date as the first column */}
                  <td
                    className="p-2 text-center bg-gray-50 font-medium border-b border-b-gray-200 border-r border-r-gray-200 align-top"
                    style={{ minHeight: MIN_ROW_HEIGHT }}
                  >
                    <div>{day.dayLabel}</div>
                    <div className="text-[10px] text-gray-500">
                      {new Date(day.date).toLocaleDateString("mn-MN", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </div>
                  </td>
                  
                  {/* Time slots container with duration-spanning appointment blocks */}
                  <td
                    colSpan={timeLabels.length}
                    className="p-0 border-b border-b-gray-200 relative"
                  >
                    {/* Base grid layer for cell backgrounds and click handlers */}
                    <div
                      className="grid"
                      style={{
                        gridTemplateColumns: `repeat(${timeLabels.length}, ${COL_WIDTH}px)`,
                        gridTemplateRows: "repeat(2, 40px)",
                        minHeight: MIN_ROW_HEIGHT,
                      }}
                    >
                      {timeLabels.map((timeLabel, colIndex) => {
                        const slot = day.slots.find((s) => getHmFromIso(s.start) === timeLabel);
                        
                        if (!slot) {
                          return (
                            <div
                              key={`${day.date}-${timeLabel}-lane0`}
                              className="p-2 text-center flex items-center justify-center"
                              style={{
                                gridRow: "1 / 3",
                                background: "rgba(249, 250, 251, 0.6)",
                                borderRight: colIndex < timeLabels.length - 1 ? "1px solid #e5e7eb" : "none",
                              }}
                            >
                              –
                            </div>
                          );
                        }

                        if (slot.status === "off") {
                          return (
                            <div
                              key={`${day.date}-${timeLabel}-lane0`}
                              className="p-2 text-center text-gray-400 flex items-center justify-center"
                              style={{
                                gridRow: "1 / 3",
                                background: "rgba(243, 244, 246, 0.7)",
                                borderRight: colIndex < timeLabels.length - 1 ? "1px solid #e5e7eb" : "none",
                              }}
                            >
                              -
                            </div>
                          );
                        }

                        // Render each lane separately
                        return (
                          <React.Fragment key={`${day.date}-${timeLabel}`}>
                            <div
                              className="p-1 border-b border-b-gray-200"
                              style={{
                                gridRow: "1",
                                background: slot.status === "booked"
                                  ? "rgba(254, 242, 242, 0.7)"
                                  : "rgba(236, 253, 243, 0.7)",
                                borderRight: colIndex < timeLabels.length - 1 ? "1px solid #e5e7eb" : "none",
                                cursor: followUpBooking ? "not-allowed" : "pointer",
                              }}
                              onClick={() => {
                                if (slot.status === "booked") {
                                  handleBookedSlotClick(slot.appointmentIds || [], day.date, timeLabel, slot.start);
                                } else {
                                  handleSlotSelection(slot.start);
                                }
                              }}
                            />
                            <div
                              className="p-1"
                              style={{
                                gridRow: "2",
                                background: slot.status === "booked"
                                  ? "rgba(254, 242, 242, 0.7)"
                                  : "rgba(236, 253, 243, 0.7)",
                                borderRight: colIndex < timeLabels.length - 1 ? "1px solid #e5e7eb" : "none",
                                cursor: followUpBooking ? "not-allowed" : "pointer",
                              }}
                              onClick={() => {
                                if (slot.status === "booked") {
                                  handleBookedSlotClick(slot.appointmentIds || [], day.date, timeLabel, slot.start);
                                } else {
                                  handleSlotSelection(slot.start);
                                }
                              }}
                            />
                          </React.Fragment>
                        );
                      })}
                    </div>

                    {/* Appointment blocks layer (absolute positioned) */}
                    <div
                      className="absolute inset-0 grid pointer-events-none"
                      style={{
                        gridTemplateColumns: `repeat(${timeLabels.length}, ${COL_WIDTH}px)`,
                        gridTemplateRows: "repeat(2, 40px)",
                      }}
                    >
                      {appointments.map((apt) => {
                        const startCol = getStartCol(apt);
                        if (startCol === -1) return null; // appointment start not in visible range
                        
                        const colSpan = getColSpan(apt);
                        const lane = lanes.get(apt.id) ?? DEFAULT_LANE;
                        const gridRow = lane === 0 ? "1" : "2";
                        
                        return (
                          <div
                            key={apt.id}
                            className="m-0.5 px-2 py-1 text-[11px] font-semibold text-red-800 overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer pointer-events-auto flex items-center"
                            style={{
                              gridColumn: `${startCol + 1} / span ${colSpan}`,
                              gridRow: gridRow,
                              background: "rgba(254, 202, 202, 0.95)",
                              border: "1px solid #fca5a5",
                              borderRadius: BLOCK_BORDER_RADIUS,
                            }}
                            title={`${nameOnly(formatGridShortLabel(apt)) || "Захиалга"} (${getHmFromIso(apt.scheduledAt)} - ${apt.endAt ? getHmFromIso(apt.endAt) : "—"})`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBookedSlotClick([apt.id], day.date, getHmFromIso(apt.scheduledAt), apt.scheduledAt);
                            }}
                          >
                            {nameOnly(formatGridShortLabel(apt)) || "Захиалга"}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="mt-4 p-3 rounded-lg border border-gray-200 bg-gray-50">
      <div className="flex items-center gap-2 mb-1.5">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={showFollowUpScheduler}
            disabled={followUpLoading}
            onChange={(e) => onToggleScheduler(e.target.checked)}
          />
          <span>Давтан үзлэгийн цаг авах</span>
        </label>

        {followUpLoading && (
          <span className="text-xs text-gray-500">
            (ачаалж байна...)
          </span>
        )}

        {followUpError && (
          <span className="text-xs text-red-700">
            {followUpError}
          </span>
        )}

        {followUpSuccess && (
          <span className="text-xs text-green-600">
            {followUpSuccess}
          </span>
        )}
      </div>

      {showFollowUpScheduler && (
        <>
          <div className="flex flex-wrap gap-3 mb-3 text-[13px] items-center">
            <div className="flex gap-1 items-center">
              <label>Эхлэх:</label>
              <input
                type="date"
                value={followUpDateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                className="px-1.5 py-1 rounded-md border border-gray-300 text-xs"
              />
            </div>

            <div className="flex gap-1 items-center">
              <label>Дуусах:</label>
              <input
                type="date"
                value={followUpDateTo}
                onChange={(e) => onDateToChange(e.target.value)}
                className="px-1.5 py-1 rounded-md border border-gray-300 text-xs"
              />
            </div>

            <div className="flex gap-1 items-center">
              <label>Нэг цагийн үргэлжлэх хугацаа:</label>
              <select
                value={followUpSlotMinutes}
                onChange={(e) => onSlotMinutesChange(Number(e.target.value))}
                className="px-1.5 py-1 rounded-md border border-gray-300 text-xs"
              >
                <option value={30}>30 минут</option>
                <option value={60}>60 минут</option>
                <option value={90}>90 минут</option>
                <option value={120}>120 минут</option>
              </select>
            </div>
          </div>

          {followUpNoSchedule && (
            <div className="p-3 rounded-lg border border-yellow-200 bg-yellow-50 text-yellow-800 text-[13px] mb-3">
              <div className="font-bold mb-1.5">
                Эмчийн цагийн хуваарь тохируулаагүй байна
              </div>
              <div className="text-xs">Давтан үзлэгийн цагийг гарын авлагаар оруулна уу.</div>

              {/* Quick Create */}
              <div className="flex gap-2.5 mt-2.5 justify-between">
                <input
                  type="date"
                  value={quickDate}
                  onChange={(e) => setQuickDate(e.target.value)}
                  className="p-2 border border-gray-300 rounded-md"
                />
                <input
                  type="time"
                  value={quickTime}
                  onChange={(e) => setQuickTime(e.target.value)}
                  className="p-2 border border-gray-300 rounded-md"
                />
                <select
                  value={quickDuration}
                  onChange={(e) => setQuickDuration(Number(e.target.value))}
                  className="p-2 border border-gray-300 rounded-md"
                >
                  <option value={30}>30 минут</option>
                  <option value={60}>60 минут</option>
                  <option value={90}>90 минут</option>
                  <option value={120}>120 минут</option>
                </select>
                <button
                  type="button"
                  disabled={followUpBooking || !onQuickCreate}
                  onClick={() =>
                    onQuickCreate?.({ date: quickDate, time: quickTime, durationMinutes: quickDuration })
                  }
                  className={`px-3 py-2 rounded-md bg-blue-600 border border-blue-600 text-white font-medium ${followUpBooking ? "cursor-not-allowed" : "cursor-pointer"}`}
                >
                  Гараар цаг үүсгэх
                </button>
              </div>
            </div>
          )}

          {localAvailability && localAvailability.days.length > 0 && renderGrid()}
        </>
      )}
      {/* Render Details Modal */}
      {detailsOpen && (
  <div
    className="fixed inset-0 bg-black/50 flex justify-center items-center z-[1000]"
    onClick={() => setDetailsOpen(false)}
  >
    <div
      className="min-w-[450px] max-w-[600px] p-6 bg-white rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.2)]"
      onClick={(e) => e.stopPropagation()}
    >
      <h3 className="mt-0 mb-3 text-lg font-semibold">
        Захиалсан цаг - {detailsDate} {detailsTime}
      </h3>

      {/* Occupancy indicator */}
      <div className={`px-3 py-2 rounded-lg mb-4 text-sm font-medium ${detailsAppointments.length >= 2 ? "bg-red-100 text-red-800" : "bg-green-50 text-green-800"}`}>
        Дүүргэлт: {detailsAppointments.length}/2
      </div>

      {/* List existing appointments */}
      <div className="mb-4">
        {detailsAppointments.length === 0 ? (
          <div className="p-3 bg-gray-50 rounded-lg text-gray-500 text-sm">
            Энэ цагт захиалга байхгүй байна
          </div>
        ) : (
          detailsAppointments.map((a, idx) => (
            <div
              key={a.id}
              className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
            >
              <div className="flex justify-between items-center mb-1">
                <div className="font-semibold">
                  Захиалга #{idx + 1}
                </div>
                {canDeleteAppointment(a) && (
                  <button
                    type="button"
                    disabled={deletingAppointmentId === a.id}
                    onClick={() => handleDeleteAppointment(a.id)}
                    className={`px-3 py-1 rounded text-xs font-medium text-white bg-red-500 border border-red-600 ${deletingAppointmentId === a.id ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                  >
                    {deletingAppointmentId === a.id ? "Устгаж байна..." : "Устгах"}
                  </button>
                )}
              </div>
              <p className="my-1 text-sm">
                Үйлчлүүлэгч: <strong>{formatGridShortLabel(a) || "-"}</strong>
              </p>
              <p className="my-1 text-sm text-gray-500">
                Салбар: <strong>{a.branch?.name || "-"}</strong>
              </p>
              <p className="my-1 text-sm text-gray-500">
                Хугацаа: {getHmFromIso(a.scheduledAt)} - {a.endAt ? getHmFromIso(a.endAt) : "—"}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 justify-end">
        {canAddAppointment && (
          <button
            type="button"
            disabled={followUpBooking}
            onClick={() => {
              setDetailsOpen(false);
              setSlotModalOpen(true);
              setSelectedSlot(detailsSlotStart);
            }}
            className={`px-4 py-2.5 rounded-md bg-green-600 border border-green-600 text-white font-medium text-sm ${followUpBooking ? "cursor-not-allowed" : "cursor-pointer"}`}
          >
            + Шинэ цаг оруулах
          </button>
        )}
        <button
          className="px-4 py-2.5 rounded-md bg-gray-200 text-gray-700 border border-gray-300 cursor-pointer font-medium text-sm"
          onClick={() => setDetailsOpen(false)}
        >
          Хаах
        </button>
      </div>
    </div>
  </div>
)}

      {/* Duration Selection Modal */}
      {slotModalOpen && (
  <div
    className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
    onClick={() => {
      setSlotModalOpen(false);
      setSelectedSlot("");
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      className="min-w-[400px] p-6 bg-white rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.2)]"
    >
      <h3 className="mt-0 mb-4 text-lg font-semibold">
        Цагийн үргэлжлэх хугацаа сонгох
      </h3>
      <p className="text-sm">Цаг: {selectedSlot ? getHmFromIso(selectedSlot) : ""}</p>
      <div className="grid grid-cols-2 gap-2 my-4">
        {[30, 60, 90, 120].map((duration) => (
          <button
            key={duration}
            onClick={() => handleDurationSelect(duration)}
            disabled={followUpBooking}
            className={`p-3 rounded-md bg-green-50 border border-green-600 text-green-700 font-medium text-sm ${followUpBooking ? "cursor-not-allowed" : "cursor-pointer"}`}
          >
            {duration} минут
          </button>
        ))}
      </div>
      <button
        className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 border border-gray-300 cursor-pointer font-medium"
        onClick={() => {
          setSlotModalOpen(false);
          setSelectedSlot("");
        }}
      >
        Болих
      </button>
    </div>
  </div>
)}
    </div>
  );
}
