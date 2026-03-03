import React, { useState } from "react";
import type { Appointment, Branch } from "../appointments/types";
import { formatStatus } from "../appointments/formatters";
import { formatDateYmdDots } from "../appointments/formatters";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { Field } from "../ui/Field";

type PatientField = {
  name?: string | null;
  ovog?: string | null;
  phone?: string | null;
  patientBook?: { bookNumber?: string | number | null } | null;
};

// Status color mapping for the left border accent
function getStatusAccent(status: string): string {
  switch (status) {
    case "booked":
      return "border-l-blue-400";
    case "confirmed":
      return "border-l-indigo-500";
    case "online":
      return "border-l-purple-400";
    case "ongoing":
      return "border-l-yellow-400";
    case "imaging":
      return "border-l-cyan-400";
    case "ready_to_pay":
      return "border-l-orange-400";
    case "partial_paid":
      return "border-l-amber-400";
    case "completed":
      return "border-l-green-500";
    case "no_show":
      return "border-l-gray-400";
    case "cancelled":
      return "border-l-red-400";
    default:
      return "border-l-gray-300";
  }
}

function formatPatientTitle(a: Appointment): string {
  const p = a.patient as PatientField | null | undefined;
  const rawName = (p?.name ?? a.patientName ?? "").toString().trim();
  const rawOvog = (p?.ovog ?? a.patientOvog ?? "").toString().trim();

  if (!rawName && !rawOvog) return "—";
  if (rawOvog) {
    const initial = rawOvog.charAt(0).toUpperCase();
    return `${initial}. ${rawName}`;
  }
  return rawName;
}

function formatStartTime(scheduledAt: string): string {
  const d = new Date(scheduledAt);
  if (Number.isNaN(d.getTime())) return "";
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function formatBookAndPhone(a: Appointment): string {
  const p = a.patient as PatientField | null | undefined;
  const bookNumber =
    p?.patientBook?.bookNumber != null
      ? `№${String(p.patientBook.bookNumber)}`
      : null;
  const phone = p?.phone ?? a.patientPhone ?? null;

  if (bookNumber && phone) return `${bookNumber} • ${phone}`;
  if (bookNumber) return bookNumber;
  if (phone) return phone;
  return "";
}

export type AgendaViewProps = {
  filterDate: string;
  setFilterDate: (d: string) => void;
  dayAppointments: Appointment[];
  branches: Branch[];
  filterBranchId: string;
  isLocked: boolean;
  effectiveBranchId: string;
  onBranchChange: (branchId: string) => void;
  unlock: () => void;
  onAppointmentClick?: (a: Appointment) => void;
};

export default function AgendaView({
  filterDate,
  setFilterDate,
  dayAppointments,
  branches,
  filterBranchId,
  isLocked,
  effectiveBranchId,
  onBranchChange,
  unlock,
  onAppointmentClick,
}: AgendaViewProps) {
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const selectedDay = (() => {
    const d = new Date(filterDate + "T00:00:00");
    return Number.isNaN(d.getTime()) ? new Date() : d;
  })();

  const sorted = [...dayAppointments].sort((a, b) => {
    return (
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );
  });

  return (
    <div className="flex flex-col">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between bg-white px-4 py-3 shadow-sm border-b border-gray-200">
        <div>
          <div className="text-sm font-semibold text-gray-800">
            {formatDateYmdDots(selectedDay)}
          </div>
          <div className="text-xs text-gray-500">
            {sorted.length} захиалга
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFilterDrawerOpen(true)}
        >
          ⚙ Шүүлт
        </Button>
      </div>

      {/* Agenda list */}
      <div className="divide-y divide-gray-100 px-3 py-2">
        {sorted.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            Энэ өдөрт захиалга байхгүй байна
          </div>
        ) : (
          sorted.map((a) => {
            const accent = getStatusAccent(a.status);
            const title = formatPatientTitle(a);
            const time = formatStartTime(a.scheduledAt);
            const secondary = formatBookAndPhone(a);

            return (
              <div
                key={a.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border-l-4 bg-white px-3 py-3 my-1 shadow-sm hover:bg-gray-50 active:bg-gray-100 ${accent}`}
                onClick={() => onAppointmentClick?.(a)}
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-900">
                    {title}
                  </div>
                  {secondary ? (
                    <div className="mt-0.5 truncate text-xs text-gray-500">
                      {secondary}
                    </div>
                  ) : null}
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-sm font-medium text-gray-700">
                    {time}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-400">
                    {formatStatus(a.status)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Filter Drawer */}
      <Drawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        title="Шүүлт"
      >
        <div className="flex flex-col gap-4">
          <Field label="Огноо">
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </Field>

          <Field
            label={
              isLocked
                ? "Салбар 🔒 (Түгжээтэй)"
                : "Салбар"
            }
          >
            <div className="flex gap-2">
              <select
                value={effectiveBranchId || filterBranchId}
                onChange={(e) => onBranchChange(e.target.value)}
                disabled={isLocked}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:opacity-60"
              >
                <option value="">Бүх салбар</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {isLocked && (
                <Button variant="danger" size="sm" onClick={unlock}>
                  🔓 Суллах
                </Button>
              )}
            </div>
          </Field>

          <Button
            variant="primary"
            className="w-full justify-center"
            onClick={() => setFilterDrawerOpen(false)}
          >
            Хаах
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
