import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import type { Branch, Doctor, ScheduledDoctor, Appointment, PatientLite, DoctorScheduleDay, CompletedHistoryItem } from "./types";
import { formatDoctorName, historyDoctorToDoctor, formatPatientSearchLabel, formatHistoryDate } from "./formatters";
import { SLOT_MINUTES, addMinutesToTimeString, generateTimeSlotsForDay, getSlotTimeString, isTimeWithinRange } from "./time";

const PATIENT_RESULTS_LIMIT = 10;
const COMPLETED_READONLY_MSG = "Дууссан цаг засварлах боломжгүй.";

type QuickAppointmentModalProps = {
  open: boolean;
  onClose: () => void;
  defaultDoctorId?: number;
  defaultDate: string; // YYYY-MM-DD
  defaultTime: string; // HH:MM
  branches: Branch[];
  doctors: Doctor[];
  scheduledDoctors: ScheduledDoctor[];
  appointments: Appointment[];
  selectedBranchId: string;
  onCreated: (a: Appointment) => void;

  editingAppointment?: Appointment | null;
  onUpdated?: (a: Appointment) => void;

  /** When false, disables the effect that auto-fills branch to branches[0] when no branch is selected. */
  allowAutoDefaultBranch?: boolean;

  /** Pre-selected patient id (for booking intent from calendar page). */
  defaultPatientId?: number | null;
  /** Display label for the pre-selected patient. */
  defaultPatientQuery?: string;

  /** Current user role for permission checks (e.g. "super_admin") */
  currentUserRole?: string | null;
  /** When true, forces status to "booked" and hides the status selector */
  forceBookedStatus?: boolean;
};

