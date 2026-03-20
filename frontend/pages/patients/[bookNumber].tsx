import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import SignaturePad from "../../components/SignaturePad";
import ChildVisitCardForm from "../../components/ChildVisitCardForm";
import SharedConsentAndSignature from "../../components/SharedConsentAndSignature";
import PreventativeQuestionnaire from "../../components/PreventativeQuestionnaire";
import OrthoCardView from "./OrthoCardView";
import EncounterReportModal from "../../components/patients/EncounterReportModal";
import EncounterMaterialsModal from "../../components/patients/EncounterMaterialsModal";
import PatientHistoryBook from "../../components/patients/PatientHistoryBook";
import type { ActiveTab, Patient, PatientBook } from "../../types/patients";
import type { VisitCardType, VisitCardAnswers } from "../../types/visitCard";
import { formatDateTime, formatDate, displayOrDash, formatDisplayName, formatDoctorName } from "../../utils/format";
import { formatStatus } from "../../components/appointments/formatters";
import { usePatientProfile } from "../../hooks/usePatientProfile";
import { useVisitCard } from "../../hooks/useVisitCard";
import type { Encounter, Appointment, PatientProfileResponse, AuditUser } from "../../types/patients";
import type { VisitCard } from "../../types/visitCard";
import { getMe } from "../../utils/auth";

function formatAuditUserDisplay(u: AuditUser | null | undefined): string {
  if (!u) return "-";
  const ovog = (u.ovog || "").trim();
  const name = (u.name || "").trim();
  if (ovog && name) return `${ovog} ${name}`;
  return name || ovog || "-";
}

