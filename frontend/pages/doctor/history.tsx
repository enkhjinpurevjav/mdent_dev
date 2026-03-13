import React, { useCallback, useEffect, useState } from "react";
import EncounterReportModal from "../../components/patients/EncounterReportModal";
import EncounterMaterialsModal from "../../components/patients/EncounterMaterialsModal";

type DoctorAppointment = {
  id: number;
  patientId: number;
  branchId: number;
  doctorId: number;
  scheduledAt: string;
  endAt: string | null;
  status: string;
  notes: string | null;
  patientName: string | null;
  patientOvog: string | null;
  patientBookNumber: string | null;
  branchName: string | null;
  encounterId?: number | null;
  materialsCount?: number;
  patientPhone?: string | null;
};

function formatScheduleDate(ymd: string): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const weekdays = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];
  const weekday = weekdays[dt.getDay()];
  return `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")} ${weekday}`;
}

function formatApptTimeRange(a: DoctorAppointment): string {
  if (!a.scheduledAt) return "";
  const start = new Date(a.scheduledAt);
  const hh = String(start.getHours()).padStart(2, "0");
  const mm = String(start.getMinutes()).padStart(2, "0");
  const startStr = `${hh}:${mm}`;
  if (!a.endAt) return startStr;
  const end = new Date(a.endAt);
  const eh = String(end.getHours()).padStart(2, "0");
  const em = String(end.getMinutes()).padStart(2, "0");
  return `${startStr} – ${eh}:${em}`;
}

function formatApptPatientLabel(a: DoctorAppointment): string {
  const name = (a.patientName || "").trim();
  const ovog = (a.patientOvog || "").trim();
  let displayName = name;
  if (ovog) displayName = `${ovog.charAt(0).toUpperCase()}.${name}`;
  const book = a.patientBookNumber ? ` #${a.patientBookNumber}` : "";
  return displayName ? `${displayName}${book}` : (a.patientBookNumber ? `#${a.patientBookNumber}` : "—");
}

function getApptStatusBgClass(status: string): string {
  switch (status) {
    case "booked":       return "bg-cyan-200";
    case "confirmed":    return "bg-green-200";
    case "online":       return "bg-violet-400";
    case "ongoing":      return "bg-gray-400";
    case "imaging":      return "bg-purple-500";
    case "ready_to_pay": return "bg-yellow-300";
    case "partial_paid": return "bg-amber-400";
    case "completed":    return "bg-pink-500";
    case "no_show":      return "bg-red-500";
    case "cancelled":    return "bg-blue-500";
    case "other":        return "bg-slate-400";
    default:             return "bg-cyan-200";
  }
}

function getApptStatusTextClass(status: string): string {
  switch (status) {
    case "booked":
    case "confirmed":
    case "ready_to_pay":
      return "text-gray-900";
    default:
      return "text-white";
  }
}

function formatApptStatus(status: string): string {
  switch (status) {
    case "booked":       return "Захиалсан";
    case "confirmed":    return "Баталгаажсан";
    case "online":       return "Онлайн";
    case "ongoing":      return "Явж байна";
    case "imaging":      return "Зураг";
    case "ready_to_pay": return "Төлбөр төлөх";
    case "partial_paid": return "Үлдэгдэлтэй";
    case "completed":    return "Дууссан";
    case "no_show":      return "Ирээгүй";
    case "cancelled":    return "Цуцалсан";
    case "other":        return "Бусад";
    default:             return status;
  }
}

function todayYMD(): string {
  return new Date().toISOString().slice(0, 10);
}

