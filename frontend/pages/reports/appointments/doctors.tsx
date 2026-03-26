/**
 * Үндсэн тайлан → Цаг захиалга → Эмч
 *
 * Admin-only report page showing doctor income performance.
 * Uses the same "Эмчийн орлого" calculation as Санхүү → Эмчийн Орлогын Тайлан.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type Branch = { id: number; name: string };
type Doctor = { id: number; name: string | null; ovog: string | null; branchId: number | null };

type SeriesPoint = { key: string; salesMnt: number; incomeMnt: number };
type BreakdownRow = { id: string | number; label: string; salesMnt: number; incomeMnt: number; pctSales: number; pctIncome: number };
type Breakdown = { type: "branches" | "doctors" | "categories"; rows: BreakdownRow[] };

type ReportData = {
  mode: "monthly" | "daily";
  year: number;
  startDate: string;
  endDate: string;
  scope: { branchId: number | null; doctorId: number | null };
  series: SeriesPoint[];
  totalSalesMnt: number;
  totalIncomeMnt: number;
  breakdown: Breakdown;
  filters: { branches: Branch[]; doctors: Doctor[] };
};

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const MONTH_LABELS = [
  "1-р сар", "2-р сар", "3-р сар", "4-р сар",
  "5-р сар", "6-р сар", "7-р сар", "8-р сар",
  "9-р сар", "10-р сар", "11-р сар", "12-р сар",
];

const BREAKDOWN_COLORS = [
  "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899",
  "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6",
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function formatMoney(v: number) {
  return "₮" + Math.round(v).toLocaleString("mn-MN");
}

function seriesLabel(key: string, mode: "monthly" | "daily"): string {
  if (mode === "monthly") {
    const m = Number(key.slice(5, 7)) - 1;
    return MONTH_LABELS[m] ?? key;
  }
  // daily: show MM/DD
  return key.slice(5).replace("-", "/");
}

// ─────────────────────────────────────────────
// Tooltip component
// ─────────────────────────────────────────────
function ChartTooltip({
  active,
  label,
  payload,
  metricLabel = "Орлого:",
  barColor = "#3b82f6",
}: {
  active?: boolean;
  label?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: ReadonlyArray<any>;
  metricLabel?: string;
  barColor?: string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-white rounded shadow-md p-2 text-sm border border-gray-100 min-w-[160px]">
      {label && <div className="mb-1 font-medium text-gray-700">{label}</div>}
      <div className="flex items-center gap-2">
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: item.fill || barColor,
          }}
        />
        <span className="text-gray-700">{metricLabel}</span>
        <span className="font-bold text-gray-900 ml-auto">
          {formatMoney(item.value)}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Breakdown panel (right side)
// ─────────────────────────────────────────────
function BreakdownPanel({
  breakdown,
  total,
  metric = "income",
  title,
}: {
  breakdown: Breakdown;
  total: number;
  metric?: "sales" | "income";
  title?: string;
}) {
  const typeLabel: Record<string, string> = {
    branches: "Салбарын оролцоо",
    doctors: "Эмчийн оролцоо",
    categories: "Бүрдүүлэлтийн ангилал",
  };

  const rows = breakdown.rows;

  const pieData = rows.map((r, i) => ({
    name: r.label,
    value: metric === "sales" ? r.salesMnt : r.incomeMnt,
    color: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length],
  }));

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4 min-w-0">
      <div>
        {title && (
          <h3 className="text-sm font-bold text-gray-800 mb-0.5">{title}</h3>
        )}
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {typeLabel[breakdown.type] ?? "Задаргаа"}
        </h3>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">Мэдээлэл байхгүй</p>
      ) : (
        <>
          {/* Donut chart */}
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="80%"
                  paddingAngle={2}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [formatMoney(value), "Дүн"]}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span className="text-xs text-gray-600">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                  <th className="py-2 text-left font-semibold">Нэр</th>
                  <th className="py-2 text-right font-semibold">Дүн</th>
                  <th className="py-2 text-right font-semibold">Хувь</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const amt = metric === "sales" ? r.salesMnt : r.incomeMnt;
                  const pct = metric === "sales" ? r.pctSales : r.pctIncome;
                  return (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 flex items-center gap-2">
                        <span
                          style={{
                            display: "inline-block",
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length],
                            flexShrink: 0,
                          }}
                        />
                        <span className="text-gray-800 truncate">{r.label}</span>
                      </td>
                      <td className="py-2 text-right font-medium text-gray-900">
                        {formatMoney(amt)}
                      </td>
                      <td className="py-2 text-right text-gray-500">
                        {pct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {total > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-200">
                    <td className="py-2 font-semibold text-gray-700">Нийт</td>
                    <td className="py-2 text-right font-bold text-gray-900">
                      {formatMoney(total)}
                    </td>
                    <td className="py-2 text-right text-gray-500">100%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────
export default function DoctorIncomeReportPage() {
  // Filter state
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [branchId, setBranchId] = useState<string>("");
  const [doctorId, setDoctorId] = useState<string>("");

  // Applied filters (after clicking Шүүх)
  const [appliedStart, setAppliedStart] = useState("");
  const [appliedEnd, setAppliedEnd] = useState("");
  const [appliedBranchId, setAppliedBranchId] = useState<string>("");
  const [appliedDoctorId, setAppliedDoctorId] = useState<string>("");

  // Data state
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Derived: doctor list filtered to selected branch (from filters.doctors)
  const availableDoctors: Doctor[] = data?.filters.doctors ?? [];

  const loadReport = useCallback(async (
    start: string, end: string, bid: string, did: string
  ) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (start) params.set("startDate", start);
      if (end) params.set("endDate", end);
      if (bid) params.set("branchId", bid);
      if (did) params.set("doctorId", did);
      if (!start && !end) {
        params.set("year", String(new Date().getFullYear()));
      }

      const res = await fetch(
        `/api/admin/reports/appointments/doctors-income?${params}`,
        { credentials: "include" }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Тайлан ачааллахад алдаа гарлаа");
        setData(null);
      } else {
        setData(json as ReportData);
      }
    } catch {
      setError("Сүлжээний алдаа гарлаа");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount with defaults
  useEffect(() => {
    loadReport("", "", "", "");
  }, [loadReport]);

  // When branch changes in filter, clear doctor selector
  const handleBranchChange = (val: string) => {
    setBranchId(val);
    setDoctorId("");
  };

  // Apply filters
  const handleFilter = () => {
    setAppliedStart(startDate);
    setAppliedEnd(endDate);
    setAppliedBranchId(branchId);
    setAppliedDoctorId(doctorId);
    loadReport(startDate, endDate, branchId, doctorId);
  };

  // Clear filters
  const handleClear = () => {
    setStartDate("");
    setEndDate("");
    setBranchId("");
    setDoctorId("");
    setAppliedStart("");
    setAppliedEnd("");
    setAppliedBranchId("");
    setAppliedDoctorId("");
    loadReport("", "", "", "");
  };

  // Chart data
  const chartData = (data?.series ?? []).map((s) => ({
    label: seriesLabel(s.key, data?.mode ?? "monthly"),
    salesMnt: s.salesMnt,
    incomeMnt: s.incomeMnt,
  }));

  const hasFilters = Boolean(startDate || endDate || branchId || doctorId);

  // Determine Y-axis tick formatter (compact)
  function formatYAxis(v: number) {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "М";
    if (v >= 1_000) return (v / 1_000).toFixed(0) + "К";
    return String(v);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Эмч</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Эмчийн орлогын гүйцэтгэл · Цаг захиалга
        </p>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Filter bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-4 items-end">
          {/* Start date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Эхлэх огноо
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* End date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Дуусах огноо
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Branch selector */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Салбар
            </label>
            <select
              value={branchId}
              onChange={(e) => handleBranchChange(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[160px]"
            >
              <option value="">Бүх салбар</option>
              {(data?.filters.branches ?? []).map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Doctor selector — only enabled when branch is selected */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Эмч
            </label>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              disabled={!branchId}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[180px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">
                {branchId ? "Бүх эмч" : "Салбар сонгоно уу"}
              </option>
              {branchId &&
                availableDoctors.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.ovog ? `${d.ovog.charAt(0)}. ` : ""}
                    {d.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 mt-auto">
            {hasFilters && (
              <button
                onClick={handleClear}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Цэвэрлэх
              </button>
            )}
            <button
              onClick={handleFilter}
              disabled={loading}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Ачааллаж байна..." : "Шүүх"}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
            Ачааллаж байна...
          </div>
        )}

        {/* Report content */}
        {data && (
          <>
            {/* Summary card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-wrap items-start gap-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center bg-blue-50">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Нийт борлуулалт
                    {data.mode === "monthly"
                      ? ` · ${data.year} он`
                      : ` · ${data.startDate} – ${data.endDate}`}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mt-0.5">
                    {formatMoney(data.totalSalesMnt)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {data.mode === "monthly" ? "Сарын задаргаа" : "Өдрийн задаргаа"}
                    {appliedBranchId && data.filters.branches.find((b) => String(b.id) === appliedBranchId)
                      ? ` · ${data.filters.branches.find((b) => String(b.id) === appliedBranchId)?.name}`
                      : ""}
                    {appliedDoctorId && availableDoctors.find((d) => String(d.id) === appliedDoctorId)
                      ? ` · ${availableDoctors.find((d) => String(d.id) === appliedDoctorId)?.name}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center bg-purple-50">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Нийт эмчийн орлого
                    {data.mode === "monthly"
                      ? ` · ${data.year} он`
                      : ` · ${data.startDate} – ${data.endDate}`}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mt-0.5">
                    {formatMoney(data.totalIncomeMnt)}
                  </p>
                </div>
              </div>
            </div>

            {/* Chart + Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left: two charts stacked */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                {/* Sales chart */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
                  <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Борлуулалтын орлого ·{" "}
                    {data.mode === "monthly"
                      ? `${data.year} он — сарын задаргаа`
                      : `${data.startDate} – ${data.endDate} (өдрийн задаргаа)`}
                  </h2>

                  {chartData.length === 0 ? (
                    <p className="text-sm text-gray-400">Мэдээлэл байхгүй</p>
                  ) : (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={chartData}
                          margin={{ top: 4, right: 8, left: 4, bottom: 4 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: "#6b7280" }}
                            axisLine={false}
                            tickLine={false}
                            interval={data.mode === "daily" && chartData.length > 20 ? Math.floor(chartData.length / 10) : 0}
                          />
                          <YAxis
                            tickFormatter={formatYAxis}
                            tick={{ fontSize: 11, fill: "#6b7280" }}
                            axisLine={false}
                            tickLine={false}
                            width={56}
                          />
                          <Tooltip content={<ChartTooltip metricLabel="Борлуулалт:" barColor="#3b82f6" />} />
                          <Bar dataKey="salesMnt" radius={[4, 4, 0, 0]} maxBarSize={48}>
                            {chartData.map((_, i) => (
                              <Cell key={i} fill="#3b82f6" opacity={0.85} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Income chart */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
                  <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Эмчийн орлого ·{" "}
                    {data.mode === "monthly"
                      ? `${data.year} он — сарын задаргаа`
                      : `${data.startDate} – ${data.endDate} (өдрийн задаргаа)`}
                  </h2>

                  {chartData.length === 0 ? (
                    <p className="text-sm text-gray-400">Мэдээлэл байхгүй</p>
                  ) : (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={chartData}
                          margin={{ top: 4, right: 8, left: 4, bottom: 4 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: "#6b7280" }}
                            axisLine={false}
                            tickLine={false}
                            interval={data.mode === "daily" && chartData.length > 20 ? Math.floor(chartData.length / 10) : 0}
                          />
                          <YAxis
                            tickFormatter={formatYAxis}
                            tick={{ fontSize: 11, fill: "#6b7280" }}
                            axisLine={false}
                            tickLine={false}
                            width={56}
                          />
                          <Tooltip content={<ChartTooltip metricLabel="Эмчийн орлого:" barColor="#8b5cf6" />} />
                          <Bar dataKey="incomeMnt" radius={[4, 4, 0, 0]} maxBarSize={48}>
                            {chartData.map((_, i) => (
                              <Cell key={i} fill="#8b5cf6" opacity={0.85} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Series table */}
                  {data.series.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 select-none">
                        Хүснэгт харах
                      </summary>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                              <th className="py-2 text-left font-semibold">
                                {data.mode === "monthly" ? "Сар" : "Огноо"}
                              </th>
                              <th className="py-2 text-right font-semibold">Борлуулалт</th>
                              <th className="py-2 text-right font-semibold">Эмчийн орлого</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.series.map((s) => (
                              <tr key={s.key} className="border-b border-gray-50 hover:bg-gray-50">
                                <td className="py-1.5 text-gray-700">
                                  {seriesLabel(s.key, data.mode)}
                                </td>
                                <td className="py-1.5 text-right font-medium text-gray-900">
                                  {formatMoney(s.salesMnt)}
                                </td>
                                <td className="py-1.5 text-right font-medium text-gray-900">
                                  {formatMoney(s.incomeMnt)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </div>
              </div>

              {/* Right: two breakdown panels stacked */}
              <div className="flex flex-col gap-4">
                <BreakdownPanel
                  breakdown={data.breakdown}
                  total={data.totalSalesMnt}
                  metric="sales"
                  title="Борлуулалтын орлого"
                />
                <BreakdownPanel
                  breakdown={data.breakdown}
                  total={data.totalIncomeMnt}
                  metric="income"
                  title="Эмчийн орлого"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
