import React, { useState, useEffect } from "react";
import type {
  EditableDiagnosis,
  Diagnosis,
  DiagnosisProblem,
  Service,
  ActiveIndicator,
  AssignedTo,
  EncounterService,
} from "../../types/encounter-admin";
import ProblemTextsEditor from "./ProblemTextsEditor";
import ServiceTextsEditor from "./ServiceTextsEditor";
import SterilizationToolLineSelector from "./SterilizationToolLineSelector";

type DiagnosesEditorProps = {
  rows: EditableDiagnosis[];
  diagnoses: Diagnosis[];
  services: Service[];
  activeIndicators: ActiveIndicator[];
  problemsByDiagnosis: Record<number, DiagnosisProblem[]>;
  dxError: string;
  servicesLoadError: string;
  saveError: string;
  saving: boolean;
  finishing: boolean;
  prescriptionSaving: boolean;
  openDxIndex: number | null;
  openServiceIndex: number | null;
  openIndicatorIndex: number | null;
  activeDxRowIndex: number | null;
  totalDiagnosisServicesPrice: number;
  encounterServices?: EncounterService[];
  branchId?: number;
  onDiagnosisChange: (index: number, diagnosisId: number) => Promise<void>;
  onToggleProblem: (index: number, problemId: number) => void;
  onNoteChange: (index: number, value: string) => void;
  onToothCodeChange: (index: number, value: string) => void;
  onRemoveRow: (index: number) => void;
  onUnlockRow: (index: number) => void;
  onLockRow: (index: number) => void;
  onSetOpenDxIndex: (index: number | null) => void;
  onSetOpenServiceIndex: (index: number | null) => void;
  onSetOpenIndicatorIndex: (index: number | null) => void;
  onSetActiveDxRowIndex: (index: number | null) => void;
  onUpdateRowField: <K extends keyof EditableDiagnosis>(
    index: number,
    field: K,
    value: EditableDiagnosis[K]
  ) => void;
  onAddToolLineDraft?: (index: number, toolLineId: number) => Promise<void>;
  onRemoveToolLineDraft?: (index: number, draftId: number) => Promise<void>;
  onAddToolLineLocal?: (index: number, toolLineId: number) => void;
  onRemoveToolLineLocal?: (index: number, chipIndex: number) => void;
  toolLineMetadata?: Map<number, { toolName: string; cycleCode: string }>;
  onSave: () => Promise<void>;
  onFinish: () => Promise<void>;
  onResetToothSelection: () => void;
  onReloadEncounter?: () => Promise<void>;
  hideInlineActions?: boolean;
};

