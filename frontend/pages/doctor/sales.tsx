import React, { useCallback, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type SalesCategoryRow = {
  key: string;
  label: string;
  salesMnt: number;
  incomeMnt: number;
  pctUsed: number;
};

type SalesDetailsResponse = {
  doctorId: number;
  doctorName: string | null;
  doctorOvog: string | null;
  startDate: string;
  endDate: string;
  categories: SalesCategoryRow[];
  totals: {
    totalSalesMnt: number;
    totalIncomeMnt: number;
  };
};

type SalesLineItem = {
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

function salesFormatPatient(ovog: string | null | undefined, name: string | null | undefined) {
  const n = (name || "").trim();
  const o = (ovog || "").trim();
  if (o && n) return `${o[0]}. ${n}`;
  return n || o || "-";
}

function salesFormatDate(isoStr: string | null | undefined) {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("mn-MN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function currentMonthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function currentMonthEnd() {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

// ── Icon components ───────────────────────────────────────────────────────────

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
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

// ── DrillDown rows ─────────────────────────────────────────────────────────────

function DrillDownRows({ lines }: { lines: SalesLineItem[] }) {
  if (lines.length === 0) {
    return (
      <tr>
        <td colSpan={8} className="px-8 py-4 text-center text-xs text-gray-500">
          Энэ ангилалд мэдээлэл олдсонгүй.
        </td>
      </tr>
    );
  }
  return (
    <>
      {lines.map((line, idx) => {
        const dateStr = salesFormatDate(line.appointmentScheduledAt || line.visitDate);
        const patientStr = salesFormatPatient(line.patientOvog, line.patientName);
        return (
          <tr key={`${line.invoiceId}-${idx}`} className="border-t border-blue-100 bg-blue-50/30">
            <td className="hidden xl:table-cell py-2 pl-8 pr-3 text-xs text-gray-700">#{line.invoiceId}</td>
            <td className="px-3 py-2 text-xs text-gray-700">{dateStr}</td>
            <td className="px-3 py-2 text-xs text-gray-700">{patientStr}</td>
            <td className="hidden sm:table-cell px-3 py-2 text-xs text-gray-700">{line.serviceName}</td>
            <td className="hidden lg:table-cell px-3 py-2 text-right text-xs text-gray-700">{fmtMnt(line.priceMnt)}</td>
            <td className="hidden lg:table-cell px-3 py-2 text-right text-xs text-gray-700">
              {line.discountMnt > 0 ? fmtMnt(line.discountMnt) : "-"}
            </td>
            <td className="px-3 py-2 text-right text-xs font-semibold text-gray-800">
              {fmtMnt(line.allocatedPaidMnt)}
            </td>
            <td className="hidden md:table-cell px-3 py-2 text-xs text-gray-700">{line.paymentMethodLabel || "-"}</td>
          </tr>
        );
      })}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DoctorSalesPage() {
  const [startDate, setStartDate] = useState<string>(currentMonthStart);
  const [endDate, setEndDate] = useState<string>(currentMonthEnd);

  const [salesData, setSalesData] = useState<SalesDetailsResponse | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState("");

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [categoryLines, setCategoryLines] = useState<Record<string, SalesLineItem[] | null | undefined>>({});
  const [categoryErrors, setCategoryErrors] = useState<Record<string, string>>({});

  const fetchSalesData = useCallback(async () => {
    if (!startDate || !endDate) return;
    setSalesLoading(true);
    setSalesError("");
    try {
      const res = await fetch(
        `/api/doctor/sales-details?startDate=${startDate}&endDate=${endDate}`,
        { credentials: "include" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Борлуулалтын мэдээлэл ачаалахад алдаа гарлаа.");
      setSalesData(json);
      setExpandedCategories(new Set());
      setCategoryLines({});
      setCategoryErrors({});
    } catch (e: any) {
      setSalesError(e?.message || "Борлуулалтын мэдээлэл ачаалахад алдаа гарлаа.");
      setSalesData(null);
    } finally {
      setSalesLoading(false);
    }
  }, [startDate, endDate]);

  const fetchCategoryLines = useCallback(
    async (categoryKey: string) => {
      let shouldFetch = true;
      setCategoryLines((prev) => {
        if (prev[categoryKey] !== undefined) {
          shouldFetch = false;
          return prev;
        }
        return { ...prev, [categoryKey]: null };
      });
      if (!shouldFetch) return;
      try {
        const res = await fetch(
          `/api/doctor/sales-details/lines?startDate=${startDate}&endDate=${endDate}&category=${categoryKey}`,
          { credentials: "include" }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Дэлгэрэнгүй мэдээлэл ачаалахад алдаа гарлаа.");
        setCategoryLines((prev) => ({ ...prev, [categoryKey]: json }));
      } catch (e: any) {
        setCategoryErrors((prev) => ({ ...prev, [categoryKey]: e?.message || "Алдаа гарлаа" }));
        setCategoryLines((prev) => ({ ...prev, [categoryKey]: [] }));
      }
    },
    [startDate, endDate]
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

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 12px 0" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: "#0f2044" }}>
          Борлуулалт
        </h1>

        {/* Date range filter */}
        <div
          style={{
            background: "white",
            borderRadius: 12,
            padding: "12px 16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 4 }}>
                Эхлэх өдөр:
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13 }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 4 }}>
                Дуусах өдөр:
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13 }}
              />
            </div>
            <button
              type="button"
              onClick={fetchSalesData}
              disabled={salesLoading || !startDate || !endDate}
              style={{
                background: salesLoading ? "#9ca3af" : "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: 6,
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: 600,
                cursor: salesLoading ? "not-allowed" : "pointer",
              }}
            >
              {salesLoading ? "Ачаалж байна..." : "Харах"}
            </button>
          </div>
        </div>

        {salesError && (
          <div
            style={{
              background: "#fee2e2",
              color: "#dc2626",
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            {salesError}
          </div>
        )}

        {!salesLoading && salesData && (
          <>
            {/* Totals summary */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  flex: "1 1 140px",
                  background: "white",
                  borderRadius: 12,
                  padding: "14px 18px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
                }}
              >
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Нийт борлуулалт</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>
                  {fmtMnt(salesData.totals.totalSalesMnt)}
                </div>
              </div>
              <div
                style={{
                  flex: "1 1 140px",
                  background: "white",
                  borderRadius: 12,
                  padding: "14px 18px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
                }}
              >
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Нийт эмчийн хувь</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>
                  {fmtMnt(salesData.totals.totalIncomeMnt)}
                </div>
              </div>
            </div>

            {/* Categories table */}
            <div
              style={{
                background: "white",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
                marginBottom: 24,
              }}
            >
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead style={{ background: "#f9fafb" }}>
                    <tr>
                      <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 600, color: "#374151", borderBottom: "1px solid #e5e7eb" }}>
                        Ангилал
                      </th>
                      <th className="hidden sm:table-cell" style={{ textAlign: "right", padding: "10px 14px", fontWeight: 600, color: "#374151", borderBottom: "1px solid #e5e7eb" }}>
                        Хувь (%)
                      </th>
                      <th style={{ textAlign: "right", padding: "10px 14px", fontWeight: 600, color: "#374151", borderBottom: "1px solid #e5e7eb" }}>
                        Борлуулалт
                      </th>
                      <th style={{ textAlign: "right", padding: "10px 14px", fontWeight: 600, color: "#374151", borderBottom: "1px solid #e5e7eb" }}>
                        Эмчийн хувь
                      </th>
                      <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 600, color: "#374151", borderBottom: "1px solid #e5e7eb" }}>
                        Үйлдэл
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesData.categories.map((row) => {
                      const isOpen = expandedCategories.has(row.key);
                      const lines = categoryLines[row.key];
                      const lineError = categoryErrors[row.key];
                      return (
                        <React.Fragment key={row.key}>
                          <tr style={{ borderTop: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "10px 14px" }}>{row.label}</td>
                            <td className="hidden sm:table-cell" style={{ padding: "10px 14px", textAlign: "right" }}>{Number(row.pctUsed || 0)}%</td>
                            <td style={{ padding: "10px 14px", textAlign: "right" }}>{fmtMnt(row.salesMnt)}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right" }}>{fmtMnt(row.incomeMnt)}</td>
                            <td style={{ padding: "10px 14px", textAlign: "center" }}>
                              <button
                                type="button"
                                aria-label={isOpen ? "Хаах" : "Дэлгэрэнгүй харах"}
                                onClick={() => toggleCategory(row.key)}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  border: "1px solid #d1d5db",
                                  borderRadius: 4,
                                  background: "white",
                                  padding: 5,
                                  cursor: "pointer",
                                  color: "#4b5563",
                                }}
                              >
                                <ChevronIcon open={isOpen} />
                              </button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td colSpan={5} style={{ padding: 0 }}>
                                <div style={{ borderTop: "1px solid #bfdbfe", background: "rgba(239,246,255,0.5)" }}>
                                  {lines === null ? (
                                    <p style={{ padding: "10px 32px", fontSize: 12, color: "#6b7280" }}>
                                      Ачаалж байна...
                                    </p>
                                  ) : lineError ? (
                                    <p style={{ padding: "10px 32px", fontSize: 12, color: "#dc2626" }}>{lineError}</p>
                                  ) : (
                                    <div style={{ overflowX: "auto" }}>
                                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                        <thead style={{ background: "#eff6ff" }}>
                                          <tr>
                                            <th className="hidden xl:table-cell" style={{ textAlign: "left", padding: "7px 10px 7px 32px", fontWeight: 600, color: "#374151" }}>
                                              Нэхэмжлэл #
                                            </th>
                                            <th style={{ textAlign: "left", padding: "7px 10px", fontWeight: 600, color: "#374151" }}>
                                              Огноо
                                            </th>
                                            <th style={{ textAlign: "left", padding: "7px 10px", fontWeight: 600, color: "#374151" }}>
                                              Үйлчлүүлэгч
                                            </th>
                                            <th className="hidden sm:table-cell" style={{ textAlign: "left", padding: "7px 10px", fontWeight: 600, color: "#374151" }}>
                                              Үйлчилгээ
                                            </th>
                                            <th className="hidden lg:table-cell" style={{ textAlign: "right", padding: "7px 10px", fontWeight: 600, color: "#374151" }}>
                                              Үнийн дүн
                                            </th>
                                            <th className="hidden lg:table-cell" style={{ textAlign: "right", padding: "7px 10px", fontWeight: 600, color: "#374151" }}>
                                              Хөнгөлөлт
                                            </th>
                                            <th style={{ textAlign: "right", padding: "7px 10px", fontWeight: 600, color: "#374151" }}>
                                              Нийт
                                            </th>
                                            <th className="hidden md:table-cell" style={{ textAlign: "left", padding: "7px 10px", fontWeight: 600, color: "#374151" }}>
                                              Төлбөрийн хэрэгсэл
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          <DrillDownRows lines={lines ?? []} />
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
                   <tfoot style={{ background: "#f9fafb" }}>
                    <tr style={{ borderTop: "2px solid #e5e7eb", fontWeight: 700 }}>
                      <td style={{ padding: "10px 14px" }}>Нийт</td>
                      <td className="hidden sm:table-cell" style={{ padding: "10px 14px" }} />
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        {fmtMnt(salesData.totals.totalSalesMnt)}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        {fmtMnt(salesData.totals.totalIncomeMnt)}
                      </td>
                      <td style={{ padding: "10px 14px" }} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
  );
}

