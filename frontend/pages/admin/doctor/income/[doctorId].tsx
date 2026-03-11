import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import EncounterReportModal from "../../../../components/patients/EncounterReportModal";

// ── Types ─────────────────────────────────────────────────────────────────────

type CategoryRow = {
  key:
    | "IMAGING"
    | "ORTHODONTIC_TREATMENT"
    | "DEFECT_CORRECTION"
    | "SURGERY"
    | "GENERAL"
    | "BARTER_EXCESS";
  label: string;
  salesMnt: number;
  incomeMnt: number;
  pctUsed: number;
};

type DetailsResponse = {
  doctorId: number;
  doctorName: string | null;
  doctorOvog: string | null;
  startDate: string;
  endDate: string;
  categories: CategoryRow[];
  totals: {
    totalSalesMnt: number;
    totalIncomeMnt: number;
  };
};

type LineItem = {
  invoiceId: number;
  encounterId: number | null;
  appointmentId: number | null;
  appointmentScheduledAt: string | null;
  visitDate: string | null;
  patientId: number | null;
  patientOvog: string | null;
  patientName: string | null;
  serviceName: string;
  serviceCategory: string;
  priceMnt: number;
  discountMnt: number;
  netAfterDiscountMnt: number;
  allocatedPaidMnt: number;
  paymentMethodLabel: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMnt(v: number) {
  return `${Number(v || 0).toLocaleString("mn-MN")} ₮`;
}

function formatDoctorName(ovog: string | null | undefined, name: string | null | undefined) {
  const n = (name || "").trim();
  const o = (ovog || "").trim();
  if (o && n) return `${o[0]}. ${n}`;
  return n || o || "-";
}

function formatPatient(ovog: string | null | undefined, name: string | null | undefined) {
  const n = (name || "").trim();
  const o = (ovog || "").trim();
  if (o && n) return `${o[0]}. ${n}`;
  return n || o || "-";
}

function formatDate(isoStr: string | null | undefined) {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("mn-MN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

// ✅ Add this right here (after helpers, before Icons / components)
const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  ORTHODONTIC_TREATMENT: "Гажиг заслын эмчилгээ",
  IMAGING: "Зураг авах",
  DEFECT_CORRECTION: "Согог засал",
  ADULT_TREATMENT: "Том хүний эмчилгээ",
  WHITENING: "Цайруулалт",
  CHILD_TREATMENT: "Хүүхдийн эмчилгээ",
  SURGERY: "Мэс засал",
  PREVIOUS: "Өмнөх",
  GENERAL: "Ерөнхий", // optional safety
};

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
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

// ── Drill-down rows ───────────────────────────────────────────────────────────

function DrillDownRows({
  lines,
  onOpenReport,
}: {
  lines: LineItem[];
  onOpenReport: (appointmentId: number) => void;
}) {
  if (lines.length === 0) {
    return (
      <tr>
        <td colSpan={10} className="px-8 py-4 text-center text-xs text-gray-500">
          Энэ ангилалд мэдээлэл олдсонгүй.
        </td>
      </tr>
    );
  }

  return (
    <>
      {lines.map((line, idx) => {
        const dateStr = formatDate(line.appointmentScheduledAt || line.visitDate);
        const patientStr = formatPatient(line.patientOvog, line.patientName);
        const canOpen = line.appointmentId != null;
        const tooltip = canOpen ? "Дэлгэрэнгүй" : "Цаг захиалга байхгүй";

        return (
          <tr key={`${line.invoiceId}-${idx}`} className="border-t border-blue-100 bg-blue-50/30">
            <td className="py-2 pl-8 pr-3 text-xs text-gray-700">#{line.invoiceId}</td>
            <td className="px-3 py-2 text-xs text-gray-700">{dateStr}</td>
            <td className="px-3 py-2 text-xs text-gray-700">{patientStr}</td>
            <td className="px-3 py-2 text-xs text-gray-700">{line.serviceName}</td>
            <td className="px-3 py-2 text-right text-xs text-gray-700">{fmtMnt(line.priceMnt)}</td>
            <td className="px-3 py-2 text-right text-xs text-gray-700">
              {line.discountMnt > 0 ? fmtMnt(line.discountMnt) : "-"}
            </td>
            <td className="px-3 py-2 text-right text-xs font-semibold text-gray-800">
              {fmtMnt(line.allocatedPaidMnt)}
            </td>
            <td className="px-3 py-2 text-xs text-gray-700">
              {line.paymentMethodLabel || "-"}
            </td>
            <td className="px-3 py-2 text-xs text-gray-500">
  {SERVICE_CATEGORY_LABELS[line.serviceCategory] ?? line.serviceCategory}
</td>
            <td className="px-3 py-2 text-center">
              <div className="group relative inline-block">
                <button
                  type="button"
                  disabled={!canOpen}
                  aria-label={tooltip}
                  onClick={() => canOpen && onOpenReport(line.appointmentId!)}
                  className={`rounded border p-1 transition-colors ${
                    canOpen
                      ? "border-blue-400 bg-white text-blue-600 hover:bg-blue-50"
                      : "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300"
                  }`}
                >
                  <EyeIcon />
                </button>
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {tooltip}
                </span>
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DoctorIncomeDetailsPage() {
  const router = useRouter();
  const { doctorId, startDate: qsStart, endDate: qsEnd } = router.query;

  // Fallback to current-month range when query params are missing
  const startDate = useMemo(() => {
    if (typeof qsStart === "string" && qsStart) return qsStart;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }, [qsStart]);

  const endDate = useMemo(() => {
    if (typeof qsEnd === "string" && qsEnd) return qsEnd;
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  }, [qsEnd]);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DetailsResponse | null>(null);
  const [error, setError] = useState<string>("");

  // Expand state: set of expanded category keys
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Lines cache: key → LineItem[] (undefined=not fetched, null=loading, array=loaded)
  const [categoryLines, setCategoryLines] = useState<
    Record<string, LineItem[] | null | undefined>
  >({});
  const [categoryErrors, setCategoryErrors] = useState<Record<string, string>>({});

  // EncounterReportModal
  const [reportModalAppointmentId, setReportModalAppointmentId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!doctorId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/doctors-income/${doctorId}/details?startDate=${startDate}&endDate=${endDate}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to fetch doctor income details");
      setData(json);
    } catch (e: any) {
      setError(e?.message || "Failed to fetch details");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [doctorId, startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchCategoryLines = useCallback(
    async (categoryKey: string) => {
      if (!doctorId || !startDate || !endDate) return;

      // Use functional update to atomically check-and-set (setState callback is synchronous)
      let shouldFetch = true;
      setCategoryLines((prev) => {
        if (prev[categoryKey] !== undefined) {
          shouldFetch = false;
          return prev;
        }
        return { ...prev, [categoryKey]: null }; // mark as loading
      });

      if (!shouldFetch) return;

      try {
        const res = await fetch(
          `/api/admin/doctors-income/${doctorId}/details/lines?startDate=${startDate}&endDate=${endDate}&category=${categoryKey}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to fetch lines");
        setCategoryLines((prev) => ({ ...prev, [categoryKey]: json }));
      } catch (e: any) {
        setCategoryErrors((prev) => ({ ...prev, [categoryKey]: e?.message || "Error" }));
        setCategoryLines((prev) => ({ ...prev, [categoryKey]: [] }));
      }
    },
    [doctorId, startDate, endDate]
  );

  const toggleCategory = useCallback(
    (categoryKey: string) => {
      setExpandedCategories((prev) => {
        const next = new Set(prev);
        if (next.has(categoryKey)) {
          next.delete(categoryKey);
        } else {
          next.add(categoryKey);
          fetchCategoryLines(categoryKey);
        }
        return next;
      });
    },
    [fetchCategoryLines]
  );

  const doctorDisplayName = data
    ? formatDoctorName(data.doctorOvog, data.doctorName)
    : String(doctorId || "");

  return (
    <main className="w-full px-6 py-6 font-sans">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
        >
          Буцах
        </button>
        <h1 className="m-0 text-xl font-bold text-gray-900">
          Эмчийн Орлогын Тайлан — Дэлгэрэнгүй
        </h1>
      </div>

      {/* Meta */}
      <div className="mb-4 text-sm text-gray-700">
        <div>
          <span className="font-semibold">Эхлэх:</span> {startDate}{" "}
          <span className="font-semibold">Дуусах:</span> {endDate}
        </div>
        <div>
          <span className="font-semibold">Эмч:</span> {doctorDisplayName}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-600">Ачаалж байна...</p>
      ) : !data ? (
        <p className="text-sm text-gray-600">Мэдээлэл олдсонгүй.</p>
      ) : (
        <>
          {/* Summary totals */}
          <section className="mb-4">
            <div className="flex flex-wrap gap-8">
              <div>
                <div className="text-xs text-gray-500">Нийт борлуулалт</div>
                <div className="text-lg font-bold text-gray-900">
                  {fmtMnt(data.totals.totalSalesMnt)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Нийт эмчийн хувь</div>
                <div className="text-lg font-bold text-gray-900">
                  {fmtMnt(data.totals.totalIncomeMnt)}
                </div>
              </div>
            </div>
          </section>

          {/* Category table with expandable rows */}
          <section>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-700">Ангилал</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Хувь (%)</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">
                      Борлуулалт
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">
                      Эмчийн хувь
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">Үйлдэл</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((row) => {
                    const isOpen = expandedCategories.has(row.key);
                    const lines = categoryLines[row.key];
                    const lineError = categoryErrors[row.key];

                    return (
                      <React.Fragment key={row.key}>
                        {/* Category summary row */}
                        <tr className="border-t border-gray-200">
                          <td className="px-4 py-3">{row.label}</td>
                          <td className="px-4 py-3 text-right">{Number(row.pctUsed || 0)}%</td>
                          <td className="px-4 py-3 text-right">{fmtMnt(row.salesMnt)}</td>
                          <td className="px-4 py-3 text-right">{fmtMnt(row.incomeMnt)}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              aria-label={isOpen ? "Хаах" : "Дэлгэрэнгүй харах"}
                              onClick={() => toggleCategory(row.key)}
                              className="inline-flex items-center justify-center rounded border border-gray-300 bg-white p-1.5 text-gray-600 hover:bg-gray-50 hover:text-blue-600"
                            >
                              <ChevronIcon open={isOpen} />
                            </button>
                          </td>
                        </tr>

                        {/* Drill-down rows */}
                        {isOpen && (
                          <tr>
                            <td colSpan={5} className="p-0">
                              <div className="border-t border-blue-100 bg-blue-50/20">
                                {lines === null ? (
                                  <p className="px-8 py-3 text-xs text-gray-500">
                                    Ачаалж байна...
                                  </p>
                                ) : lineError ? (
                                  <p className="px-8 py-3 text-xs text-red-600">{lineError}</p>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full border-collapse text-xs">
                                      <thead className="bg-blue-50 text-left">
                                        <tr>
                                          <th className="py-2 pl-8 pr-3 font-semibold text-gray-600">
                                            Нэхэмжлэл #
                                          </th>
                                          <th className="px-3 py-2 font-semibold text-gray-600">
                                            Үзлэгийн огноо
                                          </th>
                                          <th className="px-3 py-2 font-semibold text-gray-600">
                                            Үйлчлүүлэгч
                                          </th>
                                          <th className="px-3 py-2 font-semibold text-gray-600">
                                            Үйлчилгээ
                                          </th>
                                          <th className="px-3 py-2 text-right font-semibold text-gray-600">
                                            Үнийн дүн
                                          </th>
                                          <th className="px-3 py-2 text-right font-semibold text-gray-600">
                                            Хөнгөлөлт
                                          </th>
                                          <th className="px-3 py-2 text-right font-semibold text-gray-600">
                                            Нийт
                                          </th>
                                          <th className="px-3 py-2 font-semibold text-gray-600">
                                            Төлбөрийн хэрэгсэл
                                          </th>
                                          <th className="px-3 py-2 font-semibold text-gray-600">
                                            Үйлчилгээний төрөл
                                          </th>
                                          <th className="px-3 py-2 text-center font-semibold text-gray-600">
                                            Үйлдэл
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        <DrillDownRows
                                          lines={lines ?? []}
                                          onOpenReport={(apptId) =>
                                            setReportModalAppointmentId(apptId)
                                          }
                                        />
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr className="border-t-2 border-gray-200 font-bold">
                    <td className="px-4 py-3">Нийт</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right">{fmtMnt(data.totals.totalSalesMnt)}</td>
                    <td className="px-4 py-3 text-right">{fmtMnt(data.totals.totalIncomeMnt)}</td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Encounter Report Modal */}
      <EncounterReportModal
        open={reportModalAppointmentId != null}
        onClose={() => setReportModalAppointmentId(null)}
        appointmentId={reportModalAppointmentId}
      />
    </main>
  );
}
