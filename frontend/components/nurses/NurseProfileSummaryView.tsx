import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";

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

const ROLE_LABELS: Record<string, string> = {
  receptionist: "Ресепшн",
  nurse: "Сувилагч",
  doctor: "Эмч",
  admin: "Админ",
  super_admin: "Супер админ",
};

interface Props {
  meUrl?: string;
  showLogout?: boolean;
  /** Label shown under name and in the role pill. Falls back to nurse.role mapping, then "Сувилагч". */
  roleLabel?: string;
}

export default function NurseProfileSummaryView({
  meUrl = "/api/nurse/me",
  showLogout = false,
  roleLabel,
}: Props) {
  const { logoutAndRedirect } = useAuth();

  const [nurse, setNurse] = useState<NurseDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

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
          setError((data as any)?.error || "Мэдээллийг ачаалж чадсангүй");
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
    await logoutAndRedirect();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    setPwSuccess(false);

    if (pwForm.newPassword.length < 6) {
      setPwError("Шинэ нууц үг хамгийн багадаа 6 тэмдэгт байх ёстой.");
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError("Шинэ нууц үг тохирохгүй байна.");
      return;
    }

    setPwLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPassword: pwForm.currentPassword,
          newPassword: pwForm.newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwError((data as any)?.error || "Алдаа гарлаа. Дахин оролдоно уу.");
      } else {
        setPwSuccess(true);
        setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      }
    } catch {
      setPwError("Сервертэй холбогдоход алдаа гарлаа.");
    } finally {
      setPwLoading(false);
    }
  };

  const displayName = useMemo(
    () => formatNurseDisplayName(nurse, nurse?.email ?? null),
    [nurse]
  );

  const displayRoleLabel = useMemo(() => {
    if (roleLabel !== undefined) return roleLabel;
    if (nurse?.role && ROLE_LABELS[nurse.role]) return ROLE_LABELS[nurse.role];
    return "Сувилагч";
  }, [roleLabel, nurse]);

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
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: "#111827" }}>
            {displayName}
          </div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
            {displayRoleLabel}
          </div>
        </div>

        {/* Info rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
              {displayRoleLabel}
            </span>
          </div>

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

      <div
        style={{
          background: "white",
          borderRadius: 14,
          padding: 24,
          marginTop: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f2044", marginBottom: 16 }}>
          Нууц үг солих
        </h2>
        {pwSuccess ? (
          <p style={{ fontSize: 14, color: "#16a34a" }}>
            Нууц үг амжилттай солигдлоо.
          </p>
        ) : (
          <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, color: "#6b7280", marginBottom: 4 }}>
                Одоогийн нууц үг
              </label>
              <input
                type="password"
                value={pwForm.currentPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))}
                required
                style={{
                  width: "100%",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, color: "#6b7280", marginBottom: 4 }}>
                Шинэ нууц үг
              </label>
              <input
                type="password"
                value={pwForm.newPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
                required
                minLength={6}
                style={{
                  width: "100%",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
                placeholder="Дор хаяж 6 тэмдэгт"
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, color: "#6b7280", marginBottom: 4 }}>
                Шинэ нууц үг давтах
              </label>
              <input
                type="password"
                value={pwForm.confirmPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                required
                style={{
                  width: "100%",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
              />
            </div>
            {pwError && (
              <p style={{ fontSize: 13, color: "#dc2626" }}>{pwError}</p>
            )}
            <button
              type="submit"
              disabled={pwLoading}
              style={{
                padding: "10px",
                background: "#2563eb",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                cursor: pwLoading ? "not-allowed" : "pointer",
                opacity: pwLoading ? 0.6 : 1,
              }}
            >
              {pwLoading ? "Хадгалж байна…" : "Нууц үг солих"}
            </button>
          </form>
        )}
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
