import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import ChildVisitCardForm from "../../../components/ChildVisitCardForm";
import type { VisitCardType, VisitCardAnswers } from "../../../types/visitCard";

// ─── Types ────────────────────────────────────────────────────────────────────

type PatientInfo = {
  name?: string | null;
  ovog?: string | null;
  bookNumber?: string | null;
  phone?: string | null;
};

type EncounterInfo = {
  id: number;
  visitDate: string;
  notes?: string | null;
  appointmentId?: number | null;
  patientBook?: {
    id: number;
    bookNumber: string;
    patient: PatientInfo;
  } | null;
  doctor?: { name?: string | null } | null;
};

type AppointmentStatus = "ongoing" | "ready_to_pay" | "completed" | "partial_paid" | "booked" | "confirmed" | string;

// ─── Sub-component: VisitCard form ───────────────────────────────────────────

type VisitCardSectionProps = {
  appointmentId: number;
  isOngoing: boolean;
};

function VisitCardSection({ appointmentId, isOngoing }: VisitCardSectionProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [visitCardType, setVisitCardType] = useState<VisitCardType>("ADULT");
  const [answers, setAnswers] = useState<VisitCardAnswers>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/doctor/appointments/${appointmentId}/visit-card`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) {
          // 404 means no card yet — that's OK
          if (res.status === 404) {
            setAnswers({});
            return;
          }
          throw new Error(data.error || "Карт ачаалахад алдаа.");
        }
        const card = data.visitCard || data;
        if (card?.type) setVisitCardType(card.type);
        setAnswers(card?.answers || {});
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [appointmentId]);

  const updateVisitCardAnswer = useCallback((key: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateNested = useCallback((section: string, field: string, value: any) => {
    setAnswers((prev) => ({
      ...prev,
      [section]: { ...(prev as any)[section], [field]: value },
    }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/doctor/appointments/${appointmentId}/visit-card`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: visitCardType, answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Хадгалахад алдаа гарлаа.");
      setSuccessMsg("Амжилттай хадгаллаа.");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 20, color: "#6b7280", textAlign: "center" }}>Ачаалж байна...</div>;

  return (
    <div>
      {error && (
        <div style={{ background: "#fee2e2", color: "#dc2626", padding: 10, borderRadius: 8, marginBottom: 10, fontSize: 13 }}>
          {error}
        </div>
      )}
      {successMsg && (
        <div style={{ background: "#dcfce7", color: "#16a34a", padding: 10, borderRadius: 8, marginBottom: 10, fontSize: 13 }}>
          {successMsg}
        </div>
      )}

      {/* Type selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {(["ADULT", "CHILD"] as VisitCardType[]).map((t) => (
          <button
            key={t}
            onClick={() => isOngoing && setVisitCardType(t)}
            disabled={!isOngoing}
            style={{
              padding: "8px 18px",
              borderRadius: 20,
              border: "none",
              fontWeight: 600,
              fontSize: 13,
              cursor: isOngoing ? "pointer" : "not-allowed",
              background: visitCardType === t ? "#0f2044" : "#f3f4f6",
              color: visitCardType === t ? "white" : "#374151",
              opacity: !isOngoing ? 0.6 : 1,
            }}
          >
            {t === "ADULT" ? "Насанд хүрсэн" : "Хүүхэд"}
          </button>
        ))}
      </div>

      {visitCardType === "CHILD" && (
        <ChildVisitCardForm
          answers={answers}
          updateVisitCardAnswer={updateVisitCardAnswer}
          updateNested={updateNested}
        />
      )}

      {visitCardType === "ADULT" && (
        <AdultVisitCardForm
          answers={answers}
          updateVisitCardAnswer={updateVisitCardAnswer}
          updateNested={updateNested}
          readOnly={!isOngoing}
        />
      )}

      {isOngoing && (
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "12px",
            background: "#0f2044",
            color: "white",
            border: "none",
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 15,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Хадгалж байна..." : "Карт хадгалах"}
        </button>
      )}
    </div>
  );
}

// ─── Sub-component: OrthoCard form ───────────────────────────────────────────

type OrthoCardSectionProps = {
  appointmentId: number;
  isOngoing: boolean;
};

function OrthoCardSection({ appointmentId, isOngoing }: OrthoCardSectionProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [answers, setAnswers] = useState<Record<string, any>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/doctor/appointments/${appointmentId}/ortho-card`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 404) {
            setAnswers({});
            return;
          }
          throw new Error(data.error || "Картыг ачаалахад алдаа.");
        }
        setAnswers(data.orthoCard?.answers || data.answers || {});
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [appointmentId]);

  const update = (key: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/doctor/appointments/${appointmentId}/ortho-card`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Хадгалахад алдаа гарлаа.");
      setSuccessMsg("Амжилттай хадгаллаа.");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 20, color: "#6b7280", textAlign: "center" }}>Ачаалж байна...</div>;

  return (
    <div>
      {error && (
        <div style={{ background: "#fee2e2", color: "#dc2626", padding: 10, borderRadius: 8, marginBottom: 10, fontSize: 13 }}>
          {error}
        </div>
      )}
      {successMsg && (
        <div style={{ background: "#dcfce7", color: "#16a34a", padding: 10, borderRadius: 8, marginBottom: 10, fontSize: 13 }}>
          {successMsg}
        </div>
      )}

      {/* Basic ortho card fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <OrthoField
          label="Гомдол, шалтгаан"
          fieldKey="chiefComplaint"
          value={answers.chiefComplaint || ""}
          onChange={update}
          readOnly={!isOngoing}
          multiline
        />
        <OrthoField
          label="Одоогийн байдал"
          fieldKey="currentCondition"
          value={answers.currentCondition || ""}
          onChange={update}
          readOnly={!isOngoing}
          multiline
        />
        <OrthoField
          label="Урьдчилсан оношилгоо"
          fieldKey="preliminaryDiagnosis"
          value={answers.preliminaryDiagnosis || ""}
          onChange={update}
          readOnly={!isOngoing}
          multiline
        />
        <OrthoField
          label="Эмчилгээний төлөвлөгөө"
          fieldKey="treatmentPlan"
          value={answers.treatmentPlan || ""}
          onChange={update}
          readOnly={!isOngoing}
          multiline
        />
        <OrthoField
          label="Тэмдэглэл"
          fieldKey="notes"
          value={answers.notes || ""}
          onChange={update}
          readOnly={!isOngoing}
          multiline
        />
      </div>

      {isOngoing && (
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "12px",
            background: "#0f2044",
            color: "white",
            border: "none",
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 15,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Хадгалж байна..." : "Карт хадгалах"}
        </button>
      )}
    </div>
  );
}

// ─── Helper: simple field ─────────────────────────────────────────────────────

function OrthoField({
  label,
  fieldKey,
  value,
  onChange,
  readOnly,
  multiline,
}: {
  label: string;
  fieldKey: string;
  value: string;
  onChange: (k: string, v: string) => void;
  readOnly: boolean;
  multiline?: boolean;
}) {
  const sharedStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 14,
    background: readOnly ? "#f9fafb" : "white",
    resize: "vertical" as const,
    color: "#111827",
  };
  return (
    <div>
      <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 3 }}>{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => !readOnly && onChange(fieldKey, e.target.value)}
          readOnly={readOnly}
          rows={3}
          style={sharedStyle}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => !readOnly && onChange(fieldKey, e.target.value)}
          readOnly={readOnly}
          style={sharedStyle}
        />
      )}
    </div>
  );
}

// ─── Simplified Adult Visit Card ──────────────────────────────────────────────

function AdultVisitCardForm({
  answers,
  updateVisitCardAnswer,
  updateNested,
  readOnly,
}: {
  answers: VisitCardAnswers;
  updateVisitCardAnswer: (key: string, value: any) => void;
  updateNested: (section: string, field: string, value: any) => void;
  readOnly: boolean;
}) {
  const field = (label: string, key: keyof VisitCardAnswers, multiline = false) => {
    const val = String(answers[key] || "");
    const style: React.CSSProperties = {
      width: "100%",
      padding: "9px 12px",
      border: "1px solid #d1d5db",
      borderRadius: 8,
      fontSize: 14,
      background: readOnly ? "#f9fafb" : "white",
      resize: "vertical",
      color: "#111827",
    };
    return (
      <div key={key}>
        <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 3 }}>{label}</label>
        {multiline ? (
          <textarea
            value={val}
            onChange={(e) => !readOnly && updateVisitCardAnswer(key, e.target.value)}
            readOnly={readOnly}
            rows={2}
            style={style}
          />
        ) : (
          <input
            type="text"
            value={val}
            onChange={(e) => !readOnly && updateVisitCardAnswer(key, e.target.value)}
            readOnly={readOnly}
            style={style}
          />
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        background: "white",
      }}
    >
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>Үзлэгийн карт (Насанд хүрсэн)</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {field("Утасны дугаар", "phone")}
        {field("Имэйл", "email")}
        {field("Ажлын байр", "workPlace")}
        {field("Хаяг", "address")}
        {field("Үндсэн гомдол", "mainComplaint", true)}
        {field("Урьдах өвчний түүх", "pastHistory", true)}
        {field("Хүүхдийн үед эмчилгээ хийлгэж байсан эмнэлэг", "previousClinicName")}
        {field("Эмчилгээний явцад гарсан асуудал", "previousTreatmentIssues", true)}
        {field("Эмчийн онцлон анхаарах зүйл", "dentistAttentionNotes", true)}
      </div>
    </div>
  );
}

// ─── Main Doctor Encounter Page ───────────────────────────────────────────────

type ActiveSection = "overview" | "visit-card" | "ortho-card";

export default function DoctorEncounterPage() {
  const router = useRouter();
  const { encounterId } = router.query;
  const appointmentIdParam = router.query.appointmentId as string | undefined;

  const [encounter, setEncounter] = useState<EncounterInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [appointmentStatus, setAppointmentStatus] = useState<AppointmentStatus | null>(null);
  const [activeSection, setActiveSection] = useState<ActiveSection>("overview");

  // Load encounter
  useEffect(() => {
    if (!encounterId || typeof encounterId !== "string") return;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/encounters/${encounterId}`, { credentials: "include" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Үзлэг ачаалахад алдаа.");
        setEncounter(data);

        // Determine appointment status
        // Try to get it from the appointment list API
        if (data.appointmentId) {
          const today = new Date().toISOString().slice(0, 10);
          const weekAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
          try {
            const apptRes = await fetch(
              `/api/doctor/appointments?from=${weekAgo}&to=${today}`,
              { credentials: "include" }
            );
            if (apptRes.ok) {
              const apptData = await apptRes.json();
              const matching = (apptData.appointments || []).find(
                (a: any) => a.id === data.appointmentId
              );
              if (matching) {
                setAppointmentStatus(matching.status);
              }
            }
          } catch {
            // If status fetch fails, fall back to read-only
          }
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [encounterId]);

  const isOngoing = appointmentStatus === "ongoing";
  const appointmentId = encounter?.appointmentId ?? (appointmentIdParam ? Number(appointmentIdParam) : null);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: "#6b7280" }}>Ачаалж байна...</div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 600, margin: "0 auto", padding: 16 }}>
        <div style={{ background: "#fee2e2", color: "#dc2626", padding: 14, borderRadius: 10 }}>{error}</div>
        <button
          onClick={() => router.back()}
          style={{ marginTop: 12, padding: "10px 20px", background: "#f3f4f6", border: "none", borderRadius: 8, cursor: "pointer" }}
        >
          ← Буцах
        </button>
      </div>
    );
  }

  if (!encounter) return null;

  const patient = encounter.patientBook?.patient;
  const patientName = [patient?.ovog, patient?.name].filter(Boolean).join(" ") || encounter.patientBook?.bookNumber || "—";

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "12px 12px 0" }}>
      {/* Back button */}
      <button
        onClick={() => router.back()}
        style={{
          background: "transparent",
          border: "none",
          color: "#0f2044",
          fontSize: 14,
          cursor: "pointer",
          padding: "4px 0",
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        ← Буцах
      </button>

      {/* Patient header */}
      <div
        style={{
          background: "white",
          borderRadius: 14,
          padding: "14px 16px",
          marginBottom: 14,
          boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 17, color: "#111827" }}>{patientName}</div>
        {patient?.phone && (
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{patient.phone}</div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 20,
              background: isOngoing ? "#dcfce7" : "#f3f4f6",
              color: isOngoing ? "#16a34a" : "#6b7280",
            }}
          >
            {isOngoing ? "Үзлэг хийж байна" : appointmentStatus ?? "—"}
          </span>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>
            Үзлэг #{encounter.id}
          </span>
        </div>

        {!isOngoing && (
          <div
            style={{
              marginTop: 10,
              background: "#fef3c7",
              color: "#92400e",
              padding: "8px 12px",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            ⚠️ Энэ үзлэг дууссан тул засах боломжгүй. Зөвхөн уншигдах горимд байна.
          </div>
        )}
      </div>

      {/* Section tabs */}
      {appointmentId && (
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 14,
            background: "#f3f4f6",
            borderRadius: 12,
            padding: 4,
          }}
        >
          {(
            [
              { id: "overview", label: "Ерөнхий" },
              { id: "visit-card", label: "Карт бөглөх" },
              { id: "ortho-card", label: "Гажиг заслын карт" },
            ] as { id: ActiveSection; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              style={{
                flex: 1,
                padding: "9px 4px",
                border: "none",
                borderRadius: 9,
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
                background: activeSection === tab.id ? "white" : "transparent",
                color: activeSection === tab.id ? "#0f2044" : "#6b7280",
                boxShadow: activeSection === tab.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Section content */}
      {activeSection === "overview" && (
        <div
          style={{
            background: "white",
            borderRadius: 14,
            padding: 16,
            boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
          }}
        >
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>Үзлэгийн огноо</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 14 }}>
            {encounter.visitDate ? new Date(encounter.visitDate).toLocaleDateString("mn-MN") : "—"}
          </div>

          {encounter.notes && (
            <>
              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>Тэмдэглэл</div>
              <div style={{ fontSize: 14, color: "#374151", marginBottom: 14 }}>{encounter.notes}</div>
            </>
          )}

          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>Эмч</div>
          <div style={{ fontSize: 14, color: "#374151" }}>{encounter.doctor?.name || "—"}</div>

          {isOngoing && (
            <div
              style={{
                marginTop: 16,
                padding: "10px 14px",
                background: "#eff6ff",
                borderRadius: 10,
                fontSize: 13,
                color: "#1d4ed8",
              }}
            >
              💡 "Карт бөглөх" эсвэл "Гажиг заслын карт" табыг нээж тохирох маягтыг бөглөнө үү.
            </div>
          )}
        </div>
      )}

      {activeSection === "visit-card" && appointmentId && (
        <div
          style={{
            background: "white",
            borderRadius: 14,
            padding: 16,
            boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px", color: "#0f2044" }}>
            Карт бөглөх (Үзлэгийн карт)
          </h2>
          <VisitCardSection appointmentId={appointmentId} isOngoing={isOngoing} />
        </div>
      )}

      {activeSection === "ortho-card" && appointmentId && (
        <div
          style={{
            background: "white",
            borderRadius: 14,
            padding: 16,
            boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px", color: "#0f2044" }}>
            Гажиг заслын карт
          </h2>
          <OrthoCardSection appointmentId={appointmentId} isOngoing={isOngoing} />
        </div>
      )}

      {!appointmentId && activeSection !== "overview" && (
        <div
          style={{
            background: "#fef9c3",
            color: "#854d0e",
            padding: 14,
            borderRadius: 10,
            fontSize: 13,
          }}
        >
          Энэ үзлэгт цагийн холбоос байхгүй тул маягт бөглөх боломжгүй.
        </div>
      )}
    </div>
  );
}
