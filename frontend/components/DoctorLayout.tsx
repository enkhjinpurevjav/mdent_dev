import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { logout } from "../utils/auth";

type Props = {
  children: React.ReactNode;
};

const BOTTOM_NAV = [
  { label: "Цагууд", href: "/doctor/appointments", icon: "📅" },
  { label: "Хуваарь", href: "/doctor/schedule", icon: "🗓" },
  { label: "Борлуулалт", href: "/doctor/sales", icon: "💰" },
  { label: "Профайл", href: "/doctor/profile", icon: "👤" },
];

export default function DoctorLayout({ children }: Props) {
  const router = useRouter();

  const isActive = (href: string) => router.pathname.startsWith(href);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#f3f4f6" }}>
      {/* Top Bar */}
      <header
        style={{
          background: "#0f2044",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          height: 56,
          flexShrink: 0,
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        {/* Logo */}
        <Link href="/doctor/appointments" style={{ color: "white", fontWeight: 700, fontSize: 18, textDecoration: "none", letterSpacing: 1 }}>
          mDent
        </Link>

        {/* Right icon buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {/* Notifications (UI only, disabled) */}
          <button
            title="Мэдэгдэл"
            disabled
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.5)",
              cursor: "default",
              padding: "8px",
              borderRadius: 8,
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            🔔
          </button>

          {/* Гүйцэтгэл */}
          <Link
            href="/doctor/performance"
            title="Гүйцэтгэл"
            style={{
              color: isActive("/doctor/performance") ? "#60a5fa" : "rgba(255,255,255,0.85)",
              padding: "8px",
              borderRadius: 8,
              fontSize: 20,
              lineHeight: 1,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            📊
          </Link>

          {/* Үзлэгийн түүх */}
          <Link
            href="/doctor/history"
            title="Үзлэгийн түүх"
            style={{
              color: isActive("/doctor/history") ? "#60a5fa" : "rgba(255,255,255,0.85)",
              padding: "8px",
              borderRadius: 8,
              fontSize: 20,
              lineHeight: 1,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            📋
          </Link>

          {/* Logout */}
          <button
            onClick={handleLogout}
            title="Гарах"
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              padding: "8px",
              borderRadius: 8,
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ⎋
          </button>
        </div>
      </header>

      {/* Scrollable content */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          paddingBottom: 64,
        }}
      >
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: 60,
          background: "white",
          borderTop: "1px solid #e5e7eb",
          display: "flex",
          zIndex: 100,
        }}
      >
        {BOTTOM_NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                textDecoration: "none",
                color: active ? "#0f2044" : "#9ca3af",
                fontSize: 10,
                fontWeight: active ? 700 : 400,
                borderTop: active ? "2px solid #0f2044" : "2px solid transparent",
              }}
            >
              <span style={{ fontSize: 22 }}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
