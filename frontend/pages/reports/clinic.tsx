import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type Branch = { id: number; name: string };

type TopCards = {
  todayRevenue: number;
  todayOccupancyPct: number;
  monthlyAvgRevenue: number;
};

type DailyRow = {
  date: string;
  revenue: number;
  occupancyPct: number;
  doctorCount: number;
  completedAppointments: number;
};

type BranchDailyEntry = {
  branchId: number;
  branchName: string;
  daily: DailyRow[];
};

type BreakdownItem = {
  branchId?: number;
  branchName?: string;
  doctorId?: number;
  doctorName?: string;
  value: number;
};

type BreakdownGroup = {
  revenue: BreakdownItem[];
  occupancy: BreakdownItem[];
  doctorCount: BreakdownItem[];
  completedAppointments: BreakdownItem[];
};

type ClinicReportData = {
  topCards: TopCards;
  branches: Branch[];
  dailyData: DailyRow[];
  branchDailyData: BranchDailyEntry[];
  branchBreakdown: BreakdownGroup;
  doctorBreakdown: BreakdownGroup | null;
};

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const BRANCH_COLORS = [
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
  "#14b8a6",
];

const MONTH_LABELS = [
  "1-р сар",
  "2-р сар",
  "3-р сар",
  "4-р сар",
  "5-р сар",
  "6-р сар",
  "7-р сар",
  "8-р сар",
  "9-р сар",
  "10-р сар",
  "11-р сар",
  "12-р сар",
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function formatMoney(v: number) {
  return "₮" + v.toLocaleString("mn-MN");
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function currentYearRange() {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

type MetricKey = "revenue" | "occupancyPct" | "doctorCount" | "completedAppointments";

/** Aggregate daily rows into monthly buckets (for year view) */
function aggregateMonthly(rows: DailyRow[], key: MetricKey) {
  const map: Record<string, { label: string; value: number; count: number }> = {};
  for (const r of rows) {
    const m = Number(r.date.slice(5, 7)) - 1;
    const bucket = r.date.slice(0, 7);
    if (!map[bucket]) map[bucket] = { label: MONTH_LABELS[m], value: 0, count: 0 };
    map[bucket].value += r[key];
    map[bucket].count += 1;
  }
  return Object.values(map).map((v) => ({
    label: v.label,
    value: key === "occupancyPct" && v.count > 0 ? Math.round(v.value / v.count) : v.value,
  }));
}

/** Build combined chart data for year view (per-branch bars + total line) */
function buildYearChartData(
  totalDailyData: DailyRow[],
  branchDailyData: BranchDailyEntry[],
  key: MetricKey
) {
  const totalByMonth = aggregateMonthly(totalDailyData, key);
  // Build per-branch monthly sums: { "YYYY-MM": { branchName: value } }
  const branchBuckets: Record<string, Record<string, { sum: number; cnt: number }>> = {};
  for (const b of branchDailyData) {
    for (const r of b.daily) {
      const bucket = r.date.slice(0, 7);
      if (!branchBuckets[bucket]) branchBuckets[bucket] = {};
      if (!branchBuckets[bucket][b.branchName])
        branchBuckets[bucket][b.branchName] = { sum: 0, cnt: 0 };
      branchBuckets[bucket][b.branchName].sum += r[key];
      branchBuckets[bucket][b.branchName].cnt += 1;
    }
  }

  return totalByMonth.map((t) => {
    // Find the bucket matching this label
    const bucket = Object.keys(branchBuckets).find(
      (b) => MONTH_LABELS[Number(b.slice(5, 7)) - 1] === t.label
    );
    const branchValues: Record<string, number> = {};
    if (bucket) {
      for (const [bName, { sum, cnt }] of Object.entries(branchBuckets[bucket])) {
        branchValues[bName] = key === "occupancyPct" && cnt > 0 ? Math.round(sum / cnt) : sum;
      }
    }
    return { label: t.label, total: t.value, ...branchValues };
  });
}

/** Build combined chart data for daily range view */
function buildDailyChartData(
  totalDailyData: DailyRow[],
  branchDailyData: BranchDailyEntry[],
  key: MetricKey
) {
  const branchByDate: Record<string, Record<string, number>> = {};
  for (const b of branchDailyData) {
    for (const r of b.daily) {
      if (!branchByDate[r.date]) branchByDate[r.date] = {};
      branchByDate[r.date][b.branchName] = r[key];
    }
  }
  return totalDailyData.map((r) => ({
    label: r.date.slice(5),
    total: r[key],
    ...(branchByDate[r.date] || {}),
  }));
}

/** Download array-of-objects as CSV */
function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")
    ),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Sanitize a string for use as a CSV filename */
function sanitizeFilename(name: string) {
  return name.replace(/[^\w\u0400-\u04FF]/g, "_");
}

/** Aggregate a DailyRow array into a single period value for the given key */
function aggregatePeriodValue(rows: DailyRow[], key: MetricKey): number {
  if (rows.length === 0) return 0;
  if (key === "occupancyPct") {
    const vals = rows.map((d) => d.occupancyPct);
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  }
  return rows.reduce((sum, d) => sum + (d[key] as number), 0);
}

const MS_PER_DAY = 86400000;

/** Top summary card */
function SummaryCard({
  title,
  value,
  subtitle,
  colorClass,
  icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  colorClass: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4 min-w-0">
      <div className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${colorClass}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900 truncate mt-0.5">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Collapse/expand icon button */
function CollapseButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="ml-auto flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
      title={open ? "Хураах" : "Дэлгэх"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className={`w-5 h-5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

/** A single metric block: chart + pie + collapsible table + CSV */
function MetricBlock({
  title,
  dailyData,
  branchDailyData,
  dataKey,
  unit,
  breakdownItems,
  breakdownLabel,
  isYearView,
  branchNames,
}: {
  title: string;
  dailyData: DailyRow[];
  branchDailyData: BranchDailyEntry[];
  dataKey: MetricKey;
  unit: string;
  breakdownItems: BreakdownItem[];
  breakdownLabel: string;
  isYearView: boolean;
  branchNames: string[];
}) {
  const [tableOpen, setTableOpen] = useState(false);

  const chartData = isYearView
    ? buildYearChartData(dailyData, branchDailyData, dataKey)
    : buildDailyChartData(dailyData, branchDailyData, dataKey);

  // Нийт column first, then branches
  const tableRows: Record<string, unknown>[] = chartData.map((r) => {
    const row: Record<string, unknown> = {
      Огноо: r.label,
      Нийт: String(r.total) + (unit ? ` ${unit}` : ""),
    };
    for (const bName of branchNames) {
      const v = (r as Record<string, unknown>)[bName];
      row[bName] = v !== undefined ? String(v) + (unit ? ` ${unit}` : "") : "-";
    }
    return row;
  });

  // Compute period breakdown from the same data source as the chart (branchDailyData),
  // so pie/table values always match chart values. For the "Нийт" total we use dailyData.
  const effectiveBreakdown = useMemo<BreakdownItem[]>(() => {
    // Detect doctor-level breakdown (single branch filtered) – can't recompute from daily data
    const isDocBreakdown =
      breakdownItems.length > 0 && breakdownItems[0]?.doctorId != null;

    let items: BreakdownItem[];
    if (isDocBreakdown) {
      items = breakdownItems;
    } else {
      // Re-derive from branchDailyData to match chart calculation exactly
      items = branchDailyData.map((b) => ({
        branchId: b.branchId,
        branchName: b.branchName,
        value: aggregatePeriodValue(b.daily, dataKey),
      }));
    }

    // Compute "Нийт" total from dailyData (same as chart's "total" line)
    const totalValue = aggregatePeriodValue(dailyData, dataKey);

    // "Нийт" always first
    return [{ branchName: "Нийт", value: totalValue }, ...items];
  }, [breakdownItems, branchDailyData, dailyData, dataKey]);

  // Pie slices = branches only (Нийт is not a slice – it's the whole pie)
  const pieSlices = effectiveBreakdown.slice(1).filter((b) => b.value > 0);
  const pieData = pieSlices.map((b) => ({
    name: b.branchName || b.doctorName || "",
    value: b.value,
  }));

  // CSV for the pie/salbar section – Нийт first (effectiveBreakdown already ordered)
  const pieTableRows = effectiveBreakdown.map((b) => ({
    [breakdownLabel]: b.branchName || b.doctorName || "",
    [title]: b.value + (unit ? ` ${unit}` : ""),
  }));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4">
      <h3 className="text-lg font-bold text-gray-800">{title}</h3>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── Main chart ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number, name: string) => [
                  v.toLocaleString("mn-MN") + (unit ? " " + unit : ""),
                  name,
                ]}
              />
              <Legend />
              {/* Render "Нийт" (total line) FIRST so it always appears first in tooltip and legend */}
              <Line
                type="monotone"
                dataKey="total"
                name="Нийт"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={false}
              />
              {branchNames.map((bName, idx) => (
                <Bar
                  key={bName}
                  dataKey={bName}
                  stackId="branches"
                  fill={BRANCH_COLORS[idx % BRANCH_COLORS.length]}
                  radius={idx === branchNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>

          {/* ── Collapsible table ── */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="flex items-center px-4 py-2 bg-gray-50 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Хүснэгт
              </span>
              <CollapseButton open={tableOpen} onClick={() => setTableOpen((v) => !v)} />
            </div>
            {tableOpen && (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">
                          Огноо
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">
                          Нийт
                        </th>
                        {branchNames.map((bName) => (
                          <th
                            key={bName}
                            className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap"
                          >
                            {bName}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.map((r, i) => (
                        <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-1.5 text-gray-700">{r.label}</td>
                          <td className="px-3 py-1.5 text-right text-gray-800 font-semibold">
                            {r.total.toLocaleString("mn-MN")}
                            {unit ? ` ${unit}` : ""}
                          </td>
                          {branchNames.map((bName) => (
                            <td key={bName} className="px-3 py-1.5 text-right text-gray-700">
                              {(
                                ((r as Record<string, unknown>)[bName] as number | undefined) ?? 0
                              ).toLocaleString("mn-MN")}
                              {unit ? ` ${unit}` : ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 border-t border-gray-100">
                  <button
                    onClick={() =>
                      downloadCSV(`${sanitizeFilename(title)}_chart.csv`, tableRows)
                    }
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    CSV татах
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Pie / Салбар summary ── */}
        <div className="w-full lg:w-72 flex flex-col gap-3">
          <p className="text-sm font-semibold text-gray-600">{breakdownLabel}</p>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={46}
                  outerRadius={82}
                  paddingAngle={2}
                  dataKey="value"
                  labelLine={false}
                >
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={BRANCH_COLORS[index % BRANCH_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => [
                    v.toLocaleString("mn-MN") + (unit ? " " + unit : ""),
                    "",
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              Өгөгдөл байхгүй
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">
                    {breakdownLabel}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">
                    {unit ? `${title} (${unit})` : title}
                  </th>
                </tr>
              </thead>
              <tbody>
                {effectiveBreakdown.map((b, i) => {
                  const isTotal = i === 0;
                  return (
                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-1.5 flex items-center gap-2">
                        {isTotal ? (
                          <span className="inline-block w-3 h-3 rounded-full flex-shrink-0 bg-emerald-500" />
                        ) : (
                          <span
                            className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor:
                                BRANCH_COLORS[(i - 1) % BRANCH_COLORS.length],
                            }}
                          />
                        )}
                        <span
                          className={
                            isTotal
                              ? "text-gray-900 font-semibold"
                              : "text-gray-700"
                          }
                        >
                          {b.branchName || b.doctorName}
                        </span>
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right ${
                          isTotal
                            ? "text-gray-900 font-bold"
                            : "text-gray-800 font-medium"
                        }`}
                      >
                        {b.value.toLocaleString("mn-MN")}
                        {unit ? ` ${unit}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            onClick={() =>
              downloadCSV(`${sanitizeFilename(title)}_салбар.csv`, pieTableRows)
            }
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            CSV татах (задаргаа)
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────
export default function ClinicReportPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>(""); // "" = all

  // Date fields start empty → year view is the default
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [data, setData] = useState<ClinicReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load branches on mount
  useEffect(() => {
    fetch("/api/branches", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setBranches(d);
      })
      .catch(() => {});
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // When dates are empty → use current full year
      const range = !from && !to ? currentYearRange() : { from, to };
      if (!range.from || !range.to) return;

      const params = new URLSearchParams({ from: range.from, to: range.to });
      if (branchId) params.set("branchId", branchId);
      const res = await fetch(`/api/reports/clinic?${params}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Тайлан ачааллахад алдаа гарлаа");
      } else {
        setData(json as ClinicReportData);
      }
    } catch {
      setError("Сүлжээний алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  }, [from, to, branchId]);

  // Auto-load on mount and whenever filters change
  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // Year view when dates are empty, or range > 31 days
  const isYearView = (() => {
    if (!from && !to) return true;
    if (!from || !to) return false;
    const f = new Date(from);
    const t = new Date(to);
    return (t.getTime() - f.getTime()) / MS_PER_DAY > 31;
  })();

  const activeBranches: Branch[] = data?.branches ?? [];
  const branchNamesForChart = activeBranches.map((b) => b.name);

  const bd = data?.branchBreakdown;
  const dd = data?.doctorBreakdown;
  const pieBreakdown = (key: keyof BreakdownGroup) =>
    branchId && dd ? dd[key] : bd ? bd[key] : [];
  const pieLabel = branchId ? "Эмч" : "Салбар";

  const branchDailyData = data?.branchDailyData ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Page header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Эмнэлгийн тайлан</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Орлого · Цаг дүүргэлт · Ажилласан эмч · Захиалга
        </p>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* ── Shared filter ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Эхлэх огноо
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Дуусах огноо
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Салбар
            </label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[160px]"
            >
              <option value="">Бүх салбар</option>
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          {(from || to) && (
            <button
              onClick={() => { setFrom(""); setTo(""); }}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Цэвэрлэх
            </button>
          )}
          <button
            onClick={loadReport}
            disabled={loading}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Ачааллаж байна..." : "Шүүх"}
          </button>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* ── Top 3 cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard
            title="Өнөөдрийн орлого"
            value={data ? formatMoney(data.topCards.todayRevenue) : "—"}
            subtitle={`${todayStr()} · бүх салбар`}
            colorClass="bg-blue-50 text-blue-600"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <SummaryCard
            title="Өнөөдрийн цаг дүүргэлт"
            value={data ? `${data.topCards.todayOccupancyPct}%` : "—"}
            subtitle="Захиалгын / нийт боломжит цаг"
            colorClass="bg-emerald-50 text-emerald-600"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
          />
          <SummaryCard
            title="Өдрийн дундаж орлого"
            value={data ? formatMoney(data.topCards.monthlyAvgRevenue) : "—"}
            subtitle="Энэ сарын өнөөдрийг хүртэлх дундаж"
            colorClass="bg-amber-50 text-amber-600"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            }
          />
        </div>

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="flex flex-col gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 h-64 animate-pulse" />
            ))}
          </div>
        )}

        {/* ── Metric blocks ── */}
        {!loading && data && (
          <>
            <MetricBlock
              title="Орлого"
              dailyData={data.dailyData}
              branchDailyData={branchDailyData}
              dataKey="revenue"
              unit="₮"
              breakdownItems={pieBreakdown("revenue")}
              breakdownLabel={pieLabel}
              isYearView={isYearView}
              branchNames={branchNamesForChart}
            />
            <MetricBlock
              title="Цаг дүүргэлт"
              dailyData={data.dailyData}
              branchDailyData={branchDailyData}
              dataKey="occupancyPct"
              unit="%"
              breakdownItems={pieBreakdown("occupancy")}
              breakdownLabel={pieLabel}
              isYearView={isYearView}
              branchNames={branchNamesForChart}
            />
            <MetricBlock
              title="Ажилласан эмчийн тоо"
              dailyData={data.dailyData}
              branchDailyData={branchDailyData}
              dataKey="doctorCount"
              unit=""
              breakdownItems={pieBreakdown("doctorCount")}
              breakdownLabel={pieLabel}
              isYearView={isYearView}
              branchNames={branchNamesForChart}
            />
            <MetricBlock
              title="Захиалгын тоо (Дууссан)"
              dailyData={data.dailyData}
              branchDailyData={branchDailyData}
              dataKey="completedAppointments"
              unit=""
              breakdownItems={pieBreakdown("completedAppointments")}
              breakdownLabel={pieLabel}
              isYearView={isYearView}
              branchNames={branchNamesForChart}
            />
          </>
        )}
      </div>
    </div>
  );
}
