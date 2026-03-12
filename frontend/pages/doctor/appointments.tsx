import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import AppointmentDetailsModal from "../../components/appointments/AppointmentDetailsModal";
import type { Appointment } from "../../components/appointments/types";

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
  scheduledAt: string; // ISO
  endAt?: string | null; // ISO
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
  return new Date().toISOString().slice(0, 10);
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isWeekendYmd(ymd: string): boolean {
  const d = new Date(ymd + "T00:00:00");
  const w = d.getDay();
  return w === 0 || w === 6;
}

function defaultClinicHours(ymd: string) {
  if (isWeekendYmd(ymd)) return { startTime: "10:00", endTime: "19:00" };
  return { startTime: "09:00", endTime: "21:00" };
}

function isoToLocalHHMM(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function isoToYmd(iso: string | null | undefined): string {
  if (!iso) return "";
  return String(iso).slice(0, 10);
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
      return "#6b7280"; // gray (admin screenshot style)
    case "completed":
      return "#fb6190"; // pink
    case "confirmed":
      return "#bbf7d0"; // light green
    case "online":
      return "#a78bfa"; // purple
    case "imaging":
      return "#8b5cf6";
    case "ready_to_pay":
      return "#facc15";
    case "partial_paid":
      return "#fbbf24";
    case "no_show":
      return "#ef4444";
    case "cancelled":
      return "#1889fc";
    default:
      return "#77f9fe"; // booked (admin uses cyan-ish default)
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
    case "booked": return "Зах.";
    case "confirmed": return "Бат.";
    case "ongoing": return "Яв.";
    case "completed": return "Дуус.";
    case "cancelled": return "Цуц.";
    case "no_show": return "Ирээгүй";
    case "ready_to_pay": return "Төлбөр";
    case "partial_paid": return "Үлд.";
    case "imaging": return "Зураг";
    case "online": return "Онл.";
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
  const [scheduleToday, setScheduleToday] = useState<DoctorScheduleDay | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // manual refresh button behavior like admin
  const [refreshKey, setRefreshKey] = useState(0);

  // modal state for appointment details
  const [detailsModal, setDetailsModal] = useState<{
    open: boolean;
    appointment: DoctorAppointment | null;
  }>({ open: false, appointment: null });

  // sales summary state
  const [salesSummary, setSalesSummary] = useState<{ todayTotal: number; monthTotal: number } | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState(false);

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

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      // 1) appointments (range)
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

      // 2) schedule for today only — use the doctor-scoped endpoint (admin-only /api/users is not accessible to doctors)
      const schedRes = await fetch(
        `/api/doctor/schedule?date=${today}`,
        { credentials: "include" }
      );
      const schedJson = await schedRes.json().catch(() => null);

      if (schedRes.ok && Array.isArray(schedJson) && schedJson.length > 0) {
        // If multiple entries exist (multiple branches), pick earliest start + latest end for today
        const entries: DoctorScheduleDay[] = schedJson;
        const picked = entries.reduce((acc, s) => {
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
      } else {
        setScheduleToday(null);
      }
    } catch (e: any) {
      setError(e?.message || "Алдаа гарлаа");
      setAppointments([]);
      setScheduleToday(null);
    } finally {
      setLoading(false);
    }
  }, [doctorId, from, to, today]);

  useEffect(() => {
    loadAll();
  }, [loadAll, refreshKey]);

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
    router.push(`/doctor/encounters/${data.encounterId}?appointmentId=${a.id}`);
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
      const start = new Date(a.scheduledAt).getTime();
      const end = a.endAt
        ? new Date(a.endAt).getTime()
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
    const fallback = defaultClinicHours(today);

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
      };
    }

    // B) No schedule: fall back to default clinic hours
    const startMin = minutesFromHHMM(fallback.startTime);
    const endMin = minutesFromHHMM(fallback.endTime);
    const safeEndMin = Math.max(endMin, startMin + 30);

    return {
      title: "Өнөөдрийн цаг захиалга",
      startMin,
      endMin: safeEndMin,
      slots: buildSlots(startMin, safeEndMin),
    };
  }, [scheduleToday, today]);

  // compute left/width pixel values for appointment blocks
  function blockStyle(a: DoctorAppointment): React.CSSProperties {
    const start = new Date(a.scheduledAt);
    const end = a.endAt
      ? new Date(a.endAt)
      : new Date(start.getTime() + 30 * 60_000);

    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = end.getHours() * 60 + end.getMinutes();

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
      color: a.status === "completed" ? "#fff" : "#111827",
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

        {/* single horizontal scroll container: header + body scroll together */}
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
        <div
          style={{
            display: "flex",
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
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8, color: "#374151" }}>
          Нийт цаг захиалгууд
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
      color: "#111827",
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
