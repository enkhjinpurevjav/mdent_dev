import React from "react";

export default function DoctorSchedulePage() {
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px 12px 0" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: "#0f2044" }}>Хуваарь</h1>
      <div
        style={{
          background: "white",
          borderRadius: 12,
          padding: 24,
          boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
          textAlign: "center",
          color: "#6b7280",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>🗓</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
          Хуваарийн хэсэг удахгүй нэмэгдэнэ
        </div>
        <div style={{ fontSize: 13 }}>
          Ажлын хуваарийг энд харах боломж тун удахгүй бэлэн болно.
        </div>
      </div>
    </div>
  );
}
