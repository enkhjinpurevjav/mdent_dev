import { useEffect, useMemo, useState } from "react";

type Branch = { id: number; name: string };

type SterilizationUser = {
  id: number;
  email: string;
  name?: string | null;
  ovog?: string | null;
};

function formatUserLabel(u: SterilizationUser): string {
  if (u.ovog && u.ovog.trim() && u.name && u.name.trim()) return `${u.ovog.trim().charAt(0)}.${u.name.trim()}`;
  if (u.name && u.name.trim()) return u.name.trim();
  if (u.email) return u.email;
  return `User #${u.id}`;
}

type DisinfectionLog = {
  id: number;
  branchId: number;
  date: string; // ISO string (stored as midnight)
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  rinsedWithDistilledWater: boolean;
  driedInUVCabinet: boolean;
  nurseName: string;
  notes: string | null;

  qtyPolishingRubber: number;
  qtyBrush: number;
  qtyCup: number;
  qtyLine: number;
  qtyShoeCutter: number;
  qtyPlasticMedicineTray: number;
  qtyPlasticSpatula: number;
  qtyTongueDepressor: number;
  qtyMouthOpener: number;
  qtyRootmeterTip: number;
  qtyTighteningTip: number;
  qtyBurContainer: number;
  qtyPlasticSpoon: number;

  branch?: { id: number; name: string };
  createdAt?: string;
  updatedAt?: string;
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function formatDateOnly(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatHHmm(date: Date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

type QtyKey =
  | "qtyPolishingRubber"
  | "qtyBrush"
  | "qtyCup"
  | "qtyLine"
  | "qtyShoeCutter"
  | "qtyPlasticMedicineTray"
  | "qtyPlasticSpatula"
  | "qtyTongueDepressor"
  | "qtyMouthOpener"
  | "qtyRootmeterTip"
  | "qtyTighteningTip"
  | "qtyBurContainer"
  | "qtyPlasticSpoon";

const TOOL_FIELDS: { key: QtyKey; label: string }[] = [
  { key: "qtyPolishingRubber", label: "Өнгөлгөөний резин" },
  { key: "qtyBrush", label: "Браш" },
  { key: "qtyCup", label: "Хундага" },
  { key: "qtyLine", label: "Шугам" },
  { key: "qtyShoeCutter", label: "Гута тасдагч" },
  { key: "qtyPlasticMedicineTray", label: "Эмийн хуванцар тавиур" },
  { key: "qtyPlasticSpatula", label: "Хуванцар шпатель" },
  { key: "qtyTongueDepressor", label: "Хэл дарагч" },
  { key: "qtyMouthOpener", label: "Ам тэлэгч" },
  { key: "qtyRootmeterTip", label: "Рутмерийн хошуу" },
  { key: "qtyTighteningTip", label: "Чангалагч хошуу" },
  { key: "qtyBurContainer", label: "Борын сав" },
  { key: "qtyPlasticSpoon", label: "Хуванцар халбага" },
];

function sumQty(row: Pick<DisinfectionLog, QtyKey>) {
  return TOOL_FIELDS.reduce((sum, f) => sum + Number(row[f.key] || 0), 0);
}

export default function DisinfectionPage() {
  const now = useMemo(() => new Date(), []);
  const todayYmd = useMemo(() => formatDateOnly(now), [now]);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [logs, setLogs] = useState<DisinfectionLog[]>([]);

  // Sterilization users for nurse select
  const [sterilizationUsers, setSterilizationUsers] = useState<SterilizationUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Create form
  const [branchId, setBranchId] = useState<number | "">("");
  const [date, setDate] = useState<string>(todayYmd);
  const [startTime, setStartTime] = useState<string>(formatHHmm(new Date()));
  const [endTime, setEndTime] = useState<string>(formatHHmm(new Date()));
  const [rinsedWithDistilledWater, setRinsedWithDistilledWater] = useState<boolean>(true); // default YES
  const [driedInUVCabinet, setDriedInUVCabinet] = useState<boolean>(false); // default NO
  const [nurseName, setNurseName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [qty, setQty] = useState<Record<QtyKey, number>>(() => {
    const init: Record<QtyKey, number> = {} as any;
    for (const f of TOOL_FIELDS) init[f.key] = 0;
    return init;
  });

  // Filters (history)
  const [filterBranchId, setFilterBranchId] = useState<number | "">("");
  const [filterFrom, setFilterFrom] = useState(formatDateOnly(new Date(Date.now() - THIRTY_DAYS_MS)));
  const [filterTo, setFilterTo] = useState(formatDateOnly(new Date()));

  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Load branches
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/branches");
        const data = await res.json().catch(() => []);
        if (res.ok) setBranches(Array.isArray(data) ? data : []);
      } catch {
        // ignore
      }
    })();
  }, []);

  // If branch selected in form, default filter branch too (optional UX)
  useEffect(() => {
    if (branchId) setFilterBranchId(branchId);
  }, [branchId]);

  // Load sterilization users when branch changes
  useEffect(() => {
    if (!branchId) {
      setSterilizationUsers([]);
      setNurseName("");
      return;
    }
    setLoadingUsers(true);
    (async () => {
      try {
        const res = await fetch(`/api/users?role=sterilization&branchId=${branchId}`);
        const data = await res.json().catch(() => []);
        if (res.ok && Array.isArray(data)) {
          setSterilizationUsers(data);
          setNurseName(data.length > 0 ? formatUserLabel(data[0]) : "");
        } else {
          setSterilizationUsers([]);
          setNurseName("");
        }
      } catch {
        setSterilizationUsers([]);
        setNurseName("");
      } finally {
        setLoadingUsers(false);
      }
    })();
  }, [branchId]);

  const loadLogs = async () => {
    setLoadingList(true);
    try {
      setError("");
      const bid = filterBranchId || branchId;
      if (!bid) {
        setLogs([]);
        return;
      }

      const params = new URLSearchParams();
      params.set("branchId", String(bid));
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);

      const res = await fetch(`/api/sterilization/disinfection-logs?${params.toString()}`);
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error || "Failed to load disinfection logs");

      setLogs(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Алдаа гарлаа");
      setLogs([]);
    } finally {
      setLoadingList(false);
    }
  };

  // Reload history when filters change
  useEffect(() => {
    void loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterBranchId, filterFrom, filterTo]);

  const setQtyField = (key: QtyKey, value: number) => {
    const n = Number.isFinite(value) ? Math.floor(value) : 0;
    setQty((prev) => ({ ...prev, [key]: Math.max(0, n) }));
  };

  const resetForm = () => {
    setDate(todayYmd);
    setStartTime(formatHHmm(new Date()));
    setEndTime(formatHHmm(new Date()));
    setRinsedWithDistilledWater(true);
    setDriedInUVCabinet(false);
    setNurseName(sterilizationUsers.length > 0 ? formatUserLabel(sterilizationUsers[0]) : "");
    setNotes("");
    const cleared: Record<QtyKey, number> = {} as any;
    for (const f of TOOL_FIELDS) cleared[f.key] = 0;
    setQty(cleared);
  };

  const submit = async () => {
    setError("");
    setSuccessMsg("");

    if (!branchId) return setError("Салбар сонгоно уу.");
    if (!date) return setError("Огноо оруулна уу.");
    if (!startTime) return setError("Эхэлсэн цаг оруулна уу.");
    if (!endTime) return setError("Дууссан цаг оруулна уу.");
    if (!nurseName.trim()) return setError("Сувилагчийн нэр оруулна уу.");

    const total = TOOL_FIELDS.reduce((s, f) => s + (qty[f.key] || 0), 0);
    if (total <= 0) return setError("Дор хаяж нэг багажийн тоо 0-ээс их байх ёстой.");

    setLoading(true);
    try {
      const body: any = {
        branchId: Number(branchId),
        date, // YYYY-MM-DD
        startTime, // HH:mm
        endTime, // HH:mm
        rinsedWithDistilledWater,
        driedInUVCabinet,
        nurseName: nurseName.trim(),
        notes: notes.trim() || null,
      };

      for (const f of TOOL_FIELDS) body[f.key] = qty[f.key] || 0;

      const res = await fetch("/api/sterilization/disinfection-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Халдваргүйтгэл хадгалахад алдаа гарлаа.");

      setSuccessMsg("✅ Халдваргүйтгэлийн бүртгэл амжилттай хадгалагдлаа.");
      resetForm();
      await loadLogs();
    } catch (e: any) {
      setError(e?.message || "Алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: "Arial, sans-serif", maxWidth: 1200 }}>
      <h1 style={{ marginBottom: 8 }}>Халдваргүйтгэл</h1>
      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
        Тухайн өдрийн халдваргүйтгэсэн багажийн тоо болон үйл явцын тэмдэглэл.
      </div>

      {/* Create Form */}
      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: 8,
          padding: 20,
          marginBottom: 24,
          backgroundColor: "#f9f9f9",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>Шинэ бүртгэл үүсгэх</h2>

        {error && (
          <div style={{ padding: 10, backgroundColor: "#ffebee", color: "#c62828", borderRadius: 4, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {successMsg && (
          <div style={{ padding: 10, backgroundColor: "#e8f5e9", color: "#2e7d32", borderRadius: 4, marginBottom: 12 }}>
            {successMsg}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {/* Branch */}
          <div>
            <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>
              Салбар <span style={{ color: "red" }}>*</span>
            </label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : "")}
              style={{ width: "100%", padding: 8, fontSize: 14, borderRadius: 4, border: "1px solid #ccc" }}
            >
              <option value="">-- Сонгох --</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>
              Огноо <span style={{ color: "red" }}>*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ width: "100%", padding: 8, fontSize: 14, borderRadius: 4, border: "1px solid #ccc" }}
            />
          </div>

          {/* Start time */}
          <div>
            <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>
              Эхэлсэн цаг <span style={{ color: "red" }}>*</span>
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={{ width: "100%", padding: 8, fontSize: 14, borderRadius: 4, border: "1px solid #ccc" }}
            />
          </div>

          {/* End time */}
          <div>
            <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>
              Дууссан цаг <span style={{ color: "red" }}>*</span>
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              style={{ width: "100%", padding: 8, fontSize: 14, borderRadius: 4, border: "1px solid #ccc" }}
            />
          </div>

          {/* Rinsed */}
          <div>
            <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>
              Нэрмэл усаар зайлсан эсэх <span style={{ color: "red" }}>*</span>
            </label>
            <select
              value={rinsedWithDistilledWater ? "YES" : "NO"}
              onChange={(e) => setRinsedWithDistilledWater(e.target.value === "YES")}
              style={{ width: "100%", padding: 8, fontSize: 14, borderRadius: 4, border: "1px solid #ccc" }}
            >
              <option value="YES">Тийм</option>
              <option value="NO">Үгүй</option>
            </select>
          </div>

          {/* UV dried */}
          <div>
            <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>
              Хэт ягаан туяатай хатаах шүүгээнд хатаасан эсэх <span style={{ color: "red" }}>*</span>
            </label>
            <select
              value={driedInUVCabinet ? "YES" : "NO"}
              onChange={(e) => setDriedInUVCabinet(e.target.value === "YES")}
              style={{ width: "100%", padding: 8, fontSize: 14, borderRadius: 4, border: "1px solid #ccc" }}
            >
              <option value="NO">Үгүй</option>
              <option value="YES">Тийм</option>
            </select>
          </div>

          {/* Nurse */}
          <div>
            <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>
              Сувилагчийн нэр <span style={{ color: "red" }}>*</span>
            </label>
            <select
              value={nurseName}
              onChange={(e) => setNurseName(e.target.value)}
              disabled={!branchId || loadingUsers}
              style={{ width: "100%", padding: 8, fontSize: 14, borderRadius: 4, border: "1px solid #ccc" }}
            >
              {!branchId && <option value="">-- Эхлээд салбар сонгоно уу --</option>}
              {branchId && loadingUsers && <option value="">Ачаалж байна...</option>}
              {branchId && !loadingUsers && sterilizationUsers.length === 0 && (
                <option value="">Ариутгалын ажилтан олдсонгүй</option>
              )}
              {branchId && !loadingUsers &&
                sterilizationUsers.map((u) => (
                  <option key={u.id} value={formatUserLabel(u)}>
                    {formatUserLabel(u)}
                  </option>
                ))}
            </select>
          </div>

          {/* Notes */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>Тэмдэглэл</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Тэмдэглэл..."
              style={{ width: "100%", padding: 8, fontSize: 14, borderRadius: 4, border: "1px solid #ccc" }}
            />
          </div>
        </div>

        {/* Tool quantities */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: "bold", marginBottom: 8 }}>Багажийн тоо (0 байж болно)</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, background: "#fff" }}>
              <thead>
                <tr style={{ backgroundColor: "#f5f5f5" }}>
                  <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd" }}>Багаж</th>
                  <th style={{ padding: 10, textAlign: "right", borderBottom: "2px solid #ddd", width: 140 }}>Тоо</th>
                </tr>
              </thead>
              <tbody>
                {TOOL_FIELDS.map((f) => (
                  <tr key={f.key} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 10 }}>{f.label}</td>
                    <td style={{ padding: 10, textAlign: "right" }}>
                      <input
                        type="number"
                        min={0}
                        value={qty[f.key]}
                        onChange={(e) => setQtyField(f.key, Number(e.target.value) || 0)}
                        style={{ width: 110, padding: 6, fontSize: 14, borderRadius: 4, border: "1px solid #ccc", textAlign: "right" }}
                      />
                    </td>
                  </tr>
                ))}

                <tr style={{ borderTop: "2px solid #ddd" }}>
                  <td style={{ padding: 10, fontWeight: "bold" }}>Нийт</td>
                  <td style={{ padding: 10, textAlign: "right", fontWeight: "bold" }}>
                    {TOOL_FIELDS.reduce((s, f) => s + (qty[f.key] || 0), 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <button
            onClick={submit}
            disabled={loading}
            style={{
              padding: "10px 20px",
              fontSize: 16,
              backgroundColor: loading ? "#ccc" : "#4caf50",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Хадгалж байна..." : "Хадгалах"}
          </button>
        </div>
      </div>

      {/* History */}
      <div style={{ border: "1px solid #ccc", borderRadius: 8, padding: 20, backgroundColor: "#fff" }}>
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>Бүртгэлийн түүх</h2>

        <div style={{ display: "flex", gap: 15, marginBottom: 16, flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>Салбар</label>
            <select
              value={filterBranchId}
              onChange={(e) => setFilterBranchId(e.target.value ? Number(e.target.value) : "")}
              style={{ padding: 8, fontSize: 14, borderRadius: 4, border: "1px solid #ccc" }}
            >
              <option value="">-- Сонгох --</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
              (Салбар сонгохгүй бол жагсаалт хоосон байна)
            </div>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>Эхлэх огноо</label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              style={{ padding: 8, fontSize: 14, borderRadius: 4, border: "1px solid #ccc" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>Дуусах огноо</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              style={{ padding: 8, fontSize: 14, borderRadius: 4, border: "1px solid #ccc" }}
            />
          </div>

          <div style={{ alignSelf: "flex-end" }}>
            <button
              type="button"
              onClick={() => void loadLogs()}
              disabled={loadingList}
              style={{
                padding: "9px 14px",
                fontSize: 14,
                backgroundColor: "#fff",
                border: "1px solid #ccc",
                borderRadius: 4,
                cursor: loadingList ? "not-allowed" : "pointer",
              }}
            >
              {loadingList ? "Ачаалж байна..." : "Шинэчлэх"}
            </button>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ backgroundColor: "#f5f5f5" }}>
                <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd" }}>Огноо</th>
                <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd" }}>Цаг</th>
                <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd" }}>Сувилагч</th>
                <th style={{ padding: 10, textAlign: "center", borderBottom: "2px solid #ddd" }}>Нэрмэл ус</th>
                <th style={{ padding: 10, textAlign: "center", borderBottom: "2px solid #ddd" }}>UV</th>
                <th style={{ padding: 10, textAlign: "right", borderBottom: "2px solid #ddd" }}>Нийт</th>
                <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd" }}>Тэмдэглэл</th>
              </tr>
            </thead>
            <tbody>
              {loadingList && (
                <tr>
                  <td colSpan={7} style={{ padding: 16, textAlign: "center", color: "#6b7280" }}>
                    Ачаалж байна...
                  </td>
                </tr>
              )}

              {!loadingList && logs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#999" }}>
                    Мэдээлэл олдсонгүй
                  </td>
                </tr>
              ) : (
                logs.map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 10 }}>{new Date(row.date).toLocaleDateString("mn-MN")}</td>
                    <td style={{ padding: 10 }}>
                      {row.startTime}–{row.endTime}
                    </td>
                    <td style={{ padding: 10 }}>{row.nurseName}</td>
                    <td style={{ padding: 10, textAlign: "center" }}>{row.rinsedWithDistilledWater ? "Тийм" : "Үгүй"}</td>
                    <td style={{ padding: 10, textAlign: "center" }}>{row.driedInUVCabinet ? "Тийм" : "Үгүй"}</td>
                    <td style={{ padding: 10, textAlign: "right", fontWeight: "bold" }}>{sumQty(row as any)}</td>
                    <td style={{ padding: 10, color: "#374151" }}>{row.notes || ""}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Optional: show breakdown summary for the currently loaded list */}
        {logs.length > 0 && !loadingList && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
            Нийт бүртгэл: {logs.length}
          </div>
        )}
      </div>
    </div>
  );
}
