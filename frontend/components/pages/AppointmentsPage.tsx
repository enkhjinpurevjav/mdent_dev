// Shared appointments page component — used by both /appointments and /reception/appointments.
// IMPORTANT: This component is layout-agnostic. Do NOT import or render any layout wrapper
// (AdminLayout, ReceptionLayout, etc.) here. Layout is applied by _app.tsx based on route.
// Role-based UI differences (e.g. "Борлуулалтын орлого" card) are gated on currentUserRole.
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../contexts/AuthContext";
import { useBranchLock } from "../appointments/useBranchLock";
import type { Branch, Doctor, ScheduledDoctor, PatientLite, Appointment, DoctorScheduleDay, TimeSlot, CompletedHistoryItem } from "../appointments/types";
import { SLOT_MINUTES, floorToSlotStart, addMinutes, getSlotKey, enumerateSlotStartsOverlappingRange, generateTimeSlotsForDay, getSlotTimeString, addMinutesToTimeString, isTimeWithinRange, getDateFromYMD, pad2 } from "../appointments/time";
import { formatDoctorName, historyDoctorToDoctor, formatPatientLabel, formatGridShortLabel, formatPatientSearchLabel, formatDateYmdDash, formatStatus, formatDetailedTimeRange, formatHistoryDate } from "../appointments/formatters";
import AppointmentDetailsModal from "../appointments/AppointmentDetailsModal";
import QuickAppointmentModal from "../appointments/QuickAppointmentModal";
import PendingSaveBar from "../appointments/PendingSaveBar";
import {
  getBusinessYmd,
  toNaiveTimestamp,
  naiveTimestampToYmd,
  naiveTimestampToHm,
  naiveToFakeUtcDate,
  fakeUtcDateToNaive,
  minutesFromNaive,
  parseNaiveTimestamp,
} from "../../utils/businessTime";
import PriceListSearch from "../reception/PriceListSearch";

function groupByDate(appointments: Appointment[]) {
  const map: Record<string, Appointment[]> = {};
  for (const a of appointments) {
    const scheduled = a.scheduledAt;
    if (!scheduled) continue;
    const key = scheduled.slice(0, 10);
    if (!map[key]) map[key] = [];
    map[key].push(a);
  }
  return map;
}

function canReceptionEditAppointment(status: string) {
  return ["booked", "confirmed", "online", "other"].includes(String(status || "").toLowerCase());
}

/** Returns true if the current user is allowed to edit the given appointment. */
function canEditAppointment(status: string, role: string | null | undefined): boolean {
  if (String(status || "").toLowerCase() === "completed") {
    return role === "super_admin";
  }
  return canReceptionEditAppointment(status);
}

// ✅ Helper: is this appointment in “Явагдаж байна” state?
function isOngoing(status: string) {
  return status === "ongoing";
}

function getAppointmentDayKey(a: Appointment): string {
  const scheduled = a.scheduledAt;
  if (!scheduled || typeof scheduled !== "string") return "";
  return scheduled.slice(0, 10);
}

/**
 * Compute stable lanes (0 or 1) for all appointments for a doctor on a given day.
 * Ensures that overlapping appointments never share the same lane.
 */
function computeAppointmentLanesForDayAndDoctor(
  list: Appointment[]
): Record<number, 0 | 1> {
  const result: Record<number, 0 | 1> = {};

  // Sort by start time, then by duration DESC (longer first when same start)
  // Use naive timestamp parsing — no timezone dependency.
  const sorted = list
    .slice()
    .filter((a) => !!parseNaiveTimestamp(a.scheduledAt))
    .sort((a, b) => {
      const sa = naiveToFakeUtcDate(a.scheduledAt).getTime();
      const sb = naiveToFakeUtcDate(b.scheduledAt).getTime();
      if (sa !== sb) return sa - sb;

      const ea = a.endAt ? naiveToFakeUtcDate(a.endAt).getTime() : sa;
      const eb = b.endAt ? naiveToFakeUtcDate(b.endAt).getTime() : sb;
      return eb - ea; // longer first if same start
    });

  const laneLastEnd: (number | null)[] = [null, null];

  for (const a of sorted) {
    const start = naiveToFakeUtcDate(a.scheduledAt).getTime();
    const end = a.endAt
      ? naiveToFakeUtcDate(a.endAt).getTime()
      : start + SLOT_MINUTES * 60 * 1000;

    let assignedLane: 0 | 1 | null = null;

    for (let lane = 0; lane < 2; lane++) {
      const lastEnd = laneLastEnd[lane];
      if (lastEnd == null || start >= lastEnd) {
        assignedLane = lane as 0 | 1;
        laneLastEnd[lane] = end;
        break;
      }
    }

    // If still null, both lanes overlap → force lane 0 visually (will stack)
    if (assignedLane === null) {
      assignedLane = 0;
      laneLastEnd[0] = Math.max(laneLastEnd[0] ?? 0, end);
    }

    result[a.id] = assignedLane;
  }

  return result;
}

// ===== Inline AppointmentForm with start/end time =====

type AppointmentFormProps = {
  branches: Branch[];
  doctors: Doctor[];
  scheduledDoctors: ScheduledDoctor[];
  appointments: Appointment[];
  selectedDate: string;
  selectedBranchId: string;
  onCreated: (a: Appointment) => void;
  onBranchChange: (branchId: string) => void; // NEW
};

function AppointmentForm({
  branches,
  doctors,
  scheduledDoctors,
  appointments,
  selectedDate,
  selectedBranchId,
  onCreated,
  onBranchChange, // NEW
}: AppointmentFormProps) {
  const todayStr = getBusinessYmd(); // YYYY-MM-DD in Mongolia timezone

  const [form, setForm] = useState({
    patientQuery: "",
    doctorId: "",
    branchId: selectedBranchId || "",
    date: selectedDate || todayStr,
    startTime: "",
    endTime: "",
    status: "booked",
    notes: "",
  });
  const [error, setError] = useState("");

  // duration selector state
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [endTimeManuallySet, setEndTimeManuallySet] = useState(false);

  const [patientResults, setPatientResults] = useState<PatientLite[]>([]);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(
    null
  );
  const [searchDebounceTimer, setSearchDebounceTimer] =
    useState<NodeJS.Timeout | null>(null);

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

  const [dayStartSlots, setDayStartSlots] = useState<
    { label: string; value: string }[]
  >([]);
  const [dayEndSlots, setDayEndSlots] = useState<
    { label: string; value: string }[]
  >([]);

  // keep branch in form in sync
  useEffect(() => {
    // Only auto-default when a specific branch is already selected (not "Бүх салбар")
    if (!selectedBranchId) return;
    if (!form.branchId && branches.length > 0) {
      setForm((prev) => ({ ...prev, branchId: String(branches[0].id) }));
    }
  }, [branches, form.branchId, selectedBranchId]);

  useEffect(() => {
    if (selectedDate) {
      setForm((prev) => ({ ...prev, date: selectedDate }));
    }
  }, [selectedDate]);

  useEffect(() => {
    if (selectedBranchId) {
      setForm((prev) => ({ ...prev, branchId: selectedBranchId }));
    }
  }, [selectedBranchId]);

  // time slots for selected date + doctor schedule
  useEffect(() => {
    if (!form.date) {
      setDayStartSlots([]);
      setDayEndSlots([]);
      return;
    }
    const [year, month, day] = form.date.split("-").map(Number);
    if (!year || !month || !day) {
      setDayStartSlots([]);
      setDayEndSlots([]);
      return;
    }
    const d = getDateFromYMD(form.date);

    let slots = generateTimeSlotsForDay(d).map((s) => ({
      label: s.label,
      start: s.start,
      end: s.end,
      value: getSlotTimeString(s.start),
    }));

    // Filter by doctor schedule if a doctor is selected
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

    setDayStartSlots(startOptions);
    setDayEndSlots(endOptions);

    if (
      form.startTime &&
      !startOptions.some((s) => s.value === form.startTime)
    ) {
      setForm((prev) => ({ ...prev, startTime: "" }));
    }
    if (form.endTime && !endOptions.some((s) => s.value === form.endTime)) {
      setForm((prev) => ({ ...prev, endTime: "" }));
    }
  }, [form.date, form.doctorId, scheduledDoctors]);
// When branch changes in the form, reset only branch-dependent fields (keep patient selection)
  useEffect(() => {
    if (!form.branchId) return;

    setForm((prev) => ({
      ...prev,
      doctorId: "",
      startTime: "",
      endTime: "",
      // keep patientQuery, notes, status, date as-is
    }));
    setPatientResults([]);
    setError("");
  }, [form.branchId]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    if (name === "patientQuery") {
      setForm((prev) => ({ ...prev, patientQuery: value }));

      const trimmed = value.trim();
      if (!trimmed) {
        setSelectedPatientId(null);
        setPatientResults([]);
        return;
      }
      if (trimmed === form.patientQuery.trim()) {
        return;
      }
      triggerPatientSearch(value);
      return;
    }

    setForm((prev) => {
      if (name === "startTime") {
        const newStart = value;
        let newEnd: string;
        if (!endTimeManuallySet) {
          newEnd = addMinutesToTimeString(newStart, durationMinutes);
        } else {
          newEnd = prev.endTime && prev.endTime > newStart
            ? prev.endTime
            : addMinutesToTimeString(newStart, SLOT_MINUTES);
        }
        return { ...prev, startTime: newStart, endTime: newEnd };
      }

      if (name === "endTime") {
        setEndTimeManuallySet(true);
        return { ...prev, endTime: value };
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

  const triggerPatientSearch = (rawQuery: string) => {
    const query = rawQuery.trim();
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
    if (!query) {
      setPatientResults([]);
      return;
    }

    const qAtSchedule = query.toLowerCase();

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

        const isNumeric = /^[0-9]+$/.test(qAtSchedule);

        const filtered = rawList.filter((p: any) => {
          const regNo = (p.regNo ?? p.regno ?? "")
            .toString()
            .toLowerCase();
          const phone = (p.phone ?? "").toString().toLowerCase();
          const name = (p.name ?? "").toString().toLowerCase();
          const ovog = (p.ovog ?? "").toString().toLowerCase();
          const bookNumber = (p.patientBook?.bookNumber ?? "")
            .toString()
            .toLowerCase();

          if (isNumeric) {
            return (
              regNo.includes(qAtSchedule) ||
              phone.includes(qAtSchedule) ||
              bookNumber.includes(qAtSchedule)
            );
          }

          return (
            regNo.includes(qAtSchedule) ||
            phone.includes(qAtSchedule) ||
            name.includes(qAtSchedule) ||
            ovog.includes(qAtSchedule) ||
            bookNumber.includes(qAtSchedule)
          );
        });

        setPatientResults(
          filtered.map((p: any) => ({
            id: p.id,
            name: p.name,
            ovog: p.ovog ?? null,
            regNo: p.regNo ?? p.regno ?? "",
            phone: p.phone,
            patientBook: p.patientBook || null,
          }))
        );
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
    setSelectedPatientId(p.id);
    setForm((prev) => ({
      ...prev,
      patientQuery: formatPatientSearchLabel(p),
    }));
    setPatientResults([]);
    setError("");
  };

  const getDoctorSchedulesForDate = () => {
    if (!form.doctorId) return [];
    const doctorIdNum = Number(form.doctorId);
    const doc = scheduledDoctors.find((d) => d.id === doctorIdNum);
    if (!doc || !doc.schedules) return [];
    return doc.schedules;
  };

  const isWithinDoctorSchedule = (scheduledAt: Date) => {
    const schedules = getDoctorSchedulesForDate();
    if (schedules.length === 0) return true;
    // scheduledAt is a fake-UTC Date; use getUTCHours/getUTCMinutes for correct HH:mm
    const timeStr = getSlotTimeString(scheduledAt);
    return schedules.some((s: any) =>
      isTimeWithinRange(timeStr, s.startTime, s.endTime)
    );
  };

  const countAppointmentsInSlot = (slotStartDate: Date) => {
    if (!form.doctorId) return 0;
    const doctorIdNum = Number(form.doctorId);

    const slotStart = new Date(slotStartDate);
    const slotEnd = new Date(
      slotStart.getTime() + SLOT_MINUTES * 60 * 1000
    );

    return appointments.filter((a) => {
      if (a.doctorId !== doctorIdNum) return false;
      if (selectedBranchId && String(a.branchId) !== selectedBranchId)
        return false;

      // Ignore cancelled appointments in capacity calculation
      if (a.status === "cancelled") return false;

      const start = naiveToFakeUtcDate(a.scheduledAt);
      if (start.getTime() === 0) return false;

      const end = a.endAt
        ? naiveToFakeUtcDate(a.endAt)
        : new Date(start.getTime() + SLOT_MINUTES * 60 * 1000);

      const dayStr = naiveTimestampToYmd(a.scheduledAt);
      if (dayStr !== form.date) return false;

      return start < slotEnd && end > slotStart;
    }).length;
  };

  const handleQuickPatientChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setQuickPatientForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleQuickPatientSave = async () => {
    setQuickPatientError("");

    if (!quickPatientForm.name.trim() || !quickPatientForm.phone.trim()) {
      setQuickPatientError("Нэр болон утас заавал бөглөнө үү.");
      return;
    }

    const branchIdFromModal = quickPatientForm.branchId
      ? Number(quickPatientForm.branchId)
      : null;
    const branchIdFromForm = form.branchId
      ? Number(form.branchId)
      : selectedBranchId
      ? Number(selectedBranchId)
      : null;

    const branchIdForPatient = !Number.isNaN(branchIdFromModal ?? NaN)
      ? branchIdFromModal
      : branchIdFromForm;

    if (!branchIdForPatient || Number.isNaN(branchIdForPatient)) {
      setQuickPatientError(
        "Шинэ үйлчлүүлэгч бүртгэхийн өмнө салбар сонгоно уу."
      );
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

if (quickPatientForm.ovog.trim()) {
  payload.ovog = quickPatientForm.ovog.trim();
}
if (quickPatientForm.regNo.trim()) {
  payload.regNo = quickPatientForm.regNo.trim();
}


      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data || typeof data.id !== "number") {
        setQuickPatientError(
          (data && (data as any).error) ||
            "Шинэ үйлчлүүлэгч бүртгэх үед алдаа гарлаа."
        );
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

      setSelectedPatientId(p.id);
      setForm((prev) => ({
        ...prev,
        patientQuery: formatPatientSearchLabel(p),
      }));

      setQuickPatientForm({
  ovog: "",
  name: "",
  phone: "",
  branchId: "",
  regNo: "",
 
});
      setShowQuickPatientModal(false);
    } catch (e) {
      console.error(e);
      setQuickPatientError("Сүлжээгээ шалгана уу.");
    } finally {
      setQuickPatientSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.branchId || !form.date || !form.startTime || !form.endTime) {
      setError("Салбар, огноо, эхлэх/дуусах цаг талбаруудыг бөглөнө үү.");
      return;
    }

    if (!selectedPatientId) {
      setError(
        "Үйлчлүүлэгчийг жагсаалтаас хайх эсвэл + товчоор шинэ бүртгэнэ үү."
      );
      return;
    }

    if (!form.doctorId) {
      setError("Эмч сонгоно уу.");
      return;
    }

    const [startHour, startMinute] = form.startTime.split(":").map(Number);
    const [endHour, endMinute] = form.endTime.split(":").map(Number);

    // Validate ordering using minutes arithmetic — no timezone-dependent Date creation
    const startMinutes = (startHour || 0) * 60 + (startMinute || 0);
    const endMinutes = (endHour || 0) * 60 + (endMinute || 0);

    if (endMinutes <= startMinutes) {
      setError("Дуусах цаг нь эхлэх цагаас хойш байх ёстой.");
      return;
    }

    // Build naive timestamps — "YYYY-MM-DD HH:mm:00" — no timezone conversion
    const scheduledAtStr = toNaiveTimestamp(form.date, form.startTime);
    const endAtStr = toNaiveTimestamp(form.date, form.endTime);
    // Create fake-UTC Date for schedule check (uses getUTCHours)
    const scheduledAt = naiveToFakeUtcDate(scheduledAtStr);

    const patientId = selectedPatientId;

    if (form.doctorId && !isWithinDoctorSchedule(scheduledAt)) {
      setError("Сонгосон цагт эмчийн ажлын хуваарь байхгүй байна.");
      return;
    }

    const endFakeUtc = naiveToFakeUtcDate(endAtStr);
    let currentBlockStart = new Date(scheduledAt);
    while (currentBlockStart < endFakeUtc) {
      const existingCount = countAppointmentsInSlot(currentBlockStart);
      if (existingCount >= 2) {
        setError(
          "Энэ цагт 2 захиалга бүртгэгдсэн байна"
        );
        return;
      }
      currentBlockStart = new Date(
        currentBlockStart.getTime() + SLOT_MINUTES * 60 * 1000
      );
    }

    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          doctorId: Number(form.doctorId),
          branchId: Number(form.branchId),
          scheduledAt: scheduledAtStr,
          endAt: endAtStr,
          status: form.status,
          notes: form.notes || null,
        }),
      });
      let data: Appointment | { error?: string };
      try {
        data = await res.json();
      } catch {
        data = { error: "Unknown error" };
      }

      if (res.ok) {
        onCreated(data as Appointment);
        setForm((prev) => ({
          ...prev,
          patientQuery: "",
          startTime: "",
          endTime: "",
          notes: "",
          status: "booked",
          doctorId: "",
        }));
        setSelectedPatientId(null);
        setPatientResults([]);
        setDurationMinutes(30);
        setEndTimeManuallySet(false);
      } else {
        setError((data as any).error || "Алдаа гарлаа");
      }
    } catch {
      setError("Сүлжээгээ шалгана уу");
    }
  };

  // BRANCH + DATE AWARE DOCTOR LIST
  const workingDoctors = useMemo(() => {
    if (!form.date) return [];

    if (scheduledDoctors.length > 0) {
      const branchIdForFilter = form.branchId || selectedBranchId || "";
      const branchNum = branchIdForFilter ? Number(branchIdForFilter) : null;

      return scheduledDoctors.filter((sd) =>
        (sd.schedules || []).some((s) => {
          if (s.date !== form.date) return false;
          if (branchNum !== null && !Number.isNaN(branchNum)) {
            return s.branchId === branchNum;
          }
          return true;
        })
      );
    }

    // fallback – no schedule data
    return doctors;
  }, [scheduledDoctors, doctors, form.branchId, form.date, selectedBranchId]);

  // Clear selected doctor when it's no longer in the working list
  useEffect(() => {
    if (!form.doctorId) return;
    const docId = Number(form.doctorId);
    if (!workingDoctors.some((d) => d.id === docId)) {
      setForm((prev) => ({ ...prev, doctorId: "" }));
    }
  }, [workingDoctors, form.doctorId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        marginBottom: 24,
        display: "grid",
        gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        fontSize: 13,
      }}
    >
      {/* Branch + Patient — same row */}
      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        {/* Branch */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label>Салбар</label>
          <select
            name="branchId"
            value={form.branchId}
            onChange={(e) => {
              handleChange(e);
              setError("");
              onBranchChange(e.target.value);
            }}
            required
            style={{
              borderRadius: 6,
              border: "1px solid #d1d5db",
              padding: "6px 8px",
            }}
          >
            <option value="">Салбар сонгох</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* + button */}
        <button
          type="button"
          onClick={() => {
            setShowQuickPatientModal(true);
            setQuickPatientError("");
            setQuickPatientForm((prev) => ({
              ...prev,
              branchId: prev.branchId || form.branchId || selectedBranchId,
            }));
          }}
          style={{
            padding: "6px 10px",
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

        {/* Patient search */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 200 }}>
          <label>Үйлчлүүлэгч</label>
          <input
            name="patientQuery"
            placeholder="РД, овог, нэр утсаар хайх"
            value={form.patientQuery}
            onChange={handleChange}
            autoComplete="off"
            style={{
              borderRadius: 6,
              border: "1px solid #d1d5db",
              padding: "6px 8px",
            }}
          />
          {patientSearchLoading && (
            <span style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              Үйлчлүүлэгч хайж байна...
            </span>
          )}
        </div>
      </div>

      {patientResults.length > 0 && (
        <div
          style={{
            gridColumn: "1 / -1",
            borderRadius: 6,
            border: "1px solid #e5e7eb",
            background: "#ffffff",
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {patientResults.map((p) => (
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
                background: "white",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              {formatPatientSearchLabel(p)}
            </button>
          ))}
        </div>
      )}

      {/* Doctor */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label>Эмч</label>
        <select
          name="doctorId"
          value={form.doctorId}
          onChange={(e) => {
            handleChange(e);
            setError("");
          }}
          required
          disabled={!form.date || workingDoctors.length === 0}
          style={{
            borderRadius: 6,
            border: "1px solid #d1d5db",
            padding: "6px 8px",
            background: (!form.date || workingDoctors.length === 0) ? "#f3f4f6" : undefined,
          }}
        >
          {!form.date ? (
            <option value="">Эхлээд огноо сонгоно уу.</option>
          ) : workingDoctors.length === 0 ? (
            <option value="">Ажиллах эмч олдсонгүй</option>
          ) : (
            <>
              <option value="">Эмч сонгох</option>
              {workingDoctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatDoctorName(d)}
                </option>
              ))}
            </>
          )}
        </select>
      </div>

      {/* Date */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label>Огноо</label>
        <input
          type="date"
          name="date"
          value={form.date}
          onChange={(e) => {
            handleChange(e);
            setError("");
          }}
          required
          style={{
            borderRadius: 6,
            border: "1px solid #d1d5db",
            padding: "6px 8px",
          }}
        />
      </div>

      {/* Start time */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label>Эхлэх цаг</label>
        <select
          name="startTime"
          value={form.startTime}
          onChange={(e) => {
            handleChange(e);
            setError("");
          }}
          required
          style={{
            borderRadius: 6,
            border: "1px solid #d1d5db",
            padding: "6px 8px",
          }}
        >
          <option value="">Эхлэх цаг</option>
          {dayStartSlots.map((slot) => (
            <option key={slot.value} value={slot.value}>
              {slot.label}
            </option>
          ))}
        </select>
      </div>

      {/* Duration pill buttons */}
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
              setError("");
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

      {/* End time */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label>Дуусах цаг</label>
        <select
          name="endTime"
          value={form.endTime}
          onChange={(e) => {
            handleChange(e);
            setError("");
          }}
          required
          style={{
            borderRadius: 6,
            border: "1px solid #d1d5db",
            padding: "6px 8px",
          }}
        >
          <option value="">Дуусах цаг</option>
          {dayEndSlots.map((slot) => (
            <option key={slot.value} value={slot.value}>
              {slot.label}
            </option>
          ))}
        </select>
      </div>

      {/* Status */}
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
<option value="partial_paid">Үлдэгдэлтэй</option>
<option value="no_show">Ирээгүй</option>
<option value="cancelled">Цуцалсан</option>
<option value="other">Бусад</option>
        </select>
      </div>

      {/* Notes */}
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
          placeholder="Захиалгын товч тэмдэглэл"
          value={form.notes}
          onChange={handleChange}
          style={{
            borderRadius: 6,
            border: "1px solid #d1d5db",
            padding: "6px 8px",
          }}
        />
      </div>

      {/* Submit + error */}
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
        <button
          type="submit"
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "none",
            background: "#2563eb",
            color: "white",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Цаг захиалах
        </button>
        {error && (
          <div style={{ color: "#b91c1c", fontSize: 12, alignSelf: "center" }}>
            {error}
          </div>
        )}
      </div>

      {/* Quick new patient modal */}
      {showQuickPatientModal && (
        /* ... keep your existing quick patient modal as-is ... */
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
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
          >
            <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 15 }}>
              Шинэ үйлчлүүлэгчийн бүртгэл
            </h3>
            <p
              style={{
                marginTop: 0,
                marginBottom: 12,
                color: "#6b7280",
              }}
            >
              Доорхи мэдээллийг заавал бөглөнө үү
              
            </p>
            <div
  style={{
    display: "flex",
    flexDirection: "column",
    gap: 8,
  }}
>
  {/* Овог (optional) */}
  <label
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}
  >
    Овог
    <input
      name="ovog"
      value={quickPatientForm.ovog}
      onChange={handleQuickPatientChange}
      placeholder="Овог оруулна уу"
      style={{
        borderRadius: 6,
        border: "1px solid #d1d5db",
        padding: "6px 8px",
      }}
    />
  </label>

  {/* Нэр (required) */}
  <label
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}
  >
    Нэр
    <input
      name="name"
      value={quickPatientForm.name}
      onChange={handleQuickPatientChange}
      placeholder="Нэр оруулна уу"
      style={{
        borderRadius: 6,
        border: "1px solid #d1d5db",
        padding: "6px 8px",
      }}
    />
  </label>

  {/* Утас (required) */}
  <label
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}
  >
    Утас
    <input
      name="phone"
      value={quickPatientForm.phone}
      onChange={handleQuickPatientChange}
      placeholder="Утас оруулна уу"
      style={{
        borderRadius: 6,
        border: "1px solid #d1d5db",
        padding: "6px 8px",
      }}
    />
  </label>

  {/* РД (optional) */}
  <label
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}
  >
    РД
    <input
      name="regNo"
      value={quickPatientForm.regNo}
      onChange={handleQuickPatientChange}
      placeholder="РД оруулна уу"
      style={{
        borderRadius: 6,
        border: "1px solid #d1d5db",
        padding: "6px 8px",
      }}
    />
  </label>

  {/* Салбар (required – already enforced in logic) */}
  <label
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}
  >
    Салбар
    <select
      name="branchId"
      value={quickPatientForm.branchId}
      onChange={handleQuickPatientChange}
      style={{
        borderRadius: 6,
        border: "1px solid #d1d5db",
        padding: "6px 8px",
      }}
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
    <div
      style={{
        color: "#b91c1c",
        fontSize: 12,
      }}
    >
      {quickPatientError}
    </div>
  )}

       
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 8,
                }}
              >
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
                  Цуцлах
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
  );
}

