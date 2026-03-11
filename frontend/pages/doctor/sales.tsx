import React, { useEffect, useState } from "react";

type SalesSummary = {
  today: {
    date: string;
    totalAmount: number;
    paymentCount: number;
  };
  month: {
    year: number;
    month: number;
    totalAmount: number;
    paymentCount: number;
  };
};

function formatMoney(amount: number): string {
  return amount.toLocaleString("mn-MN") + "₮";
}

export default function DoctorSalesPage() {
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/doctor/sales-summary", { credentials: "include" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Борлуулалтын мэдээлэл ачаалахад алдаа гарлаа.");
        setSummary(data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px 12px 0" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: "#0f2044" }}>Борлуулалт</h1>

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>Ачаалж байна...</div>
      )}
      {error && (
        <div style={{ background: "#fee2e2", color: "#dc2626", padding: 12, borderRadius: 8, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {summary && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Today */}
          <div
            style={{
              background: "white",
              borderRadius: 14,
              padding: 20,
              boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
            }}
          >
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>Өнөөдрийн орлого</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#0f2044" }}>
              {formatMoney(summary.today.totalAmount)}
            </div>
            <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>
              {summary.today.paymentCount} гүйлгээ · {summary.today.date}
            </div>
          </div>

          {/* This month */}
          <div
            style={{
              background: "white",
              borderRadius: 14,
              padding: 20,
              boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
            }}
          >
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>
              {summary.month.year} оны {summary.month.month}-р сарын орлого
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#0f2044" }}>
              {formatMoney(summary.month.totalAmount)}
            </div>
            <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>
              {summary.month.paymentCount} гүйлгээ
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
