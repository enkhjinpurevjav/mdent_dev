import React, { useCallback, useEffect, useState } from "react";
import {
  BarChart,
  Bar,
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
import {
  type DashboardMode,
  type BucketType,
  computeDateRange,
  formatBucketLabel,
  formatMntTick,
  getYearOptions,
} from "../../utils/dashboardDateUtils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SeriesItem {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  sales: number;
  income: number;
  completedAppointments: number;
  servicesCount: number;
  goalAchievementPct: number;
}

interface PieData {
  gender: { male: number; female: number; unknown: number };
  ageGroup: { kidUnder16: number; adult16Plus: number; unknownAge: number };
}

interface DashboardResponse {
  range: { startDate: string; endDate: string; bucket: string };
  series: SeriesItem[];
  pies: PieData;
  meta: { doctorId: number; monthlyGoalAmountMnt: number };
}

interface Props {
  doctorId?: number;
  /** If provided, fetch from this base path instead of the admin endpoint. */
  apiBasePath?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_LABELS: Record<number, string> = {
  1: "1 сар", 2: "2 сар", 3: "3 сар", 4: "4 сар",
  5: "5 сар", 6: "6 сар", 7: "7 сар", 8: "8 сар",
  9: "9 сар", 10: "10 сар", 11: "11 сар", 12: "12 сар",
};

const GENDER_COLORS = ["#3b82f6", "#ec4899", "#9ca3af"];
const AGE_COLORS = ["#22c55e", "#f59e0b", "#9ca3af"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function DoctorDashboardTab({ doctorId, apiBasePath }: Props) {
  const currentYear = new Date().getFullYear();
  const yearOptions = getYearOptions();

  const [mode, setMode] = useState<DashboardMode>("monthly");
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    const range = computeDateRange(
      mode,
      selectedYear,
      mode === "monthly" ? selectedMonth : null
    );
    if (!range) return;

    setLoading(true);
    setError(null);
    try {
      const base = apiBasePath
        ? apiBasePath
        : `/api/admin/doctors/${doctorId}/dashboard`;
      const url = `${base}?startDate=${range.startDate}&endDate=${range.endDate}&bucket=${range.bucket}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as DashboardResponse;
      setData(json);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Алдаа гарлаа";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [doctorId, apiBasePath, mode, selectedYear, selectedMonth]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  // ── Derived chart data ─────────────────────────────────────────────────────

  const bucket = (data?.range?.bucket ?? "month") as BucketType;

  const chartData = (data?.series ?? []).map((s) => ({
    ...s,
    xLabel: formatBucketLabel(s.key, bucket),
  }));

  const genderPieData = data
    ? [
        { name: "Эр", value: data.pies.gender.male },
        { name: "Эм", value: data.pies.gender.female },
        { name: "Тодорхойгүй", value: data.pies.gender.unknown },
      ]
    : [];

  const agePieData = data
    ? [
        { name: "Хүүхэд (<16)", value: data.pies.ageGroup.kidUnder16 },
        { name: "Насанд хүрэгч (≥16)", value: data.pies.ageGroup.adult16Plus },
        { name: "Нас тодорхойгүй", value: data.pies.ageGroup.unknownAge },
      ]
    : [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* ── Filter row ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Mode */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Шүүлт</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as DashboardMode)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="yearly">Жилээр</option>
            <option value="monthly">Сараар</option>
          </select>
        </div>

        {/* Year (all modes) */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Жил</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Month (monthly mode only) */}
        {mode === "monthly" && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Сар</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{MONTH_LABELS[m]}</option>
              ))}
            </select>
          </div>
        )}

        {/* Loading indicator */}
        {loading && (
          <div className="flex items-end pb-1">
            <span className="text-xs text-gray-400">Уншиж байна…</span>
          </div>
        )}
      </div>

      {/* ── Error state ──────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Charts ──────────────────────────────────────────────────────── */}
      {!loading && data && (
        <div className="flex flex-col gap-6">
          {/* C1: Sales & Income */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              Борлуулалт ба Эмчийн хувь (₮)
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 16, left: 0, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="xLabel"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickFormatter={formatMntTick}
                  width={56}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${value.toLocaleString()}₮`,
                    name,
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sales" name="Борлуулалт" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="income" name="Эмчийн хувь" fill="#22c55e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* C-goal: Goal achievement % */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              Гүйцэтгэл (%)
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 16, left: 0, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="xLabel"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickFormatter={(v: number) => `${v}%`}
                  width={48}
                />
                <Tooltip
                  formatter={(value: number) => [`${value.toFixed(1)}%`, "Гүйцэтгэл"]}
                />
                <Bar
                  dataKey="goalAchievementPct"
                  name="Гүйцэтгэл (%)"
                  fill="#f97316"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* C2: Completed appointments */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              Гүйцэтгэсэн үзлэгийн тоо
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 16, left: 0, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="xLabel"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} width={40} />
                <Tooltip formatter={(value: number) => [`${value}`, "Үзлэг"]} />
                <Bar
                  dataKey="completedAppointments"
                  name="Гүйцэтгэсэн үзлэг"
                  fill="#f59e0b"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* C3: Services count */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              Гүйцэтгэсэн үйлчилгээний тоо
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 16, left: 0, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="xLabel"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} width={40} />
                <Tooltip formatter={(value: number) => [`${value}`, "Үйлчилгээ"]} />
                <Bar
                  dataKey="servicesCount"
                  name="Үйлчилгээний тоо"
                  fill="#8b5cf6"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pies: gender & age group */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Gender pie */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Хүйсийн харьцаа
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={genderPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) =>
                      `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {genderPieData.map((_, i) => (
                      <Cell key={i} fill={GENDER_COLORS[i % GENDER_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`${v}`, "Тоо"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex gap-4 justify-center mt-1 text-xs text-gray-500">
                {genderPieData.map((d, i) => (
                  <span key={d.name} className="flex items-center gap-1">
                    <span
                      className="inline-block w-3 h-3 rounded-full"
                      style={{ background: GENDER_COLORS[i % GENDER_COLORS.length] }}
                    />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </div>

            {/* Age group pie */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Насны бүлэг
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={agePieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) =>
                      `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {agePieData.map((_, i) => (
                      <Cell key={i} fill={AGE_COLORS[i % AGE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`${v}`, "Тоо"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex gap-4 justify-center mt-1 text-xs text-gray-500 flex-wrap">
                {agePieData.map((d, i) => (
                  <span key={d.name} className="flex items-center gap-1">
                    <span
                      className="inline-block w-3 h-3 rounded-full"
                      style={{ background: AGE_COLORS[i % AGE_COLORS.length] }}
                    />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && data && data.series.length === 0 && (
        <div className="text-sm text-gray-400 py-8 text-center">
          Сонгосон хугацаанд мэдээлэл алга.
        </div>
      )}
    </div>
  );
}
