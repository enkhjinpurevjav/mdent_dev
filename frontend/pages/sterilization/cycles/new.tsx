import React, { useEffect, useState } from "react";

type Branch = { id: number; name: string };

type SterilizationUser = {
  id: number;
  name: string | null;
  ovog: string | null;
  email: string;
};

function formatUserLabel(user: SterilizationUser): string {
  const ovog = user.ovog?.trim();
  const name = user.name?.trim();
  if (ovog && name) return `${ovog[0]}.${name}`;
  if (name) return name;
  if (user.email) return user.email;
  return `User #${user.id}`;
}

function addMinutes(datetimeLocal: string, minutes: number): string {
  if (!datetimeLocal) return "";
  const date = new Date(datetimeLocal);
  if (isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() + minutes);
  return formatDateTime(date);
}

type SterilizationItem = {
  id: number;
  name: string;
  branchId: number;
};

type Machine = {
  id: number;
  machineNumber: string;
  name: string | null;
  branchId: number;
};

type ToolLine = {
  id: string; // Stable unique identifier for React key
  toolId: number | "";
  producedQty: number;
  toolSearch: string; // Search query for filtering tools
  showDropdown: boolean; // Whether to show the dropdown
  duplicateError: string; // Error message for duplicate selection
};

function formatDateTime(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

let toolLineIdCounter = 0;

function generateId() {
  return `tool-line-${Date.now()}-${++toolLineIdCounter}`;
}

export default function CycleCreatePage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tools, setTools] = useState<SterilizationItem[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [sterilizationUsers, setSterilizationUsers] = useState<SterilizationUser[]>([]);

  const [branchId, setBranchId] = useState<number | "">("");
  const [code, setCode] = useState("");
  const [codeWarning, setCodeWarning] = useState("");
  const [lastCheckedCode, setLastCheckedCode] = useState("");
  const [sterilizationRunNumber, setSterilizationRunNumber] = useState("");
  const [machineId, setMachineId] = useState<number | "">("");
  const [startedAt, setStartedAt] = useState(formatDateTime(new Date()));
  const [pressure, setPressure] = useState("90-230");
  const [temperature, setTemperature] = useState("134");
  const finishedAt = addMinutes(startedAt, 90);
  const [removedFromAutoclaveAt, setRemovedFromAutoclaveAt] = useState("");
  const [result, setResult] = useState<"PASS" | "FAIL">("PASS");
  const [operator, setOperator] = useState("");
  const [notes, setNotes] = useState("");
  const [toolLines, setToolLines] = useState<ToolLine[]>([{ id: generateId(), toolId: "", producedQty: 1, toolSearch: "", showDropdown: false, duplicateError: "" }]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

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

  useEffect(() => {
    if (!branchId) {
      setTools([]);
      setMachines([]);
      setMachineId("");
      return;
    }
    
    (async () => {
      try {
        const [itemsRes, machinesRes] = await Promise.all([
          fetch(`/api/sterilization/items?branchId=${branchId}`),
          fetch(`/api/sterilization/machines?branchId=${branchId}`)
        ]);
        
        const itemsData = await itemsRes.json().catch(() => []);
        const machinesData = await machinesRes.json().catch(() => []);
        
        if (itemsRes.ok) setTools(Array.isArray(itemsData) ? itemsData : []);
        if (machinesRes.ok) {
          const machinesList = Array.isArray(machinesData) ? machinesData : [];
          setMachines(machinesList);
          // Default to first machine
          if (machinesList.length > 0) {
            setMachineId(machinesList[0].id);
          }
        }
      } catch {
        setTools([]);
        setMachines([]);
      }
    })();
  }, [branchId]);

  useEffect(() => {
    setSterilizationUsers([]);
    setOperator("");
    if (!branchId) return;
    (async () => {
      try {
        const res = await fetch(`/api/users?role=sterilization&branchId=${branchId}`);
        const data = await res.json().catch(() => []);
        if (res.ok) {
          const users: SterilizationUser[] = Array.isArray(data) ? data : [];
          setSterilizationUsers(users);
          if (users.length > 0) {
            setOperator(formatUserLabel(users[0]));
          }
        }
      } catch {
        setSterilizationUsers([]);
      }
    })();
  }, [branchId]);

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
      const res = await fetch(`/api/sterilization/cycles/check-code?branchId=${branchId}&code=${encodeURIComponent(code.trim())}`);
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

  const addToolLine = () => {
    setToolLines([...toolLines, { id: generateId(), toolId: "", producedQty: 1, toolSearch: "", showDropdown: false, duplicateError: "" }]);
  };

  const removeToolLine = (index: number) => {
    setToolLines(toolLines.filter((_, i) => i !== index));
  };

  const updateToolLine = (index: number, field: keyof ToolLine, value: any) => {
    const updated = [...toolLines];
    updated[index] = { ...updated[index], [field]: value };
    setToolLines(updated);
  };

  // Helper to update multiple fields in a single state update (reduces re-renders)
  const patchToolLine = (index: number, patches: Partial<ToolLine>) => {
    const updated = [...toolLines];
    updated[index] = { ...updated[index], ...patches };
    setToolLines(updated);
  };

  const selectTool = (index: number, toolId: number) => {
    // Check if this tool is already selected in another line
    const alreadySelected = toolLines.some((line, i) => i !== index && line.toolId === toolId);
    
    if (alreadySelected) {
      // Don't select, show error
      patchToolLine(index, { duplicateError: "Энэ багаж аль хэдийн сонгогдсон байна" });
      return;
    }
    
    // Find the tool name
    const selectedTool = tools.find((t) => t.id === toolId);
    
    // Update with single state change
    patchToolLine(index, {
      toolId,
      toolSearch: selectedTool?.name || "",
      showDropdown: false,
      duplicateError: "",
    });
  };

  const submit = async () => {
    setError("");
    setSuccessMsg("");

    if (!branchId) return setError("Салбар сонгоно уу.");
    if (!code.trim()) return setError("Циклын код оруулна уу.");
    if (!machineId) return setError("Машин сонгоно уу.");
    if (!startedAt) return setError("Эхэлсэн цаг оруулна уу.");
    if (!finishedAt) return setError("Дууссан цаг оруулна уу.");
    if (!operator.trim()) return setError("Сувилагч сонгоно уу.");

    const validLines = toolLines.filter((line) => line.toolId && line.producedQty >= 1);
    if (validLines.length === 0) {
      return setError("Дор хаяж 1 багаж нэмнэ үү.");
    }

    setLoading(true);
    try {
      const body: any = {
        branchId: Number(branchId),
        code: code.trim(),
        machineId: Number(machineId),
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        result,
        operator: operator.trim(),
        notes: notes.trim() || undefined,
        toolLines: validLines.map((line) => ({
          toolId: Number(line.toolId),
          producedQty: Math.floor(line.producedQty),
        })),
      };

      if (sterilizationRunNumber.trim()) {
        body.sterilizationRunNumber = sterilizationRunNumber.trim();
      }
      if (pressure.trim()) {
        // Sanitize pressure: keep only digits and spaces, normalize spacing
        const sanitizedPressure = pressure.replace(/-/g, ' ').replace(/[^\d\s]/g, '').replace(/\s+/g, ' ').trim();
        if (sanitizedPressure) {
          body.pressure = sanitizedPressure;
        }
      }
      if (temperature.trim()) {
        body.temperature = Number(temperature);
      }
      if (removedFromAutoclaveAt) {
        body.removedFromAutoclaveAt = new Date(removedFromAutoclaveAt).toISOString();
      }

      const res = await fetch("/api/sterilization/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Цикл үүсгэхэд алдаа гарлаа");

      setSuccessMsg(`Цикл үүсгэлээ: ${code.trim()}`);
      
      // Reset form
      setCode("");
      setCodeWarning("");
      setLastCheckedCode("");
      setSterilizationRunNumber("");
      setStartedAt(formatDateTime(new Date()));
      setPressure("90-230");
      setTemperature("134");
      setRemovedFromAutoclaveAt("");
      if (sterilizationUsers.length > 0) {
        setOperator(formatUserLabel(sterilizationUsers[0]));
      } else {
        setOperator("");
      }
      setNotes("");
      setToolLines([{ id: generateId(), toolId: "", producedQty: 1, toolSearch: "", showDropdown: false, duplicateError: "" }]);
      // Reset machine to first one if available
      if (machines.length > 0) {
        setMachineId(machines[0].id);
      }
    } catch (e: any) {
      setError(e?.message || "Алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200 }}>
      <h1 style={{ fontSize: 18, marginBottom: 6 }}>Ариутгал → Цикл үүсгэх</h1>
      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
        Автоклавын цикл үүсгэх. Багажуудын үйлдвэрлэгдсэн тоог бүртгэнэ.
      </div>

      {error && <div style={{ color: "#b91c1c", marginBottom: 10, fontSize: 13 }}>{error}</div>}
      {successMsg && <div style={{ color: "#15803d", marginBottom: 10, fontSize: 13 }}>{successMsg}</div>}

      {/* Header Information */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Циклын мэдээлэл</div>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: "#6b7280", marginBottom: 4, display: "block" }}>
              Салбар <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : "")}
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
            >
              <option value="">Сонгох...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#6b7280", marginBottom: 4, display: "block" }}>
              Ариутгалын дугаар
            </label>
            <input
              value={sterilizationRunNumber}
              onChange={(e) => setSterilizationRunNumber(e.target.value)}
              placeholder="Ж: SR-001"
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#6b7280", marginBottom: 4, display: "block" }}>
              Циклын код <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={checkCodeUniqueness}
              placeholder="Ж: T-2024-001"
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
              aria-describedby={codeWarning ? "code-warning" : undefined}
            />
            {codeWarning && (
              <div id="code-warning" role="alert" aria-live="polite" style={{ fontSize: 11, color: "#ea580c", marginTop: 4 }}>
                {codeWarning}
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#6b7280", marginBottom: 4, display: "block" }}>
              Машин <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <select
              value={machineId}
              onChange={(e) => setMachineId(e.target.value ? Number(e.target.value) : "")}
              disabled={!branchId || machines.length === 0}
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
            >
              <option value="">Сонгох...</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.machineNumber}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#6b7280", marginBottom: 4, display: "block" }}>
              Эхэлсэн цаг <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              type="datetime-local"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#6b7280", marginBottom: 4, display: "block" }}>
              Даралт
            </label>
            <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="text"
                value={pressure}
                onChange={(e) => setPressure(e.target.value)}
                placeholder="Ж: 90 230"
                style={{ flex: 1, border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", fontSize: 13, minWidth: 0 }}
              />
              <span style={{ fontSize: 13, color: "#6b7280", whiteSpace: "nowrap" }}>
                kPa
              </span>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#6b7280", marginBottom: 4, display: "block" }}>
              Температур
            </label>
            <input
              type="number"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder="Ж: 134"
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#6b7280", marginBottom: 4, display: "block" }}>
              Дууссан цаг <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              type="datetime-local"
              value={finishedAt}
              readOnly
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "#f9fafb", cursor: "default" }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#6b7280", marginBottom: 4, display: "block" }}>
              Автоклаваас гаргасан цаг
            </label>
            <input
              type="datetime-local"
              value={removedFromAutoclaveAt}
              onChange={(e) => setRemovedFromAutoclaveAt(e.target.value)}
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#6b7280", marginBottom: 4, display: "block" }}>
              Үр дүн <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <div style={{ display: "flex", gap: 16, alignItems: "center", paddingTop: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="result"
                  value="PASS"
                  checked={result === "PASS"}
                  onChange={() => setResult("PASS")}
                />
                <span style={{ fontSize: 13, color: "#15803d", fontWeight: 500 }}>✓ PASS</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="result"
                  value="FAIL"
                  checked={result === "FAIL"}
                  onChange={() => setResult("FAIL")}
                />
                <span style={{ fontSize: 13, color: "#dc2626", fontWeight: 500 }}>✗ FAIL</span>
              </label>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#6b7280", marginBottom: 4, display: "block" }}>
              Сувилагчийн нэр <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              disabled={!branchId}
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
            >
              {!branchId && <option value="">Эхлээд салбар сонгоно уу</option>}
              {branchId && sterilizationUsers.length === 0 && <option value="">Сувилагч байхгүй</option>}
              {sterilizationUsers.map((u) => {
                const label = formatUserLabel(u);
                return <option key={u.id} value={label}>{label}</option>;
              })}
            </select>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, color: "#6b7280", marginBottom: 4, display: "block" }}>
              Тэмдэглэл
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Нэмэлт мэдээлэл..."
              rows={2}
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }}
            />
          </div>
        </div>
      </div>

      {/* Tool Lines */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 600 }}>Багажийн жагсаалт</div>
          <button
            type="button"
            onClick={addToolLine}
            disabled={!branchId}
            style={{
              border: "none",
              background: "#16a34a",
              color: "#fff",
              borderRadius: 8,
              padding: "6px 12px",
              cursor: branchId ? "pointer" : "not-allowed",
              fontSize: 13,
            }}
          >
            + Багаж нэмэх
          </button>
        </div>

        {!branchId && (
          <div style={{ fontSize: 13, color: "#6b7280", padding: "12px 0" }}>
            Эхлээд салбар сонгоно уу.
          </div>
        )}

        {branchId && toolLines.length === 0 && (
          <div style={{ fontSize: 13, color: "#6b7280", padding: "12px 0" }}>
            Багаж нэмээгүй байна.
          </div>
        )}

        {branchId && toolLines.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb", color: "#6b7280", textAlign: "left" }}>
                <th style={{ padding: "8px 4px" }}>№</th>
                <th style={{ padding: "8px 4px" }}>Багаж</th>
                <th style={{ padding: "8px 4px", width: 140 }}>Үйлдвэрлэсэн тоо</th>
                <th style={{ padding: "8px 4px", width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {toolLines.map((line, index) => {
                // Filter tools based on search query (case-insensitive contains search)
                const filteredTools = line.toolSearch.trim()
                  ? tools.filter((tool) => 
                      tool.name.toLowerCase().includes(line.toolSearch.toLowerCase())
                    )
                  : tools;

                return (
                  <tr key={line.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "8px 4px", verticalAlign: "top", paddingTop: "12px" }}>{index + 1}</td>
                    <td style={{ padding: "8px 4px" }}>
                      {/* Single autocomplete-style input */}
                      <div style={{ position: "relative" }}>
                        <input
                          type="text"
                          value={line.toolSearch}
                          onChange={(e) => {
                            // Clear toolId when typing to avoid mismatch
                            patchToolLine(index, {
                              toolSearch: e.target.value,
                              toolId: "",
                              showDropdown: true,
                              duplicateError: "",
                            });
                          }}
                          onFocus={() => patchToolLine(index, { showDropdown: true })}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              patchToolLine(index, { showDropdown: false });
                            }
                          }}
                          placeholder="Багаж хайх..."
                          style={{ 
                            width: "100%", 
                            border: line.duplicateError ? "1px solid #dc2626" : "1px solid #d1d5db", 
                            borderRadius: 8, 
                            padding: "6px 8px", 
                            fontSize: 13
                          }}
                        />
                        {/* Dropdown with filtered options */}
                        {line.showDropdown && filteredTools.length > 0 && (
                          <div 
                            style={{
                              position: "absolute",
                              top: "100%",
                              left: 0,
                              right: 0,
                              maxHeight: "200px",
                              overflowY: "auto",
                              background: "#fff",
                              border: "1px solid #d1d5db",
                              borderRadius: 8,
                              marginTop: 2,
                              zIndex: 10,
                              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
                            }}
                          >
                            {filteredTools.map((tool) => (
                              <div
                                key={tool.id}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  selectTool(index, tool.id);
                                }}
                                style={{
                                  padding: "8px 10px",
                                  cursor: "pointer",
                                  fontSize: 13,
                                  borderBottom: "1px solid #f3f4f6",
                                  background: line.toolId === tool.id ? "#eff6ff" : "#fff"
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = "#f3f4f6";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = line.toolId === tool.id ? "#eff6ff" : "#fff";
                                }}
                              >
                                {tool.name}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Error messages */}
                      {line.duplicateError && (
                        <div style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>
                          {line.duplicateError}
                        </div>
                      )}
                      {line.toolSearch.trim() && !line.showDropdown && filteredTools.length === 0 && (
                        <div style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>
                          Илэрц олдсонгүй
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "8px 4px", verticalAlign: "top", paddingTop: "12px" }}>
                      <input
                        type="number"
                        min={1}
                        value={line.producedQty}
                        onChange={(e) => updateToolLine(index, "producedQty", Math.max(1, Number(e.target.value) || 1))}
                        style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 8px", fontSize: 13 }}
                      />
                    </td>
                    <td style={{ padding: "8px 4px", textAlign: "right", verticalAlign: "top", paddingTop: "12px" }}>
                      <button
                        type="button"
                        onClick={() => removeToolLine(index)}
                        disabled={toolLines.length === 1}
                        style={{
                          border: "1px solid #dc2626",
                          background: "#fff",
                          color: "#b91c1c",
                          borderRadius: 8,
                          padding: "6px 10px",
                          cursor: toolLines.length > 1 ? "pointer" : "not-allowed",
                          fontSize: 12,
                        }}
                      >
                        Устгах
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            style={{
              border: "none",
              background: "#2563eb",
              color: "#fff",
              borderRadius: 10,
              padding: "10px 16px",
              cursor: loading ? "default" : "pointer",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {loading ? "Үүсгэж байна..." : "Цикл үүсгэх"}
          </button>
        </div>
      </div>
    </div>
  );
}
