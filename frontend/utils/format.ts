// Formatting utilities for patient profile page

import type { Patient } from '../types/patients';

export function formatDateTime(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

export function formatDate(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

export function displayOrDash(value?: string | null) {
  if (value === undefined || value === null) return "-";
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return "-";
  return trimmed;
}

export function formatDisplayName(patient: Patient) {
  const name = patient.name || "";
  const ovog = (patient.ovog || "").trim();
  if (ovog) {
    const first = ovog.charAt(0).toUpperCase();
    return `${first}.${name}`;
  }
  return name;
}

export function formatDoctorName(doctor?: { name?: string | null; ovog?: string | null } | null) {
  if (!doctor) return "-";
  const name = (doctor.name || "").trim();
  const ovog = (doctor.ovog || "").trim();
  if (ovog && name) {
    const first = ovog.charAt(0).toUpperCase();
    return `${first}. ${name}`;
  }
  return name || ovog || "-";
}
