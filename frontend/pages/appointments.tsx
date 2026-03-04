import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/router";
import { useBranchLock } from "../components/appointments/useBranchLock";
import type { Branch, Doctor, ScheduledDoctor, PatientLite, Appointment, DoctorScheduleDay, TimeSlot } from "../components/appointments/types";
import { SLOT_MINUTES, floorToSlotStart, addMinutes, getSlotKey, enumerateSlotStartsOverlappingRange, generateTimeSlotsForDay, getSlotTimeString, addMinutesToTimeString, isTimeWithinRange, getDateFromYMD, pad2 } from "../components/appointments/time";
import { formatDoctorName, formatPatientLabel, formatGridShortLabel, formatPatientSearchLabel, formatDateYmdDots, formatStatus, formatDetailedTimeRange } from "../components/appointments/formatters";
import AppointmentDetailsModal from "../components/appointments/AppointmentDetailsModal";
import QuickAppointmentModal from "../components/appointments/QuickAppointmentModal";
import PendingSaveBar from "../components/appointments/PendingSaveBar";

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

  // Sort by start time, then by (end - start) duration DESC (longer first)
  const sorted = list
    .slice()
    .filter((a) => !Number.isNaN(new Date(a.scheduledAt).getTime()))
    .sort((a, b) => {
      const sa = new Date(a.scheduledAt).getTime();
      const sb = new Date(b.scheduledAt).getTime();
      if (sa !== sb) return sa - sb;

      const ea =
        a.endAt && !Number.isNaN(new Date(a.endAt).getTime())
          ? new Date(a.endAt).getTime()
          : sa;
      const eb =
        b.endAt && !Number.isNaN(new Date(b.endAt).getTime())
          ? new Date(b.endAt).getTime()
          : sb;

      // longer first if same start
      return eb - ea;
    });

  const laneLastEnd: (number | null)[] = [null, null];

  for (const a of sorted) {
    const start = new Date(a.scheduledAt).getTime();
    const end =
      a.endAt && !Number.isNaN(new Date(a.endAt).getTime())
        ? new Date(a.endAt).getTime()
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
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

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
    const d = new Date(year, (month || 1) - 1, day || 1);

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
// When branch changes in the form, reset dependent fields
  useEffect(() => {
    if (!form.branchId) return;

    setForm((prev) => ({
      ...prev,
      doctorId: "",
      startTime: "",
      endTime: "",
      patientQuery: "",
      notes: "",
      // keep date & status as is
    }));
    setSelectedPatientId(null);
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

        const url = `/api/patients?query=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json().catch(() => []);

        if (!res.ok) {
          setPatientResults([]);
          return;
        }

        const rawList = Array.isArray(data)
          ? data
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

      const start = new Date(a.scheduledAt);
      if (Number.isNaN(start.getTime())) return false;

      const end =
        a.endAt && !Number.isNaN(new Date(a.endAt).getTime())
          ? new Date(a.endAt)
          : new Date(start.getTime() + SLOT_MINUTES * 60 * 1000);

      const dayStr = start.toISOString().slice(0, 10);
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
      setError("Цаг захиалахын өмнө эмчийг заавал сонгоно уу.");
      return;
    }

    const [year, month, day] = form.date.split("-").map(Number);
    const [startHour, startMinute] = form.startTime.split(":").map(Number);
    const [endHour, endMinute] = form.endTime.split(":").map(Number);

    const start = new Date(
      year,
      (month || 1) - 1,
      day || 1,
      startHour || 0,
      startMinute || 0,
      0,
      0
    );
    const end = new Date(
      year,
      (month || 1) - 1,
      day || 1,
      endHour || 0,
      endMinute || 0,
      0,
      0
    );

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
    const scheduledAt = start;

    const patientId = selectedPatientId;

    if (!isWithinDoctorSchedule(scheduledAt)) {
      setError("Сонгосон цагт эмчийн ажлын хуваарь байхгүй байна.");
      return;
    }

    let currentBlockStart = new Date(scheduledAt);
    while (currentBlockStart < end) {
      const existingCount = countAppointmentsInSlot(currentBlockStart);
      if (existingCount >= 2) {
        setError(
          "Сонгосон хугацааны зарим 30 минутын блок дээр аль хэдийн 2 захиалга байна."
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
    if (scheduledDoctors.length > 0) {
      const branchIdForFilter = form.branchId || selectedBranchId || "";
      const dateForFilter = form.date;

      if (!branchIdForFilter || !dateForFilter) return scheduledDoctors;

      const branchNum = Number(branchIdForFilter);
      if (Number.isNaN(branchNum)) return scheduledDoctors;

      const filtered = scheduledDoctors.filter((sd) =>
        (sd.schedules || []).some(
          (s) => s.branchId === branchNum && s.date === dateForFilter
        )
      );

      return filtered.length ? filtered : scheduledDoctors;
    }

    // fallback – no schedule data
    return doctors;
  }, [scheduledDoctors, doctors, form.branchId, form.date, selectedBranchId]);

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
      {/* Branch – FIRST */}
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

      {/* Patient */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          gridColumn: "1 / -1",
        }}
      >
        <label>Үйлчлүүлэгч</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            name="patientQuery"
            placeholder="РД, овог, нэр утсаар хайх"
            value={form.patientQuery}
            onChange={handleChange}
            autoComplete="off"
            style={{
              flex: 1,
              borderRadius: 6,
              border: "1px solid #d1d5db",
              padding: "6px 8px",
            }}
          />
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
        </div>
        {patientSearchLoading && (
          <span style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
            Үйлчлүүлэгч хайж байна...
          </span>
        )}
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
        <label>Эмч (заавал)</label>
        <select
          name="doctorId"
          value={form.doctorId}
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
          <option value="">Эмч сонгох</option>
          {workingDoctors.map((d) => (
            <option key={d.id} value={d.id}>
              {formatDoctorName(d)}
            </option>
          ))}
        </select>
        {scheduledDoctors.length === 0 && (
          <span style={{ fontSize: 11, color: "#b91c1c", marginTop: 2 }}>
            Энэ өдөр сонгосон салбарт эмчийн ажлын хуваарь олдсонгүй.
          </span>
        )}
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
              setDurationMinutes(mins);
              setEndTimeManuallySet(false);
              setForm((prev) => ({
                ...prev,
                endTime: prev.startTime
                  ? addMinutesToTimeString(prev.startTime, mins)
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
<option value="completed">Дууссан</option>
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
  
  // Branch lock functionality
  const { isLocked, lockedBranchId, effectiveBranchId, unlock } = useBranchLock();

  // branchId from URL: /appointments?branchId=1
  const branchIdFromQuery =
    typeof router.query.branchId === "string" ? router.query.branchId : "";

  const todayStr = new Date().toISOString().slice(0, 10);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [scheduledDoctors, setScheduledDoctors] = useState<ScheduledDoctor[]>(
    []
  );
  const [error, setError] = useState("");
const [nowPosition, setNowPosition] = useState<number | null>(null);
const [hasMounted, setHasMounted] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

// NEW: per‑day revenue
const [dailyRevenue, setDailyRevenue] = useState<number | null>(null);

// Request ID tracking to prevent stale fetch overwrites
const appointmentsRequestIdRef = useRef(0);
const scheduledDoctorsRequestIdRef = useRef(0);
const revenueRequestIdRef = useRef(0);


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

  // filters
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

  useEffect(() => {
    setHasMounted(true);
  }, []);

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
    setDailyRevenue(null);
  }, [effectiveBranchId, filterDate]);

  // ---- load meta (branches, doctors) ----
  useEffect(() => {
    async function loadMeta() {
      try {
        setError("");
        const [branchesRes, doctorsRes] = await Promise.all([
          fetch("/api/branches"),
          fetch("/api/doctors"),
        ]);
        const branchesData = await branchesRes.json().catch(() => []);
        const doctorsData = await doctorsRes.json().catch(() => []);
        setBranches(branchesData || []);
        setDoctors(doctorsData || []);
      } catch (e) {
        console.error(e);
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
  
  // current time line
  useEffect(() => {
    const updateNow = () => {
      const now = new Date();
      const nowKey = now.toISOString().slice(0, 10);
      if (nowKey !== filterDate) {
        setNowPosition(null);
        return;
      }

      const clamped = Math.min(
        Math.max(now.getTime(), firstSlot.getTime()),
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

  // gridDoctors with fallback
  const gridDoctors: ScheduledDoctor[] = useMemo(() => {
  const sortFn = (a: ScheduledDoctor, b: ScheduledDoctor) => {
    const ao = a.calendarOrder ?? 0;
    const bo = b.calendarOrder ?? 0;
    if (ao !== bo) return ao - bo;
    return (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase());
  };

  if (scheduledDoctors.length > 0) {
    // Preserve backend ordering (AM-first / PM-second on weekdays; calendarOrder on weekends)
    return [...scheduledDoctors];
  }

  const dayKey = filterDate;
  const byDoctor: Record<number, ScheduledDoctor> = {};

  for (const a of appointments) {
    if (!a.doctorId) continue;
    if (getAppointmentDayKey(a) !== dayKey) continue;

    if (!byDoctor[a.doctorId]) {
      const baseDoc = doctors.find((d) => d.id === a.doctorId);
      if (!baseDoc) continue;
      byDoctor[a.doctorId] = { ...baseDoc, schedules: [] };
    }
  }

  return Object.values(byDoctor).sort(sortFn);
}, [scheduledDoctors, appointments, doctors, filterDate]);

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

    const start = new Date(a.scheduledAt);
    const end = a.endAt ? new Date(a.endAt) : addMinutes(start, SLOT_MINUTES);

    if (Number.isNaN(start.getTime())) continue;
    if (Number.isNaN(end.getTime()) || end <= start) continue;

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
      if (getAppointmentDayKey(a) !== dayKey) continue;
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
  }, [appointments, filterDate]);

// ---- Daily stats (for selected date & branch) ----
const dayKey = filterDate;

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
      { pathname: "/appointments", query },
      undefined,
      { shallow: true }
    );
  };

 const getStatusColor = (status: string): string => {
  switch (status) {
    case "completed":
      return "#fb6190";
    case "confirmed":
      return "#bbf7d0";
    case "online":
      return "#a78bfa"; // purple
    case "ongoing":
      return "#9d9d9d";
    case "imaging":
      return "#8b5cf6"; // purple for imaging
    case "ready_to_pay":
      return "#facc15";
    case "partial_paid":
      return "#fbbf24"; // amber/yellow for partial paid
    case "no_show":
      return "#ef4444"; // red
    case "cancelled":
      return "#1889fc";
    case "other":
      return "#94a3b8"; // gray
    default:
      return "#77f9fe"; // booked
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
            scheduledAt: newStart.toISOString(),
            endAt: newEnd.toISOString(),
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
            scheduledAt: activeDrag.origStart.toISOString(),
            endAt: newEnd.toISOString(),
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
      maxWidth: 1100,
      margin: "16px auto",
      padding: 24,
      fontFamily: "sans-serif",
    }}
  >
{/* Calendar view with doctor-columns time grid (all screen sizes) */}
<div>
<h1 style={{ fontSize: 20, margin: "4px 0 8px" }}>Цаг захиалга</h1>
<p style={{ color: "#6b7280", fontSize: 13, marginBottom: 12 }}>
  Эмч, үйлчлүүлэгч, салбарын цаг захиалгыг харах болон удирдах хэсэг
</p>

{/* NEW: Daily stats cards (colored) */}
<section
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 12,
    marginBottom: 16,
  }}
>
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
      {fillingStats.percent}%
    </div>
    <div style={{ fontSize: 11, color: "#6b7280" }}>
      {formatDateYmdDots(selectedDay)} өдрийн нийт цаг дүүргэлт
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
      {formatDateYmdDots(selectedDay)} өдөр &quot;Дууссан&quot; төлөвтэй
      үйлчлүүлэгч
    </div>
  </div>

  {/* Борлуулалтын орлого */}
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
</section>
     

      {/* Filters card */}
      <section
        style={{
          marginBottom: 16,
          padding: 12,
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          fontSize: 13,
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 16 }}>
          Шүүлт
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
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
              }}
            />
          </div>

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
                    { pathname: "/appointments", query },
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
        </div>
      </section>

     

            {/* Time grid by doctor */}
     <section style={{ marginBottom: 24 }}>
  <h2 style={{ fontSize: 16, marginBottom: 4 }}>
    Өдрийн цагийн хүснэгт
  </h2>
  <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>
    {formatDateYmdDots(selectedDay)}
  </div>

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
              }}
            >
              <div style={{ padding: 8, fontWeight: "bold" }}>Цаг</div>
              {gridDoctors.map((doc) => {
                const count = appointments.filter(
                  (a) => a.doctorId === doc.id
                ).length;
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
                    <div>{formatDoctorName(doc)}</div>
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
                  position: "relative",
                  height: columnHeightPx,
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
                // Get appointments originally assigned to this doctor
                const originalDoctorAppointments = appointments.filter(
                  (a) =>
                    a.doctorId === doc.id &&
                    getAppointmentDayKey(a) === filterDate &&
                    a.status !== "cancelled"
                );
                
                // Also include appointments dragged TO this doctor
                const draggedInAppointments = appointments.filter(
                  (a) => {
                    if (a.doctorId === doc.id) return false; // already included above
                    if (getAppointmentDayKey(a) !== filterDate) return false;
                    if (a.status === "cancelled") return false;
                    
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
                  const aStart = new Date(a.scheduledAt).getTime();
                  const aEnd =
                    a.endAt &&
                    !Number.isNaN(new Date(a.endAt).getTime())
                      ? new Date(a.endAt).getTime()
                      : aStart + SLOT_MINUTES * 60 * 1000;

                  overlapsWithOther[a.id] = false;

                  for (let j = 0; j < doctorAppointments.length; j++) {
                    if (i === j) continue;
                    const b = doctorAppointments[j];
                    const bStart = new Date(b.scheduledAt).getTime();
                    const bEnd =
                      b.endAt &&
                      !Number.isNaN(new Date(b.endAt).getTime())
                        ? new Date(b.endAt).getTime()
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
                      const weekdayIndex = slot.start.getDay();
                      const isWeekend =
                        weekdayIndex === 0 || weekdayIndex === 6;
                      const isWeekendLunch =
                        isWeekend &&
                        isTimeWithinRange(slotTimeStr, "14:00", "15:00");
                      const isNonWorking = !isWorkingHour || isWeekendLunch;

                      const appsInThisSlot = doctorAppointments.filter((a) => {
                        const start = new Date(a.scheduledAt);
                        if (Number.isNaN(start.getTime())) return false;
                        const end =
                          a.endAt &&
                          !Number.isNaN(new Date(a.endAt).getTime())
                            ? new Date(a.endAt)
                            : new Date(
                                start.getTime() + SLOT_MINUTES * 60 * 1000
                              );
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
                      
                      // Use draft values if present, otherwise original
                      const effectiveStart = draft 
                        ? new Date(draft.scheduledAt) 
                        : new Date(a.scheduledAt);
                      const effectiveEnd = draft && draft.endAt
                        ? new Date(draft.endAt)
                        : (a.endAt && !Number.isNaN(new Date(a.endAt).getTime())
                            ? new Date(a.endAt)
                            : new Date(effectiveStart.getTime() + SLOT_MINUTES * 60 * 1000));
                      
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
                      const canEdit = canReceptionEditAppointment(a.status);
                      const isDragging = activeDrag?.appointmentId === a.id;
                      const hasPendingSave = pendingSaveId === a.id;

                      const handleMouseDown = (e: React.MouseEvent, mode: DragMode) => {
                        if (!canEdit) return;
                        e.stopPropagation();
                        e.preventDefault();

                        const origStart = new Date(a.scheduledAt);
                        const origEnd = a.endAt && !Number.isNaN(new Date(a.endAt).getTime())
                          ? new Date(a.endAt)
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
                        const aStart = new Date(a.scheduledAt);
                        const aSlotStart = floorToSlotStart(aStart, SLOT_MINUTES);
                        const aSlotEnd = new Date(aSlotStart.getTime() + SLOT_MINUTES * 60 * 1000);
                        const slotAppointmentCount = doctorAppointments.filter((other) => {
                          const otherStart = new Date(other.scheduledAt);
                          if (Number.isNaN(otherStart.getTime())) return false;
                          const otherEnd =
                            other.endAt && !Number.isNaN(new Date(other.endAt).getTime())
                              ? new Date(other.endAt)
                              : new Date(otherStart.getTime() + SLOT_MINUTES * 60 * 1000);
                          return otherStart < aSlotEnd && otherEnd > aSlotStart;
                        }).length;
                        setDetailsModalState({
                          open: true,
                          doctor: doc,
                          slotLabel: "",
                          slotTime: "",
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
                                : "#111827",
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

     {/* Create form card */}
      <section
        ref={formSectionRef as any}
        style={{
          marginBottom: 24,
          padding: 16,
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "white",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 16 }}>
          Шинэ цаг захиалах
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
          { pathname: "/appointments", query },
          undefined,
          { shallow: true }
        );
      }
    }}
  />
      </section>

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
  }}
/>

      <QuickAppointmentModal
  open={quickModalState.open || quickOpen}
  onClose={() => {
    setQuickModalState((prev) => ({ ...prev, open: false }));
    setQuickOpen(false);
    setEditingAppointment(null);
  }}
  defaultDoctorId={quickModalState.doctorId}
  defaultDate={quickModalState.date}
  defaultTime={quickModalState.time}
  branches={branches}
  doctors={doctors}
  scheduledDoctors={scheduledDoctors}
  appointments={appointments}
  selectedBranchId={quickModalState.branchId ?? (effectiveBranchId || filterBranchId)}
  allowAutoDefaultBranch={false}
  onCreated={(a) => {
    setAppointments((prev) => [a, ...prev]);
    // close create mode
    setQuickModalState((prev) => ({ ...prev, open: false }));
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

{/* Floating Save/Cancel bar for pending draft */}
{pendingSaveId !== null && (
  <div
    style={{
      position: "fixed",
      bottom: 24,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 100,
      background: "#ffffff",
      borderRadius: 8,
      boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      minWidth: 320,
      border: "2px solid #f59e0b",
    }}
  >
    <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
      Цаг захиалга өөрчлөгдлөө
    </div>
    <div style={{ fontSize: 12, color: "#6b7280" }}>
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
          flex: 1,
          padding: "8px 16px",
          borderRadius: 6,
          border: "none",
          background: "#16a34a",
          color: "white",
          fontSize: 13,
          fontWeight: 600,
          cursor: pendingSaving ? "default" : "pointer",
          opacity: pendingSaving ? 0.6 : 1,
        }}
      >
        {pendingSaving ? "Хадгалж байна..." : "Хадгалах"}
      </button>
      <button
        type="button"
        onClick={() => handleCancelDraft(pendingSaveId)}
        disabled={pendingSaving}
        style={{
          flex: 1,
          padding: "8px 16px",
          borderRadius: 6,
          border: "1px solid #d1d5db",
          background: "#f9fafb",
          color: "#111827",
          fontSize: 13,
          fontWeight: 600,
          cursor: pendingSaving ? "default" : "pointer",
          opacity: pendingSaving ? 0.6 : 1,
        }}
      >
        Цуцлах
      </button>
    </div>
  </div>
)}
    </main>
  
  );
}