// ==== Page ====

export default function AppointmentsPage() {
  const router = useRouter();
  const { me } = useAuth();

  // Determine base path: reception routes stay under /reception/appointments
  const isReceptionRoute = router.pathname.startsWith("/reception");

  // Branch lock functionality
  const { isLocked, lockedBranchId, effectiveBranchId, unlock } = useBranchLock();

  // branchId from URL: /appointments?branchId=1
  const branchIdFromQuery =
    typeof router.query.branchId === "string" ? router.query.branchId : "";

  // bookPatientId from URL: pre-select a patient in booking mode on arrival
  const bookPatientIdFromQuery =
    typeof router.query.bookPatientId === "string" ? router.query.bookPatientId : "";

  // Use Mongolia business time for today (independent of browser timezone)
  const todayStr = getBusinessYmd();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [scheduledDoctors, setScheduledDoctors] = useState<ScheduledDoctor[]>(
    []
  );
  // Role and branch are derived from the global auth context (already resolved by _app.tsx)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(me?.role ?? null);
  // Own branch of the logged-in receptionist (from AuthContext)
  const [ownBranchId, setOwnBranchId] = useState<string | null>(
    me?.branchId != null ? String(me.branchId) : null
  );
  const [gridDoctorsOverride, setGridDoctorsOverride] = useState<ScheduledDoctor[] | null>(null);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [error, setError] = useState("");
const [nowPosition, setNowPosition] = useState<number | null>(null);
const [hasMounted, setHasMounted] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

// NEW: per‑day revenue
const [dailyRevenue, setDailyRevenue] = useState<number | null>(null);

// NEW: backend-computed occupancy rate for the selected day + branch
const [apiOccupancy, setApiOccupancy] = useState<{
  occupancyRate: number;
  totalSlots: number;
  bookedSlots: number;
} | null>(null);

// Request ID tracking to prevent stale fetch overwrites
const appointmentsRequestIdRef = useRef(0);
const scheduledDoctorsRequestIdRef = useRef(0);
const revenueRequestIdRef = useRef(0);
const occupancyRequestIdRef = useRef(0);


type DraftAppointmentChange = {
  scheduledAt: string; // ISO
  endAt: string | null; // ISO
  doctorId: number | null;
};

type DragMode = "move" | "resize";

type DragState = {
  appointmentId: number;
  mode: DragMode;
  startClientX: number;
  startClientY: number;

  // original (at drag start)
  origStart: Date;
  origEnd: Date;
  origDoctorId: number | null;

  // computed during drag
  currentDoctorId: number | null;
  
  // track if drag threshold was exceeded
  hasMovedBeyondThreshold: boolean;
};

const [draftEdits, setDraftEdits] = useState<Record<number, DraftAppointmentChange>>({});
const [activeDrag, setActiveDrag] = useState<DragState | null>(null);
const [pendingSaveId, setPendingSaveId] = useState<number | null>(null);
const [pendingSaveError, setPendingSaveError] = useState<string | null>(null);
const [pendingSaving, setPendingSaving] = useState(false);

  // ---- Booking intent (speed booking) ----
  type BookingIntent = {
    patientId: number;
    patientLabel: string;
    doctorId?: number;
  } | null;

  const [bookingIntent, setBookingIntent] = useState<BookingIntent>(null);

  // ---- SSE live indicator ----
  const [sseStatus, setSseStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [lastSseEventAt, setLastSseEventAt] = useState<Date | null>(null);

  // ---- Filter patient search ----
  type FilterPatient = {
    id: number;
    name: string;
    ovog: string | null;
    regNo: string;
    phone: string | null;
    patientBook: { bookNumber: string | null } | null;
  };

  const [filterPatientQuery, setFilterPatientQuery] = useState("");
  const [filterPatientResults, setFilterPatientResults] = useState<FilterPatient[]>([]);
  const [filterPatientSearchLoading, setFilterPatientSearchLoading] = useState(false);
  const filterPatientSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedFilterPatient, setSelectedFilterPatient] = useState<FilterPatient | null>(null);
  const [filterPatientHistory, setFilterPatientHistory] = useState<CompletedHistoryItem[]>([]);
  const [filterPatientHistoryLoading, setFilterPatientHistoryLoading] = useState(false);

  // ---- Filter section quick patient registration modal ----
  const [filterQuickPatientOpen, setFilterQuickPatientOpen] = useState(false);
  const [filterQuickPatientForm, setFilterQuickPatientForm] = useState<{
    ovog: string;
    name: string;
    phone: string;
    branchId: string;
    regNo: string;
  }>({ ovog: "", name: "", phone: "", branchId: "", regNo: "" });
  const [filterQuickPatientError, setFilterQuickPatientError] = useState("");
  const [filterQuickPatientSaving, setFilterQuickPatientSaving] = useState(false);

  // ---- Exceptional appointment modal state ----
  const [showExceptional, setShowExceptional] = useState(false);
  const [exceptionalPatientQuery, setExceptionalPatientQuery] = useState("");
  const [exceptionalPatientResults, setExceptionalPatientResults] = useState<FilterPatient[]>([]);
  const [exceptionalPatientLoading, setExceptionalPatientLoading] = useState(false);
  const exceptionalPatientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exceptionalPatientId, setExceptionalPatientId] = useState<number | null>(null);
  const [exceptionalBranchId, setExceptionalBranchId] = useState("");
  const [exceptionalDoctorId, setExceptionalDoctorId] = useState("");
  const [exceptionalDate, setExceptionalDate] = useState("");
  const [exceptionalStartTime, setExceptionalStartTime] = useState("");
  const [exceptionalNotes, setExceptionalNotes] = useState("");
  const [exceptionalError, setExceptionalError] = useState("");
  const [exceptionalSaving, setExceptionalSaving] = useState(false);

  // ---- Preference popup (before slot picking) ----


  const loadFilterPatientHistory = async (patientId: number) => {
    try {
      setFilterPatientHistoryLoading(true);
      const res = await fetch(`/api/patients/${patientId}/completed-appointments?limit=3`);
      if (!res.ok) { setFilterPatientHistory([]); return; }
      const data = await res.json().catch(() => []);
      setFilterPatientHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load patient history", e);
      setFilterPatientHistory([]);
    } finally {
      setFilterPatientHistoryLoading(false);
    }
  };

  const triggerFilterPatientSearch = (query: string) => {
    if (filterPatientSearchTimerRef.current) clearTimeout(filterPatientSearchTimerRef.current);
    if (!query.trim()) {
      setFilterPatientResults([]);
      return;
    }
    filterPatientSearchTimerRef.current = setTimeout(async () => {
      try {
        setFilterPatientSearchLoading(true);
        const res = await fetch(`/api/patients?q=${encodeURIComponent(query.trim())}&limit=10`);
        if (!res.ok) { setFilterPatientResults([]); return; }
        const data = await res.json().catch(() => []);
        const list = Array.isArray(data) ? data
          : Array.isArray((data as any).data) ? (data as any).data
          : Array.isArray((data as any).patients) ? (data as any).patients
          : [];
        setFilterPatientResults(list.slice(0, 10).map((p: any) => ({
          id: p.id,
          name: p.name,
          ovog: p.ovog ?? null,
          regNo: p.regNo ?? "",
          phone: p.phone ?? null,
          patientBook: p.patientBook || null,
        })));
      } catch {
        setFilterPatientResults([]);
      } finally {
        setFilterPatientSearchLoading(false);
      }
    }, 300);
  };

  const handleSelectFilterPatient = (p: FilterPatient) => {
    setSelectedFilterPatient(p);
    const label = [
      p.ovog && p.name ? `${p.ovog} ${p.name}` : (p.name || p.ovog || ""),
      p.regNo ? `(${p.regNo})` : "",
      p.phone ? `📞 ${p.phone}` : "",
      p.patientBook?.bookNumber ? `#${p.patientBook.bookNumber}` : "",
    ].filter(Boolean).join(" ");
    setFilterPatientQuery(label);
    setFilterPatientResults([]);
    setFilterPatientHistory([]);
    loadFilterPatientHistory(p.id);
    setBookingIntent({ patientId: p.id, patientLabel: label, doctorId: undefined });
  };

  const handleFilterQuickPatientSave = async () => {
    if (!filterQuickPatientForm.name.trim()) {
      setFilterQuickPatientError("Нэр оруулна уу.");
      return;
    }
    if (!filterQuickPatientForm.phone.trim()) {
      setFilterQuickPatientError("Утас оруулна уу.");
      return;
    }
    const branchIdNum = Number(filterQuickPatientForm.branchId);
    if (!filterQuickPatientForm.branchId || Number.isNaN(branchIdNum)) {
      setFilterQuickPatientError("Салбар сонгоно уу.");
      return;
    }
    setFilterQuickPatientSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: filterQuickPatientForm.name.trim(),
        phone: filterQuickPatientForm.phone.trim(),
        branchId: branchIdNum,
        bookNumber: "",
      };
      if (filterQuickPatientForm.ovog.trim()) payload.ovog = filterQuickPatientForm.ovog.trim();
      if (filterQuickPatientForm.regNo.trim()) payload.regNo = filterQuickPatientForm.regNo.trim();
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || typeof data.id !== "number") {
        setFilterQuickPatientError(
          (data && (data as { error?: string }).error) ||
            "Шинэ үйлчлүүлэгч бүртгэх үед алдаа гарлаа."
        );
        setFilterQuickPatientSaving(false);
        return;
      }
      const created: FilterPatient = {
        id: data.id,
        name: data.name,
        ovog: data.ovog ?? null,
        regNo: data.regNo ?? "",
        phone: data.phone ?? null,
        patientBook: data.patientBook || null,
      };
      handleSelectFilterPatient(created);
      setFilterQuickPatientOpen(false);
      setFilterQuickPatientForm({ ovog: "", name: "", phone: "", branchId: "", regNo: "" });
      setFilterQuickPatientError("");
    } catch {
      setFilterQuickPatientError("Шинэ үйлчлүүлэгч бүртгэх үед алдаа гарлаа.");
    } finally {
      setFilterQuickPatientSaving(false);
    }
  };

  const triggerExceptionalPatientSearch = useCallback((query: string) => {
    if (exceptionalPatientTimerRef.current) clearTimeout(exceptionalPatientTimerRef.current);
    if (!query.trim()) {
      setExceptionalPatientResults([]);
      return;
    }
    exceptionalPatientTimerRef.current = setTimeout(async () => {
      try {
        setExceptionalPatientLoading(true);
        const res = await fetch(`/api/patients?q=${encodeURIComponent(query.trim())}&limit=10`);
        if (!res.ok) { setExceptionalPatientResults([]); return; }
        const data = await res.json().catch(() => []);
        const list = Array.isArray(data) ? data
          : Array.isArray((data as any).data) ? (data as any).data
          : Array.isArray((data as any).patients) ? (data as any).patients
          : [];
        setExceptionalPatientResults(list.slice(0, 10).map((p: any) => ({
          id: p.id,
          name: p.name,
          ovog: p.ovog ?? null,
          regNo: p.regNo ?? "",
          phone: p.phone ?? null,
          patientBook: p.patientBook || null,
        })));
      } catch {
        setExceptionalPatientResults([]);
      } finally {
        setExceptionalPatientLoading(false);
      }
    }, 300);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExceptionalSubmit = useCallback(async () => {
    setExceptionalError("");

    if (!exceptionalPatientId) {
      setExceptionalError("Үйлчлүүлэгч сонгоно уу.");
      return;
    }
    if (!exceptionalBranchId) {
      setExceptionalError("Салбар сонгоно уу.");
      return;
    }
    if (!exceptionalDoctorId) {
      setExceptionalError("Эмч сонгоно уу.");
      return;
    }
    if (!exceptionalDate) {
      setExceptionalError("Огноо сонгоно уу.");
      return;
    }
    if (!exceptionalStartTime) {
      setExceptionalError("Эхлэх цаг сонгоно уу.");
      return;
    }

    // Build naive timestamps for the exceptional appointment
    const scheduledAtStr = toNaiveTimestamp(exceptionalDate, exceptionalStartTime);
    const endNaive = (() => {
      const [sh, sm] = exceptionalStartTime.split(":").map(Number);
      const totalMin = (sh || 0) * 60 + (sm || 0) + 60; // +1 hour
      const nh = Math.floor(totalMin / 60) % 24;
      const nm = totalMin % 60;
      return toNaiveTimestamp(exceptionalDate, `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`);
    })();
    const start = naiveToFakeUtcDate(scheduledAtStr);
    const end = naiveToFakeUtcDate(endNaive);

    // Capacity check: each 30-min block in the 1-hour range
    const docIdNum = Number(exceptionalDoctorId);
    let blockStart = new Date(start);
    while (blockStart < end) {
      const slotEnd = new Date(blockStart.getTime() + SLOT_MINUTES * 60_000);
      const count = appointments.filter((a) => {
        if (a.doctorId !== docIdNum) return false;
        if (exceptionalBranchId && String(a.branchId) !== exceptionalBranchId) return false;
        if (a.status === "cancelled") return false;
        const aStart = naiveToFakeUtcDate(a.scheduledAt);
        if (aStart.getTime() === 0) return false;
        const aEnd = a.endAt
          ? naiveToFakeUtcDate(a.endAt)
          : new Date(aStart.getTime() + SLOT_MINUTES * 60_000);
        const dayStr = naiveTimestampToYmd(a.scheduledAt);
        if (dayStr !== exceptionalDate) return false;
        return aStart < slotEnd && aEnd > blockStart;
      }).length;
      if (count >= 2) {
        setExceptionalError("Энэ цагт 2 захиалга бүртгэгдсэн байна");
        return;
      }
      blockStart = new Date(blockStart.getTime() + SLOT_MINUTES * 60_000);
    }

    setExceptionalSaving(true);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: exceptionalPatientId,
          doctorId: docIdNum,
          branchId: Number(exceptionalBranchId),
          scheduledAt: scheduledAtStr,
          endAt: endNaive,
          status: "booked",
          notes: exceptionalNotes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAppointments((prev) => [data as Appointment, ...prev]);
        setShowExceptional(false);
        setExceptionalPatientQuery("");
        setExceptionalPatientId(null);
        setExceptionalPatientResults([]);
        setExceptionalBranchId("");
        setExceptionalDoctorId("");
        setExceptionalDate("");
        setExceptionalStartTime("");
        setExceptionalNotes("");
        setExceptionalError("");
      } else {
        setExceptionalError((data as any).error || "Алдаа гарлаа");
      }
    } catch {
      setExceptionalError("Сүлжээгээ шалгана уу");
    } finally {
      setExceptionalSaving(false);
    }
  }, [exceptionalPatientId, exceptionalBranchId, exceptionalDoctorId, exceptionalDate, exceptionalStartTime, exceptionalNotes, appointments]); // eslint-disable-line react-hooks/exhaustive-deps
