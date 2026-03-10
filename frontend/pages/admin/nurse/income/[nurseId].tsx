import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

type ImagingLine = {
  invoiceId: number;
  invoiceItemId: number;
  serviceName: string;
  lineNet: number;
  imagingPct: number;
  incomeMnt: number;
};

type AssistLine = {
  encounterId: number;
  invoiceId: number;
  doctorId: number | null;
  doctorName: string | null;
  salesBaseMnt: number;
  pct: number;
  incomeMnt: number;
};

type NurseIncomeDetails = {
  nurseId: number;
  startDate: string;
  endDate: string;
  nurseImagingPct: number;
  imagingLines: ImagingLine[];
  assistLines: AssistLine[];
  totals: {
    imagingIncomeMnt: number;
    assistIncomeMnt: number;
    totalIncomeMnt: number;
  };
};

export default function NurseIncomeDetailsPage() {
  const router = useRouter();
  const { nurseId, startDate, endDate } = router.query as {
    nurseId?: string;
    startDate?: string;
    endDate?: string;
  };

  const PAGE_SIZE = 15;

  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<NurseIncomeDetails | null>(null);
  const [error, setError] = useState<string>("");

  const [imagingPage, setImagingPage] = useState(1);
  const [assistPage, setAssistPage] = useState(1);

  const fetchDetails = async () => {
    if (!nurseId || !startDate || !endDate) return;
    setLoading(true);
    setError("");
    try {
      const url = `/api/admin/nurses-income/${nurseId}/details?startDate=${startDate}&endDate=${endDate}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch nurse income details");
      setDetails(data);
    } catch (e: any) {
      console.error("Failed to fetch data:", e);
      setError(e.message || "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (router.isReady) {
      void fetchDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, nurseId, startDate, endDate]);

  // Reset pagination when details changes (new nurseId/startDate/endDate)
  useEffect(() => {
    setImagingPage(1);
    setAssistPage(1);
  }, [details]);

  const imagingTotalPages = useMemo(
    () => Math.max(1, Math.ceil((details?.imagingLines.length ?? 0) / PAGE_SIZE)),
    [details]
  );
  const imagingPageSafe = Math.min(imagingPage, imagingTotalPages);
  const imagingPageRows = useMemo(
    () => (details?.imagingLines ?? []).slice((imagingPageSafe - 1) * PAGE_SIZE, imagingPageSafe * PAGE_SIZE),
    [details, imagingPageSafe]
  );

  const assistTotalPages = useMemo(
    () => Math.max(1, Math.ceil((details?.assistLines.length ?? 0) / PAGE_SIZE)),
    [details]
  );
  const assistPageSafe = Math.min(assistPage, assistTotalPages);
  const assistPageRows = useMemo(
    () => (details?.assistLines ?? []).slice((assistPageSafe - 1) * PAGE_SIZE, assistPageSafe * PAGE_SIZE),
    [details, assistPageSafe]
  );

  return (
    <main className="p-6 font-sans">
      <div className="mb-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="py-1.5 px-3.5 text-sm rounded-lg border border-gray-300 bg-white cursor-pointer hover:bg-gray-50"
        >
          ← Буцах
        </button>
      </div>

      <h1 className="text-2xl font-bold mb-1">
        Сувилагч — Орлогын Дэлгэрэнгүй
      </h1>
      {details && (
        <div className="text-sm text-gray-500 mb-5">
          {details.startDate} — {details.endDate} · Зураг %: {details.nurseImagingPct}%
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 text-red-700 bg-red-50 border border-red-300 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Ачаалж байна...</p>
      ) : !details ? null : (
        <>
          {/* Summary */}
          <section className="mb-5 px-4 py-3 rounded-xl bg-green-50 border border-green-300">
            <div className="text-sm font-bold text-green-700 mb-1.5">
              Нийт орлого:{" "}
              {details.totals.totalIncomeMnt.toLocaleString("mn-MN")} ₮
            </div>
            <div className="text-sm text-gray-700 flex gap-6 flex-wrap">
              <span>Зурагны орлого: {details.totals.imagingIncomeMnt.toLocaleString("mn-MN")} ₮</span>
              <span>Туслах орлого: {details.totals.assistIncomeMnt.toLocaleString("mn-MN")} ₮</span>
            </div>
          </section>

          {/* Imaging lines table */}
          <h2 className="text-base font-bold mb-2">
            Зурагны орлого ({details.nurseImagingPct}%)
          </h2>
          {details.imagingLines.length === 0 ? (
            <p className="text-gray-500 text-sm mb-6">
              Тухайн хугацаанд зурагны мөр олдсонгүй.
            </p>
          ) : (
            <>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2">Нэхэмжлэл #</th>
                  <th className="px-3 py-2">Үйлчилгээ</th>
                  <th className="px-3 py-2 text-right">Суурь дүн (₮)</th>
                  <th className="px-3 py-2 text-right">% тохиргоо</th>
                  <th className="px-3 py-2 text-right">Орлого (₮)</th>
                </tr>
              </thead>
              <tbody>
                {imagingPageRows.map((line) => (
                  <tr key={line.invoiceItemId} className="border-b border-gray-200">
                    <td className="px-3 py-2">{line.invoiceId}</td>
                    <td className="px-3 py-2">{line.serviceName}</td>
                    <td className="px-3 py-2 text-right">
                      {line.lineNet.toLocaleString("mn-MN")} ₮
                    </td>
                    <td className="px-3 py-2 text-right">{line.imagingPct}%</td>
                    <td className="px-3 py-2 text-right">
                      {line.incomeMnt.toLocaleString("mn-MN")} ₮
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold">
                  <td colSpan={4} className="px-3 py-2 text-right">
                    Нийт:
                  </td>
                  <td className="px-3 py-2 text-right">
                    {details.totals.imagingIncomeMnt.toLocaleString("mn-MN")} ₮
                  </td>
                </tr>
              </tfoot>
            </table>
            <div className="mt-2 mb-6 flex items-center justify-end gap-2 text-sm">
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-50"
                disabled={imagingPageSafe <= 1}
                onClick={() => setImagingPage((p) => Math.max(1, p - 1))}
              >
                Өмнөх
              </button>
              <span className="text-gray-600">
                {imagingPageSafe} / {imagingTotalPages}
              </span>
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-50"
                disabled={imagingPageSafe >= imagingTotalPages}
                onClick={() => setImagingPage((p) => Math.min(imagingTotalPages, p + 1))}
              >
                Дараах
              </button>
            </div>
            </>
          )}

          {/* Assist lines table */}
          <h2 className="text-base font-bold mb-2">
            Туслах орлого (1%)
          </h2>
          {details.assistLines.length === 0 ? (
            <p className="text-gray-500 text-sm">
              Тухайн хугацаанд туслах орлого олдсонгүй.
            </p>
          ) : (
            <>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2">Нэхэмжлэл #</th>
                  <th className="px-3 py-2">Эмч</th>
                  <th className="px-3 py-2 text-right">Эмчийн борлуулалт (₮)</th>
                  <th className="px-3 py-2 text-right">%</th>
                  <th className="px-3 py-2 text-right">Орлого (₮)</th>
                </tr>
              </thead>
              <tbody>
                {assistPageRows.map((line) => (
                  <tr key={`${line.encounterId}-${line.invoiceId}`} className="border-b border-gray-200">
                    <td className="px-3 py-2">{line.invoiceId}</td>
                    <td className="px-3 py-2">{line.doctorName || "-"}</td>
                    <td className="px-3 py-2 text-right">
                      {line.salesBaseMnt.toLocaleString("mn-MN")} ₮
                    </td>
                    <td className="px-3 py-2 text-right">{line.pct}%</td>
                    <td className="px-3 py-2 text-right">
                      {line.incomeMnt.toLocaleString("mn-MN")} ₮
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold">
                  <td colSpan={4} className="px-3 py-2 text-right">
                    Нийт:
                  </td>
                  <td className="px-3 py-2 text-right">
                    {details.totals.assistIncomeMnt.toLocaleString("mn-MN")} ₮
                  </td>
                </tr>
              </tfoot>
            </table>
            <div className="mt-2 flex items-center justify-end gap-2 text-sm">
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-50"
                disabled={assistPageSafe <= 1}
                onClick={() => setAssistPage((p) => Math.max(1, p - 1))}
              >
                Өмнөх
              </button>
              <span className="text-gray-600">
                {assistPageSafe} / {assistTotalPages}
              </span>
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-50"
                disabled={assistPageSafe >= assistTotalPages}
                onClick={() => setAssistPage((p) => Math.min(assistTotalPages, p + 1))}
              >
                Дараах
              </button>
            </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
