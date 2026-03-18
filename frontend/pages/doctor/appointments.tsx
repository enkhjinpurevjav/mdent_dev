import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import AppointmentDetailsModal from "../../components/appointments/AppointmentDetailsModal";
import type { Appointment } from "../../components/appointments/types";
import {
  getBusinessYmd,
  naiveTimestampToHm,
  naiveTimestampToYmd,
} from "../../utils/businessTime";

type DoctorMeResponse = {
  user?: { id: number; role?: string } | null;
};

type DoctorScheduleDay = {
  id: number;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  note?: string | null;
  branch?: { id: number; name: string } | null;
};

type DoctorAppointment = {
  id: number;
  patientId?: number | null;
  branchId?: number | null;
  doctorId?: number | null;
  scheduledAt: string; // naive timestamp "YYYY-MM-DD HH:mm:ss"
  endAt?: string | null; // naive timestamp "YYYY-MM-DD HH:mm:ss"
  status: string;
  notes?: string | null;

  // doctor API currently returns these flattened
  patientName?: string | null;
  patientOvog?: string | null;
  patientBookNumber?: string | null;
  branchName?: string | null;

  // some endpoints might also include encounterId
  encounterId?: number | null;

  // audit fields
  createdAt?: string | null;
  updatedAt?: string | null;
  createdByUser?: { id: number; name: string | null; ovog: string | null } | null;
  updatedByUser?: { id: number; name: string | null; ovog: string | null } | null;
};

type Grouped = { date: string; items: DoctorAppointment[] };

function ymdToday(): string {
  // Use Mongolia business timezone, not browser local
  return getBusinessYmd();
}

function addDaysYmd(ymd: string, days: number): string {
  // Use fake-UTC Date to avoid local timezone issues
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function isWeekendYmd(ymd: string): boolean {
  // Use fake-UTC Date so weekday is computed from the ymd value itself, not local TZ
  const d = new Date(ymd + "T00:00:00Z");
  const w = d.getUTCDay();
  return w === 0 || w === 6;
}

function defaultClinicHours(ymd: string) {
  if (isWeekendYmd(ymd)) return { startTime: "10:00", endTime: "19:00" };
  return { startTime: "09:00", endTime: "21:00" };
}

function isoToLocalHHMM(naive: string | null | undefined): string {
  // naive is now a "YYYY-MM-DD HH:mm:ss" string — extract HH:mm directly
  return naiveTimestampToHm(naive ?? "");
}

function isoToYmd(naive: string | null | undefined): string {
  // naive is now a "YYYY-MM-DD HH:mm:ss" string — extract YYYY-MM-DD directly
  return naiveTimestampToYmd(naive ?? "");
}

function minutesFromHHMM(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function buildSlots(startMin: number, endMin: number): string[] {
  const slots: string[] = [];
  for (let m = startMin; m <= endMin; m += 30) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "ongoing":
      return "#16a34a"; // green
    case "completed":
      return "#22c55e";
    case "confirmed":
      return "#3b82f6";
    case "online":
      return "#6366f1"; // indigo
    case "imaging":
      return "#8b5cf6"; // purple
    case "ready_to_pay":
      return "#fbbf24"; // amber
    case "partial_paid":
      return "#eab308"; // yellow
    case "no_show":
      return "#ef4444"; // red
    case "cancelled":
      return "#dc2626"; // dark red
    case "other":
      return "#94a3b8"; // gray
    default:
      return "#cbd5f5"; // booked
  }
}



function formatPatient(a: DoctorAppointment): string {
  const n = (a.patientName || "").trim();
  const o = (a.patientOvog || "").trim();
  if (o && n) return `${o.charAt(0).toUpperCase()}.${n}`;
  if (n) return n;
  if (o) return o;
  return a.patientBookNumber ? `#${a.patientBookNumber}` : "—";
}

const SLOT_PX = 60;
const MINUTES_PER_SLOT = 30;

function formatMnt(amount: number): string {
  return new Intl.NumberFormat("en-US").format(amount) + " ₮";
}

function formatSalesValue(
  salesLoading: boolean,
  salesError: boolean,
  salesSummary: { todayTotal: number; monthTotal: number } | null,
  field: "todayTotal" | "monthTotal"
): string {
  if (salesLoading) return "...";
  if (salesError || !salesSummary) return "—";
  return formatMnt(salesSummary[field]);
}

function formatStatusShort(status: string): string {
  switch (status) {
    case "booked": return "Захиал.";
    case "confirmed": return "Батал.";
    case "ongoing": return "Эхэл.";
    case "completed": return "Дуус.";
    case "cancelled": return "Цуц.";
    case "no_show": return "Ирээгүй";
    case "ready_to_pay": return "Төлбөр";
    case "partial_paid": return "Үлд.";
    case "imaging": return "Зураг";
    case "online": return "Цахим";
    case "other": return "Бусад";
    default: return "Төлөв";
  }
}

function groupByDate(appts: DoctorAppointment[]): Grouped[] {
  const map: Record<string, DoctorAppointment[]> = {};
  for (const a of appts) {
    const key = isoToYmd(a.scheduledAt);
    if (!key) continue;
    if (!map[key]) map[key] = [];
    map[key].push(a);
  }

  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      items: items.sort((x, y) =>
        (x.scheduledAt ?? "").localeCompare(y.scheduledAt ?? "")
      ),
    }));
}

function formatDateLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    const todayStr = ymdToday();
    if (dateStr === todayStr) return "Өнөөдөр";
    return d.toLocaleDateString("mn-MN", {
      month: "short",
      day: "numeric",
      weekday: "short",
    });
  } catch {
    return dateStr;
  }
}

function doctorApptToModalAppt(a: DoctorAppointment): Appointment {
  return {
    id: a.id,
    patientId: a.patientId ?? null,
    doctorId: a.doctorId ?? null,
    branchId: (a.branchId ?? 0) as number,
    scheduledAt: a.scheduledAt,
    endAt: a.endAt ?? null,
    status: a.status,
    notes: a.notes ?? null,
    patient: {
      id: a.patientId ?? 0,
      name: a.patientName ?? "",
      ovog: a.patientOvog ?? null,
      phone: null,
      patientBook: a.patientBookNumber ? { bookNumber: a.patientBookNumber } : null,
    },
    branch: a.branchName ? { id: (a.branchId ?? 0) as number, name: a.branchName } : null,
    doctorName: null,
    doctorOvog: null,
    patientName: a.patientName ?? null,
    patientOvog: a.patientOvog ?? null,
    patientPhone: null,
    patientRegNo: null,
    createdAt: a.createdAt ?? null,
    updatedAt: a.updatedAt ?? null,
    createdByUser: a.createdByUser ?? null,
    updatedByUser: a.updatedByUser ?? null,
  } as unknown as Appointment;
}