export default function PatientProfilePage() {
  const router = useRouter();
  const { bookNumber } = router.query;

  // Preserve reception layout: build basePath from the actual URL, not router.pathname
  const bn = typeof bookNumber === "string" ? bookNumber : "";
  const isReceptionRoute = router.asPath.startsWith("/reception/");
  const basePath = isReceptionRoute
    ? `/reception/patients/${encodeURIComponent(bn)}`
    : `/patients/${encodeURIComponent(bn)}`;

  // Shared tab navigation helper – updates URL and keeps the correct layout
  const goTab = (tab: string) => {
    if (!bn) return;
    router.push(`${basePath}?tab=${encodeURIComponent(tab)}`, undefined, { shallow: true });
  };

  // Combined handler: update UI state and navigate to tab URL
  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    setEditMode(false);
    setSaveError("");
    setSaveSuccess("");
    goTab(tab);
  };

  // Use custom hooks for data fetching
  const { data, loading, error, refetch } = usePatientProfile();

  const [activeTab, setActiveTab] = useState<ActiveTab>("profile");

  // Detect doctor role
  const [isDoctor, setIsDoctor] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [ownBranchId, setOwnBranchId] = useState<string | null>(null);
  useEffect(() => {
    getMe()
      .then((user) => {
        setIsDoctor(user?.role === "doctor");
        setCurrentUserRole(user?.role ?? null);
        setOwnBranchId(user?.branchId != null ? String(user.branchId) : null);
      })
      .catch(() => {
        // Default to non-doctor on error (safe fallback: shows full UI)
        setIsDoctor(false);
      });
  }, []);

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
    handleClearVisitCard,
    handleUploadSignature,
    handleUploadSharedSignature,
    setVisitCardTypeDraft,
  } = useVisitCard({ bookNumber, activeTab, patientBookId });

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Patient>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  // Soft-delete patient state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // regNo autofill state: true means regNo parsed as valid -> lock birthDate/gender
  const [regNoAutofillLocked, setRegNoAutofillLocked] = useState(false);
  const [regNoInvalid, setRegNoInvalid] = useState(false);
  const regNoParseAbortRef = useRef<AbortController | null>(null);

  // Encounter report modal state
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportAppointmentId, setReportAppointmentId] = useState<number | null>(null);

  // Encounter materials modal state
  const [materialsModalOpen, setMaterialsModalOpen] = useState(false);
  const [materialsEncounterId, setMaterialsEncounterId] = useState<number | null>(null);

  // Ortho card local reset key – incrementing remounts OrthoCardView
  const [orthoResetKey, setOrthoResetKey] = useState(0);

  // Visit card section collapsible state:
  // Open by default; auto-collapse once the card is complete (consent + signature).
  const [visitCardOpen, setVisitCardOpen] = useState(true);
  const visitCardComplete =
    visitCardAnswers.sharedConsentAccepted === true &&
    !!sharedSignature?.filePath;
  // Auto-collapse when card becomes complete and data has finished loading
  useEffect(() => {
    if (!visitCardLoading && !sharedSignatureLoading && visitCardComplete) {
      setVisitCardOpen(false);
    }
  }, [visitCardLoading, sharedSignatureLoading, visitCardComplete]);

  // Appointments tab filter/pagination state
  const [apptDateFrom, setApptDateFrom] = useState("");
  const [apptDateTo, setApptDateTo] = useState("");
  const [apptPage, setApptPage] = useState(1);
  const APPT_PAGE_SIZE = 20;

  // Handle tab query parameter for deep-linking
  // Accepts both "ortho" (short form) and "ortho_card" (internal tab ID) for flexibility
  // Also canonicalizes legacy "tab=ortho" → "tab=ortho_card" while staying on the correct basePath
  useEffect(() => {
    const tabParam = router.query.tab as string | undefined;
    // Compute basePath inside the effect to avoid stale closure
    const effectBn = typeof router.query.bookNumber === "string" ? router.query.bookNumber : "";
    const effectBasePath = router.asPath.startsWith("/reception/")
      ? `/reception/patients/${encodeURIComponent(effectBn)}`
      : `/patients/${encodeURIComponent(effectBn)}`;

    if (tabParam === "ortho") {
      // Canonicalize old "ortho" links to "ortho_card" without leaving the current layout
      setActiveTab("ortho_card");
      if (effectBn) {
        router.replace(`${effectBasePath}?tab=ortho_card`, undefined, { shallow: true });
      }
    } else if (tabParam === "ortho_card") {
      setActiveTab("ortho_card");
    } else if (tabParam === "patient_history") {
      setActiveTab("patient_history");
    } else if (tabParam === "appointments") {
      setActiveTab("appointments");
    } else if (tabParam === "visit_card") {
      setActiveTab("visit_card");
    } else if (tabParam === "profile") {
      setActiveTab("profile");
    }
  }, [router.query.tab, router.query.bookNumber, router.asPath]);

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
      setRegNoInvalid(false);
      setEditForm((prev) => ({ ...prev, gender: "", birthDate: "" }));
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
        setRegNoInvalid(false);
      } else {
        setRegNoAutofillLocked(false);
        setRegNoInvalid(true);
        setEditForm((prev) => ({ ...prev, gender: "", birthDate: "" }));
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setRegNoAutofillLocked(false);
      setRegNoInvalid(false);
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
    setRegNoInvalid(false);
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
    setRegNoInvalid(false);
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

  const handleDeletePatient = async () => {
    if (!data?.patient?.id) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/patients/${data.patient.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(json.error || "Устгах үед алдаа гарлаа.");
        return;
      }
      // Redirect to patients list after successful delete
      router.push("/patients");
    } catch (err: any) {
      setDeleteError(err?.message || "Устгах үед алдаа гарлаа.");
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  const sortedAppointments = [...appointments].sort((a, b) =>
    b.scheduledAt.localeCompare(a.scheduledAt)
  );

  // Filtered appointments for the Цагууд tab
  const filteredAppointments = sortedAppointments.filter((a) => {
    const d = new Date(a.scheduledAt);
    if (apptDateFrom) {
      const from = new Date(`${apptDateFrom}T00:00:00`);
      if (d < from) return false;
    }
    if (apptDateTo) {
      const to = new Date(`${apptDateTo}T23:59:59.999`);
      if (d > to) return false;
    }
    return true;
  });
  const apptTotalPages = Math.max(1, Math.ceil(filteredAppointments.length / APPT_PAGE_SIZE));
  const pagedAppointments = filteredAppointments.slice(
    (apptPage - 1) * APPT_PAGE_SIZE,
    apptPage * APPT_PAGE_SIZE
  );

  const tabBtnClass = (tab: ActiveTab) =>
    activeTab === tab
      ? "px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer border-0 bg-white/10 text-white whitespace-nowrap focus:outline-none"
      : "px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer border-0 text-white/80 hover:text-white hover:bg-white/5 whitespace-nowrap focus:outline-none";

  const inputClass = "w-full rounded-md border border-gray-300 px-1.5 py-1 text-sm";

  // Reusable button class constants
  const ghostBtnClass =
    "px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-gray-50 cursor-pointer hover:bg-gray-100 disabled:cursor-default disabled:opacity-40";
  const smGhostBtnClass =
    "px-2 py-1 text-sm rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer disabled:opacity-40 disabled:cursor-default";
  const primaryBtnClass = (disabled: boolean) =>
    `px-3 py-1.5 text-sm rounded-md border-0 text-white ${disabled ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 cursor-pointer"}`;
  const dangerBtnClass =
    "px-3 py-1 text-sm rounded border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 cursor-pointer";
  const dangerBtnDisabledClass =
    "px-3 py-1 text-sm rounded border border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed";
  const iconBtnBlueClass =
    "inline-flex items-center justify-center w-7 h-7 rounded border border-blue-300 bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer";
  const iconBtnGhostClass =
    "inline-flex items-center justify-center w-7 h-7 rounded border border-gray-300 bg-gray-50 text-gray-500 hover:bg-gray-100 cursor-pointer disabled:opacity-40 disabled:cursor-default";

  return (
    <>
      {/* Delete confirmation dialog */}
      {deleteConfirmOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: "24px 28px",
              maxWidth: 420,
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>
              Үйлчлүүлэгчийг устгах
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: 14, color: "#374151" }}>
              Та энэ үйлчлүүлэгчийг устгахдаа итгэлтэй байна уу? Устгасны дараа
              үйлчлүүлэгч жагсаалтаас харагдахгүй болно. Шаардлагатай бол шууд
              холбоосоор дахин үзэх боломжтой.
            </p>
            {deleteError && (
              <p style={{ margin: "0 0 12px", color: "#dc2626", fontSize: 13 }}>
                {deleteError}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => { setDeleteConfirmOpen(false); setDeleteError(""); }}
                disabled={deleting}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "#f9fafb",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Болих
              </button>
              <button
                type="button"
                onClick={handleDeletePatient}
                disabled={deleting}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: deleting ? "#fca5a5" : "#dc2626",
                  color: "#fff",
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {deleting ? "Устгаж байна..." : "Тийм, устгах"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky top tabs bar — same dark navy as the app header */}
      {/* In AdminLayout: negative margins negate the 20px padding for full-bleed; top:-20 aligns the */}
      {/*   sticky threshold with the container border so the bar stays flush under the header on scroll */}
      {/* In DoctorLayout: sticky top-11 clears the fixed 44px header; no negative margins needed */}
     {patient && pb && (
  <div className={`z-[90] border-b border-white/10 bg-[#061325]${isDoctor ? " fixed top-11 left-0 right-0" : " relative"}`}>
    <div className={isDoctor ? "px-3 sm:px-4 sm:max-w-[720px] sm:mx-auto" : "max-w-7xl mx-auto px-4 lg:px-8"}>
      <div className="flex items-center">
        <div className="flex-1 overflow-x-auto">
          <div className="flex items-center gap-1 py-2 min-w-max">
            <button
              type="button"
              onClick={() => handleTabChange("profile")}
              className={tabBtnClass("profile")}
            >
              Профайл
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("patient_history")}
              className={tabBtnClass("patient_history")}
            >
              Үйлчлүүлэгчийн карт
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("appointments")}
              className={tabBtnClass("appointments")}
            >
              Цагууд
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("visit_card")}
              className={tabBtnClass("visit_card")}
            >
              Карт бөглөх
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("ortho_card")}
              className={tabBtnClass("ortho_card")}
            >
              Гажиг заслын карт
            </button>

            {!isDoctor && (
              <button
                type="button"
                onClick={() => {
                  if (!patient) return;
                  if (!window.confirm("Энэхүү үйлчлүүлэгчид цаг захиалах уу?")) return;
                  const isReception = isReceptionRoute || currentUserRole === "receptionist";
                  if (isReception && ownBranchId) {
                    router.push(`/reception/appointments?branchId=${ownBranchId}&bookPatientId=${patient.id}`);
                  } else if (isReception) {
                    router.push(`/reception/appointments?bookPatientId=${patient.id}`);
                  } else {
                    router.push(`/appointments?bookPatientId=${patient.id}`);
                  }
                }}
                className="px-3 py-1 rounded text-xs font-medium transition-colors bg-blue-500 hover:bg-blue-400 text-white whitespace-nowrap"
              >
                Цаг захиалах
              </button>
            )}
          </div>
        </div>

        <div className="hidden sm:block shrink-0 ml-3 text-xs sm:text-sm text-white/70 truncate max-w-[40vw]">
          {formatDisplayName(patient)} • #{pb.bookNumber}
        </div>
      </div>
    </div>
  </div>
)}

      <main className={isDoctor ? "pt-14 pb-6 font-sans" : "max-w-7xl px-4 lg:px-8 my-4 font-sans"}>
      {loading && <div>Ачааллаж байна...</div>}
      {!loading && error && <div className="text-red-600">{error}</div>}

      {!loading && !error && patient && pb && (
        <>
            {/* Content area: single full-width column */}
            <div className="flex flex-col gap-4">
              {activeTab === "profile" && (
                <>
                  {/* Summary cards row — hidden for doctors on all screen sizes */}
                  {!isDoctor && (
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
                  )}

                  {/* Basic information section (editable) */}
                  <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-base font-semibold m-0">
                        Үндсэн мэдээлэл
                      </h2>
                      {!editMode ? (
                        !isDoctor && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={startEdit}
                            className={smGhostBtnClass}
                          >
                            Засах
                          </button>
                          {!isReceptionRoute && (currentUserRole === "admin" || currentUserRole === "super_admin" || currentUserRole === "manager") && (
                            <button
                              type="button"
                              onClick={() => { setDeleteConfirmOpen(true); setDeleteError(""); }}
                              className={dangerBtnClass}
                            >
                              Үйлчлүүлэгчийг устгах
                            </button>
                          )}
                        </div>
                        )
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
                          <div>
                            <input
                              name="regNo"
                              value={editForm.regNo ?? ""}
                              onChange={handleEditChange}
                              className={inputClass}
                            />
                            {regNoInvalid && (
                              <div className="text-xs text-red-500 mt-0.5">РД буруу байна</div>
                            )}
                          </div>
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
                        <div className="text-gray-500 mb-0.5">Үүсгэсэн</div>
                        <div>
                          {formatAuditUserDisplay(patient.createdByUser)}
                          {patient.createdAt ? ` — ${formatDate(patient.createdAt)}` : ""}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-0.5">Шинэчилсэн</div>
                        <div>
                          {formatAuditUserDisplay(patient.updatedByUser)}
                          {patient.updatedAt ? ` — ${formatDate(patient.updatedAt)}` : ""}
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

                      {/* Visit card last update record */}
                      {data?.visitCard?.savedAt && (
                        <div className="col-span-full">
                          <div className="text-gray-500 mb-0.5">Карт шинэчилсэн</div>
                          <div>
                            {data.visitCard.updatedBy
                              ? formatAuditUserDisplay(data.visitCard.updatedBy)
                              : "-"}{" "}
                            — {formatDateTime(data.visitCard.savedAt)}
                          </div>
                        </div>
                      )}

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
                          className={ghostBtnClass}
                        >
                          Болих
                        </button>
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={saving}
                          className={primaryBtnClass(saving)}
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
                  {/* Date range filters */}
                  <div className="flex flex-wrap gap-3 mb-3 items-end">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-500">Эхлэх огноо</label>
                      <input
                        type="date"
                        value={apptDateFrom}
                        onChange={(e) => { setApptDateFrom(e.target.value); setApptPage(1); }}
                        className="rounded-md border border-gray-300 px-1.5 py-1 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-500">Дуусах огноо</label>
                      <input
                        type="date"
                        value={apptDateTo}
                        onChange={(e) => { setApptDateTo(e.target.value); setApptPage(1); }}
                        className="rounded-md border border-gray-300 px-1.5 py-1 text-sm"
                      />
                    </div>
                    {(apptDateFrom || apptDateTo) && (
                      <button
                        type="button"
                        onClick={() => { setApptDateFrom(""); setApptDateTo(""); setApptPage(1); }}
                        className={smGhostBtnClass}
                      >
                        Цэвэрлэх
                      </button>
                    )}
                  </div>
                  {filteredAppointments.length === 0 ? (
                    <div className="text-sm text-gray-500">Цаг захиалгын бүртгэл алга.</div>
                  ) : (
                  <>
    <div
      className="overflow-x-auto max-w-full"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <table
        className={`border-collapse text-sm ${
          // Key: on doctor view we DO NOT use w-full (that creates leftover "empty" space).
          // Instead we use w-max + table-fixed + explicit col widths, so columns sit tightly.
          isDoctor ? "table-fixed w-max min-w-[520px]" : "w-full min-w-[600px]"
        }`}
      >
        {isDoctor ? (
          <colgroup>
            <col style={{ width: "132px" }} /> {/* Огноо / цаг */}
            <col />                             {/* Салбар - hidden on mobile, auto on md+ */}
            <col style={{ width: "140px" }} /> {/* Эмч */}
            <col />                             {/* Төлөв - hidden on doctor mobile */}
            <col />                             {/* Тэмдэглэл - hidden on doctor mobile */}
            <col style={{ width: "84px" }} />  {/* Үйлдэл */}
          </colgroup>
        ) : null}

        <thead className="bg-gray-50">
          <tr>
            <th className="text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">
              Огноо / цаг
            </th>

            <th className={`text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700 whitespace-nowrap${isDoctor ? " hidden md:table-cell" : ""}`}>
              Салбар
            </th>

            <th className="text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">
              Эмч
            </th>

            {/* keep these hidden on doctor mobile */}
            <th
              className={`text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700 whitespace-nowrap${
                isDoctor ? " hidden md:table-cell" : ""
              }`}
            >
              Төлөв
            </th>
            <th
              className={`text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700 whitespace-nowrap${
                isDoctor ? " hidden md:table-cell" : ""
              }`}
            >
              Тэмдэглэл
            </th>

            <th className="text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">
              Үйлдэл
            </th>
          </tr>
        </thead>

        <tbody>
          {pagedAppointments.map((a) => (
            <tr key={a.id} className="odd:bg-white even:bg-gray-50">
              <td className="border-b border-gray-100 py-1.5 px-2 whitespace-nowrap">
                {formatDateTime(a.scheduledAt)}
              </td>

              <td className={`border-b border-gray-100 py-1.5 px-2 whitespace-nowrap${isDoctor ? " hidden md:table-cell" : ""}`}>
                {a.branch?.name || "-"}
              </td>

              <td className="border-b border-gray-100 py-1.5 px-2 whitespace-nowrap">
                {formatDoctorName(a.doctor)}
              </td>

              <td
                className={`border-b border-gray-100 py-1.5 px-2${
                  isDoctor ? " hidden md:table-cell" : ""
                }`}
              >
                {formatStatus(a.status)}
              </td>

              <td
                className={`border-b border-gray-100 py-1.5 px-2${
                  isDoctor ? " hidden md:table-cell" : ""
                }`}
              >
                {displayOrDash(a.notes ?? null)}
              </td>

              <td className="border-b border-gray-100 py-1.5 px-2 whitespace-nowrap">
                {a.status === "completed" && (
                  <div className="flex items-center gap-1 flex-nowrap">
                    <button
                      title="Дэлгэрэнгүй"
                      onClick={() => {
                        setReportAppointmentId(a.id);
                        setReportModalOpen(true);
                      }}
                      className={iconBtnBlueClass}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-4 h-4"
                      >
                        <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                        <path
                          fillRule="evenodd"
                          d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>

                    <button
                      title="Хавсралтууд"
                      disabled={(a.materialsCount ?? 0) < 1}
                      onClick={() => {
                        if (a.encounterId) {
                          setMaterialsEncounterId(a.encounterId);
                          setMaterialsModalOpen(true);
                        }
                      }}
                      className={iconBtnGhostClass}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-4 h-4"
                      >
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

                      {/* Pagination */}
                      <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
                        <span>
                          Нийт {filteredAppointments.length} бүртгэл
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setApptPage((p) => Math.max(1, p - 1))}
                            disabled={apptPage === 1}
                            className={smGhostBtnClass}
                          >
                            ‹ Өмнөх
                          </button>
                          <span>
                            {apptPage} / {apptTotalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setApptPage((p) => Math.min(apptTotalPages, p + 1))}
                            disabled={apptPage === apptTotalPages}
                            className={smGhostBtnClass}
                          >
                            Дараах ›
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === "patient_history" && patient && pb && (
                <PatientHistoryBook
                  patient={patient}
                  patientBook={pb}
                  visitCard={data?.visitCard}
                  encounters={encounters || []}
                  isDoctor={isDoctor}
                />
              )}

              {activeTab === "visit_card" && (
                <>
                  {/* Type selector for adult vs child — collapsible */}
                  <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-3">
                    <div
                      className="flex items-center justify-between mb-2 cursor-pointer select-none"
                      onClick={() => setVisitCardOpen((o) => !o)}
                      role="button"
                      aria-expanded={visitCardOpen}
                      aria-label={visitCardOpen ? "Үзлэгийн картын төрөл хаах" : "Үзлэгийн картын төрөл нээх"}
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <span>{visitCardOpen ? "▾" : "▸"}</span>
                        <span>Үзлэгийн картын төрөл</span>
                        {visitCardComplete && (
                          <span className="text-xs font-normal text-green-600">✓ Бөглөгдсөн</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!window.confirm("Одоогийн картыг устгах уу? Энэ үйлдлийг буцаах боломжгүй.")) return;
                          void handleClearVisitCard();
                        }}
                        disabled={visitCardSaving}
                        className={visitCardSaving ? dangerBtnDisabledClass : dangerBtnClass}
                      >
                        Цэвэрлэх
                      </button>
                    </div>

                    {visitCardOpen && (
                      <>
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
                      </>
                    )}
                  </div>

                  {/* Form content and signature — shown only when section is expanded */}
                  {visitCardOpen && (
                  <>
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
                      className={primaryBtnClass(visitCardSaving)}
                    >
                      {visitCardSaving ? "Хадгалж байна..." : "Хадгалах"}
                    </button>
                  </div>
                  {/* End: collapsible visit card form content */}
                  </>
                  )}
                </>
              )}

              {activeTab === "ortho_card" && (
                <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base font-semibold m-0">
                      Гажиг заслын карт
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm("Гажиг заслын картын өгөгдлийг цэвэрлэх үү? Зөвхөн дэлгэцийн мэдээлэл цэвэрлэгдэх болно.")) return;
                        setOrthoResetKey((k) => k + 1);
                      }}
                      className={dangerBtnClass}
                    >
                      Цэвэрлэх
                    </button>
                  </div>
                  <OrthoCardView resetKey={orthoResetKey} />
                </div>
              )}
            </div>
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

      {/* Encounter Materials Modal */}
      <EncounterMaterialsModal
        open={materialsModalOpen}
        onClose={() => {
          setMaterialsModalOpen(false);
          setMaterialsEncounterId(null);
        }}
        encounterId={materialsEncounterId}
      />
      </main>
    </>
  );
}
