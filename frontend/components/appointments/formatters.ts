// Formatting helpers for appointments

import type { Doctor, Appointment, PatientLite, CompletedHistoryItem } from "./types";
import { pad2 } from "./time";
import {
  parseNaiveTimestamp,
  naiveTimestampToYmd,
  naiveTimestampToHm,
} from "../../utils/businessTime";

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

/** Format a fake-UTC Date as YYYY.MM.DD using UTC components. */
export function formatDateYmdDots(date: Date): string {
  const y = date.getUTCFullYear();
  const m = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  return `${y}.${m}.${d}`;
}

/**
 * Format an ISO audit timestamp (createdAt/updatedAt) as YYYY/MM/DD HH:MM.
 * These fields remain as ISO strings; Mongolia time is applied via Intl.
 */
export function formatAuditDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

/** Format an audit user object as О.Нэр, or "-" if missing. */
export function formatAuditUserName(
  u?: { name: string | null; ovog: string | null } | null
): string {
  if (!u) return "-";
  const name = (u.name || "").trim();
  const ovog = (u.ovog || "").trim();
  if (!name && !ovog) return "-";
  if (ovog && name) return `${ovog.charAt(0).toUpperCase()}.${name}`;
  return name || "-";
}

/**
 * Format a naive scheduledAt string ("YYYY-MM-DD HH:mm:ss") as YYYY/MM/DD
 * for completed visit history display.
 * Timezone-safe: reads the date portion directly from the naive string.
 */
export function formatHistoryDate(scheduledAt: string): string {
  const ymd = naiveTimestampToYmd(scheduledAt);
  if (!ymd || ymd.length < 10) return "-";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return "-";
  return `${y}/${m}/${d}`;
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

/**
 * Format naive scheduledAt/endAt strings as a detailed time range
 * "YYYY.MM.DD HH:MM [– HH:MM]".
 * Timezone-safe: reads components from the naive strings directly.
 */
export function formatDetailedTimeRange(
  startNaive: string,
  endNaive: string | null | undefined
): string {
  const startParsed = parseNaiveTimestamp(startNaive);
  if (!startParsed) return "-";

  const [sy, sm, sd] = startParsed.ymd.split("-");
  const datePart = `${sy}.${sm}.${sd}`;
  const startTime = startParsed.hm;

  if (!endNaive) return `${datePart} ${startTime}`;

  const endParsed = parseNaiveTimestamp(endNaive);
  if (!endParsed) return `${datePart} ${startTime}`;

  return `${datePart} ${startTime} – ${endParsed.hm}`;
}
