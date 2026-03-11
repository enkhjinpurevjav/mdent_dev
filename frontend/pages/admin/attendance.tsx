import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function todayLocalStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Build an ISO timestamp for the local start-of-day of a YYYY-MM-DD string */
function localStartOfDay(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toISOString();
}

/** Build an ISO timestamp for the local end-of-day of a YYYY-MM-DD string */
function localEndOfDay(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59.999`).toISOString();
}

function formatDisplayName(ovog: string | null, name: string | null): string {
  if (!name) return "(нэргүй)";
  if (ovog && ovog.trim()) return `${ovog.trim()[0]}.${name}`;
  return name;
}

function formatTime(isoStr: string | null): string {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  return d.toLocaleTimeString("mn-MN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDate(isoStr: string | null): string {
  if (!isoStr) return "—";
  // dateStr is already YYYY-MM-DD
  return isoStr;
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    doctor: "Эмч",
    nurse: "Сувилагч",
    receptionist: "Ресепшн",
    admin: "Админ",
    super_admin: "Супер Админ",
    staff: "Ажилтан",
  };
  return map[role] || role;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    present: "Ирсэн",
    open: "Нээлттэй",
    absent: "Ирээгүй",
    unscheduled: "Хуваарьгүй",
  };
  return map[status] || status;
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    present: "#16a34a",
    open: "#d97706",
    absent: "#dc2626",
    unscheduled: "#6b7280",
  };
  return map[status] || "#374151";
}

function statusBg(status: string): string {
  const map: Record<string, string> = {
    present: "#f0fdf4",
    open: "#fffbeb",
    absent: "#fef2f2",
    unscheduled: "#f9fafb",
  };
  return map[status] || "#f9fafb";
}

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type AttendanceRow = {
  rowType: "scheduled" | "unscheduled";
  userId: number;
  userName: string | null;
  userOvog: string | null;
  userEmail: string | null;
  userRole: string;
  branchId: number;
  branchName: string;
  scheduledDate: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduleNote: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  durationMinutes: number | null;
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
  status: "present" | "open" | "absent" | "unscheduled";
};

type ApiResponse = {
  items: AttendanceRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

// ──────────────────────────────────────────────────────────────────────────────
// Page component
// ──────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE_DEFAULT = 50;

export default function AdminAttendancePage() {
  const router = useRouter();

  const [fromDate, setFromDate] = useState<string>(todayLocalStr);
  const [toDate, setToDate] = useState<string>(todayLocalStr);
  const [branchId, setBranchId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState<number>(1);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [users, setUsers] = useState<
    { id: number; name: string | null; ovog: string | null; role: string }[]
  >([]);

  // Load branch list for filter dropdown
  useEffect(() => {
    fetch("/api/branches", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setBranches(Array.isArray(d) ? d : []))
      .catch(() => setBranches([]));

    fetch("/api/users", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setUsers(Array.isArray(d) ? d : []))
      .catch(() => setUsers([]));
  }, []);

  const fetchData = useCallback(
    async (p: number) => {
      setLoading(true);
      setError("");

      const fromTs = localStartOfDay(fromDate);
      const toTs = localEndOfDay(toDate);

      const params = new URLSearchParams({
        fromTs,
        toTs,
        page: String(p),
        pageSize: String(PAGE_SIZE_DEFAULT),
      });
      if (branchId) params.set("branchId", branchId);
      if (userId) params.set("userId", userId);
      if (statusFilter !== "all") params.set("status", statusFilter);

      try {
        const res = await fetch(`/api/admin/attendance?${params}`, {
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Алдаа гарлаа.");
        setData(json as ApiResponse);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Алдаа гарлаа.";
        setError(msg);
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [fromDate, toDate, branchId, userId, statusFilter]
  );

  // Re-fetch when filters change (reset to page 1)
  useEffect(() => {
    setPage(1);
    fetchData(1);
  }, [fromDate, toDate, branchId, userId, statusFilter, fetchData]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    fetchData(newPage);
  }

  return (
    <main className="w-full px-4 py-6 font-sans">
      <h1 className="mb-4 text-2xl font-bold text-gray-900">Ирцийн тайлан</h1>

      {/* ── Filters ── */}
      <section className="mb-6 flex flex-wrap gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Эхлэх огноо</label>
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Дуусах огноо</label>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Салбар</label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">Бүх салбар</option>
            {branches.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Ажилтан</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">Бүх ажилтан</option>
            {users.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {formatDisplayName(u.ovog, u.name)} ({roleLabel(u.role)})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Төлөв</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="all">Бүгд</option>
            <option value="present">Ирсэн</option>
            <option value="open">Нээлттэй</option>
            <option value="absent">Ирээгүй</option>
            <option value="unscheduled">Хуваарьгүй</option>
          </select>
        </div>
      </section>

      {/* ── Error ── */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Summary ── */}
      {data && !loading && (
        <p className="mb-2 text-sm text-gray-500">
          Нийт: <strong>{data.total}</strong> бичлэг
        </p>
      )}

      {/* ── Table ── */}
      <section>
        {loading ? (
          <p className="text-sm text-gray-600">Ачаалж байна...</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold text-gray-700">
                      Огноо
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold text-gray-700">
                      Нэр
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold text-gray-700">
                      Үүрэг
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold text-gray-700">
                      Салбар
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold text-gray-700">
                      Хуваарийн эхлэл
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold text-gray-700">
                      Хуваарийн төгсгөл
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold text-gray-700">
                      Ирсэн цаг
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold text-gray-700">
                      Явсан цаг
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 text-right font-semibold text-gray-700">
                      Хугацаа
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold text-gray-700">
                      Төлөв
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 text-right font-semibold text-gray-700">
                      Хоцролт (мин)
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 text-right font-semibold text-gray-700">
                      Эрт явсан (мин)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {!data || data.items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={12}
                        className="px-3 py-6 text-center text-sm text-gray-400"
                      >
                        Мэдээлэл олдсонгүй
                      </td>
                    </tr>
                  ) : (
                    data.items.map((row, i) => (
                      <tr
                        key={`${row.userId}-${row.scheduledDate}-${i}`}
                        className="border-t border-gray-100"
                        style={{ background: statusBg(row.status) }}
                      >
                        <td className="whitespace-nowrap px-3 py-2">
                          {formatDate(row.scheduledDate)}
                        </td>
                        <td className="px-3 py-2">
                          {formatDisplayName(row.userOvog, row.userName)}
                          {row.userEmail && (
                            <div className="text-xs text-gray-400">
                              {row.userEmail}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                          {roleLabel(row.userRole)}
                        </td>
                        <td className="px-3 py-2">{row.branchName}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {row.scheduledStart || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {row.scheduledEnd || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {formatTime(row.checkInAt)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {formatTime(row.checkOutAt)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          {row.durationMinutes != null
                            ? `${row.durationMinutes} мин`
                            : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <span
                            style={{
                              color: statusColor(row.status),
                              fontWeight: 600,
                            }}
                          >
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          {row.lateMinutes != null ? (
                            <span className="font-medium text-red-600">
                              +{row.lateMinutes}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          {row.earlyLeaveMinutes != null ? (
                            <span className="font-medium text-orange-600">
                              -{row.earlyLeaveMinutes}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ── */}
            {data && data.totalPages > 1 && (
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => handlePageChange(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Өмнөх
                </button>
                <span className="text-sm text-gray-600">
                  {data.page} / {data.totalPages}
                </span>
                <button
                  onClick={() =>
                    handlePageChange(Math.min(data.totalPages, page + 1))
                  }
                  disabled={page >= data.totalPages}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Дараах →
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
