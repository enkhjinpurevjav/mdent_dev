import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  ComposedChart,
  LineChart,
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

type PatientDay = {
  date: string;
  total: number;
  newCount: number;
  returningCount: number;
};

type BranchPatientEntry = {
  branchId: number;
  branchName: string;
  daily: PatientDay[];
};

type RatesDay = {
  date: string;
  total: number;
  fillRate: number;
  noShowRate: number;
  cancelRate: number;
};

type BranchRatesEntry = {
  branchId: number;
  branchName: string;
  daily: RatesDay[];
};

type HourLoad = { hour: number; filled: number; possible: number };
type HourLoadDay = { date: string; isWeekend: boolean; hours: HourLoad[] };
type BranchHourLoadEntry = {
  branchId: number;
  branchName: string;
  daily: HourLoadDay[];
};

type AppointmentsReportData = {
  branches: Branch[];
  patientDailyData: PatientDay[];
  branchPatientDailyData: BranchPatientEntry[];
  ratesDailyData: RatesDay[];
  branchRatesDailyData: BranchRatesEntry[];
  hourLoadDailyData: HourLoadDay[];
  branchHourLoadDailyData: BranchHourLoadEntry[];
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

const MS_PER_DAY = 86400000;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function currentYearRange() {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
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

/** Aggregate patient daily rows into monthly buckets for year view */
function aggregatePatientMonthly(rows: PatientDay[]) {
  const map: Record<
    string,
    { label: string; total: number; newCount: number; returningCount: number }
  > = {};
  for (const r of rows) {
    const m = Number(r.date.slice(5, 7)) - 1;
    const bucket = r.date.slice(0, 7);
    if (!map[bucket])
      map[bucket] = {
        label: MONTH_LABELS[m],
        total: 0,
        newCount: 0,
        returningCount: 0,
      };
    map[bucket].total += r.total;
    map[bucket].newCount += r.newCount;
    map[bucket].returningCount += r.returningCount;
  }
  return Object.values(map);
}

/** Aggregate rates daily rows into monthly buckets for year view */
function aggregateRatesMonthly(rows: RatesDay[]) {
  const map: Record<
    string,
    {
      label: string;
      total: number;
      fillSum: number;
      noShowSum: number;
      cancelSum: number;
      count: number;
    }
  > = {};
  for (const r of rows) {
    const m = Number(r.date.slice(5, 7)) - 1;
    const bucket = r.date.slice(0, 7);
    if (!map[bucket])
      map[bucket] = {
        label: MONTH_LABELS[m],
        total: 0,
        fillSum: 0,
        noShowSum: 0,
        cancelSum: 0,
        count: 0,
      };
    map[bucket].total += r.total;
    map[bucket].fillSum += r.fillRate;
    map[bucket].noShowSum += r.noShowRate;
    map[bucket].cancelSum += r.cancelRate;
    map[bucket].count += 1;
  }
  return Object.values(map).map((v) => ({
    label: v.label,
    total: v.total,
    fillRate: v.count > 0 ? Math.round((v.fillSum / v.count) * 10) / 10 : 0,
    noShowRate: v.count > 0 ? Math.round((v.noShowSum / v.count) * 10) / 10 : 0,
    cancelRate: v.count > 0 ? Math.round((v.cancelSum / v.count) * 10) / 10 : 0,
  }));
}

/** Build patient chart data for year view */
function buildPatientYearChartData(
  totalDailyData: PatientDay[],
  branchDailyData: BranchPatientEntry[]
) {
  const totalByMonth = aggregatePatientMonthly(totalDailyData);
  // per-branch monthly totals
  const branchBuckets: Record<
    string,
    Record<string, { total: number; newCount: number; returningCount: number }>
  > = {};
  for (const b of branchDailyData) {
    for (const r of b.daily) {
      const bucket = r.date.slice(0, 7);
      if (!branchBuckets[bucket]) branchBuckets[bucket] = {};
      if (!branchBuckets[bucket][b.branchName])
        branchBuckets[bucket][b.branchName] = {
          total: 0,
          newCount: 0,
          returningCount: 0,
        };
      branchBuckets[bucket][b.branchName].total += r.total;
      branchBuckets[bucket][b.branchName].newCount += r.newCount;
      branchBuckets[bucket][b.branchName].returningCount += r.returningCount;
    }
  }

  return totalByMonth.map((t) => {
    const bucket = Object.keys(branchBuckets).find(
      (b) => MONTH_LABELS[Number(b.slice(5, 7)) - 1] === t.label
    );
    const row: Record<string, unknown> = {
      label: t.label,
      total: t.total,
      newCount: t.newCount,
      returningCount: t.returningCount,
    };
    if (bucket) {
      for (const [bName, vals] of Object.entries(branchBuckets[bucket])) {
        row[bName] = vals.total;
        row[`${bName}_new`] = vals.newCount;
        row[`${bName}_ret`] = vals.returningCount;
      }
    }
    return row;
  });
}

/** Build patient chart data for daily range view */
function buildPatientDailyChartData(
  totalDailyData: PatientDay[],
  branchDailyData: BranchPatientEntry[]
) {
  const branchByDate: Record<
    string,
    Record<string, { total: number; newCount: number; returningCount: number }>
  > = {};
  for (const b of branchDailyData) {
    for (const r of b.daily) {
      if (!branchByDate[r.date]) branchByDate[r.date] = {};
      branchByDate[r.date][b.branchName] = {
        total: r.total,
        newCount: r.newCount,
        returningCount: r.returningCount,
      };
    }
  }
  return totalDailyData.map((r) => {
    const row: Record<string, unknown> = {
      label: r.date.slice(5),
      total: r.total,
      newCount: r.newCount,
      returningCount: r.returningCount,
    };
    for (const [bName, vals] of Object.entries(branchByDate[r.date] || {})) {
      row[bName] = vals.total;
      row[`${bName}_new`] = vals.newCount;
      row[`${bName}_ret`] = vals.returningCount;
    }
    return row;
  });
}

/** Build rates chart data for year view */
function buildRatesYearChartData(
  totalDailyData: RatesDay[],
  branchDailyData: BranchRatesEntry[]
) {
  const totalByMonth = aggregateRatesMonthly(totalDailyData);
  const branchBuckets: Record<
    string,
    Record<
      string,
      { fillSum: number; noShowSum: number; cancelSum: number; count: number }
    >
  > = {};
  for (const b of branchDailyData) {
    for (const r of b.daily) {
      const bucket = r.date.slice(0, 7);
      if (!branchBuckets[bucket]) branchBuckets[bucket] = {};
      if (!branchBuckets[bucket][b.branchName])
        branchBuckets[bucket][b.branchName] = {
          fillSum: 0,
          noShowSum: 0,
          cancelSum: 0,
          count: 0,
        };
      branchBuckets[bucket][b.branchName].fillSum += r.fillRate;
      branchBuckets[bucket][b.branchName].noShowSum += r.noShowRate;
      branchBuckets[bucket][b.branchName].cancelSum += r.cancelRate;
      branchBuckets[bucket][b.branchName].count += 1;
    }
  }

  return totalByMonth.map((t) => {
    const bucket = Object.keys(branchBuckets).find(
      (b) => MONTH_LABELS[Number(b.slice(5, 7)) - 1] === t.label
    );
    const row: Record<string, unknown> = {
      label: t.label,
      fillRate: t.fillRate,
      noShowRate: t.noShowRate,
      cancelRate: t.cancelRate,
    };
    if (bucket) {
      for (const [bName, vals] of Object.entries(branchBuckets[bucket])) {
        const cnt = vals.count;
        row[`${bName}_fill`] = cnt > 0 ? Math.round((vals.fillSum / cnt) * 10) / 10 : 0;
        row[`${bName}_noShow`] = cnt > 0 ? Math.round((vals.noShowSum / cnt) * 10) / 10 : 0;
        row[`${bName}_cancel`] = cnt > 0 ? Math.round((vals.cancelSum / cnt) * 10) / 10 : 0;
      }
    }
    return row;
  });
}

/** Build rates chart data for daily range view */
function buildRatesDailyChartData(
  totalDailyData: RatesDay[],
  branchDailyData: BranchRatesEntry[]
) {
  const branchByDate: Record<
    string,
    Record<string, { fillRate: number; noShowRate: number; cancelRate: number }>
  > = {};
  for (const b of branchDailyData) {
    for (const r of b.daily) {
      if (!branchByDate[r.date]) branchByDate[r.date] = {};
      branchByDate[r.date][b.branchName] = {
        fillRate: r.fillRate,
        noShowRate: r.noShowRate,
        cancelRate: r.cancelRate,
      };
    }
  }
  return totalDailyData.map((r) => {
    const row: Record<string, unknown> = {
      label: r.date.slice(5),
      fillRate: r.fillRate,
      noShowRate: r.noShowRate,
      cancelRate: r.cancelRate,
    };
    for (const [bName, vals] of Object.entries(branchByDate[r.date] || {})) {
      row[`${bName}_fill`] = vals.fillRate;
      row[`${bName}_noShow`] = vals.noShowRate;
      row[`${bName}_cancel`] = vals.cancelRate;
    }
    return row;
  });
}

// ─────────────────────────────────────────────
// Shared UI components
// ─────────────────────────────────────────────
function CollapseButton({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
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

// ─────────────────────────────────────────────
// Patient Chart Tooltip – shows Нийт first, with new/returning breakdown
// Uses payload[0].payload to access all chart data fields directly
// ─────────────────────────────────────────────
function PatientTooltip({
  active,
  label,
  payload,
  branchNames,
}: {
  active?: boolean;
  label?: string | number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: ReadonlyArray<any>;
  branchNames: string[];
}) {
  if (!active || !payload?.length) return null;

  // Raw data row for this x-axis point
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataRow: Record<string, any> = payload[0]?.payload ?? {};

  const total = (dataRow.total as number) ?? 0;
  const newCount = (dataRow.newCount as number) ?? 0;
  const returningCount = (dataRow.returningCount as number) ?? 0;

  // Build branch entries from rendered Bar series
  const barEntries = (payload as ReadonlyArray<{ dataKey: string; name: string; value: number; fill?: string; color?: string }>)
    .filter((p) => branchNames.includes(String(p.dataKey ?? p.name)))
    .map((p) => {
      const bName = String(p.dataKey ?? p.name);
      return {
        name: bName,
        total: (p.value as number) ?? 0,
        newCount: (dataRow[`${bName}_new`] as number) ?? 0,
        returningCount: (dataRow[`${bName}_ret`] as number) ?? 0,
        color: p.fill || p.color || "#ccc",
      };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div className="bg-white rounded shadow-md p-3 text-sm border border-gray-100 min-w-[200px]">
      {label && <div className="mb-2 font-medium text-gray-700">{label}</div>}
      {/* Нийт first */}
      <div className="mb-1.5 pb-1.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
          <span className="font-semibold text-gray-900">Нийт: {total.toLocaleString("mn-MN")}</span>
        </div>
        <div className="ml-4 text-xs text-gray-500 mt-0.5">
          Шинэ: {newCount.toLocaleString("mn-MN")} · Давтан: {returningCount.toLocaleString("mn-MN")}
        </div>
      </div>
      {/* Branches */}
      {barEntries.map((b) => (
        <div key={b.name} className="mb-1">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: b.color }}
            />
            <span className="text-gray-700">{b.name}: {b.total.toLocaleString("mn-MN")}</span>
          </div>
          <div className="ml-4 text-xs text-gray-500 mt-0.5">
            Шинэ: {b.newCount.toLocaleString("mn-MN")} · Давтан:{" "}
            {b.returningCount.toLocaleString("mn-MN")}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Rates Tooltip – Нийт first, then fill/no-show/cancel
// ─────────────────────────────────────────────
function RatesTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string | number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: ReadonlyArray<any>;
}) {
  if (!active || !payload?.length) return null;
  const items = payload as ReadonlyArray<{
    name: string | number;
    value: number;
    color?: string;
    stroke?: string;
  }>;

  // We want lines named "Цаг дүүргэлт (%)", "Ирээгүй (%)", "Цуцалсан (%)" first (Нийт lines)
  const niitiKeys = ["Цаг дүүргэлт (%)", "Ирээгүй (%)", "Цуцалсан (%)"];
  const niiti = items.filter((p) => niitiKeys.includes(String(p.name)));
  const others = items.filter((p) => !niitiKeys.includes(String(p.name)));

  return (
    <div className="bg-white rounded shadow-md p-2 text-sm border border-gray-100 min-w-[200px]">
      {label && <div className="mb-1 font-medium text-gray-700">{label}</div>}
      {[...niiti, ...others].map((item) => (
        <div key={item.name} className="flex items-center gap-2 py-0.5">
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: item.color || item.stroke || "#ccc",
            }}
          />
          <span className={niitiKeys.includes(String(item.name)) ? "font-semibold text-gray-900" : "text-gray-700"}>
            {item.name}:
          </span>
          <span className={niitiKeys.includes(String(item.name)) ? "font-bold text-gray-900 ml-auto" : "ml-auto text-gray-800"}>
            {item.value.toLocaleString("mn-MN")} %
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Section 1: Үйлчлүүлэгчдийн тоо
// ─────────────────────────────────────────────
function PatientCountBlock({
  patientDailyData,
  branchPatientDailyData,
  isYearView,
  branchNames,
  hasBranchFilter,
}: {
  patientDailyData: PatientDay[];
  branchPatientDailyData: BranchPatientEntry[];
  isYearView: boolean;
  branchNames: string[];
  hasBranchFilter: boolean;
}) {
  const [tableOpen, setTableOpen] = useState(false);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);

  const chartData = useMemo(
    () =>
      isYearView
        ? buildPatientYearChartData(patientDailyData, branchPatientDailyData)
        : buildPatientDailyChartData(patientDailyData, branchPatientDailyData),
    [patientDailyData, branchPatientDailyData, isYearView]
  );

  // Branch breakdown for legend – Нийт first, then branches sorted by total
  const branchBreakdown = useMemo<
    {
      name: string;
      total: number;
      newCount: number;
      returningCount: number;
      color: string;
    }[]
  >(() => {
    let rows: {
      name: string;
      total: number;
      newCount: number;
      returningCount: number;
    }[];

    if (hoveredLabel) {
      const row = chartData.find((r) => r.label === hoveredLabel);
      rows = branchNames.map((bName) => ({
        name: bName,
        total: row ? ((row[bName] as number) || 0) : 0,
        newCount: row ? ((row[`${bName}_new`] as number) || 0) : 0,
        returningCount: row ? ((row[`${bName}_ret`] as number) || 0) : 0,
      }));
    } else {
      rows = branchPatientDailyData.map((b) => ({
        name: b.branchName,
        total: b.daily.reduce((s, d) => s + d.total, 0),
        newCount: b.daily.reduce((s, d) => s + d.newCount, 0),
        returningCount: b.daily.reduce((s, d) => s + d.returningCount, 0),
      }));
    }

    const totalData = hoveredLabel
      ? chartData.find((r) => r.label === hoveredLabel)
      : null;
    const totalValue = hoveredLabel
      ? ((totalData?.total as number) || 0)
      : patientDailyData.reduce((s, d) => s + d.total, 0);
    const totalNew = hoveredLabel
      ? ((totalData?.newCount as number) || 0)
      : patientDailyData.reduce((s, d) => s + d.newCount, 0);
    const totalReturning = hoveredLabel
      ? ((totalData?.returningCount as number) || 0)
      : patientDailyData.reduce((s, d) => s + d.returningCount, 0);

    const sorted = [...rows].sort((a, b) => b.total - a.total);
    return [
      {
        name: "Нийт",
        total: totalValue,
        newCount: totalNew,
        returningCount: totalReturning,
        color: "#10b981",
      },
      ...sorted.map((r, i) => ({
        ...r,
        color:
          BRANCH_COLORS[
            branchNames.findIndex((n) => n === r.name) % BRANCH_COLORS.length
          ] || BRANCH_COLORS[i % BRANCH_COLORS.length],
      })),
    ];
  }, [hoveredLabel, chartData, branchNames, branchPatientDailyData, patientDailyData]);

  // Pie data: branch contribution by patient count
  const pieData = useMemo(
    () =>
      branchPatientDailyData
        .map((b, i) => ({
          name: b.branchName,
          value: b.daily.reduce((s, d) => s + d.total, 0),
          color: BRANCH_COLORS[i % BRANCH_COLORS.length],
        }))
        .filter((b) => b.value > 0),
    [branchPatientDailyData]
  );

  // Table rows
  const tableRows = useMemo(() => {
    return chartData.map((r) => {
      const row: Record<string, unknown> = {
        Огноо: r.label,
        Нийт: r.total,
        "Нийт-Шинэ": r.newCount,
        "Нийт-Давтан": r.returningCount,
      };
      for (const bName of branchNames) {
        if (hasBranchFilter) {
          row[`${bName}`] = (r[bName] as number) ?? 0;
          row[`${bName}-Шинэ`] = (r[`${bName}_new`] as number) ?? 0;
          row[`${bName}-Давтан`] = (r[`${bName}_ret`] as number) ?? 0;
        } else {
          row[bName] = (r[bName] as number) ?? 0;
        }
      }
      return row;
    });
  }, [chartData, branchNames, hasBranchFilter]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4">
      <h3 className="text-lg font-bold text-gray-800">Үйлчлүүлэгчдийн тоо</h3>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── Main chart ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart
              data={chartData}
              margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
              onMouseMove={(state) => {
                if (state?.activeLabel)
                  setHoveredLabel(state.activeLabel as string);
              }}
              onMouseLeave={() => setHoveredLabel(null)}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                content={(props) => (
                  <PatientTooltip {...props} branchNames={branchNames} />
                )}
              />
              {/* Нийт green line – rendered first so it appears first in tooltip */}
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
                  radius={
                    idx === branchNames.length - 1
                      ? [4, 4, 0, 0]
                      : [0, 0, 0, 0]
                  }
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>

          {/* ── Legend: Нийт first, then branches sorted by total ── */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 px-1">
            {branchBreakdown.map((item) => (
              <div key={item.name} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 text-sm">
                  <span
                    className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span
                    className={
                      item.name === "Нийт"
                        ? "font-semibold text-gray-900"
                        : "text-gray-700"
                    }
                  >
                    {item.name}:
                  </span>
                  <span
                    className={
                      item.name === "Нийт"
                        ? "font-bold text-gray-900"
                        : "text-gray-800"
                    }
                  >
                    {item.total.toLocaleString("mn-MN")}
                  </span>
                </div>
                <div className="ml-5 text-xs text-gray-500">
                  Шинэ: {item.newCount.toLocaleString("mn-MN")} · Давтан:{" "}
                  {item.returningCount.toLocaleString("mn-MN")}
                </div>
              </div>
            ))}
            {hoveredLabel && (
              <span className="text-xs text-gray-400 self-center">
                ({hoveredLabel})
              </span>
            )}
          </div>

          {/* ── Collapsible table ── */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="flex items-center px-4 py-2 bg-gray-50 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Хүснэгт
              </span>
              <CollapseButton
                open={tableOpen}
                onClick={() => setTableOpen((v) => !v)}
              />
            </div>
            {tableOpen && (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">
                          {isYearView ? "Сар" : "Огноо"}
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">
                          Нийт
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">
                          Шинэ
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">
                          Давтан
                        </th>
                        {branchNames.map((bName) =>
                          hasBranchFilter ? (
                            <React.Fragment key={bName}>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">
                                {bName}
                              </th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">
                                {bName}-Шинэ
                              </th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">
                                {bName}-Давтан
                              </th>
                            </React.Fragment>
                          ) : (
                            <th
                              key={bName}
                              className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap"
                            >
                              {bName}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.map((r, i) => (
                        <tr
                          key={i}
                          className="border-t border-gray-100 hover:bg-gray-50"
                        >
                          <td className="px-3 py-1.5 text-gray-700">
                            {r.label as string}
                          </td>
                          <td className="px-3 py-1.5 text-right text-gray-800 font-semibold">
                            {(r.total as number).toLocaleString("mn-MN")}
                          </td>
                          <td className="px-3 py-1.5 text-right text-gray-700">
                            {((r.newCount as number) ?? 0).toLocaleString("mn-MN")}
                          </td>
                          <td className="px-3 py-1.5 text-right text-gray-700">
                            {((r.returningCount as number) ?? 0).toLocaleString("mn-MN")}
                          </td>
                          {branchNames.map((bName) =>
                            hasBranchFilter ? (
                              <React.Fragment key={bName}>
                                <td className="px-3 py-1.5 text-right text-gray-700">
                                  {((r[bName] as number) ?? 0).toLocaleString("mn-MN")}
                                </td>
                                <td className="px-3 py-1.5 text-right text-gray-700">
                                  {((r[`${bName}_new`] as number) ?? 0).toLocaleString("mn-MN")}
                                </td>
                                <td className="px-3 py-1.5 text-right text-gray-700">
                                  {((r[`${bName}_ret`] as number) ?? 0).toLocaleString("mn-MN")}
                                </td>
                              </React.Fragment>
                            ) : (
                              <td
                                key={bName}
                                className="px-3 py-1.5 text-right text-gray-700"
                              >
                                {((r[bName] as number) ?? 0).toLocaleString("mn-MN")}
                              </td>
                            )
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 border-t border-gray-100">
                  <button
                    onClick={() =>
                      downloadCSV("Үйлчлүүлэгчдийн_тоо_chart.csv", tableRows)
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

        {/* ── Right: Pie + Breakdown ── */}
        <div className="w-full lg:w-72 flex flex-col gap-3">
          <p className="text-sm font-semibold text-gray-600">
            Салбарын хувь нэмэр
            {hoveredLabel && (
              <span className="text-gray-400 font-normal ml-1">
                ({hoveredLabel})
              </span>
            )}
          </p>
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
                  {pieData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={BRANCH_COLORS[index % BRANCH_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => [
                    v.toLocaleString("mn-MN") + " үйлчлүүлэгч",
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

          {/* Branch breakdown table */}
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">
                    Салбар
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">
                    Нийт
                  </th>
                </tr>
              </thead>
              <tbody>
                {branchBreakdown.map((item, i) => (
                  <tr
                    key={item.name}
                    className="border-t border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-3 py-1.5 flex items-center gap-2">
                      <span
                        className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span
                        className={
                          i === 0
                            ? "font-semibold text-gray-900"
                            : "text-gray-700"
                        }
                      >
                        {item.name}
                      </span>
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right ${
                        i === 0
                          ? "font-bold text-gray-900"
                          : "font-medium text-gray-800"
                      }`}
                    >
                      {item.total.toLocaleString("mn-MN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => {
              const rows = branchBreakdown.map((b) => ({
                Салбар: b.name,
                Нийт: b.total,
                Шинэ: b.newCount,
                Давтан: b.returningCount,
              }));
              downloadCSV("Үйлчлүүлэгчдийн_тоо_салбар.csv", rows);
            }}
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
// Section 2: Захиалгын хувь
// ─────────────────────────────────────────────
function AppointmentRatesBlock({
  ratesDailyData,
  branchRatesDailyData,
  isYearView,
  branchNames,
  hourLoadDailyData,
}: {
  ratesDailyData: RatesDay[];
  branchRatesDailyData: BranchRatesEntry[];
  isYearView: boolean;
  branchNames: string[];
  hourLoadDailyData: HourLoadDay[];
}) {
  const [tableOpen, setTableOpen] = useState(false);

  const chartData = useMemo(
    () =>
      isYearView
        ? buildRatesYearChartData(ratesDailyData, branchRatesDailyData)
        : buildRatesDailyChartData(ratesDailyData, branchRatesDailyData),
    [ratesDailyData, branchRatesDailyData, isYearView]
  );

  // Table rows
  const tableRows = useMemo(() => {
    return chartData.map((r) => {
      const row: Record<string, unknown> = {
        Огноо: r.label,
        "Цаг дүүргэлт (%)": r.fillRate,
        "Ирээгүй (%)": r.noShowRate,
        "Цуцалсан (%)": r.cancelRate,
      };
      for (const bName of branchNames) {
        row[`${bName} Цаг дүүргэлт (%)`] = (r[`${bName}_fill`] as number) ?? 0;
        row[`${bName} Ирээгүй (%)`] = (r[`${bName}_noShow`] as number) ?? 0;
        row[`${bName} Цуцалсан (%)`] = (r[`${bName}_cancel`] as number) ?? 0;
      }
      return row;
    });
  }, [chartData, branchNames]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4">
      <h3 className="text-lg font-bold text-gray-800">Захиалгын хувь</h3>

      <div className="flex flex-col gap-3">
        {/* ── Main chart ── */}
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={chartData}
            margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
            <Tooltip content={(props) => <RatesTooltip {...props} />} />
            <Legend
              formatter={(value) => (
                <span className="text-xs text-gray-700">{value}</span>
              )}
            />
            {/* Нийт lines first so they appear first in legend/tooltip */}
            <Line
              type="monotone"
              dataKey="fillRate"
              name="Цаг дүүргэлт (%)"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="noShowRate"
              name="Ирээгүй (%)"
              stroke="#f59e0b"
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="cancelRate"
              name="Цуцалсан (%)"
              stroke="#ef4444"
              strokeWidth={2.5}
              dot={false}
            />
            {/* Per-branch lines (dashed) */}
            {branchNames.map((bName, idx) => (
              <React.Fragment key={bName}>
                <Line
                  type="monotone"
                  dataKey={`${bName}_fill`}
                  name={`${bName} Цаг дүүргэлт`}
                  stroke={BRANCH_COLORS[idx % BRANCH_COLORS.length]}
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey={`${bName}_noShow`}
                  name={`${bName} Ирээгүй`}
                  stroke={BRANCH_COLORS[idx % BRANCH_COLORS.length]}
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey={`${bName}_cancel`}
                  name={`${bName} Цуцалсан`}
                  stroke={BRANCH_COLORS[idx % BRANCH_COLORS.length]}
                  strokeWidth={1}
                  strokeDasharray="1 4"
                  dot={false}
                />
              </React.Fragment>
            ))}
          </LineChart>
        </ResponsiveContainer>

        {/* ── Collapsible table ── */}
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <div className="flex items-center px-4 py-2 bg-gray-50 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Хүснэгт
            </span>
            <CollapseButton
              open={tableOpen}
              onClick={() => setTableOpen((v) => !v)}
            />
          </div>
          {tableOpen && (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">
                        {isYearView ? "Сар" : "Огноо"}
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">
                        Цаг дүүргэлт (%)
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">
                        Ирээгүй (%)
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">
                        Цуцалсан (%)
                      </th>
                      {branchNames.map((bName) => (
                        <React.Fragment key={bName}>
                          <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">
                            {bName} Дүүргэлт
                          </th>
                          <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">
                            {bName} Ирээгүй
                          </th>
                          <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">
                            {bName} Цуцалсан
                          </th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((r, i) => (
                      <tr
                        key={i}
                        className="border-t border-gray-100 hover:bg-gray-50"
                      >
                        <td className="px-3 py-1.5 text-gray-700">
                          {r.label as string}
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-800 font-semibold">
                          {(r.fillRate as number).toLocaleString("mn-MN")} %
                        </td>
                        <td className="px-3 py-1.5 text-right text-amber-700 font-semibold">
                          {(r.noShowRate as number).toLocaleString("mn-MN")} %
                        </td>
                        <td className="px-3 py-1.5 text-right text-red-700 font-semibold">
                          {(r.cancelRate as number).toLocaleString("mn-MN")} %
                        </td>
                        {branchNames.map((bName) => (
                          <React.Fragment key={bName}>
                            <td className="px-3 py-1.5 text-right text-gray-700">
                              {((r[`${bName}_fill`] as number) ?? 0).toLocaleString("mn-MN")} %
                            </td>
                            <td className="px-3 py-1.5 text-right text-gray-700">
                              {((r[`${bName}_noShow`] as number) ?? 0).toLocaleString("mn-MN")} %
                            </td>
                            <td className="px-3 py-1.5 text-right text-gray-700">
                              {((r[`${bName}_cancel`] as number) ?? 0).toLocaleString("mn-MN")} %
                            </td>
                          </React.Fragment>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t border-gray-100">
                <button
                  onClick={() =>
                    downloadCSV("Захиалгын_хувь_chart.csv", tableRows)
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

      {/* ── Ачаалал table ── */}
      <LoadTableBlock
        hourLoadDailyData={hourLoadDailyData}
        isYearView={isYearView}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// Section 2b: Ачаалал (Load table by hour slot)
// ─────────────────────────────────────────────
function formatHourSlotLabel(hour: number): string {
  const h = String(hour).padStart(2, "0");
  const h1 = String(hour + 1).padStart(2, "0");
  return `${h}:00–${h1}:00`;
}

function loadPctColor(pct: number | null): string {
  if (pct === null) return "text-gray-300";
  if (pct >= 80) return "text-red-700 font-bold";
  if (pct >= 50) return "text-amber-600 font-semibold";
  if (pct >= 20) return "text-green-700 font-semibold";
  return "text-gray-500";
}

function loadPctBg(pct: number | null): string {
  if (pct === null) return "";
  if (pct >= 80) return "bg-red-50";
  if (pct >= 50) return "bg-amber-50";
  if (pct >= 20) return "bg-green-50";
  return "";
}

function LoadTableBlock({
  hourLoadDailyData,
  isYearView,
}: {
  hourLoadDailyData: HourLoadDay[];
  isYearView: boolean;
}) {
  const [tableOpen, setTableOpen] = useState(false);

  const { columns, rows, csvRows } = useMemo(() => {
    // Columns are always months (year view) or days (date-range view).
    // hourLoadDailyData is already scoped to the selected branch by the backend
    // when a branchId filter is applied, so we always use it as the data source.
    const hourSet = new Set<number>();
    for (const day of hourLoadDailyData) {
      for (const h of day.hours) hourSet.add(h.hour);
    }
    const allHours = Array.from(hourSet).sort((a, b) => a - b);

      if (isYearView) {
        // Group by month
        const monthMap = new Map<
          string,
          {
            label: string;
            hourData: Map<number, { filled: number; possible: number }>;
          }
        >();
        for (const day of hourLoadDailyData) {
          const monthKey = day.date.slice(0, 7);
          const monthIdx = Number(day.date.slice(5, 7)) - 1;
          if (!monthMap.has(monthKey)) {
            monthMap.set(monthKey, {
              label: MONTH_LABELS[monthIdx],
              hourData: new Map(),
            });
          }
          const entry = monthMap.get(monthKey)!;
          for (const h of day.hours) {
            const ex = entry.hourData.get(h.hour) || {
              filled: 0,
              possible: 0,
            };
            ex.filled += h.filled;
            ex.possible += h.possible;
            entry.hourData.set(h.hour, ex);
          }
        }
        const sortedMonths = Array.from(monthMap.entries()).sort(([a], [b]) =>
          a.localeCompare(b)
        );
        const colDefs = sortedMonths.map(([, v]) => ({ label: v.label, hourData: v.hourData }));

        const tableRows: {
          hourLabel: string;
          hour: number;
          values: (number | null)[];
        }[] = [];
        for (const hour of allHours) {
          const values = colDefs.map(({ hourData }) => {
            const hd = hourData.get(hour);
            if (!hd || hd.possible === 0) return null;
            return Math.round((hd.filled / hd.possible) * 100);
          });
          if (values.some((v) => v !== null)) {
            tableRows.push({
              hourLabel: formatHourSlotLabel(hour),
              hour,
              values,
            });
          }
        }

        const csvRows = tableRows.map((r) => {
          const row: Record<string, unknown> = { Цаг: r.hourLabel };
          colDefs.forEach((c, i) => {
            row[c.label] = r.values[i] !== null ? `${r.values[i]}%` : "–";
          });
          return row;
        });

        return {
          columns: colDefs.map((c) => c.label),
          rows: tableRows,
          csvRows,
        };
      } else {
        // Columns = individual days
        const dayMap = new Map<
          string,
          {
            label: string;
            hourData: Map<number, { filled: number; possible: number }>;
          }
        >();
        for (const day of hourLoadDailyData) {
          if (!dayMap.has(day.date)) {
            dayMap.set(day.date, {
              label: `${parseInt(day.date.slice(5, 7), 10)}-${parseInt(day.date.slice(8, 10), 10)}`,
              hourData: new Map(),
            });
          }
          const entry = dayMap.get(day.date)!;
          for (const h of day.hours) {
            entry.hourData.set(h.hour, { filled: h.filled, possible: h.possible });
          }
        }
        const sortedDays = Array.from(dayMap.entries()).sort(([a], [b]) =>
          a.localeCompare(b)
        );

        const tableRows: {
          hourLabel: string;
          hour: number;
          values: (number | null)[];
        }[] = [];
        for (const hour of allHours) {
          const values = sortedDays.map(([, { hourData }]) => {
            const hd = hourData.get(hour);
            if (!hd || hd.possible === 0) return null;
            return Math.round((hd.filled / hd.possible) * 100);
          });
          if (values.some((v) => v !== null)) {
            tableRows.push({
              hourLabel: formatHourSlotLabel(hour),
              hour,
              values,
            });
          }
        }

        const csvRows = tableRows.map((r) => {
          const row: Record<string, unknown> = { Цаг: r.hourLabel };
          sortedDays.forEach(([, { label }], i) => {
            row[label] = r.values[i] !== null ? `${r.values[i]}%` : "–";
          });
          return row;
        });

        return {
          columns: sortedDays.map(([, { label }]) => label),
          rows: tableRows,
          csvRows,
        };
      }
  }, [
    hourLoadDailyData,
    isYearView,
  ]);

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <div className="flex items-center px-4 py-2 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Ачаалал
        </span>
        <CollapseButton
          open={tableOpen}
          onClick={() => setTableOpen((v) => !v)}
        />
      </div>
      {tableOpen && (
        <>
          {rows.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap sticky left-0 bg-gray-50 z-10">
                        Цаг
                      </th>
                      {columns.map((col) => (
                        <th
                          key={col}
                          className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.hour}
                        className="border-t border-gray-100 hover:bg-gray-50"
                      >
                        <td className="px-3 py-1.5 font-medium text-gray-700 whitespace-nowrap sticky left-0 bg-gray-50 z-10">
                          {row.hourLabel}
                        </td>
                        {row.values.map((v, i) => (
                          <td
                            key={i}
                            className={`px-3 py-1.5 text-right ${loadPctColor(v)} ${loadPctBg(v)}`}
                          >
                            {v !== null ? `${v}%` : "–"}
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
                    downloadCSV("Ачаалал.csv", csvRows)
                  }
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  CSV татах
                </button>
              </div>
            </>
          ) : (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">
              Өгөгдөл байхгүй байна
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────
export default function AppointmentsReportPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>(""); // "" = all

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [data, setData] = useState<AppointmentsReportData | null>(null);
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
      const range = !from && !to ? currentYearRange() : { from, to };
      if (!range.from || !range.to) return;

      const params = new URLSearchParams({ from: range.from, to: range.to });
      if (branchId) params.set("branchId", branchId);
      const res = await fetch(`/api/reports/appointments-report?${params}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Тайлан ачааллахад алдаа гарлаа");
      } else {
        setData(json as AppointmentsReportData);
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
  const hasBranchFilter = Boolean(branchId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Page header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Цаг захиалга</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Үйлчлүүлэгчдийн тоо · Захиалгын хувь
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
              onClick={() => {
                setFrom("");
                setTo("");
              }}
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

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="flex flex-col gap-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-gray-100 h-64 animate-pulse"
              />
            ))}
          </div>
        )}

        {/* ── Sections ── */}
        {!loading && data && (
          <>
            <PatientCountBlock
              patientDailyData={data.patientDailyData}
              branchPatientDailyData={data.branchPatientDailyData}
              isYearView={isYearView}
              branchNames={branchNamesForChart}
              hasBranchFilter={hasBranchFilter}
            />
            <AppointmentRatesBlock
              ratesDailyData={data.ratesDailyData}
              branchRatesDailyData={data.branchRatesDailyData}
              isYearView={isYearView}
              branchNames={branchNamesForChart}
              hourLoadDailyData={data.hourLoadDailyData ?? []}
            />
          </>
        )}
      </div>
    </div>
  );
}
