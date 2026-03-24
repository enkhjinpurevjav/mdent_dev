import React, { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  LineChart,
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
  dailyData: DailyRow[];
  branchBreakdown: BreakdownGroup;
  doctorBreakdown: BreakdownGroup | null;
};

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
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

function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(now.getDate()).padStart(2, "0")}` };
}

/** Aggregate daily rows into monthly buckets (for year view) */
function aggregateMonthly(
  rows: DailyRow[],
  key: keyof Pick<DailyRow, "revenue" | "occupancyPct" | "doctorCount" | "completedAppointments">
) {
  const map: Record<string, { label: string; value: number; count: number }> = {};
  for (const r of rows) {
    const m = Number(r.date.slice(5, 7)) - 1; // 0-indexed
    const bucket = r.date.slice(0, 7); // "YYYY-MM"
    if (!map[bucket]) map[bucket] = { label: MONTH_LABELS[m], value: 0, count: 0 };
    if (key === "occupancyPct") {
      map[bucket].value += r[key];
      map[bucket].count += 1;
    } else {
      map[bucket].value += r[key];
      map[bucket].count += 1;
    }
  }
  return Object.values(map).map((v) => ({
    label: v.label,
    value: key === "occupancyPct" && v.count > 0 ? Math.round(v.value / v.count) : v.value,
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

const MS_PER_DAY = 86400000;

/** Top summary card */
function SummaryCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  color: string;
}) {
  return (
    <div className={`rounded-2xl p-5 shadow-sm border border-gray-100 bg-white flex flex-col gap-1 min-w-0`}>
      <span className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{title}</span>
      <span className="text-2xl font-bold text-gray-900 truncate">{value}</span>
      {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
    </div>
  );
}

/** A single metric block: chart + pie + table + CSV */
function MetricBlock({
  title,
  dailyData,
  dataKey,
  unit,
  breakdownItems,
  breakdownLabel,
  isYearView,
}: {
  title: string;
  dailyData: DailyRow[];
  dataKey: keyof Pick<DailyRow, "revenue" | "occupancyPct" | "doctorCount" | "completedAppointments">;
  unit: string;
  breakdownItems: BreakdownItem[];
  breakdownLabel: string;
  isYearView: boolean;
}) {
  // Build chart data
  const chartData = isYearView
    ? aggregateMonthly(dailyData, dataKey)
    : dailyData.map((r) => ({ label: r.date.slice(5), value: r[dataKey] }));

  // Table rows
  const tableRows: Record<string, unknown>[] = isYearView
    ? chartData.map((r) => ({ Огноо: r.label, [title]: r.value + (unit ? ` ${unit}` : "") }))
    : dailyData.map((r) => ({
        Огноо: r.date,
        [title]: r[dataKey] + (unit ? ` ${unit}` : ""),
      }));

  const pieData = breakdownItems
    .filter((b) => b.value > 0)
    .map((b) => ({
      name: b.branchName || b.doctorName || "",
      value: b.value,
    }));

  const pieTableRows = breakdownItems.map((b) => ({
    [breakdownLabel]: b.branchName || b.doctorName || "",
    [title]: b.value + (unit ? ` ${unit}` : ""),
  }));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800">{title}</h3>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main chart */}
        <div className="flex-1 min-w-0">
          <ResponsiveContainer width="100%" height={260}>
            {isYearView ? (
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [v + (unit ? " " + unit : ""), title]} />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [v + (unit ? " " + unit : ""), title]} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
          {/* Main table */}
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Огноо</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">{title}</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-700">{r.label}</td>
                    <td className="px-3 py-1.5 text-right text-gray-800 font-medium">
                      {r.value.toLocaleString("mn-MN")}{unit ? ` ${unit}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => downloadCSV(`${sanitizeFilename(title)}_chart.csv`, tableRows)}
            className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
          >
            CSV татах (график өгөгдөл)
          </button>
        </div>

        {/* Pie chart */}
        <div className="w-full lg:w-80 flex flex-col gap-4">
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name}: ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => [v.toLocaleString("mn-MN") + (unit ? " " + unit : ""), ""]}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              Өгөгдөл байхгүй
            </div>
          )}

          {/* Pie table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">{breakdownLabel}</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">{title}</th>
                </tr>
              </thead>
              <tbody>
                {breakdownItems.map((b, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-1.5 flex items-center gap-2">
                      <span
                        className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      <span className="text-gray-700">{b.branchName || b.doctorName}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-800 font-medium">
                      {b.value.toLocaleString("mn-MN")}{unit ? ` ${unit}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => downloadCSV(`${sanitizeFilename(title)}_pie.csv`, pieTableRows)}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            CSV татах (салбарын задаргаа)
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
  const defaultRange = currentMonthRange();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>(""); // "" = all
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);

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
    if (!from || !to) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to });
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

  // Auto-load when filters change
  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // Determine whether the selected range spans more than 1 month (use bar chart by month)
  const isYearView =
    data !== null &&
    (() => {
      const f = new Date(from);
      const t = new Date(to);
      const diffDays = (t.getTime() - f.getTime()) / MS_PER_DAY;
      return diffDays > 31;
    })();

  const bd = data?.branchBreakdown;
  const dd = data?.doctorBreakdown;
  // Use doctor breakdown for pie when a single branch is selected
  const pieBreakdown = (key: keyof BreakdownGroup) =>
    branchId && dd ? dd[key] : bd ? bd[key] : [];

  const pieLabel = branchId ? "Эмч" : "Салбар";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Эмнэлгийн тайлан</h1>
        <p className="text-sm text-gray-500 mt-0.5">Нэгтгэсэн тайлан · Орлого · Цаг дүүргэлт · Эмч · Захиалга</p>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* ── Shared filter ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Эхлэх огноо</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Дуусах огноо</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Салбар</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[160px]"
            >
              <option value="">Бүх салбар</option>
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>{b.name}</option>
              ))}
            </select>
          </div>
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
            color="text-blue-600"
          />
          <SummaryCard
            title="Өнөөдрийн цаг дүүргэлт"
            value={data ? `${data.topCards.todayOccupancyPct}%` : "—"}
            subtitle="Захиалагдсан цаг / нийт боломжит цаг"
            color="text-emerald-600"
          />
          <SummaryCard
            title="Өдрийн дундаж орлого"
            value={data ? formatMoney(data.topCards.monthlyAvgRevenue) : "—"}
            subtitle="Энэ сарын өнөөдрийг хүртэлх дундаж"
            color="text-amber-600"
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
            {/* 1. Revenue */}
            <MetricBlock
              title="Орлого"
              dailyData={data.dailyData}
              dataKey="revenue"
              unit="₮"
              breakdownItems={pieBreakdown("revenue")}
              breakdownLabel={pieLabel}
              isYearView={isYearView}
            />

            {/* 2. Occupancy */}
            <MetricBlock
              title="Цаг дүүргэлт"
              dailyData={data.dailyData}
              dataKey="occupancyPct"
              unit="%"
              breakdownItems={pieBreakdown("occupancy")}
              breakdownLabel={pieLabel}
              isYearView={isYearView}
            />

            {/* 3. Doctor count */}
            <MetricBlock
              title="Ажилласан эмчийн тоо"
              dailyData={data.dailyData}
              dataKey="doctorCount"
              unit=""
              breakdownItems={pieBreakdown("doctorCount")}
              breakdownLabel={pieLabel}
              isYearView={isYearView}
            />

            {/* 4. Completed appointments */}
            <MetricBlock
              title="Захиалгын тоо (Дууссан)"
              dailyData={data.dailyData}
              dataKey="completedAppointments"
              unit=""
              breakdownItems={pieBreakdown("completedAppointments")}
              breakdownLabel={pieLabel}
              isYearView={isYearView}
            />
          </>
        )}
      </div>
    </div>
  );
}
