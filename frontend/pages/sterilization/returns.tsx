import React, { useEffect, useMemo, useState } from "react";

type Branch = { id: number; name: string };

type Doctor = {
  id: number;
  name: string | null;
  ovog: string | null;
  email: string;
  branchId: number | null;
  branches: Array<{ id: number; name: string }>;
};

type NurseUser = {
  id: number;
  email: string;
  name?: string | null;
  ovog?: string | null;
  branchId?: number | null;
  branches?: Array<{ id: number; name: string }>;
};

type Tool = {
  id: number;
  branchId: number;
  name: string;
  baselineAmount: number;
};

type ReturnLine = {
  id: number;
  toolId: number;
  returnedQty: number;
  tool?: { id: number; name: string };
};

type ReturnRecord = {
  id: number;
  branchId: number;
  date: string; // ISO string (stored as midnight)
  time: string; // "HH:mm"
  doctorId: number;
  nurseName: string;
  notes: string | null;

  branch?: { id: number; name: string };
  doctor?: { id: number; name: string | null; ovog: string | null; email: string };
  lines: ReturnLine[];

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

function doctorLabel(d: Doctor | ReturnRecord["doctor"] | null | undefined) {
  if (!d) return "—";
  const full = `${(d as any).ovog || ""} ${(d as any).name || ""}`.trim();
  return full || (d as any).email || "—";
}

function formatUserLabel(u: { id: number; email: string; name?: string | null; ovog?: string | null }): string {
  if (u.ovog && u.ovog.trim() && u.name && u.name.trim()) return `${u.ovog.trim().charAt(0)}.${u.name.trim()}`;
  if (u.name && u.name.trim()) return u.name.trim();
  if (u.email) return u.email;
  return `User #${u.id}`;
}

function sumLines(lines: ReturnLine[]) {
  return (lines || []).reduce((s, ln) => s + Number(ln.returnedQty || 0), 0);
}

export default function SterilizationReturnsPage() {
  const now = useMemo(() => new Date(), []);
  const todayYmd = useMemo(() => formatDateOnly(now), [now]);

  // Lookup data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [allNurses, setAllNurses] = useState<NurseUser[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);

  // Filtered lists derived from selected branch
  const [filteredDoctors, setFilteredDoctors] = useState<Doctor[]>([]);
  const [filteredNurses, setFilteredNurses] = useState<NurseUser[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  // Create form fields
  const [branchId, setBranchId] = useState<number | "">("");
  const [date, setDate] = useState<string>(todayYmd);
  const [time, setTime] = useState<string>(formatHHmm(new Date()));
  const [doctorId, setDoctorId] = useState<number | "">("");
  const [nurseName, setNurseName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // qty inputs for all tools (keyed by toolId)
  const [qtyByToolId, setQtyByToolId] = useState<Record<number, number>>({});
  const [toolFilter, setToolFilter] = useState<string>("");

  // History
  const [records, setRecords] = useState<ReturnRecord[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Filters
  const [filterBranchId, setFilterBranchId] = useState<number | "">("");
  const [filterDoctorId, setFilterDoctorId] = useState<number | "">("");
  const [filterFrom, setFilterFrom] = useState(formatDateOnly(new Date(Date.now() - THIRTY_DAYS_MS)));
  const [filterTo, setFilterTo] = useState(formatDateOnly(new Date()));

  const [loading, setLoading] = useState(false);
  const [loadingTools, setLoadingTools] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Load branches + doctors + nurses on mount
  useEffect(() => {
    (async () => {
      setLoadingStaff(true);
      try {
        const [bRes, dRes, nRes] = await Promise.all([
          fetch("/api/branches"),
          fetch("/api/users?role=doctor"),
          fetch("/api/users?role=nurse"),
        ]);
        const bJson = await bRes.json().catch(() => []);
        const dJson = await dRes.json().catch(() => []);
        const nJson = await nRes.json().catch(() => []);

        if (bRes.ok) setBranches(Array.isArray(bJson) ? bJson : []);
        if (dRes.ok) setAllDoctors(Array.isArray(dJson) ? dJson : []);
        if (nRes.ok) setAllNurses(Array.isArray(nJson) ? nJson : []);
      } catch {
        // ignore
      } finally {
        setLoadingStaff(false);
      }
    })();
  }, []);

  // When branch changes in create form: load tools for that branch
  useEffect(() => {
    if (!branchId) {
      setTools([]);
      setQtyByToolId({});
      return;
    }

    (async () => {
      setLoadingTools(true);
      try {
        const res = await fetch(`/api/sterilization/items?branchId=${branchId}`);
        const json = await res.json().catch(() => []);
        if (res.ok) {
          const list: Tool[] = Array.isArray(json) ? json : [];
          setTools(list);

          // Initialize qty map (keep any existing typed values if same toolId exists)
          setQtyByToolId((prev) => {
            const next: Record<number, number> = {};
            for (const t of list) next[t.id] = Number(prev[t.id] || 0);
            return next;
          });
        } else {
          setTools([]);
          setQtyByToolId({});
        }
      } catch {
        setTools([]);
        setQtyByToolId({});
      } finally {
        setLoadingTools(false);
      }
    })();
  }, [branchId]);

  // Mirror create branch to history branch filter (nice UX)
  useEffect(() => {
    if (branchId) setFilterBranchId(branchId);
  }, [branchId]);

  // Filter doctors and nurses by selected branch, auto-select first
  useEffect(() => {
    if (!branchId) {
      setFilteredDoctors([]);
      setFilteredNurses([]);
      setDoctorId("");
      setNurseName("");
      return;
    }
    const bid = Number(branchId);
    const docs = allDoctors.filter(
      (d) => d.branchId === bid || (d.branches && d.branches.some((b) => b.id === bid))
    );
    const nurses = allNurses.filter(
      (n) => n.branchId === bid || (n.branches && n.branches.some((b) => b.id === bid))
    );
    setFilteredDoctors(docs);
    setFilteredNurses(nurses);
    setDoctorId(docs.length > 0 ? docs[0].id : "");
    setNurseName(nurses.length > 0 ? formatUserLabel(nurses[0]) : "");
  }, [branchId, allDoctors, allNurses]);

  const filteredTools = useMemo(() => {
    const q = toolFilter.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((t) => t.name.toLowerCase().includes(q));
  }, [tools, toolFilter]);

  const totalReturnQty = useMemo(() => {
    return Object.values(qtyByToolId).reduce((s, v) => s + Number(v || 0), 0);
  }, [qtyByToolId]);

  const resetForm = () => {
    setDate(todayYmd);
    setTime(formatHHmm(new Date()));
    setDoctorId(filteredDoctors.length > 0 ? filteredDoctors[0].id : "");
    setNurseName(filteredNurses.length > 0 ? formatUserLabel(filteredNurses[0]) : "");
    setNotes("");
    setToolFilter("");
    setExpandedId(null);
    setQtyByToolId((prev) => {
      const next: Record<number, number> = {};
      for (const t of tools) next[t.id] = 0;
      // if tools not loaded, fallback
      return Object.keys(next).length ? next : {};
    });
  };

  const loadRecords = async () => {
    setLoadingList(true);
    setError("");
    try {
      if (!filterBranchId) {
        setRecords([]);
        return;
      }

      const params = new URLSearchParams();
      params.set("branchId", String(filterBranchId));
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);
      if (filterDoctorId) params.set("doctorId", String(filterDoctorId));

      const res = await fetch(`/api/sterilization/returns?${params.toString()}`);
      const json = await res.json().catch(() => []);
      if (!res.ok) throw new Error(json?.error || "Failed to load return records");

      setRecords(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setError(e?.message || "Алдаа гарлаа");
      setRecords([]);
    } finally {
      setLoadingList(false);
    }
  };

  // Auto load history when filters change
  useEffect(() => {
    void loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterBranchId, filterFrom, filterTo, filterDoctorId]);

  const submit = async () => {
    setError("");
    setSuccessMsg("");

    if (!branchId) return setError("Салбар сонгоно уу.");
    if (!date) return setError("Огноо оруулна уу.");
    if (!time) return setError("Цаг оруулна уу.");
    if (!doctorId) return setError("Эмч сонгоно уу.");
    if (!nurseName.trim()) return setError("Сувилагчийн нэр оруулна уу.");

    // Build lines with qty>0 only (your requirement)
    const lines = tools
      .map((t) => ({ toolId: t.id, returnedQty: Math.floor(Number(qtyByToolId[t.id] || 0)) }))
      .filter((x) => x.returnedQty > 0);

    if (lines.length === 0) {
      return setError("Дор хаяж нэг багажийн буцаасан тоо 0-ээс их байх ёстой.");
    }

    setLoading(true);
    try {
      const res = await fetch("/api/sterilization/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: Number(branchId),
          date, // YYYY-MM-DD
          time, // HH:mm
          doctorId: Number(doctorId),
          nurseName: nurseName.trim(),
          notes: notes.trim() || null,
          lines,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Багаж буцаалт хадгалахад алдаа гарлаа.");

      setSuccessMsg("✅ Багаж буцаалт амжилттай хадгалагдлаа.");
      resetForm();
      await loadRecords();
    } catch (e: any) {
      setError(e?.message || "Алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div style={{ padding: 20, fontFamily: "Arial, sans-serif", maxWidth: 1400 }}>
      <h1 style={{ marginBottom: 8 }}>Ариутгал → Багаж буцаалт</h1>
      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
        Ашигласан багажуудыг буцаан өгсөн бүртгэл (compliance-only). Бараа/нөөцөд нөлөөлөхгүй.
      </div>

      {/* Create form */}
      <div style={{ border: "1px solid #ccc", borderRadius: 8, padding: 20, marginBottom: 24, backgroundColor: "#f9f9f9" }}>
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>Шинэ буцаалт бүртгэх</h2>

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

          {/* Doctor */}
          <div>
            <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>
              Эмч <span style={{ color: "red" }}>*</span>
            </label>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value ? Number(e.target.value) : "")}
              disabled={!branchId || loadingStaff}
              style={{ width: "100%", padding: 8, fontSize: 14, borderRadius: 4, border: "1px solid #ccc" }}
            >
              {!branchId && <option value="">-- Эхлээд салбар сонгоно уу --</option>}
              {branchId && loadingStaff && <option value="">Ачаалж байна...</option>}
              {branchId && !loadingStaff && filteredDoctors.length === 0 && (
                <option value="">Энэ салбарт эмч олдсонгүй</option>
              )}
              {branchId && !loadingStaff &&
                filteredDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {formatUserLabel(d)}
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

          {/* Time */}
          <div>
            <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>
              Цаг <span style={{ color: "red" }}>*</span>
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              style={{ width: "100%", padding: 8, fontSize: 14, borderRadius: 4, border: "1px solid #ccc" }}
            />
          </div>

          {/* Nurse name */}
          <div>
            <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>
              Сувилагчийн нэр <span style={{ color: "red" }}>*</span>
            </label>
            <select
              value={nurseName}
              onChange={(e) => setNurseName(e.target.value)}
              disabled={!branchId || loadingStaff}
              style={{ width: "100%", padding: 8, fontSize: 14, borderRadius: 4, border: "1px solid #ccc" }}
            >
              {!branchId && <option value="">-- Эхлээд салбар сонгоно уу --</option>}
              {branchId && loadingStaff && <option value="">Ачаалж байна...</option>}
              {branchId && !loadingStaff && filteredNurses.length === 0 && (
                <option value="">Энэ салбарт сувилагч олдсонгүй</option>
              )}
              {branchId && !loadingStaff &&
                filteredNurses.map((n) => (
                  <option key={n.id} value={formatUserLabel(n)}>
                    {formatUserLabel(n)}
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

        {/* Tools table */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: "bold" }}>Багажийн жагсаалт (буцаасан тоо)</div>
            <input
              value={toolFilter}
              onChange={(e) => setToolFilter(e.target.value)}
              placeholder="Багаж хайх..."
              style={{ padding: 8, fontSize: 14, borderRadius: 6, border: "1px solid #ccc", minWidth: 240 }}
              disabled={!branchId || loadingTools}
            />
          </div>

          {!branchId && <div style={{ marginTop: 10, color: "#6b7280" }}>Эхлээд салбар сонгоно уу.</div>}
          {branchId && loadingTools && <div style={{ marginTop: 10, color: "#6b7280" }}>Багаж ачаалж байна...</div>}

          {branchId && !loadingTools && tools.length === 0 && (
            <div style={{ marginTop: 10, color: "#6b7280" }}>Энэ салбарт багаж бүртгэгдээгүй байна.</div>
          )}

          {branchId && !loadingTools && tools.length > 0 && (
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, background: "#fff" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f5f5f5" }}>
                    <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd" }}>Багаж</th>
                    <th style={{ padding: 10, textAlign: "right", borderBottom: "2px solid #ddd", width: 120 }}>Үндсэн</th>
                    <th style={{ padding: 10, textAlign: "right", borderBottom: "2px solid #ddd", width: 160 }}>Буцаасан тоо</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTools.map((t) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: 10 }}>{t.name}</td>
                      <td style={{ padding: 10, textAlign: "right", color: "#6b7280" }}>{t.baselineAmount}</td>
                      <td style={{ padding: 10, textAlign: "right" }}>
                        <input
                          type="number"
                          min={0}
                          value={qtyByToolId[t.id] ?? 0}
                          onChange={(e) => {
                            const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                            setQtyByToolId((prev) => ({ ...prev, [t.id]: v }));
                          }}
                          style={{
                            width: 120,
                            padding: 6,
                            fontSize: 14,
                            borderRadius: 4,
                            border: "1px solid #ccc",
                            textAlign: "right",
                          }}
                        />
                      </td>
                    </tr>
                  ))}

                  <tr style={{ borderTop: "2px solid #ddd" }}>
                    <td style={{ padding: 10, fontWeight: "bold" }}>Нийт</td>
                    <td style={{ padding: 10 }} />
                    <td style={{ padding: 10, textAlign: "right", fontWeight: "bold" }}>{totalReturnQty}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
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
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>Буцаалтын түүх</h2>

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
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>(Салбар сонгохгүй бол түүх хоосон)</div>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>Эмч</label>
            <select
              value={filterDoctorId}
              onChange={(e) => setFilterDoctorId(e.target.value ? Number(e.target.value) : "")}
              style={{ padding: 8, fontSize: 14, borderRadius: 4, border: "1px solid #ccc", minWidth: 240 }}
            >
              <option value="">-- Бүгд --</option>
              {allDoctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatUserLabel(d)}
                </option>
              ))}
            </select>
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
              onClick={() => void loadRecords()}
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
                <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd", width: 50 }} />
                <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd" }}>Огноо</th>
                <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd" }}>Цаг</th>
                <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd" }}>Эмч</th>
                <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd" }}>Сувилагч</th>
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

              {!loadingList && records.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#999" }}>
                    Мэдээлэл олдсонгүй
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const isExpanded = expandedId === r.id;
                  const total = sumLines(r.lines || []);
                  return (
                    <React.Fragment key={r.id}>
                      <tr
                        style={{ borderBottom: "1px solid #eee", cursor: "pointer", background: isExpanded ? "#fafafa" : "#fff" }}
                        onClick={() => toggleExpand(r.id)}
                      >
                        <td style={{ padding: 10, textAlign: "center" }}>{isExpanded ? "▼" : "▶"}</td>
                        <td style={{ padding: 10 }}>{new Date(r.date).toLocaleDateString("mn-MN")}</td>
                        <td style={{ padding: 10 }}>{r.time}</td>
                        <td style={{ padding: 10 }}>{doctorLabel(r.doctor)}</td>
                        <td style={{ padding: 10 }}>{r.nurseName}</td>
                        <td style={{ padding: 10, textAlign: "right", fontWeight: "bold" }}>{total}</td>
                        <td style={{ padding: 10, color: "#374151" }}>{r.notes || ""}</td>
                      </tr>

                      {isExpanded && (
                        <tr style={{ background: "#fafafa" }}>
                          <td colSpan={7} style={{ padding: 14 }}>
                            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Буцаасан багажууд:</div>
                            <div style={{ overflowX: "auto" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff" }}>
                                <thead>
                                  <tr style={{ borderBottom: "1px solid #e5e7eb", color: "#6b7280", textAlign: "left" }}>
                                    <th style={{ padding: "8px 10px" }}>Багаж</th>
                                    <th style={{ padding: "8px 10px", width: 160, textAlign: "right" }}>Буцаасан тоо</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(r.lines || [])
                                    .slice()
                                    .sort((a, b) => (a.tool?.name || "").localeCompare(b.tool?.name || ""))
                                    .map((ln) => (
                                      <tr key={ln.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                        <td style={{ padding: "8px 10px" }}>{ln.tool?.name || `Tool #${ln.toolId}`}</td>
                                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{ln.returnedQty}</td>
                                      </tr>
                                    ))}
                                  <tr style={{ borderTop: "2px solid #e5e7eb" }}>
                                    <td style={{ padding: "8px 10px", fontWeight: 700 }}>Бүгд</td>
                                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>{total}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loadingList && records.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>Нийт бүртгэл: {records.length}</div>
        )}
      </div>
    </div>
  );
}
