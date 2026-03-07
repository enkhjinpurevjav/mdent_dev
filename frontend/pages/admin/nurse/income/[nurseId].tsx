import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";

type IncomeLine = {
  invoiceId: number;
  invoiceItemId: number;
  serviceName: string;
  lineNet: number;
  imagingPct: number;
  incomeMnt: number;
};

type NurseIncomeDetails = {
  nurseId: number;
  startDate: string;
  endDate: string;
  imagingPct: number;
  lines: IncomeLine[];
  totals: {
    totalImagingIncomeMnt: number;
  };
};

export default function NurseIncomeDetailsPage() {
  const router = useRouter();
  const { nurseId, startDate, endDate } = router.query as {
    nurseId?: string;
    startDate?: string;
    endDate?: string;
  };

  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<NurseIncomeDetails | null>(null);
  const [error, setError] = useState<string>("");

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

  return (
    <main style={{ padding: "24px", fontFamily: "sans-serif", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            padding: "7px 14px",
            fontSize: 13,
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            cursor: "pointer",
          }}
        >
          ← Буцах
        </button>
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        Сувилагч — Зурагны Орлого (Дэлгэрэнгүй)
      </h1>
      {details && (
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
          {details.startDate} — {details.endDate} · Зураг %: {details.imagingPct}%
        </div>
      )}

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            color: "#b91c1c",
            backgroundColor: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: 8,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: "#6b7280" }}>Ачаалж байна...</p>
      ) : !details ? null : (
        <>
          {/* Summary */}
          <section
            style={{
              marginBottom: 20,
              padding: "14px 18px",
              borderRadius: 10,
              background: "#f0fdf4",
              border: "1px solid #86efac",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "#15803d" }}>
              Нийт зурагны орлого:{" "}
              {details.totals.totalImagingIncomeMnt.toLocaleString("mn-MN")} ₮
            </div>
          </section>

          {/* Lines table */}
          {details.lines.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: 14 }}>
              Тухайн хугацаанд зурагны мөр олдсонгүй.
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ backgroundColor: "#f9fafb", textAlign: "left" }}>
                  <th style={{ padding: "8px 12px" }}>Нэхэмжлэл #</th>
                  <th style={{ padding: "8px 12px" }}>Үйлчилгээ</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Суурь дүн (₮)</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>% тохиргоо</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Орлого (₮)</th>
                </tr>
              </thead>
              <tbody>
                {details.lines.map((line) => (
                  <tr key={line.invoiceItemId} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "8px 12px" }}>{line.invoiceId}</td>
                    <td style={{ padding: "8px 12px" }}>{line.serviceName}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      {line.lineNet.toLocaleString("mn-MN")} ₮
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{line.imagingPct}%</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      {line.incomeMnt.toLocaleString("mn-MN")} ₮
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: "#f9fafb", fontWeight: 700 }}>
                  <td colSpan={4} style={{ padding: "8px 12px", textAlign: "right" }}>
                    Нийт:
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>
                    {details.totals.totalImagingIncomeMnt.toLocaleString("mn-MN")} ₮
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </>
      )}
    </main>
  );
}
