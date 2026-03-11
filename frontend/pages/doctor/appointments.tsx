import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { formatStatus } from "../../components/appointments/formatters";

type Appointment = {
  id: number;
  date: string;
  startTime: string;
  endTime?: string | null;
  status: string;
  patient?: {
    firstName?: string | null;
    lastName?: string | null;
    bookNumber?: string | null;
  } | null;
  note?: string | null;
  encounterId?: number | null;
};

type GroupedAppointments = {
  date: string;
  items: Appointment[];
};

function formatPatient(appt: Appointment): string {
  const p = appt.patient;
  if (!p) return "—";
  const name = [p.lastName, p.firstName].filter(Boolean).join(" ");
  return name || p.bookNumber || "—";
}

function formatTime(t: string): string {
  return t ? t.slice(0, 5) : "";
}

function getStatusColor(status: string): string {
  switch (status) {
    case "ongoing": return "#16a34a";
    case "booked":
    case "confirmed": return "#2563eb";
    case "completed":
    case "paid": return "#6b7280";
    case "ready_to_pay":
    case "partial_paid": return "#d97706";
    case "no_show": return "#dc2626";
    default: return "#6b7280";
  }
}

function groupByDate(appointments: Appointment[]): GroupedAppointments[] {
  const map: Record<string, Appointment[]> = {};
  for (const appt of appointments) {
    const key = appt.date.slice(0, 10);
    if (!map[key]) map[key] = [];
    map[key].push(appt);
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items }));
}

function formatDateLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    if (dateStr === todayStr) return "Өнөөдөр";
    return d.toLocaleDateString("mn-MN", { month: "short", day: "numeric", weekday: "short" });
  } catch {
    return dateStr;
  }
}

export default function DoctorAppointmentsPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [startingEncounter, setStartingEncounter] = useState<number | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const weekLater = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(weekLater);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/doctor/appointments?from=${from}&to=${to}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Цагуудыг ачаалахад алдаа гарлаа.");
      setAppointments(data.appointments || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const handleStartEncounter = async (appointmentId: number) => {
    setStartingEncounter(appointmentId);
    try {
      const res = await fetch(`/api/doctor/appointments/${appointmentId}/encounter`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Үзлэг эхлүүлэхэд алдаа гарлаа.");
      const encounterId = data.encounterId;
      router.push(`/doctor/encounters/${encounterId}?appointmentId=${appointmentId}`);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setStartingEncounter(null);
    }
  };

  const grouped = groupByDate(appointments);

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px 12px 0" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: "#0f2044" }}>Цагууд</h1>

      {/* Date range filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 2 }}>Эхлэх</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 2 }}>Дуусах</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }}
          />
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>Ачаалж байна...</div>
      )}
      {error && (
        <div style={{ background: "#fee2e2", color: "#dc2626", padding: 12, borderRadius: 8, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {!loading && !error && grouped.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
          Цаг олдсонгүй
        </div>
      )}

      {grouped.map(({ date, items }) => (
        <div key={date} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8, padding: "4px 0", borderBottom: "1px solid #e5e7eb" }}>
            {formatDateLabel(date)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((appt) => (
              <div
                key={appt.id}
                style={{
                  background: "white",
                  borderRadius: 12,
                  padding: "12px 14px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
                  borderLeft: `4px solid ${getStatusColor(appt.status)}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: "#111827" }}>
                      {formatPatient(appt)}
                    </div>
                    <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                      {formatTime(appt.startTime)}{appt.endTime ? ` – ${formatTime(appt.endTime)}` : ""}
                      {appt.note && (
                        <span style={{ marginLeft: 8, color: "#9ca3af" }}>{appt.note}</span>
                      )}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 20,
                      background: getStatusColor(appt.status) + "18",
                      color: getStatusColor(appt.status),
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatStatus(appt.status)}
                  </span>
                </div>

                {appt.status === "ongoing" && (
                  <button
                    onClick={() => handleStartEncounter(appt.id)}
                    disabled={startingEncounter === appt.id}
                    style={{
                      marginTop: 10,
                      width: "100%",
                      padding: "10px",
                      background: "#0f2044",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: startingEncounter === appt.id ? "not-allowed" : "pointer",
                      opacity: startingEncounter === appt.id ? 0.6 : 1,
                    }}
                  >
                    {startingEncounter === appt.id ? "Ачаалж байна..." : "Үзлэг эхлүүлэх"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
