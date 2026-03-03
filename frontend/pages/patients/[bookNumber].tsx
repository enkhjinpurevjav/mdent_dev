import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import SignaturePad from "../../components/SignaturePad";
import ChildVisitCardForm from "../../components/ChildVisitCardForm";
import SharedConsentAndSignature from "../../components/SharedConsentAndSignature";
import PreventativeQuestionnaire from "../../components/PreventativeQuestionnaire";
import OrthoCardView from "./OrthoCardView";
import EncounterReportModal from "../../components/patients/EncounterReportModal";
import PatientHistoryBook from "../../components/patients/PatientHistoryBook";
import type { ActiveTab, Patient, PatientBook } from "../../types/patients";
import type { VisitCardType, VisitCardAnswers } from "../../types/visitCard";
import { formatDateTime, formatDate, displayOrDash, formatDisplayName, formatDoctorName } from "../../utils/format";
import { usePatientProfile } from "../../hooks/usePatientProfile";
import { useVisitCard } from "../../hooks/useVisitCard";
import type { Encounter, Appointment, PatientProfileResponse } from "../../types/patients";
import type { VisitCard } from "../../types/visitCard";

export default function PatientProfilePage() {
  const router = useRouter();
  const { bookNumber } = router.query;

  // Use custom hooks for data fetching
  const { data, loading, error, refetch } = usePatientProfile();

  const [activeTab, setActiveTab] = useState<ActiveTab>("profile");

  const patientBookId = data?.patientBook?.id || null;
  
  // Use custom hook for visit card
  const {
    visitCard,
    visitCards,
    visitCardLoading,
    visitCardError,
    visitCardTypeDraft,
    visitCardAnswers,
    visitCardSaving,
    signatureSaving,
    sharedSignature,
    sharedSignatureLoading,
    handleTypeChange,
    updateVisitCardAnswer,
    updateNested,
    handleSaveVisitCard,
    handleUploadSignature,
    handleUploadSharedSignature,
    setVisitCardTypeDraft,
  } = useVisitCard({ bookNumber, activeTab, patientBookId });

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Patient>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  // Encounter report modal state
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportAppointmentId, setReportAppointmentId] = useState<number | null>(null);

  // Handle tab query parameter for deep-linking
  // Accepts both "ortho" (short form) and "ortho_card" (internal tab ID) for flexibility
  useEffect(() => {
    const tabParam = router.query.tab as string | undefined;
    if (tabParam === "ortho" || tabParam === "ortho_card") {
      setActiveTab("ortho_card");
    } else if (tabParam === "patient_history") {
      setActiveTab("patient_history");
    }
  }, [router.query.tab]);

  const patient = data?.patient;
  const pb = data?.patientBook;
  const encounters = data?.encounters || [];
  const appointments = data?.appointments || [];

  const totalEncounters = encounters.length;
  const lastEncounter = encounters[0];

  const now = new Date();
  const totalAppointments = appointments.length;
  const upcomingAppointments = appointments.filter((a) => {
    const d = new Date(a.scheduledAt);
    if (Number.isNaN(d.getTime())) return false;
    return d > now && a.status === "booked";
  });

  const startEdit = () => {
    if (!patient) return;
    setEditForm({
      ovog: patient.ovog || "",
      name: patient.name || "",
      regNo: patient.regNo || "",
      phone: patient.phone || "",
      email: patient.email || "",
      gender: patient.gender || "",
      birthDate: patient.birthDate ? patient.birthDate.slice(0, 10) : "",
      address: patient.address || "",
      workPlace: patient.workPlace || "",
      bloodType: patient.bloodType || "",
      citizenship: patient.citizenship || "Монгол",
      emergencyPhone: patient.emergencyPhone || "",
      notes: patient.notes || "",
    });
    setSaveError("");
    setSaveSuccess("");
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditForm({});
    setSaveError("");
    setSaveSuccess("");
  };

  const handleEditChange = (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>
      | React.ChangeEvent<HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleGenderChange = (value: "" | "эр" | "эм") => {
    setEditForm((prev) => ({ ...prev, gender: value }));
  };

  const handleSave = async () => {
    if (!patient) return;
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");

    if (
      editForm.gender &&
      editForm.gender !== "эр" &&
      editForm.gender !== "эм"
    ) {
      setSaveError(
        "Хүйс талбарт зөвхөн 'эр' эсвэл 'эм' утга сонгох боломжтой."
      );
      setSaving(false);
      return;
    }

    try {
      const payload: any = {
        ovog: (editForm.ovog || "").trim() || null,
        name: (editForm.name || "").trim(),
        regNo: (editForm.regNo || "").trim() || null,
        phone: (editForm.phone || "").trim() || null,
        email: (editForm.email || "").trim() || null,
        gender: editForm.gender || null,
        birthDate: editForm.birthDate || null,
        address: (editForm.address || "").trim() || null,
        workPlace: (editForm.workPlace || "").trim() || null,
        bloodType: (editForm.bloodType || "").trim() || null,
        citizenship: (editForm.citizenship || "").trim() || null,
        emergencyPhone: (editForm.emergencyPhone || "").trim() || null,
        notes: (editForm.notes || "").trim() || null,
      };

      const res = await fetch(`/api/patients/${patient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (json && json.error) || "Өгөгдөл хадгалах үед алдаа гарлаа"
        );
      }

      const updatedPatient = (json && json.patient) || json || patient;
      // Call refetch to reload the whole patient profile with updated data
      refetch();

      setSaveSuccess("Мэдээлэл амжилттай хадгалагдлаа.");
      setEditMode(false);
    } catch (err: any) {
      console.error(err);
      setSaveError(err?.message || "Өгөгдөл хадгалах үед алдаа гарлаа.");
    } finally {
      setSaving(false);
    }
  };

  const sortedAppointments = [...appointments].sort((a, b) =>
    b.scheduledAt.localeCompare(a.scheduledAt)
  );

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "40px auto",
        padding: 24,
        fontFamily: "sans-serif",
      }}
    >
      <button
        type="button"
        onClick={() => router.push("/patients")}
        style={{
          marginBottom: 16,
          padding: "4px 8px",
          borderRadius: 4,
          border: "1px solid #d1d5db",
          background: "#f9fafb",
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        ← Буцах
      </button>

      {loading && <div>Ачааллаж байна...</div>}
      {!loading && error && <div style={{ color: "red" }}>{error}</div>}

      {!loading && !error && patient && pb && (
        <>
          {/* Top layout: left profile panel + right content */}
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "260px 1fr",
              gap: 16,
              alignItems: "stretch",
              marginBottom: 24,
            }}
          >
            {/* Left: profile card + side menu */}
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 16,
                background: "white",
              }}
            >
              <div style={{ marginBottom: 4, fontSize: 18, fontWeight: 600 }}>
                {formatDisplayName(patient)}
              </div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                Картын дугаар: {pb.bookNumber}
              </div>
              {patient.regNo && (
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  РД: {patient.regNo}
                </div>
              )}
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                Утас: {displayOrDash(patient.phone)}
              </div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                Бүртгэсэн салбар: {patient.branch?.name || patient.branchId}
              </div>
              {patient.createdAt && (
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                  Бүртгэсэн: {formatDate(patient.createdAt)}
                </div>
              )}

              {/* Side menu */}
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    color: "#9ca3af",
                    marginBottom: 4,
                  }}
                >
                  Цэс
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    fontSize: 13,
                  }}
                >
                  {/* Профайл */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("profile");
                      setEditMode(false);
                      setSaveError("");
                      setSaveSuccess("");
                    }}
                    style={{
                      textAlign: "left",
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "none",
                      background:
                        activeTab === "profile" ? "#eff6ff" : "transparent",
                      color:
                        activeTab === "profile" ? "#1d4ed8" : "#6b7280",
                      fontWeight: activeTab === "profile" ? 500 : 400,
                      cursor: "pointer",
                    }}
                  >
                    Профайл
                  </button>

                  {/* Үйлчлүүлэгчийн карт */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("patient_history");
                      setEditMode(false);
                      setSaveError("");
                      setSaveSuccess("");
                    }}
                    style={{
                      textAlign: "left",
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "none",
                      background:
                        activeTab === "patient_history"
                          ? "#eff6ff"
                          : "transparent",
                      color:
                        activeTab === "patient_history"
                          ? "#1d4ed8"
                          : "#6b7280",
                      fontWeight:
                        activeTab === "patient_history" ? 500 : 400,
                      cursor: "pointer",
                    }}
                  >
                    Үйлчлүүлэгчийн карт
                  </button>

                  {/* Цагууд */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("appointments");
                      setEditMode(false);
                      setSaveError("");
                      setSaveSuccess("");
                    }}
                    style={{
                      textAlign: "left",
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "none",
                      background:
                        activeTab === "appointments"
                          ? "#eff6ff"
                          : "transparent",
                      color:
                        activeTab === "appointments"
                          ? "#1d4ed8"
                          : "#6b7280",
                      fontWeight:
                        activeTab === "appointments" ? 500 : 400,
                      cursor: "pointer",
                    }}
                  >
                    Цагууд
                  </button>

                  {/* Карт бөглөх */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("visit_card");
                      setEditMode(false);
                      setSaveError("");
                      setSaveSuccess("");
                    }}
                    style={{
                      textAlign: "left",
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "none",
                      background:
                        activeTab === "visit_card"
                          ? "#eff6ff"
                          : "transparent",
                      color:
                        activeTab === "visit_card"
                          ? "#1d4ed8"
                          : "#6b7280",
                      fontWeight:
                        activeTab === "visit_card" ? 500 : 400,
                      cursor: "pointer",
                    }}
                  >
                    Карт бөглөх
                  </button>

                  {/* Гажиг заслын карт */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("ortho_card");
                      setEditMode(false);
                      setSaveError("");
                      setSaveSuccess("");
                    }}
                    style={{
                      textAlign: "left",
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "none",
                      background:
                        activeTab === "ortho_card"
                          ? "#eff6ff"
                          : "transparent",
                      color:
                        activeTab === "ortho_card"
                          ? "#1d4ed8"
                          : "#6b7280",
                      fontWeight:
                        activeTab === "ortho_card" ? 500 : 400,
                      cursor: "pointer",
                    }}
                  >
                    Гажиг заслын карт
                  </button>

                  {/* Future placeholders */}
                  <div
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      color: "#6b7280",
                    }}
                  >
                    Үзлэгийн түүх
                  </div>
                  <div
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      color: "#6b7280",
                    }}
                  >
                    Нэхэмжлэх
                  </div>
                </div>
              </div>
            </div>

            {/* Right content area: depends on activeTab */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {activeTab === "profile" && (
                <>
                  {/* Summary cards row */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {/* Encounters summary */}
                    <div
                      style={{
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        padding: 12,
                        background: "#f9fafb",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          textTransform: "uppercase",
                          color: "#6b7280",
                          marginBottom: 4,
                        }}
                      >
                        Үзлэгүүд
                      </div>
                      <div
                        style={{
                          fontSize: 24,
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        {totalEncounters}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        Нийт бүртгэлтэй үзлэг
                      </div>
                    </div>

                    {/* Last encounter */}
                    <div
                      style={{
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        padding: 12,
                        background: "#f9fafb",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          textTransform: "uppercase",
                          color: "#6b7280",
                          marginBottom: 4,
                        }}
                      >
                        Сүүлийн үзлэг
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          marginBottom: 4,
                        }}
                      >
                        {lastEncounter
                          ? formatDateTime(lastEncounter.visitDate)
                          : "-"}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        Хамгийн сүүлд ирсэн огноо
                      </div>
                    </div>

                    {/* Appointments summary */}
                    <div
                      style={{
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        padding: 12,
                        background: "#f9fafb",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          textTransform: "uppercase",
                          color: "#6b7280",
                          marginBottom: 4,
                        }}
                      >
                        Цаг захиалгууд
                      </div>
                      <div
                        style={{
                          fontSize: 24,
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        {totalAppointments}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        Нийт бүртгэлтэй цаг
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#16a34a",
                          marginTop: 4,
                        }}
                      >
                        Ирэх цаг: {upcomingAppointments.length}
                      </div>
                    </div>
                  </div>

                  {/* Basic information section (editable) */}
                  <div
                    style={{
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      padding: 16,
                      background: "white",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 12,
                      }}
                    >
                      <h2
                        style={{
                          fontSize: 16,
                          marginTop: 0,
                          marginBottom: 0,
                        }}
                      >
                        Үндсэн мэдээлэл
                      </h2>
                      {!editMode ? (
                        <button
                          type="button"
                          onClick={startEdit}
                          style={{
                            fontSize: 12,
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            background: "#f9fafb",
                            cursor: "pointer",
                          }}
                        >
                          Засах
                        </button>
                      ) : null}
                    </div>

                    {saveError && (
                      <div
                        style={{
                          color: "#b91c1c",
                          fontSize: 12,
                          marginBottom: 8,
                        }}
                      >
                        {saveError}
                      </div>
                    )}
                    {saveSuccess && (
                      <div
                        style={{
                          color: "#16a34a",
                          fontSize: 12,
                          marginBottom: 8,
                        }}
                      >
                        {saveSuccess}
                      </div>
                    )}

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: 12,
                        fontSize: 13,
                      }}
                    >
                      {/* Book number and branch (read-only) */}
                      <div>
                        <div style={{ color: "#6b7280", marginBottom: 2 }}>
                          Картын дугаар
                        </div>
                        <div>{pb.bookNumber}</div>
                      </div>
                      <div>
                        <div style={{ color: "#6b7280", marginBottom: 2 }}>
                          Бүртгэсэн салбар
                        </div>
                        <div>{patient.branch?.name || patient.branchId}</div>
                      </div>

                      {/* Ovog, Name, regNo */}
                      <div>
                        <div style={{ color: "#6b7280", marginBottom: 2 }}>
                          Овог
                        </div>
                        {editMode ? (
                          <input
                            name="ovog"
                            value={editForm.ovog ?? ""}
                            onChange={handleEditChange}
                            style={{
                              width: "100%",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                              padding: "4px 6px",
                            }}
                          />
                        ) : (
                          <div>{displayOrDash(patient.ovog)}</div>
                        )}
                      </div>
                      <div>
                        <div style={{ color: "#6b7280", marginBottom: 2 }}>
                          Нэр
                        </div>
                        {editMode ? (
                          <input
                            name="name"
                            value={editForm.name ?? ""}
                            onChange={handleEditChange}
                            style={{
                              width: "100%",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                              padding: "4px 6px",
                            }}
                          />
                        ) : (
                          <div>{patient.name}</div>
                        )}
                      </div>
                      <div>
                        <div style={{ color: "#6b7280", marginBottom: 2 }}>
                          РД
                        </div>
                        {editMode ? (
                          <input
                            name="regNo"
                            value={editForm.regNo ?? ""}
                            onChange={handleEditChange}
                            style={{
                              width: "100%",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                              padding: "4px 6px",
                            }}
                          />
                        ) : (
                          <div>{displayOrDash(patient.regNo)}</div>
                        )}
                      </div>

                      {/* Contact info */}
                      <div>
                        <div style={{ color: "#6b7280", marginBottom: 2 }}>
                          Утас
                        </div>
                        {editMode ? (
                          <input
                            name="phone"
                            value={editForm.phone ?? ""}
                            onChange={handleEditChange}
                            style={{
                              width: "100%",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                              padding: "4px 6px",
                            }}
                          />
                        ) : (
                          <div>{displayOrDash(patient.phone)}</div>
                        )}
                      </div>
                      <div>
                        <div style={{ color: "#6b7280", marginBottom: 2 }}>
                          Яаралтай үед холбоо барих утас
                        </div>
                        {editMode ? (
                          <input
                            name="emergencyPhone"
                            value={editForm.emergencyPhone ?? ""}
                            onChange={handleEditChange}
                            style={{
                              width: "100%",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                              padding: "4px 6px",
                            }}
                          />
                        ) : (
                          <div>{displayOrDash(patient.emergencyPhone)}</div>
                        )}
                      </div>
                      <div>
                        <div style={{ color: "#6b7280", marginBottom: 2 }}>
                          E-mail
                        </div>
                        {editMode ? (
                          <input
                            name="email"
                            type="email"
                            value={editForm.email ?? ""}
                            onChange={handleEditChange}
                            style={{
                              width: "100%",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                              padding: "4px 6px",
                            }}
                          />
                        ) : (
                          <div>{displayOrDash(patient.email)}</div>
                        )}
                      </div>
                      <div>
                        <div style={{ color: "#6b7280", marginBottom: 2 }}>
                          Ажлын газар
                        </div>
                        {editMode ? (
                          <input
                            name="workPlace"
                            value={editForm.workPlace ?? ""}
                            onChange={handleEditChange}
                            style={{
                              width: "100%",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                              padding: "4px 6px",
                            }}
                          />
                        ) : (
                          <div>{displayOrDash(patient.workPlace)}</div>
                        )}
                      </div>

                      {/* Dates & demographics */}
                      <div>
                        <div style={{ color: "#6b7280", marginBottom: 2 }}>
                          Бүртгэсэн огноо
                        </div>
                        <div>
                          {patient.createdAt
                            ? formatDate(patient.createdAt)
                            : "-"}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "#6b7280", marginBottom: 2 }}>
                          Хүйс
                        </div>
                        {editMode ? (
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                              paddingTop: 2,
                            }}
                          >
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <input
                                type="radio"
                                name="gender"
                                value="эр"
                                checked={editForm.gender === "эр"}
                                onChange={() => handleGenderChange("эр")}
                              />
                              <span>Эр</span>
                            </label>
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <input
                                type="radio"
                                name="gender"
                                value="эм"
                                checked={editForm.gender === "эм"}
                                onChange={() => handleGenderChange("эм")}
                              />
                              <span>Эм</span>
                            </label>
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <input
                                type="radio"
                                name="gender"
                                value=""
                                checked={!editForm.gender}
                                onChange={() => handleGenderChange("")}
                              />
                              <span>Хоосон</span>
                            </label>
                          </div>
                        ) : (
                          <div>{displayOrDash(patient.gender)}</div>
                        )}
                      </div>
                      <div>
                        <div style={{ color: "#6b7280", marginBottom: 2 }}>
                          Төрсөн огноо
                        </div>
                        {editMode ? (
                          <input
                            type="date"
                            name="birthDate"
                            value={editForm.birthDate ?? ""}
                            onChange={handleEditChange}
                            style={{
                              width: "100%",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                              padding: "4px 6px",
                            }}
                          />
                        ) : (
                          <div>
                            {patient.birthDate
                              ? formatDate(patient.birthDate)
                              : "-"}
                          </div>
                        )}
                      </div>
                      <div>
                        <div style={{ color: "#6b7280", marginBottom: 2 }}>
                          Цусны бүлэг
                        </div>
                        {editMode ? (
                          <input
                            name="bloodType"
                            value={editForm.bloodType ?? ""}
                            onChange={handleEditChange}
                            style={{
                              width: "100%",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                              padding: "4px 6px",
                            }}
                          />
                        ) : (
                          <div>{displayOrDash(patient.bloodType)}</div>
                        )}
                      </div>
                      <div>
                        <div style={{ color: "#6b7280", marginBottom: 2 }}>
                          Иргэншил
                        </div>
                        {editMode ? (
                          <input
                            name="citizenship"
                            value={editForm.citizenship ?? "Монгол"}
                            onChange={handleEditChange}
                            style={{
                              width: "100%",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                              padding: "4px 6px",
                            }}
                          />
                        ) : (
                          <div>{displayOrDash(patient.citizenship)}</div>
                        )}
                      </div>

                      {/* Address */}
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div style={{ color: "#6b7280", marginBottom: 2 }}>
                          Хаяг
                        </div>
                        {editMode ? (
                          <input
                            name="address"
                            value={editForm.address ?? ""}
                            onChange={handleEditChange}
                            style={{
                              width: "100%",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                              padding: "4px 6px",
                            }}
                          />
                        ) : (
                          <div>{displayOrDash(patient.address)}</div>
                        )}
                      </div>

                      {/* Notes */}
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div style={{ color: "#6b7280", marginBottom: 2 }}>
                          Тэмдэглэл
                        </div>
                        {editMode ? (
                          <textarea
                            name="notes"
                            value={editForm.notes ?? ""}
                            onChange={handleEditChange}
                            rows={3}
                            style={{
                              width: "100%",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                              padding: "4px 6px",
                              resize: "vertical",
                            }}
                          />
                        ) : (
                          <div>{displayOrDash(patient.notes)}</div>
                        )}
                      </div>
                    </div>

                    {/* Save / Cancel buttons at bottom when in editMode */}
                    {editMode && (
                      <div
                        style={{
                          marginTop: 16,
                          display: "flex",
                          gap: 8,
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={saving}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            background: "#f9fafb",
                            fontSize: 13,
                            cursor: saving ? "default" : "pointer",
                          }}
                        >
                          Болих
                        </button>
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={saving}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 6,
                            border: "none",
                            background: saving ? "#9ca3af" : "#2563eb",
                            color: "white",
                            fontSize: 13,
                            cursor: saving ? "default" : "pointer",
                          }}
                        >
                          {saving ? "Хадгалж байна..." : "Хадгалах"}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeTab === "appointments" && (
                <div
                  style={{
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    padding: 16,
                    background: "white",
                  }}
                >
                  <h2
                    style={{
                      fontSize: 16,
                      marginTop: 0,
                      marginBottom: 12,
                    }}
                  >
                    Цагууд (бүх бүртгэлтэй цагууд)
                  </h2>
                  {sortedAppointments.length === 0 ? (
                    <div style={{ color: "#6b7280", fontSize: 13 }}>
                      Цаг захиалгын бүртгэл алга.
                    </div>
                  ) : (
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 13,
                      }}
                    >
                      <thead>
                        <tr>
                          <th
                            style={{
                              textAlign: "left",
                              borderBottom: "1px solid #e5e7eb",
                              padding: 6,
                            }}
                          >
                            Огноо / цаг
                          </th>
                          <th
                            style={{
                              textAlign: "left",
                              borderBottom: "1px solid #e5e7eb",
                              padding: 6,
                            }}
                          >
                            Салбар
                          </th>
                          <th
                            style={{
                              textAlign: "left",
                              borderBottom: "1px solid #e5e7eb",
                              padding: 6,
                            }}
                          >
                            Эмч
                          </th>
                          <th
                            style={{
                              textAlign: "left",
                              borderBottom: "1px solid #e5e7eb",
                              padding: 6,
                            }}
                          >
                            Төлөв
                          </th>
                          <th
                            style={{
                              textAlign: "left",
                              borderBottom: "1px solid #e5e7eb",
                              padding: 6,
                            }}
                          >
                            Тэмдэглэл
                          </th>
                          <th
                            style={{
                              textAlign: "left",
                              borderBottom: "1px solid #e5e7eb",
                              padding: 6,
                            }}
                          >
                            Үйлдэл
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedAppointments.map((a) => (
                          <tr key={a.id}>
                            <td
                              style={{
                                borderBottom: "1px solid #f3f4f6",
                                padding: 6,
                              }}
                            >
                              {formatDateTime(a.scheduledAt)}
                            </td>
                            <td
                              style={{
                                borderBottom: "1px solid #f3f4f6",
                                padding: 6,
                              }}
                            >
                              {a.branch?.name || "-"}
                            </td>
                            <td
                              style={{
                                borderBottom: "1px solid #f3f4f6",
                                padding: 6,
                              }}
                            >
                              {formatDoctorName(a.doctor)}
                            </td>
                            <td
                              style={{
                                borderBottom: "1px solid #f3f4f6",
                                padding: 6,
                              }}
                            >
                              {a.status}
                            </td>
                            <td
                              style={{
                                borderBottom: "1px solid #f3f4f6",
                                padding: 6,
                              }}
                            >
                              {displayOrDash(a.notes ?? null)}
                            </td>
                            <td
                              style={{
                                borderBottom: "1px solid #f3f4f6",
                                padding: 6,
                              }}
                            >
                              {a.status === "completed" && (
                                <button
                                  onClick={() => {
                                    setReportAppointmentId(a.id);
                                    setReportModalOpen(true);
                                  }}
                                  style={{
                                    padding: "4px 8px",
                                    fontSize: 12,
                                    background: "#3b82f6",
                                    color: "white",
                                    border: "none",
                                    borderRadius: 4,
                                    cursor: "pointer",
                                  }}
                                >
                                  Үзэх
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === "patient_history" && patient && pb && (
                <PatientHistoryBook
                  patient={patient}
                  patientBook={pb}
                  visitCard={data?.visitCard}
                  encounters={encounters || []}
                />
              )}

              {activeTab === "visit_card" && (
                <>
                  {/* Type selector for adult vs child */}
                  <div
                    style={{
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      padding: 12,
                      background: "white",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        marginBottom: 8,
                      }}
                    >
                      Үзлэгийн картын төрөл
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 20,
                        alignItems: "center",
                        fontSize: 13,
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <input
                          type="radio"
                          name="visitCardType"
                          value="ADULT"
                          checked={visitCardTypeDraft === "ADULT"}
                          onChange={() => handleTypeChange("ADULT")}
                        />
                        <span>Үзлэгийн карт (Том хүн)</span>
                      </label>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <input
                          type="radio"
                          name="visitCardType"
                          value="CHILD"
                          checked={visitCardTypeDraft === "CHILD"}
                          onChange={() => handleTypeChange("CHILD")}
                        />
                        <span>Үзлэгийн карт (Хүүхэд)</span>
                      </label>
                    </div>

                    {visitCardLoading && (
                      <div style={{ fontSize: 13, marginTop: 8 }}>
                        Үзлэгийн карт ачааллаж байна...
                      </div>
                    )}

                    {!visitCardLoading && visitCardError && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#b91c1c",
                          marginTop: 8,
                        }}
                      >
                        {visitCardError}
                      </div>
                    )}
                  </div>

                  {/* Render only one form depending on visitCardTypeDraft */}
                  {(visitCardTypeDraft ?? "ADULT") === "ADULT" ? (
                    <div
                      style={{
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        padding: 16,
                        background: "white",
                        marginTop: 16,
                        marginBottom: 16,
                      }}
                    >
                      <h2
                        style={{
                          fontSize: 16,
                          marginTop: 0,
                          marginBottom: 12,
                        }}
                      >
                        Үзлэгийн карт (Том хүн)
                      </h2>

                      {!visitCardLoading && (
                        <>
                          {/* Урьдчилан сэргийлэх асуумж */}
                          <PreventativeQuestionnaire
                            answers={visitCardAnswers}
                            updateNested={updateNested}
                            updateVisitCardAnswer={updateVisitCardAnswer}
                            radioNamePrefix="adult_"
                          />

                          {/* 3) Ерөнхий биеийн талаархи асуумж + Харшил + Зуршил */}
                          <section style={{ marginTop: 16 }}>
                            <h3
                              style={{
                                fontSize: 14,
                                margin: 0,
                                marginBottom: 8,
                              }}
                            >
                              Ерөнхий биеийн талаархи асуумж
                            </h3>

                            <table
                              style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                fontSize: 13,
                              }}
                            >
                              <thead>
                                <tr>
                                  <th
                                    style={{
                                      textAlign: "left",
                                      borderBottom:
                                        "1px solid #e5e7eb",
                                      padding: 6,
                                    }}
                                  >
                                    Асуумж
                                  </th>
                                  <th
                                    style={{
                                      textAlign: "center",
                                      borderBottom:
                                        "1px solid #e5e7eb",
                                      padding: 6,
                                      width: 60,
                                    }}
                                  >
                                    Үгүй
                                  </th>
                                  <th
                                    style={{
                                      textAlign: "center",
                                      borderBottom:
                                        "1px solid #e5e7eb",
                                      padding: 6,
                                      width: 100,
                                    }}
                                  >
                                    Тийм
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {/* ---- Ерөнхий бие ---- */}
                                {([
                                  ["heartDisease", "Зүрх судасны өвчтэй эсэх"],
                                  [
                                    "highBloodPressure",
                                    "Даралт ихсэх өвчтэй эсэх",
                                  ],
                                  [
                                    "infectiousDisease",
                                    "Халдварт өвчний түүхтэй эсэх",
                                  ],
                                  [
                                    "tuberculosis",
                                    "Сүрьеэ өвчнөөр өвчилж байсан эсэх",
                                  ],
                                  [
                                    "hepatitisBC",
                                    "Халдварт гепатит B, C‑сээр өвдөж байсан эсэх",
                                  ],
                                  ["diabetes", "Чихрийн шижинтэй эсэх"],
                                  [
                                    "onMedication",
                                    "Одоо хэрэглэж байгаа эм, тариа байгаа эсэх",
                                  ],
                                  [
                                    "seriousIllnessOrSurgery",
                                    "Ойрын 5 жилд хүнд өвчнөөр өвчилсөн болон мэс ажилбар хийлгэж байсан эсэх",
                                  ],
                                  ["implant", "Зүрхний импланттай эсэх"],
                                  [
                                    "generalAnesthesia",
                                    "Бүтэн наркоз хийлгэж байсан эсэх",
                                  ],
                                  [
                                    "chemoOrRadiation",
                                    "Хими / туяа эмчилгээ хийлгэж байгаа эсэх",
                                  ],
                                ] as const).map(([key, label]) => {
                                  const value =
                                    visitCardAnswers.generalMedical?.[
                                      key as keyof VisitCardAnswers["generalMedical"]
                                    ];
                                  const detailKey = `${key}Detail`;
                                  const detailValue =
                                    (visitCardAnswers.generalMedical as any)?.[
                                      detailKey
                                    ] || "";
                                  return (
                                    <React.Fragment key={key}>
                                      <tr>
                                        <td
                                          style={{
                                            borderBottom:
                                              "1px solid #f3f4f6",
                                            padding: 6,
                                          }}
                                        >
                                          {label}
                                        </td>
                                        <td
                                          style={{
                                            textAlign: "center",
                                            borderBottom:
                                              "1px solid #f3f4f6",
                                            padding: 6,
                                          }}
                                        >
                                          <input
                                            type="radio"
                                            name={`gm_${key}`}
                                            checked={value !== "yes"}
                                            onChange={() =>
                                              updateNested(
                                                "generalMedical",
                                                key,
                                                "no"
                                              )
                                            }
                                          />
                                        </td>
                                        <td
                                          style={{
                                            textAlign: "center",
                                            borderBottom:
                                              "1px solid #f3f4f6",
                                            padding: 6,
                                          }}
                                        >
                                          <input
                                            type="radio"
                                            name={`gm_${key}`}
                                            checked={value === "yes"}
                                            onChange={() =>
                                              updateNested(
                                                "generalMedical",
                                                key,
                                                "yes"
                                              )
                                            }
                                          />
                                        </td>
                                      </tr>
                                      {value === "yes" && (
                                        <tr>
                                          <td
                                            colSpan={3}
                                            style={{
                                              borderBottom:
                                                "1px solid #f3f4f6",
                                              padding:
                                                "0 6px 6px 6px",
                                            }}
                                          >
                                            <input
                                              placeholder="Тайлбар / дэлгэрэнгүй"
                                              value={detailValue}
                                              onChange={(e) =>
                                                updateNested(
                                                  "generalMedical",
                                                  detailKey,
                                                  e.target.value
                                                )
                                              }
                                              style={{
                                                width: "100%",
                                                borderRadius: 6,
                                                border:
                                                  "1px solid #d1d5db",
                                                padding: "4px 6px",
                                              }}
                                            />
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}

                                {/* ---- Харшил (title row) ---- */}
                                <tr>
                                  <td
                                    colSpan={3}
                                    style={{
                                      padding: 6,
                                      background: "#f9fafb",
                                      fontWeight: 500,
                                      borderTop:
                                        "1px solid #e5e7eb",
                                      borderBottom:
                                        "1px solid #e5e7eb",
                                    }}
                                  >
                                    Харшил
                                  </td>
                                </tr>

                                {([
                                  ["drug", "Эм тариа"],
                                  ["metal", "Метал"],
                                  [
                                    "localAnesthetic",
                                    "Шүдний мэдээ алдуулах тариа",
                                  ],
                                  ["latex", "Латекс"],
                                  ["other", "Бусад"],
                                ] as const).map(([key, label]) => {
                                  const value =
                                    visitCardAnswers.allergies?.[
                                      key as keyof VisitCardAnswers["allergies"]
                                    ];
                                  const detailKey =
                                    key === "other"
                                      ? "otherDetail"
                                      : `${key}Detail`;
                                  const detailValue =
                                    (visitCardAnswers.allergies as any)?.[
                                      detailKey
                                    ] || "";
                                  const isYes = value === "yes";
                                  const isNo = value !== "yes";
                                  return (
                                    <React.Fragment key={key}>
                                      <tr>
                                        <td
                                          style={{
                                            borderBottom:
                                              "1px solid #f3f4f6",
                                            padding: 6,
                                          }}
                                        >
                                          {label}
                                        </td>
                                        <td
                                          style={{
                                            textAlign: "center",
                                            borderBottom:
                                              "1px solid #f3f4f6",
                                            padding: 6,
                                          }}
                                        >
                                          <input
                                            type="radio"
                                            name={`allergy_${key}`}
                                            checked={isNo}
                                            onChange={() =>
                                              updateNested(
                                                "allergies",
                                                key,
                                                "no"
                                              )
                                            }
                                          />
                                        </td>
                                        <td
                                          style={{
                                            textAlign: "center",
                                            borderBottom:
                                              "1px solid #f3f4f6",
                                            padding: 6,
                                          }}
                                        >
                                          <input
                                            type="radio"
                                            name={`allergy_${key}`}
                                            checked={isYes}
                                            onChange={() =>
                                              updateNested(
                                                "allergies",
                                                key,
                                                "yes"
                                              )
                                            }
                                          />
                                        </td>
                                      </tr>
                                      {isYes && (
                                        <tr>
                                          <td
                                            colSpan={3}
                                            style={{
                                              borderBottom:
                                                "1px solid #f3f4f6",
                                              padding:
                                                "0 6px 6px 6px",
                                            }}
                                          >
                                            <input
                                              placeholder="Тайлбар / дэлгэрэнгүй"
                                              value={detailValue}
                                              onChange={(e) =>
                                                updateNested(
                                                  "allergies",
                                                  detailKey,
                                                  e.target.value
                                                )
                                              }
                                              style={{
                                                width: "100%",
                                                borderRadius: 6,
                                                border:
                                                  "1px solid #d1d5db",
                                                padding: "4px 6px",
                                              }}
                                            />
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}

                                {/* ---- Зуршил (title row) ---- */}
                                <tr>
                                  <td
                                    colSpan={3}
                                    style={{
                                      padding: 6,
                                      background: "#f9fafb",
                                      fontWeight: 500,
                                      borderTop:
                                        "1px solid #e5e7eb",
                                      borderBottom:
                                        "1px solid #e5e7eb",
                                    }}
                                  >
                                    Зуршил
                                  </td>
                                </tr>

                                {([
                                  ["smoking", "Тамхи татдаг эсэх"],
                                  ["alcohol", "Архи хэрэглэдэг эсэх"],
                                  ["coffee", "Кофе хэрэглэдэг эсэх"],
                                  ["other", "Бусад"],
                                ] as const).map(([key, label]) => {
                                  const value =
                                    visitCardAnswers.habits?.[
                                      key as keyof VisitCardAnswers["habits"]
                                    ];
                                  const isYes = value === "yes";
                                  const isNo = value !== "yes";

                                  const detailKey =
                                    key === "other"
                                      ? "otherDetail"
                                      : (`${key}Detail` as const);
                                  const detailValue =
                                    (visitCardAnswers.habits as any)?.[
                                      detailKey
                                    ] || "";

                                  return (
                                    <React.Fragment key={key}>
                                      <tr>
                                        <td
                                          style={{
                                            borderBottom:
                                              "1px solid #f3f4f6",
                                            padding: 6,
                                          }}
                                        >
                                          {label}
                                        </td>
                                        <td
                                          style={{
                                            textAlign: "center",
                                            borderBottom:
                                              "1px solid #f3f4f6",
                                            padding: 6,
                                          }}
                                        >
                                          <input
                                            type="radio"
                                            name={`habit_${key}`}
                                            checked={isNo}
                                            onChange={() => {
                                              updateNested(
                                                "habits",
                                                key,
                                                "no"
                                              );
                                              updateNested(
                                                "habits",
                                                detailKey,
                                                ""
                                              );
                                            }}
                                          />
                                        </td>
                                        <td
                                          style={{
                                            textAlign: "center",
                                            borderBottom:
                                              "1px solid #f3f4f6",
                                            padding: 6,
                                          }}
                                        >
                                          <input
                                            type="radio"
                                            name={`habit_${key}`}
                                            checked={isYes}
                                            onChange={() =>
                                              updateNested(
                                                "habits",
                                                key,
                                                "yes"
                                              )
                                            }
                                          />
                                        </td>
                                      </tr>

                                      {isYes && (
                                        <tr>
                                          <td
                                            colSpan={3}
                                            style={{
                                              borderBottom:
                                                "1px solid #f3f4f6",
                                              padding:
                                                "0 6px 6px 6px",
                                            }}
                                          >
                                            <input
                                              placeholder={
                                                key === "other"
                                                  ? "Бусад зуршил"
                                                  : "Тайлбар / дэлгэрэнгүй"
                                              }
                                              value={detailValue}
                                              onChange={(e) =>
                                                updateNested(
                                                  "habits",
                                                  detailKey,
                                                  e.target.value
                                                )
                                              }
                                              style={{
                                                width: "100%",
                                                borderRadius: 6,
                                                border:
                                                  "1px solid #d1d5db",
                                                padding: "4px 6px",
                                              }}
                                            />
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}

                                {/* ---- Нэмэлт ---- */}
                                <tr>
                                  <td
                                    colSpan={3}
                                    style={{
                                      padding: 6,
                                      background: "#f9fafb",
                                      fontWeight: 500,
                                      borderTop:
                                        "1px solid #e5e7eb",
                                      borderBottom:
                                        "1px solid #e5e7eb",
                                    }}
                                  >
                                    Нэмэлт
                                  </td>
                                </tr>

                                {([
                                  [
                                    "regularCheckups",
                                    "Шүдний эмчид байнга үзүүлдэг эсэх",
                                  ],
                                  [
                                    "bleedingAfterExtraction",
                                    "Шүд авахуулсны дараа цус тогтол удаан эсэх",
                                  ],
                                  ["gumBleeding", "Буйлнаас цус гардаг эсэх"],
                                  ["badBreath", "Амнаас эвгүй үнэр гардаг эсэх"],
                                ] as const).map(([key, label]) => {
                                  const value =
                                    visitCardAnswers.dentalFollowup?.[
                                      key as keyof VisitCardAnswers["dentalFollowup"]
                                    ];
                                  const isYes = value === "yes";
                                  const isNo = value !== "yes";

                                  const detailKey =
                                    `${key}Detail` as keyof VisitCardAnswers["dentalFollowup"];
                                  const detailValue =
                                    (visitCardAnswers.dentalFollowup as any)?.[
                                      detailKey
                                    ] || "";

                                  return (
                                    <React.Fragment key={key}>
                                      <tr>
                                        <td
                                          style={{
                                            borderBottom:
                                              "1px solid #f3f4f6",
                                            padding: 6,
                                          }}
                                        >
                                          {label}
                                        </td>
                                        <td
                                          style={{
                                            textAlign: "center",
                                            borderBottom:
                                              "1px solid #f3f4f6",
                                            padding: 6,
                                          }}
                                        >
                                          <input
                                            type="radio"
                                            name={`dental_${key}`}
                                            checked={isNo}
                                            onChange={() => {
                                              updateNested(
                                                "dentalFollowup",
                                                key,
                                                "no"
                                              );
                                              updateNested(
                                                "dentalFollowup",
                                                detailKey,
                                                ""
                                              );
                                            }}
                                          />
                                        </td>
                                        <td
                                          style={{
                                            textAlign: "center",
                                            borderBottom:
                                              "1px solid #f3f4f6",
                                            padding: 6,
                                          }}
                                        >
                                          <input
                                            type="radio"
                                            name={`dental_${key}`}
                                            checked={isYes}
                                            onChange={() =>
                                              updateNested(
                                                "dentalFollowup",
                                                key,
                                                "yes"
                                              )
                                            }
                                          />
                                        </td>
                                      </tr>

                                      {isYes && (
                                        <tr>
                                          <td
                                            colSpan={3}
                                            style={{
                                              borderBottom:
                                                "1px solid #f3f4f6",
                                              padding:
                                                "0 6px 6px 6px",
                                            }}
                                          >
                                            <input
                                              placeholder="Тайлбар / дэлгэрэнгүй"
                                              value={detailValue}
                                              onChange={(e) =>
                                                updateNested(
                                                  "dentalFollowup",
                                                  detailKey as string,
                                                  e.target.value
                                                )
                                              }
                                              style={{
                                                width: "100%",
                                                borderRadius: 6,
                                                border:
                                                  "1px solid #d1d5db",
                                                padding: "4px 6px",
                                              }}
                                            />
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </section>

                          {/* Adult consent/information text block */}
                          <section style={{ marginTop: 16, fontSize: 13 }}>
                            <div style={{ marginBottom: 8 }}>
                              Та доорхи таниулсан зөвшөөрлийг бүрэн уншиж
                              танилцана уу
                            </div>
                            <ol
                              style={{
                                paddingLeft: 18,
                                margin: 0,
                                marginBottom: 8,
                              }}
                            >
                              <li style={{ marginBottom: 4 }}>
                                Манай эмнэлгийн <strong>7715-1551</strong> утсаар
                                болон биечлэн уулзаж эмчилгээ хийлгэх цагаа
                                урьдчилан захиална.
                              </li>
                              <li style={{ marginBottom: 4 }}>
                                Таньд анхны үзлэгээр эмчилгээний төлөвлөгөө,
                                төлбөрийн баримжаа, цаашид хийгдэх эмчилгээний
                                үр дүнгийн талаар эмч урьдчилан мэдээллэх үүрэгтэй.
                              </li>
                              <li style={{ marginBottom: 4 }}>
                                Давтан ирэх шаардлагатай эмчилгээнд эмчийн
                                тогтоосон өдөр та ирэх үүрэгтэй ба хугацаандаа
                                ирээгүйн улмаас эмчилгээ дахих, цаг хугацаа
                                алдах, дахин төлбөр төлөх зэрэг асуудал гардаг
                                ба тухайн асуудлыг үйлчлүүлэгч өөрөө хариуцна.
                              </li>
                              <li style={{ marginBottom: 4 }}>
                                Сувгийн эмчилгээ нь тухайн шүдний үрэвслийн
                                байдал, тойрон эдийн эдгэрэлт зэргээс хамаарч 2
                                болон түүнээс дээш удаагийн ирэлтээр хийгддэг.
                              </li>
                              <li style={{ marginBottom: 4 }}>
                                Та хүндэтгэх шалтгааны улмаас товлосон үзлэгийн
                                цагтаа ирэх боломжгүй болсон тохиолдолд урьдчилан
                                манай эмнэлгийн <strong>7715-1551</strong>{" "}
                                утсанд мэдэгдэнэ үү. Ингэснээр таны эмчилгээ үр
                                дүнгүй болох зэрэг таагүй байдлаас та урьдчилан
                                сэргийлэх боломжтой болно.
                              </li>
                              <li style={{ marginBottom: 4 }}>
                                Та хийлгэсэн эмчилгээний дараахь эмчийн хэлсэн
                                заавар зөвлөмжийг дагаж биелүүлэх үүрэгтэй ба
                                ингэснээр эмчилгээ үр дүнгүй болох, дараачийн
                                хүндрэлүүд үүсэх зэрэг асуудлаас өөрийгөө
                                сэргийлж байгаа юм.
                              </li>
                              <li style={{ marginBottom: 4 }}>
                                Манай эмнэлэгт хэрэглэгдэж буй нэг удаагийн
                                зүүний лацны бүрэн бүтэн, аюулгүй байдалд та
                                давхар хяналт тавих эрхтэй.
                              </li>
                              <li style={{ marginBottom: 4 }}>
                                Гоо заслын эмчилгээнээс бусад ломбонд таныг
                                эмчлэгч эмч <strong>1 жилийн баталгаа</strong>{" "}
                                олгоно.
                              </li>
                            </ol>
                          </section>

                        </>
                      )}
                    </div>
                  ) : (
                    <div style={{ marginTop: 16 }}>
                      <ChildVisitCardForm
                        answers={visitCardAnswers}
                        updateVisitCardAnswer={(
                          key: keyof VisitCardAnswers,
                          value: VisitCardAnswers[keyof VisitCardAnswers]
                        ) => updateVisitCardAnswer(key, value as any)}
                        updateNested={(
                          section: string,
                          field: string,
                          value: any
                        ) =>
                          updateNested(
                            section as keyof VisitCardAnswers,
                            field,
                            value
                          )
                        }
                      />
                    </div>
                  )}
                  
                  {/* Shared Consent and Signature Section */}
                  <SharedConsentAndSignature
                    sharedSignature={sharedSignature}
                    sharedSignatureLoading={sharedSignatureLoading}
                    signatureSaving={signatureSaving}
                    consentAccepted={visitCardAnswers.sharedConsentAccepted || false}
                    onConsentChange={(accepted) => 
                      updateVisitCardAnswer("sharedConsentAccepted", accepted)
                    }
                    onSaveSignature={handleUploadSharedSignature}
                    formatDate={formatDate}
                  />

                  {/* Shared Save Button */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      marginTop: 16,
                    }}
                  >
                    <button
                      type="button"
                      onClick={handleSaveVisitCard}
                      disabled={visitCardSaving}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: "none",
                        background: visitCardSaving ? "#9ca3af" : "#2563eb",
                        color: "#ffffff",
                        fontSize: 13,
                        cursor: visitCardSaving ? "default" : "pointer",
                      }}
                    >
                      {visitCardSaving ? "Хадгалж байна..." : "Хадгалах"}
                    </button>
                  </div>
                </>
              )}

              {activeTab === "ortho_card" && (
                <div
                  style={{
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    padding: 16,
                    background: "white",
                  }}
                >
                  <h2
                    style={{
                      fontSize: 16,
                      marginTop: 0,
                      marginBottom: 12,
                    }}
                  >
                    Гажиг заслын карт
                  </h2>
                  <OrthoCardView />
                </div>
              )}
            </div>
          </section>

         

          {/* Encounter history and inline appointments table shown only in profile tab */}
          {activeTab === "profile" && (
            <>
              {/* Encounter history table */}
              <section style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 16, marginBottom: 8 }}>
                  Үзлэгийн түүх (Encounters)
                </h2>
                {encounters.length === 0 ? (
                  <div style={{ color: "#6b7280", fontSize: 13 }}>
                    Одоогоор бүртгэлтэй үзлэг алга.
                  </div>
                ) : (
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 13,
                    }}
                  >
                    <thead>
                      <tr>
                        <th
                          style={{
                            textAlign: "left",
                            borderBottom: "1px solid #e5e7eb",
                            padding: 6,
                          }}
                        >
                          Огноо
                        </th>
                        <th
                          style={{
                            textAlign: "left",
                            borderBottom: "1px solid #e5e7eb",
                            padding: 6,
                          }}
                        >
                          Тэмдэглэл
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {encounters.map((e) => (
                        <tr key={e.id}>
                          <td
                            style={{
                              borderBottom: "1px solid #f3f4f6",
                              padding: 6,
                            }}
                          >
                            {formatDateTime(e.visitDate)}
                          </td>
                          <td
                            style={{
                              borderBottom: "1px solid #f3f4f6",
                              padding: 6,
                            }}
                          >
                            {displayOrDash(e.notes ?? null)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              {/* Original appointments list (can be removed later if redundant) */}
              <section>
                <h2 style={{ fontSize: 16, marginBottom: 8 }}>
                  Цаг захиалгууд (Appointments)
                </h2>
                {appointments.length === 0 ? (
                  <div style={{ color: "#6b7280", fontSize: 13 }}>
                    Цаг захиалгын бүртгэл алга.
                  </div>
                ) : (
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 13,
                    }}
                  >
                    <thead>
                      <tr>
                        <th
                          style={{
                            textAlign: "left",
                            borderBottom: "1px solid #e5e7eb",
                            padding: 6,
                          }}
                        >
                          Огноо / цаг
                        </th>
                        <th
                          style={{
                            textAlign: "left",
                            borderBottom: "1px solid #e5e7eb",
                            padding: 6,
                          }}
                        >
                          Салбар
                        </th>
                        <th
                          style={{
                            textAlign: "left",
                            borderBottom: "1px solid #e5e7eb",
                            padding: 6,
                          }}
                        >
                          Эмч
                        </th>
                        <th
                          style={{
                            textAlign: "left",
                            borderBottom: "1px solid #e5e7eb",
                            padding: 6,
                          }}
                        >
                          Төлөв
                        </th>
                        <th
                          style={{
                            textAlign: "left",
                            borderBottom: "1px solid #e5e7eb",
                            padding: 6,
                          }}
                        >
                          Тэмдэглэл
                        </th>
                        <th
                          style={{
                            textAlign: "left",
                            borderBottom: "1px solid #e5e7eb",
                            padding: 6,
                          }}
                        >
                          Үйлдэл
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {appointments
                        .slice()
                        .sort((a, b) =>
                          a.scheduledAt.localeCompare(b.scheduledAt)
                        )
                        .map((a) => (
                          <tr key={a.id}>
                            <td
                              style={{
                                borderBottom: "1px solid #f3f4f6",
                                padding: 6,
                              }}
                            >
                              {formatDateTime(a.scheduledAt)}
                            </td>
                            <td
                              style={{
                                borderBottom: "1px solid #f3f4f6",
                                padding: 6,
                              }}
                            >
                              {a.branch?.name || "-"}
                            </td>
                            <td
                              style={{
                                borderBottom: "1px solid #f3f4f6",
                                padding: 6,
                              }}
                            >
                              {formatDoctorName(a.doctor)}
                            </td>
                            <td
                              style={{
                                borderBottom: "1px solid #f3f4f6",
                                padding: 6,
                              }}
                            >
                              {a.status}
                            </td>
                            <td
                              style={{
                                borderBottom: "1px solid #f3f4f6",
                                padding: 6,
                              }}
                            >
                              {displayOrDash(a.notes ?? null)}
                            </td>
                            <td
                              style={{
                                borderBottom: "1px solid #f3f4f6",
                                padding: 6,
                              }}
                            >
                              {a.status === "completed" && (
                                <button
                                  onClick={() => {
                                    setReportAppointmentId(a.id);
                                    setReportModalOpen(true);
                                  }}
                                  style={{
                                    padding: "4px 8px",
                                    fontSize: 12,
                                    background: "#3b82f6",
                                    color: "white",
                                    border: "none",
                                    borderRadius: 4,
                                    cursor: "pointer",
                                  }}
                                >
                                  Үзэх
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          )}
        </>
      )}

      {/* Encounter Report Modal */}
      <EncounterReportModal
        open={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          setReportAppointmentId(null);
        }}
        appointmentId={reportAppointmentId}
      />
    </main>
  );
}