export default function DoctorAppointmentsPage() {
  const router = useRouter();

  const today = useMemo(() => ymdToday(), []);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDaysYmd(today, 7));

  const [doctorId, setDoctorId] = useState<number | null>(null);

  const [appointments, setAppointments] = useState<DoctorAppointment[]>([]);
  const [scheduleRange, setScheduleRange] = useState<DoctorScheduleDay[]>([]);
  const [scheduleToday, setScheduleToday] = useState<DoctorScheduleDay | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // manual refresh button behavior like admin
  const [refreshKey, setRefreshKey] = useState(0);

  // mobile filter panel toggle (< lg)
  const [showMobileFilter, setShowMobileFilter] = useState(false);

  // modal state for appointment details
  const [detailsModal, setDetailsModal] = useState<{
    open: boolean;
    appointment: DoctorAppointment | null;
  }>({ open: false, appointment: null });

  // sales summary state
  const [salesSummary, setSalesSummary] = useState<{ todayTotal: number; monthTotal: number } | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState(false);

  // ---- SSE live indicator ----
  const [sseStatus, setSseStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [lastSseEventAt, setLastSseEventAt] = useState<Date | null>(null);

  // ---- load me once ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        const data = (await res.json().catch(() => null)) as
          | DoctorMeResponse
          | null;
        const id = data?.user?.id;
        if (!res.ok || !id) throw new Error("Auth failed");
        if (!cancelled) setDoctorId(id);
      } catch {
        if (!cancelled) setDoctorId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- load sales summary once doctorId is known ----
  useEffect(() => {
    if (!doctorId) return;
    let cancelled = false;
    setSalesLoading(true);
    setSalesError(false);
    (async () => {
      try {
        const res = await fetch("/api/doctor/sales-summary", { credentials: "include" });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) throw new Error("Failed to fetch sales summary");
        if (!cancelled) setSalesSummary({ todayTotal: data.todayTotal || 0, monthTotal: data.monthTotal || 0 });
      } catch {
        if (!cancelled) setSalesError(true);
      } finally {
        if (!cancelled) setSalesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [doctorId]);

  // ---- fetch schedule once (not tied to range changes) ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/doctor/schedule", { credentials: "include" });
        const data = await res.json().catch(() => null);
        if (!cancelled && res.ok && Array.isArray(data)) {
          setScheduleRange(data);
        }
      } catch {
        // schedule fetch failure is non-fatal; scheduleToday stays null
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- derive scheduleToday from scheduleRange ----
  useEffect(() => {
    const todays = scheduleRange.filter((e) => e.date.split("T")[0] === today);
    if (todays.length === 0) {
      setScheduleToday(null);
      return;
    }
    const picked = todays.reduce((acc, s) => {
      if (!acc) return s;
      const accStart = minutesFromHHMM(acc.startTime);
      const accEnd = minutesFromHHMM(acc.endTime);
      const sStart = minutesFromHHMM(s.startTime);
      const sEnd = minutesFromHHMM(s.endTime);
      return {
        ...acc,
        startTime: sStart < accStart ? s.startTime : acc.startTime,
        endTime: sEnd > accEnd ? s.endTime : acc.endTime,
      };
    }, null as DoctorScheduleDay | null);
    setScheduleToday(picked);
  }, [scheduleRange, today]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      // appointments (range) — schedule is fetched separately
      const apptRes = await fetch(
        `/api/doctor/appointments?from=${from}&to=${to}`,
        {
          credentials: "include",
        }
      );
      const apptJson = await apptRes.json().catch(() => null);

      if (!apptRes.ok) {
        throw new Error(apptJson?.error || "Цагуудыг ачаалахад алдаа гарлаа.");
      }

      // doctor API might be array OR {appointments}
      const apptsRaw: DoctorAppointment[] = Array.isArray(apptJson)
        ? apptJson
        : Array.isArray(apptJson?.appointments)
          ? apptJson.appointments
          : [];

      const visible = apptsRaw.filter((a) => a?.status !== "cancelled");
      setAppointments(visible);
    } catch (e: any) {
      setError(e?.message || "Алдаа гарлаа");
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [doctorId, from, to]);

  useEffect(() => {
    loadAll();
  }, [loadAll, refreshKey]);

  // ---- SSE live refresh: when admin/reception changes appointments, reload ----
  useEffect(() => {
    if (!doctorId) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;
    let closed = false;

    const requestRefresh = () => {
      setSseStatus("connected");
      setLastSseEventAt(new Date());
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        setRefreshKey((k) => k + 1);
      }, 800);
    };

    function connect() {
      if (closed) return;
      setSseStatus("connecting");
      try {
        es = new EventSource(
          `/api/appointments/stream?date=${encodeURIComponent(ymdToday())}`
        );
      } catch {
        // EventSource construction failed; skip live updates
        return;
      }

      es.onopen = () => {
        setSseStatus("connected");
      };

      es.addEventListener("appointment_created", requestRefresh);
      es.addEventListener("appointment_updated", requestRefresh);
      es.addEventListener("appointment_deleted", requestRefresh);

      es.onerror = () => {
        if (closed) return;
        es?.close();
        es = null;
        setSseStatus("disconnected");
        retryTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      closed = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (retryTimeout) clearTimeout(retryTimeout);
      es?.close();
    };
  }, [doctorId]);

  const handleDoctorStartEncounter = useCallback(async (a: Appointment) => {
    const res = await fetch(`/api/doctor/appointments/${a.id}/encounter`, {
      method: "POST",
      credentials: "include",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert(data?.error || "Үзлэг эхлүүлэхэд алдаа гарлаа.");
      return;
    }
    router.push(`/encounters/${data.encounterId}?appointmentId=${a.id}`);
  }, [router]);

  const todayAppointments = useMemo(() => {
    return appointments
      .filter((a) => isoToYmd(a.scheduledAt) === today)
      .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
  }, [appointments, today]);

  const grouped = useMemo(() => groupByDate(appointments), [appointments]);

  // Assign lane 0 or 1 to each today appointment for vertical stacking,
  // and track which appointments overlap with at least one other.
  const { laneAssignments, overlappingIds } = useMemo(() => {
    const laneMap = new Map<number, 0 | 1>();
    const overlapSet = new Set<number>();

    const getInterval = (a: DoctorAppointment) => {
      // Parse naive timestamps via minutesFromHHMM for ordering; use raw ms for overlap math.
      // Convert naive "YYYY-MM-DD HH:mm:ss" to fake-UTC ms for comparison.
      const parse = (naive: string) => {
        const hm = naiveTimestampToHm(naive);
        const [h, m] = hm.split(":").map(Number);
        return ((h || 0) * 60 + (m || 0)) * 60_000; // ms from midnight
      };
      const start = parse(a.scheduledAt);
      const end = a.endAt
        ? parse(a.endAt)
        : start + MINUTES_PER_SLOT * 60_000;
      return { start, end };
    };

    for (let i = 0; i < todayAppointments.length; i++) {
      const a = todayAppointments[i];
      const aInterval = getInterval(a);
      const usedLanes = new Set<number>();

      for (let j = 0; j < i; j++) {
        const b = todayAppointments[j];
        const bInterval = getInterval(b);
        if (aInterval.start < bInterval.end && aInterval.end > bInterval.start) {
          overlapSet.add(a.id);
          overlapSet.add(b.id);
          const bLane = laneMap.get(b.id);
          if (bLane !== undefined) usedLanes.add(bLane);
        }
      }
      laneMap.set(a.id, usedLanes.has(0) ? 1 : 0);
    }

    return { laneAssignments: laneMap, overlappingIds: overlapSet };
  }, [todayAppointments]);

  // ---- today timeline bounds (schedule -> clinic hours fallback) ----
  const timeline = useMemo(() => {
    // A) Prefer schedule if present
    if (scheduleToday?.startTime && scheduleToday?.endTime) {
      const startTime = scheduleToday.startTime;
      const endTime = scheduleToday.endTime;

      const startMin = minutesFromHHMM(startTime);
      const endMin = minutesFromHHMM(endTime);
      const safeEndMin = Math.max(endMin, startMin + 30);

      return {
        title: `Өнөөдрийн цаг захиалга (${startTime}–${endTime})`,
        startMin,
        endMin: safeEndMin,
        slots: buildSlots(startMin, safeEndMin),
        noSchedule: false,
      };
    }

    // B) Weekend with no schedule — do NOT show misleading default hours
    if (isWeekendYmd(today)) {
      return {
        title: "Өнөөдрийн цаг захиалга",
        startMin: 0,
        endMin: 30,
        slots: [],
        noSchedule: true,
      };
    }

    // C) Weekday with no schedule: fall back to default clinic hours
    const fallback = defaultClinicHours(today);
    const startMin = minutesFromHHMM(fallback.startTime);
    const endMin = minutesFromHHMM(fallback.endTime);
    const safeEndMin = Math.max(endMin, startMin + 30);

    return {
      title: "Өнөөдрийн цаг захиалга",
      startMin,
      endMin: safeEndMin,
      slots: buildSlots(startMin, safeEndMin),
      noSchedule: false,
    };
  }, [scheduleToday, today]);

  // compute left/width pixel values for appointment blocks
  function blockStyle(a: DoctorAppointment): React.CSSProperties {
    // Parse naive timestamps directly — no timezone conversion
    const hm = naiveTimestampToHm(a.scheduledAt);
    const [sh, sm] = hm.split(":").map(Number);
    const startMin = (sh || 0) * 60 + (sm || 0);

    const endHm = a.endAt ? naiveTimestampToHm(a.endAt) : null;
    const endMin = endHm
      ? (() => { const [h, m] = endHm.split(":").map(Number); return (h || 0) * 60 + (m || 0); })()
      : startMin + 30;

    const leftPx = ((startMin - timeline.startMin) / MINUTES_PER_SLOT) * SLOT_PX;
    const widthPx = Math.max(50, ((endMin - startMin) / MINUTES_PER_SLOT) * SLOT_PX);

    const lane = laneAssignments.get(a.id) ?? 0;
    const isOverlapping = overlappingIds.has(a.id);

    return {
      position: "absolute",
      left: Math.max(0, leftPx),
      width: widthPx,
      top: isOverlapping ? (lane === 0 ? 3 : "calc(50% + 1px)") : 3,
      bottom: isOverlapping ? (lane === 0 ? "calc(50% + 1px)" : 3) : 3,
      borderRadius: 8,
      padding: "2px 6px",
      background: getStatusColor(a.status),
      color: a.status === "completed" ? "#fff" : "#1F2937",
      overflow: "hidden",
      boxShadow: "0 1px 2px rgba(0,0,0,0.10)",
    };
  }

  return (
    <div className="font-sans antialiased" style={{ maxWidth: 820, margin: "0 auto", padding: "16px 12px 40px" }}>
      {/* KPI Summary Row */}
      <div className="flex gap-2 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:gap-3 mb-3" style={{ WebkitOverflowScrolling: "touch" }}>
        {/* Card 1: Өнөөдрийн цаг */}
        <div className="w-fit shrink-0 min-w-[108px] sm:w-full bg-gray-100 rounded-xl p-3" style={{ border: "1px solid rgba(19,26,41,0.18)" }}>
          <div className="text-[11px] font-bold text-gray-600 whitespace-nowrap">Өнөөдрийн цаг</div>
          <div className="text-[21px] sm:text-[26px] font-extrabold text-gray-900 leading-tight whitespace-nowrap tabular-nums">
            {loading ? "..." : todayAppointments.length}
          </div>
        </div>
        {/* Card 2: Өнөөдрийн ₮ */}
        <div className="w-fit shrink-0 min-w-[140px] sm:w-full bg-gray-100 rounded-xl p-3" style={{ border: "1px solid rgba(19,26,41,0.18)" }}>
          <div className="text-[11px] font-bold text-gray-600 whitespace-nowrap">Өнөөдрийн ₮</div>
          <div className="text-[21px] sm:text-[26px] font-extrabold text-gray-900 leading-tight whitespace-nowrap tabular-nums">
            {formatSalesValue(salesLoading, salesError, salesSummary, "todayTotal")}
          </div>
        </div>
        {/* Card 3: Сарын ₮ */}
        <div className="w-fit shrink-0 min-w-[140px] sm:w-full bg-gray-100 rounded-xl p-3" style={{ border: "1px solid rgba(19,26,41,0.18)" }}>
          <div className="text-[11px] font-bold text-gray-600 whitespace-nowrap">Сарын ₮</div>
          <div className="text-[21px] sm:text-[26px] font-extrabold text-gray-900 leading-tight whitespace-nowrap tabular-nums">
            {formatSalesValue(salesLoading, salesError, salesSummary, "monthTotal")}
          </div>
        </div>
      </div>

      {/* Today timeline */}
      <div
        style={{
          background: "white",
          borderRadius: 14,
          border: "1px solid #e5e7eb",
          padding: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10, color: "#374151" }}>
          {timeline.title}
        </div>

        {timeline.noSchedule ? (
          /* Weekend with no schedule configured */
          <div
            style={{
              textAlign: "center",
              padding: "20px 0 8px",
              color: "#94a3b8",
              fontSize: 14,
            }}
          >
            Өнөөдрийн хуваарь тохируулаагүй байна
          </div>
        ) : (
          /* single horizontal scroll container: header + body scroll together */
          <div
            style={{
              marginTop: 6,
              overflowX: "auto",
              overflowY: "hidden",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {/* fixed-width inner canvas */}
            <div
              style={{
                width: Math.max(360, timeline.slots.length * SLOT_PX),
              }}
            >
              {/* time labels row */}
              <div style={{ display: "flex" }}>
                {timeline.slots.map((t, idx) => (
                  <div
                    key={t}
                    style={{
                      width: SLOT_PX,
                      flexShrink: 0,
                      fontSize: 11,
                      color: "#94a3b8",
                      borderLeft: idx > 0 ? "1px solid #eef2f7" : "none",
                      paddingLeft: 4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t}
                  </div>
                ))}
              </div>

              {/* blocks canvas */}
              <div
                style={{
                  position: "relative",
                  height: 88,
                  marginTop: 4,
                  background: "#f8fafc",
                  borderRadius: 12,
                }}
              >
                {/* vertical grid lines */}
                {timeline.slots.map((t, idx) => (
                  <div
                    key={t}
                    style={{
                      position: "absolute",
                      left: idx * SLOT_PX,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: "#e5e7eb",
                    }}
                  />
                ))}

                {/* blocks */}
                {todayAppointments.map((a) => (
                  <div
                    key={a.id}
                    style={{ ...blockStyle(a), cursor: "pointer" }}
                    title={`${formatPatient(a)} ${isoToLocalHHMM(a.scheduledAt)}-${isoToLocalHHMM(
                      a.endAt || null
                    )}`}
                    onClick={() => setDetailsModal({ open: true, appointment: a })}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailsModal({ open: true, appointment: a }); }
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 11,
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                      }}
                    >
                      {formatPatient(a)}
                    </div>
                    <div style={{ fontSize: 10, lineHeight: 1.2, opacity: 0.9 }}>
                      {formatStatusShort(a.status)}
                    </div>
                  </div>
                ))}

                {todayAppointments.length === 0 && !loading && !error && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#94a3b8",
                      fontSize: 13,
                    }}
                  >
                    Өнөөдрийн цаг алга
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filters (range) */}
      <div
        style={{
          background: "white",
          borderRadius: 14,
          border: "1px solid #e5e7eb",
          padding: 12,
          marginBottom: 12,
        }}
      >
        {/* ── Mobile compact button row (< lg) ── */}
        <div className="flex gap-2 lg:hidden">
          {[
            { label: "7 хоног", days: 7 },
            { label: "14 хоног", days: 14 },
            { label: "1 сар", days: 30 },
          ].map(({ label, days }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setFrom(today);
                setTo(addDaysYmd(today, days));
                setRefreshKey((k) => k + 1);
                setShowMobileFilter(false);
              }}
              style={{
                flex: 1,
                border: "1px solid #d1d5db",
                background: "#f9fafb",
                borderRadius: 8,
                padding: "7px 4px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowMobileFilter((v) => !v)}
            style={{
              flex: 1,
              border: "1px solid #2563eb",
              background: showMobileFilter ? "#2563eb" : "#eff6ff",
              color: showMobileFilter ? "#fff" : "#2563eb",
              borderRadius: 8,
              padding: "7px 4px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Шүүлт
          </button>
        </div>

        {/* ── Mobile detailed filter (shown when showMobileFilter is true) ── */}
        {showMobileFilter && (
          <div className="mt-3 flex gap-2 items-end flex-wrap lg:hidden">
            {(["Эхлэх өдөр:", "Дуусах өдөр:"] as const).map((labelText) => {
              const isStart = labelText === "Эхлэх өдөр:";
              return (
                <label key={labelText} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, flex: 1, minWidth: 130 }}>
                  {labelText}
                  <input
                    type="date"
                    value={isStart ? from : to}
                    onChange={(e) => isStart ? setFrom(e.target.value) : setTo(e.target.value)}
                    style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 8px", fontSize: 13 }}
                  />
                </label>
              );
            })}
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={loading}
              style={{
                border: "none",
                background: "#2563eb",
                color: "white",
                borderRadius: 8,
                padding: "7px 12px",
                fontWeight: 800,
                fontSize: 13,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                height: 36,
              }}
            >
              {loading ? "..." : "Харах"}
            </button>
          </div>
        )}

        {/* ── Desktop filter row (lg+) ── */}
        <div
          className="hidden lg:flex"
          style={{
            gap: 10,
            alignItems: "end",
            flexWrap: "wrap",
          }}
        >
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontSize: 13,
            }}
          >
            Эхлэх өдөр:
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 14,
              }}
            />
          </label>

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontSize: 13,
            }}
          >
            Дуусах өдөр:
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 14,
              }}
            />
          </label>

          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            style={{
              border: "none",
              background: "#2563eb",
              color: "white",
              borderRadius: 10,
              padding: "10px 16px",
              fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              height: 40,
            }}
          >
            {loading ? "Ачаалж байна..." : "Харах"}
          </button>
        </div>

        {error && (
          <div
            style={{
              marginTop: 10,
              background: "#fee2e2",
              color: "#dc2626",
              padding: 10,
              borderRadius: 10,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Grouped list */}
      <div
        style={{
          background: "white",
          borderRadius: 14,
          border: "1px solid #e5e7eb",
          padding: 12,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8, color: "#374151", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          Нийт цаг захиалгууд
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 12, fontWeight: 500, borderRadius: 20,
            padding: "2px 10px",
            background: sseStatus === "connected" ? "#dcfce7" : sseStatus === "disconnected" ? "#fee2e2" : "#fef9c3",
            color: sseStatus === "connected" ? "#15803d" : sseStatus === "disconnected" ? "#b91c1c" : "#854d0e",
            border: `1px solid ${sseStatus === "connected" ? "#86efac" : sseStatus === "disconnected" ? "#fca5a5" : "#fde68a"}`,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: sseStatus === "connected" ? "#22c55e" : sseStatus === "disconnected" ? "#ef4444" : "#eab308",
              display: "inline-block",
            }} />
            {sseStatus === "connected" ? "Live: Connected" : sseStatus === "disconnected" ? "Live: Disconnected" : "Reconnecting…"}
            {sseStatus === "connected" && lastSseEventAt && (
              <span style={{ opacity: 0.75 }}>
                · Last update: {lastSseEventAt.toLocaleTimeString("mn-MN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </span>
        </div>

        {!loading && !error && grouped.length === 0 && (
          <div style={{ textAlign: "center", padding: 24, color: "#94a3b8", fontSize: 13 }}>
            Цаг олдсонгүй
          </div>
        )}

        {grouped.map(({ date, items }) => (
          <div key={date} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, margin: "8px 0" }}>
              {date.replaceAll("-", "/")} {formatDateLabel(date) === "Өнөөдөр" ? "" : ""}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((a) => (
  <div
    key={a.id}
    className="w-full min-w-0"
    style={{
      borderRadius: 12,
      padding: 8,
      background: getStatusColor(a.status),
      color: a.status === "completed" ? "#ffffff" : "#1F2937",
      cursor: "pointer",
    }}
    onClick={() => setDetailsModal({ open: true, appointment: a })}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailsModal({ open: true, appointment: a }); }
    }}
  >
    {/* Name */}
    <div
      style={{
        fontWeight: 900,
        fontSize: 12,
        lineHeight: 1.1,
        marginBottom: 2,
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        overflow: "hidden",
      }}
    >
      {formatPatient(a)}
    </div>

    {/* Start time only */}
    <div style={{ fontSize: 11, lineHeight: 1.1, opacity: 0.9 }}>
      {isoToLocalHHMM(a.scheduledAt)}
    </div>

    {/* Status */}
    <div style={{ fontSize: 11, lineHeight: 1.1, opacity: 0.9 }}>
      {formatStatusShort(a.status)}
    </div>
  </div>
))}
            </div>
          </div>
        ))}
      </div>

      {detailsModal.open && detailsModal.appointment && (
        <AppointmentDetailsModal
          open={detailsModal.open}
          onClose={() => setDetailsModal({ open: false, appointment: null })}
          appointments={[doctorApptToModalAppt(detailsModal.appointment)]}
          slotAppointmentCount={1}
          doctorMode={true}
          onStartEncounter={handleDoctorStartEncounter}
          onStatusUpdated={(updated) => {
            setAppointments((prev) =>
              prev.map((a) =>
                a.id === updated.id
                  ? { ...a, status: updated.status, notes: updated.notes ?? null }
                  : a
              )
            );
          }}
        />
      )}
    </div>
  );
}
