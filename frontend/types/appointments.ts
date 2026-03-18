export type AppointmentStatus =
  // Frontend (filters often use uppercase)
  | "BOOKED"
  | "CONFIRMED"
  | "ONLINE"
  | "ONGOING"
  | "IMAGING"
  | "READY_TO_PAY"
  | "PARTIAL_PAID"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW"
  | "OTHER"
  // Backend DB values (returned by API)
  | "booked"
  | "confirmed"
  | "online"
  | "ongoing"
  | "imaging"
  | "ready_to_pay"
  | "partial_paid"
  | "completed"
  | "cancelled"
  | "no_show"
  | "other";

export type AppointmentRow = {
  id: number;

  // legacy fields used by visits pages
  patientName?: string | null;
  regNo?: string | null;
  branchName?: string | null;
  doctorName?: string | null;
  status: AppointmentStatus;
  startTime?: string | null; // ISO
  endTime?: string | null;   // ISO

  // new extra fields used by your new UI
  patientOvog?: string | null;
  patientPhone?: string | null;
  doctorOvog?: string | null;

  // naive local timestamps "YYYY-MM-DD HH:mm:ss" (Mongolia wall time, no TZ offset)
  scheduledAt?: string | null;
  endAt?: string | null;
};

export type AppointmentFilters = {
  dateFrom: string;
  dateTo: string;
  status?: AppointmentStatus | "ALL";
  branchId?: string;
  search?: string;
  includeCancelled?: boolean;
};