export default function QuickAppointmentModal({
  open,
  onClose,
  defaultDoctorId,
  defaultDate,
  defaultTime,
  branches,
  doctors,
  scheduledDoctors,
  appointments,
  selectedBranchId,
  onCreated,
  editingAppointment,
  onUpdated,
  allowAutoDefaultBranch = true,
  defaultPatientId,
  defaultPatientQuery,
  currentUserRole,
  forceBookedStatus = false,
}: QuickAppointmentModalProps) {
  const router = useRouter();
  const isEditMode = Boolean(editingAppointment);
  const isCompletedReadOnly =
    isEditMode &&
    editingAppointment?.status === "completed" &&
    currentUserRole !== "super_admin";

  const [form, setForm] = useState({
    patientQuery: "",
    patientId: null as number | null,

    doctorId: defaultDoctorId ? String(defaultDoctorId) : "",
    branchId: selectedBranchId || (allowAutoDefaultBranch && branches.length ? String(branches[0].id) : ""),

    date: defaultDate,
    startTime: defaultTime,
    endTime: addMinutesToTimeString(defaultTime, SLOT_MINUTES),

    status: "booked",
    notes: "",
  });

  const [error, setError] = useState("");

  // duration selector state (create mode only)
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [endTimeManuallySet, setEndTimeManuallySet] = useState(false);

  const workingDoctors = scheduledDoctors.length ? scheduledDoctors : doctors;

  const [patientResults, setPatientResults] = useState<PatientLite[]>([]);
  const [hasMorePatientResults, setHasMorePatientResults] = useState(false);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [searchDebounceTimer, setSearchDebounceTimer] =
    useState<NodeJS.Timeout | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const patientSearchRef = useRef<HTMLInputElement>(null);

  // completed visit history for selected patient
  const [completedHistory, setCompletedHistory] = useState<CompletedHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // time slot options
  const [popupStartSlots, setPopupStartSlots] = useState<
    { label: string; value: string }[]
  >([]);
  const [popupEndSlots, setPopupEndSlots] = useState<
    { label: string; value: string }[]
  >([]);

  // quick new patient (create mode only)
  const [showQuickPatientModal, setShowQuickPatientModal] = useState(false);
  const [quickPatientForm, setQuickPatientForm] = useState<{
    ovog: string;
    name: string;
    phone: string;
    branchId: string;
    regNo: string;
  }>({
    ovog: "",
    name: "",
    phone: "",
    branchId: "",
    regNo: "",
  });
  const [quickPatientError, setQuickPatientError] = useState("");
  const [quickPatientSaving, setQuickPatientSaving] = useState(false);

  // ---- helpers ----
  const parseYmd = (ymd: string) => {
    const [y, m, d] = String(ymd || "").split("-").map(Number);
    if (!y || !m || !d) return null;
    return { y, m, d };
  };

  const parseIsoToLocalYmdHm = (iso: string) => {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return null;
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    return { ymd: `${y}-${m}-${d}`, hm: `${hh}:${mm}` };
  };

  const loadPatientHistory = async (patientId: number) => {
    try {
      setHistoryLoading(true);
      const res = await fetch(`/api/patients/${patientId}/completed-appointments?limit=3`);
      if (!res.ok) {
        setCompletedHistory([]);
        return;
      }
      const data = await res.json().catch(() => []);
      setCompletedHistory(Array.isArray(data) ? data : []);
    } catch {
      setCompletedHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // initialize modal state on open
  useEffect(() => {
    if (!open) return;

    // EDIT MODE: preload from appointment
    if (editingAppointment) {
      const startParsed = parseIsoToLocalYmdHm(editingAppointment.scheduledAt);
      const endParsed = editingAppointment.endAt
        ? parseIsoToLocalYmdHm(editingAppointment.endAt)
        : null;

      const ymd = startParsed?.ymd || defaultDate;
      const startTime = startParsed?.hm || defaultTime;
      const endTime =
        endParsed?.hm || addMinutesToTimeString(startTime, SLOT_MINUTES);

      setForm((prev) => ({
        ...prev,
        // lock patient in UI (but we still store it)
        patientId: editingAppointment.patientId ?? null,
        patientQuery: editingAppointment.patient
          ? formatPatientSearchLabel(editingAppointment.patient as any)
          : prev.patientQuery,

        doctorId:
          editingAppointment.doctorId !== null && editingAppointment.doctorId !== undefined
            ? String(editingAppointment.doctorId)
            : "",

        branchId: String(editingAppointment.branchId),
        date: ymd,
        startTime,
        endTime,

        // status locked in edit mode (not used, but keep consistent)
        status: editingAppointment.status || "booked",
        notes: editingAppointment.notes || "",
      }));

      setError("");
      setPatientResults([]);
      setCompletedHistory([]);
      return;
    }

    // CREATE MODE: reset to defaults
    const prePatientId = defaultPatientId ?? null;
    const prePatientQuery = defaultPatientQuery || "";
    setForm((prev) => ({
      ...prev,
      doctorId: defaultDoctorId ? String(defaultDoctorId) : "",
      branchId: selectedBranchId || (allowAutoDefaultBranch ? prev.branchId : ""),
      date: defaultDate,
      startTime: defaultTime,
      endTime: addMinutesToTimeString(defaultTime, SLOT_MINUTES),
      patientId: prePatientId,
      patientQuery: prePatientQuery,
      status: "booked",
      notes: "",
    }));
    setDurationMinutes(30);
    setEndTimeManuallySet(false);
    setError("");
    setPatientResults([]);
    setCompletedHistory([]);
    if (prePatientId) {
      loadPatientHistory(prePatientId);
    }
  }, [open, defaultDoctorId, defaultDate, defaultTime, selectedBranchId, editingAppointment, defaultPatientId, defaultPatientQuery]);

  // Autofocus patient search input when modal opens in create mode
  useEffect(() => {
    if (open && !isEditMode) {
      patientSearchRef.current?.focus();
    }
  }, [open, isEditMode]);

  // Reset highlighted index whenever results change
  useEffect(() => {
    setHighlightedIndex(0);
    if (patientResults.length === 0) {
      setHasMorePatientResults(false);
    }
  }, [patientResults]);

  // slots calculation (same as your current, but in edit mode: filter by selected doctor schedule still ok)
  useEffect(() => {
    if (!form.date) {
      setPopupStartSlots([]);
      setPopupEndSlots([]);
      return;
    }

    const parsed = parseYmd(form.date);
    if (!parsed) {
      setPopupStartSlots([]);
      setPopupEndSlots([]);
      return;
    }

    const day = new Date(parsed.y, parsed.m - 1, parsed.d);

    let slots = generateTimeSlotsForDay(day).map((s) => ({
      label: s.label,
      start: s.start,
      end: s.end,
      value: getSlotTimeString(s.start),
    }));

    // Filter by doctor schedule if doctorId is selected
    if (form.doctorId) {
      const doctorIdNum = Number(form.doctorId);
      const doc = scheduledDoctors.find((sd) => sd.id === doctorIdNum);
      const schedules = doc?.schedules || [];

      if (schedules.length > 0) {
        slots = slots.filter((slot) => {
          const tStr = getSlotTimeString(slot.start);
          return schedules.some((s: any) =>
            isTimeWithinRange(tStr, s.startTime, s.endTime)
          );
        });
      }
    }

    const startOptions = slots.map(({ label, value }) => ({ label, value }));
    const endOptions = Array.from(
      new Set(slots.map((s) => getSlotTimeString(s.end)))
    ).map((t) => ({ label: t, value: t }));

    setPopupStartSlots(startOptions);
    setPopupEndSlots(endOptions);

    if (form.startTime && !startOptions.some((s) => s.value === form.startTime)) {
      setForm((prev) => ({ ...prev, startTime: "" }));
    }
    if (form.endTime && !endOptions.some((s) => s.value === form.endTime)) {
      setForm((prev) => ({ ...prev, endTime: "" }));
    }
  }, [form.date, form.doctorId, scheduledDoctors]);

  useEffect(() => {
    if (!allowAutoDefaultBranch) return;
    if (!form.branchId && branches.length > 0) {
      setForm((prev) => ({
        ...prev,
        branchId: String(branches[0].id),
      }));
    }
  }, [branches, form.branchId, allowAutoDefaultBranch]);

  const triggerPatientSearch = (rawQuery: string) => {
    const query = rawQuery.trim();
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    if (!query) {
      setPatientResults([]);
      return;
    }

    const lower = query.toLowerCase();

    const t = setTimeout(async () => {
      try {
        setPatientSearchLoading(true);
        const url = `/api/patients?q=${encodeURIComponent(query)}&limit=50`;
        const res = await fetch(url);
        const data = await res.json().catch(() => []);

        if (!res.ok) {
          setPatientResults([]);
          return;
        }

        const rawList = Array.isArray(data)
          ? data
          : Array.isArray((data as any).data)
          ? (data as any).data
          : Array.isArray((data as any).patients)
          ? (data as any).patients
          : [];

        const isNumeric = /^[0-9]+$/.test(lower);

        const filtered = rawList.filter((p: any) => {
          const regNo = (p.regNo ?? p.regno ?? "").toString().toLowerCase();
          const phone = (p.phone ?? "").toString().toLowerCase();
          const name = (p.name ?? "").toString().toLowerCase();
          const ovog = (p.ovog ?? "").toString().toLowerCase();
          const bookNumber = (p.patientBook?.bookNumber ?? "").toString().toLowerCase();

          if (isNumeric) {
            return regNo.includes(lower) || phone.includes(lower) || bookNumber.includes(lower);
          }

          return (
            regNo.includes(lower) ||
            phone.includes(lower) ||
            name.includes(lower) ||
            ovog.includes(lower) ||
            bookNumber.includes(lower)
          );
        });

        setPatientResults(
          filtered.slice(0, PATIENT_RESULTS_LIMIT).map((p: any) => ({
            id: p.id,
            ovog: p.ovog ?? null,
            name: p.name,
            regNo: p.regNo ?? p.regno ?? "",
            phone: p.phone,
            patientBook: p.patientBook || null,
          }))
        );
        setHasMorePatientResults(filtered.length > PATIENT_RESULTS_LIMIT);
      } catch (e) {
        console.error("patient search failed", e);
        setPatientResults([]);
      } finally {
        setPatientSearchLoading(false);
      }
    }, 300);

    setSearchDebounceTimer(t);
  };

  const handleSelectPatient = (p: PatientLite) => {
    setForm((prev) => ({
      ...prev,
      patientId: p.id,
      patientQuery: formatPatientSearchLabel(p),
    }));
    setPatientResults([]);
    setError("");
    setCompletedHistory([]);
    loadPatientHistory(p.id);
  };

  const handlePatientKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (patientResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, patientResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = patientResults[highlightedIndex];
      if (selected) handleSelectPatient(selected);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setPatientResults([]);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    if (name === "patientQuery") {
      // locked in edit mode
      if (isEditMode) return;

      setForm((prev) => ({ ...prev, patientQuery: value }));
      const trimmed = value.trim();
      if (!trimmed) {
        setForm((prev) => ({ ...prev, patientId: null }));
        setPatientResults([]);
        setCompletedHistory([]);
        return;
      }
      triggerPatientSearch(value);
      return;
    }

    setForm((prev) => {
      if (name === "startTime") {
        const newStart = value;
        let newEnd: string;
        if (!isEditMode && !endTimeManuallySet) {
          newEnd = addMinutesToTimeString(newStart, durationMinutes);
        } else {
          newEnd = prev.endTime && prev.endTime > newStart
            ? prev.endTime
            : addMinutesToTimeString(newStart, SLOT_MINUTES);
        }
        return { ...prev, startTime: newStart, endTime: newEnd };
      }

      if (name === "endTime") {
        if (!isEditMode) {
          setEndTimeManuallySet(true);
        }
        return { ...prev, endTime: value };
      }

      // lock these fields in edit mode
      if (isEditMode && (name === "date" || name === "branchId" || name === "status")) {
        return prev;
      }

      return { ...prev, [name]: value };
    });
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mins = Number(e.target.value);
    setDurationMinutes(mins);
    setEndTimeManuallySet(false);
    setForm((prev) => ({
      ...prev,
      endTime: prev.startTime ? addMinutesToTimeString(prev.startTime, mins) : prev.endTime,
    }));
  };

  const handleQuickPatientChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setQuickPatientForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleQuickPatientSave = async () => {
    // disabled in edit mode (UI won't show the button, but also guard here)
    if (isEditMode) return;

    setQuickPatientError("");

    if (!quickPatientForm.name.trim() || !quickPatientForm.phone.trim()) {
      setQuickPatientError("Нэр болон утас заавал бөглөнө үү.");
      return;
    }

    const branchIdFromModal = quickPatientForm.branchId
      ? Number(quickPatientForm.branchId)
      : null;
    const branchIdFromForm = form.branchId ? Number(form.branchId) : null;

    const branchIdForPatient = !Number.isNaN(branchIdFromModal ?? NaN)
      ? branchIdFromModal
      : branchIdFromForm;

    if (!branchIdForPatient || Number.isNaN(branchIdForPatient)) {
      setQuickPatientError("Шинэ үйлчлүүлэгч бүртгэхийн өмнө салбар сонгоно уу.");
      return;
    }

    setQuickPatientSaving(true);

    try {
      const payload: any = {
        name: quickPatientForm.name.trim(),
        phone: quickPatientForm.phone.trim(),
        branchId: branchIdForPatient,
        bookNumber: "",
      };

      if (quickPatientForm.ovog.trim()) payload.ovog = quickPatientForm.ovog.trim();
      if (quickPatientForm.regNo.trim()) payload.regNo = quickPatientForm.regNo.trim();

      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data || typeof data.id !== "number") {
        setQuickPatientError((data && (data as any).error) || "Шинэ үйлчлүүлэгч бүртгэх үед алдаа гарлаа.");
        setQuickPatientSaving(false);
        return;
      }

      const p: PatientLite = {
        id: data.id,
        name: data.name,
        ovog: data.ovog ?? null,
        regNo: data.regNo ?? "",
        phone: data.phone ?? null,
        patientBook: data.patientBook || null,
      };

      setForm((prev) => ({
        ...prev,
        patientId: p.id,
        patientQuery: formatPatientSearchLabel(p),
      }));

      setQuickPatientForm({ ovog: "", name: "", phone: "", branchId: "", regNo: "" });
      setShowQuickPatientModal(false);
    } catch (e) {
      console.error(e);
      setQuickPatientError("Сүлжээгээ шалгана уу.");
    } finally {
      setQuickPatientSaving(false);
    }
  };

  const handleOpenPatientProfileNewTab = () => {
    const p =
      (editingAppointment && (editingAppointment.patient as any)) ||
      null;

    const bookNumber = p?.patientBook?.bookNumber;

    if (bookNumber) {
      const isReceptionRoute = router.asPath.startsWith("/reception/");
      const url = isReceptionRoute
        ? `/reception/patients/${encodeURIComponent(String(bookNumber))}?tab=patient_history`
        : `/patients/${encodeURIComponent(String(bookNumber))}?tab=patient_history`;
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    // fallback: if you have a patient page by id, adjust as needed
    if (form.patientId) {
      const url = `/patients/${form.patientId}`;
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    setError("Үйлчлүүлэгчийн картын дугаар олдсонгүй.");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Block submit for completed appointments when non-super_admin
    if (isCompletedReadOnly) {
      setError(COMPLETED_READONLY_MSG);
      return;
    }

    // --- validations ---
    if (!form.date || !form.startTime || !form.endTime) {
      setError("Огноо, эхлэх/дуусах цаг талбаруудыг бөглөнө үү.");
      return;
    }

    if (!isEditMode) {
      if (!form.branchId) {
        setError("Салбар сонгоно уу.");
        return;
      }
      if (!form.patientId) {
        setError("Үйлчлүүлэгчийг жагсаалтаас сонгоно уу.");
        return;
      }
    }

    const parsed = parseYmd(form.date);
    if (!parsed) {
      setError("Огноо буруу байна.");
      return;
    }
    const [startHour, startMinute] = form.startTime.split(":").map(Number);
    const [endHour, endMinute] = form.endTime.split(":").map(Number);

    const start = new Date(parsed.y, parsed.m - 1, parsed.d, startHour || 0, startMinute || 0, 0, 0);
    const end = new Date(parsed.y, parsed.m - 1, parsed.d, endHour || 0, endMinute || 0, 0, 0);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError("Огноо/цаг буруу байна.");
      return;
    }
    if (end <= start) {
      setError("Дуусах цаг нь эхлэх цагаас хойш байх ёстой.");
      return;
    }

    const scheduledAtStr = start.toISOString();
    const endAtStr = end.toISOString();

    try {
      if (!isEditMode) {
        // CREATE
        const res = await fetch("/api/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId: form.patientId,
            doctorId: form.doctorId ? Number(form.doctorId) : null,
            branchId: Number(form.branchId),
            scheduledAt: scheduledAtStr,
            endAt: endAtStr,
            status: forceBookedStatus ? "booked" : form.status,
            notes: form.notes || null,
          }),
        });

        let data: Appointment | { error?: string };
        try {
          data = await res.json();
        } catch {
          data = { error: "Unknown error" };
        }

        if (!res.ok) {
          setError((data as any).error || "Алдаа гарлаа");
          return;
        }

        onCreated(data as Appointment);
        onClose();
        return;
      }

      // EDIT
      if (!editingAppointment) {
        setError("Засварлах цаг олдсонгүй.");
        return;
      }

      const res = await fetch(`/api/appointments/${editingAppointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: scheduledAtStr,
          endAt: endAtStr,
          doctorId: form.doctorId ? Number(form.doctorId) : null,
          notes: form.notes || null,
          // IMPORTANT: do not send patientId/branchId/status in edit mode
        }),
      });

      let data: Appointment | { error?: string };
      try {
        data = await res.json();
      } catch {
        data = { error: "Unknown error" };
      }

      if (!res.ok) {
        setError((data as any).error || "Алдаа гарлаа");
        return;
      }

      onUpdated?.(data as Appointment);
      onClose();
    } catch {
      setError("Сүлжээгээ шалгана уу");
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 70,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: "95vw",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#ffffff",
          borderRadius: 8,
          boxShadow: "0 14px 40px rgba(0,0,0,0.25)",
          padding: 16,
          fontSize: 13,
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
          <h3 style={{ margin: 0, fontSize: 15 }}>
            {isEditMode ? "Цаг засварлах" : "Шинэ цаг захиалах"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          }}
        >
          {/* View-only notice for completed appointments */}
          {isCompletedReadOnly && (
            <div
              style={{
                gridColumn: "1 / -1",
                padding: "8px 12px",
                borderRadius: 6,
                background: "#fef9c3",
                border: "1px solid #fde68a",
                color: "#92400e",
                fontSize: 13,
              }}
            >
              {COMPLETED_READONLY_MSG}
            </div>
          )}
          {/* Patient (locked in edit mode) */}
          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <label>Үйлчлүүлэгч</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                ref={patientSearchRef}
                name="patientQuery"
                placeholder="РД, овог, нэр утсаар хайх"
                value={form.patientQuery}
                onChange={handleChange}
                onKeyDown={handlePatientKeyDown}
                autoComplete="off"
                disabled={isEditMode}
                style={{
                  flex: 1,
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  padding: "6px 8px",
                  background: isEditMode ? "#f9fafb" : "white",
                }}
              />

              {!isEditMode ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickPatientModal(true);
                    setQuickPatientError("");
                    setQuickPatientForm((prev) => ({
                      ...prev,
                      branchId: prev.branchId || form.branchId,
                    }));
                  }}
                  style={{
                    padding: "0 10px",
                    borderRadius: 6,
                    border: "1px solid #16a34a",
                    background: "#dcfce7",
                    color: "#166534",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  title="Шинэ үйлчлүүлэгчийн бүртгэл"
                >
                  +
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenPatientProfileNewTab}
                  style={{
                    padding: "0 10px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: "#f9fafb",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                  title="Дэлгэрэнгүй (шинэ таб)"
                >
                  Дэлгэрэнгүй
                </button>
              )}
            </div>

            {patientSearchLoading && !isEditMode && (
              <span style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                Үйлчлүүлэгч хайж байна...
              </span>
            )}
          </div>

          {!isEditMode && patientResults.length > 0 && (
            <div
              style={{
                gridColumn: "1 / -1",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {patientResults.map((p, idx) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPatient(p)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 8px",
                    border: "none",
                    borderBottom: "1px solid #f3f4f6",
                    background: idx === highlightedIndex ? "#eff6ff" : "white",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {formatPatientSearchLabel(p)}
                </button>
              ))}
              {hasMorePatientResults && (
                <div
                  style={{
                    padding: "4px 8px",
                    fontSize: 11,
                    color: "#6b7280",
                    fontStyle: "italic",
                  }}
                >
                  Илүү олон үр дүн байна…
                </div>
              )}
            </div>
          )}

          {/* Completed visit history (shown after patient is selected in create mode) */}
          {!isEditMode && form.patientId && !patientResults.length && (
            <div
              style={{
                gridColumn: "1 / -1",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                padding: "6px 8px",
                fontSize: 11,
              }}
            >
              <div style={{ color: "#6b7280", marginBottom: 4, fontWeight: 500 }}>
                Сүүлийн дууссан үзлэгүүд:
              </div>
              {historyLoading ? (
                <div style={{ color: "#9ca3af" }}>Уншиж байна...</div>
              ) : completedHistory.length === 0 ? (
                <div style={{ color: "#9ca3af" }}>Өмнөх дууссан үзлэг байхгүй</div>
              ) : (
                completedHistory.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      if (h.doctor) {
                        setForm((prev) => ({ ...prev, doctorId: String(h.doctor!.id) }));
                      }
                    }}
                    title={
  h.doctor
    ? `${formatDoctorName(historyDoctorToDoctor(h.doctor))} эмчийг сонгох`
    : undefined
}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "3px 0",
                      border: "none",
                      background: "transparent",
                      cursor: h.doctor ? "pointer" : "default",
                      color: h.doctor ? "#2563eb" : "#374151",
                      textDecoration: h.doctor ? "underline" : "none",
                      fontSize: 11,
                    }}
                  >
                    {formatHistoryDate(h.scheduledAt)} — Эмч:{" "}
{h.doctor
  ? formatDoctorName(historyDoctorToDoctor(h.doctor))
  : "-"}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Date (locked in edit mode) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label>Огноо</label>
            <input
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              required
              disabled={isEditMode}
              style={{
                borderRadius: 6,
                border: "1px solid #d1d5db",
                padding: "6px 8px",
                background: isEditMode ? "#f9fafb" : "white",
              }}
            />
          </div>

          {/* Doctor field hidden - doctor is optional */}

          {/* Start time (editable) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label>Эхлэх цаг</label>
            <select
              name="startTime"
              value={form.startTime}
              onChange={handleChange}
              required
              disabled={isCompletedReadOnly}
              style={{
                borderRadius: 6,
                border: "1px solid #d1d5db",
                padding: "6px 8px",
                background: isCompletedReadOnly ? "#f9fafb" : "white",
              }}
            >
              <option value="">Эхлэх цаг</option>
              {popupStartSlots.map((slot) => (
                <option key={slot.value} value={slot.value}>
                  {slot.label}
                </option>
              ))}
            </select>
          </div>

          {/* Duration pill buttons (create mode only) */}
          {!isEditMode && (
            <div role="group" aria-label="Үргэлжлэх хугацаа" style={{ display: "flex", gap: 8 }}>
              {([60, 90] as const).map((mins) => (
                <button
                  key={mins}
                  type="button"
                  aria-pressed={durationMinutes === mins}
                  onClick={() => {
                    const newDuration = durationMinutes === mins ? 30 : mins;
                    setDurationMinutes(newDuration);
                    setEndTimeManuallySet(false);
                    setForm((prev) => ({
                      ...prev,
                      endTime: prev.startTime
                        ? addMinutesToTimeString(prev.startTime, newDuration)
                        : prev.endTime,
                    }));
                  }}
                  style={{
                    borderRadius: 999,
                    border: durationMinutes === mins ? "1px solid #2563eb" : "1px solid #d1d5db",
                    background: durationMinutes === mins ? "#eff6ff" : "#fff",
                    color: durationMinutes === mins ? "#2563eb" : "#374151",
                    padding: "4px 14px",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: durationMinutes === mins ? 600 : 400,
                  }}
                >
                  {mins} мин
                </button>
              ))}
            </div>
          )}

          {/* End time (editable) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label>Дуусах цаг</label>
            <select
              name="endTime"
              value={form.endTime}
              onChange={handleChange}
              required
              disabled={isCompletedReadOnly}
              style={{
                borderRadius: 6,
                border: "1px solid #d1d5db",
                padding: "6px 8px",
                background: isCompletedReadOnly ? "#f9fafb" : "white",
              }}
            >
              <option value="">Дуусах цаг</option>
              {popupEndSlots.map((slot) => (
                <option key={slot.value} value={slot.value}>
                  {slot.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status (create only, hidden when forceBookedStatus) */}
          {!isEditMode && !forceBookedStatus && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label>Төлөв</label>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                style={{
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  padding: "6px 8px",
                }}
              >
                <option value="booked">Захиалсан</option>
                <option value="confirmed">Баталгаажсан</option>
                <option value="online">Онлайн</option>
                <option value="ongoing">Явагдаж байна</option>
                <option value="imaging">Зураг авах</option>
                <option value="ready_to_pay">Төлбөр төлөх</option>
                <option value="no_show">Ирээгүй</option>
                <option value="cancelled">Цуцалсан</option>
                <option value="other">Бусад</option>
              </select>
            </div>
          )}

          {/* Notes (editable) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              gridColumn: "1 / -1",
            }}
          >
            <label>Тэмдэглэл</label>
            <input
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="Захиалгын товч тэмдэглэл"
              disabled={isCompletedReadOnly}
              style={{
                borderRadius: 6,
                border: "1px solid #d1d5db",
                padding: "6px 8px",
                background: isCompletedReadOnly ? "#f9fafb" : "white",
              }}
            />
          </div>

          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 4,
            }}
          >
            {error && (
              <div
                style={{
                  color: "#b91c1c",
                  fontSize: 12,
                  alignSelf: "center",
                  marginRight: "auto",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: "#f9fafb",
                cursor: "pointer",
              }}
            >
              Хаах
            </button>

            {!isCompletedReadOnly && (
              <button
                type="submit"
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: "#2563eb",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Хадгалах
              </button>
            )}
          </div>

          {/* Quick new patient modal (create only) */}
          {!isEditMode && showQuickPatientModal && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 60,
              }}
            >
              <div
                style={{
                  background: "white",
                  borderRadius: 8,
                  padding: 16,
                  width: 340,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                  fontSize: 13,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 15 }}>
                  Шинэ үйлчлүүлэгчийн бүртгэл
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    Овог
                    <input
                      name="ovog"
                      value={quickPatientForm.ovog}
                      onChange={handleQuickPatientChange}
                      style={{ borderRadius: 6, border: "1px solid #d1d5db", padding: "6px 8px" }}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    Нэр
                    <input
                      name="name"
                      value={quickPatientForm.name}
                      onChange={handleQuickPatientChange}
                      style={{ borderRadius: 6, border: "1px solid #d1d5db", padding: "6px 8px" }}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    Утас
                    <input
                      name="phone"
                      value={quickPatientForm.phone}
                      onChange={handleQuickPatientChange}
                      style={{ borderRadius: 6, border: "1px solid #d1d5db", padding: "6px 8px" }}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    РД
                    <input
                      name="regNo"
                      value={quickPatientForm.regNo}
                      onChange={handleQuickPatientChange}
                      style={{ borderRadius: 6, border: "1px solid #d1d5db", padding: "6px 8px" }}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    Салбар
                    <select
                      name="branchId"
                      value={quickPatientForm.branchId}
                      onChange={handleQuickPatientChange}
                      style={{ borderRadius: 6, border: "1px solid #d1d5db", padding: "6px 8px" }}
                    >
                      <option value="">Сонгох</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {quickPatientError && (
                    <div style={{ color: "#b91c1c", fontSize: 12 }}>
                      {quickPatientError}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!quickPatientSaving) {
                          setShowQuickPatientModal(false);
                          setQuickPatientError("");
                        }
                      }}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        background: "#f9fafb",
                        cursor: quickPatientSaving ? "default" : "pointer",
                      }}
                    >
                      Хаах
                    </button>

                    <button
                      type="button"
                      onClick={handleQuickPatientSave}
                      disabled={quickPatientSaving}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: "none",
                        background: "#16a34a",
                        color: "white",
                        cursor: quickPatientSaving ? "default" : "pointer",
                      }}
                    >
                      {quickPatientSaving ? "Хадгалж байна..." : "Хадгалах"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
