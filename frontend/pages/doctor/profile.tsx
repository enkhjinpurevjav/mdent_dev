import React, { useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../utils/auth";
import { getMe, logout } from "../../utils/auth";
import { useRouter } from "next/router";
import { toAbsoluteFileUrl } from "../../utils/toAbsoluteFileUrl";

type DoctorDetails = {
  id: number;
  email: string;
  name?: string | null;
  ovog?: string | null;
  regNo?: string | null;
  branchId?: number | null;
  idPhotoPath?: string | null;
};

function formatDoctorDisplayName(d: DoctorDetails | null, fallbackEmail?: string | null) {
  const name = (d?.name || "").toString().trim();
  const ovog = (d?.ovog || "").toString().trim();

  if (ovog && name) return `${ovog.charAt(0).toUpperCase()}. ${name}`;
  if (name) return name;
  return fallbackEmail || "-";
}

export default function DoctorProfilePage() {
  const router = useRouter();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [doctor, setDoctor] = useState<DoctorDetails | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const me = await getMe();
        if (!mounted) return;

        setUser(me);

        if (!me?.id) {
          setDoctor(null);
          setLoading(false);
          return;
        }

        const res = await fetch(`/api/doctor/me`, { credentials: "include" });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error((data as any)?.error || "Эмчийн мэдээллийг ачаалж чадсангүй");
        }

        setDoctor(data as DoctorDetails);
      } catch (e: any) {
        setError(e?.message || "Сүлжээгээ шалгана уу");
        setDoctor(null);
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const displayName = useMemo(() => formatDoctorDisplayName(doctor, user?.email ?? null), [doctor, user?.email]);

  const avatarLetter = useMemo(() => {
    const n = (doctor?.name || user?.name || "").toString().trim();
    return n ? n[0].toUpperCase() : "?";
  }, [doctor?.name, user?.name]);

  const photoUrl = useMemo(() => {
    const p = (doctor?.idPhotoPath || "").toString().trim();
    if (!p) return "";
    return toAbsoluteFileUrl(p);
  }, [doctor?.idPhotoPath]);

  const branchId = doctor?.branchId ?? user?.branchId ?? null;

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
        Ачаалж байна...
      </div>
    );
  }

  if ((!user && !doctor) || error) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#dc2626" }}>
        {error || "Мэдээлэл олдсонгүй"}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px 12px 0" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: "#0f2044" }}>
        Профайл
      </h1>

      <div
        style={{
          background: "white",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
        }}
      >
        {/* Avatar */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt="Doctor portrait"
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                objectFit: "cover",
                marginBottom: 10,
                border: "1px solid #e5e7eb",
                background: "#f3f4f6",
              }}
              onError={(e) => {
                // fallback to letter avatar if image fails
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
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
              {avatarLetter}
            </div>
          )}

          <div style={{ fontWeight: 700, fontSize: 18, color: "#111827" }}>
            {displayName}
          </div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>Эмч</div>
        </div>

        {/* Info rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* И-мэйл */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 0",
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            <span style={{ fontSize: 14, color: "#6b7280" }}>И-мэйл</span>
            <span style={{ fontSize: 14, color: "#111827", fontWeight: 500 }}>
              {doctor?.email || user?.email || "-"}
            </span>
          </div>

          {/* Үүрэг */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 0",
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            <span style={{ fontSize: 14, color: "#6b7280" }}>Үүрэг</span>
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

          {/* РД */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 0",
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            <span style={{ fontSize: 14, color: "#6b7280" }}>РД</span>
            <span style={{ fontSize: 14, color: "#111827", fontWeight: 500 }}>
              {doctor?.regNo ? doctor.regNo : "-"}
            </span>
          </div>

          {/* Салбар (keep as-is: show #branchId only if it exists) */}
          {branchId ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 0",
                borderBottom: "1px solid #f3f4f6",
              }}
            >
              <span style={{ fontSize: 14, color: "#6b7280" }}>Салбар</span>
              <span style={{ fontSize: 14, color: "#111827", fontWeight: 500 }}>
                #{branchId}
              </span>
            </div>
          ) : null}
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
