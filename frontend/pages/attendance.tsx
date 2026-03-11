import React, { useEffect, useState, useCallback } from "react";

type AttendanceSession = {
  id: number;
  checkInAt: string;
  checkOutAt?: string | null;
  checkInLat: number;
  checkInLng: number;
  checkInAccuracyM: number;
  checkOutLat?: number | null;
  checkOutLng?: number | null;
  checkOutAccuracyM?: number | null;
};

type MeResponse = {
  checkedIn: boolean;
  openSession: AttendanceSession | null;
  recent: AttendanceSession[];
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;

function formatDuration(checkInAt: string, checkOutAt?: string | null) {
  const start = new Date(checkInAt).getTime();
  const end = checkOutAt ? new Date(checkOutAt).getTime() : Date.now();
  const ms = end - start;
  const h = Math.floor(ms / MS_PER_HOUR);
  const m = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE);
  return h > 0 ? `${h}ц ${m}мин` : `${m}мин`;
}

export default function AttendancePage() {
  const [status, setStatus] = useState<MeResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    setStatusError("");
    try {
      const res = await fetch("/api/attendance/me", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Мэдээлэл татахад алдаа гарлаа.");
      }
      const data: MeResponse = await res.json();
      setStatus(data);
    } catch (err: unknown) {
      setStatusError(err instanceof Error ? err.message : "Алдаа гарлаа.");
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleAction(type: "check-in" | "check-out") {
    setActionLoading(true);
    setActionError("");
    setActionSuccess("");

    let position: GeolocationPosition;
    try {
      position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Таны төхөөрөмж байршил тодорхойлохыг дэмждэггүй байна."));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });
    } catch (err: unknown) {
      const msg =
        err instanceof GeolocationPositionError
          ? err.code === 1
            ? "Байршил ашиглах зөвшөөрөл өгөөгүй байна. Тохиргооноос идэвхжүүлнэ үү."
            : err.code === 2
            ? "Байршил тодорхойлж чадсангүй. GPS сигналаа шалгана уу."
            : "Байршил хугацаа дууссан. Дахин оролдоно уу."
          : err instanceof Error
          ? err.message
          : "Байршил авахад алдаа гарлаа.";
      setActionError(msg);
      setActionLoading(false);
      return;
    }

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const accuracyM = position.coords.accuracy;

    try {
      const res = await fetch(`/api/attendance/${type}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, accuracyM }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Алдаа гарлаа.");
      }

      setActionSuccess(
        type === "check-in"
          ? "✅ Ирц амжилттай бүртгэгдлээ."
          : "✅ Гарах бүртгэл амжилттай хийгдлээ."
      );
      await fetchStatus();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Алдаа гарлаа.");
    } finally {
      setActionLoading(false);
    }
  }

  const checkedIn = status?.checkedIn ?? false;

  return (
    <div
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: 24,
        fontFamily: "sans-serif",
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        🕘 Ирц бүртгэл
      </h1>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 24 }}>
        Ирэх болон явах бүртгэлийг GPS байршлаар баталгаажуулна.
      </p>

      {/* Current status card */}
      <div
        style={{
          background: checkedIn ? "#f0fdf4" : "#f8fafc",
          border: `1px solid ${checkedIn ? "#86efac" : "#e2e8f0"}`,
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}
      >
        {loadingStatus ? (
          <p style={{ color: "#6b7280", fontSize: 14 }}>Мэдээлэл ачааллаж байна...</p>
        ) : statusError ? (
          <p style={{ color: "#ef4444", fontSize: 14 }}>{statusError}</p>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: checkedIn ? 12 : 0,
              }}
            >
              <span style={{ fontSize: 28 }}>{checkedIn ? "🟢" : "🔴"}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>
                  {checkedIn ? "Ажил дээр байна" : "Ажилд ирээгүй байна"}
                </div>
                {checkedIn && status?.openSession && (
                  <div style={{ fontSize: 13, color: "#4b5563", marginTop: 2 }}>
                    Ирсэн цаг: {formatDateTime(status.openSession.checkInAt)} —{" "}
                    {formatDuration(status.openSession.checkInAt)} болж байна
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Action button */}
      {!loadingStatus && !statusError && (
        <div style={{ marginBottom: 24 }}>
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => handleAction(checkedIn ? "check-out" : "check-in")}
            style={{
              width: "100%",
              padding: "14px 24px",
              borderRadius: 10,
              border: "none",
              background: actionLoading
                ? "#9ca3af"
                : checkedIn
                ? "#ef4444"
                : "#2563eb",
              color: "white",
              fontSize: 16,
              fontWeight: 600,
              cursor: actionLoading ? "not-allowed" : "pointer",
              transition: "background 0.2s",
            }}
          >
            {actionLoading
              ? "Байршил тодорхойлж байна..."
              : checkedIn
              ? "🚪 Гарах бүртгэл хийх"
              : "✅ Ирц бүртгэх"}
          </button>

          {actionError && (
            <div
              style={{
                marginTop: 12,
                padding: "12px 16px",
                background: "#fef2f2",
                border: "1px solid #fca5a5",
                borderRadius: 8,
                color: "#dc2626",
                fontSize: 14,
              }}
            >
              {actionError}
            </div>
          )}
          {actionSuccess && (
            <div
              style={{
                marginTop: 12,
                padding: "12px 16px",
                background: "#f0fdf4",
                border: "1px solid #86efac",
                borderRadius: 8,
                color: "#16a34a",
                fontSize: 14,
              }}
            >
              {actionSuccess}
            </div>
          )}
        </div>
      )}

      {/* Recent history */}
      {status && status.recent.length > 0 && (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
            Сүүлийн 7 хоногийн бүртгэл
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {status.recent.map((s) => (
              <div
                key={s.id}
                style={{
                  background: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: "12px 16px",
                  fontSize: 13,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontWeight: 600, color: "#1f2937" }}>
                    📅 {formatDateTime(s.checkInAt)}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: s.checkOutAt ? "#16a34a" : "#f59e0b",
                      fontWeight: 600,
                    }}
                  >
                    {s.checkOutAt ? "✅ Гарсан" : "🟡 Нээлттэй"}
                  </span>
                </div>
                <div style={{ color: "#6b7280" }}>
                  {s.checkOutAt ? (
                    <>
                      Гарсан: {formatDateTime(s.checkOutAt)} •{" "}
                      {formatDuration(s.checkInAt, s.checkOutAt)}
                    </>
                  ) : (
                    <>{formatDuration(s.checkInAt)} болж байна</>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
