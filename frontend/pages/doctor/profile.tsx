import React, { useEffect, useState } from "react";
import type { AuthUser } from "../../utils/auth";
import { getMe, logout } from "../../utils/auth";
import { useRouter } from "next/router";

export default function DoctorProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>Ачаалж байна...</div>
    );
  }

  if (!user) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#dc2626" }}>
        Мэдээлэл олдсонгүй
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px 12px 0" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: "#0f2044" }}>Профайл</h1>

      <div
        style={{
          background: "white",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
        }}
      >
        {/* Avatar placeholder */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "#0f2044",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            {user.name ? user.name[0].toUpperCase() : "?"}
          </div>
          <div style={{ fontWeight: 700, fontSize: 18, color: "#111827" }}>{user.name}</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>Эмч</div>
        </div>

        {/* Info rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
            <span style={{ fontSize: 14, color: "#6b7280" }}>Имэйл</span>
            <span style={{ fontSize: 14, color: "#111827", fontWeight: 500 }}>{user.email}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
            <span style={{ fontSize: 14, color: "#6b7280" }}>Роль</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 20,
                background: "#0f20440f",
                color: "#0f2044",
              }}
            >
              Эмч
            </span>
          </div>
          {user.branchId && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
              <span style={{ fontSize: 14, color: "#6b7280" }}>Салбар</span>
              <span style={{ fontSize: 14, color: "#111827", fontWeight: 500 }}>#{user.branchId}</span>
            </div>
          )}
        </div>
      </div>

      {/* Logout button */}
      <button
        onClick={handleLogout}
        style={{
          marginTop: 20,
          width: "100%",
          padding: "13px",
          background: "white",
          color: "#dc2626",
          border: "1px solid #fecaca",
          borderRadius: 12,
          fontWeight: 600,
          fontSize: 15,
          cursor: "pointer",
        }}
      >
        Системээс гарах
      </button>
    </div>
  );
}
