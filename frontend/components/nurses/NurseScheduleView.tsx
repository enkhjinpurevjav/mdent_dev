import React, { useEffect, useState } from "react";

type Branch = {
  id: number;
  name: string;
};

type NurseScheduleDay = {
  id: number;
  date: string;
  branch: Branch;
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

interface Props {
  /**
   * URL to fetch the schedule from, e.g.:
   *   - Nurse portal: `/api/nurse/schedule`
   *   - Admin (read-only view): `/api/users/${nurseId}/nurse-schedule`
   */
  scheduleUrl: string;
  /**
   * Optional URL to fetch schedule history by date range.
   * If omitted, the history section is not shown.
   * Append `?from=YYYY-MM-DD&to=YYYY-MM-DD` — the component adds these params.
   * e.g. `/api/nurse/schedule` or `/api/users/${nurseId}/nurse-schedule`
   */
  historyUrl?: string;
}

const PAGE_SIZE = 10;
const HISTORY_PAGE_SIZE = 15;

/**
 * NurseScheduleView — read-only schedule table.
 * Used by:
 *   - Nurse portal schedule page (scheduleUrl="/api/nurse/schedule")
 */
export default function NurseScheduleView({ scheduleUrl, historyUrl }: Props) {
  const [schedule, setSchedule] = useState<NurseScheduleDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // History state
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<NurseScheduleDay[]>([]);
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(scheduleUrl, { credentials: "include" })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (ok && Array.isArray(data)) {
          setSchedule(data);
        } else {
          setError((data as any)?.error || "Ажлын хуваарийг ачааллаж чадсангүй");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Сүлжээгээ шалгана уу");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scheduleUrl]);

  const totalPages = Math.max(1, Math.ceil(schedule.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = schedule.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const loadHistory = async () => {
    if (!historyUrl) return;
    if (!historyFrom || !historyTo) {
      setHistoryError("Эхлэх болон дуусах огноог сонгоно уу.");
      return;
    }
    setHistoryLoading(true);
    setHistoryError(null);
    setHistoryItems([]);
    setHistoryPage(1);
    try {
      const url = `${historyUrl}?from=${historyFrom}&to=${historyTo}`;
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setHistoryItems(data);
      } else {
        setHistoryError((data as any)?.error || "Хуваарийн түүхийг ачааллаж чадсангүй");
      }
    } catch {
      setHistoryError("Сүлжээгээ шалгана уу");
    } finally {
      setHistoryLoading(false);
    }
  };

  const historyTotalPages = Math.max(1, Math.ceil(historyItems.length / HISTORY_PAGE_SIZE));
  const historyPageSafe = Math.min(historyPage, historyTotalPages);
  const historyPageRows = historyItems.slice(
    (historyPageSafe - 1) * HISTORY_PAGE_SIZE,
    historyPageSafe * HISTORY_PAGE_SIZE
  );

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px 12px 0" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: "#0f2044" }}>
        Хуваарь
      </h1>

      <div
        style={{
          background: "white",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: "#374151" }}>
          Сувилагчийн ажлын хуваарь
        </div>

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
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  <th
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #d1d5db",
                      padding: "8px",
                    }}
                  >
                    Огноо
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #d1d5db",
                      padding: "8px",
                    }}
                  >
                    Салбар
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #d1d5db",
                      padding: "8px",
                    }}
                  >
                    Цаг
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #d1d5db",
                      padding: "8px",
                    }}
                  >
                    Тэмдэглэл
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => (
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

            {totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 12,
                }}
              >
                <span style={{ fontSize: 13, color: "#6b7280" }}>
                  Нийт {schedule.length} бичлэг — {pageSafe}/{totalPages} хуудас
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    type="button"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      background: "white",
                      fontSize: 13,
                      cursor: pageSafe <= 1 ? "default" : "pointer",
                      opacity: pageSafe <= 1 ? 0.4 : 1,
                    }}
                  >
                    ‹ Өмнөх
                  </button>
                  <button
                    type="button"
                    disabled={pageSafe >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      background: "white",
                      fontSize: 13,
                      cursor: pageSafe >= totalPages ? "default" : "pointer",
                      opacity: pageSafe >= totalPages ? 0.4 : 1,
                    }}
                  >
                    Дараах ›
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* History section — only shown when historyUrl is provided */}
      {historyUrl && (
        <div
          style={{
            background: "white",
            borderRadius: 12,
            padding: 16,
            boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: "#374151" }}>
            Хуваарийн түүх
          </div>
          <div
            style={{
              color: "#6b7280",
              fontSize: 13,
              marginBottom: 10,
            }}
          >
            Өнгөрсөн (эсвэл ирээдүйн) тодорхой хугацааны ажлын хуваарийг харах.
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              Эхлэх огноо
              <input
                type="date"
                value={historyFrom}
                onChange={(e) => setHistoryFrom(e.target.value)}
                style={{
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  padding: "4px 8px",
                  fontSize: 13,
                  background: "white",
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              Дуусах огноо
              <input
                type="date"
                value={historyTo}
                onChange={(e) => setHistoryTo(e.target.value)}
                style={{
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  padding: "4px 8px",
                  fontSize: 13,
                  background: "white",
                }}
              />
            </label>
            <button
              type="button"
              onClick={loadHistory}
              disabled={historyLoading}
              style={{
                padding: "6px 16px",
                borderRadius: 8,
                border: "none",
                background: "#0f766e",
                color: "white",
                cursor: historyLoading ? "default" : "pointer",
                height: 34,
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {historyLoading ? "Ачааллаж байна..." : "Харах"}
            </button>
          </div>

          {historyError && (
            <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 8 }}>
              {historyError}
            </div>
          )}

          {!historyLoading && historyItems.length === 0 && !historyError && (
            <div style={{ color: "#9ca3af", fontSize: 13 }}>
              Хуваарийн түүх ачаалаагүй эсвэл өгөгдөл олдсонгүй.
            </div>
          )}

          {historyItems.length > 0 && (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
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
                  {historyPageRows.map((s) => (
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

              {historyTotalPages > 1 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 12,
                  }}
                >
                  <span style={{ fontSize: 13, color: "#6b7280" }}>
                    Нийт {historyItems.length} бичлэг — {historyPageSafe}/{historyTotalPages} хуудас
                  </span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      disabled={historyPageSafe <= 1}
                      onClick={() => setHistoryPage((p) => p - 1)}
                      style={{
                        padding: "4px 12px",
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        background: "white",
                        fontSize: 13,
                        cursor: historyPageSafe <= 1 ? "default" : "pointer",
                        opacity: historyPageSafe <= 1 ? 0.4 : 1,
                      }}
                    >
                      ‹ Өмнөх
                    </button>
                    <button
                      type="button"
                      disabled={historyPageSafe >= historyTotalPages}
                      onClick={() => setHistoryPage((p) => p + 1)}
                      style={{
                        padding: "4px 12px",
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        background: "white",
                        fontSize: 13,
                        cursor: historyPageSafe >= historyTotalPages ? "default" : "pointer",
                        opacity: historyPageSafe >= historyTotalPages ? 0.4 : 1,
                      }}
                    >
                      Дараах ›
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
