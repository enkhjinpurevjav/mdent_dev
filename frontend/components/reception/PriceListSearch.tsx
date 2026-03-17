import React, { useCallback, useEffect, useRef, useState } from "react";

interface ServiceResult {
  id: number;
  code: string;
  name: string;
  price: number;
}

export default function PriceListSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ServiceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/services?q=${encodeURIComponent(q)}&onlyActive=true&limit=15`
      );
      if (!res.ok) return;
      const data: ServiceResult[] = await res.json();
      setResults(data || []);
      setOpen(true);
    } catch {
      // ignore network errors silently
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!v.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    searchTimerRef.current = setTimeout(() => search(v), 200);
  };

  const handleSelect = (item: ServiceResult) => {
    const priceStr = item.price.toLocaleString("mn-MN");
    const formatted = `${item.code} — ${item.name} (${priceStr}₮)`;
    setQuery(formatted);
    setOpen(false);
    setResults([]);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          fontSize: 13,
          color: "#374151",
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        Үнийн жагсаалт:
      </span>
      <div style={{ position: "relative" }}>
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          onBlur={() => {
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
            closeTimerRef.current = setTimeout(() => setOpen(false), 150);
          }}
          placeholder="Үйлчилгээ хайх..."
          autoComplete="off"
          style={{
            borderRadius: 6,
            border: "1px solid #d1d5db",
            padding: "5px 8px",
            fontSize: 13,
            width: 240,
            background: "white",
            paddingRight: loading ? 28 : 8,
          }}
        />
        {loading && (
          <span
            style={{
              fontSize: 11,
              color: "#9ca3af",
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            ...
          </span>
        )}
        {open && results.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              zIndex: 200,
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              minWidth: 320,
              maxHeight: 260,
              overflowY: "auto",
            }}
          >
            {results.map((item) => (
              <button
                key={item.id}
                type="button"
                onMouseDown={() => handleSelect(item)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  border: "none",
                  borderBottom: "1px solid #f3f4f6",
                  background: "white",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 600, color: "#111827" }}>
                  {item.code} — {item.name}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  Үнэ: {item.price.toLocaleString("mn-MN")}₮
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