export default function DiagnosesEditor({
  rows,
  diagnoses,
  services,
  activeIndicators,
  problemsByDiagnosis,
  dxError,
  servicesLoadError,
  saveError,
  saving,
  finishing,
  prescriptionSaving,
  openDxIndex,
  openServiceIndex,
  openIndicatorIndex,
  activeDxRowIndex,
  totalDiagnosisServicesPrice,
  encounterServices,
  branchId,
  onDiagnosisChange,
  onToggleProblem,
  onNoteChange,
  onToothCodeChange,
  onRemoveRow,
  onUnlockRow,
  onLockRow,
  onSetOpenDxIndex,
  onSetOpenServiceIndex,
  onSetOpenIndicatorIndex,
  onSetActiveDxRowIndex,
  onUpdateRowField,
  onAddToolLineDraft,
  onRemoveToolLineDraft,
  onAddToolLineLocal,
  onRemoveToolLineLocal,
  toolLineMetadata,
  onSave,
  onFinish,
  onResetToothSelection,
  onReloadEncounter,
  hideInlineActions,
}: DiagnosesEditorProps) {
  const [todayNurses, setTodayNurses] = useState<{ id: number; name: string | null }[]>([]);

  useEffect(() => {
    if (!branchId) return;
    const fetchNurses = async () => {
      try {
        const res = await fetch(`/api/users/nurses/today?branchId=${branchId}`);
        if (!res.ok) return;
        const data = await res.json();
        const items: { nurseId: number; name: string | null }[] = data.items || [];
        setTodayNurses(items.map((n) => ({ id: n.nurseId, name: n.name })));
      } catch {
        // ignore
      }
    };
    void fetchNurses();
  }, [branchId]);

  return (
    <section
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div>
          <h2 style={{ fontSize: 16, margin: 0 }}>Онош тавих</h2>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Үйлчилгээнд хамрах мэдээллийг оруулах хэсэг
          </div>
        </div>
      </div>

      {dxError && (
        <div style={{ color: "red", marginBottom: 8 }}>{dxError}</div>
      )}
      {servicesLoadError && (
        <div style={{ color: "red", marginBottom: 8 }}>
          {servicesLoadError}
        </div>
      )}

      {rows.length === 0 && (
        <div style={{ color: "#6b7280", fontSize: 13 }}>
          Үйлчилгээнд хамрах шүдийг сонгоно уу?
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.reduce<[number[], number[]]>(
          (acc, r, i) => { acc[r.locked ? 1 : 0].push(i); return acc; },
          [[], []]
        ).flat().map((index) => {
          const row = rows[index];
          const problems = problemsByDiagnosis[row.diagnosisId ?? 0] || [];
          const isLocked = row.locked ?? false;
          const hasSearchText = (row.searchText || "").trim().length > 0;
          const selectedService = row.serviceId
            ? services.find((s) => s.id === row.serviceId)
            : null;
          const isImaging = selectedService?.category === "IMAGING";

          return (
            <div
              key={index}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 12,
                background: isLocked ? "#fef3c7" : "#f9fafb",
              }}
            >
              {/* Lock/Unlock UI */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  marginBottom: 8,
                }}
              >
                {isLocked && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                      padding: "6px 10px",
                      background: "#fef08a",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#854d0e",
                    }}
                  >
                    <span>🔒 Түгжсэн</span>
                    <button
                      type="button"
                      onClick={() => onUnlockRow(index)}
                      style={{
                        marginLeft: "auto",
                        padding: "4px 12px",
                        borderRadius: 4,
                        border: "1px solid #ca8a04",
                        background: "#ffffff",
                        color: "#ca8a04",
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 500,
                      }}
                    >
                      Түгжээ тайлах
                    </button>
                  </div>
                )}
                {!isLocked && row.id && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      marginBottom: 4,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onLockRow(index)}
                      style={{
                        padding: "4px 12px",
                        borderRadius: 4,
                        border: "1px solid #9ca3af",
                        background: "#ffffff",
                        color: "#6b7280",
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 500,
                      }}
                    >
                      🔒 Түгжих
                    </button>
                  </div>
                )}
              </div>

              {/* Tooth code */}
              <div
                style={{
                  marginBottom: 8,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <input
                  placeholder="Шүдний код (ж: 11, 21, 22)"
                  value={row.toothCode || ""}
                  onChange={(e) => onToothCodeChange(index, e.target.value)}
                  onFocus={() => {
                    if (!row.locked) onSetActiveDxRowIndex(index);
                  }}
                  disabled={isLocked}
                  style={{
                    maxWidth: 260,
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    padding: "6px 8px",
                    fontSize: 12,
                    background: isLocked ? "#f3f4f6" : "#ffffff",
                    cursor: isLocked ? "not-allowed" : "text",
                    opacity: isLocked ? 0.6 : 1,
                  }}
                />
                <span style={{ fontSize: 11, color: "#6b7280" }}>
                  Шүдний диаграмаас автоматаар бөглөгдөнө, засах боломжтой.
                </span>
              </div>

              {/* Service search */}
              <div
                style={{
                  marginBottom: 8,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    minWidth: 260,
                    flex: "0 0 auto",
                  }}
                >
                  <input
                    placeholder="Үйлчилгээний нэр эсвэл кодоор хайх..."
                    value={row.serviceSearchText ?? ""}
                    onChange={(e) => {
                      if (isLocked) return;
                      const text = e.target.value;
                      onSetOpenServiceIndex(index);
                      onUpdateRowField(index, "serviceSearchText", text);
                      if (!text.trim()) {
                        onUpdateRowField(index, "serviceId", undefined);
                      }
                    }}
                    onFocus={() => {
                      if (!isLocked) onSetOpenServiceIndex(index);
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

                  {services.length > 0 &&
                    openServiceIndex === index &&
                    (row.serviceSearchText || "").length > 0 && (
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
                          zIndex: 15,
                          fontSize: 13,
                        }}
                      >
                        {services
                          .filter((svc) => {
                            const q = (
                              row.serviceSearchText || ""
                            ).toLowerCase();
                            if (!q.trim()) return true;
                            const hay = `${svc.code || ""} ${
                              svc.name
                            }`.toLowerCase();
                            return hay.includes(q);
                          })
                          .slice(0, 50)
                          .map((svc) => (
                            <div
                              key={svc.id}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                const nextAssignedTo: AssignedTo | undefined =
                                  svc.category === "IMAGING"
                                    ? (row.assignedTo ?? "DOCTOR")
                                    : undefined;

                                onUpdateRowField(index, "serviceId", svc.id);
                                onUpdateRowField(
                                  index,
                                  "serviceSearchText",
                                  svc.name
                                );
                                onUpdateRowField(
                                  index,
                                  "assignedTo",
                                  nextAssignedTo
                                );
                                // Initialize draft service texts with one empty field if not already set
                                if (!row.draftServiceTexts) {
                                  onUpdateRowField(index, "draftServiceTexts", [""]);
                                }
                                onSetOpenServiceIndex(null);
                              }}
                              style={{
                                padding: "6px 8px",
                                cursor: "pointer",
                                borderBottom: "1px solid #f3f4f6",
                                background:
                                  row.serviceId === svc.id
                                    ? "#eff6ff"
                                    : "white",
                              }}
                            >
                              <div style={{ fontWeight: 500 }}>
                                {svc.code ? `${svc.code} — ` : ""}
                                {svc.name}
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#6b7280",
                                  marginTop: 2,
                                }}
                              >
                                Үнэ:{" "}
                                {svc.price.toLocaleString("mn-MN")}₮
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                </div>
              </div>

              {/* Imaging assignedTo selector */}
              {isImaging && (
                <div
                  style={{
                    marginTop: 6,
                    display: "flex",
                    gap: 16,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                    Зураг авах оноох:
                  </span>

                  <label
                    style={{
                      display: "inline-flex",
                      gap: 6,
                      alignItems: "center",
                      fontSize: 12,
                    }}
                  >
                    <input
                      type="radio"
                      name={`assignedTo-${index}`}
                      disabled={isLocked}
                      checked={(row.assignedTo ?? "DOCTOR") === "DOCTOR"}
                      onChange={() => {
                        if (isLocked) return;
                        onUpdateRowField(index, "assignedTo", "DOCTOR");
                      }}
                    />
                    Эмч
                  </label>

                  <label
                    style={{
                      display: "inline-flex",
                      gap: 6,
                      alignItems: "center",
                      fontSize: 12,
                    }}
                  >
                    <input
                      type="radio"
                      name={`assignedTo-${index}`}
                      disabled={isLocked}
                      checked={row.assignedTo === "NURSE"}
                      onChange={() => {
                        if (isLocked) return;
                        onUpdateRowField(index, "assignedTo", "NURSE");
                      }}
                    />
                    Сувилагч
                  </label>

                  {/* Nurse picker for IMAGING rows assigned to NURSE */}
                  {row.assignedTo === "NURSE" && (
                    <div style={{ width: "100%", marginTop: 6 }}>
                      <select
                        disabled={isLocked}
                        value={row.nurseId ?? ""}
                        onChange={(e) => {
                          if (isLocked) return;
                          const val = e.target.value;
                          onUpdateRowField(
                            index,
                            "nurseId",
                            val === "" ? null : Number(val)
                          );
                        }}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 4,
                          border: row.nurseId == null ? "1.5px solid #ef4444" : "1px solid #d1d5db",
                          fontSize: 12,
                          minWidth: 160,
                          background: isLocked ? "#f3f4f6" : "white",
                        }}
                      >
                        <option value="">— Сувилагч сонгох —</option>
                        {todayNurses.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.name ?? `Nurse #${n.id}`}
                          </option>
                        ))}
                      </select>
                      {row.nurseId == null && (
                        <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}>
                          Сувилагч сонгоно уу
                        </div>
                      )}
                    </div>
                  )}
                  <div
                    style={{
                      padding: "4px 10px",
                      background: "#fef3c7",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#92400e",
                    }}
                  >
                    🦷 Бүх шүд
                  </div>
                </div>
              )}

              {/* Sterilization tool-line selection */}
              {onAddToolLineLocal && onRemoveToolLineLocal && toolLineMetadata ? (
                branchId ? (
                  <SterilizationToolLineSelector
                    diagnosisRowId={row.id}
                    branchId={branchId}
                    draftAttachments={row.draftAttachments || []}
                    selectedToolLineIds={row.selectedToolLineIds || []}
                    toolLineMetadata={toolLineMetadata}
                    searchText={row.toolLineSearchText || ""}
                    isOpen={openIndicatorIndex === index}
                    isLocked={isLocked}
                    onSearchTextChange={(text) =>
                      onUpdateRowField(index, "toolLineSearchText", text)
                    }
                    onOpen={() => onSetOpenIndicatorIndex(index)}
                    onClose={() => onSetOpenIndicatorIndex(null)}
                    onAddToolLine={(toolLineId) => {
                      if (onAddToolLineLocal) {
                        onAddToolLineLocal(index, toolLineId);
                      }
                    }}
                    onRemoveToolLine={(chipIndex) => {
                      if (onRemoveToolLineLocal) {
                        onRemoveToolLineLocal(index, chipIndex);
                      }
                    }}
                    onRemoveToolLineDraft={
                      row.id && onRemoveToolLineDraft 
                        ? (draftId) => onRemoveToolLineDraft(index, draftId)
                        : undefined
                    }
                  />
                ) : (
                  <div
                    role="alert"
                    aria-live="polite"
                    style={{
                      padding: "8px 12px",
                      marginBottom: 8,
                      background: "#fef3c7",
                      borderRadius: 6,
                      fontSize: 12,
                      color: "#92400e",
                    }}
                  >
                    ⚠️ Ариутгалын багаж сонгох боломжгүй: Өвчтөний салбар тодорхойгүй байна
                  </div>
                )
              ) : null}

              {/* Diagnosis search */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <div style={{ position: "relative", flex: 1 }}>
                  <input
                    placeholder="Онош бичиж хайх (ж: K04.1, пульпит...)"
                    value={row.searchText ?? ""}
                    onChange={(e) => {
                      if (isLocked) return;
                      const text = e.target.value;
                      onSetOpenDxIndex(index);
                      onUpdateRowField(index, "searchText", text);
                      if (!text.trim()) {
                        onUpdateRowField(index, "diagnosisId", null);
                        onUpdateRowField(index, "diagnosis", undefined);
                        onUpdateRowField(index, "selectedProblemIds", []);
                      }
                    }}
                    onFocus={() => {
                      if (!isLocked && hasSearchText) onSetOpenDxIndex(index);
                    }}
                    onBlur={() => {
                      setTimeout(() => onSetOpenDxIndex(null), 150);
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

                  {openDxIndex === index && diagnoses.length > 0 && hasSearchText && (
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
                      {diagnoses
                        .filter((d) => {
                          const q = (row.searchText || "").toLowerCase();
                          if (!q.trim()) return true;
                          const hay = `${d.code} ${d.name}`.toLowerCase();
                          return hay.includes(q);
                        })
                        .slice(0, 50)
                        .map((d) => (
                          <div
                            key={d.id}
                            onMouseDown={async (e) => {
                              e.preventDefault();
                              await onDiagnosisChange(index, d.id);
                              onSetOpenDxIndex(null);
                            }}
                            style={{
                              padding: "6px 8px",
                              cursor: "pointer",
                              borderBottom: "1px solid #f3f4f6",
                              background:
                                row.diagnosisId === d.id
                                  ? "#eff6ff"
                                  : "white",
                            }}
                          >
                            <div style={{ fontWeight: 500 }}>
                              {d.code} – {d.name}
                            </div>
                            {d.description && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#6b7280",
                                  marginTop: 2,
                                }}
                              >
                                {d.description}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveRow(index)}
                  disabled={isLocked}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid #dc2626",
                    background: isLocked ? "#f3f4f6" : "#fef2f2",
                    color: isLocked ? "#9ca3af" : "#b91c1c",
                    cursor: isLocked ? "not-allowed" : "pointer",
                    fontSize: 12,
                    height: 32,
                    alignSelf: "flex-start",
                    opacity: isLocked ? 0.5 : 1,
                  }}
                >
                  Устгах
                </button>
              </div>

              {/* Problems selection */}
              {row.diagnosisId ? (
                <>
                  {problems.length === 0 ? (
                    <div
                      style={{
                        color: "#6b7280",
                        fontSize: 12,
                        marginBottom: 8,
                      }}
                    >
                      Энэ оношид тохирсон зовиур бүртгээгүй байна
                      (оношийн тохиргооноос нэмнэ).
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      {problems.map((p) => {
                        const checked =
                          row.selectedProblemIds?.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "4px 8px",
                              borderRadius: 999,
                              border: checked
                                ? "1px solid #16a34a"
                                : "1px solid #d1d5db",
                              background: checked ? "#dcfce7" : "#ffffff",
                              fontSize: 12,
                              cursor: isLocked ? "not-allowed" : "pointer",
                              opacity: isLocked ? 0.6 : 1,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => onToggleProblem(index, p.id)}
                              disabled={isLocked}
                              style={{
                                cursor: isLocked ? "not-allowed" : "pointer",
                              }}
                            />
                            {p.label}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : null}

              {/* Problem Texts Editor */}
              {row.diagnosisId && (
                <ProblemTextsEditor
                  texts={row.draftProblemTexts ?? (row.problemTexts?.map(pt => pt.text) || [""])}
                  onChange={(texts) => onUpdateRowField(index, "draftProblemTexts", texts)}
                  isLocked={isLocked}
                />
              )}

              {/* Service Texts Editor */}
              {row.serviceId && (() => {
                // Find the encounterService that matches this diagnosis row to get existing texts
                const matchingEncounterService = (encounterServices || []).find(
                  (es) => {
                    const meta = es.meta as { diagnosisId?: number | null } | null;
                    return meta?.diagnosisId === row.id;
                  }
                );
                // Initialize draft texts from existing or start with one empty field
                const existingTexts = matchingEncounterService?.texts?.map(t => t.text) || [];
                const drafts = row.draftServiceTexts ?? (existingTexts.length > 0 ? existingTexts : [""]);
                
                return (
                  <ServiceTextsEditor
                    texts={drafts}
                    onChange={(texts) => onUpdateRowField(index, "draftServiceTexts", texts)}
                    isLocked={isLocked}
                  />
                );
              })()}

              {/* Note textarea */}
              <textarea
                placeholder="Энэ оношид холбогдох тэмдэглэл (сонголттой)"
                value={row.note}
                onChange={(e) => onNoteChange(index, e.target.value)}
                rows={2}
                disabled={isLocked}
                style={{
                  width: "100%",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  padding: "6px 8px",
                  fontSize: 13,
                  resize: "vertical",
                  background: isLocked ? "#f3f4f6" : "#ffffff",
                  cursor: isLocked ? "not-allowed" : "text",
                  opacity: isLocked ? 0.6 : 1,
                }}
              />
            </div>
          );
        })}
      </div>

      {saveError && (
        <div style={{ color: "red", marginTop: 8 }}>{saveError}</div>
      )}

      {/* Summary and action buttons */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 13, color: "#111827" }}>
          Нийт үйлчилгээний урьдчилсан дүн:{" "}
          <strong>
            {totalDiagnosisServicesPrice.toLocaleString("mn-MN")}₮
          </strong>{" "}
          <span style={{ fontSize: 11, color: "#6b7280" }}>
            (Эмчийн сонгосон онош, үйлчилгээний дагуу. Төлбөрийн касс дээр
            эцэслэнэ.)
          </span>
        </div>

        {!hideInlineActions && (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={async () => {
                await onSave();
                onResetToothSelection();
              }}
              disabled={saving || finishing || prescriptionSaving}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "none",
                background: "#16a34a",
                color: "#ffffff",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              {saving || prescriptionSaving
                ? "Хадгалж байна..."
                : "Онош хадгалах"}
            </button>

            <button
              type="button"
              onClick={onFinish}
              disabled={saving || finishing || prescriptionSaving}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "none",
                background: "#2563eb",
                color: "#ffffff",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              {finishing
                ? "Дуусгаж байна..."
                : "Үзлэг дуусгах"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