const workingDoctorsForFilter = scheduledDoctors.length
  ? scheduledDoctors
  : doctors;
  const [filterDate, setFilterDate] = useState<string>(todayStr);
  // filterBranchId is kept in sync with URL for UI display but NOT used for data fetching
  // Data fetching uses only effectiveBranchId from useBranchLock as single source of truth
  const [filterBranchId, setFilterBranchId] = useState<string>(
    branchIdFromQuery || ""
  );
  const [filterDoctorId, setFilterDoctorId] = useState<string>("");

  // top pills
  const [activeBranchTab, setActiveBranchTab] = useState<string>(
    branchIdFromQuery || ""
  );

  const formSectionRef = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  // Base path for navigation: reception routes always stay under /reception/appointments
  const basePath = isReceptionRoute ? "/reception/appointments" : "/appointments";

  // The currently selected branch (from URL or effectiveBranchId)
  const selectedBranchId = effectiveBranchId || filterBranchId;
  // Reception viewing a branch other than their own
  const isOtherBranchReceptionView =
    currentUserRole === "receptionist" &&
    ownBranchId !== null &&
    selectedBranchId !== "" &&
    selectedBranchId !== ownBranchId;

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Sync role and own branch from auth context whenever me changes
  useEffect(() => {
    if (!me) return;
    const role = me.role ?? null;
    setCurrentUserRole(role);
    if (me.branchId != null) {
      setOwnBranchId(String(me.branchId));
    }
    // Auto-redirect receptionist to own branch when no branchId in URL
    const qBranch = typeof router.query.branchId === "string" ? router.query.branchId : "";
    if (role === "receptionist" && !qBranch && me.branchId != null) {
      router.replace(
        { pathname: "/reception/appointments", query: { branchId: String(me.branchId) } },
        undefined,
        { shallow: true }
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Justification: me is the relevant dependency; router is stable in Next.js.
  }, [me]);

  // keep state in sync when URL branchId changes (from left menu)
  useEffect(() => {
    if (branchIdFromQuery && branchIdFromQuery !== filterBranchId) {
      setFilterBranchId(branchIdFromQuery);
      setActiveBranchTab(branchIdFromQuery);
    }
    if (!branchIdFromQuery && filterBranchId !== "") {
      setFilterBranchId("");
      setActiveBranchTab("");
    }
  }, [branchIdFromQuery, filterBranchId]);

  // Clear data immediately when branch or date changes to prevent showing stale data
  useEffect(() => {
    setAppointments([]);
    setScheduledDoctors([]);
    setGridDoctorsOverride(null);
    setDailyRevenue(null);
    setApiOccupancy(null);
  }, [effectiveBranchId, filterDate]);

  // ---- Hydrate booking mode from bookPatientId query param ----
  // When navigating from patient profile/list with ?bookPatientId=<id>, fetch the patient
  // and pre-select them in booking mode (same as selecting from search field).
  useEffect(() => {
    if (!bookPatientIdFromQuery) return;
    const patientId = Number(bookPatientIdFromQuery);
    if (!patientId || Number.isNaN(patientId)) return;

    let cancelled = false;
    async function hydratePatient() {
      try {
        const res = await fetch(`/api/patients/${patientId}/lite`);
        if (!res.ok || cancelled) return;
        const p = await res.json();
        if (cancelled) return;
        const label = formatPatientSearchLabel({
          id: p.id,
          name: p.name ?? "",
          ovog: p.ovog ?? null,
          regNo: p.regNo ?? "",
          phone: p.phone ?? null,
          patientBook: p.patientBook ?? null,
        });
        setBookingIntent({ patientId: p.id, patientLabel: label, doctorId: undefined });
        setSelectedFilterPatient({
          id: p.id,
          name: p.name ?? "",
          ovog: p.ovog ?? null,
          regNo: p.regNo ?? "",
          phone: p.phone ?? null,
          patientBook: p.patientBook ?? null,
        });
        setFilterPatientQuery(label);
        setFilterPatientResults([]);
        setFilterPatientHistory([]);
        loadFilterPatientHistory(p.id);
        // Remove bookPatientId from URL so refresh doesn't re-trigger
        const newQuery = { ...router.query };
        delete newQuery.bookPatientId;
        router.replace({ pathname: router.pathname, query: newQuery }, undefined, { shallow: true });
      } catch {
        // silently ignore; user can still search manually
      }
    }
    hydratePatient();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookPatientIdFromQuery]);

  // ---- load meta (branches, doctors) ----
  useEffect(() => {
    async function loadMeta() {
      try {
        setError("");
        const branchesRes = await fetch("/api/branches");
        const branchesData = branchesRes.ok
          ? await branchesRes.json().catch(() => [])
          : [];
        setBranches(Array.isArray(branchesData) ? branchesData : []);

        const doctorsRes = await fetch("/api/users?role=doctor");
        const doctorsData = doctorsRes.ok
          ? await doctorsRes.json().catch(() => [])
          : [];
        setDoctors(Array.isArray(doctorsData) ? doctorsData : []);
      } catch (e) {
        console.error(e);
        setBranches([]);
        setDoctors([]);
        setError("Мета мэдээлэл ачаалж чадсангүй.");
      }
    }
    loadMeta();
  }, []);

  // ---- load appointments ----
  const loadAppointments = useCallback(async () => {
    try {
      setError("");
      // Increment request ID and capture it for this request
      appointmentsRequestIdRef.current += 1;
      const currentRequestId = appointmentsRequestIdRef.current;

      const params = new URLSearchParams();
      if (filterDate) params.set("date", filterDate);
      // Only use effectiveBranchId as single source of truth
      if (effectiveBranchId) params.set("branchId", effectiveBranchId);
      if (filterDoctorId) params.set("doctorId", filterDoctorId);

      const res = await fetch(`/api/appointments?${params.toString()}`);
      const data = await res.json().catch(() => []);
      
      // Guard: only update state if this is still the latest request
      if (currentRequestId !== appointmentsRequestIdRef.current) {
        console.debug(`Discarding stale appointments response (req ${currentRequestId}, current ${appointmentsRequestIdRef.current})`);
        return;
      }

      if (!res.ok || !Array.isArray(data)) {
        throw new Error("failed");
      }
      setAppointments(data);
    } catch (e) {
      console.error(e);
      setError("Цаг захиалгуудыг ачаалах үед алдаа гарлаа.");
    }
  }, [filterDate, filterDoctorId, effectiveBranchId]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  // ---- SSE real-time subscription ----
  useEffect(() => {
    if (!filterDate) return;

    const params = new URLSearchParams({ date: filterDate });
    if (effectiveBranchId) params.set("branchId", effectiveBranchId);

    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    function connect() {
      if (closed) return;
      setSseStatus("connecting");
      es = new EventSource(`/api/appointments/stream?${params.toString()}`);

      es.onopen = () => {
        setSseStatus("connected");
      };

      const markEvent = () => {
        setLastSseEventAt(new Date());
      };

      es.addEventListener("appointment_created", (e: MessageEvent) => {
        markEvent();
        try {
          const appt = JSON.parse(e.data) as Appointment;
          // Only apply if the appointment is for the currently viewed date
          const apptDate = appt.scheduledAt ? appt.scheduledAt.slice(0, 10) : "";
          if (apptDate !== filterDate) return;
          // If viewing a specific branch, filter by branch
          if (effectiveBranchId && String(appt.branchId) !== effectiveBranchId) return;
          setAppointments((prev) => {
            const idx = prev.findIndex((a) => a.id === appt.id);
            if (idx !== -1) {
              // SSE arrived after optimistic insert — update in-place (upsert)
              const next = [...prev];
              next[idx] = { ...next[idx], ...appt };
              return next;
            }
            return [appt, ...prev];
          });
          // Keep open details modal in sync
          setDetailsModalState((prev) => ({
            ...prev,
            appointments: prev.appointments.map((a) =>
              a.id === appt.id ? { ...a, ...appt } : a
            ),
          }));
        } catch { /* ignore parse errors */ }
      });

      es.addEventListener("appointment_updated", (e: MessageEvent) => {
        markEvent();
        try {
          const appt = JSON.parse(e.data) as Appointment;
          const apptDate = appt.scheduledAt ? appt.scheduledAt.slice(0, 10) : "";
          const matchesView =
            apptDate === filterDate &&
            (!effectiveBranchId || String(appt.branchId) === effectiveBranchId);
          setAppointments((prev) => {
            const idx = prev.findIndex((a) => a.id === appt.id);
            if (matchesView) {
              if (idx === -1) {
                // Appointment moved into the current view — add it
                return [appt, ...prev];
              }
              const next = [...prev];
              next[idx] = { ...next[idx], ...appt };
              return next;
            } else {
              // Appointment moved out of the current view — remove it
              if (idx !== -1) return prev.filter((a) => a.id !== appt.id);
              return prev;
            }
          });
          // Keep open details modal in sync so buttons (e.g. billing) use fresh data
          setDetailsModalState((prev) => ({
            ...prev,
            appointments: prev.appointments.map((a) =>
              a.id === appt.id ? { ...a, ...appt } : a
            ),
          }));
        } catch { /* ignore parse errors */ }
      });

      es.addEventListener("appointment_deleted", (e: MessageEvent) => {
        markEvent();
        try {
          const payload = JSON.parse(e.data) as { id: number };
          setAppointments((prev) => prev.filter((a) => a.id !== payload.id));
          // Keep open details modal in sync — remove deleted appointment from it
          setDetailsModalState((prev) => ({
            ...prev,
            appointments: prev.appointments.filter((a) => a.id !== payload.id),
          }));
        } catch { /* ignore parse errors */ }
      });

      es.onerror = () => {
        if (closed) return;
        es?.close();
        es = null;
        setSseStatus("disconnected");
        // Simple exponential-ish backoff: retry after 3s
        retryTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      closed = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      es?.close();
    };
  }, [filterDate, effectiveBranchId]);

  // ---- load scheduled doctors ----
  const loadScheduledDoctors = useCallback(async () => {
    try {
      // Increment request ID and capture it for this request
      scheduledDoctorsRequestIdRef.current += 1;
      const currentRequestId = scheduledDoctorsRequestIdRef.current;

      const params = new URLSearchParams();
      // Only use effectiveBranchId as single source of truth
      if (effectiveBranchId) params.set("branchId", effectiveBranchId);
      if (filterDate) params.set("date", filterDate);

      const res = await fetch(`/api/doctors/scheduled?${params.toString()}`);
      const data = await res.json().catch(() => []);
      
      // Guard: only update state if this is still the latest request
      if (currentRequestId !== scheduledDoctorsRequestIdRef.current) {
        console.debug(`Discarding stale scheduledDoctors response (req ${currentRequestId}, current ${scheduledDoctorsRequestIdRef.current})`);
        return;
      }

      if (!res.ok || !Array.isArray(data)) return;
      setScheduledDoctors(data);
      setGridDoctorsOverride(null);
    } catch (e) {
      console.error(e);
    }
  }, [filterDate, effectiveBranchId]);

  useEffect(() => {
    loadScheduledDoctors();
  }, [loadScheduledDoctors]);

  // grid helpers
  const selectedDay = useMemo(() => getDateFromYMD(filterDate), [filterDate]);
  const timeSlots = useMemo(
    () => generateTimeSlotsForDay(selectedDay),
    [selectedDay]
  );

  const firstSlot = timeSlots[0]?.start ?? selectedDay;
  const lastSlot = timeSlots[timeSlots.length - 1]?.end ?? selectedDay;
  const totalMinutes =
    (lastSlot.getTime() - firstSlot.getTime()) / 60000 || 1;
  const columnHeightPx = 60 * (totalMinutes / 60);

// ---- Load daily revenue for selected date + branch ----
useEffect(() => {
  const loadRevenue = async () => {
    try {
      // Increment request ID and capture it for this request
      revenueRequestIdRef.current += 1;
      const currentRequestId = revenueRequestIdRef.current;

      const params = new URLSearchParams();
      if (filterDate) params.set("date", filterDate);
      // Only use effectiveBranchId as single source of truth
      if (effectiveBranchId) params.set("branchId", effectiveBranchId);

      const res = await fetch(`/api/reports/daily-revenue?${params.toString()}`);
      
      // Guard: only update state if this is still the latest request
      if (currentRequestId !== revenueRequestIdRef.current) {
        console.debug(`Discarding stale revenue response (req ${currentRequestId}, current ${revenueRequestIdRef.current})`);
        return;
      }

      if (!res.ok) {
        setDailyRevenue(null);
        return;
      }
      const data = await res.json().catch(() => null);
      if (!data || typeof data.total !== "number") {
        setDailyRevenue(null);
        return;
      }
      setDailyRevenue(data.total);
    } catch {
      setDailyRevenue(null);
    }
  };

  loadRevenue();
}, [filterDate, effectiveBranchId]);

// ---- Load backend-computed occupancy rate for selected date + branch ----
useEffect(() => {
  const loadOccupancy = async () => {
    try {
      occupancyRequestIdRef.current += 1;
      const currentRequestId = occupancyRequestIdRef.current;

      const params = new URLSearchParams();
      if (filterDate) params.set("date", filterDate);
      if (effectiveBranchId) params.set("branchId", effectiveBranchId);

      const res = await fetch(`/api/appointments/occupancy?${params.toString()}`);

      if (currentRequestId !== occupancyRequestIdRef.current) return;

      if (!res.ok) {
        setApiOccupancy(null);
        return;
      }
      const data = await res.json().catch(() => null);
      if (
        !data ||
        typeof data.occupancyRate !== "number" ||
        typeof data.totalSlots !== "number" ||
        typeof data.bookedSlots !== "number"
      ) {
        setApiOccupancy(null);
        return;
      }
      setApiOccupancy({
        occupancyRate: data.occupancyRate,
        totalSlots: data.totalSlots,
        bookedSlots: data.bookedSlots,
      });
    } catch {
      setApiOccupancy(null);
    }
  };

  loadOccupancy();
}, [filterDate, effectiveBranchId, lastSseEventAt]);

  // current time line
  useEffect(() => {
    const updateNow = () => {
      const now = new Date();
      const nowKey = getBusinessYmd(now);
      if (nowKey !== filterDate) {
        setNowPosition(null);
        return;
      }

      // Build a fake-UTC Date representing "now" in Mongolia wall time.
      // This lets us compare with slot fake-UTC Dates from generateTimeSlotsForDay.
      const fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Ulaanbaatar",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(now);
      const hh = fmt.find((p) => p.type === "hour")?.value ?? "00";
      const mm = fmt.find((p) => p.type === "minute")?.value ?? "00";
      const ss = fmt.find((p) => p.type === "second")?.value ?? "00";
      const nowFakeUtc = naiveToFakeUtcDate(`${nowKey} ${hh}:${mm}:${ss}`);

      const clamped = Math.min(
        Math.max(nowFakeUtc.getTime(), firstSlot.getTime()),
        lastSlot.getTime()
      );
      const minutesFromStart = (clamped - firstSlot.getTime()) / 60000;
      const pos = (minutesFromStart / totalMinutes) * columnHeightPx;
      setNowPosition(pos);
    };

    updateNow();
    const id = setInterval(updateNow, 60_000);
    return () => clearInterval(id);
  }, [filterDate, firstSlot, lastSlot, totalMinutes, columnHeightPx]);

  // Auto-flip doctor order at 15:00 when viewing today
  useEffect(() => {
    const todayCurrent = getBusinessYmd();
    if (filterDate !== todayCurrent) return;

    // Use Mongolia time (UTC+8) to match backend threshold check
    const mongoliaMinutes = (d: Date) => {
      const mg = new Date(d.getTime() + 8 * 3600000);
      return mg.getUTCHours() * 60 + mg.getUTCMinutes();
    };

    let wasAfter15 = mongoliaMinutes(new Date()) >= 15 * 60;

    const id = setInterval(() => {
      const now = new Date();
      const isAfter15 = mongoliaMinutes(now) >= 15 * 60;
      if (isAfter15 !== wasAfter15) {
        wasAfter15 = isAfter15;
        loadScheduledDoctors();
        // Stop polling after the transition — swap happens once per day
        clearInterval(id);
      }
    }, 30_000);

    return () => clearInterval(id);
  }, [filterDate, loadScheduledDoctors]);

  // gridDoctors with fallback
  const gridDoctors: ScheduledDoctor[] = useMemo(() => {
  if (gridDoctorsOverride !== null) {
    return gridDoctorsOverride;
  }

  const sortFn = (a: ScheduledDoctor, b: ScheduledDoctor) => {
    const ao = a.calendarOrder != null ? a.calendarOrder : Number.MAX_SAFE_INTEGER;
    const bo = b.calendarOrder != null ? b.calendarOrder : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return (a.name || "").localeCompare((b.name || ""), "mn");
  };

  const dayKey = filterDate;

  // Start with scheduled doctors (preserves backend ordering)
  const byDoctor: Record<number, ScheduledDoctor> = {};
  for (const sd of scheduledDoctors) {
    byDoctor[sd.id] = sd;
  }

  // Add doctors who have appointments that day but are not in scheduledDoctors
  for (const a of appointments) {
    if (!a.doctorId) continue;
    if (getAppointmentDayKey(a) !== dayKey) continue;
    if (byDoctor[a.doctorId]) continue;
    const baseDoc = doctors.find((d) => d.id === a.doctorId);
    if (!baseDoc) continue;
    byDoctor[a.doctorId] = { ...baseDoc, schedules: [] };
  }

  const scheduledIds = scheduledDoctors.map((d) => d.id);
  return Object.values(byDoctor).sort((a, b) => {
    const ai = scheduledIds.indexOf(a.id);
    const bi = scheduledIds.indexOf(b.id);
    // Scheduled doctors first (in their original order)
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    // Both unscheduled: sort by calendarOrder/name
    return sortFn(a, b);
  });
}, [gridDoctorsOverride, scheduledDoctors, appointments, doctors, filterDate]);

  const moveDocInGrid = useCallback(async (doctorId: number, direction: "left" | "right") => {
    if (reorderSaving) return;
    const list = gridDoctors;
    const idx = list.findIndex((d) => d.id === doctorId);
    if (idx === -1) return;
    if (direction === "left" && idx === 0) return;
    if (direction === "right" && idx === list.length - 1) return;

    const swapIdx = direction === "left" ? idx - 1 : idx + 1;

    // Snapshot previous state for rollback on failure
    const prevList = [...list];

    // Swap by index and renumber to unique values
    const reordered = [...list];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const renumbered = reordered.map((d, i) => ({ ...d, calendarOrder: i * 10 }));

    // Only persist doctors whose calendarOrder actually changed
    const changedDoctors = renumbered.filter((d) => {
      const old = prevList.find((p) => p.id === d.id);
      return old?.calendarOrder !== d.calendarOrder;
    });

    setGridDoctorsOverride(renumbered);
    setReorderSaving(true);
    try {
      const results = await Promise.all(
        changedDoctors.map((d) =>
          fetch(`/api/users/${d.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ calendarOrder: d.calendarOrder }),
          })
        )
      );
      if (results.some((r) => !r.ok)) {
        throw new Error("Failed to update calendarOrder");
      }
    } catch (err) {
      console.error("Failed to update calendarOrder", err);
      setGridDoctorsOverride(prevList);
      setError("Дараалал хадгалахад алдаа гарлаа");
    } finally {
      setReorderSaving(false);
    }
  }, [reorderSaving, gridDoctors]);

  function snapMinutesToSlot(mins: number, slot = SLOT_MINUTES) {
  return Math.round(mins / slot) * slot;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// convert a clientY to minutes from firstSlot using columnHeightPx/totalMinutes
function clientYToMinutesFromStart(clientY: number, columnTop: number) {
  const yWithin = clientY - columnTop;
  const ratio = yWithin / columnHeightPx;
  const minutes = ratio * totalMinutes;
  return minutes;
}

// Determine doctor column from mouse X.
// You have 80px time column, then each doctor column = 180px
function clientXToDoctorId(clientX: number, gridLeft: number) {
  const TIME_COL_W = 80;
  const DOC_COL_W = 180;

  const xWithin = clientX - gridLeft - TIME_COL_W;
  const idx = Math.floor(xWithin / DOC_COL_W);
  if (idx < 0 || idx >= gridDoctors.length) return null;
  return gridDoctors[idx].id;
}

const fillingStats = useMemo(() => {
  // Capacity slots: unique schedule slots per doctor
  const capacity = new Set<string>();

  for (const doc of gridDoctors) {
    const schedules = (doc.schedules || []) as any[];

    // If schedules are present, use them (best).
    // If schedules are missing, fallback to clinic visual hours (generateTimeSlotsForDay)
    if (schedules.length > 0) {
      for (const s of schedules) {
        const startTime = String(s.startTime || "");
        const endTime = String(s.endTime || "");
        if (!startTime || !endTime) continue;

        const [sh, sm] = startTime.split(":").map(Number);
        const [eh, em] = endTime.split(":").map(Number);
        if (
          !Number.isFinite(sh) ||
          !Number.isFinite(sm) ||
          !Number.isFinite(eh) ||
          !Number.isFinite(em)
        )
          continue;

        const start = new Date(
          selectedDay.getFullYear(),
          selectedDay.getMonth(),
          selectedDay.getDate(),
          sh,
          sm,
          0,
          0
        );
        const end = new Date(
          selectedDay.getFullYear(),
          selectedDay.getMonth(),
          selectedDay.getDate(),
          eh,
          em,
          0,
          0
        );

        for (const slotStart of enumerateSlotStartsOverlappingRange(
          start,
          end,
          SLOT_MINUTES
        )) {
          capacity.add(getSlotKey(doc.id, slotStart));
        }
      }
    } else {
      // fallback to your existing visual working window
      for (const slot of generateTimeSlotsForDay(selectedDay)) {
        capacity.add(getSlotKey(doc.id, slot.start));
      }
    }
  }

  // Filled slots: unique occupied slots per doctor
  const filled = new Set<string>();

  // appointments already filtered by branch/date above? If not, filter here:
  const dayKey = filterDate;

  for (const a of appointments) {
    // ✅ exclude cancelled
    if (a.status === "cancelled") continue;

    // must have doctor to count against doctor capacity
    if (a.doctorId == null) continue;

    // ensure it’s the current day (and branch if selected)
    if (getAppointmentDayKey(a) !== dayKey) continue;
    // Only use effectiveBranchId as single source of truth
    if (effectiveBranchId && String(a.branchId) !== effectiveBranchId) continue;

    const start = naiveToFakeUtcDate(a.scheduledAt);
    const end = a.endAt ? naiveToFakeUtcDate(a.endAt) : addMinutes(start, SLOT_MINUTES);

    if (start.getTime() === 0) continue;
    if (end <= start) continue;

    // mark all overlapping 30-min slots as filled
    for (const slotStart of enumerateSlotStartsOverlappingRange(
      start,
      end,
      SLOT_MINUTES
    )) {
      const key = getSlotKey(a.doctorId, slotStart);
      // only count if it exists in capacity (inside working schedule)
      if (capacity.has(key)) filled.add(key);
    }
  }

  const totalSlots = capacity.size;
  const filledSlots = filled.size;
  const percent = totalSlots === 0 ? 0 : Math.round((filledSlots / totalSlots) * 100);

  return { totalSlots, filledSlots, percent };
}, [appointments, gridDoctors, selectedDay, filterDate, effectiveBranchId]);

  
  // lane map
  const laneById: Record<number, 0 | 1> = useMemo(() => {
    const map: Record<number, 0 | 1> = {};
    const dayKey = filterDate;

    const byDoctor: Record<number, Appointment[]> = {};
    for (const a of appointments) {
      if (!a.doctorId) continue;
      if (a.status === "cancelled") continue;
      if (naiveTimestampToYmd(a.scheduledAt) !== dayKey) continue;
      if (effectiveBranchId && String(a.branchId) !== effectiveBranchId) continue;
      if (!byDoctor[a.doctorId]) byDoctor[a.doctorId] = [];
      byDoctor[a.doctorId].push(a);
    }

    for (const list of Object.values(byDoctor)) {
      const lanes = computeAppointmentLanesForDayAndDoctor(list);
      for (const [idStr, lane] of Object.entries(lanes)) {
        map[Number(idStr)] = lane;
      }
    }

    return map;
  }, [appointments, filterDate, effectiveBranchId]);

// ---- Daily stats (for selected date & branch) ----
const dayKey = filterDate;

// All appointments for this day (and branch, if selected), excluding cancelled.
// Used for grid rendering — not for stats (dayAppointments includes cancelled for totals).
const visibleAppointments = useMemo(
  () =>
    appointments.filter((a) => {
      const scheduled = a.scheduledAt;
      if (!scheduled) return false;
      if (naiveTimestampToYmd(scheduled) !== dayKey) return false;
      if (effectiveBranchId && String(a.branchId) !== effectiveBranchId) return false;
      if (String(a.status).toLowerCase() === "cancelled") return false;
      return true;
    }),
  [appointments, dayKey, effectiveBranchId]
);

// Performance index: appointments by doctorId for the visible day/branch
// (non-cancelled). Avoids repeated O(n) filter in the hot render path.
const appointmentsByDoctorId = useMemo(() => {
  const map = new Map<number, Appointment[]>();
  for (const a of visibleAppointments) {
    if (a.doctorId == null) continue;
    const list = map.get(a.doctorId) ?? [];
    list.push(a);
    map.set(a.doctorId, list);
  }
  return map;
}, [visibleAppointments]);

// All appointments for this day (and branch, if selected)
const dayAppointments = useMemo(
  () =>
    appointments.filter((a) => {
      const scheduled = a.scheduledAt;
      if (!scheduled) return false;
      const key = scheduled.slice(0, 10);
      if (key !== dayKey) return false;
      // Only use effectiveBranchId as single source of truth
      if (effectiveBranchId && String(a.branchId) !== effectiveBranchId) return false;
      return true;
    }),
  [appointments, dayKey, effectiveBranchId]
);

// ---- Checked-in patient queue (for reception) ----
// Shows patients who have checked in, ordered by checkedInAt, excluding ongoing/completed
const checkedInQueue = useMemo(
  () =>
    appointments
      .filter((a) => {
        if (!a.checkedInAt) return false;
        const scheduled = a.scheduledAt;
        if (!scheduled) return false;
        if (scheduled.slice(0, 10) !== dayKey) return false;
        if (effectiveBranchId && String(a.branchId) !== effectiveBranchId) return false;
        const s = String(a.status || "").toLowerCase();
        if (s === "ongoing" || s === "completed") return false;
        return true;
      })
      .sort((a, b) => {
        const ta = a.checkedInAt ? new Date(a.checkedInAt).getTime() : 0;
        const tb = b.checkedInAt ? new Date(b.checkedInAt).getTime() : 0;
        return ta - tb;
      }),
  [appointments, dayKey, effectiveBranchId]
);

// 1) Нийт цаг захиалга – all appointments for the day
const totalAppointmentsForDay = dayAppointments.length;

// 2) Хуваарьт эмчийн тоо – unique doctors who have schedule or appointments that day
const totalScheduledDoctorsForDay = useMemo(() => {
  const ids = new Set<number>();

  // from scheduledDoctors list (already filtered by date & branch in your loader)
  scheduledDoctors.forEach((d) => ids.add(d.id));

  // fallback: if no scheduledDoctors were loaded, derive from appointments
  if (ids.size === 0) {
    dayAppointments.forEach((a) => {
      if (a.doctorId != null) ids.add(a.doctorId);
    });
  }

  return ids.size;
}, [scheduledDoctors, dayAppointments]);

// 3) Үйлчлүүлэгчдийн тоо – unique patients with completed appointments that day
const totalCompletedPatientsForDay = useMemo(() => {
  const ids = new Set<number>();
  dayAppointments.forEach((a) => {
    if (a.status === "completed" && a.patientId != null) {
      ids.add(a.patientId);
    }
  });
  return ids.size;
}, [dayAppointments]);
  
  const [detailsModalState, setDetailsModalState] = useState<{
    open: boolean;
    doctor?: Doctor | null;
    slotLabel?: string;
    slotTime?: string;
    date?: string;
    appointments: Appointment[];
    slotAppointmentCount?: number;
  }>({
    open: false,
    appointments: [],
  });

  const [quickModalState, setQuickModalState] = useState<{
    open: boolean;
    doctorId?: number;
    date: string;
    time: string;
    branchId?: string;
  }>({
    open: false,
    date: filterDate,
    time: "09:00",
  });

  const handleBranchTabClick = (branchId: string) => {
    setActiveBranchTab(branchId);
    setFilterBranchId(branchId);

    const query = branchId ? { branchId } : {};
    router.push(
      { pathname: basePath, query },
      undefined,
      { shallow: true }
    );
  };

const getStatusColor = (status: string): string => {
  switch (status) {
    case "completed":
      return "#22c55e";
    case "confirmed":
      return "#3b82f6";
    case "online":
      return "#6366f1"; // indigo
    case "ongoing":
      return "#16a34a"; // green
    case "imaging":
      return "#8b5cf6"; // purple
    case "ready_to_pay":
      return "#fbbf24"; // amber
    case "partial_paid":
      return "#eab308"; // yellow
    case "no_show":
      return "#ef4444"; // red
    case "cancelled":
      return "#dc2626"; // dark red
    case "other":
      return "#94a3b8"; // gray
    default:
      return "#cbd5f5"; // booked
  }
};

// ---- Drag/Resize handlers ----
useEffect(() => {
  if (!activeDrag) return;

  const DRAG_THRESHOLD_PX = 5; // 5 pixels before considering it a drag

  const handleMouseMove = (e: MouseEvent) => {
    if (!activeDrag || !gridRef.current) return;

    const gridRect = gridRef.current.getBoundingClientRect();
    const gridLeft = gridRect.left;
    const gridTop = gridRect.top;

    const TIME_COL_W = 80;
    const DOC_COL_W = 180;

    // Calculate distance moved from start
    const deltaX = Math.abs(e.clientX - activeDrag.startClientX);
    const deltaY = Math.abs(e.clientY - activeDrag.startClientY);
    const distanceMoved = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Check if threshold exceeded
    const exceededThreshold = distanceMoved >= DRAG_THRESHOLD_PX;

    if (activeDrag.mode === "move") {
      // Calculate new position
      const deltaYSigned = e.clientY - activeDrag.startClientY;
      const deltaMinutes = (deltaYSigned / columnHeightPx) * totalMinutes;
      const newStartMinutes = (activeDrag.origStart.getTime() - firstSlot.getTime()) / 60000 + deltaMinutes;
      const snappedStart = snapMinutesToSlot(newStartMinutes);
      const clampedStart = clamp(snappedStart, 0, totalMinutes - SLOT_MINUTES);

      const duration = (activeDrag.origEnd.getTime() - activeDrag.origStart.getTime()) / 60000;
      const clampedEnd = clamp(clampedStart + duration, SLOT_MINUTES, totalMinutes);

      const newStart = new Date(firstSlot.getTime() + clampedStart * 60000);
      const newEnd = new Date(firstSlot.getTime() + clampedEnd * 60000);

      // Check which doctor column
      const xWithin = e.clientX - gridLeft - TIME_COL_W;
      const docIdx = Math.floor(xWithin / DOC_COL_W);
      const newDoctorId = (docIdx >= 0 && docIdx < gridDoctors.length) 
        ? gridDoctors[docIdx].id 
        : activeDrag.origDoctorId;

      // Only create draft if threshold exceeded
      if (exceededThreshold) {
        setDraftEdits(prev => ({
          ...prev,
          [activeDrag.appointmentId]: {
            scheduledAt: fakeUtcDateToNaive(newStart),
            endAt: fakeUtcDateToNaive(newEnd),
            doctorId: newDoctorId,
          }
        }));

        setActiveDrag(prev => prev ? { 
          ...prev, 
          currentDoctorId: newDoctorId,
          hasMovedBeyondThreshold: true 
        } : null);
      } else {
        // Update tracking but don't create draft yet
        setActiveDrag(prev => prev ? { 
          ...prev, 
          currentDoctorId: newDoctorId,
          hasMovedBeyondThreshold: false 
        } : null);
      }
    } else if (activeDrag.mode === "resize") {
      // Resize: adjust end time only
      const deltaYSigned = e.clientY - activeDrag.startClientY;
      const deltaMinutes = (deltaYSigned / columnHeightPx) * totalMinutes;
      
      const origDuration = (activeDrag.origEnd.getTime() - activeDrag.origStart.getTime()) / 60000;
      const newDuration = origDuration + deltaMinutes;
      const snappedDuration = snapMinutesToSlot(newDuration);
      const clampedDuration = clamp(snappedDuration, SLOT_MINUTES, totalMinutes);

      const startMinutes = (activeDrag.origStart.getTime() - firstSlot.getTime()) / 60000;
      const endMinutes = clamp(startMinutes + clampedDuration, SLOT_MINUTES, totalMinutes);

      const newEnd = new Date(firstSlot.getTime() + endMinutes * 60000);

      // Only create draft if threshold exceeded
      if (exceededThreshold) {
        setDraftEdits(prev => ({
          ...prev,
          [activeDrag.appointmentId]: {
            scheduledAt: fakeUtcDateToNaive(activeDrag.origStart),
            endAt: fakeUtcDateToNaive(newEnd),
            doctorId: activeDrag.origDoctorId,
          }
        }));

        setActiveDrag(prev => prev ? { ...prev, hasMovedBeyondThreshold: true } : null);
      } else {
        // Update tracking but don't create draft yet
        setActiveDrag(prev => prev ? { ...prev, hasMovedBeyondThreshold: false } : null);
      }
    }
  };

  const handleMouseUp = () => {
    if (!activeDrag) return;

    // Only show save/cancel UI if drag threshold was exceeded
    if (activeDrag.hasMovedBeyondThreshold) {
      const draft = draftEdits[activeDrag.appointmentId];
      if (draft) {
        // Preflight capacity check: max 2 overlapping (excluding cancelled, excluding this appt)
        const draftStart = naiveToFakeUtcDate(draft.scheduledAt);
        const draftEnd = draft.endAt
          ? naiveToFakeUtcDate(draft.endAt)
          : new Date(draftStart.getTime() + SLOT_MINUTES * 60_000);
        const draftDoctorId = draft.doctorId ?? activeDrag.origDoctorId;
        const draftDate = naiveTimestampToYmd(draft.scheduledAt);

        if (draftDoctorId !== null) {
          const overlapping = appointments.filter((other) => {
            if (other.id === activeDrag.appointmentId) return false;
            if (other.doctorId !== draftDoctorId) return false;
            if (String(other.status).toLowerCase() === "cancelled") return false;
            if (naiveTimestampToYmd(other.scheduledAt) !== draftDate) return false;
            const os = naiveToFakeUtcDate(other.scheduledAt);
            const oe = other.endAt
              ? naiveToFakeUtcDate(other.endAt)
              : new Date(os.getTime() + SLOT_MINUTES * 60_000);
            return os < draftEnd && oe > draftStart;
          }).length;

          if (overlapping >= 2) {
            // Capacity exceeded — revert draft immediately without showing save bar
            setDraftEdits((prev) => {
              const next = { ...prev };
              delete next[activeDrag.appointmentId];
              return next;
            });
            setPendingSaveError("Энэ цагт 2 захиалга бүртгэгдсэн байна");
            setPendingSaveId(null);
            setActiveDrag(null);
            return;
          }
        }
      }
      setPendingSaveId(activeDrag.appointmentId);
      setPendingSaveError(null);
    }

    setActiveDrag(null);
  };

  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);

  return () => {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  };
}, [activeDrag, columnHeightPx, totalMinutes, firstSlot, gridDoctors]);

// ---- Save/Cancel handlers ----
const handleSaveDraft = async (appointmentId: number) => {
  const draft = draftEdits[appointmentId];
  if (!draft) return;

  setPendingSaving(true);
  setPendingSaveError(null);

  try {
    const res = await fetch(`/api/appointments/${appointmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduledAt: draft.scheduledAt,
        endAt: draft.endAt,
        doctorId: draft.doctorId,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setPendingSaveError((data && data.error) || `Хадгалахад алдаа гарлаа (${res.status})`);
      // On 409 (capacity exceeded), automatically revert the draft so the appointment
      // snaps back to its original position in the UI
      if (res.status === 409) {
        setDraftEdits(prev => {
          const next = { ...prev };
          delete next[appointmentId];
          return next;
        });
      }
      return;
    }

    // Update appointments list
    setAppointments(prev => 
      prev.map(a => a.id === appointmentId ? { ...a, ...data } : a)
    );

    // Clear draft and pending state
    setDraftEdits(prev => {
      const next = { ...prev };
      delete next[appointmentId];
      return next;
    });
    setPendingSaveId(null);
    setPendingSaveError(null);
  } catch (e) {
    console.error("Save draft error:", e);
    setPendingSaveError("Сүлжээгээ шалгана уу.");
  } finally {
    setPendingSaving(false);
  }
};

const handleCancelDraft = (appointmentId: number) => {
  setDraftEdits(prev => {
    const next = { ...prev };
    delete next[appointmentId];
    return next;
  });
  setPendingSaveId(null);
  setPendingSaveError(null);
};

 return (
  <main
    style={{
      margin: "16px 0",
      padding: 24,
      fontFamily: "sans-serif",
    }}
  >
{/* ready_to_pay blink/pulse animation */}
<style jsx global>{`
  @keyframes readyToPayPulse {
    0%   { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); }
    70%  { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0.00); }
    100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.00); }
  }
  @keyframes readyToPayBlink {
    0%, 100% { filter: saturate(1); opacity: 1; }
    50%      { filter: saturate(1.8); opacity: 0.82; }
  }
`}</style>
{/* Calendar view with doctor-columns time grid (all screen sizes) */}
<div>
<h1 style={{ fontSize: 20, margin: "4px 0 8px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
  Цаг захиалга
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 5,
    fontSize: 12, fontWeight: 500, borderRadius: 20,
    padding: "2px 10px",
    background: sseStatus === "connected" ? "#dcfce7" : sseStatus === "disconnected" ? "#fee2e2" : "#fef9c3",
    color: sseStatus === "connected" ? "#15803d" : sseStatus === "disconnected" ? "#b91c1c" : "#854d0e",
    border: `1px solid ${sseStatus === "connected" ? "#86efac" : sseStatus === "disconnected" ? "#fca5a5" : "#fde68a"}`,
  }}>
    <span style={{
      width: 7, height: 7, borderRadius: "50%",
      background: sseStatus === "connected" ? "#22c55e" : sseStatus === "disconnected" ? "#ef4444" : "#eab308",
      display: "inline-block",
    }} />
    {sseStatus === "connected" ? "Live: Connected" : sseStatus === "disconnected" ? "Live: Disconnected" : "Reconnecting…"}
    {sseStatus === "connected" && lastSseEventAt && (
      <span style={{ opacity: 0.75 }}>
        · Last update: {lastSseEventAt.toLocaleTimeString("mn-MN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
    )}
  </span>
</h1>
{!isReceptionRoute && (
<p style={{ color: "#6b7280", fontSize: 13, marginBottom: 12 }}>
  Эмч, үйлчлүүлэгч, салбарын цаг захиалгыг харах болон удирдах хэсэг
</p>
)}

{/* Small branch switcher — only for receptionist, no "Бүх салбар" option */}
{currentUserRole === "receptionist" && branches.length > 0 && (
  <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>Салбар:</span>
      <select
        value={selectedBranchId}
        onChange={(e) => {
          const value = e.target.value;
          if (!value) return;
          setFilterBranchId(value);
          setActiveBranchTab(value);
          router.push(
            { pathname: basePath, query: { branchId: value } },
            undefined,
            { shallow: true }
          );
        }}
        style={{
          borderRadius: 6,
          border: "1px solid #d1d5db",
          padding: "5px 10px",
          fontSize: 13,
          background: "white",
          cursor: "pointer",
        }}
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
    <PriceListSearch />
  </div>
)}

{/* NEW: Daily stats cards (colored) */}
{/* Checked-in patient queue */}
{checkedInQueue.length > 0 && (
  <section style={{ marginBottom: 16 }}>
    <div
      style={{
        fontSize: 13,
        fontWeight: 700,
        color: "#1d4ed8",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 8,
      }}
    >
      🚪 Ирсэн үйлчлүүлэгчид ({checkedInQueue.length})
    </div>
    <div
      style={{
        display: "flex",
        gap: 10,
        overflowX: "auto",
        paddingBottom: 4,
      }}
    >
      {checkedInQueue.map((a) => {
        const patientDisplay = [a.patientOvog ? a.patientOvog.charAt(0) + "." : null, a.patientName]
          .filter(Boolean)
          .join("");
        const doctorDisplay =
  a.doctorOvog || a.doctorName
    ? (() => {
        const initial = a.doctorOvog?.trim()?.[0]
          ? `${a.doctorOvog.trim()[0]}.`
          : "";

        const raw = (a.doctorName || "").trim();
        if (!raw) return initial || null;

        // If doctorName is stored like "Шинэ Туршилтэмч", keep only last token
        const parts = raw.split(/\s+/).filter(Boolean);
        const given = parts.length > 1 ? parts[parts.length - 1] : raw;

        return `${initial}${given}`;
      })()
    : null;
        const timeStr = a.scheduledAt
          ? naiveTimestampToHm(a.scheduledAt)
          : null;
        return (
          <div
            key={a.id}
            style={{
              flexShrink: 0,
              minWidth: 160,
              maxWidth: 200,
              background: "linear-gradient(135deg,#eff6ff,#fff)",
              border: "1px solid #bfdbfe",
              borderRadius: 12,
              padding: "10px 14px",
              boxShadow: "0 2px 8px rgba(30,58,138,0.07)",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#1e3a8a",
                marginBottom: 4,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {patientDisplay || "—"}
            </div>
            {doctorDisplay && (
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 2 }}>
                👨‍⚕️ {doctorDisplay}
              </div>
            )}
            {timeStr && (
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 2 }}>
                🕐 {timeStr}
              </div>
            )}
            {a.branch?.name && !effectiveBranchId && (
              <div
                style={{
                  display: "inline-block",
                  fontSize: 10,
                  background: "#dbeafe",
                  color: "#1d4ed8",
                  borderRadius: 6,
                  padding: "1px 6px",
                  marginTop: 2,
                }}
              >
                {a.branch.name}
              </div>
            )}
          </div>
        );
      })}
    </div>
  </section>
)}

<section
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 12,
    marginBottom: 16,
  }}
>
  {/* Нийт цаг дүүргэлт, Хуваарьт эмчийн тоо, Үйлчлүүлэгчдийн тоо — hidden for receptionist role */}
  {currentUserRole !== "receptionist" && (
  <>
  {/* Нийт цаг захиалга */}
  <div
    style={{
      background: "linear-gradient(90deg,#eff6ff,#ffffff)",
      borderRadius: 12,
      border: "1px solid #dbeafe",
      boxShadow: "0 8px 16px rgba(15,23,42,0.06)",
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          color: "#1d4ed8",
          fontWeight: 700,
          letterSpacing: 0.5,
        }}
      >
        Нийт цаг дүүргэлт
      </div>
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: "999px",
          background:
            "radial-gradient(circle at 30% 30%,#bfdbfe,#1d4ed8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: 16,
        }}
      >
        📅
      </div>
    </div>
    <div style={{ fontSize: 26, fontWeight: 700, color: "#111827" }}>
      {apiOccupancy != null ? apiOccupancy.occupancyRate : fillingStats.percent}%
    </div>
    <div style={{ fontSize: 11, color: "#6b7280" }}>
      {apiOccupancy != null
        ? `${apiOccupancy.bookedSlots}/${apiOccupancy.totalSlots} цаг захиалагдсан`
        : `${formatDateYmdDash(selectedDay)} өдрийн нийт цаг дүүргэлт`}
    </div>
  </div>

  {/* Хуваарьт эмчийн тоо */}
  <div
    style={{
      background: "linear-gradient(90deg,#fef9c3,#ffffff)",
      borderRadius: 12,
      border: "1px solid #facc15",
      boxShadow: "0 8px 16px rgba(15,23,42,0.06)",
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          color: "#b45309",
          fontWeight: 700,
          letterSpacing: 0.5,
        }}
      >
        Хуваарьт эмчийн тоо
      </div>
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: "999px",
          background:
            "radial-gradient(circle at 30% 30%,#fde68a,#f59e0b)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: 16,
        }}
      >
        🩺
      </div>
    </div>
    <div style={{ fontSize: 26, fontWeight: 700, color: "#111827" }}>
      {totalScheduledDoctorsForDay}
    </div>
    <div style={{ fontSize: 11, color: "#6b7280" }}>
      Сонгосон өдөрт ажиллаж буй эмч
    </div>
  </div>

  {/* Үйлчлүүлэгчдийн тоо (completed) */}
  <div
    style={{
      background: "linear-gradient(90deg,#fee2e2,#ffffff)",
      borderRadius: 12,
      border: "1px solid #fecaca",
      boxShadow: "0 8px 16px rgba(15,23,42,0.06)",
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          color: "#b91c1c",
          fontWeight: 700,
          letterSpacing: 0.5,
        }}
      >
        Үйлчлүүлэгчдийн тоо
      </div>
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: "999px",
          background:
            "radial-gradient(circle at 30% 30%,#fecaca,#ef4444)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: 16,
        }}
      >
        🧍
      </div>
    </div>
    <div style={{ fontSize: 26, fontWeight: 700, color: "#111827" }}>
      {totalCompletedPatientsForDay}
    </div>
    <div style={{ fontSize: 11, color: "#6b7280" }}>
      {formatDateYmdDash(selectedDay)} өдөр &quot;Дууссан&quot; төлөвтэй
      үйлчлүүлэгч
    </div>
  </div>
  </>
  )}

  {/* Борлуулалтын орлого — hidden for receptionist role */}
  {currentUserRole !== "receptionist" && (
  <div
    style={{
      background: "linear-gradient(90deg,#dcfce7,#ffffff)",
      borderRadius: 12,
      border: "1px solid #bbf7d0",
      boxShadow: "0 8px 16px rgba(15,23,42,0.06)",
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          color: "#15803d",
          fontWeight: 700,
          letterSpacing: 0.5,
        }}
      >
        Борлуулалтын орлого
      </div>
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: "999px",
          background:
            "radial-gradient(circle at 30% 30%,#bbf7d0,#22c55e)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: 16,
        }}
      >
        💰
      </div>
    </div>
    <div style={{ fontSize: 26, fontWeight: 700, color: "#111827" }}>
      {dailyRevenue == null
        ? "—"
        : dailyRevenue.toLocaleString("mn-MN") + " ₮"}
    </div>
    <div style={{ fontSize: 11, color: "#6b7280" }}>
      Сонгосон өдрийн нийт борлуулалтын орлого
    </div>
  </div>
  )}
