import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";

type NurseSummary = {
  nurseId: number;
  nurseName: string | null;
  nurseOvog: string | null;
  startDate: string;
  endDate: string;
  imagingIncomeMnt: number;
  imagingPct: number;
};

function formatNurseName(n: { nurseName?: string | null; nurseOvog?: string | null }) {
  const ovog = (n.nurseOvog || "").trim();
  const name = (n.nurseName || "").trim();
  if (!ovog && !name) return "-";
  if (!ovog) return name;
  return `${ovog.charAt(0)}. ${name || "-"}`;
}

export default function NursesIncomePage() {
  const router = useRouter();
  const [startDate, setStartDate] = useState<string>("2026-01-01");
  const [endDate, setEndDate] = useState<string>("2026-01-31");
  const [branchId, setBranchId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [nurses, setNurses] = useState<NurseSummary[]>([]);
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
    fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ padding: "24px", fontFamily: "sans-serif", maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
        Сувилагчийн Зурагны Орлогын Тайлан
      </h1>

      {/* Filters */}
      <section style={{ marginBottom: 24, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Эхлэх:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: "8px", fontSize: 14, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Дуусах:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ padding: "8px", fontSize: 14, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Салбар:</label>
          <select
            value={branchId || ""}
            onChange={(e) => setBranchId(Number(e.target.value) || null)}
            style={{ padding: "8px", fontSize: 14, borderRadius: 8, border: "1px solid #d1d5db" }}
          >
            <option value="">Бүх салбар</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void fetchData()}
          disabled={loading}
          style={{
            padding: "9px 16px",
            borderRadius: 8,
            border: "1px solid #2563eb",
            background: "#eff6ff",
            color: "#2563eb",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {loading ? "Ачаалж байна..." : "Хайх"}
        </button>
      </section>

      {/* Error message */}
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

      {/* Data Table */}
      <section>
        {loading ? (
          <p style={{ color: "#6b7280" }}>Ачаалж байна...</p>
        ) : nurses.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            Тухайн хугацаанд зурагны орлоготой сувилагч олдсонгүй.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb", textAlign: "left" }}>
                <th style={{ padding: "8px 12px" }}>Сувилагч</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Зураг % (тохиргоо)</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Зурагны орлого (₮)</th>
                <th style={{ padding: "8px 12px" }}></th>
              </tr>
            </thead>
            <tbody>
              {nurses.map((n) => (
                <tr key={n.nurseId} style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "8px 12px" }}>{formatNurseName(n)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>{n.imagingPct}%</td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>
                    {n.imagingIncomeMnt.toLocaleString("mn-MN")} ₮
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <button
                      type="button"
                      style={{
                        padding: "6px 12px",
                        fontSize: 13,
                        borderRadius: 6,
                        border: "1px solid #2563eb",
                        backgroundColor: "#eff6ff",
                        color: "#2563eb",
                        cursor: "pointer",
                      }}
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
        )}
      </section>
    </main>
  );
}
