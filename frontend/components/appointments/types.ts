// Local types for appointments page

export type Branch = {
  id: number;
  name: string;
};

export type Doctor = {
  id: number;
  name: string | null;
  ovog: string | null;
  regNo: string | null;
  phone: string | null;
  calendarOrder?: number | null;
};

export type ScheduledDoctor = Doctor & {
  schedules?: DoctorScheduleDay[];
};

export type PatientLite = {
  id: number;
  regNo: string | null;
  name: string;
  phone: string | null;
  // allow optional extra fields we attach
  ovog?: string | null;
  patientBook?: any;
};

export type Appointment = {
  id: number;
  branchId: number;
  doctorId: number | null;
  patientId: number | null;
  patientName: string | null;
  patientOvog?: string | null;
  patientRegNo: string | null;
  patientPhone: string | null;
  doctorName: string | null;
  doctorOvog: string | null;
  scheduledAt: string;
  endAt: string | null;
  status: string;
  notes: string | null;
  // Audit metadata
  createdAt?: string | null;
  updatedAt?: string | null;
  createdByUserId?: number | null;
  updatedByUserId?: number | null;
  createdByUser?: { id: number; name: string | null; ovog: string | null } | null;
  updatedByUser?: { id: number; name: string | null; ovog: string | null } | null;
  patient?: {
    id: number;
    name: string;
    ovog?: string | null;
    regNo?: string | null;
    phone?: string | null;
    patientBook?: { bookNumber?: string | null } | null;
    [key: string]: any;
  } | null;
  branch?: { id: number; name: string } | null;
};

export type DoctorScheduleDay = {
  doctorId: number;
  branchId: number;
  date: string; // yyyy-mm-dd
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
};

export type TimeSlot = {
  start: Date;
  end: Date;
  label: string;
};

export type CompletedHistoryItem = {
  id: number;
  scheduledAt: string;
  doctor: { id: number; ovog: string | null; name: string | null } | null;
};
