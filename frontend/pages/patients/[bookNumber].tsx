import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { formatStatus } from "../../components/appointments/formatters";
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

  // regNo autofill state: true means regNo parsed as valid -> lock birthDate/gender
  const [regNoAutofillLocked, setRegNoAutofillLocked] = useState(false);
  const regNoParseAbortRef = useRef<AbortController | null>(null);

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

  // Compute age in full years from a YYYY-MM-DD string; returns "-" if invalid
  const computeAge = (birthDateStr: string | null | undefined): string => {
    if (!birthDateStr) return "-";
    const d = new Date(birthDateStr);
    if (Number.isNaN(d.getTime())) return "-";
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const monthDiff = today.getMonth() - d.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d.getDate())) {
      age -= 1;
    }
    if (age < 0) return "-";
    return String(age);
  };

  // Trigger regNo parse whenever regNo changes in edit mode
  const parseRegNo = useCallback(async (regNoValue: string) => {
    // Cancel previous in-flight request
    if (regNoParseAbortRef.current) {
      regNoParseAbortRef.current.abort();
    }
    const trimmed = regNoValue.trim();
    if (!trimmed) {
      setRegNoAutofillLocked(false);
      return;
    }
    const controller = new AbortController();
    regNoParseAbortRef.current = controller;
    try {
      const res = await fetch(
        `/api/regno/parse?regNo=${encodeURIComponent(trimmed)}`,
        { signal: controller.signal }
      );
      const json = await res.json();
      if (json.isValid) {
        setEditForm((prev) => ({
          ...prev,
          birthDate: json.birthDate,
          gender: json.gender,
        }));
        setRegNoAutofillLocked(true);
      } else {
        setRegNoAutofillLocked(false);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setRegNoAutofillLocked(false);
    }
  }, []);

  const startEdit = () => {
    if (!patient) return;
    const initialRegNo = patient.regNo || "";
    setEditForm({
      ovog: patient.ovog || "",
      name: patient.name || "",
      regNo: initialRegNo,
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
    setRegNoAutofillLocked(false);
    setEditMode(true);
    // Parse the existing regNo on edit start so lock state is correct
    if (initialRegNo) {
      parseRegNo(initialRegNo);
    }
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditForm({});
    setRegNoAutofillLocked(false);
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
    if (name === "regNo") {
      parseRegNo(value);
    }
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
        const errMsg = (json && json.error) || "";
        if (
          errMsg.toLowerCase().includes("regno") ||
          errMsg.toLowerCase().includes("already registered")
        ) {
          throw new Error(
            "Энэ регистрийн дугаар өөр өвчтөнд бүртгэлтэй байна. Өөр РД оруулна уу."
          );
        }
        throw new Error(errMsg || "Өгөгдөл хадгалах үед алдаа гарлаа");
      }

      const updatedPatient = (json && json.patient) || json || patient;
      // Call refetch to reload the whole patient profile with updated data
      refetch();

      setSaveSuccess("Мэдээлэл амжилттай хадгалагдлаа.");
      setEditMode(false);
      setRegNoAutofillLocked(false);
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

  const tabBtnClass = (tab: ActiveTab) =>
    activeTab === tab
      ? "w-full text-left px-2.5 py-1.5 rounded-md border-0 bg-blue-50 text-blue-700 font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
      : "w-full text-left px-2.5 py-1.5 rounded-md border-0 bg-transparent text-gray-500 cursor-pointer hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

  const inputClass = "w-full rounded-md border border-gray-300 px-1.5 py-1 text-sm";

  return (
    <main className="max-w-7xl px-4 lg:px-8 py-8 font-sans">
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-4 px-2 py-1 text-sm rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer"
      >
        ← Буцах
      </button>

      {loading && <div>Ачааллаж байна...</div>}
      {!loading && error && <div className="text-red-600">{error}</div>}

      {!loading && !error && patient && pb && (
        <>
          {/* Top layout: left profile panel + right content */}
          <section className="grid grid-cols-[260px_1fr] gap-4 mb-6 items-stretch">
            {/* Left: profile card + side menu */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
              <div className="mb-1 text-lg font-semibold">
                {formatDisplayName(patient)}
              </div>
              <div className="text-sm text-gray-500">
                Картын дугаар: {pb.bookNumber}
              </div>
              {patient.regNo && (
                <div className="text-sm text-gray-500">
                  РД: {patient.regNo}
                </div>
              )}
              <div className="text-sm text-gray-500">
                Утас: {displayOrDash(patient.phone)}
              </div>
              <div className="text-sm text-gray-500">
                Бүртгэсэн салбар: {patient.branch?.name || patient.branchId}
              </div>
              {patient.createdAt && (
                <div className="text-xs text-gray-400 mt-1">
                  Бүртгэсэн: {formatDate(patient.createdAt)}
                </div>
              )}

              {/* Side menu */}
              <div className="mt-4">
                <div className="text-xs uppercase text-gray-400 mb-1">
                  Цэс
                </div>
                <div className="flex flex-col gap-1 text-sm">
                  {/* Профайл */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("profile");
                      setEditMode(false);
                      setSaveError("");
                      setSaveSuccess("");
                    }}
                    className={tabBtnClass("profile")}
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
                    className={tabBtnClass("patient_history")}
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
                    className={tabBtnClass("appointments")}
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
                    className={tabBtnClass("visit_card")}
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
                    className={tabBtnClass("ortho_card")}
                  >
                    Гажиг заслын карт
                  </button>

                  {/* Future placeholders */}
                  <div className="px-2.5 py-1.5 rounded-md text-gray-500">
                    Үзлэгийн түүх
                  </div>
                  <div className="px-2.5 py-1.5 rounded-md text-gray-500">
                    Нэхэмжлэх
                  </div>
                </div>
              </div>
            </div>

            {/* Right content area: depends on activeTab */}
            <div className="flex flex-col gap-4">
              {activeTab === "profile" && (
                <>
                  {/* Summary cards row */}
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
                    {/* Encounters summary */}
                    <div className="rounded-xl border border-gray-200 p-3 bg-gray-50">
                      <div className="text-xs uppercase text-gray-500 mb-1">
                        Үзлэгүүд
                      </div>
                      <div className="text-2xl font-semibold mb-1">
                        {totalEncounters}
                      </div>
                      <div className="text-xs text-gray-500">
                        Нийт бүртгэлтэй үзлэг
                      </div>
                    </div>

                    {/* Last encounter */}
                    <div className="rounded-xl border border-gray-200 p-3 bg-gray-50">
                      <div className="text-xs uppercase text-gray-500 mb-1">
                        Сүүлийн үзлэг
                      </div>
                      <div className="text-sm font-medium mb-1">
                        {lastEncounter
                          ? formatDateTime(lastEncounter.visitDate)
                          : "-"}
                      </div>
                      <div className="text-xs text-gray-500">
                        Хамгийн сүүлд ирсэн огноо
                      </div>
                    </div>

                    {/* Appointments summary */}
                    <div className="rounded-xl border border-gray-200 p-3 bg-gray-50">
                      <div className="text-xs uppercase text-gray-500 mb-1">
                        Цаг захиалгууд
                      </div>
                      <div className="text-2xl font-semibold mb-1">
                        {totalAppointments}
                      </div>
                      <div className="text-xs text-gray-500">
                        Нийт бүртгэлтэй цаг
                      </div>
                      <div className="text-xs text-green-600 mt-1">
                        Ирэх цаг: {upcomingAppointments.length}
                      </div>
                    </div>
                  </div>

                  {/* Basic information section (editable) */}
                  <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-base font-semibold m-0">
                        Үндсэн мэдээлэл
                      </h2>
                      {!editMode ? (
                        <button
                          type="button"
                          onClick={startEdit}
                          className="text-xs px-2 py-1 rounded-md border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer"
                        >
                          Засах
                        </button>
                      ) : null}
                    </div>

                    {saveError && (
                      <div className="text-red-700 text-xs mb-2">
                        {saveError}
                      </div>
                    )}
                    {saveSuccess && (
                      <div className="text-green-700 text-xs mb-2">
                        {saveSuccess}
                      </div>
                    )}

                    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3 text-sm">
                      {/* Book number and branch (read-only) */}
                      <div>
                        <div className="text-gray-500 mb-0.5">
                          Картын дугаар
                        </div>
                        <div>{pb.bookNumber}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-0.5">
                          Бүртгэсэн салбар
                        </div>
                        <div>{patient.branch?.name || patient.branchId}</div>
                      </div>

                      {/* Ovog, Name, regNo */}
                      <div>
                        <div className="text-gray-500 mb-0.5">Овог</div>
                        {editMode ? (
                          <input
                            name="ovog"
                            value={editForm.ovog ?? ""}
                            onChange={handleEditChange}
                            className={inputClass}
                          />
                        ) : (
                          <div>{displayOrDash(patient.ovog)}</div>
                        )}
                      </div>
                      <div>
                        <div className="text-gray-500 mb-0.5">Нэр</div>
                        {editMode ? (
                          <input
                            name="name"
                            value={editForm.name ?? ""}
                            onChange={handleEditChange}
                            className={inputClass}
                          />
                        ) : (
                          <div>{patient.name}</div>
                        )}
                      </div>
                      <div>
                        <div className="text-gray-500 mb-0.5">РД</div>
                        {editMode ? (
                          <input
                            name="regNo"
                            value={editForm.regNo ?? ""}
                            onChange={handleEditChange}
                            className={inputClass}
                          />
                        ) : (
                          <div>{displayOrDash(patient.regNo)}</div>
                        )}
                      </div>

                      {/* Contact info */}
                      <div>
                        <div className="text-gray-500 mb-0.5">Утас</div>
                        {editMode ? (
                          <input
                            name="phone"
                            value={editForm.phone ?? ""}
                            onChange={handleEditChange}
                            className={inputClass}
                          />
                        ) : (
                          <div>{displayOrDash(patient.phone)}</div>
                        )}
                      </div>
                      <div>
                        <div className="text-gray-500 mb-0.5">
                          Яаралтай үед холбоо барих утас
                        </div>
                        {editMode ? (
                          <input
                            name="emergencyPhone"
                            value={editForm.emergencyPhone ?? ""}
                            onChange={handleEditChange}
                            className={inputClass}
                          />
                        ) : (
                          <div>{displayOrDash(patient.emergencyPhone)}</div>
                        )}
                      </div>
                      <div>
                        <div className="text-gray-500 mb-0.5">E-mail</div>
                        {editMode ? (
                          <input
                            name="email"
                            type="email"
                            value={editForm.email ?? ""}
                            onChange={handleEditChange}
                            className={inputClass}
                          />
                        ) : (
                          <div>{displayOrDash(patient.email)}</div>
                        )}
                      </div>
                      <div>
                        <div className="text-gray-500 mb-0.5">Ажлын газар</div>
                        {editMode ? (
                          <input
                            name="workPlace"
                            value={editForm.workPlace ?? ""}
                            onChange={handleEditChange}
                            className={inputClass}
                          />
                        ) : (
                          <div>{displayOrDash(patient.workPlace)}</div>
                        )}
                      </div>

                      {/* Dates & demographics */}
                      <div>
                        <div className="text-gray-500 mb-0.5">
                          Бүртгэсэн огноо
                        </div>
                        <div>
                          {patient.createdAt
                            ? formatDate(patient.createdAt)
                            : "-"}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-0.5">Хүйс</div>
                        {editMode ? (
                          <div>
                            <div className="flex gap-2 items-center pt-0.5">
                              <label className="flex items-center gap-1">
                                <input
                                  type="radio"
                                  name="gender"
                                  value="эр"
                                  checked={editForm.gender === "эр"}
                                  onChange={() => handleGenderChange("эр")}
                                  disabled={regNoAutofillLocked}
                                />
                                <span>Эр</span>
                              </label>
                              <label className="flex items-center gap-1">
                                <input
                                  type="radio"
                                  name="gender"
                                  value="эм"
                                  checked={editForm.gender === "эм"}
                                  onChange={() => handleGenderChange("эм")}
                                  disabled={regNoAutofillLocked}
                                />
                                <span>Эм</span>
                              </label>
                              <label className="flex items-center gap-1">
                                <input
                                  type="radio"
                                  name="gender"
                                  value=""
                                  checked={!editForm.gender}
                                  onChange={() => handleGenderChange("")}
                                  disabled={regNoAutofillLocked}
                                />
                                <span>Хоосон</span>
                              </label>
                            </div>
                            {regNoAutofillLocked && (
                              <div className="text-xs text-blue-500 mt-0.5">РД-ээс автоматаар бөглөгдөнө</div>
                            )}
                          </div>
                        ) : (
                          <div>{displayOrDash(patient.gender)}</div>
                        )}
                      </div>
                      <div>
                        <div className="text-gray-500 mb-0.5">Төрсөн огноо</div>
                        {editMode ? (
                          <div>
                            <input
                              type="date"
                              name="birthDate"
                              value={editForm.birthDate ?? ""}
                              onChange={handleEditChange}
                              disabled={regNoAutofillLocked}
                              className={inputClass}
                            />
                            {regNoAutofillLocked && (
                              <div className="text-xs text-blue-500 mt-0.5">РД-ээс автоматаар бөглөгдөнө</div>
                            )}
                          </div>
                        ) : (
                          <div>
                            {patient.birthDate
                              ? formatDate(patient.birthDate)
                              : "-"}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-gray-500 mb-0.5">Нас</div>
                        <div>
                          {editMode
                            ? computeAge(editForm.birthDate ?? null)
                            : computeAge(patient.birthDate ?? null)}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-0.5">Цусны бүлэг</div>
                        {editMode ? (
                          <input
                            name="bloodType"
                            value={editForm.bloodType ?? ""}
                            onChange={handleEditChange}
                            className={inputClass}
                          />
                        ) : (
                          <div>{displayOrDash(patient.bloodType)}</div>
                        )}
                      </div>
                      <div>
                        <div className="text-gray-500 mb-0.5">Иргэншил</div>
                        {editMode ? (
                          <input
                            name="citizenship"
                            value={editForm.citizenship ?? "Монгол"}
                            onChange={handleEditChange}
                            className={inputClass}
                          />
                        ) : (
                          <div>{displayOrDash(patient.citizenship)}</div>
                        )}
                      </div>

                      {/* Address */}
                      <div className="col-span-full">
                        <div className="text-gray-500 mb-0.5">Хаяг</div>
                        {editMode ? (
                          <input
                            name="address"
                            value={editForm.address ?? ""}
                            onChange={handleEditChange}
                            className={inputClass}
                          />
                        ) : (
                          <div>{displayOrDash(patient.address)}</div>
                        )}
                      </div>

                      {/* Notes */}
                      <div className="col-span-full">
                        <div className="text-gray-500 mb-0.5">Тэмдэглэл</div>
                        {editMode ? (
                          <textarea
                            name="notes"
                            value={editForm.notes ?? ""}
                            onChange={handleEditChange}
                            rows={3}
                            className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-sm resize-y"
                          />
                        ) : (
                          <div>{displayOrDash(patient.notes)}</div>
                        )}
                      </div>
                    </div>

                    {/* Save / Cancel buttons at bottom when in editMode */}
                    {editMode && (
                      <div className="mt-4 flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={saving}
                          className="px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-gray-50 cursor-pointer hover:bg-gray-100 disabled:cursor-default"
                        >
                          Болих
                        </button>
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={saving}
                          className={`px-3 py-1.5 text-sm rounded-md border-0 text-white ${saving ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 cursor-pointer"}`}
                        >
                          {saving ? "Хадгалж байна..." : "Хадгалах"}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeTab === "appointments" && (
                <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
                  <h2 className="text-base font-semibold mt-0 mb-3">
                    Цагууд (бүх бүртгэлтэй цагууд)
                  </h2>
                  {sortedAppointments.length === 0 ? (
                    <div className="text-sm text-gray-500">
                      Цаг захиалгын бүртгэл алга.
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700">
                            Огноо / цаг
                          </th>
                          <th className="text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700">
                            Салбар
                          </th>
                          <th className="text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700">
                            Эмч
                          </th>
                          <th className="text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700">
                            Төлөв
                          </th>
                          <th className="text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700">
                            Тэмдэглэл
                          </th>
                          <th className="text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700">
                            Үйлдэл
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedAppointments.map((a) => (
                          <tr key={a.id} className="odd:bg-white even:bg-gray-50">
                            <td className="border-b border-gray-100 py-1.5 px-2">
                              {formatDateTime(a.scheduledAt)}
                            </td>
                            <td className="border-b border-gray-100 py-1.5 px-2">
                              {a.branch?.name || "-"}
                            </td>
                            <td className="border-b border-gray-100 py-1.5 px-2">
                              {formatDoctorName(a.doctor)}
                            </td>
                            <td className="border-b border-gray-100 py-1.5 px-2">
                              {formatStatus(a.status)}
                            </td>
                            <td className="border-b border-gray-100 py-1.5 px-2">
                              {displayOrDash(a.notes ?? null)}
                            </td>
                            <td className="border-b border-gray-100 py-1.5 px-2">
                              {a.status === "completed" && (
                                <button
                                  onClick={() => {
                                    setReportAppointmentId(a.id);
                                    setReportModalOpen(true);
                                  }}
                                  className="px-2 py-1 text-xs bg-blue-500 text-white rounded cursor-pointer hover:bg-blue-600 border-0"
                                >
                                  Харах
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
                  <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-3">
                    <div className="text-sm font-semibold mb-2">
                      Үзлэгийн картын төрөл
                    </div>
                    <div className="flex gap-5 items-center text-sm">
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="visitCardType"
                          value="ADULT"
                          checked={visitCardTypeDraft === "ADULT"}
                          onChange={() => handleTypeChange("ADULT")}
                        />
                        <span>Үзлэгийн карт (Том хүн)</span>
                      </label>
                      <label className="flex items-center gap-1">
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
                      <div className="text-sm mt-2">
                        Үзлэгийн карт ачааллаж байна...
                      </div>
                    )}

                    {!visitCardLoading && visitCardError && (
                      <div className="text-xs text-red-700 mt-2">
                        {visitCardError}
                      </div>
                    )}
                  </div>

                  {/* Render only one form depending on visitCardTypeDraft */}
                  {(visitCardTypeDraft ?? "ADULT") === "ADULT" ? (
                    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4 mt-4 mb-4">
                      <h2 className="text-base font-semibold mt-0 mb-3">
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
                          <section className="mt-4">
                            <h3 className="text-sm font-semibold m-0 mb-2">
                              Ерөнхий биеийн талаархи асуумж
                            </h3>

                            <table className="w-full border-collapse text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="text-left border-b border-gray-200 py-2 px-1.5 font-semibold text-gray-700">
                                    Асуумж
                                  </th>
                                  <th className="text-center border-b border-gray-200 py-2 px-1.5 font-semibold text-gray-700 w-16">
                                    Үгүй
                                  </th>
                                  <th className="text-center border-b border-gray-200 py-2 px-1.5 font-semibold text-gray-700 w-24">
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
                                      <tr className="odd:bg-white even:bg-gray-50">
                                        <td className="border-b border-gray-100 py-1.5 px-1.5">
                                          {label}
                                        </td>
                                        <td className="text-center border-b border-gray-100 py-1.5 px-1.5">
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
                                        <td className="text-center border-b border-gray-100 py-1.5 px-1.5">
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
                                            className="border-b border-gray-100 px-1.5 pb-1.5"
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
                                              className={inputClass}
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
                                    className="p-1.5 bg-gray-50 font-medium border-y border-gray-200"
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
                                      <tr className="odd:bg-white even:bg-gray-50">
                                        <td className="border-b border-gray-100 py-1.5 px-1.5">
                                          {label}
                                        </td>
                                        <td className="text-center border-b border-gray-100 py-1.5 px-1.5">
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
                                        <td className="text-center border-b border-gray-100 py-1.5 px-1.5">
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
                                            className="border-b border-gray-100 px-1.5 pb-1.5"
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
                                              className={inputClass}
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
                                    className="p-1.5 bg-gray-50 font-medium border-y border-gray-200"
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
                                      <tr className="odd:bg-white even:bg-gray-50">
                                        <td className="border-b border-gray-100 py-1.5 px-1.5">
                                          {label}
                                        </td>
                                        <td className="text-center border-b border-gray-100 py-1.5 px-1.5">
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
                                        <td className="text-center border-b border-gray-100 py-1.5 px-1.5">
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
                                            className="border-b border-gray-100 px-1.5 pb-1.5"
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
                                              className={inputClass}
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
                                    className="p-1.5 bg-gray-50 font-medium border-y border-gray-200"
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
                                      <tr className="odd:bg-white even:bg-gray-50">
                                        <td className="border-b border-gray-100 py-1.5 px-1.5">
                                          {label}
                                        </td>
                                        <td className="text-center border-b border-gray-100 py-1.5 px-1.5">
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
                                        <td className="text-center border-b border-gray-100 py-1.5 px-1.5">
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
                                            className="border-b border-gray-100 px-1.5 pb-1.5"
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
                                              className={inputClass}
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
                          <section className="mt-4 text-sm">
                            <div className="mb-2">
                              Та доорхи таниулсан зөвшөөрлийг бүрэн уншиж
                              танилцана уу
                            </div>
                            <ol className="pl-[18px] m-0 mb-2 space-y-1">
                              <li>
                                Манай эмнэлгийн <strong>7715-1551</strong> утсаар
                                болон биечлэн уулзаж эмчилгээ хийлгэх цагаа
                                урьдчилан захиална.
                              </li>
                              <li>
                                Таньд анхны үзлэгээр эмчилгээний төлөвлөгөө,
                                төлбөрийн баримжаа, цаашид хийгдэх эмчилгээний
                                үр дүнгийн талаар эмч урьдчилан мэдээллэх үүрэгтэй.
                              </li>
                              <li>
                                Давтан ирэх шаардлагатай эмчилгээнд эмчийн
                                тогтоосон өдөр та ирэх үүрэгтэй ба хугацаандаа
                                ирээгүйн улмаас эмчилгээ дахих, цаг хугацаа
                                алдах, дахин төлбөр төлөх зэрэг асуудал гардаг
                                ба тухайн асуудлыг үйлчлүүлэгч өөрөө хариуцна.
                              </li>
                              <li>
                                Сувгийн эмчилгээ нь тухайн шүдний үрэвслийн
                                байдал, тойрон эдийн эдгэрэлт зэргээс хамаарч 2
                                болон түүнээс дээш удаагийн ирэлтээр хийгддэг.
                              </li>
                              <li>
                                Та хүндэтгэх шалтгааны улмаас товлосон үзлэгийн
                                цагтаа ирэх боломжгүй болсон тохиолдолд урьдчилан
                                манай эмнэлгийн <strong>7715-1551</strong>{" "}
                                утсанд мэдэгдэнэ үү. Ингэснээр таны эмчилгээ үр
                                дүнгүй болох зэрэг таагүй байдлаас та урьдчилан
                                сэргийлэх боломжтой болно.
                              </li>
                              <li>
                                Та хийлгэсэн эмчилгээний дараахь эмчийн хэлсэн
                                заавар зөвлөмжийг дагаж биелүүлэх үүрэгтэй ба
                                ингэснээр эмчилгээ үр дүнгүй болох, дараачийн
                                хүндрэлүүд үүсэх зэрэг асуудлаас өөрийгөө
                                сэргийлж байгаа юм.
                              </li>
                              <li>
                                Манай эмнэлэгт хэрэглэгдэж буй нэг удаагийн
                                зүүний лацны бүрэн бүтэн, аюулгүй байдалд та
                                давхар хяналт тавих эрхтэй.
                              </li>
                              <li>
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
                    <div className="mt-4">
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
                  <div className="flex justify-end mt-4">
                    <button
                      type="button"
                      onClick={handleSaveVisitCard}
                      disabled={visitCardSaving}
                      className={`px-3 py-1.5 text-sm rounded-md border-0 text-white ${visitCardSaving ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 cursor-pointer"}`}
                    >
                      {visitCardSaving ? "Хадгалж байна..." : "Хадгалах"}
                    </button>
                  </div>
                </>
              )}

              {activeTab === "ortho_card" && (
                <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
                  <h2 className="text-base font-semibold mt-0 mb-3">
                    Гажиг заслын карт
                  </h2>
                  <OrthoCardView />
                </div>
              )}
            </div>
          </section>

         

          
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
