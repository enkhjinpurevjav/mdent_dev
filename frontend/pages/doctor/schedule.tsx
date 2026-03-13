import React, { useEffect, useState } from "react";

type ScheduleItem = {
  id: number;
  date: string;
  branch?: { name: string } | null;
  startTime: string;
  endTime: string;
  note?: string | null;
};

function formatScheduleDate(ymd: string): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const weekdays = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];
  const weekday = weekdays[dt.getDay()];
  return `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")} ${weekday}`;
}

export default function DoctorSchedulePage() {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/doctor/schedule", {
          credentials: "include",
        });

        const data = await res.json().catch(() => null);

        if (!cancelled) {
          if (res.ok && Array.isArray(data)) {
            setSchedule(data);
          } else {
            setError(
              data && data.error
                ? data.error
                : "Ажлын хуваарийг ачааллаж чадсангүй"
            );
          }
        }
      } catch (err) {
        console.error("Failed to load schedule:", err);
        if (!cancelled) setError("Сүлжээгээ шалгана уу");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px 12px 0" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: "#0f2044" }}>Хуваарь</h1>

      <div
        style={{
          background: "white",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
        }}
      >
        {loading && (
          <div style={{ color: "#6b7280", fontSize: 14 }}>
            Ажлын хуваарь ачааллаж байна...
          </div>
        )}

        {!loading && error && (
          <div style={{ color: "#dc2626", fontSize: 14 }}>{error}</div>
        )}

        {!loading && !error && schedule.length === 0 && (
          <div style={{ color: "#9ca3af", fontSize: 14 }}>
            Төлөвлөсөн ажлын хуваарь алга.
          </div>
        )}

        {!loading && !error && schedule.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={{ textAlign: "left", borderBottom: "1px solid #d1d5db", padding: "8px" }}>
                  Огноо
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #d1d5db", padding: "8px" }}>
                  Салбар
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #d1d5db", padding: "8px" }}>
                  Цаг
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #d1d5db", padding: "8px" }}>
                  Тэмдэглэл
                </th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((s) => (
                <tr key={s.id}>
                  <td style={{ borderBottom: "1px solid #f3f4f6", padding: "8px" }}>
                    {formatScheduleDate(s.date)}
                  </td>
                  <td style={{ borderBottom: "1px solid #f3f4f6", padding: "8px" }}>
                    {s.branch?.name || "-"}
                  </td>
                  <td style={{ borderBottom: "1px solid #f3f4f6", padding: "8px" }}>
                    {s.startTime} - {s.endTime}
                  </td>
                  <td style={{ borderBottom: "1px solid #f3f4f6", padding: "8px" }}>
                    {s.note || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
