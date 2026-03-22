import React, { useState, useEffect, useRef } from "react";
import type {
  SterilizationDraftAttachment,
  ToolLineSearchResult,
} from "../../types/encounter-admin";

type SterilizationToolLineSelectorProps = {
  diagnosisRowId: number | undefined;
  branchId: number;
  draftAttachments: SterilizationDraftAttachment[];
  selectedToolLineIds: number[];
  toolLineMetadata: Map<number, { toolName: string; cycleCode: string }>;
  searchText: string;
  isOpen: boolean;
  isLocked: boolean;
  onSearchTextChange: (text: string) => void;
  onOpen: () => void;
  onClose: () => void;
  onAddToolLine: (toolLineId: number) => void;
  onRemoveToolLine: (index: number) => void;
  onRemoveToolLineDraft?: (draftId: number) => void;
};

export default function SterilizationToolLineSelector({
  diagnosisRowId,
  branchId,
  draftAttachments,
  selectedToolLineIds,
  toolLineMetadata,
  searchText,
  isOpen,
  isLocked,
  onSearchTextChange,
  onOpen,
  onClose,
  onAddToolLine,
  onRemoveToolLine,
  onRemoveToolLineDraft,
}: SterilizationToolLineSelectorProps) {
  const [toolLineResults, setToolLineResults] = useState<ToolLineSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle pointer down outside to close dropdown.
  // Uses pointerdown (covers mouse + touch) and checks that the target is still
  // connected to the DOM before evaluating containment — this prevents the
  // dropdown from being closed when React re-renders and removes the clicked
  // result element before the document listener fires.
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      // If the target was removed from the DOM by a React re-render (e.g. after
      // selecting a result which clears searchText and unmounts the list), treat
      // the click as internal and ignore it so isOpen is not reset to false.
      if (!document.body.contains(target)) return;
      if (containerRef.current && !containerRef.current.contains(target)) {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerOutside);
    return () => {
      document.removeEventListener('pointerdown', handlePointerOutside);
    };
  }, [isOpen, onClose]);

  // Load tool line search results when search text changes
  useEffect(() => {
    if (!isOpen || !branchId || !searchText.trim()) {
      setToolLineResults([]);
      return;
    }

    const searchToolLines = async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams();
        params.set("branchId", String(branchId));
        params.set("query", searchText.trim());

        const res = await fetch(`/api/sterilization/tool-lines/search?${params.toString()}`);
        if (res.ok) {
          const json = await res.json();
          setToolLineResults(Array.isArray(json) ? json : []);
        } else {
          setToolLineResults([]);
        }
      } catch (err) {
        console.error("Failed to search tool lines:", err);
        setToolLineResults([]);
      } finally {
        setSearching(false);
      }
    };

    searchToolLines();
  }, [isOpen, branchId, searchText]);

  // Expand draftAttachments into individual chips based on requestedQty
  const draftChips = draftAttachments.flatMap((draft) =>
    Array(draft.requestedQty || 1).fill(null).map((_, idx) => ({
      type: 'draft' as const,
      draftId: draft.id,
      label: `${draft.tool.name} — ${draft.cycle.code}`,
      chipIndex: idx,
    }))
  );

  // Map local selections to chips
  const localChips = selectedToolLineIds.map((toolLineId, index) => {
    const metadata = toolLineMetadata.get(toolLineId);
    const label = metadata 
      ? `${metadata.toolName} — ${metadata.cycleCode}`
      : `Tool Line #${toolLineId}`;
    return {
      type: 'local' as const,
      toolLineId,
      label,
      chipIndex: index,
    };
  });

  // Combine all chips (drafts first, then local)
  const allChips = [...draftChips, ...localChips];

  // Show all selections as chips (allow duplicates with identical labels)
  return (
    <div ref={containerRef} style={{ marginBottom: 8, position: "relative" }}>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
        Ариутгалын багаж (багаж/цикл)
      </div>

      {/* Selected tool lines (chips) - show both draft and local chips */}
      {allChips.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 6,
          }}
        >
          {allChips.map((chip, displayIndex) => (
            <div
              key={`chip-${chip.type}-${chip.type === 'draft' ? chip.draftId : chip.toolLineId}-${displayIndex}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid #d1d5db",
                background: "#ffffff",
                fontSize: 12,
                opacity: isLocked ? 0.6 : 1,
              }}
            >
              <span>{chip.label}</span>
              {!isLocked && (
                <button
                  type="button"
                  onClick={() => {
                    if (chip.type === 'draft' && onRemoveToolLineDraft) {
                      onRemoveToolLineDraft(chip.draftId);
                    } else if (chip.type === 'local') {
                      onRemoveToolLine(chip.chipIndex);
                    }
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "#dc2626",
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Search input */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div
          style={{ position: "relative", minWidth: 260, flex: "0 0 auto" }}
        >
          <input
            ref={inputRef}
            placeholder="Багаж эсвэл циклын кодоор хайх..."
            value={searchText}
            onChange={(e) => {
              if (isLocked) return;
              onSearchTextChange(e.target.value);
            }}
            onFocus={() => {
              if (!isLocked) onOpen();
            }}
            disabled={isLocked}
            style={{
              width: "100%",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              padding: "6px 8px",
              fontSize: 13,
              background: isLocked ? "#f3f4f6" : "#ffffff",
              cursor: isLocked ? "not-allowed" : "text",
              opacity: isLocked ? 0.6 : 1,
            }}
          />

          {isOpen && searchText.trim().length >= 1 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                maxHeight: 220,
                overflowY: "auto",
                marginTop: 4,
                background: "white",
                borderRadius: 6,
                boxShadow:
                  "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
                zIndex: 20,
                fontSize: 13,
              }}
            >
              {searching ? (
                <div style={{ padding: "12px 8px", color: "#6b7280" }}>
                  Хайж байна...
                </div>
              ) : toolLineResults.length === 0 ? (
                <div style={{ padding: "12px 8px", color: "#6b7280" }}>
                  {searchText ? "Хайлт олдсонгүй" : "Багаж оруулаад хайна уу"}
                </div>
              ) : (
                toolLineResults.map((result) => (
                  <div
                    key={result.toolLineId}
                    onMouseDown={(e) => {
                      // preventDefault keeps focus on the input (no blur/refocus needed).
                      e.preventDefault();
                      onAddToolLine(result.toolLineId);
                      onSearchTextChange("");
                      // Keep the selector open so the user can immediately type and
                      // add the next value without clicking outside first.
                      onOpen();
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                    style={{
                      padding: "6px 8px",
                      cursor: "pointer",
                      borderBottom: "1px solid #f3f4f6",
                      background: "white",
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>
                      {result.toolName} — {result.cycleCode}
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                      Үлдэгдэл: {result.remaining}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
