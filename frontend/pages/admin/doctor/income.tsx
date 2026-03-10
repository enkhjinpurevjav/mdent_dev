import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";

function getTodayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getLastDayOfMonthStr(): string {
  const d = new Date();
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const y = lastDay.getFullYear();
  const m = String(lastDay.getMonth() + 1).padStart(2, "0");
  const day = String(lastDay.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type DoctorSummary = {
  doctorId: number;
  doctorName: string;
  branchName: string;
  startDate: string;
  endDate: string;
  revenue: number;
  commission: number;
  monthlyGoal: number;
  progressPercent: number;
};

export default function DoctorsIncomePage() {
  const router = useRouter();
  const [startDate, setStartDate] = useState<string>(getTodayStr);
  const [endDate, setEndDate] = useState<string>(getLastDayOfMonthStr);
  const [branchId, setBranchId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState<string>("");

  const fetchBranches = async () => {
    try {
      const res = await fetch("/api/branches");
      const data = await res.json();
      setBranches(data || []);
    } catch (e) {
      console.error("Failed to load branches:", e);
      setBranches([]);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/doctors-income?startDate=${startDate}&endDate=${endDate}&branchId=${branchId || ""}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch doctors' income data");
      setDoctors(data);
    } catch (e: any) {
      console.error("Failed to fetch data:", e);
      setError(e.message || "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
    fetchData();
  }, [startDate, endDate, branchId]);

  return (
    <main className="w-full px-6 py-6 font-sans">
      <h1 className="mb-4 text-2xl font-bold text-gray-900">Эмчийн Орлогын Тайлан</h1>

      {/* Filters */}
      <section className="mb-6 flex flex-wrap gap-4">
        <div>
          <label>Эхлэх:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
          />
        </div>
        <div>
          <label>Дуусах:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
          />
        </div>
        <div>
          <label>Салбар:</label>
          <select
            value={branchId || ""}
            onChange={(e) => setBranchId(Number(e.target.value) || null)}
            className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
          >
            <option value="">Бүх салбар</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Error message */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Data Table */}
      <section>
        {loading ? (
          <p className="text-sm text-gray-600">Ачаалж байна...</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-2 py-3 font-semibold text-gray-700">Нэр</th>
                  <th className="px-2 py-3 font-semibold text-gray-700">Салбар</th>
                  <th className="px-2 py-3 font-semibold text-gray-700">Эхлэх</th>
                  <th className="px-2 py-3 font-semibold text-gray-700">Дуусах</th>
                  <th className="px-2 py-3 text-right font-semibold text-gray-700">Борлуулалтын орлого</th>
                  <th className="px-2 py-3 text-right font-semibold text-gray-700">Эмчийн хувь</th>
                  <th className="px-2 py-3 text-right font-semibold text-gray-700">Сарын зорилт</th>
                  <th className="px-2 py-3 text-right font-semibold text-gray-700">Гүйцэтгэл (%)</th>
                  <th className="px-2 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {doctors.map((doctor) => (
                  <tr key={doctor.doctorId} className="border-t border-gray-200">
                    <td className="px-2 py-2">{doctor.doctorName}</td>
                    <td className="px-2 py-2">{doctor.branchName}</td>
                    <td className="px-2 py-2">{doctor.startDate}</td>
                    <td className="px-2 py-2">{doctor.endDate}</td>
                    <td className="px-2 py-2 text-right">
                      {doctor.revenue.toLocaleString("mn-MN")} ₮
                    </td>
                    <td className="px-2 py-2 text-right">
                      {doctor.commission.toLocaleString("mn-MN")} ₮
                    </td>
                    <td className="px-2 py-2 text-right">
                      {doctor.monthlyGoal.toLocaleString("mn-MN")} ₮
                    </td>
                    <td className="px-2 py-2 text-right">{doctor.progressPercent}%</td>
                    <td className="px-2 py-2">
                      <button
                        className="rounded-md border border-blue-600 bg-blue-50 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100"
                        onClick={() =>
                          router.push(
                            `/admin/doctor/income/${doctor.doctorId}?startDate=${startDate}&endDate=${endDate}`
                          )
                        }
                      >
                        Дэлгэрэнгүй
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