</section>
     

      {/* Filters card — hidden entirely when receptionist is viewing another branch */}
      {!isOtherBranchReceptionView && (
      <section
        style={{
          marginBottom: 16,
          padding: 12,
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          fontSize: 13,
          maxWidth: 1200,
          width: "100%",
        }}
      >
        {!isReceptionRoute && (
          <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 16 }}>
            Шүүлт
          </h2>
        )}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label>Огноо</label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              style={{
                borderRadius: 6,
                border: "1px solid #d1d5db",
                padding: "6px 8px",
                width: 190,
              }}
            />
          </div>

          {/* Branch selector — hidden for receptionist (they use the top switcher) */}
          {currentUserRole !== "receptionist" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label>
              Салбар{" "}
              {isLocked && (
                <span style={{ color: "#dc2626" }}>
                  (<span role="img" aria-label="Түгжээтэй">🔒</span> Түгжээтэй)
                </span>
              )}
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                value={effectiveBranchId || filterBranchId}
                onChange={(e) => {
                  if (isLocked) return; // Prevent changing when locked
                  const value = e.target.value;
                  // Update UI state for immediate feedback
                  setFilterBranchId(value);
                  setActiveBranchTab(value);

                  // Update URL as single source of truth - this will trigger effectiveBranchId change
                  const query = value ? { branchId: value } : {};
                  router.push(
                    { pathname: basePath, query },
                    undefined,
                    { shallow: true }
                  );
                }}
                disabled={isLocked}
                style={{
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  padding: "6px 8px",
                  flex: 1,
                  background: isLocked ? "#f3f4f6" : "white",
                  cursor: isLocked ? "not-allowed" : "pointer",
                  opacity: isLocked ? 0.6 : 1,
                }}
              >
                <option value="">Бүх салбар</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {isLocked && (
                <button
                  type="button"
                  onClick={unlock}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid #dc2626",
                    background: "#fef2f2",
                    color: "#dc2626",
                    fontSize: 12,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  title="Салбарын түгжээг суллах"
                >
                  🔓 Суллах
                </button>
              )}
            </div>
          </div>
          )}

        {/* Patient quick search (Хайх) */}
        <div style={{ flex: 1, minWidth: 220, maxWidth: 460 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Хайх</div>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Үйлчлүүлэгч хайх (нэр, РД, утас)"
              value={filterPatientQuery}
              onChange={(e) => {
                const v = e.target.value;
                setFilterPatientQuery(v);
                if (!v.trim()) {
                  setSelectedFilterPatient(null);
                  setFilterPatientHistory([]);
                  setFilterPatientResults([]);
                } else {
                  triggerFilterPatientSearch(v);
                }
              }}
              autoComplete="off"
              style={{
                width: "100%",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                padding: "6px 8px",
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
            {filterPatientSearchLoading && (
              <span style={{ fontSize: 11, color: "#6b7280", display: "block", marginTop: 2 }}>
                Хайж байна...
              </span>
            )}
          </div>

          {/* Search dropdown */}
          {filterPatientResults.length > 0 && !selectedFilterPatient && (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", maxHeight: 180, overflowY: "auto", marginTop: 2 }}>
              {filterPatientResults.map((p) => {
                const label = [
                  p.ovog && p.name ? `${p.ovog} ${p.name}` : (p.name || p.ovog || ""),
                  p.regNo ? `(${p.regNo})` : "",
                  p.phone ? `📞 ${p.phone}` : "",
                  p.patientBook?.bookNumber ? `#${p.patientBook.bookNumber}` : "",
                ].filter(Boolean).join(" ");
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectFilterPatient(p)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "6px 8px",
                      border: "none",
                      borderBottom: "1px solid #f3f4f6",
                      background: "white",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* No results row – offer quick patient registration */}
          {filterPatientQuery.trim() &&
            !filterPatientSearchLoading &&
            filterPatientResults.length === 0 &&
            selectedFilterPatient === null && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 4,
                  padding: "5px 8px",
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  background: "#f9fafb",
                  fontSize: 12,
                  color: "#6b7280",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setFilterQuickPatientForm({
                      ovog: "",
                      name: "",
                      phone: "",
                      branchId: String(effectiveBranchId || ""),
                      regNo: "",
                    });
                    setFilterQuickPatientError("");
                    setFilterQuickPatientOpen(true);
                  }}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    border: "none",
                    background: "#16a34a",
                    color: "white",
                    fontSize: 16,
                    lineHeight: "22px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                  title="Шинэ үйлчлүүлэгч бүртгэх"
                >
                  +
                </button>
                <span>Илэрц олдсонгүй. Шинээр бүртгэх</span>
              </div>
            )}

          {/* Patient mini-card */}
          {selectedFilterPatient && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                borderRadius: 8,
                border: "1px solid #dbeafe",
                background: "#eff6ff",
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4, color: "#1d4ed8" }}>
                {[
                  selectedFilterPatient.ovog && selectedFilterPatient.name
                    ? `${selectedFilterPatient.ovog} ${selectedFilterPatient.name}`
                    : (selectedFilterPatient.name || selectedFilterPatient.ovog || ""),
                  selectedFilterPatient.regNo ? `(${selectedFilterPatient.regNo})` : "",
                  selectedFilterPatient.phone ? `📞 ${selectedFilterPatient.phone}` : "",
                  selectedFilterPatient.patientBook?.bookNumber ? `#${selectedFilterPatient.patientBook.bookNumber}` : "",
                ].filter(Boolean).join(" ")}
              </div>

              {/* Last 3 completed visits */}
              <div style={{ marginBottom: 6 }}>
                <div style={{ color: "#6b7280", marginBottom: 3, fontSize: 11 }}>Сүүлийн үзлэгүүд:</div>
                {filterPatientHistoryLoading ? (
                  <div style={{ color: "#9ca3af", fontSize: 11 }}>Уншиж байна...</div>
                ) : filterPatientHistory.length === 0 ? (
                  <div style={{ color: "#9ca3af", fontSize: 11 }}>Өмнөх үзлэг байхгүй</div>
                ) : (
                  filterPatientHistory.map((h) => (
                    <div key={h.id} style={{ color: "#374151", fontSize: 11, padding: "1px 0" }}>
                      {formatHistoryDate(h.scheduledAt)} — Эмч: {h.doctor ? formatDoctorName(historyDoctorToDoctor(h.doctor)) : "-"}
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFilterPatient(null);
                    setFilterPatientHistory([]);
                    setFilterPatientQuery("");
                    setFilterPatientResults([]);
                    setBookingIntent(null);
                  }}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: "#f9fafb",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Цэвэрлэх
                </button>
              </div>
            </div>
          )}
        </div>
        </div>
      </section>
      )}

      {/* Booking intent banner */}
      {bookingIntent && (
        <div
          style={{
            marginBottom: 12,
            padding: "8px 12px",
            borderRadius: 8,
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span>📌 <strong>Цаг захиалах горим:</strong> {bookingIntent.patientLabel}</span>
          {bookingIntent.doctorId && (
            <span style={{ color: "#2563eb" }}>
              — Эмч: {formatDoctorName(doctors.find((d) => d.id === bookingIntent.doctorId))}
            </span>
          )}
          <span style={{ color: "#6b7280" }}>→ Цаг сонгохын тулд хүснэгт дэх нүдийг дарна уу</span>
          <button
            type="button"
            onClick={() => setBookingIntent(null)}
            style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", color: "#6b7280", fontSize: 12 }}
          >
            ✕ Цуцлах
          </button>
        </div>
      )}

      {/* Pending drag/drop save confirmation — shown inline above the calendar */}
      {pendingSaveError && pendingSaveId === null && (
        <div
          style={{
            marginBottom: 12,
            background: "#fef2f2",
            borderRadius: 8,
            border: "1px solid #fca5a5",
            padding: "10px 16px",
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            maxWidth: 400,
          }}
        >
          <span style={{ fontSize: 13, color: "#b91c1c" }}>{pendingSaveError}</span>
          <button
            type="button"
            onClick={() => setPendingSaveError(null)}
            style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}
          >✕</button>
        </div>
      )}
      {pendingSaveId !== null && (
        <div
          style={{
            marginBottom: 12,
            background: "#eff6ff",
            borderRadius: 8,
            border: "1px solid #bfdbfe",
            padding: "12px 16px",
            display: "inline-flex",
            flexDirection: "column",
            gap: 10,
            maxWidth: 400,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1d4ed8" }}>
            Цаг захиалга өөрчлөгдлөө
          </div>
          <div style={{ fontSize: 12, color: "#3b82f6" }}>
            Та өөрчлөлтийг хадгалах уу эсвэл цуцлах уу?
          </div>
          {pendingSaveError && (
            <div style={{ fontSize: 12, color: "#b91c1c" }}>
              {pendingSaveError}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => handleSaveDraft(pendingSaveId)}
              disabled={pendingSaving}
              style={{
                padding: "7px 16px",
                borderRadius: 6,
                border: "none",
                background: "#2563eb",
                color: "white",
                fontSize: 13,
                fontWeight: 600,
                cursor: pendingSaving ? "default" : "pointer",
                opacity: pendingSaving ? 0.6 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {pendingSaving ? "Хадгалж байна..." : "Хадгалах"}
            </button>
            <button
              type="button"
              onClick={() => handleCancelDraft(pendingSaveId)}
              disabled={pendingSaving}
              style={{
                padding: "7px 16px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: "#ffffff",
                color: "#374151",
                fontSize: 13,
                fontWeight: 600,
                cursor: pendingSaving ? "default" : "pointer",
                opacity: pendingSaving ? 0.6 : 1,
                whiteSpace: "nowrap",
              }}
            >
              Цуцлах
            </button>
          </div>
        </div>
      )}


     <section style={{ marginBottom: 24 }}>
  {!isReceptionRoute && (
    <h2 style={{ fontSize: 16, marginBottom: 4 }}>
      Өдрийн цагийн хүснэгт
    </h2>
  )}
  <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>
    {formatDateYmdDash(selectedDay)}
  </div>
  {/* Compact date selector for other-branch reception view (Шүүлт is hidden) */}
  {isOtherBranchReceptionView && (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <label style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>Огноо:</label>
      <input
        type="date"
        value={filterDate}
        onChange={(e) => setFilterDate(e.target.value)}
        style={{
          borderRadius: 6,
          border: "1px solid #d1d5db",
          padding: "5px 8px",
          fontSize: 13,
        }}
      />
    </div>
  )}

  {!hasMounted ? (
    <div style={{ color: "#6b7280", fontSize: 13 }}>
      Цагийн хүснэгтийг ачаалж байна...
    </div>
  ) : timeSlots.length === 0 ? (
    <div style={{ color: "#6b7280", fontSize: 13 }}>
      Энэ өдөрт цагийн интервал тодорхойлогдоогүй байна.
    </div>
  ) : gridDoctors.length === 0 ? (
    <div style={{ color: "#6b7280", fontSize: 13 }}>
      Энэ өдөр ажиллах эмчийн хуваарь алга.
    </div>
  ) : (
   <div
  ref={gridRef}
  style={{
    border: "1px solid #ddd",
    borderRadius: 8,
    fontSize: 12,
    overflowX: "auto",
    overflowY: "visible",
    position: "relative",
    WebkitOverflowScrolling: "touch",
  }}
>

            {/* Header row */}
                        <div
              style={{
                display: "grid",
                gridTemplateColumns: `80px repeat(${gridDoctors.length}, 180px)`,
                backgroundColor: "#f5f5f5",
                borderBottom: "1px solid #ddd",
                minWidth: 80 + gridDoctors.length * 180, // ensure horizontal scroll
                position: "sticky",
                top: 0,
                zIndex: 20,
              }}
            >
              <div style={{ padding: 8, fontWeight: "bold", position: "sticky", left: 0, backgroundColor: "#f5f5f5", zIndex: 25, transform: "translateZ(0)" }}>Цаг</div>
              {gridDoctors.map((doc, idx) => {
                // Count visible appointments: matching day + branch + not cancelled
                const count = appointments.filter((a) => {
                  if (a.doctorId !== doc.id) return false;
                  if (naiveTimestampToYmd(a.scheduledAt) !== filterDate) return false;
                  if (effectiveBranchId && String(a.branchId) !== effectiveBranchId) return false;
                  if (String(a.status).toLowerCase() === "cancelled") return false;
                  return true;
                }).length;
                const isLeftDisabled = reorderSaving || idx === 0;
                const isRightDisabled = reorderSaving || idx === gridDoctors.length - 1;
                return (
                  <div
                    key={doc.id}
                    style={{
                      padding: 8,
                      fontWeight: "bold",
                      textAlign: "center",
                      borderLeft: "1px solid #ddd",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => moveDocInGrid(doc.id, "left")}
                        disabled={isLeftDisabled}
                        title="Зүүн тийш зөөх"
                        style={{
                          fontSize: 11,
                          padding: "1px 5px",
                          cursor: isLeftDisabled ? "default" : "pointer",
                          opacity: isLeftDisabled ? 0.3 : 1,
                        }}
                      >◀</button>
                      <span>{formatDoctorName(doc)}</span>
                      <button
                        type="button"
                        onClick={() => moveDocInGrid(doc.id, "right")}
                        disabled={isRightDisabled}
                        title="Баруун тийш зөөх"
                        style={{
                          fontSize: 11,
                          padding: "1px 5px",
                          cursor: isRightDisabled ? "default" : "pointer",
                          opacity: isRightDisabled ? 0.3 : 1,
                        }}
                      >▶</button>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6b7280",
                        marginTop: 2,
                      }}
                    >
                      {count} захиалга
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Body: time labels + doctor columns */}
                       <div
              style={{
                display: "grid",
                gridTemplateColumns: `80px repeat(${gridDoctors.length}, 180px)`,
              }}
            >
              {/* CURRENT TIME LINE */}
              {nowPosition !== null && (
                <div
                  style={{
                    gridColumn: `1 / span ${gridDoctors.length + 1}`,
                    position: "relative",
                    height: 0,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: nowPosition,
                      borderTop: "2px dashed #ef4444",
                      zIndex: 5,
                    }}
                  />
                </div>
              )}

              {/* Time labels / background grid */}
              <div
                style={{
                  borderRight: "1px solid #ddd",
                  position: "sticky",
                  left: 0,
                  zIndex: 15,
                  height: columnHeightPx,
                  backgroundColor: "#fafafa",
                  transform: "translateZ(0)",
                }}
              >
                {timeSlots.map((slot, index) => {
                  const slotStartMin =
                    (slot.start.getTime() - firstSlot.getTime()) / 60000;
                  const slotHeight =
                    (SLOT_MINUTES / totalMinutes) * columnHeightPx;

                  return (
                    <div
                      key={index}
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: (slotStartMin / totalMinutes) * columnHeightPx,
                        height: slotHeight,
                        borderBottom: "1px solid #f0f0f0",
                        paddingLeft: 6,
                        display: "flex",
                        alignItems: "center",
                        fontSize: 11,
                        backgroundColor:
                          index % 2 === 0 ? "#fafafa" : "#ffffff",
                      }}
                    >
                      {slot.label}
                    </div>
                  );
                })}
              </div>

              {/* Doctor columns */}
              {gridDoctors.map((doc) => {
                // Get appointments for this doctor using the pre-built index (perf optimization)
                const originalDoctorAppointments = appointmentsByDoctorId.get(doc.id) ?? [];

                // Also include appointments dragged TO this doctor
                const draggedInAppointments = visibleAppointments.filter((a) => {
                    if (a.doctorId === doc.id) return false; // already in originalDoctorAppointments
                    const draft = draftEdits[a.id];
                    return draft && draft.doctorId === doc.id;
                  }
                );

                const doctorAppointments = [...originalDoctorAppointments, ...draggedInAppointments];

                const handleCellClick = (
                  clickedMinutes: number,
                  existingApps: Appointment[]
                ) => {
                  const slotTime = new Date(
                    firstSlot.getTime() + clickedMinutes * 60000
                  );
                  const slotTimeStr = getSlotTimeString(slotTime);

                  const validApps = existingApps.filter(
                    (a) =>
                      a.doctorId === doc.id &&
                      getAppointmentDayKey(a) === filterDate
                  );

                  if (validApps.length === 2) {
                    setDetailsModalState({
                      open: true,
                      doctor: doc,
                      slotLabel: slotTimeStr,
                      slotTime: slotTimeStr,
                      date: filterDate,
                      appointments: validApps,
                    });
                  } else {
                    const cellSchedule = (doc.schedules || []).find((s: any) => s.date === filterDate);
                    const cellBranchId = cellSchedule ? String(cellSchedule.branchId) : (effectiveBranchId || filterBranchId);
                    setQuickModalState({
                      open: true,
                      doctorId: doc.id,
                      date: filterDate,
                      time: slotTimeStr,
                      branchId: cellBranchId,
                    });
                  }
                };

                // Precompute overlaps for this doctor's appointments
                const overlapsWithOther: Record<number, boolean> = {};
                for (let i = 0; i < doctorAppointments.length; i++) {
                  const a = doctorAppointments[i];
                  const aStart = naiveToFakeUtcDate(a.scheduledAt).getTime();
                  const aEnd = a.endAt
                    ? naiveToFakeUtcDate(a.endAt).getTime()
                    : aStart + SLOT_MINUTES * 60 * 1000;

                  overlapsWithOther[a.id] = false;

                  for (let j = 0; j < doctorAppointments.length; j++) {
                    if (i === j) continue;
                    const b = doctorAppointments[j];
                    const bStart = naiveToFakeUtcDate(b.scheduledAt).getTime();
                    const bEnd = b.endAt
                      ? naiveToFakeUtcDate(b.endAt).getTime()
                      : bStart + SLOT_MINUTES * 60 * 1000;

                    if (aStart < bEnd && aEnd > bStart) {
                      overlapsWithOther[a.id] = true;
                      break;
                    }
                  }
                }

                return (
                  <div
                    key={doc.id}
                    style={{
                      borderLeft: "1px solid #f0f0f0",
                      position: "relative",
                      height: columnHeightPx,
                      backgroundColor: "#ffffff",
                    }}
                  >
                    {/* background stripes & click areas */}
                    {timeSlots.map((slot, index) => {
                      const slotStartMin =
                        (slot.start.getTime() - firstSlot.getTime()) / 60000;
                      const slotHeight =
                        (SLOT_MINUTES / totalMinutes) * columnHeightPx;

                      const slotTimeStr = getSlotTimeString(slot.start);
                      const schedules = (doc as any).schedules || [];
                      const isWorkingHour = schedules.some((s: any) =>
                        isTimeWithinRange(
                          slotTimeStr,
                          s.startTime,
                          s.endTime
                        )
                      );
                      const weekdayIndex = slot.start.getUTCDay();
                      const isWeekend =
                        weekdayIndex === 0 || weekdayIndex === 6;
                      const isWeekendLunch =
                        isWeekend &&
                        isTimeWithinRange(slotTimeStr, "14:00", "15:00");
                      const isNonWorking = !isWorkingHour || isWeekendLunch;

                      const appsInThisSlot = doctorAppointments.filter((a) => {
                        const start = naiveToFakeUtcDate(a.scheduledAt);
                        if (start.getTime() === 0) return false;
                        const end = a.endAt
                          ? naiveToFakeUtcDate(a.endAt)
                          : new Date(start.getTime() + SLOT_MINUTES * 60 * 1000);
                        return start < slot.end && end > slot.start;
                      });

                      return (
                        <div
                          key={index}
                          onClick={() =>
                            isNonWorking
                              ? undefined
                              : handleCellClick(slotStartMin, appsInThisSlot)
                          }
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top:
                              (slotStartMin / totalMinutes) *
                              columnHeightPx,
                            height: slotHeight,
                            borderBottom: "1px solid #f0f0f0",
                            backgroundColor: isNonWorking
                              ? "#ffc26b"
                              : index % 2 === 0
                              ? "#ffffff"
                              : "#fafafa",
                            cursor: isNonWorking
                              ? "not-allowed"
                              : "pointer",
                          }}
                        />
                      );
                    })}

                    {/* Appointment blocks */}
                    {doctorAppointments.map((a) => {
                      const draft = draftEdits[a.id];

                      // Use draft values if present, otherwise original.
                      // Both draft and a.scheduledAt are naive timestamps; convert to fake-UTC Dates.
                      const effectiveStart = draft
                        ? naiveToFakeUtcDate(draft.scheduledAt)
                        : naiveToFakeUtcDate(a.scheduledAt);
                      const effectiveEnd = draft && draft.endAt
                        ? naiveToFakeUtcDate(draft.endAt)
                        : a.endAt
                          ? naiveToFakeUtcDate(a.endAt)
                          : new Date(effectiveStart.getTime() + SLOT_MINUTES * 60 * 1000);
                      
                      const effectiveDoctorId = draft 
                        ? draft.doctorId 
                        : a.doctorId;
                      
                      // Skip if moved to different doctor
                      if (effectiveDoctorId !== doc.id) return null;
                      
                      const start = effectiveStart;
                      if (Number.isNaN(start.getTime())) return null;
                      const end = effectiveEnd;

                      const clampedStart = new Date(
                        Math.max(start.getTime(), firstSlot.getTime())
                      );
                      const clampedEnd = new Date(
                        Math.min(end.getTime(), lastSlot.getTime())
                      );
                      const startMin =
                        (clampedStart.getTime() - firstSlot.getTime()) /
                        60000;
                      const endMin =
                        (clampedEnd.getTime() - firstSlot.getTime()) / 60000;

                      if (endMin <= 0 || startMin >= totalMinutes) {
                        return null;
                      }

                      const top =
                        (startMin / totalMinutes) * columnHeightPx;
                      const height =
                        ((endMin - startMin) / totalMinutes) *
                        columnHeightPx;

                      const lane = laneById[a.id] ?? 0;
                      const hasOverlap = overlapsWithOther[a.id];

                      const widthPercent = hasOverlap ? 50 : 100;
                      const leftPercent = hasOverlap
                        ? lane === 0
                          ? 0
                          : 50
                        : 0;

                      // Check if this appointment can be dragged/resized
                      const canEdit = canEditAppointment(a.status, currentUserRole);
                      const isDragging = activeDrag?.appointmentId === a.id;
                      const hasPendingSave = pendingSaveId === a.id;

                      const handleMouseDown = (e: React.MouseEvent, mode: DragMode) => {
                        if (!canEdit) return;
                        e.stopPropagation();
                        e.preventDefault();

                        const origStart = naiveToFakeUtcDate(a.scheduledAt);
                        const origEnd = a.endAt
                          ? naiveToFakeUtcDate(a.endAt)
                          : new Date(origStart.getTime() + SLOT_MINUTES * 60 * 1000);

                        setActiveDrag({
                          appointmentId: a.id,
                          mode,
                          startClientX: e.clientX,
                          startClientY: e.clientY,
                          origStart,
                          origEnd,
                          origDoctorId: a.doctorId,
                          currentDoctorId: a.doctorId,
                          hasMovedBeyondThreshold: false,
                        });
                      };

                      const handleBlockClick = (e: React.MouseEvent) => {
                        // Don't open details if we just finished dragging or have pending save
                        if (isDragging || hasPendingSave || activeDrag) return;
                        
                        e.stopPropagation();
                        const aStart = naiveToFakeUtcDate(a.scheduledAt);
                        const aSlotStart = floorToSlotStart(aStart, SLOT_MINUTES);
                        const aSlotEnd = new Date(aSlotStart.getTime() + SLOT_MINUTES * 60 * 1000);
                        const slotAppointmentCount = doctorAppointments.filter((other) => {
                          const otherStart = naiveToFakeUtcDate(other.scheduledAt);
                          if (otherStart.getTime() === 0) return false;
                          const otherEnd = other.endAt
                            ? naiveToFakeUtcDate(other.endAt)
                            : new Date(otherStart.getTime() + SLOT_MINUTES * 60 * 1000);
                          return otherStart < aSlotEnd && otherEnd > aSlotStart;
                        }).length;
                        const slotTimeStr = getSlotTimeString(aSlotStart);
                        setDetailsModalState({
                          open: true,
                          doctor: doc,
                          slotLabel: slotTimeStr,
                          slotTime: slotTimeStr,
                          date: filterDate,
                          appointments: [a],
                          slotAppointmentCount,
                        });
                      };

                      return (
                        <div
                          key={a.id}
                          onMouseDown={canEdit ? (e) => handleMouseDown(e, "move") : undefined}
                          onClick={handleBlockClick}
                          style={{
                            position: "absolute",
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            top,
                            height: Math.max(height, 18),
                            padding: "1px 3px",
                            boxSizing: "border-box",
                            backgroundColor: getStatusColor(a.status),
                            borderRadius: 4,
                            border: isDragging 
                              ? "2px solid #2563eb" 
                              : hasPendingSave 
                                ? "2px solid #f59e0b"
                                : "1px solid rgba(0,0,0,0.08)",
                            fontSize: 11,
                            lineHeight: 1.2,
                            color:
                              a.status === "completed" ||
                              a.status === "cancelled"
                                ? "#ffffff"
                                : "#1F2937",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            textAlign: "center",
                            overflow: "hidden",
                            wordBreak: "break-word",
                            boxShadow: isDragging 
                              ? "0 4px 12px rgba(37,99,235,0.5)" 
                              : "0 1px 3px rgba(0,0,0,0.25)",
                            cursor: canEdit ? "move" : "pointer",
                            opacity: isDragging ? 0.8 : 1,
                            zIndex: isDragging || hasPendingSave ? 10 : 1,
                            userSelect: "none",
                            animation: a.status === "ready_to_pay" && !isDragging
                              ? "readyToPayPulse 1.4s ease-in-out infinite, readyToPayBlink 1.4s ease-in-out infinite"
                              : undefined,
                          }}
                          title={`${formatPatientLabel(
                            a.patient,
                            a.patientId
                          )} (${formatStatus(a.status)})`}
                        >
                          {`${formatGridShortLabel(a)} (${formatStatus(
                            a.status
                          )})`}
                          
                          {/* Resize handle at bottom */}
                          {canEdit && !isDragging && (
                            <div
                              onMouseDown={(e) => handleMouseDown(e, "resize")}
                              style={{
                                position: "absolute",
                                bottom: 0,
                                left: 0,
                                right: 0,
                                height: 6,
                                cursor: "ns-resize",
                                backgroundColor: "rgba(0,0,0,0.1)",
                                borderBottomLeftRadius: 4,
                                borderBottomRightRadius: 4,
                              }}
                              title="Drag to resize"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

     {/* Create form card — hidden when receptionist is viewing another branch */}
      {!isOtherBranchReceptionView && (
      <section
        ref={formSectionRef as any}
        style={{
          marginBottom: 24,
          padding: 16,
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "white",
          maxWidth: 1200,
          width: "100%",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Шинэ цаг захиалах</span>
          <button
            type="button"
            onClick={() => setShowExceptional(true)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "none",
              background: "#1e293b",
              color: "white",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Онцгой захиалга
          </button>
        </h2>
        <AppointmentForm
          branches={branches}
          doctors={doctors}
          scheduledDoctors={scheduledDoctors}
          appointments={appointments}
          selectedDate={filterDate}
          selectedBranchId={effectiveBranchId || filterBranchId}
          onCreated={(a) => setAppointments((prev) => [a, ...prev])}
        onBranchChange={(branchId) => {
      // mirror to top filter + grid (but only if not locked)
      if (!isLocked) {
        setFilterBranchId(branchId);
        setActiveBranchTab(branchId);

        const query = branchId ? { branchId } : {};
        router.push(
          { pathname: basePath, query },
          undefined,
          { shallow: true }
        );
      }
    }}
  />
      </section>
      )}

      {error && (
        <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {/* Day-grouped calendar (unchanged from your original) */}
      {/* ... and the raw table + modals, same as before ... */}
      {/* Keep your existing bottom sections exactly as they were. */}
</div>

     <AppointmentDetailsModal
  open={detailsModalState.open}
  onClose={() =>
    setDetailsModalState((prev) => ({ ...prev, open: false }))
  }
  doctor={detailsModalState.doctor}
  slotLabel={detailsModalState.slotLabel}
  slotTime={detailsModalState.slotTime}
  date={detailsModalState.date}
  appointments={detailsModalState.appointments}
  slotAppointmentCount={detailsModalState.slotAppointmentCount}
  currentUserRole={currentUserRole}
  readOnly={isOtherBranchReceptionView}
  onStatusUpdated={(updated) => {
    // update main list
    setAppointments((prev) =>
      prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
    );
    // update the modal list so it reflects changes immediately
    setDetailsModalState((prev) => ({
      ...prev,
      appointments: prev.appointments.map((a) =>
        a.id === updated.id ? { ...a, ...updated } : a
      ),
    }));
  }}
  onEditAppointment={(a) => {
    setEditingAppointment(a);
    setQuickOpen(true);
  }}
  onCreateAppointmentInSlot={() => {
    setDetailsModalState((prev) => ({ ...prev, open: false }));
    const slotDate = detailsModalState.date || filterDate;
    const slotDocId = detailsModalState.doctor?.id;
    const slotScheduledDoc = slotDocId != null ? scheduledDoctors.find((sd) => sd.id === slotDocId) : null;
    const slotSchedule = slotScheduledDoc ? (slotScheduledDoc.schedules || []).find((s) => s.date === slotDate) : null;
    const slotBranchId = slotSchedule ? String(slotSchedule.branchId) : (effectiveBranchId || filterBranchId);
    setQuickModalState({
      open: true,
      doctorId: slotDocId,
      date: slotDate,
      time: detailsModalState.slotTime || "09:00",
      branchId: slotBranchId,
    });
    if (!bookingIntent && selectedFilterPatient) {
      const label = formatPatientSearchLabel(selectedFilterPatient);
      setBookingIntent({ patientId: selectedFilterPatient.id, patientLabel: label, doctorId: undefined });
    }
  }}
/>

      <QuickAppointmentModal
  open={quickModalState.open || quickOpen}
  onClose={() => {
    setQuickModalState((prev) => ({ ...prev, open: false }));
    setQuickOpen(false);
    setEditingAppointment(null);
  }}
  defaultDoctorId={bookingIntent?.doctorId ?? quickModalState.doctorId}
  defaultDate={quickModalState.date}
  defaultTime={quickModalState.time}
  branches={branches}
  doctors={doctors}
  scheduledDoctors={scheduledDoctors}
  appointments={appointments}
  selectedBranchId={quickModalState.branchId ?? (effectiveBranchId || filterBranchId)}
  allowAutoDefaultBranch={false}
  defaultPatientId={bookingIntent?.patientId ?? null}
  defaultPatientQuery={bookingIntent?.patientLabel ?? ""}
  currentUserRole={currentUserRole}
  forceBookedStatus={isOtherBranchReceptionView}
  onCreated={(a) => {
  setAppointments((prev) => {
    // Upsert by id: if SSE already added this appointment, replace it;
    // otherwise prepend. Prevents duplicate rows when SSE and optimistic
    // insert both fire for the same appointment.
    const idx = prev.findIndex((x) => x.id === a.id);
    if (idx !== -1) {
      const next = [...prev];
      next[idx] = { ...next[idx], ...a };
      return next;
    }
    return [a, ...prev];
  });

  // close create mode
  setQuickModalState((prev) => ({ ...prev, open: false }));

  // NEW: clear intent after creating an appointment
  setBookingIntent(null);
  setSelectedFilterPatient(null);
  setFilterPatientQuery("");
  setFilterPatientResults([]);
  setFilterPatientHistory([]);
}}
  editingAppointment={editingAppointment}
  onUpdated={(updated) => {
    // update list in place
    setAppointments((prev) =>
      prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
    );
    // close edit mode
    setQuickOpen(false);
    setEditingAppointment(null);

    // optional: also close details modal (up to you)
    // setDetailsModalState((prev) => ({ ...prev, open: false }));
  }}
/>

{/* Exceptional appointment modal */}
{showExceptional && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.4)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 200,
    }}
    onClick={(e) => { if (e.target === e.currentTarget) setShowExceptional(false); }}
  >
    <div
      style={{
        background: "white",
        borderRadius: 10,
        padding: 24,
        width: 480,
        maxWidth: "95vw",
        maxHeight: "90vh",
        overflowY: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>
          Онцгой захиалга
        </h3>
        <button
          type="button"
          onClick={() => setShowExceptional(false)}
          style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280", lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Patient search */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontWeight: 600 }}>Үйлчлүүлэгч</label>
          <input
            type="text"
            placeholder="РД, овог, нэр, утсаар хайх"
            value={exceptionalPatientQuery}
            onChange={(e) => {
              const v = e.target.value;
              setExceptionalPatientQuery(v);
              if (!v.trim()) {
                setExceptionalPatientId(null);
                setExceptionalPatientResults([]);
              } else {
                triggerExceptionalPatientSearch(v);
              }
            }}
            autoComplete="off"
            style={{ borderRadius: 6, border: "1px solid #d1d5db", padding: "6px 8px" }}
          />
          {exceptionalPatientLoading && (
            <span style={{ fontSize: 11, color: "#6b7280" }}>Хайж байна...</span>
          )}
          {exceptionalPatientResults.length > 0 && exceptionalPatientId === null && (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", maxHeight: 180, overflowY: "auto" }}>
              {exceptionalPatientResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setExceptionalPatientId(p.id);
                    setExceptionalPatientQuery(formatPatientSearchLabel(p));
                    setExceptionalPatientResults([]);
                  }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "6px 8px", border: "none", borderBottom: "1px solid #f3f4f6",
                    background: "white", cursor: "pointer", fontSize: 12,
                  }}
                >
                  {formatPatientSearchLabel(p)}
                </button>
              ))}
            </div>
          )}
          {exceptionalPatientId !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>✓ Сонгогдсон</span>
              <button
                type="button"
                onClick={() => { setExceptionalPatientId(null); setExceptionalPatientQuery(""); setExceptionalPatientResults([]); }}
                style={{ fontSize: 11, color: "#6b7280", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                Өөрчлөх
              </button>
            </div>
          )}
        </div>

        {/* Branch */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontWeight: 600 }}>Салбар</label>
          <select
            value={exceptionalBranchId}
            onChange={(e) => { setExceptionalBranchId(e.target.value); setExceptionalDoctorId(""); }}
            style={{ borderRadius: 6, border: "1px solid #d1d5db", padding: "6px 8px" }}
          >
            <option value="">Салбар сонгох</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Doctor (filtered by selected branch) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontWeight: 600 }}>Эмч</label>
          <select
            value={exceptionalDoctorId}
            onChange={(e) => setExceptionalDoctorId(e.target.value)}
            disabled={!exceptionalBranchId}
            style={{
              borderRadius: 6,
              border: "1px solid #d1d5db",
              padding: "6px 8px",
              background: !exceptionalBranchId ? "#f3f4f6" : undefined,
            }}
          >
            <option value="">{exceptionalBranchId ? "Эмч сонгох" : "Эхлээд салбар сонгоно уу"}</option>
            {exceptionalBranchId && doctors
              .filter((d) =>
                Array.isArray(d.branches) &&
                d.branches.some((b) => b.id === Number(exceptionalBranchId))
              )
              .map((d) => (
                <option key={d.id} value={d.id}>{formatDoctorName(d)}</option>
              ))
            }
          </select>
        </div>

        {/* Date */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontWeight: 600 }}>Огноо</label>
          <input
            type="date"
            value={exceptionalDate}
            onChange={(e) => { setExceptionalDate(e.target.value); setExceptionalStartTime(""); }}
            style={{ borderRadius: 6, border: "1px solid #d1d5db", padding: "6px 8px" }}
          />
        </div>

        {/* Start time */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontWeight: 600 }}>Эхлэх цаг</label>
          <select
            value={exceptionalStartTime}
            onChange={(e) => setExceptionalStartTime(e.target.value)}
            disabled={!exceptionalDate}
            style={{
              borderRadius: 6, border: "1px solid #d1d5db", padding: "6px 8px",
              background: !exceptionalDate ? "#f3f4f6" : undefined,
            }}
          >
            <option value="">Цаг сонгох</option>
            {exceptionalDate &&
              generateTimeSlotsForDay(getDateFromYMD(exceptionalDate)).map((s) => (
                <option key={getSlotTimeString(s.start)} value={getSlotTimeString(s.start)}>
                  {getSlotTimeString(s.start)}
                </option>
              ))
            }
          </select>
        </div>

        {/* Duration info */}
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Үргэлжлэх хугацаа: <strong>1 цаг</strong> (автоматаар)
          {exceptionalStartTime && (
            <> — Дуусах цаг: <strong>{addMinutesToTimeString(exceptionalStartTime, 60)}</strong></>
          )}
        </div>

        {/* Notes */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontWeight: 600 }}>Тэмдэглэл</label>
          <input
            type="text"
            placeholder="Захиалгын тэмдэглэл"
            value={exceptionalNotes}
            onChange={(e) => setExceptionalNotes(e.target.value)}
            style={{ borderRadius: 6, border: "1px solid #d1d5db", padding: "6px 8px" }}
          />
        </div>

        {exceptionalError && (
          <div style={{ color: "#b91c1c", fontSize: 12 }}>{exceptionalError}</div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={() => setShowExceptional(false)}
            disabled={exceptionalSaving}
            style={{
              padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db",
              background: "#f9fafb", cursor: exceptionalSaving ? "default" : "pointer", fontSize: 13,
            }}
          >
            Цуцлах
          </button>
          <button
            type="button"
            onClick={handleExceptionalSubmit}
            disabled={exceptionalSaving}
            style={{
              padding: "8px 16px", borderRadius: 6, border: "none",
              background: "#1e293b", color: "white",
              cursor: exceptionalSaving ? "default" : "pointer",
              fontSize: 13, fontWeight: 600, opacity: exceptionalSaving ? 0.7 : 1,
            }}
          >
            {exceptionalSaving ? "Хадгалж байна..." : "Захиалах"}
          </button>
        </div>
      </div>
    </div>
  </div>
)}

{/* Filter section – quick patient registration modal */}
{filterQuickPatientOpen && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 50,
    }}
    onClick={(e) => {
      if (e.target === e.currentTarget && !filterQuickPatientSaving) {
        setFilterQuickPatientOpen(false);
        setFilterQuickPatientError("");
      }
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
    >
      <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 15 }}>
        Шинэ үйлчлүүлэгчийн бүртгэл
      </h3>
      <p style={{ marginTop: 0, marginBottom: 12, color: "#6b7280" }}>
        Доорхи мэдээллийг заавал бөглөнө үү
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Овог
          <input
            name="ovog"
            value={filterQuickPatientForm.ovog}
            onChange={(e) =>
              setFilterQuickPatientForm((f) => ({ ...f, ovog: e.target.value }))
            }
            placeholder="Овог оруулна уу"
            style={{ borderRadius: 6, border: "1px solid #d1d5db", padding: "6px 8px" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Нэр
          <input
            name="name"
            value={filterQuickPatientForm.name}
            onChange={(e) =>
              setFilterQuickPatientForm((f) => ({ ...f, name: e.target.value }))
            }
            placeholder="Нэр оруулна уу"
            style={{ borderRadius: 6, border: "1px solid #d1d5db", padding: "6px 8px" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Утас
          <input
            name="phone"
            value={filterQuickPatientForm.phone}
            onChange={(e) =>
              setFilterQuickPatientForm((f) => ({ ...f, phone: e.target.value }))
            }
            placeholder="Утас оруулна уу"
            style={{ borderRadius: 6, border: "1px solid #d1d5db", padding: "6px 8px" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          РД
          <input
            name="regNo"
            value={filterQuickPatientForm.regNo}
            onChange={(e) =>
              setFilterQuickPatientForm((f) => ({ ...f, regNo: e.target.value }))
            }
            placeholder="РД оруулна уу"
            style={{ borderRadius: 6, border: "1px solid #d1d5db", padding: "6px 8px" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Салбар
          <select
            name="branchId"
            value={filterQuickPatientForm.branchId}
            onChange={(e) =>
              setFilterQuickPatientForm((f) => ({ ...f, branchId: e.target.value }))
            }
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
        {filterQuickPatientError && (
          <div style={{ color: "#b91c1c", fontSize: 12 }}>{filterQuickPatientError}</div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={() => {
              if (!filterQuickPatientSaving) {
                setFilterQuickPatientOpen(false);
                setFilterQuickPatientError("");
              }
            }}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#f9fafb",
              cursor: filterQuickPatientSaving ? "default" : "pointer",
            }}
          >
            Цуцлах
          </button>
          <button
            type="button"
            onClick={handleFilterQuickPatientSave}
            disabled={filterQuickPatientSaving}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              background: "#16a34a",
              color: "white",
              cursor: filterQuickPatientSaving ? "default" : "pointer",
            }}
          >
            {filterQuickPatientSaving ? "Хадгалж байна..." : "Хадгалах"}
          </button>
        </div>
      </div>
    </div>
  </div>
)}
    </main>
  
  );
}
