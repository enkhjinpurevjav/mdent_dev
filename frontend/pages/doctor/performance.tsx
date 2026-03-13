import React from "react";
import DoctorDashboardTab from "../../components/doctors/DoctorDashboardTab";

export default function DoctorPerformancePage() {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 12px 32px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: "#0f2044" }}>
        Гүйцэтгэл
      </h1>
      <DoctorDashboardTab apiBasePath="/api/doctor/dashboard" />
    </div>
  );
}
