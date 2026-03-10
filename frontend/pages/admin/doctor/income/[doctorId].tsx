import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

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
  startDate: string;
  endDate: string;
  categories: CategoryRow[];
  totals: {
    totalSalesMnt: number;
    totalIncomeMnt: number;
  };
};

function fmtMnt(v: number) {
  const n = Number(v || 0);
  return `${n.toLocaleString("mn-MN")} ₮`;
}

export default function DoctorIncomeDetailsPage() {
  const router = useRouter();
  const { doctorId, startDate: qsStart, endDate: qsEnd } = router.query;

  const startDate = useMemo(() => {
    if (typeof qsStart === "string" && qsStart) return qsStart;
    return "2026-01-01";
  }, [qsStart]);

  const endDate = useMemo(() => {
    if (typeof qsEnd === "string" && qsEnd) return qsEnd;
    return "2026-01-10";
  }, [qsEnd]);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DetailsResponse | null>(null);
  const [error, setError] = useState<string>("");

  const fetchData = async () => {
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
      console.error("Failed to fetch details:", e);
      setError(e?.message || "Failed to fetch details");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, startDate, endDate]);

  return (
    <main className="w-full px-6 py-6 font-sans">
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

      <div className="mb-4 text-sm text-gray-700">
        <div>
          <span className="font-semibold">Эхлэх:</span> {startDate}{" "}
          <span className="font-semibold">Дуусах:</span> {endDate}
        </div>
        <div>
          <span className="font-semibold">Doctor ID:</span> {String(doctorId || "")}
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

          <section>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-700">Ангилал</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Хувь (%)</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Борлуулалт</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Эмчийн хувь</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((row) => (
                    <tr key={row.key} className="border-t border-gray-200">
                      <td className="px-4 py-3">{row.label}</td>
                      <td className="px-4 py-3 text-right">{Number(row.pctUsed || 0)}%</td>
                      <td className="px-4 py-3 text-right">{fmtMnt(row.salesMnt)}</td>
                      <td className="px-4 py-3 text-right">{fmtMnt(row.incomeMnt)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr className="border-t-2 border-gray-200 font-bold">
                    <td className="px-4 py-3">Нийт</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right">{fmtMnt(data.totals.totalSalesMnt)}</td>
                    <td className="px-4 py-3 text-right">{fmtMnt(data.totals.totalIncomeMnt)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="mt-4 text-sm text-gray-500">
            Дараа нь “View more” товч нэмээд encounter/invoice жагсаалтаар дэлгэрэнгүй харах
            боломжтой.
          </section>
        </>
      )}
    </main>
  );
}
