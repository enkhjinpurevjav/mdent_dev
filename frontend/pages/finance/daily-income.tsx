import React, { useCallback, useMemo, useRef, useState } from "react";
import EncounterReportModal from "../../components/patients/EncounterReportModal";

// ── Types ─────────────────────────────────────────────────────────────────────

type PaymentItem = {
  paymentId: number;
  invoiceId: number;
  encounterId: number | null;
  appointmentId: number | null;
  patientId: number | null;
  patientName: string | null;
  patientOvog: string | null;
  scheduledAt: string | null;
  visitDate: string | null;
  doctorId: number | null;
  doctorName: string | null;
  doctorOvog: string | null;
  amount: number;
  collectedById: number | null;
  collectedByName: string | null;
  collectedByOvog: string | null;
  paymentTimestamp: string;
  meta: Record<string, unknown> | null;
};

type PaymentTypeGroup = {
  method: string;
  label: string;
  totalAmount: number;
  count: number;
  items: PaymentItem[];
};

type DailyIncomeResponse = {
  date: string;
  grandTotal: number;
  paymentTypes: PaymentTypeGroup[];
};

type Branch = { id: number; name: string };
type User = { id: number; name: string | null; ovog: string | null };

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMnt(v: number) {
  return `${Number(v || 0).toLocaleString("mn-MN")} ₮`;
}

function fmtName(ovog: string | null | undefined, name: string | null | undefined) {
  const n = (name || "").trim();
  const o = (ovog || "").trim();
  if (o && n) return `${o[0]}. ${n}`;
  return n || o || "-";
}

