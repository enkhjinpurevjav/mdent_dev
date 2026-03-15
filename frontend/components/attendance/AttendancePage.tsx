import React, { useEffect, useState, useCallback } from "react";

type Branch = {
  id: number;
  name: string;
};

type AttendanceSession = {
  id: number;
  branchId: number;
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
  allowedBranches: Branch[];
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
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    setStatusError("");
    try {
      const res = await fetch("/api/attendance/me", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error || "Мэдээлэл татахад алдаа гарлаа.");
      }
      const data: MeResponse = await res.json();
      setStatus(data);
      // Auto-select branch: keep existing selection if still valid, else default to first
      setSelectedBranchId((prev) => {
        const branches = data.allowedBranches ?? [];
        if (branches.length === 0) return null;
        if (prev !== null && branches.some((b) => b.id === prev)) return prev;
        return branches[0].id;
      });
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

    // For check-in a branch must be selected
    if (type === "check-in" && selectedBranchId === null) {
      setActionError("Салбар сонгоно уу.");
      setActionLoading(false);
      return;
    }

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
      const body: Record<string, unknown> = { lat, lng, accuracyM };
      if (type === "check-in") {
        body.branchId = selectedBranchId;
      }

      const res = await fetch(`/api/attendance/${type}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error((data as any).error || "Алдаа гарлаа.");
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
  const canShowAction = !loadingStatus && !statusError;

  return (
    <div className="mx-auto w-full max-w-[640px] px-6 py-6 font-sans">
      <h1 className="text-[22px] font-bold leading-tight mb-1">🕘 Ирц бүртгэл</h1>
      <p className="text-[13px] text-gray-500 mb-6">
        Ирэх болон явах бүртгэлийг GPS байршлаар баталгаажуулна.
      </p>

      {/* Current status card */}
      <div
        className={[
          "rounded-xl border p-5 mb-6",
          checkedIn ? "bg-green-50 border-green-300" : "bg-slate-50 border-slate-200",
        ].join(" ")}
      >
        {loadingStatus ? (
          <p className="text-[14px] text-gray-500">Мэдээлэл ачааллаж байна...</p>
        ) : statusError ? (
          <p className="text-[14px] text-red-500">{statusError}</p>
        ) : (
          <div className={["flex items-center gap-2.5", checkedIn ? "mb-3" : ""].join(" ")}>
            <span className="text-[28px] leading-none">{checkedIn ? "🟢" : "🔴"}</span>
            <div>
              <div className="text-[16px] font-semibold text-gray-900">
                {checkedIn ? "Ажил дээр байна" : "Ажилд ирээгүй байна"}
              </div>

              {checkedIn && status?.openSession && (
                <div className="mt-0.5 text-[13px] text-gray-600">
                  Ирсэн цаг: {formatDateTime(status.openSession.checkInAt)} —{" "}
                  {formatDuration(status.openSession.checkInAt)} болж байна
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Branch selector — shown only when not yet checked in */}
      {canShowAction && !checkedIn && (
        <div className="mb-4">
          {(status?.allowedBranches ?? []).length === 0 ? (
            <p className="text-[13px] text-amber-600">
              Таны бүртгэлд салбар холбогдоогүй байна. Администраторт хандана уу.
            </p>
          ) : (status?.allowedBranches ?? []).length === 1 ? (
            <p className="text-[13px] text-gray-600">
              Салбар:{" "}
              <span className="font-semibold text-gray-800">
                {status?.allowedBranches[0]?.name}
              </span>
            </p>
          ) : (
            <div>
              <label
                htmlFor="branch-select"
                className="mb-1 block text-[13px] font-medium text-gray-700"
              >
                Салбар сонгох
              </label>
              <select
                id="branch-select"
                value={selectedBranchId ?? ""}
                onChange={(e) => setSelectedBranchId(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {(status?.allowedBranches ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Action button */}
      {canShowAction && (
        <div className="mb-6">
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => handleAction(checkedIn ? "check-out" : "check-in")}
            className={[
              "w-full rounded-[10px] px-6 py-3.5 text-[16px] font-semibold text-white transition-colors",
              actionLoading ? "cursor-not-allowed bg-gray-400" : "cursor-pointer",
              !actionLoading && checkedIn ? "bg-red-500 hover:bg-red-600" : "",
              !actionLoading && !checkedIn ? "bg-blue-600 hover:bg-blue-700" : "",
            ].join(" ")}
          >
            {actionLoading
              ? "Байршил тодорхойлж байна..."
              : checkedIn
                ? "🚪 Гарах бүртгэл хийх"
                : "✅ Ирц бүртгэх"}
          </button>

          {actionError && (
            <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-[14px] text-red-700">
              {actionError}
            </div>
          )}

          {actionSuccess && (
            <div className="mt-3 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-[14px] text-green-700">
              {actionSuccess}
            </div>
          )}
        </div>
      )}

      {/* Recent history */}
      {status && status.recent.length > 0 && (
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900 mb-3">
            Сүүлийн 7 хоногийн бүртгэл
          </h2>

          <div className="flex flex-col gap-2">
            {status.recent.map((s) => {
              const isClosed = !!s.checkOutAt;
              return (
                <div
                  key={s.id}
                  className="rounded-[10px] border border-gray-200 bg-white px-4 py-3 text-[13px]"
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="font-semibold text-gray-800">
                      📅 {formatDateTime(s.checkInAt)}
                    </span>

                    <span
                      className={[
                        "text-[12px] font-semibold",
                        isClosed ? "text-green-600" : "text-amber-500",
                      ].join(" ")}
                    >
                      {isClosed ? "✅ Гарсан" : "🟡 Нээлттэй"}
                    </span>
                  </div>

                  <div className="text-gray-500">
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
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
