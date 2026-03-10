import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";

const PAGE_SIZE = 15;

type NurseSummary = {
  nurseId: number;
  nurseName: string | null;
  nurseOvog: string | null;
  startDate: string;
  endDate: string;
  imagingIncomeMnt: number;
  assistIncomeMnt: number;
  totalIncomeMnt: number;
  nurseImagingPct: number;
};

function formatNurseName(n: { nurseName?: string | null; nurseOvog?: string | null }) {
  const ovog = (n.nurseOvog || "").trim();
  const name = (n.nurseName || "").trim();
  if (!ovog && !name) return "-";
  if (!ovog) return name;
  return `${ovog.charAt(0)}. ${name || "-"}`;
}

function getDefaultDates(): { startDate: string; endDate: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    startDate: `${firstDay.getFullYear()}-${pad(firstDay.getMonth() + 1)}-${pad(firstDay.getDate())}`,
    endDate: `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`,
  };
}

export default function NursesIncomePage() {
  const router = useRouter();
  const [startDate, setStartDate] = useState<string>(() => getDefaultDates().startDate);
  const [endDate, setEndDate] = useState<string>(() => getDefaultDates().endDate);
  const [branchId, setBranchId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [nurses, setNurses] = useState<NurseSummary[]>([]);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState<string>("");
  const [page, setPage] = useState(1);

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
      const url = `/api/admin/nurses-income?startDate=${startDate}&endDate=${endDate}&branchId=${branchId || ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch nurses income data");
      setNurses(Array.isArray(data) ? data : []);
    } catch (e: any) {
      console.error("Failed to fetch data:", e);
      setError(e.message || "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPage(1);
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, branchId]);

  const totalPages = Math.max(1, Math.ceil(nurses.length / PAGE_SIZE));
  const pagedNurses = nurses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <main className="w-full px-6 py-6 font-sans">
      <h1 className="text-2xl font-bold mb-4">
        Сувилагчийн Зурагны Орлогын Тайлан
      </h1>

      {/* Filters */}
      <section className="mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm mb-1">Эхлэх:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2 py-2 text-sm rounded-lg border border-gray-300"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Дуусах:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2 py-2 text-sm rounded-lg border border-gray-300"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Салбар:</label>
          <select
            value={branchId || ""}
            onChange={(e) => setBranchId(Number(e.target.value) || null)}
            className="px-2 py-2 text-sm rounded-lg border border-gray-300"
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
        <div className="mb-4 p-3 text-red-700 bg-red-50 border border-red-300 rounded-lg">
          {error}
        </div>
      )}

      {/* Data Table */}
      <section>
        {loading ? (
          <p className="text-gray-500">Ачаалж байна...</p>
        ) : nurses.length === 0 ? (
          <p className="text-gray-500 text-sm">
            Тухайн хугацаанд зурагны орлоготой сувилагч олдсонгүй.
          </p>
        ) : (
          <>
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-3 py-2">Сувилагч</th>
                    <th className="px-3 py-2 text-right">Зурагны орлого (₮)</th>
                    <th className="px-3 py-2 text-right">Туслах орлого (₮)</th>
                    <th className="px-3 py-2 text-right">Нийт орлого (₮)</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedNurses.map((n) => (
                    <tr key={n.nurseId} className="border-t border-gray-200">
                      <td className="px-3 py-2">{formatNurseName(n)}</td>
                      <td className="px-3 py-2 text-right">
                        {n.imagingIncomeMnt.toLocaleString("mn-MN")} ₮
                      </td>
                      <td className="px-3 py-2 text-right">
                        {n.assistIncomeMnt.toLocaleString("mn-MN")} ₮
                      </td>
                      <td className="px-3 py-2 text-right font-bold">
                        {n.totalIncomeMnt.toLocaleString("mn-MN")} ₮
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="py-1.5 px-3 text-xs rounded-md border border-blue-600 bg-blue-50 text-blue-600 cursor-pointer hover:bg-blue-100"
                          onClick={() =>
                            router.push(
                              `/admin/nurse/income/${n.nurseId}?startDate=${startDate}&endDate=${endDate}`
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-50"
                >
                  ← Өмнөх
                </button>
                <span className="text-sm text-gray-600">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-50"
                >
                  Дараах →
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
