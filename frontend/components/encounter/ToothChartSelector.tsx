import React from "react";
import { ADULT_TEETH, CHILD_TEETH } from "../../utils/tooth-helpers";

type ToothChartSelectorProps = {
  toothMode: "ADULT" | "CHILD";
  selectedTeeth: string[];
  customToothRange: string;
  chartError: string;
  onToggleToothMode: (mode: "ADULT" | "CHILD") => void;
  onToggleToothSelection: (code: string) => void;
  onCustomToothRangeChange: (value: string) => void;
  isToothSelected: (code: string) => boolean;
  areAllModeTeethSelected: () => boolean;
};

// Adult: 16 teeth per row, split at 8 (Баруун: 18–11 / 48–41, Зүүн: 21–28 / 31–38)
const ADULT_ROW1 = ADULT_TEETH.slice(0, 16);
const ADULT_ROW2 = ADULT_TEETH.slice(16, 32);
const ADULT_HALF = 8;

// Child: 10 teeth per row, split at 5 (Баруун: 55–51 / 85–81, Зүүн: 61–65 / 71–75)
const CHILD_ROW1 = CHILD_TEETH.slice(0, 10);
const CHILD_ROW2 = CHILD_TEETH.slice(10, 20);
const CHILD_HALF = 5;

export default function ToothChartSelector({
  toothMode,
  selectedTeeth,
  customToothRange,
  chartError,
  onToggleToothMode,
  onToggleToothSelection,
  onCustomToothRangeChange,
  isToothSelected,
  areAllModeTeethSelected,
}: ToothChartSelectorProps) {
  const row1 = toothMode === "ADULT" ? ADULT_ROW1 : CHILD_ROW1;
  const row2 = toothMode === "ADULT" ? ADULT_ROW2 : CHILD_ROW2;
  const halfLen = toothMode === "ADULT" ? ADULT_HALF : CHILD_HALF;
  const colCount = row1.length;

  const toothButtonStyle = (code: string): React.CSSProperties => {
    const selected = isToothSelected(code);
    return {
      minWidth: 34,
      padding: "4px 6px",
      borderRadius: 999,
      border: selected ? "1px solid #16a34a" : "1px solid #d1d5db",
      background: selected ? "#dcfce7" : "white",
      color: selected ? "#166534" : "#111827",
      fontSize: 12,
      cursor: "pointer",
    };
  };

  return (
    <section
      style={{
        marginTop: 0,
        padding: 16,
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
      }}
    >
      {/* Header: title + tabs */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <h2 style={{ fontSize: 16, margin: 0 }}>Шүдний диаграм</h2>

        <div
          style={{
            display: "inline-flex",
            borderRadius: 999,
            border: "1px solid #d1d5db",
            overflow: "hidden",
            fontSize: 13,
          }}
        >
          <button
            type="button"
            onClick={() => onToggleToothMode("ADULT")}
            style={{
              padding: "4px 10px",
              border: "none",
              background: toothMode === "ADULT" ? "#2563eb" : "white",
              color: toothMode === "ADULT" ? "white" : "#111827",
              cursor: "pointer",
            }}
          >
            Байнгын шүд
          </button>
          <button
            type="button"
            onClick={() => onToggleToothMode("CHILD")}
            style={{
              padding: "4px 10px",
              border: "none",
              background: toothMode === "CHILD" ? "#2563eb" : "white",
              color: toothMode === "CHILD" ? "white" : "#111827",
              cursor: "pointer",
            }}
          >
            Сүүн шүд
          </button>
        </div>
      </div>

      {chartError && (
        <div style={{ color: "red", marginBottom: 8 }}>{chartError}</div>
      )}

      {/* Tooth grid — horizontal scroll on small screens */}
      <div
        style={{
          overflowX: "auto",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${colCount}, auto)`,
            gridTemplateRows: "auto auto auto",
            gap: 6,
            width: "max-content",
          }}
        >
          {/* Heading row: Баруун / Зүүн */}
          <div
            style={{
              gridRow: 1,
              gridColumn: `1 / span ${halfLen}`,
              textAlign: "center",
              fontSize: 11,
              color: "#6b7280",
              paddingBottom: 2,
            }}
          >
            Баруун
          </div>
          <div
            style={{
              gridRow: 1,
              gridColumn: `${halfLen + 1} / span ${colCount - halfLen}`,
              textAlign: "center",
              fontSize: 11,
              color: "#6b7280",
              paddingBottom: 2,
            }}
          >
            Зүүн
          </div>

          {/* Row 1: upper teeth (18–28 or 55–65) */}
          {row1.map((code, i) => (
            <button
              key={code}
              type="button"
              onClick={() => onToggleToothSelection(code)}
              style={{
                ...toothButtonStyle(code),
                gridRow: 2,
                gridColumn: i + 1,
              }}
            >
              {code}
            </button>
          ))}

          {/* Row 2: lower teeth (48–38 or 85–75) */}
          {row2.map((code, i) => (
            <button
              key={code}
              type="button"
              onClick={() => onToggleToothSelection(code)}
              style={{
                ...toothButtonStyle(code),
                gridRow: 3,
                gridColumn: i + 1,
              }}
            >
              {code}
            </button>
          ))}
        </div>
      </div>

      {/* Controls under the grid */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <input
          type="text"
          placeholder="ж: 21-24, 25-26, 11,21,22"
          value={customToothRange}
          onChange={(e) => onCustomToothRangeChange(e.target.value)}
          style={{
            minWidth: 140,
            padding: "4px 8px",
            borderRadius: 999,
            border: "1px solid #d1d5db",
            fontSize: 12,
          }}
        />

        <button
          type="button"
          onClick={() => onToggleToothSelection("ALL")}
          style={{
            minWidth: 60,
            padding: "4px 10px",
            borderRadius: 999,
            border: areAllModeTeethSelected()
              ? "1px solid #16a34a"
              : "1px solid #d1d5db",
            background: areAllModeTeethSelected() ? "#dcfce7" : "white",
            color: areAllModeTeethSelected() ? "#166534" : "#111827",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Бүх шүд
        </button>
      </div>

      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
        Шүдийг дарж сонгох үед тухайн шүднүүдэд зориулсан нэг оношийн мөр
        доорх хэсэгт үүснэ. Нэг онош нь олон шүдэнд (эсвэл Бүх шүд)
        хамаарч болно.
      </div>
    </section>
  );
}
