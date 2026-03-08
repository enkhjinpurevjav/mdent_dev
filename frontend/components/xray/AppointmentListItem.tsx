import React from "react";
import type { AppointmentRow } from "../../types/appointments";
import { StatusBadge } from "./StatusBadge";

type XrayAppointment = AppointmentRow & {
  branchId?: number;
  scheduledAt?: string | null;
  patientRegNo?: string | null;
};

type Props = {
  appt: XrayAppointment;
  selected: boolean;
  formatDateTime: (appt: XrayAppointment) => string;
  getRegNo: (appt: XrayAppointment) => string;
  onClick: (appt: XrayAppointment) => void;
};

export function AppointmentListItem({
  appt,
  selected,
  formatDateTime,
  getRegNo,
  onClick,
}: Props) {
  return (
    <div
      onClick={() => onClick(appt)}
      className={`px-3 py-3 border-b border-gray-200 cursor-pointer transition-colors ${
        selected ? "bg-blue-50" : "bg-white hover:bg-gray-50"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className="text-sm font-medium text-gray-900 truncate mr-2"
          title={appt.patientName}
        >
          {appt.patientName}
        </span>
        <StatusBadge status={appt.status} />
      </div>
      <div className="text-xs text-gray-500">РД: {getRegNo(appt)}</div>
      <div className="text-xs text-gray-500">Эмч: {appt.doctorName || "—"}</div>
      <div className="text-xs text-gray-500">Огноо: {formatDateTime(appt)}</div>
    </div>
  );
}