function fmtDatetime(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

// ── Expanded detail rows ───────────────────────────────────────────────────────

function DetailRows({
  items,
  onOpenReport,
}: {
  items: PaymentItem[];
  onOpenReport: (appointmentId: number) => void;
}) {
  if (items.length === 0) {
    return (
      <tr>
        <td colSpan={8} className="py-3 pl-10 text-sm text-gray-400 italic">
          Дэлгэрэнгүй мэдээлэл байхгүй
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="bg-blue-50">
        <td className="py-2 pl-10 pr-2 text-xs font-semibold text-gray-500">#</td>
        <td className="px-2 py-2 text-xs font-semibold text-gray-500">Үйлчлүүлэгч</td>
        <td className="px-2 py-2 text-xs font-semibold text-gray-500">Нэхэмжлэл #</td>
        <td className="px-2 py-2 text-xs font-semibold text-gray-500">Үзлэгийн огноо</td>
        <td className="px-2 py-2 text-xs font-semibold text-gray-500">Эмч</td>
        <td className="px-2 py-2 text-right text-xs font-semibold text-gray-500">Дүн</td>
        <td className="px-2 py-2 text-xs font-semibold text-gray-500">Төлбөр хураасан</td>
        <td className="px-2 py-2 text-xs font-semibold text-gray-500">Үйлдэл</td>
      </tr>
      {items.map((item, idx) => (
        <tr
          key={item.paymentId}
          className="border-t border-blue-100 bg-blue-50/60 hover:bg-blue-50"
        >
          <td className="py-2 pl-10 pr-2 text-sm text-gray-600">{idx + 1}</td>
          <td className="px-2 py-2 text-sm text-gray-800">
            {fmtName(item.patientOvog, item.patientName)}
          </td>
          <td className="px-2 py-2 text-sm text-gray-600">
            {item.invoiceId ? `#${item.invoiceId}` : "-"}
          </td>
          <td className="px-2 py-2 text-sm text-gray-600">
            {fmtDatetime(item.scheduledAt || item.visitDate)}
          </td>
          <td className="px-2 py-2 text-sm text-gray-800">
            {fmtName(item.doctorOvog, item.doctorName)}
          </td>
          <td className="px-2 py-2 text-right text-sm font-medium text-gray-800">
            {fmtMnt(item.amount)}
          </td>
          <td className="px-2 py-2 text-sm text-gray-600">
            {fmtName(item.collectedByOvog, item.collectedByName)}
          </td>
          <td className="px-2 py-2">
            {item.appointmentId != null && (
              <div className="group relative inline-block">
                <button
                  aria-label="Тайлан харах"
                  className="rounded-md border border-gray-300 bg-white p-1.5 text-gray-500 hover:bg-gray-50 hover:text-blue-600"
                  onClick={() => onOpenReport(item.appointmentId!)}
                >
                  <EyeIcon />
                </button>
                <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Үзлэгийн тайлан
                </span>
              </div>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DailyIncomePage() {
  // Filters
  const [date, setDate] = useState<string>(getTodayStr);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [userId, setUserId] = useState<number | null>(null);

  // Reference data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Report state
  const [data, setData] = useState<DailyIncomeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // UI state
  const [submitted, setSubmitted] = useState(false);
  const [expandedMethods, setExpandedMethods] = useState<Set<string>>(new Set());

  // Encounter modal
  const [reportAppointmentId, setReportAppointmentId] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  // Load branches on mount
  React.useEffect(() => {
    fetch("/api/branches")
      .then((r) => r.json())
      .then((d) => setBranches(Array.isArray(d) ? d : []))
      .catch(() => setBranches([]));
  }, []);

  // Load users when branch changes
  React.useEffect(() => {
    const url = branchId ? `/api/users?branchId=${branchId}` : "/api/users";
    fetch(url)
      .then((r) => r.json())
      .then((d) => setUsers(Array.isArray(d) ? d : []))
      .catch(() => setUsers([]));
    // Reset user selection if branch changes
    setUserId(null);
  }, [branchId]);

  const fetchReport = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ date });
      if (branchId) params.set("branchId", String(branchId));
      if (userId) params.set("userId", String(userId));
      const res = await fetch(`/api/admin/daily-income?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Мэдээлэл татахад алдаа гарлаа");
      setData(json);
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Мэдээлэл татахад алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  }, [date, branchId, userId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchReport();
  };

  const toggleMethod = (method: string) => {
    setExpandedMethods((prev) => {
      const next = new Set(prev);
      if (next.has(method)) {
        next.delete(method);
      } else {
        next.add(method);
      }
      return next;
    });
  };

  const openReport = (appointmentId: number) => {
    setReportAppointmentId(appointmentId);
    setReportOpen(true);
  };

  // CSV export
  const handleExportCSV = () => {
    if (!data) return;

    const BOM = "\uFEFF";
    const rows: string[] = [
      `Өдрийн орлогын тайлан: ${data.date}`,
      "",
      "Төлбөрийн төрөл,Тоо,Нийт дүн (₮)",
      ...data.paymentTypes.map(
        (g) => `"${g.label}",${g.count},${g.totalAmount}`
      ),
      `"Нийт",${data.paymentTypes.reduce((s, g) => s + g.count, 0)},${data.grandTotal}`,
      "",
      "Дэлгэрэнгүй",
      "Төлбөрийн төрөл,Үйлчлүүлэгч,Нэхэмжлэл #,Огноо,Эмч,Дүн (₮),Төлбөр хураасан",
      ...data.paymentTypes.flatMap((g) =>
        g.items.map(
          (item) =>
            `"${g.label}","${fmtName(item.patientOvog, item.patientName)}",${item.invoiceId},"${fmtDatetime(item.scheduledAt || item.visitDate)}","${fmtName(item.doctorOvog, item.doctorName)}",${item.amount},"${fmtName(item.collectedByOvog, item.collectedByName)}"`
        )
      ),
    ];

    const csv = BOM + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `daily-income-${data.date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  const grandTotal = useMemo(() => data?.grandTotal ?? 0, [data]);
  const totalCount = useMemo(
    () => data?.paymentTypes.reduce((s, g) => s + g.count, 0) ?? 0,
    [data]
  );

  const selectedBranchName = useMemo(
    () => branches.find((b) => b.id === branchId)?.name ?? "Бүх салбар",
    [branches, branchId]
  );

  return (
    <>
      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body > *:not(#daily-income-printable) {
            display: none !important;
          }
          #daily-income-printable {
            display: block !important;
          }
          .no-print {
            display: none !important;
          }
          .print-break {
            page-break-inside: avoid;
          }
        }
      `}</style>

      <main className="w-full px-6 py-6 font-sans" id="daily-income-printable">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Өдрийн орлогын тайлан</h1>
          {submitted && data && (
            <div className="no-print flex gap-2">
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                CSV татах
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                  />
                </svg>
                Хэвлэх
              </button>
            </div>
          )}
        </div>

        {/* Filters */}
        <form
          onSubmit={handleSubmit}
          className="no-print mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Огноо</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Салбар</label>
            <select
              value={branchId ?? ""}
              onChange={(e) => setBranchId(Number(e.target.value) || null)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
            >
              <option value="">Бүх салбар</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Хэрэглэгч</label>
            <select
              value={userId ?? ""}
              onChange={(e) => setUserId(Number(e.target.value) || null)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
            >
              <option value="">Бүгд</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {fmtName(u.ovog, u.name)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={loading || !date}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Ачаалж байна..." : "Хайх"}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Not yet submitted */}
        {!submitted && !loading && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16 text-gray-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="mb-3 h-10 w-10 opacity-40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-sm">Огноо болон салбар сонгоод &ldquo;Хайх&rdquo; дарна уу</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12 text-sm text-gray-500">
            Ачаалж байна...
          </div>
        )}

        {/* Report */}
        {submitted && !loading && data && (
          <div ref={printRef}>
            {/* Print header (visible only in print) */}
            <div className="mb-4 hidden print:block">
              <h2 className="text-lg font-bold">Өдрийн орлогын тайлан</h2>
              <p className="text-sm text-gray-600">
                Огноо: {data.date} | Салбар: {selectedBranchName}
              </p>
            </div>

            {/* Summary totals (top) */}
            <div className="mb-4 flex flex-wrap gap-3">
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-center">
                <p className="text-xs text-blue-600">Нийт орлого</p>
                <p className="text-xl font-bold text-blue-800">{fmtMnt(grandTotal)}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-center">
                <p className="text-xs text-gray-500">Нийт гүйлгээ</p>
                <p className="text-xl font-bold text-gray-800">{totalCount}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-center">
                <p className="text-xs text-gray-500">Төлбөрийн төрөл</p>
                <p className="text-xl font-bold text-gray-800">{data.paymentTypes.length}</p>
              </div>
            </div>

            {/* Payment types table */}
            {data.paymentTypes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center text-sm text-gray-400">
                Тухайн өдөр орлого байхгүй байна
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-gray-600">#</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Төлбөрийн төрөл</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">
                        Гүйлгээний тоо
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">
                        Нийт дүн
                      </th>
                      <th className="no-print px-4 py-3 font-semibold text-gray-600">Үйлдэл</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.paymentTypes.map((group, idx) => (
                      <React.Fragment key={group.method}>
                        <tr
                          className={`border-t border-gray-200 ${expandedMethods.has(group.method) ? "bg-blue-50/40" : "hover:bg-gray-50"}`}
                        >
                          <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                          <td className="px-4 py-3 font-medium text-gray-800">{group.label}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{group.count}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-800">
                            {fmtMnt(group.totalAmount)}
                          </td>
                          <td className="no-print px-4 py-3">
                            <button
                              aria-label={
                                expandedMethods.has(group.method)
                                  ? "Хаах"
                                  : "Дэлгэрэнгүй харах"
                              }
                              onClick={() => toggleMethod(group.method)}
                              className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-blue-600"
                            >
                              <ChevronIcon open={expandedMethods.has(group.method)} />
                              {expandedMethods.has(group.method) ? "Хаах" : "Дэлгэрэнгүй"}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded detail rows */}
                        {expandedMethods.has(group.method) && (
                          <DetailRows items={group.items} onOpenReport={openReport} />
                        )}

                        {/* For print: always show detail rows */}
                        {!expandedMethods.has(group.method) && (
                          <tr className="hidden print:table-row">
                            <td colSpan={5}>
                              <table className="w-full text-xs">
                                <tbody>
                                  {group.items.map((item) => (
                                    <tr key={item.paymentId} className="border-t border-blue-100 bg-blue-50/60">
                                      <td className="py-1 pl-10 pr-2">{fmtName(item.patientOvog, item.patientName)}</td>
                                      <td className="px-2 py-1">#{item.invoiceId}</td>
                                      <td className="px-2 py-1">{fmtDatetime(item.scheduledAt || item.visitDate)}</td>
                                      <td className="px-2 py-1">{fmtName(item.doctorOvog, item.doctorName)}</td>
                                      <td className="px-2 py-1 text-right">{fmtMnt(item.amount)}</td>
                                      <td className="px-2 py-1">{fmtName(item.collectedByOvog, item.collectedByName)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}

                    {/* Totals row */}
                    <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                      <td className="px-4 py-3" colSpan={2}>
                        Нийт
                      </td>
                      <td className="px-4 py-3 text-right">{totalCount}</td>
                      <td className="px-4 py-3 text-right text-blue-700">{fmtMnt(grandTotal)}</td>
                      <td className="no-print px-4 py-3" />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Bottom totals summary */}
            {data.paymentTypes.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {data.paymentTypes.map((g) => (
                  <div
                    key={g.method}
                    className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-center shadow-sm"
                  >
                    <p className="text-xs text-gray-500">{g.label}</p>
                    <p className="text-sm font-bold text-gray-800">{fmtMnt(g.totalAmount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Encounter report modal */}
      <EncounterReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        appointmentId={reportAppointmentId}
      />
    </>
  );
}
