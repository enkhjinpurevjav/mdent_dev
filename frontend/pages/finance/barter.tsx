import React, { useEffect, useState } from "react";

type BarterRow = {
  id: number;
  name: string;
  code: string;
  limitAmount: number;
  spentAmount: number;
  remainingAmount: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

function formatMoney(v: number) {
  return new Intl.NumberFormat("mn-MN").format(Number(v || 0));
}

function formatDateOnly(iso?: string) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("mn-MN");
  } catch {
    return iso;
  }
}

export default function BarterPage() {
  const [rows, setRows] = useState<BarterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // add modal
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addCode, setAddCode] = useState("");
  const [addLimit, setAddLimit] = useState("");

  // edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<BarterRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editLimit, setEditLimit] = useState("");
  const [editSpent, setEditSpent] = useState("");
  const [editRemaining, setEditRemaining] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);

  const load = async (q?: string) => {
    setLoading(true);
    setError("");
    try {
      const url = q ? `/api/admin/barters?search=${encodeURIComponent(q)}` : "/api/admin/barters";
      const res = await fetch(url);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to load barters");
      setRows((data?.barters || []) as BarterRow[]);
    } catch (e: any) {
      setError(e?.message || "Failed to load barters");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void load(search.trim());
  };

  const openAdd = () => {
    setAddName("");
    setAddCode("");
    setAddLimit("");
    setAddOpen(true);
  };

  const handleAdd = async () => {
    const limitNum = Number(addLimit);
    if (!addName.trim()) { alert("Нэр оруулна уу."); return; }
    if (!addCode.trim()) { alert("Код оруулна уу."); return; }
    if (!Number.isFinite(limitNum) || limitNum <= 0) { alert("Лимитийн дүн зөв оруулна уу."); return; }

    try {
      const res = await fetch("/api/admin/barters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim(), code: addCode.trim(), limitAmount: limitNum }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to create barter");
      setAddOpen(false);
      await load(search.trim() || undefined);
    } catch (e: any) {
      alert(e?.message || "Failed to create barter");
    }
  };

  const openEdit = (row: BarterRow) => {
    setEditing(row);
    setEditName(row.name);
    setEditCode(row.code);
    setEditLimit(String(row.limitAmount));
    setEditSpent(String(row.spentAmount));
    setEditRemaining(String(row.remainingAmount));
    setEditIsActive(row.isActive);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const limitNum = Number(editLimit);
    const spentNum = Number(editSpent);
    const remNum = Number(editRemaining);

    if (!editName.trim()) { alert("Нэр оруулна уу."); return; }
    if (!editCode.trim()) { alert("Код оруулна уу."); return; }
    if (!Number.isFinite(limitNum) || limitNum <= 0) { alert("Лимитийн дүн зөв оруулна уу."); return; }
    if (!Number.isFinite(spentNum) || spentNum < 0) { alert("Зарцуулсан дүн зөв оруулна уу."); return; }
    if (!Number.isFinite(remNum) || remNum < 0) { alert("Үлдэгдэл зөв оруулна уу."); return; }
    if (remNum > limitNum) { alert("Үлдэгдэл нь лимитээс их байж болохгүй."); return; }

    try {
      const res = await fetch(`/api/admin/barters/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          code: editCode.trim(),
          limitAmount: limitNum,
          spentAmount: spentNum,
          remainingAmount: remNum,
          isActive: editIsActive,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to update barter");
      setEditOpen(false);
      setEditing(null);
      await load(search.trim() || undefined);
    } catch (e: any) {
      alert(e?.message || "Failed to update barter");
    }
  };

  const handleDeactivate = async (row: BarterRow) => {
    if (!confirm(`"${row.name}" бартерийг идэвхгүй болгох уу?`)) return;
    try {
      const res = await fetch(`/api/admin/barters/${row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to deactivate");
      await load(search.trim() || undefined);
    } catch (e: any) {
      alert(e?.message || "Failed to deactivate barter");
    }
  };


  const GRID_COLS = "170px 140px 130px 130px 130px 110px 110px 90px 170px";

  // modal backdrop style
  const backdropStyle: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
  };
  const modalStyle: React.CSSProperties = {
    background: "#fff", borderRadius: 12, padding: 28,
    minWidth: 360, maxWidth: 480, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
  };
  const fieldStyle: React.CSSProperties = {
    display: "flex", flexDirection: "column", gap: 4, marginBottom: 14,
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#374151" };
  const inputStyle: React.CSSProperties = {
    padding: "7px 10px", borderRadius: 6, border: "1px solid #d1d5db",
    fontSize: 13, outline: "none",
  };

  return (
    <main style={{ maxWidth: 1500, margin: "40px auto", padding: 24, fontFamily: "sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Бартер</h1>
          <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
            Бартерийн нэр, код, лимит, зарцуулалтыг удирдах
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <form onSubmit={handleSearch} style={{ display: "flex", gap: 6 }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Нэр эсвэл код хайх..."
              style={{ ...inputStyle, width: 200 }}
            />
            <button
              type="submit"
              style={{
                padding: "7px 12px", borderRadius: 6, border: "1px solid #6b7280",
                background: "#f9fafb", color: "#374151", cursor: "pointer", fontSize: 13,
              }}
            >
              Хайх
            </button>
          </form>
          <button
            type="button"
            onClick={openAdd}
            style={{
              padding: "8px 12px", borderRadius: 6, border: "1px solid #16a34a",
              background: "#f0fdf4", color: "#166534", cursor: "pointer", fontSize: 13,
            }}
          >
            + Бартер нэмэх
          </button>
        </div>
      </div>

      {loading && <div style={{ marginTop: 14 }}>Ачаалж байна...</div>}
      {!loading && error && <div style={{ marginTop: 14, color: "#b91c1c" }}>{error}</div>}

      {!loading && !error && (
        <div style={{ marginTop: 14, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
          {/* Header row */}
          <div
            style={{
              display: "grid", gridTemplateColumns: GRID_COLS, gap: 10,
              padding: "10px 12px", background: "#f9fafb",
              fontSize: 12, fontWeight: 700, color: "#374151", alignItems: "center",
            }}
          >
            <div>Нэр/Төрөл</div>
            <div>Код</div>
            <div style={{ textAlign: "right" }}>Лимит</div>
            <div style={{ textAlign: "right" }}>Зарцуулсан</div>
            <div style={{ textAlign: "right" }}>Үлдэгдэл</div>
            <div>Үүссэн огноо</div>
            <div>Шинэчлэгдсэн</div>
            <div>Төлөв</div>
            <div />
          </div>

          {/* Data rows */}
          {rows.map((r) => (
            <div
              key={r.id}
              style={{
                display: "grid", gridTemplateColumns: GRID_COLS, gap: 10,
                padding: "10px 12px", borderTop: "1px solid #f3f4f6",
                fontSize: 13, alignItems: "center",
                opacity: r.isActive ? 1 : 0.55,
              }}
            >
              <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.name}
              </div>
              <div
                style={{
                  fontFamily: "monospace", fontSize: 12, color: "#374151",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
                title={r.code}
              >
                {r.code}
              </div>
              <div style={{ textAlign: "right" }}>{formatMoney(r.limitAmount)} ₮</div>
              <div style={{ textAlign: "right" }}>{formatMoney(r.spentAmount)} ₮</div>
              <div style={{ textAlign: "right", fontWeight: 700, color: r.remainingAmount > 0 ? "#166534" : "#b91c1c" }}>
                {formatMoney(r.remainingAmount)} ₮
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{formatDateOnly(r.createdAt)}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{formatDateOnly(r.updatedAt)}</div>
              <div>
                <span
                  style={{
                    display: "inline-block", padding: "2px 8px", borderRadius: 12, fontSize: 11,
                    background: r.isActive ? "#dcfce7" : "#f3f4f6",
                    color: r.isActive ? "#166534" : "#6b7280",
                    fontWeight: 600,
                  }}
                >
                  {r.isActive ? "Идэвхтэй" : "Идэвхгүй"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, whiteSpace: "nowrap" }}>
                <button
                  type="button"
                  onClick={() => openEdit(r)}
                  style={{
                    padding: "6px 10px", borderRadius: 6, border: "1px solid #2563eb",
                    background: "#eff6ff", color: "#2563eb", cursor: "pointer", fontSize: 12,
                  }}
                >
                  Засах
                </button>
                {r.isActive && (
                  <button
                    type="button"
                    onClick={() => handleDeactivate(r)}
                    style={{
                      padding: "6px 10px", borderRadius: 6, border: "1px solid #dc2626",
                      background: "#fef2f2", color: "#b91c1c", cursor: "pointer", fontSize: 12,
                    }}
                  >
                    Идэвхгүй болгох
                  </button>
                )}
              </div>
            </div>
          ))}

          {rows.length === 0 && (
            <div style={{ padding: 12, fontSize: 13, color: "#6b7280" }}>
              Одоогоор ямар ч бартер бүртгэгдээгүй байна.
            </div>
          )}
        </div>
      )}

      {/* ── Add Modal ── */}
      {addOpen && (
        <div style={backdropStyle} onClick={() => setAddOpen(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 18px", fontSize: 17 }}>Бартер нэмэх</h2>

            <div style={fieldStyle}>
              <label style={labelStyle}>Нэр / Төрөл</label>
              <input
                style={inputStyle}
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Жишээ: CEO, Маркетинг, ..."
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Бартерийн код (давтагдахгүй)</label>
              <input
                style={inputStyle}
                value={addCode}
                onChange={(e) => setAddCode(e.target.value)}
                placeholder="Жишээ: BARTER-CEO-001"
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Лимитийн дүн (₮)</label>
              <input
                style={inputStyle}
                type="number"
                min={1}
                value={addLimit}
                onChange={(e) => setAddLimit(e.target.value)}
                placeholder="0"
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                style={{
                  padding: "8px 14px", borderRadius: 6, border: "1px solid #d1d5db",
                  background: "#f9fafb", color: "#374151", cursor: "pointer", fontSize: 13,
                }}
              >
                Болих
              </button>
              <button
                type="button"
                onClick={handleAdd}
                style={{
                  padding: "8px 14px", borderRadius: 6, border: "1px solid #16a34a",
                  background: "#f0fdf4", color: "#166534", cursor: "pointer", fontSize: 13, fontWeight: 600,
                }}
              >
                Нэмэх
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editOpen && editing && (
        <div style={backdropStyle} onClick={() => setEditOpen(false)}>
          <div style={{ ...modalStyle, maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 18px", fontSize: 17 }}>Бартер засах</h2>

            <div style={fieldStyle}>
              <label style={labelStyle}>Нэр / Төрөл</label>
              <input
                style={inputStyle}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Бартерийн код</label>
              <input
                style={inputStyle}
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Лимит (₮)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  value={editLimit}
                  onChange={(e) => setEditLimit(e.target.value)}
                />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Зарцуулсан (₮)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  value={editSpent}
                  onChange={(e) => setEditSpent(e.target.value)}
                />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Үлдэгдэл (₮)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  value={editRemaining}
                  onChange={(e) => setEditRemaining(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <input
                id="editIsActive"
                type="checkbox"
                checked={editIsActive}
                onChange={(e) => setEditIsActive(e.target.checked)}
                style={{ width: 15, height: 15 }}
              />
              <label htmlFor="editIsActive" style={{ ...labelStyle, cursor: "pointer" }}>
                Идэвхтэй
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => { setEditOpen(false); setEditing(null); }}
                style={{
                  padding: "8px 14px", borderRadius: 6, border: "1px solid #d1d5db",
                  background: "#f9fafb", color: "#374151", cursor: "pointer", fontSize: 13,
                }}
              >
                Болих
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                style={{
                  padding: "8px 14px", borderRadius: 6, border: "1px solid #2563eb",
                  background: "#eff6ff", color: "#2563eb", cursor: "pointer", fontSize: 13, fontWeight: 600,
                }}
              >
                Хадгалах
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
