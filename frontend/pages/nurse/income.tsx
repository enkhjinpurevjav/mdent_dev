import NurseIncomeView from "../../components/nurses/NurseIncomeView";

export default function NurseIncomePage() {
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
        <NurseIncomeView apiBaseUrl="/api/nurse/income/details" />
      </div>
    </div>
  );
}
