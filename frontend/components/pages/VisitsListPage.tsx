import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import EncounterReportModal from "../patients/EncounterReportModal";
import { getMe, AuthUser } from "../../utils/auth";
import type { AppointmentRow, AppointmentStatus } from "../../types/appointments";

const PAGE_SIZE = 30;

const today = () => new Date().toISOString().slice(0, 10);

type StatusOption = {
  value: string;
  label: string;
};

const STATUS_OPTIONS: StatusOption[] = [
  { value: "ready_to_pay", label: "Төлбөр төлөх" },
  { value: "ongoing", label: "Явагдаж байна" },
  { value: "booked", label: "Захиалсан" },
  { value: "confirmed", label: "Баталгаажсан" },
  { value: "online", label: "Онлайн" },
  { value: "imaging", label: "Зураг" },
  { value: "completed", label: "Дууссан" },
  { value: "no_show", label: "Ирээгүй" },
  { value: "cancelled", label: "Цуцалсан" },
  { value: "other", label: "Бусад" },
];

// Exclude "completed" from status editing UI
const STATUS_EDIT_OPTIONS: StatusOption[] = STATUS_OPTIONS.filter(
  (o) => o.value !== "completed"
);

const EDITABLE_STATUSES = ["booked", "confirmed", "online", "other"];

