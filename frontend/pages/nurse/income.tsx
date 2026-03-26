import { useEffect, useState } from "react";
import NurseIncomeView from "../../components/nurses/NurseIncomeView";

export default function NurseIncomePage() {
  const [revenueSharingEnabled, setRevenueSharingEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/nurse/me", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        // Default to true if field is missing (backward compat)
        setRevenueSharingEnabled(data?.nurseRevenueSharingEnabled ?? true);
      })
      .catch(() => {
        setRevenueSharingEnabled(true);
      });
  }, []);

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px 12px 0" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: "#0f2044" }}>
        Орлого
      </h1>
      <div
        style={{
          background: "white",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
        }}
      >
        {revenueSharingEnabled === null ? (
          <p style={{ color: "#6b7280", fontSize: 14 }}>Ачаалж байна...</p>
        ) : revenueSharingEnabled === false ? (
          <p style={{ color: "#6b7280", fontSize: 14, textAlign: "center", padding: "24px 0" }}>
            Бодогдсон орлого байхгүй байна
          </p>
        ) : (
          <NurseIncomeView apiBaseUrl="/api/nurse/income/details" />
        )}
      </div>
    </div>
  );
}
