import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { formatStatus } from "../../components/appointments/formatters";

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
  const name = [a.patientOvog, a.patientName].filter(Boolean).join(" ");
  return name || a.patientBookNumber || "—";
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

      // 2) schedule for today only (if we know doctorId)
      if (doctorId) {
        const schedRes = await fetch(
          `/api/users/${doctorId}/schedule?from=${today}&to=${today}`,
          {
            credentials: "include",
          }
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

  const todayAppointments = useMemo(() => {
    return appointments
      .filter((a) => isoToYmd(a.scheduledAt) === today)
      .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
  }, [appointments, today]);

  const grouped = useMemo(() => groupByDate(appointments), [appointments]);

  // ---- today timeline bounds (schedule -> appointments -> clinic fallback) ----
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
        title: `Өнөөдрийн цагийн хуваарь (${startTime}–${endTime})`,
        startMin,
        endMin: safeEndMin,
        slots: buildSlots(startMin, safeEndMin),
      };
    }

    // B) No schedule: derive from today's appointments (if any)
    if (todayAppointments.length > 0) {
      const windows = todayAppointments.map((a) => {
        const s = new Date(a.scheduledAt);
        const e = a.endAt ? new Date(a.endAt) : new Date(s.getTime() + 30 * 60_000);
        return {
          start: s.getHours() * 60 + s.getMinutes(),
          end: e.getHours() * 60 + e.getMinutes(),
        };
      });

      let startMin = Math.min(...windows.map((w) => w.start));
      let endMin = Math.max(...windows.map((w) => w.end));

      // snap to 30-min grid
      startMin = Math.floor(startMin / 30) * 30;
      endMin = Math.ceil(endMin / 30) * 30;

      // optional padding
      startMin = Math.max(0, startMin - 30);
      endMin = Math.min(24 * 60, endMin + 30);

      // clamp to clinic hours
      const clinicStart = minutesFromHHMM(fallback.startTime);
      const clinicEnd = minutesFromHHMM(fallback.endTime);
      startMin = Math.max(clinicStart, startMin);
      endMin = Math.min(clinicEnd, endMin);

      const safeEndMin = Math.max(endMin, startMin + 30);

      return {
        title: "Өнөөдрийн цагийн хуваарь",
        startMin,
        endMin: safeEndMin,
        slots: buildSlots(startMin, safeEndMin),
      };
    }

    // C) No schedule + no appointments: clinic fallback + warning
    const startMin = minutesFromHHMM(fallback.startTime);
    const endMin = minutesFromHHMM(fallback.endTime);
    const safeEndMin = Math.max(endMin, startMin + 30);

    return {
      title: "Өнөөдрийн цагийн хуваарь (Хуваарь тохируулаагүй)",
      startMin,
      endMin: safeEndMin,
      slots: buildSlots(startMin, safeEndMin),
    };
  }, [scheduleToday, today, todayAppointments]);

  // compute left/width percentages for appointment blocks
  function blockStyle(a: DoctorAppointment): React.CSSProperties {
    const start = new Date(a.scheduledAt);
    const end = a.endAt
      ? new Date(a.endAt)
      : new Date(start.getTime() + 30 * 60_000);

    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = end.getHours() * 60 + end.getMinutes();

    const total = timeline.endMin - timeline.startMin || 1;
    const left = ((startMin - timeline.startMin) / total) * 100;
    const width = ((endMin - startMin) / total) * 100;

    return {
      position: "absolute",
      left: `${Math.max(0, left)}%`,
      width: `${Math.max(2, width)}%`,
      top: 8,
      bottom: 8,
      borderRadius: 10,
      padding: "10px 10px",
      background: getStatusColor(a.status),
      color: a.status === "completed" ? "#fff" : "#111827",
      overflow: "hidden",
      minWidth: 80,
      boxShadow: "0 1px 3px rgba(0,0,0,0.10)",
    };
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "16px 12px 40px" }}>
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
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>
          {timeline.title}
        </div>

        {/* timeline header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${timeline.slots.length}, minmax(60px, 1fr))`,
            gap: 0,
          }}
        >
          {timeline.slots.map((t) => (
            <div
              key={t}
              style={{
                fontSize: 12,
                color: "#94a3b8",
                borderLeft: "1px solid #eef2f7",
                paddingLeft: 6,
              }}
            >
              {t}
            </div>
          ))}
        </div>

        {/* timeline body */}
        <div
          style={{
            position: "relative",
            height: 110,
            marginTop: 6,
            borderRadius: 12,
            background: "#f8fafc",
            overflowX: "auto",
          }}
        >
          <div
            style={{
              position: "relative",
              minWidth: Math.max(600, timeline.slots.length * 70),
              height: "100%",
            }}
          >
            {/* vertical grid lines */}
            {timeline.slots.map((t, idx) => (
              <div
                key={t}
                style={{
                  position: "absolute",
                  left: `${(idx / (timeline.slots.length - 1)) * 100}%`,
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
                style={blockStyle(a)}
                title={`${formatPatient(a)} ${isoToLocalHHMM(
                  a.scheduledAt
                )}-${isoToLocalHHMM(a.endAt || null)}`}
              >
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 13,
                    marginBottom: 2,
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                  }}
                >
                  {formatPatient(a)} #{a.id}
                </div>
                <div style={{ fontSize: 12, opacity: 0.9 }}>
                  {isoToLocalHHMM(a.scheduledAt)} –{" "}
                  {isoToLocalHHMM(a.endAt || null)}
                </div>
                <div style={{ fontSize: 12, marginTop: 2, opacity: 0.9 }}>
                  {formatStatus(a.status)}
                  {a.branchName ? ` · ${a.branchName}` : ""}
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
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>
          Цагууд
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

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {items.map((a) => (
                <div
                  key={a.id}
                  style={{
                    width: "min(260px, 100%)",
                    flex: "1 1 220px",
                    borderRadius: 12,
                    padding: 12,
                    background: getStatusColor(a.status),
                    color: "#111827",
                  }}
                >
                  <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 4 }}>
                    {formatPatient(a)} #{a.id}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.95 }}>
                    {isoToLocalHHMM(a.scheduledAt)} – {isoToLocalHHMM(a.endAt || null)}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                    {formatStatus(a.status)}
                    {a.branchName ? ` · ${a.branchName}` : ""}
                  </div>

                  {a.status === "ongoing" && (
                    <button
                      onClick={async () => {
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
                      }}
                      style={{
                        marginTop: 10,
                        width: "100%",
                        padding: "10px",
                        background: "#0f2044",
                        color: "white",
                        border: "none",
                        borderRadius: 10,
                        fontWeight: 900,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      Үзлэг эхлүүлэх
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
