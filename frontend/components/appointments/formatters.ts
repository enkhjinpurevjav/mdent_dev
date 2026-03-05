// Formatting helpers for appointments

import type { Doctor, Appointment, PatientLite, CompletedHistoryItem } from "./types";
import { pad2, getSlotTimeString } from "./time";

/** Convert a CompletedHistoryItem doctor object to a full Doctor for use with formatDoctorName. */
export function historyDoctorToDoctor(d: CompletedHistoryItem["doctor"]): Doctor | null {
  if (!d) return null;
  return { id: d.id, name: d.name ?? null, ovog: d.ovog ?? null, regNo: null, phone: null };
}

export function formatDoctorName(d?: Doctor | null) {
  if (!d) return "";
  const name = (d.name || "").trim();
  const ovog = (d.ovog || "").trim();
  if (!name && !ovog) return "";

  if (ovog) {
    const first = ovog.charAt(0).toUpperCase();
    return `${first}.${name}`;
  }
  return name;
}

export function formatPatientLabel(
  p?: { name: string; regNo?: string | null; phone?: string | null } | null,
  id?: number
) {
  if (!p) return id ? `#${id}` : "";
  const parts = [p.name];
  if (p.regNo) parts.push(`(${p.regNo})`);
  if (p.phone) parts.push(`📞 ${p.phone}`);
  return parts.join(" ");
}

export function formatGridShortLabel(a: Appointment): string {
  const p = a.patient as any;

  const rawName = (p?.name ?? a.patientName ?? "").toString().trim();
  const rawOvog = (p?.ovog ?? a.patientOvog ?? "").toString().trim();

  const rawBookNumber =
    p?.patientBook?.bookNumber != null
      ? String(p.patientBook.bookNumber).trim()
      : "";

  let displayName = rawName;
  if (rawOvog) {
    const first = rawOvog.charAt(0).toUpperCase();
    displayName = `${first}.${rawName}`;
  }

  if (!displayName) return "";

  if (rawBookNumber) {
    return `${displayName} (${rawBookNumber})`;
  }

  return displayName;
}

export function formatPatientSearchLabel(p: PatientLite): string {
  const parts: string[] = [];

  // Ovog + name
  const name = (p.name || "").toString().trim();
  const ovog = (p.ovog || "").toString().trim();

  if (ovog && name) {
    parts.push(`${ovog} ${name}`);
  } else if (name) {
    parts.push(name);
  } else if (ovog) {
    parts.push(ovog);
  }

  // RegNo
  if (p.regNo) parts.push(`(${p.regNo})`);

  // Phone
  if (p.phone) parts.push(`📞 ${p.phone}`);

  // Patient book number, if present
  const bookNumber =
    p.patientBook && p.patientBook.bookNumber != null
      ? String(p.patientBook.bookNumber)
      : "";
  if (bookNumber) parts.push(`#${bookNumber}`);

  return parts.join(" ");
}

export function formatDateYmdDots(date: Date): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}.${m}.${d}`;
}

/** Format an ISO scheduledAt string as YYYY/MM/DD for completed visit history display. */
export function formatHistoryDate(scheduledAt: string): string {
  const d = new Date(scheduledAt);
  if (Number.isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}/${m}/${day}`;
}

export function formatStatus(status: string): string {
  switch (status) {
    case "booked":
      return "Захиалсан";
    case "confirmed":
      return "Баталгаажсан";
    case "online":
      return "Онлайн";
    case "ongoing":
      return "Явж байна";
    case "imaging":
      return "Зураг";
    case "ready_to_pay":
      return "Төлбөр төлөх";
    case "partial_paid":
      return "Үлдэгдэлтэй";
    case "completed":
      return "Дууссан";
    case "no_show":
      return "Ирээгүй";
    case "cancelled":
      return "Цуцалсан";
    case "other":
      return "Бусад";
    default:
      return status;
  }
}

export function formatDetailedTimeRange(start: Date, end: Date | null): string {
  if (Number.isNaN(start.getTime())) return "-";

  const datePart = formatDateYmdDots(start);
  const startTime = start.toLocaleTimeString("mn-MN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (!end || Number.isNaN(end.getTime())) {
    return `${datePart} ${startTime}`;
  }

  const endTime = end.toLocaleTimeString("mn-MN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${datePart} ${startTime} – ${endTime}`;
}