function formatHm(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatYmdDot(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function formatShortName(
  name: string | null | undefined,
  ovog: string | null | undefined
): string {
  const n = (name || "").trim();
  const o = (ovog || "").trim();
  const prefix = o ? `${o[0]}. ` : "";
  return (prefix + n).trim() || "-";
}

type Toast = { id: number; message: string };
let toastSeq = 0;

interface Props {
  /**
   * When true, the branch selector is hidden entirely for non-admin roles
   * (receptionist). Admin/super_admin still see the branch dropdown.
   * Defaults to false (original visits-page behavior: non-admin see readonly label).
   */
  hideBranchSelector?: boolean;
}

export default function VisitsListPage({ hideBranchSelector = false }: Props) {
  const router = useRouter();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [noBranch, setNoBranch] = useState(false);

  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  const [date, setDate] = useState<string>(today());
  const [branchId, setBranchId] = useState<string>("");
  const [status, setStatus] = useState<string>("ready_to_pay");

  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportAppointmentId, setReportAppointmentId] = useState<number | null>(
    null
  );

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [payLoading, setPayLoading] = useState<number | null>(null);

  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [editingStatus, setEditingStatus] = useState<string>("");
  const [statusSaveLoading, setStatusSaveLoading] = useState(false);

  const isAdminRole = (role: string) => role === "admin" || role === "super_admin";

  const showToast = (message: string) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Load current user
  useEffect(() => {
    getMe().then((u) => {
      if (!u) {
        setUserLoading(false);
        return;
      }
      setUser(u);
      if (!u.branchId && !isAdminRole(u.role)) {
        setNoBranch(true);
        setUserLoading(false);
        return;
      }
      // For non-admin, lock to their branch
      if (!isAdminRole(u.role) && u.branchId) {
        setBranchId(String(u.branchId));
      }
      setUserLoading(false);
    });
  }, []);

  // Load branches (for all roles; also sets default branch for admin/super_admin)
  useEffect(() => {
    fetch("/api/branches")
      .then((r) => r.json())
      .then((data) => {
        const mapped = (data || []).map((b: any) => ({
          id: String(b.id),
          name: b.name as string,
        }));
        setBranches(mapped);
      })
      .catch(() => setBranches([]));
  }, []);

  // When user and branches are available, set default branch for admin if not yet set
  useEffect(() => {
    if (user && isAdminRole(user.role) && !branchId && branches.length > 0) {
      setBranchId(branches[0].id);
    }
  }, [user, branches, branchId]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("date", date);
    if (branchId) params.set("branchId", branchId);
    params.set("status", status);
    return params.toString();
  }, [date, branchId, status]);

  // Fetch appointments when query changes
  useEffect(() => {
    if (userLoading || noBranch) return;
    if (!branchId && user && !isAdminRole(user.role)) return;

    setLoading(true);
    fetch(`/api/appointments?${queryString}`)
      .then((r) => r.json())
      .then((data) => setRows(Array.isArray(data) ? (data as AppointmentRow[]) : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [queryString, userLoading, noBranch, user, branchId]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [queryString]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handlePayClick = async (row: AppointmentRow) => {
    setPayLoading(row.id);
    try {
      const res = await fetch(`/api/appointments/${row.id}/encounter`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        showToast(json?.error || "Encounter олдсонгүй. Дахин оролдоно уу.");
        return;
      }
      const json = await res.json();
      const encounterId = json?.encounterId ?? json?.id ?? json?.encounter?.id;
      if (!encounterId) {
        showToast("Encounter ID олдсонгүй.");
        return;
      }
      router.push(`/billing/${encounterId}`);
    } catch {
      showToast("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPayLoading(null);
    }
  };

  const handleReportClick = (row: AppointmentRow) => {
    setReportAppointmentId(row.id);
    setReportOpen(true);
  };

  const handleStatusEditClick = (row: AppointmentRow) => {
    setEditingRowId(row.id);
    setEditingStatus(String(row.status || ""));
  };

  const handleStatusEditCancel = () => {
    setEditingRowId(null);
    setEditingStatus("");
  };

  const handleStatusSave = async (row: AppointmentRow) => {
    if (!editingStatus) {
      showToast("Төлөв сонгоно уу.");
      return;
    }
    setStatusSaveLoading(true);
    try {
      const res = await fetch(`/api/appointments/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: editingStatus }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        showToast(
          (json as { error?: string } | null)?.error ||
            "Төлөв шинэчлэхэд алдаа гарлаа."
        );
        return;
      }

      const next = String(editingStatus).toLowerCase();
      const currentFilter = String(status).toLowerCase();

      setRows((prev) => {
        // Move away immediately if it no longer matches current filter
        if (next !== currentFilter) {
          return prev.filter((r) => r.id !== row.id);
        }
        // Otherwise update in place
        return prev.map((r) =>
          r.id === row.id ? { ...r, status: next as AppointmentStatus } : r
        );
      });

      setEditingRowId(null);
      setEditingStatus("");
    } catch {
      showToast("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setStatusSaveLoading(false);
    }
  };

  const getScheduledAt = (row: AppointmentRow) => row.scheduledAt ?? row.startTime ?? null;

  if (userLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-gray-500">
        Ачааллаж байна…
      </div>
    );
  }

  if (noBranch) {
    return (
      <div className="flex flex-col items-center justify-center p-12 gap-3">
        <div className="text-red-600 font-semibold text-lg">Хандах эрхгүй</div>
        <div className="text-gray-500 text-sm">
          Таны бүртгэлд салбар олдсонгүй. Администратортой холбоо барина уу.
        </div>
      </div>
    );
  }

  const filterStatusLow = String(status).toLowerCase();
  const canEditOnThisPage = EDITABLE_STATUSES.includes(filterStatusLow);

  // Whether to show the branch field: hidden when hideBranchSelector=true and user is not admin
  const showBranchField = !(hideBranchSelector && user && !isAdminRole(user.role));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Захиалгын жагсаалт</h1>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        {/* Date */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Огноо</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* Branch */}
        {showBranchField && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">Салбар</label>
            {user && isAdminRole(user.role) ? (
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[160px]"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">
                {branches.find((b) => b.id === branchId)?.name ?? branchId ?? "—"}
              </div>
            )}
          </div>
        )}

        {/* Status */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Төлөв</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[160px]"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Уншиж байна…</div>
        ) : pageRows.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Өгөгдөл олдсонгүй.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                  Огноо
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                  Эхлэх цаг
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                  Өвчтөн
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                  Эмч
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                  Үйлдэл
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pageRows.map((row) => {
                const scheduledAt = getScheduledAt(row);
                const statusLow = String(row.status || "").toLowerCase();
                const rowEditable = EDITABLE_STATUSES.includes(statusLow);

                return (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {formatYmdDot(scheduledAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {formatHm(scheduledAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-800 max-w-[160px] truncate">
                      {formatShortName(row.patientName, row.patientOvog)}
                    </td>
                    <td className="px-4 py-3 text-gray-800 max-w-[160px] truncate">
                      {formatShortName(row.doctorName, row.doctorOvog)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {statusLow === "ready_to_pay" && (
                        <button
                          type="button"
                          disabled={payLoading === row.id}
                          onClick={() => handlePayClick(row)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {payLoading === row.id ? "…" : "Төлбөр төлөх"}
                        </button>
                      )}

                      {statusLow === "completed" && (
                        <button
                          type="button"
                          onClick={() => handleReportClick(row)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                        >
                          Дууссан
                        </button>
                      )}

                      {canEditOnThisPage && rowEditable && (
                        editingRowId === row.id ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={editingStatus}
                              onChange={(e) => setEditingStatus(e.target.value)}
                              disabled={statusSaveLoading}
                              className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-60"
                            >
                              {STATUS_EDIT_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={statusSaveLoading}
                              onClick={() => handleStatusSave(row)}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {statusSaveLoading ? "…" : "Хадгалах"}
                            </button>
                            <button
                              type="button"
                              disabled={statusSaveLoading}
                              onClick={handleStatusEditCancel}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 transition-colors"
                            >
                              Болих
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStatusEditClick(row)}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                          >
                            Төлөв засах
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && rows.length > PAGE_SIZE && (
        <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl shadow-sm border border-gray-100">
          <span className="text-xs text-gray-500">
            {rows.length} бичлэгийн {(currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, rows.length)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Өмнөх
            </button>
            <span className="px-3 py-1.5 text-xs text-gray-600">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Дараах →
            </button>
          </div>
        </div>
      )}

      {/* Encounter Report Modal */}
      <EncounterReportModal
        open={reportOpen}
        onClose={() => {
          setReportOpen(false);
          setReportAppointmentId(null);
        }}
        appointmentId={reportAppointmentId}
      />

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="bg-red-600 text-white text-sm px-4 py-3 rounded-xl shadow-lg max-w-xs"
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
