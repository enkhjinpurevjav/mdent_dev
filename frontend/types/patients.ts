// Type definitions for patient profile page

import type { VisitCard } from './visitCard';

export type Branch = {
  id: number;
  name: string;
  address?: string | null;
};

export type Patient = {
  id: number;
  regNo: string;
  ovog?: string | null;
  name: string;
  gender?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  workPlace?: string | null;
  bloodType?: string | null;
  citizenship?: string | null;
  emergencyPhone?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  branchId: number;
  branch?: Branch;
};

export type ActiveTab =
  | "profile"
  | "appointments"
  | "patient_history"
  | "visit_card"
  | "history"
  | "billing"
  | "ortho_card";

export type PatientBook = {
  id: number;
  bookNumber: string;
};

export type Encounter = {
  id: number;
  visitDate: string;
  notes?: string | null;
};

export type Appointment = {
  id: number;
  patientId: number;
  doctorId?: number | null;
  branchId: number;
  scheduledAt: string;
  status: string;
  notes?: string | null;
  branch?: {
    id: number;
    name: string;
  } | null;
  doctor?: {
    id: number;
    name?: string | null;
    ovog?: string | null;
  } | null;
};

export type PatientProfileResponse = {
  patient: Patient;
  patientBook: PatientBook;
  patientBalance?: number;
  encounters: Encounter[];
  appointments: Appointment[];
  visitCard?: VisitCard | null;
};
