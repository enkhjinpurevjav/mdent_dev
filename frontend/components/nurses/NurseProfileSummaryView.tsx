import React, { useEffect, useMemo, useState } from "react";
import { logout } from "../../utils/auth";
import { useRouter } from "next/router";
import { toAbsoluteFileUrl } from "../../utils/toAbsoluteFileUrl";

type NurseDetails = {
  id: number;
  email: string;
  name?: string | null;
  ovog?: string | null;
  regNo?: string | null;
  branchId?: number | null;
  phone?: string | null;
  idPhotoPath?: string | null;
  role?: string | null;
};

function formatNurseDisplayName(d: NurseDetails | null, fallbackEmail?: string | null) {
  const name = (d?.name || "").toString().trim();
  const ovog = (d?.ovog || "").toString().trim();

  if (ovog && name) return `${ovog.charAt(0).toUpperCase()}. ${name}`;
  if (name) return name;
  return fallbackEmail || "-";
}

interface Props {
  /**
   * API URL to fetch the nurse profile from.
   * Defaults to `/api/nurse/me` when not provided.
   */
  meUrl?: string;
  /** When true, shows a logout button at the bottom. Default false. */
  showLogout?: boolean;
}

/**
 * NurseProfileSummaryView — display-only nurse profile.
 * Used by:
 *   - Nurse portal profile page (meUrl="/api/nurse/me", showLogout=true)
 */
export default function NurseProfileSummaryView({
  meUrl = "/api/nurse/me",
  showLogout = false,
}: Props) {
  const router = useRouter();

  const [nurse, setNurse] = useState<NurseDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");

    fetch(meUrl, { credentials: "include" })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!mounted) return;
        if (ok) {
          setNurse(data as NurseDetails);
        } else {
          setError((data as any)?.error || "Сувилагчийн мэдээллийг ачаалж чадсангүй");
        }
      })
      .catch(() => {
        if (mounted) setError("Сүлжээгээ шалгана уу");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [meUrl]);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const displayName = useMemo(
    () => formatNurseDisplayName(nurse, nurse?.email ?? null),
    [nurse]
  );

  const avatarLetter = useMemo(() => {
    const n = (nurse?.name || "").toString().trim();
    return n ? n[0].toUpperCase() : "?";
  }, [nurse?.name]);

  const photoUrl = useMemo(() => {
    const p = (nurse?.idPhotoPath || "").toString().trim();
    if (!p) return "";
    return toAbsoluteFileUrl(p);
  }, [nurse?.idPhotoPath]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
        Ачаалж байна...
      </div>
    );
  }

  if (!nurse || error) {
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          {photoUrl ? (
            <div
              style={{
                width: 110,
                height: 110,
                borderRadius: 12,
                overflow: "hidden",
                marginBottom: 10,
                border: "1px solid #e5e7eb",
                background: "#f3f4f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <img
                src={photoUrl}
                alt="Nurse portrait"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          ) : (
            <div
              style={{
                width: 110,
                height: 110,
                borderRadius: 12,
                background: "#0f2044",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 36,
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
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>Сувилагч</div>
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
              {nurse.email || "-"}
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
              Сувилагч
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
              {nurse.regNo || "-"}
            </span>
          </div>

          {/* Утас */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 0",
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            <span style={{ fontSize: 14, color: "#6b7280" }}>Утас</span>
            <span style={{ fontSize: 14, color: "#111827", fontWeight: 500 }}>
              {nurse.phone || "-"}
            </span>
          </div>

          {/* Салбар */}
          {nurse.branchId ? (
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
                #{nurse.branchId}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {showLogout && (
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
      )}
    </div>
  );
}