function sevenDaysAgoYMD(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export default function DoctorHistoryPage() {
  const [apptHistory, setApptHistory] = useState<DoctorAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState<string>(sevenDaysAgoYMD());
  const [toDate, setToDate] = useState<string>(todayYMD());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportAppointmentId, setReportAppointmentId] = useState<number | null>(null);
  const [materialsModalOpen, setMaterialsModalOpen] = useState(false);
  const [materialsEncounterId, setMaterialsEncounterId] = useState<number | null>(null);

  const loadHistory = useCallback(async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/doctor/appointments?from=${fromDate}&to=${toDate}&allStatuses=true&withEncounterData=true`,
        { credentials: "include" }
      );
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data)) {
        setApptHistory(data);
        setPage(1);
      } else {
        setError(data?.error || "Үзлэгийн түүхийг ачааллаж чадсангүй");
      }
    } catch (err) {
      console.error("Failed to load visit history:", err);
      setError("Сүлжээгээ шалгана уу");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  // Auto-load on mount with default dates
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const totalPages = Math.max(1, Math.ceil(apptHistory.length / pageSize));
  const paged = apptHistory.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 12px 0" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: "#0f2044" }}>
        Үзлэгийн түүх
      </h1>

      {/* Date filter */}
      <div
        style={{
          background: "white",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
          marginBottom: 12,
        }}
      >
        <div className="flex gap-3 items-end flex-wrap">
          <div className="shrink-0">
            <label className="block text-[13px] font-medium mb-1 text-gray-700">
              Эхлэх өдөр:
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2.5 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div className="shrink-0">
            <label className="block text-[13px] font-medium mb-1 text-gray-700">
              Дуусах өдөр:
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2.5 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => void loadHistory()}
            disabled={loading || !fromDate || !toDate}
            className={`px-4 py-2 ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-500 cursor-pointer"} text-white border-0 rounded-md text-sm font-medium`}
          >
            {loading ? "Ачаалж байна..." : "Харах"}
          </button>
          <div className="shrink-0 ml-auto flex items-center gap-1">
            <label className="text-[13px] text-gray-600">Хуудсанд:</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1.5 border border-gray-300 rounded-md text-sm"
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={45}>45</option>
            </select>
          </div>
        </div>
      </div>

      {/* History table */}
      <div
        style={{
          background: "white",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, color: "#0f2044" }}>
          Үзлэгийн түүх
        </div>

        {loading && (
          <div className="text-gray-500 text-sm py-5">
            Үзлэгийн түүхийг ачаалж байна...
          </div>
        )}
        {error && !loading && (
          <div className="text-red-600 text-sm py-3">{error}</div>
        )}
        {!loading && !error && apptHistory.length === 0 && (
          <div className="text-gray-500 text-sm py-5">
            Тухайн хугацаанд үзлэг олдсонгүй.
          </div>
        )}
        {!loading && !error && apptHistory.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">
                      Огноо
                    </th>
                    <th className="text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">
                      Цаг
                    </th>
                    <th className="text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700">
                      Үйлчлүүлэгч
                    </th>
                    <th className="hidden sm:table-cell text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700">
                      Төлөв
                    </th>
                    <th className="hidden md:table-cell text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700">
                      Утас
                    </th>
                    <th className="hidden lg:table-cell text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700">
                      Тэмдэглэл
                    </th>
                    <th className="text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700">
                      Үйлдэл
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((a) => {
                    const dateStr = (a.scheduledAt ?? "").slice(0, 10);
                    return (
                      <tr key={a.id} className="odd:bg-white even:bg-gray-50">
                        <td className="border-b border-gray-100 py-1.5 px-2 whitespace-nowrap text-[13px]">
                          {formatScheduleDate(dateStr)}
                        </td>
                        <td className="border-b border-gray-100 py-1.5 px-2 whitespace-nowrap text-[13px]">
                          {formatApptTimeRange(a)}
                        </td>
                        <td className="border-b border-gray-100 py-1.5 px-2 text-[13px]">
                          {formatApptPatientLabel(a)}
                        </td>
                        <td className="hidden sm:table-cell border-b border-gray-100 py-1.5 px-2 text-[13px]">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${getApptStatusBgClass(a.status)} ${getApptStatusTextClass(a.status)}`}>
                            {formatApptStatus(a.status)}
                          </span>
                        </td>
                        <td className="hidden md:table-cell border-b border-gray-100 py-1.5 px-2 text-[13px] text-gray-600">
                          {a.patientPhone || "—"}
                        </td>
                        <td className="hidden lg:table-cell border-b border-gray-100 py-1.5 px-2 text-[13px] text-gray-600 max-w-[200px] truncate">
                          {a.notes || "—"}
                        </td>
                        <td className="border-b border-gray-100 py-1.5 px-2">
                          {a.status === "completed" && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                title="Дэлгэрэнгүй"
                                onClick={() => {
                                  setReportAppointmentId(a.id);
                                  setReportModalOpen(true);
                                }}
                                className="inline-flex items-center justify-center w-7 h-7 rounded border border-blue-300 bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                                  <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                title="Хавсралтууд"
                                disabled={!a.encounterId || (a.materialsCount ?? 0) < 1}
                                onClick={() => {
                                  if (a.encounterId) {
                                    setMaterialsEncounterId(a.encounterId);
                                    setMaterialsModalOpen(true);
                                  }
                                }}
                                className="inline-flex items-center justify-center w-7 h-7 rounded border border-gray-300 bg-gray-50 text-gray-500 hover:bg-gray-100 cursor-pointer disabled:opacity-40 disabled:cursor-default"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
              <span>Нийт {apptHistory.length} бүртгэл</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer disabled:opacity-40 disabled:cursor-default"
                >
                  ‹ Өмнөх
                </button>
                <span>{page} / {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2 py-1 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer disabled:opacity-40 disabled:cursor-default"
                >
                  Дараах ›
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <EncounterReportModal
        open={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          setReportAppointmentId(null);
        }}
        appointmentId={reportAppointmentId}
      />

      <EncounterMaterialsModal
        open={materialsModalOpen}
        onClose={() => {
          setMaterialsModalOpen(false);
          setMaterialsEncounterId(null);
        }}
        encounterId={materialsEncounterId}
      />
    </div>
  );
}
