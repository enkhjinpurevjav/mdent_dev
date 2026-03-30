import { useEffect, useRef, useState } from "react";

type Branch = { id: number; name: string };

type SterilizationUser = {
  id: number;
  email: string;
  name?: string | null;
  ovog?: string | null;
};

type Machine = {
  id: number;
  machineNumber: string;
  name: string | null;
  branchId: number;
};

type BurCycle = {
  id: number;
  branchId: number;
  code: string;
  sterilizationRunNumber: string;
  machineId: number;
  startedAt: string;
  pressure: string | null;
  temperature: number | null;
  finishedAt: string;
  removedFromAutoclaveAt: string | null;
  result: "PASS" | "FAIL";
  operator: string;
  notes: string | null;
  fastBurQty: number;
  slowBurQty: number;
  createdAt: string;
  updatedAt: string;
  branch: { id: number; name: string };
  machine: { id: number; machineNumber: string; name: string | null } | null;
};

function formatDateTime(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

function formatDateOnly(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function addMinutes(dateTimeLocal: string, minutes: number): string {
  const d = new Date(dateTimeLocal);
  d.setMinutes(d.getMinutes() + minutes);
  return formatDateTime(d);
}

function formatUserLabel(u: SterilizationUser): string {
  if (u.ovog && u.ovog.trim() && u.name && u.name.trim()) return `${u.ovog.trim().charAt(0)}.${u.name.trim()}`;
  if (u.name && u.name.trim()) return u.name.trim();
  if (u.email) return u.email;
  return `User #${u.id}`;
}

export default function BurCyclesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [burCycles, setBurCycles] = useState<BurCycle[]>([]);

  // Sterilization users for operator select
  const [sterilizationUsers, setSterilizationUsers] = useState<SterilizationUser[]>([]);

  // Form fields
  const [branchId, setBranchId] = useState<number | "">("");
  const [code, setCode] = useState("");
  const [codeWarning, setCodeWarning] = useState("");
  const [lastCheckedCode, setLastCheckedCode] = useState("");
  const [sterilizationRunNumber, setSterilizationRunNumber] = useState("");
  const [runNumberWarning, setRunNumberWarning] = useState("");
  const [lastCheckedRunNumber, setLastCheckedRunNumber] = useState("");
  const [machineId, setMachineId] = useState<number | "">("");
  const [startedAt, setStartedAt] = useState(formatDateTime(new Date()));
  const [pressure, setPressure] = useState("0247");
  const [temperature, setTemperature] = useState("138");
  const [finishedAt, setFinishedAt] = useState(() => addMinutes(formatDateTime(new Date()), 10));
  // Track whether the user has manually overridden finishedAt
  const finishedAtOverridden = useRef(false);
  // Keep a ref to always have the current startedAt value available in effects
  const startedAtRef = useRef(startedAt);
  useEffect(() => {
    startedAtRef.current = startedAt;
  }, [startedAt]);
  const [removedFromAutoclaveAt, setRemovedFromAutoclaveAt] = useState("");
  const [result, setResult] = useState<"PASS" | "FAIL">("PASS");
  const [operator, setOperator] = useState("");
  const [notes, setNotes] = useState("");
  const [fastBurQty, setFastBurQty] = useState<number>(0);
  const [slowBurQty, setSlowBurQty] = useState<number>(0);

  // Filter fields
  const [filterFrom, setFilterFrom] = useState(formatDateOnly(new Date(Date.now() - THIRTY_DAYS_MS))); // 30 days ago
  const [filterTo, setFilterTo] = useState(formatDateOnly(new Date()));
  const [filterBranchId, setFilterBranchId] = useState<number | "">("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Load branches on mount
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

  // Load machines when branch changes
  useEffect(() => {
    if (!branchId) {
      setMachines([]);
      setMachineId("");
      setSterilizationUsers([]);
      setOperator("");
      return;
    }

    // Reset finishedAt override when branch changes
    finishedAtOverridden.current = false;
    const newFinishedAt = addMinutes(startedAtRef.current || formatDateTime(new Date()), 10);
    setFinishedAt(newFinishedAt);

    (async () => {
      try {
        const res = await fetch(`/api/sterilization/machines?branchId=${branchId}`);
        const data = await res.json().catch(() => []);

        if (res.ok) {
          const machinesList = Array.isArray(data) ? data : [];
          setMachines(machinesList);
          // Default to first machine
          if (machinesList.length > 0) {
            setMachineId(machinesList[0].id);
          }
        }
      } catch {
        setMachines([]);
      }
    })();

    (async () => {
      try {
        const res = await fetch(`/api/users?role=sterilization&branchId=${branchId}`);
        const data = await res.json().catch(() => []);
        if (res.ok && Array.isArray(data)) {
          setSterilizationUsers(data);
          setOperator(data.length > 0 ? formatUserLabel(data[0]) : "");
        } else {
          setSterilizationUsers([]);
          setOperator("");
        }
      } catch {
        setSterilizationUsers([]);
        setOperator("");
      }
    })();
  }, [branchId]);

  // Load bur cycles when filter changes
  useEffect(() => {
    loadBurCycles();
  }, [filterFrom, filterTo, filterBranchId]);

  const loadBurCycles = async () => {
    try {
      const params = new URLSearchParams();
      if (filterBranchId) params.append("branchId", String(filterBranchId));
      if (filterFrom) params.append("from", filterFrom);
      if (filterTo) params.append("to", filterTo);

      const res = await fetch(`/api/sterilization/bur-cycles?${params.toString()}`);
      const data = await res.json().catch(() => []);

      if (res.ok) {
        setBurCycles(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    }
  };

  const checkCodeUniqueness = async () => {
    if (!branchId || !code.trim()) {
      setCodeWarning("");
      return;
    }

    // Avoid duplicate checks for the same code
    if (code.trim() === lastCheckedCode) {
      return;
    }

    setLastCheckedCode(code.trim());

    try {
      const res = await fetch(
        `/api/sterilization/bur-cycles/check-code?branchId=${branchId}&code=${encodeURIComponent(code.trim())}`
      );
      const data = await res.json().catch(() => ({ exists: false }));

      if (data.exists) {
        setCodeWarning("⚠️ Энэ циклийн дугаар аль хэдийн ашиглагдсан байна");
      } else {
        setCodeWarning("");
      }
    } catch {
      setCodeWarning("");
    }
  };

  const checkRunNumberUniqueness = async () => {
    if (!machineId || !sterilizationRunNumber.trim()) {
      setRunNumberWarning("");
      return;
    }

    // Avoid duplicate checks
    if (sterilizationRunNumber.trim() === lastCheckedRunNumber) {
      return;
    }

    setLastCheckedRunNumber(sterilizationRunNumber.trim());

    try {
      const res = await fetch(
        `/api/sterilization/bur-cycles/check-run-number?machineId=${machineId}&sterilizationRunNumber=${encodeURIComponent(
          sterilizationRunNumber.trim()
        )}`
      );
      const data = await res.json().catch(() => ({ exists: false }));

      if (data.exists) {
        setRunNumberWarning("⚠️ Энэ ариутгалын дугаар аль хэдийн ашиглагдсан байна");
      } else {
        setRunNumberWarning("");
      }
    } catch {
      setRunNumberWarning("");
    }
  };

  const submit = async () => {
    setError("");
    setSuccessMsg("");

    // Validation
    if (!branchId) return setError("Салбар сонгоно уу.");
    if (!code.trim()) return setError("Циклын код оруулна уу.");
    if (!sterilizationRunNumber.trim()) return setError("Ариутгалын дугаар оруулна уу.");
    if (!machineId) return setError("Машин сонгоно уу.");
    if (!startedAt) return setError("Эхэлсэн цаг оруулна уу.");
    if (!finishedAt) return setError("Дууссан цаг оруулна уу.");
    if (!operator.trim()) return setError("Сувилагчийн нэр оруулна уу.");

    if (fastBurQty === 0 && slowBurQty === 0) {
      return setError("Хурдан эсвэл удаан өрмийн тоо дор хаяж нэг нь 0-ээс их байх ёстой.");
    }

    setLoading(true);
    try {
      const res = await fetch("/api/sterilization/bur-cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          code: code.trim(),
          sterilizationRunNumber: sterilizationRunNumber.trim(),
          machineId,
          startedAt: new Date(startedAt).toISOString(),
          pressure: pressure.trim() || null,
          temperature: temperature ? Number(temperature) : null,
          finishedAt: new Date(finishedAt).toISOString(),
          removedFromAutoclaveAt: removedFromAutoclaveAt ? new Date(removedFromAutoclaveAt).toISOString() : null,
          result,
          operator: operator.trim(),
          notes: notes.trim() || null,
          fastBurQty,
          slowBurQty,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccessMsg("✅ Өрмийн бүртгэл амжилттай үүслээ.");
        // Reset form
        setCode("");
        setSterilizationRunNumber("");
        setPressure("0247");
        setTemperature("138");
        setNotes("");
        setFastBurQty(0);
        setSlowBurQty(0);
        const newStartedAt = formatDateTime(new Date());
        setStartedAt(newStartedAt);
        finishedAtOverridden.current = false;
        setFinishedAt(addMinutes(newStartedAt, 10));
        setRemovedFromAutoclaveAt("");
        setCodeWarning("");
        setRunNumberWarning("");
        setLastCheckedCode("");
        setLastCheckedRunNumber("");
        // Reload list
        loadBurCycles();
      } else {
        setError(data.error || "Алдаа гарлаа.");
      }
    } catch (err) {
      setError("Серверт холбогдох үед алдаа гарлаа.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ marginBottom: "20px" }}>Өрмийн бүртгэл, хяналт</h1>

      {/* Create Form */}
      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "30px",
          backgroundColor: "#f9f9f9",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "20px" }}>Шинэ бүртгэл үүсгэх</h2>

        {error && (
          <div style={{ padding: "10px", backgroundColor: "#ffebee", color: "#c62828", borderRadius: "4px", marginBottom: "15px" }}>
            {error}
          </div>
        )}

        {successMsg && (
          <div style={{ padding: "10px", backgroundColor: "#e8f5e9", color: "#2e7d32", borderRadius: "4px", marginBottom: "15px" }}>
            {successMsg}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
          {/* Branch */}
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Салбар <span style={{ color: "red" }}>*</span>
            </label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : "")}
              style={{ width: "100%", padding: "8px", fontSize: "14px", borderRadius: "4px", border: "1px solid #ccc" }}
            >
              <option value="">-- Сонгох --</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Machine */}
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Машин <span style={{ color: "red" }}>*</span>
            </label>
            <select
              value={machineId}
              onChange={(e) => setMachineId(e.target.value ? Number(e.target.value) : "")}
              style={{ width: "100%", padding: "8px", fontSize: "14px", borderRadius: "4px", border: "1px solid #ccc" }}
              disabled={!branchId}
            >
              <option value="">-- Сонгох --</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.machineNumber} {m.name ? `(${m.name})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Cycle Code */}
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Циклын код <span style={{ color: "red" }}>*</span>
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={checkCodeUniqueness}
              style={{ width: "100%", padding: "8px", fontSize: "14px", borderRadius: "4px", border: "1px solid #ccc" }}
              placeholder="Циклын код"
            />
            {codeWarning && <div style={{ color: "#ff9800", fontSize: "12px", marginTop: "3px" }}>{codeWarning}</div>}
          </div>

          {/* Sterilization Run Number */}
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Ариутгалын дугаар <span style={{ color: "red" }}>*</span>
            </label>
            <input
              type="text"
              value={sterilizationRunNumber}
              onChange={(e) => setSterilizationRunNumber(e.target.value)}
              onBlur={checkRunNumberUniqueness}
              style={{ width: "100%", padding: "8px", fontSize: "14px", borderRadius: "4px", border: "1px solid #ccc" }}
              placeholder="Ариутгалын дугаар"
            />
            {runNumberWarning && <div style={{ color: "#ff9800", fontSize: "12px", marginTop: "3px" }}>{runNumberWarning}</div>}
          </div>

          {/* Started At */}
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Эхэлсэн цаг <span style={{ color: "red" }}>*</span>
            </label>
            <input
              type="datetime-local"
              value={startedAt}
              onChange={(e) => {
                setStartedAt(e.target.value);
                if (!finishedAtOverridden.current) {
                  setFinishedAt(addMinutes(e.target.value, 10));
                }
              }}
              style={{ width: "100%", padding: "8px", fontSize: "14px", borderRadius: "4px", border: "1px solid #ccc" }}
            />
          </div>

          {/* Finished At */}
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Дууссан цаг <span style={{ color: "red" }}>*</span>
            </label>
            <input
              type="datetime-local"
              value={finishedAt}
              onChange={(e) => {
                finishedAtOverridden.current = true;
                setFinishedAt(e.target.value);
              }}
              style={{ width: "100%", padding: "8px", fontSize: "14px", border: "1px solid #ccc", borderRadius: "4px" }}
            />
          </div>

          {/* Pressure */}
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Даралт (kPa)</label>
            <input
              type="text"
              value={pressure}
              onChange={(e) => setPressure(e.target.value)}
              style={{ width: "100%", padding: "8px", fontSize: "14px", borderRadius: "4px", border: "1px solid #ccc" }}
              placeholder="жишээ: 90 230"
            />
          </div>

          {/* Temperature */}
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Температур (°C)</label>
            <input
              type="text"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              style={{ width: "100%", padding: "8px", fontSize: "14px", borderRadius: "4px", border: "1px solid #ccc" }}
              placeholder="Температур"
            />
          </div>

          {/* Removed From Autoclave At */}
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Автоклаваас гаргасан цаг</label>
            <input
              type="datetime-local"
              value={removedFromAutoclaveAt}
              onChange={(e) => setRemovedFromAutoclaveAt(e.target.value)}
              style={{ width: "100%", padding: "8px", fontSize: "14px", borderRadius: "4px", border: "1px solid #ccc" }}
            />
          </div>

          {/* Result */}
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Үр дүн <span style={{ color: "red" }}>*</span>
            </label>
            <select
              value={result}
              onChange={(e) => setResult(e.target.value as "PASS" | "FAIL")}
              style={{ width: "100%", padding: "8px", fontSize: "14px", borderRadius: "4px", border: "1px solid #ccc" }}
            >
              <option value="PASS">PASS</option>
              <option value="FAIL">FAIL</option>
            </select>
          </div>

          {/* Operator */}
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Сувилагчийн нэр <span style={{ color: "red" }}>*</span>
            </label>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              disabled={!branchId}
              style={{ width: "100%", padding: "8px", fontSize: "14px", borderRadius: "4px", border: "1px solid #ccc" }}
            >
              {sterilizationUsers.length === 0 ? (
                <option value="">-- Сонгох --</option>
              ) : (
                sterilizationUsers.map((u) => {
                  const label = formatUserLabel(u);
                  return (
                    <option key={u.id} value={label}>
                      {label}
                    </option>
                  );
                })
              )}
            </select>
          </div>

          {/* Fast Bur Qty */}
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Хурдан өрөм тоо</label>
            <input
              type="number"
              min="0"
              value={fastBurQty}
              onChange={(e) => setFastBurQty(Number(e.target.value) || 0)}
              style={{ width: "100%", padding: "8px", fontSize: "14px", borderRadius: "4px", border: "1px solid #ccc" }}
              placeholder="0"
            />
          </div>

          {/* Slow Bur Qty */}
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Удаан өрөм тоо</label>
            <input
              type="number"
              min="0"
              value={slowBurQty}
              onChange={(e) => setSlowBurQty(Number(e.target.value) || 0)}
              style={{ width: "100%", padding: "8px", fontSize: "14px", borderRadius: "4px", border: "1px solid #ccc" }}
              placeholder="0"
            />
          </div>

          {/* Notes (full width) */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Тэмдэглэл</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ width: "100%", padding: "8px", fontSize: "14px", borderRadius: "4px", border: "1px solid #ccc" }}
              placeholder="Тэмдэглэл..."
            />
          </div>
        </div>

        <div style={{ marginTop: "20px" }}>
          <button
            onClick={submit}
            disabled={loading}
            style={{
              padding: "10px 20px",
              fontSize: "16px",
              backgroundColor: loading ? "#ccc" : "#4caf50",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Хадгалж байна..." : "Хадгалах"}
          </button>
        </div>
      </div>

      {/* History List */}
      <div style={{ border: "1px solid #ccc", borderRadius: "8px", padding: "20px", backgroundColor: "#fff" }}>
        <h2 style={{ marginTop: 0, marginBottom: "20px" }}>Бүртгэлийн түүх</h2>

        {/* Filters */}
        <div style={{ display: "flex", gap: "15px", marginBottom: "20px", flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Салбар</label>
            <select
              value={filterBranchId}
              onChange={(e) => setFilterBranchId(e.target.value ? Number(e.target.value) : "")}
              style={{ padding: "8px", fontSize: "14px", borderRadius: "4px", border: "1px solid #ccc" }}
            >
              <option value="">-- Бүгд --</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Эхлэх огноо</label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              style={{ padding: "8px", fontSize: "14px", borderRadius: "4px", border: "1px solid #ccc" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Дуусах огноо</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              style={{ padding: "8px", fontSize: "14px", borderRadius: "4px", border: "1px solid #ccc" }}
            />
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f5f5f5" }}>
                <th style={{ padding: "10px", textAlign: "left", borderBottom: "2px solid #ddd" }}>Огноо</th>
                <th style={{ padding: "10px", textAlign: "left", borderBottom: "2px solid #ddd" }}>Салбар</th>
                <th style={{ padding: "10px", textAlign: "left", borderBottom: "2px solid #ddd" }}>Машин</th>
                <th style={{ padding: "10px", textAlign: "left", borderBottom: "2px solid #ddd" }}>Дугаар</th>
                <th style={{ padding: "10px", textAlign: "left", borderBottom: "2px solid #ddd" }}>Код</th>
                <th style={{ padding: "10px", textAlign: "right", borderBottom: "2px solid #ddd" }}>Хурдан өрөм</th>
                <th style={{ padding: "10px", textAlign: "right", borderBottom: "2px solid #ddd" }}>Удаан өрөм</th>
                <th style={{ padding: "10px", textAlign: "right", borderBottom: "2px solid #ddd" }}>Нийт өрөм</th>
                <th style={{ padding: "10px", textAlign: "center", borderBottom: "2px solid #ddd" }}>Үр дүн</th>
                <th style={{ padding: "10px", textAlign: "left", borderBottom: "2px solid #ddd" }}>Сувилагч</th>
              </tr>
            </thead>
            <tbody>
              {burCycles.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: "20px", textAlign: "center", color: "#999" }}>
                    Мэдээлэл олдсонгүй
                  </td>
                </tr>
              ) : (
                burCycles.map((cycle) => (
                  <tr key={cycle.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "10px" }}>{new Date(cycle.startedAt).toLocaleString("mn-MN")}</td>
                    <td style={{ padding: "10px" }}>{cycle.branch.name}</td>
                    <td style={{ padding: "10px" }}>
                      {cycle.machine
                        ? `${cycle.machine.machineNumber}${cycle.machine.name ? ` (${cycle.machine.name})` : ""}`
                        : cycle.machineId}
                    </td>
                    <td style={{ padding: "10px" }}>{cycle.sterilizationRunNumber}</td>
                    <td style={{ padding: "10px" }}>{cycle.code}</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>{cycle.fastBurQty}</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>{cycle.slowBurQty}</td>
                    <td style={{ padding: "10px", textAlign: "right", fontWeight: "bold" }}>
                      {cycle.fastBurQty + cycle.slowBurQty}
                    </td>
                    <td style={{ padding: "10px", textAlign: "center" }}>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: "4px",
                          backgroundColor: cycle.result === "PASS" ? "#e8f5e9" : "#ffebee",
                          color: cycle.result === "PASS" ? "#2e7d32" : "#c62828",
                          fontWeight: "bold",
                        }}
                      >
                        {cycle.result}
                      </span>
                    </td>
                    <td style={{ padding: "10px" }}>{cycle.operator}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
