import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import StaffAvatar from "../../../components/StaffAvatar";
import SignaturePad, { SignaturePadRef } from "../../../components/SignaturePad";
import { toAbsoluteFileUrl } from "../../../utils/toAbsoluteFileUrl";
import AppointmentDetailsModal from "../../../components/appointments/AppointmentDetailsModal";
import EncounterReportModal from "../../../components/patients/EncounterReportModal";
import EncounterMaterialsModal from "../../../components/patients/EncounterMaterialsModal";
import type { Appointment } from "../../../components/appointments/types";
import DoctorDashboardTab from "../../../components/doctors/DoctorDashboardTab";

type Branch = {
  id: number;
  name: string;
};

type Doctor = {
  id: number;
  email: string;
  name?: string;
  ovog?: string | null;
  role: string;
  branchId?: number | null;
  regNo?: string | null;
  licenseNumber?: string | null;
  licenseExpiryDate?: string | null;
  signatureImagePath?: string | null;
  stampImagePath?: string | null;
  idPhotoPath?: string | null;
  phone?: string | null;
  branches?: Branch[];
  calendarOrder?: number | null;
};

type DoctorScheduleDay = {
  id: number;
  date: string; // "YYYY-MM-DD"
  branch: Branch;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  note?: string | null;
};

type DoctorAppointment = {
  id: number;
  patientId: number;
  branchId: number;
  doctorId: number;
  scheduledAt: string; // ISO string
  endAt: string | null; // ISO string
  status: string;
  notes: string | null;
  patientName: string | null;
  patientOvog: string | null;
  patientBookNumber: string | null;
  branchName: string | null;
  // extended fields (returned when withEncounterData=true)
  encounterId?: number | null;
  materialsCount?: number;
  patientPhone?: string | null;
};

type ShiftType = "AM" | "PM" | "WEEKEND_FULL";
type DoctorTabKey = "profile" | "dashboard" | "schedule" | "appointments" | "sales" | "history";

// ── Sales tab types ────────────────────────────────────────────────────────────

type SalesCategoryRow = {
  key:
    | "IMAGING"
    | "ORTHODONTIC_TREATMENT"
    | "DEFECT_CORRECTION"
    | "SURGERY"
    | "GENERAL"
    | "BARTER_EXCESS";
  label: string;
  salesMnt: number;
  incomeMnt: number;
  pctUsed: number;
};

type SalesDetailsResponse = {
  doctorId: number;
  doctorName: string | null;
  doctorOvog: string | null;
  startDate: string;
  endDate: string;
  categories: SalesCategoryRow[];
  totals: {
    totalSalesMnt: number;
    totalIncomeMnt: number;
  };
};

type SalesLineItem = {
  invoiceId: number;
  encounterId: number | null;
  appointmentId: number | null;
  appointmentScheduledAt: string | null;
  visitDate: string | null;
  patientId: number | null;
  patientOvog: string | null;
  patientName: string | null;
  serviceName: string;
  serviceCategory: string;
  priceMnt: number;
  discountMnt: number;
  netAfterDiscountMnt: number;
  allocatedPaidMnt: number;
  paymentMethodLabel: string | null;
};

function formatDoctorShortName(doc: Doctor) {
  const name = (doc.name || "").toString().trim();
  const ovog = (doc.ovog || "").toString().trim();
  if (ovog) return `${ovog.charAt(0).toUpperCase()}.${name || doc.email}`;
  return name || doc.email;
}

function formatTime(isoString: string | null): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatIsoDateOnly(iso?: string | null) {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}

function formatMNT(amount: number): string {
  return new Intl.NumberFormat("en-US").format(amount) + " ₮";
}

// ─── Sales tab helpers ─────────────────────────────────────────────────────

function fmtMnt(v: number) {
  return `${Number(v || 0).toLocaleString("mn-MN")} ₮`;
}

function salesFormatPatient(ovog: string | null | undefined, name: string | null | undefined) {
  const n = (name || "").trim();
  const o = (ovog || "").trim();
  if (o && n) return `${o[0]}. ${n}`;
  return n || o || "-";
}

function salesFormatDate(isoStr: string | null | undefined) {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("mn-MN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function SalesChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function SalesEyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function SalesDrillDownRows({
  lines,
  onOpenReport,
}: {
  lines: SalesLineItem[];
  onOpenReport: (appointmentId: number) => void;
}) {
  if (lines.length === 0) {
    return (
      <tr>
        <td colSpan={10} className="px-8 py-4 text-center text-xs text-gray-500">
          Энэ ангилалд мэдээлэл олдсонгүй.
        </td>
      </tr>
    );
  }
  return (
    <>
      {lines.map((line, idx) => {
        const dateStr = salesFormatDate(line.appointmentScheduledAt || line.visitDate);
        const patientStr = salesFormatPatient(line.patientOvog, line.patientName);
        const canOpen = line.appointmentId !== null && line.appointmentId !== undefined;
        const tooltip = canOpen ? "Дэлгэрэнгүй" : "Цаг захиалга байхгүй";
        return (
          <tr key={`${line.invoiceId}-${idx}`} className="border-t border-blue-100 bg-blue-50/30">
            <td className="py-2 pl-8 pr-3 text-xs text-gray-700">#{line.invoiceId}</td>
            <td className="px-3 py-2 text-xs text-gray-700">{dateStr}</td>
            <td className="px-3 py-2 text-xs text-gray-700">{patientStr}</td>
            <td className="px-3 py-2 text-xs text-gray-700">{line.serviceName}</td>
            <td className="px-3 py-2 text-right text-xs text-gray-700">{fmtMnt(line.priceMnt)}</td>
            <td className="px-3 py-2 text-right text-xs text-gray-700">
              {line.discountMnt > 0 ? fmtMnt(line.discountMnt) : "-"}
            </td>
            <td className="px-3 py-2 text-right text-xs font-semibold text-gray-800">
              {fmtMnt(line.allocatedPaidMnt)}
            </td>
            <td className="px-3 py-2 text-xs text-gray-700">
              {line.paymentMethodLabel || "-"}
            </td>
            <td className="px-3 py-2 text-xs text-gray-500">{line.serviceCategory}</td>
            <td className="px-3 py-2 text-center">
              <div className="group relative inline-block">
                <button
                  type="button"
                  disabled={!canOpen}
                  aria-label={tooltip}
                  onClick={() => canOpen && line.appointmentId !== null && line.appointmentId !== undefined && onOpenReport(line.appointmentId)}
                  className={`rounded border p-1 transition-colors ${
                    canOpen
                      ? "border-blue-400 bg-white text-blue-600 hover:bg-blue-50"
                      : "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300"
                  }`}
                >
                  <SalesEyeIcon />
                </button>
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {tooltip}
                </span>
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ─── Appointment status helpers ────────────────────────────────────────────

function getApptStatusBgClass(status: string): string {
  switch (status) {
    case "booked":       return "bg-cyan-200";
    case "confirmed":    return "bg-green-200";
    case "online":       return "bg-violet-400";
    case "ongoing":      return "bg-gray-400";
    case "imaging":      return "bg-purple-500";
    case "ready_to_pay": return "bg-yellow-300";
    case "partial_paid": return "bg-amber-400";
    case "completed":    return "bg-pink-500";
    case "no_show":      return "bg-red-500";
    case "cancelled":    return "bg-blue-500";
    case "other":        return "bg-slate-400";
    default:             return "bg-cyan-200";
  }
}

function getApptStatusTextClass(status: string): string {
  switch (status) {
    case "booked":
    case "confirmed":
    case "ready_to_pay":
      return "text-gray-900";
    default:
      return "text-white";
  }
}

function formatApptStatus(status: string): string {
  switch (status) {
    case "booked":       return "Захиалсан";
    case "confirmed":    return "Баталгаажсан";
    case "online":       return "Онлайн";
    case "ongoing":      return "Явж байна";
    case "imaging":      return "Зураг";
    case "ready_to_pay": return "Төлбөр төлөх";
    case "partial_paid": return "Үлдэгдэлтэй";
    case "completed":    return "Дууссан";
    case "no_show":      return "Ирээгүй";
    case "cancelled":    return "Цуцалсан";
    case "other":        return "Бусад";
    default:             return status;
  }
}

function formatApptPatientLabel(a: DoctorAppointment): string {
  const name = (a.patientName || "").trim();
  const ovog = (a.patientOvog || "").trim();
  let displayName = name;
  if (ovog) displayName = `${ovog.charAt(0).toUpperCase()}.${name}`;
  const book = a.patientBookNumber ? ` #${a.patientBookNumber}` : "";
  return displayName ? `${displayName}${book}` : (a.patientBookNumber ? `#${a.patientBookNumber}` : "—");
}

function formatApptTimeRange(a: DoctorAppointment): string {
  if (!a.scheduledAt) return "";
  const start = new Date(a.scheduledAt);
  const hh = String(start.getHours()).padStart(2, "0");
  const mm = String(start.getMinutes()).padStart(2, "0");
  const startStr = `${hh}:${mm}`;
  if (!a.endAt) return startStr;
  const end = new Date(a.endAt);
  const eh = String(end.getHours()).padStart(2, "0");
  const em = String(end.getMinutes()).padStart(2, "0");
  return `${startStr} – ${eh}:${em}`;
}

function doctorApptToModalAppt(a: DoctorAppointment): Appointment {
  return {
    id: a.id,
    patientId: a.patientId,
    doctorId: a.doctorId,
    branchId: a.branchId,
    scheduledAt: a.scheduledAt,
    endAt: a.endAt ?? null,
    status: a.status,
    notes: a.notes ?? null,
    patient: {
      name: a.patientName ?? "",
      ovog: a.patientOvog ?? null,
      phone: null,
      patientBook: a.patientBookNumber ? { bookNumber: a.patientBookNumber } : null,
    },
    branch: a.branchName ? { id: a.branchId, name: a.branchName } : null,
    doctorName: null,
    doctorOvog: null,
    patientName: a.patientName ?? null,
    patientOvog: a.patientOvog ?? null,
    patientPhone: null,
    patientBookNumber: a.patientBookNumber ?? null,
    branchName: a.branchName ?? null,
    patientRegNo: null,
  } as unknown as Appointment;
}

function Card({
  title,
  right,
  children,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="bg-white border border-gray-200 rounded-2xl p-[18px]"
    >
      {(title || right) && (
        <div
          className="flex justify-between items-start gap-3 mb-2.5"
        >
          <div>
            {title && (
              <div className="text-[22px] font-extrabold text-gray-900">
                {title}
              </div>
            )}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

function InfoGrid({
  items,
}: {
  items: Array<{ label: string; value: React.ReactNode }>;
}) {
  return (
    <div
      className="grid grid-cols-3 gap-x-12 gap-y-6"
    >
      {items.map((it, idx) => (
        <div key={idx}>
          <div className="text-gray-500 text-lg font-semibold">
            {it.label}
          </div>
          <div className="text-gray-900 text-xl font-extrabold">
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <div
      className="bg-white border border-gray-200 rounded-2xl p-4"
    >
      <div className="text-gray-500 text-base font-bold">
        {title.toUpperCase()}
      </div>
      <div className="text-[34px] font-black text-gray-900">
        {value}
      </div>
      {subtitle ? (
        <div className="text-gray-500 text-base">{subtitle}</div>
      ) : null}
    </div>
  );
}

export default function DoctorProfilePage() {
  const router = useRouter();
  const { id } = router.query;

  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBranches, setSavingBranches] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<DoctorTabKey>("profile");



useEffect(() => {
  const tabParam = router.query.tab as string | undefined;
  if (!tabParam) return;

  const allowed: DoctorTabKey[] = [
    "profile",
    "dashboard",
    "schedule",
    "appointments",
    "sales",
    "history",
  ];

  if (allowed.includes(tabParam as DoctorTabKey)) {
    setActiveTab(tabParam as DoctorTabKey);
  }
}, [router.query.tab]);

  // ✅ NEW: patient-like edit toggle for the profile info card
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // URL validation error for idPhotoPath
  const [idPhotoPathError, setIdPhotoPathError] = useState<string | null>(null);
  // Photo upload state
  const [uploading, setUploading] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [uploadingStamp, setUploadingStamp] = useState(false);
  const [stampError, setStampError] = useState<string | null>(null);

  // Signature mode: "upload" | "draw"
  const [signatureMode, setSignatureMode] = useState<"upload" | "draw">("upload");
  const [savingPadSignature, setSavingPadSignature] = useState(false);
  const [padSignatureError, setPadSignatureError] = useState<string | null>(null);
  const signaturePadRef = useRef<SignaturePadRef>(null);

  const [form, setForm] = useState({
    name: "",
    ovog: "",
    email: "",
    branchId: "",
    regNo: "",
    licenseNumber: "",
    licenseExpiryDate: "",
    phone: "",
    signatureImagePath: "",
    stampImagePath: "",
    idPhotoPath: "",
  });

  // selected multiple branches
  const [selectedBranchIds, setSelectedBranchIds] = useState<number[]>([]);

  // schedule state (next 31 days)
  const [schedule, setSchedule] = useState<DoctorScheduleDay[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // schedule editor form state (top form, ONLY for creating new entries)
  const [scheduleForm, setScheduleForm] = useState<{
    date: string;
    branchId: string;
    shiftType: ShiftType;
    startTime: string;
    endTime: string;
    note: string;
  }>({
    date: "",
    branchId: "",
    shiftType: "AM",
    startTime: "09:00",
    endTime: "15:00",
    note: "",
  });

  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleSaveError, setScheduleSaveError] = useState<string | null>(
    null
  );
  const [scheduleSaveSuccess, setScheduleSaveSuccess] = useState<string | null>(
    null
  );

  // inline editing state for table
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(
    null
  );
  const [inlineForm, setInlineForm] = useState<{
    date: string;
    branchId: string;
    startTime: string;
    endTime: string;
    note: string;
  }>({
    date: "",
    branchId: "",
    startTime: "",
    endTime: "",
    note: "",
  });

  // schedule table pagination
  const [schedulePage, setSchedulePage] = useState(1);
  const schedulePageSize = 10;

  // History (Хуваарийн түүх) state
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<DoctorScheduleDay[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 15;

  // Bulk schedule (mode 2) state
  const [bulkDateFrom, setBulkDateFrom] = useState("");
  const [bulkDateTo, setBulkDateTo] = useState("");
  const [bulkBranchId, setBulkBranchId] = useState("");
  const [bulkShiftByDate, setBulkShiftByDate] = useState<Record<string, ShiftType>>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);

  // Sales summary state
  const [salesSummary, setSalesSummary] = useState<{
    todayTotal: number;
    monthTotal: number;
  } | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);

  // Appointments state
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const [appointmentsFrom, setAppointmentsFrom] = useState<string>("");
  const [appointmentsTo, setAppointmentsTo] = useState<string>("");
  const [detailsModal, setDetailsModal] = useState<{
    open: boolean;
    appointment: DoctorAppointment | null;
  }>({ open: false, appointment: null });

  // Appointment history ("Үзлэгийн түүх") tab state
  const [apptHistory, setApptHistory] = useState<DoctorAppointment[]>([]);
  const [apptHistoryLoading, setApptHistoryLoading] = useState(false);
  const [apptHistoryError, setApptHistoryError] = useState<string | null>(null);
  const [apptHistoryFrom, setApptHistoryFrom] = useState<string>("");
  const [apptHistoryTo, setApptHistoryTo] = useState<string>("");
  const [apptHistoryPage, setApptHistoryPage] = useState(1);
  const [apptHistoryPageSize, setApptHistoryPageSize] = useState(15);
  const [historyReportModalOpen, setHistoryReportModalOpen] = useState(false);
  const [historyReportAppointmentId, setHistoryReportAppointmentId] = useState<number | null>(null);
  const [historyMaterialsModalOpen, setHistoryMaterialsModalOpen] = useState(false);
  const [historyMaterialsEncounterId, setHistoryMaterialsEncounterId] = useState<number | null>(null);

  // ── Sales tab state ──────────────────────────────────────────────────────
  const now = new Date();
  const salesDefaultStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const salesDefaultEnd = (() => {
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  })();
  const [salesStartDate, setSalesStartDate] = useState<string>(salesDefaultStart);
  const [salesEndDate, setSalesEndDate] = useState<string>(salesDefaultEnd);
  const [salesData, setSalesData] = useState<SalesDetailsResponse | null>(null);
  const [salesDataLoading, setSalesDataLoading] = useState(false);
  const [salesDataError, setSalesDataError] = useState<string>("");
  const [salesExpandedCategories, setSalesExpandedCategories] = useState<Set<string>>(new Set());
  const [salesCategoryLines, setSalesCategoryLines] = useState<
    Record<string, SalesLineItem[] | null | undefined>
  >({});
  const [salesCategoryErrors, setSalesCategoryErrors] = useState<Record<string, string>>({});
  const [salesReportModalAppointmentId, setSalesReportModalAppointmentId] = useState<number | null>(null);
  // ── end Sales tab state ──────────────────────────────────────────────────

  const resetFormFromDoctor = () => {
    if (!doctor) return;
    setForm({
      name: doctor.name || "",
      ovog: doctor.ovog || "",
      email: doctor.email || "",
      branchId: doctor.branchId ? String(doctor.branchId) : "",
      regNo: doctor.regNo || "",
      licenseNumber: doctor.licenseNumber || "",
      licenseExpiryDate: doctor.licenseExpiryDate
        ? doctor.licenseExpiryDate.slice(0, 10)
        : "",
      phone: doctor.phone || "",
      signatureImagePath: doctor.signatureImagePath || "",
      stampImagePath: doctor.stampImagePath || "",
      idPhotoPath: doctor.idPhotoPath || "",
    });
    setIdPhotoPathError(null);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const toggleBranch = (branchId: number) => {
    setSelectedBranchIds((prev) =>
      prev.includes(branchId)
        ? prev.filter((id) => id !== branchId)
        : [...prev, branchId]
    );
  };

  const handleScheduleFormChange = (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLSelectElement>
      | React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    setScheduleForm((prev) => {
      const updated = { ...prev, [name]: value };

      // If shiftType changes, update default times depending on weekday/weekend if date is known.
      if (name === "shiftType") {
        const shift = value as ShiftType;

        if (prev.date) {
          const d = new Date(prev.date);
          const day = d.getDay(); // 0=Sun, 6=Sat
          const isWeekend = day === 0 || day === 6;

          if (isWeekend) {
            if (shift === "AM") {
              updated.startTime = "10:00";
              updated.endTime = "14:00";
            } else if (shift === "PM") {
              updated.startTime = "14:00";
              updated.endTime = "19:00";
            } else if (shift === "WEEKEND_FULL") {
              updated.startTime = "10:00";
              updated.endTime = "19:00";
            }
          } else {
            if (shift === "AM") {
              updated.startTime = "09:00";
              updated.endTime = "15:00";
            } else if (shift === "PM") {
              updated.startTime = "15:00";
              updated.endTime = "21:00";
            } else if (shift === "WEEKEND_FULL") {
              updated.startTime = "09:00";
              updated.endTime = "21:00";
            }
          }
        } else {
          if (shift === "AM") {
            updated.startTime = "09:00";
            updated.endTime = "15:00";
          } else if (shift === "PM") {
            updated.startTime = "15:00";
            updated.endTime = "21:00";
          } else if (shift === "WEEKEND_FULL") {
            updated.startTime = "10:00";
            updated.endTime = "19:00";
          }
        }
      }

      return updated;
    });
  };

  // Load branches + doctor + schedule
  useEffect(() => {
    if (!id) return;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // load branches
        const bRes = await fetch("/api/branches");
        const bData = await bRes.json();
        if (bRes.ok && Array.isArray(bData)) {
          setBranches(bData);
        }

        // load doctor
        const dRes = await fetch(`/api/users/${id}`);
        const dData = await dRes.json();

        if (!dRes.ok) {
          setError(dData?.error || "Эмчийн мэдээллийг ачааллаж чадсангүй");
          setLoading(false);
          return;
        }

        const doc: Doctor = dData;
        setDoctor(doc);

        setForm({
          name: doc.name || "",
          ovog: doc.ovog || "",
          email: doc.email || "",
          branchId: doc.branchId ? String(doc.branchId) : "",
          regNo: doc.regNo || "",
          licenseNumber: doc.licenseNumber || "",
          licenseExpiryDate: doc.licenseExpiryDate
            ? doc.licenseExpiryDate.slice(0, 10)
            : "",
          phone: doc.phone || "",
          signatureImagePath: doc.signatureImagePath || "",
          stampImagePath: doc.stampImagePath || "",
          idPhotoPath: doc.idPhotoPath || "",
        });

        // initialize multi-branch selection from doctor.branches
        const initialBranchIds = (doc.branches || []).map((b) => b.id);
        setSelectedBranchIds(initialBranchIds);

        // preselect first assigned branch in schedule form
        setScheduleForm((prev) => ({
          ...prev,
          branchId: initialBranchIds[0]
            ? String(initialBranchIds[0])
            : prev.branchId,
        }));

        // ✅ start in view mode like patient page
        setIsEditingProfile(false);

        setLoading(false);
      } catch (err) {
        console.error(err);
        setError("Сүлжээгээ шалгана уу");
        setLoading(false);
      }
    }

    async function loadSchedule() {
      setScheduleLoading(true);
      setScheduleError(null);

      try {
        const today = new Date();
        const from = today.toISOString().slice(0, 10);
        const toDate = new Date(today);
        toDate.setDate(today.getDate() + 31);
        const to = toDate.toISOString().slice(0, 10);

        const res = await fetch(
          `/api/users/${id}/schedule?from=${from}&to=${to}`
        );
        const data = await res.json();

        if (res.ok && Array.isArray(data)) {
          setSchedule(data);
          setSchedulePage(1);
        } else {
          setScheduleError(
            data && data.error
              ? data.error
              : "Ажлын хуваарийг ачааллаж чадсангүй"
          );
        }
      } catch (err) {
        console.error(err);
        setScheduleError("Сүлжээгээ шалгана уу");
      } finally {
        setScheduleLoading(false);
      }
    }

    async function loadSalesSummary() {
      setSalesLoading(true);
      setSalesError(null);

      try {
        const res = await fetch(`/api/doctors/${id}/sales-summary`);
        const data = await res.json();

        if (res.ok) {
          setSalesSummary({
            todayTotal: data.todayTotal || 0,
            monthTotal: data.monthTotal || 0,
          });
        } else {
          setSalesError(data?.error || "Орлогын мэдээллийг ачааллаж чадсангүй");
        }
      } catch (err) {
        console.error(err);
        setSalesError("Сүлжээгээ шалгана уу");
      } finally {
        setSalesLoading(false);
      }
    }

    // Initialize appointments date range: today to today+30
    const today = new Date();
    const defaultFrom = today.toISOString().slice(0, 10);
    const thirtyDaysLater = new Date(today);
    thirtyDaysLater.setDate(today.getDate() + 30);
    const defaultTo = thirtyDaysLater.toISOString().slice(0, 10);
    
    setAppointmentsFrom(defaultFrom);
    setAppointmentsTo(defaultTo);

    // Initialize appointment history date range: today-7 to today
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const todayStr = today.toISOString().slice(0, 10);
    setApptHistoryFrom(sevenDaysAgo.toISOString().slice(0, 10));
    setApptHistoryTo(todayStr);

    load();
    loadSchedule();
    loadSalesSummary();
  }, [id]);

  const reloadSchedule = async () => {
    if (!id) return;
    setScheduleLoading(true);
    setScheduleError(null);

    try {
      const today = new Date();
      const from = today.toISOString().slice(0, 10);
      const toDate = new Date(today);
      toDate.setDate(today.getDate() + 31);
      const to = toDate.toISOString().slice(0, 10);

      const res = await fetch(`/api/users/${id}/schedule?from=${from}&to=${to}`);
      const data = await res.json();

      if (res.ok && Array.isArray(data)) {
        setSchedule(data);
        setSchedulePage(1);
      } else {
        setScheduleError(
          data && data.error
            ? data.error
            : "Ажлын хуваарийг ачаалж чадсангүй"
        );
      }
    } catch (err) {
      console.error(err);
      setScheduleError("Сүлжээгээ шалгана уу");
    } finally {
      setScheduleLoading(false);
    }
  };

  const loadAppointments = useCallback(async () => {
    if (!id || !appointmentsFrom || !appointmentsTo) return;

    setAppointmentsLoading(true);
    setAppointmentsError(null);

    try {
      const res = await fetch(
        `/api/doctors/${id}/appointments?from=${appointmentsFrom}&to=${appointmentsTo}`
      );
      const data = await res.json();

      if (res.ok && Array.isArray(data)) {
        setAppointments(data);
      } else {
        setAppointmentsError(
          data?.error || "Цагуудыг ачааллаж чадсангүй"
        );
      }
    } catch (err) {
      console.error(err);
      setAppointmentsError("Сүлжээгээ шалгана уу");
    } finally {
      setAppointmentsLoading(false);
    }
  }, [id, appointmentsFrom, appointmentsTo]);

  const loadApptHistory = useCallback(async () => {
    if (!id || !apptHistoryFrom || !apptHistoryTo) return;

    setApptHistoryLoading(true);
    setApptHistoryError(null);

    try {
      const res = await fetch(
        `/api/doctors/${id}/appointments?from=${apptHistoryFrom}&to=${apptHistoryTo}&allStatuses=true&withEncounterData=true`
      );
      const data = await res.json();

      if (res.ok && Array.isArray(data)) {
        setApptHistory(data);
        setApptHistoryPage(1);
      } else {
        setApptHistoryError(
          data?.error || "Үзлэгийн түүхийг ачааллаж чадсангүй"
        );
      }
    } catch (err) {
      console.error(err);
      setApptHistoryError("Сүлжээгээ шалгана уу");
    } finally {
      setApptHistoryLoading(false);
    }
  }, [id, apptHistoryFrom, apptHistoryTo]);

  // Auto-load appointments when tab is active and dates are set
  useEffect(() => {
    if (activeTab === "appointments") {
      loadAppointments();
    }
  }, [activeTab, loadAppointments]);

  // Auto-load history when tab is active and dates are set
  useEffect(() => {
    if (activeTab === "history") {
      loadApptHistory();
    }
  }, [activeTab, loadApptHistory]);

  // ── Sales tab fetch functions ─────────────────────────────────────────────
  const fetchSalesData = useCallback(async () => {
    if (!id) return;
    setSalesDataLoading(true);
    setSalesDataError("");
    try {
      const res = await fetch(
        `/api/admin/doctors-income/${id}/details?startDate=${salesStartDate}&endDate=${salesEndDate}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to fetch doctor income details");
      setSalesData(json);
      setSalesExpandedCategories(new Set());
      setSalesCategoryLines({});
      setSalesCategoryErrors({});
    } catch (e: any) {
      setSalesDataError(e?.message || "Failed to fetch details");
      setSalesData(null);
    } finally {
      setSalesDataLoading(false);
    }
  }, [id, salesStartDate, salesEndDate]);

  const fetchSalesCategoryLines = useCallback(
    async (categoryKey: string) => {
      if (!id) return;
      let shouldFetch = true;
      setSalesCategoryLines((prev) => {
        if (prev[categoryKey] !== undefined) {
          shouldFetch = false;
          return prev;
        }
        return { ...prev, [categoryKey]: null };
      });
      if (!shouldFetch) return;
      try {
        const res = await fetch(
          `/api/admin/doctors-income/${id}/details/lines?startDate=${salesStartDate}&endDate=${salesEndDate}&category=${categoryKey}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to fetch lines");
        setSalesCategoryLines((prev) => ({ ...prev, [categoryKey]: json }));
      } catch (e: any) {
        setSalesCategoryErrors((prev) => ({ ...prev, [categoryKey]: e?.message || "Error" }));
        setSalesCategoryLines((prev) => ({ ...prev, [categoryKey]: [] }));
      }
    },
    [id, salesStartDate, salesEndDate]
  );

  const toggleSalesCategory = useCallback(
    (categoryKey: string) => {
      setSalesExpandedCategories((prev) => {
        const next = new Set(prev);
        if (next.has(categoryKey)) {
          next.delete(categoryKey);
        } else {
          next.add(categoryKey);
          fetchSalesCategoryLines(categoryKey);
        }
        return next;
      });
    },
    [fetchSalesCategoryLines]
  );

  useEffect(() => {
    if (activeTab === "sales") {
      fetchSalesData();
    }
  }, [activeTab, fetchSalesData]);
  // ── end Sales tab fetch functions ─────────────────────────────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    // Validate idPhotoPath URL
    const photoUrl = form.idPhotoPath.trim();
    if (
      photoUrl &&
      !photoUrl.startsWith("http://") &&
      !photoUrl.startsWith("https://") &&
      !photoUrl.startsWith("/media/") &&
      !photoUrl.startsWith("/uploads/")
    ) {
      setIdPhotoPathError("URL нь http://, https://, /media/ эсвэл /uploads/ -ээр эхлэх ёстой");
      return;
    }
    setIdPhotoPathError(null);

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: form.name || null,
        ovog: form.ovog || null,
        email: form.email || null,
        branchId: form.branchId ? Number(form.branchId) : null, // legacy single branch
        regNo: form.regNo || null,
        licenseNumber: form.licenseNumber || null,
        licenseExpiryDate: form.licenseExpiryDate || null, // yyyy-mm-dd
        phone: form.phone || null,
        signatureImagePath: form.signatureImagePath || null,
        stampImagePath: form.stampImagePath || null,
        idPhotoPath: photoUrl || null,
      };

      const res = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Хадгалах үед алдаа гарлаа");
        setSaving(false);
        return;
      }

      setDoctor(data);

      // ✅ after save, return to view mode like patient profile
      setIsEditingProfile(false);
    } catch (err) {
      console.error(err);
      setError("Сүлжээгээ шалгана уу");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBranches = async () => {
    if (!id) return;
    setSavingBranches(true);
    setError(null);

    try {
      const res = await fetch(`/api/users/${id}/branches`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchIds: selectedBranchIds }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        setError(data?.error || "Салбар хадгалах үед алдаа гарлаа");
        setSavingBranches(false);
        return;
      }

      // update doctor.branches from response if provided
      if (data && Array.isArray(data.branches)) {
        setDoctor((prev) =>
          prev ? { ...prev, branches: data.branches } : prev
        );
      }

      // also sync schedule form branch selector if needed
      if (data && Array.isArray(data.branches) && data.branches.length > 0) {
        setScheduleForm((prev) => ({
          ...prev,
          branchId: String(data.branches[0].id),
        }));
      }
    } catch (err) {
      console.error(err);
      setError("Сүлжээгээ шалгана уу");
    } finally {
      setSavingBranches(false);
    }
  };

  // Delete doctor user
  const handleDeleteUser = async () => {
    if (!id) return;

    const ok = window.confirm(
      "Та энэхүү эмчийн аккаунтыг устгахдаа итгэлтэй байна уу?"
    );
    if (!ok) return;

    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        alert((data && data.error) || "Устгах үед алдаа гарлаа");
        return;
      }

      router.push("/users/doctors");
    } catch (err) {
      console.error(err);
      alert("Сүлжээгээ шалгана уу");
    }
  };

  // Top form: create new schedule entry
  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    setScheduleSaving(true);
    setScheduleSaveError(null);
    setScheduleSaveSuccess(null);

    try {
      if (!scheduleForm.date) {
        setScheduleSaveError("Огноо сонгоно уу.");
        setScheduleSaving(false);
        return;
      }
      if (!scheduleForm.branchId) {
        setScheduleSaveError("Салбар сонгоно уу.");
        setScheduleSaving(false);
        return;
      }

      const payload = {
        date: scheduleForm.date,
        branchId: Number(scheduleForm.branchId),
        startTime: scheduleForm.startTime,
        endTime: scheduleForm.endTime,
        note: scheduleForm.note || null,
      };

      const res = await fetch(`/api/users/${id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setScheduleSaveError(
          data?.error || "Ажлын хуваарь хадгалах үед алдаа гарлаа"
        );
        setScheduleSaving(false);
        return;
      }

      setScheduleSaveSuccess("Амжилттай хадгаллаа.");
      await reloadSchedule();

      setScheduleForm((prev) => ({
        ...prev,
        date: "",
        note: "",
      }));
    } catch (err) {
      console.error(err);
      setScheduleSaveError("Сүлжээгээ шалгана уу");
    } finally {
      setScheduleSaving(false);
      setTimeout(() => setScheduleSaveSuccess(null), 3000);
    }
  };

  // Inline edit helpers
  const startEditRow = (s: DoctorScheduleDay) => {
    setEditingScheduleId(s.id);
    setInlineForm({
      date: s.date,
      branchId: String(s.branch?.id ?? ""),
      startTime: s.startTime,
      endTime: s.endTime,
      note: s.note || "",
    });
    setScheduleSaveError(null);
    setScheduleSaveSuccess(null);
  };

  const cancelEditRow = () => {
    setEditingScheduleId(null);
    setInlineForm({
      date: "",
      branchId: "",
      startTime: "",
      endTime: "",
      note: "",
    });
    setScheduleSaveError(null);
  };

  const handleInlineChange = (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLSelectElement>
      | React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setInlineForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleInlineSaveSchedule = async () => {
    if (!id) return;

    setScheduleSaving(true);
    setScheduleSaveError(null);
    setScheduleSaveSuccess(null);

    try {
      if (!inlineForm.date) {
        setScheduleSaveError("Огноо сонгоно уу.");
        setScheduleSaving(false);
        return;
      }
      if (!inlineForm.branchId) {
        setScheduleSaveError("Салбар сонгоно уу.");
        setScheduleSaving(false);
        return;
      }

      const payload = {
        date: inlineForm.date,
        branchId: Number(inlineForm.branchId),
        startTime: inlineForm.startTime,
        endTime: inlineForm.endTime,
        note: inlineForm.note || null,
      };

      const res = await fetch(`/api/users/${id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setScheduleSaveError(
          data?.error || "Ажлын хуваарь хадгалах үед алдаа гарлаа"
        );
        setScheduleSaving(false);
        return;
      }

      setScheduleSaveSuccess("Амжилттай хадгаллаа.");
      await reloadSchedule();
      setEditingScheduleId(null);
      setInlineForm({
        date: "",
        branchId: "",
        startTime: "",
        endTime: "",
        note: "",
      });
    } catch (err) {
      console.error(err);
      setScheduleSaveError("Сүлжээгээ шалгана уу");
    } finally {
      setScheduleSaving(false);
      setTimeout(() => setScheduleSaveSuccess(null), 3000);
    }
  };

  const handleDeleteSchedule = async (scheduleId: number) => {
    if (!id) return;

    const ok = window.confirm(
      "Та энэхүү хуваарийг устгахдаа итгэлтэй байна уу?"
    );
    if (!ok) return;

    try {
      const res = await fetch(`/api/users/${id}/schedule/${scheduleId}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setScheduleSaveError(
          (data && (data as any).error) ||
            "Хуваарь устгах үед алдаа гарлаа"
        );
        return;
      }

      setSchedule((prev) => prev.filter((s) => s.id !== scheduleId));
    } catch (err) {
      console.error(err);
      setScheduleSaveError("Сүлжээгээ шалгана уу");
    }
  };

  const loadHistory = async () => {
    if (!id) return;
    if (!historyFrom || !historyTo) {
      setHistoryError("Эхлэх болон дуусах огноог сонгоно уу.");
      return;
    }

    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const res = await fetch(
        `/api/users/${id}/schedule?from=${historyFrom}&to=${historyTo}`
      );
      const data = await res.json();

      if (!res.ok || !Array.isArray(data)) {
        setHistoryError(
          (data && data.error) || "Хуваарийн түүхийг ачааллаж чадсангүй."
        );
        setHistoryItems([]);
        return;
      }

      setHistoryItems(data);
      setHistoryPage(1);
    } catch (err) {
      console.error(err);
      setHistoryError("Сүлжээгээ шалгана уу");
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  /** Returns an array of "YYYY-MM-DD" strings for every day in [from, to]. */
  function getDatesInRange(from: string, to: string): string[] {
    if (!from || !to) return [];
    const result: string[] = [];
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    const start = new Date(fy, fm - 1, fd);
    const end = new Date(ty, tm - 1, td);
    if (start > end) return [];
    const cur = new Date(start);
    while (cur <= end) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      result.push(`${y}-${m}-${d}`);
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }

  /** Format a "YYYY-MM-DD" string as "YYYY/MM/DD Гараг" in Mongolian. */
function formatScheduleDate(ymd: string): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const weekdays = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];
  const weekday = weekdays[dt.getDay()];
  return `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")} ${weekday}`;
}

  const handleBulkSaveSchedule = async () => {
    if (!id) return;
    if (!bulkBranchId) {
      setBulkError("Салбар сонгоно уу.");
      return;
    }
    if (!bulkDateFrom || !bulkDateTo) {
      setBulkError("Эхлэх болон дуусах огноог сонгоно уу.");
      return;
    }
    if (Object.keys(bulkShiftByDate).length === 0) {
      setBulkError("Дор хаяа нэг өдрийн ээлж сонгоно уу.");
      return;
    }

    setBulkSaving(true);
    setBulkError(null);
    setBulkSuccess(null);

    try {
      const res = await fetch(`/api/users/${id}/schedule/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: Number(bulkBranchId),
          dateFrom: bulkDateFrom,
          dateTo: bulkDateTo,
          shiftTypeByDate: bulkShiftByDate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setBulkError(data?.error || "Олон өдрийн хуваарь хадгалах үед алдаа гарлаа.");
        return;
      }

      setBulkSuccess(`Амжилттай: ${data.created} шинэ, ${data.updated} шинэчлэгдсэн.`);
      setBulkShiftByDate({});
      setBulkDateFrom("");
      setBulkDateTo("");
      setBulkBranchId("");
      await reloadSchedule();
      setTimeout(() => setBulkSuccess(null), 4000);
    } catch (err) {
      console.error(err);
      setBulkError("Сүлжээгээ шалгана уу");
    } finally {
      setBulkSaving(false);
    }
  };

  const mainBranchName = useMemo(() => {
    if (!doctor?.branchId) return null;
    return branches.find((b) => b.id === doctor.branchId)?.name || null;
  }, [doctor?.branchId, branches]);

  const doctorAssignedBranches: Branch[] =
    doctor?.branches && doctor.branches.length > 0 ? doctor.branches : branches;

  const isCreatingSchedule =
    !!scheduleForm.date &&
    !!scheduleForm.branchId &&
    editingScheduleId === null;

  // placeholders for stat cards (logic later)
  const todayAppointmentsCount = 0;

  if (loading) {
    return (
      <div className="p-6">
        <div>Ачааллаж байна...</div>
      </div>
    );
  }

  if (error && !doctor) {
    return (
      <div className="p-6">
        <h1>Эмчийн мэдээлэл</h1>
        <div className="text-red-500 mt-2">{error}</div>
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="p-6">
        <h1>Эмч олдсонгүй</h1>
      </div>
    );
  }

  const headerName = formatDoctorShortName(doctor);

  return (
   <main
  className="p-6 font-sans"
>
      <button
  type="button"
  onClick={() => router.back()}
  className="mb-4 px-2 py-1 rounded border border-gray-300 bg-gray-50 cursor-pointer text-[13px]"
>
  ← Буцах
</button>

     <section
  className="grid grid-cols-[260px_1fr] gap-4 items-stretch mb-6"
>
        {/* LEFT SIDEBAR */}
        <div
  className="border border-gray-200 rounded-xl p-4 bg-white"
>
          <div className="mb-1 text-lg font-semibold">
  {headerName}
</div>

          <div
            className="w-full h-[190px] rounded-[10px] overflow-hidden flex items-center justify-center mb-2.5"
          >
            <StaffAvatar
              name={doctor.name}
              ovog={doctor.ovog}
              email={doctor.email}
              idPhotoPath={toAbsoluteFileUrl(doctor.idPhotoPath)}
              variant="sidebar"
              className="w-full h-full"
            />
          </div>

          <div className="text-[13px] text-gray-500">
  <div>Утас: {doctor.phone || "-"}</div>
  <div>И-мэйл: {doctor.email || "-"}</div>
  <div>Үндсэн салбар: {mainBranchName || "-"}</div>
  <div>Лиценз: {doctor.licenseNumber || "-"}</div>
  <div>Дуусах: {formatIsoDateOnly(doctor.licenseExpiryDate) || "-"}</div>
</div>

          

         {/* Side menu */}
<div className="mt-4">
  <div
    className="text-xs uppercase text-gray-400 mb-1"
  >
    Цэс
  </div>

  <div
    className="flex flex-col gap-1 text-[13px]"
  >
    <button
      type="button"
      onClick={() => {
        setActiveTab("profile");
        setIsEditingProfile(false);
        setError(null);
      }}
      className={`text-left px-2.5 py-1.5 rounded-md border-0 ${activeTab === "profile" ? "bg-blue-50" : "bg-transparent"} ${activeTab === "profile" ? "text-blue-700" : "text-gray-500"} ${activeTab === "profile" ? "font-medium" : "font-normal"} cursor-pointer`}
    >
      Профайл
    </button>

    <button
      type="button"
      onClick={() => {
        setActiveTab("dashboard");
        setIsEditingProfile(false);
        setError(null);
      }}
      className={`text-left px-2.5 py-1.5 rounded-md border-0 ${activeTab === "dashboard" ? "bg-blue-50" : "bg-transparent"} ${activeTab === "dashboard" ? "text-blue-700" : "text-gray-500"} ${activeTab === "dashboard" ? "font-medium" : "font-normal"} cursor-pointer`}
    >
      Гүйцэтгэл
    </button>

    <button
      type="button"
      onClick={() => {
        setActiveTab("schedule");
        setIsEditingProfile(false);
        setError(null);
      }}
      className={`text-left px-2.5 py-1.5 rounded-md border-0 ${activeTab === "schedule" ? "bg-blue-50" : "bg-transparent"} ${activeTab === "schedule" ? "text-blue-700" : "text-gray-500"} ${activeTab === "schedule" ? "font-medium" : "font-normal"} cursor-pointer`}
    >
      Ажлын хуваарь
    </button>

    <button
      type="button"
      onClick={() => {
        setActiveTab("appointments");
        setIsEditingProfile(false);
        setError(null);
      }}
      className={`text-left px-2.5 py-1.5 rounded-md border-0 ${activeTab === "appointments" ? "bg-blue-50" : "bg-transparent"} ${activeTab === "appointments" ? "text-blue-700" : "text-gray-500"} ${activeTab === "appointments" ? "font-medium" : "font-normal"} cursor-pointer`}
    >
      Цагууд
    </button>

    <button
      type="button"
      onClick={() => {
        setActiveTab("sales");
        setIsEditingProfile(false);
        setError(null);
      }}
      className={`text-left px-2.5 py-1.5 rounded-md border-0 ${activeTab === "sales" ? "bg-blue-50" : "bg-transparent"} ${activeTab === "sales" ? "text-blue-700" : "text-gray-500"} ${activeTab === "sales" ? "font-medium" : "font-normal"} cursor-pointer`}
    >
      Борлуулалт
    </button>

    <button
      type="button"
      onClick={() => {
        setActiveTab("history");
        setIsEditingProfile(false);
        setError(null);
      }}
      className={`text-left px-2.5 py-1.5 rounded-md border-0 ${activeTab === "history" ? "bg-blue-50" : "bg-transparent"} ${activeTab === "history" ? "text-blue-700" : "text-gray-500"} ${activeTab === "history" ? "font-medium" : "font-normal"} cursor-pointer`}
    >
      Үзлэгийн түүх
    </button>
  </div>
</div>

          <button
            type="button"
            onClick={handleDeleteUser}
            className="mt-4 w-full px-3 py-2.5 rounded-lg border border-red-200 bg-red-100 text-red-700 cursor-pointer text-[13px] font-bold"
          >
            Ажилтныг устгах
          </button>
        </div>

        {/* RIGHT CONTENT */}
        <div className="flex flex-col gap-4">
          {/* Top stat cards (only on profile tab) */}
          {activeTab === "profile" && (
  <div
    className="grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] gap-3"
  >
    <div
      className="rounded-xl border border-gray-200 p-3 bg-gray-50"
    >
      <div
        className="text-xs uppercase text-gray-500 mb-1"
      >
        Өнөөдрийн цаг захиалга
      </div>
      <div className="text-2xl font-semibold mb-1">
        {todayAppointmentsCount}
      </div>
      <div className="text-xs text-gray-500">Нийт бүртгэлтэй цаг</div>
    </div>

    <div
      className="rounded-xl border border-gray-200 p-3 bg-gray-50"
    >
      <div
        className="text-xs uppercase text-gray-500 mb-1"
      >
        Өнөөдрийн орлого
      </div>
      <div className="text-2xl font-semibold mb-1">
        {salesLoading
          ? "..."
          : salesError
          ? "-"
          : salesSummary
          ? formatMNT(salesSummary.todayTotal)
          : "-"}
      </div>
      <div className="text-xs text-gray-500">Өнөөдөр төлсөн</div>
    </div>

    <div
      className="rounded-xl border border-gray-200 p-3 bg-gray-50"
    >
      <div
        className="text-xs uppercase text-gray-500 mb-1"
      >
        Энэ сарын орлого
      </div>
      <div className="text-2xl font-semibold mb-1">
        {salesLoading
          ? "..."
          : salesError
          ? "-"
          : salesSummary
          ? formatMNT(salesSummary.monthTotal)
          : "-"}
      </div>
      <div className="text-xs text-gray-500">Энэ сарын нийт</div>
    </div>
  </div>
)}

          {/* PROFILE TAB */}
          {activeTab === "profile" && (
  <>
    {/* Basic information section (editable) - patient page style */}
    <div
      className="rounded-xl border border-gray-200 p-4 bg-white"
    >
      <div
        className="flex items-center justify-between mb-3"
      >
        <h2 className="text-base mt-0 mb-0">
          Үндсэн мэдээлэл
        </h2>

        {!isEditingProfile ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setIsEditingProfile(true);
            }}
            className="text-xs px-2 py-1 rounded-md border border-gray-300 bg-gray-50 cursor-pointer"
          >
            Засах
          </button>
        ) : null}
      </div>

      {error && (
        <div className="text-red-700 text-xs mb-2">
          {error}
        </div>
      )}

      {!isEditingProfile ? (
        <div
          className="grid [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] gap-3 text-[13px]"
        >
          <div>
            <div className="text-gray-500 mb-0.5">Овог</div>
            <div>{doctor.ovog || "-"}</div>
          </div>

          <div>
            <div className="text-gray-500 mb-0.5">Нэр</div>
            <div>{doctor.name || "-"}</div>
          </div>

          <div>
            <div className="text-gray-500 mb-0.5">И-мэйл</div>
            <div>{doctor.email || "-"}</div>
          </div>

          <div>
            <div className="text-gray-500 mb-0.5">Утас</div>
            <div>{doctor.phone || "-"}</div>
          </div>

          <div>
            <div className="text-gray-500 mb-0.5">РД</div>
            <div>{doctor.regNo || "-"}</div>
          </div>

          <div>
            <div className="text-gray-500 mb-0.5">Үндсэн салбар</div>
            <div>{mainBranchName || "-"}</div>
          </div>

          <div>
            <div className="text-gray-500 mb-0.5">
              Лицензийн дугаар
            </div>
            <div>{doctor.licenseNumber || "-"}</div>
          </div>

          <div>
            <div className="text-gray-500 mb-0.5">
              Лиценз дуусах хугацаа
            </div>
            <div>{formatIsoDateOnly(doctor.licenseExpiryDate) || "-"}</div>
          </div>

          <div>
            <div className="text-gray-500 mb-0.5">
              Ажиллах салбарууд
            </div>
            <div>
              {doctorAssignedBranches?.length
                ? doctorAssignedBranches.map((b) => b.name).join(", ")
                : "-"}
            </div>
          </div>

          <div className="col-span-full">
            <div className="text-gray-500 mb-0.5">
              Гарын үсгийн зураг (URL)
            </div>
            <div>{doctor.signatureImagePath || "-"}</div>
          </div>

          <div className="col-span-full">
            <div className="text-gray-500 mb-0.5">
              Тамганы зураг (URL)
            </div>
            <div>{doctor.stampImagePath || "-"}</div>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSave}
        >
          {/* Photo block */}
          <div className="mb-4 p-3 rounded-xl border border-gray-200 bg-gray-50 flex items-start gap-4">
            <StaffAvatar
              name={form.name}
              ovog={form.ovog}
              email={form.email}
              idPhotoPath={toAbsoluteFileUrl(form.idPhotoPath)}
              variant="compact"
              sizeClassName="w-16 h-16"
            />
            <div className="flex-1 min-w-0">
              <div className="text-gray-500 mb-0.5 text-[13px]">
                Зургийн URL
              </div>
              <div className="flex gap-2 items-center">
                <input
                  name="idPhotoPath"
                  type="text"
                  value={form.idPhotoPath}
                  onChange={(e) => {
                    handleChange(e);
                    setIdPhotoPathError(null);
                  }}
                  placeholder="https://... эсвэл /media/..."
                  className="flex-1 rounded-md border border-gray-300 px-1.5 py-1 text-[13px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, idPhotoPath: "" }));
                    setIdPhotoPathError(null);
                  }}
                  className="px-2 py-1 rounded-md border border-gray-300 bg-white text-[13px] cursor-pointer whitespace-nowrap"
                >
                  Цэвэрлэх
                </button>
              </div>
              <div className="mt-2">
                <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-gray-300 bg-white text-[13px] cursor-pointer whitespace-nowrap hover:bg-gray-50">
                  {uploading ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Байршуулж байна…
                    </>
                  ) : (
                    "Зураг сонгох"
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploading(true);
                      setIdPhotoPathError(null);
                      try {
                        const fd = new FormData();
                        fd.append("file", file);
                        const res = await fetch(`/api/uploads/staff-photo?userId=${id}`, {
                          method: "POST",
                          body: fd,
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          setIdPhotoPathError(data?.error || "Зураг байршуулахад алдаа гарлаа");
                        } else {
                          setForm((f) => ({ ...f, idPhotoPath: data.filePath }));
                        }
                      } catch {
                        setIdPhotoPathError("Зураг байршуулахад алдаа гарлаа");
                      } finally {
                        setUploading(false);
                        // reset so same file can be re-selected
                        e.target.value = "";
                      }
                    }}
                  />
                </label>
              </div>
              {idPhotoPathError && (
                <div className="text-red-600 text-xs mt-1">
                  {idPhotoPathError}
                </div>
              )}
            </div>
          </div>

          {/* Fields grid */}
          <div className="grid [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] gap-3 text-[13px]">
            <div>
              <div className="text-gray-500 mb-0.5">Овог</div>
              <input
                name="ovog"
                type="text"
                value={form.ovog}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 px-1.5 py-1"
              />
            </div>

            <div>
              <div className="text-gray-500 mb-0.5">Нэр</div>
              <input
                name="name"
                type="text"
                value={form.name}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 px-1.5 py-1"
              />
            </div>

            <div>
              <div className="text-gray-500 mb-0.5">И-мэйл</div>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 px-1.5 py-1"
              />
            </div>

            <div>
              <div className="text-gray-500 mb-0.5">Утас</div>
              <input
                name="phone"
                type="text"
                value={form.phone}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 px-1.5 py-1"
              />
            </div>

            <div>
              <div className="text-gray-500 mb-0.5">РД</div>
              <input
                name="regNo"
                type="text"
                value={form.regNo}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 px-1.5 py-1"
              />
            </div>

            <div>
              <div className="text-gray-500 mb-0.5">Үндсэн салбар</div>
              <select
                name="branchId"
                value={form.branchId}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 px-1.5 py-1 bg-white"
              >
                <option value="">Сонгохгүй</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-gray-500 mb-0.5">Лицензийн дугаар</div>
              <input
                name="licenseNumber"
                type="text"
                value={form.licenseNumber}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 px-1.5 py-1"
              />
            </div>

            <div>
              <div className="text-gray-500 mb-0.5">Лиценз дуусах хугацаа</div>
              <input
                name="licenseExpiryDate"
                type="date"
                value={form.licenseExpiryDate}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 px-1.5 py-1"
              />
            </div>

            <div className="col-span-full">
              <div className="text-gray-500 mb-1">Гарын үсэг</div>
              {/* Radio toggle */}
              <div className="flex gap-4 mb-2">
                <label className="inline-flex items-center gap-1.5 text-[13px] cursor-pointer">
                  <input
                    type="radio"
                    name="signatureMode"
                    value="upload"
                    checked={signatureMode === "upload"}
                    onChange={() => {
                      setSignatureMode("upload");
                      signaturePadRef.current?.clear();
                      setPadSignatureError(null);
                    }}
                  />
                  Зураг оруулах
                </label>
                <label className="inline-flex items-center gap-1.5 text-[13px] cursor-pointer">
                  <input
                    type="radio"
                    name="signatureMode"
                    value="draw"
                    checked={signatureMode === "draw"}
                    onChange={() => {
                      setSignatureMode("draw");
                      setForm((f) => ({ ...f, signatureImagePath: "" }));
                      setSignatureError(null);
                    }}
                  />
                  Гараар зурах
                </label>
              </div>

              {signatureMode === "upload" ? (
                <>
                  <div className="flex gap-2 items-center">
                    <input
                      name="signatureImagePath"
                      type="text"
                      value={form.signatureImagePath}
                      onChange={(e) => {
                        handleChange(e);
                        setSignatureError(null);
                      }}
                      placeholder="/uploads/signatures/..."
                      className="flex-1 rounded-md border border-gray-300 px-1.5 py-1 text-[13px]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setForm((f) => ({ ...f, signatureImagePath: "" }));
                        setSignatureError(null);
                      }}
                      className="px-2 py-1 rounded-md border border-gray-300 bg-white text-[13px] cursor-pointer whitespace-nowrap"
                    >
                      Цэвэрлэх
                    </button>
                  </div>
                  <div className="mt-1">
                    <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-gray-300 bg-white text-[13px] cursor-pointer whitespace-nowrap hover:bg-gray-50">
                      {uploadingSignature ? (
                        <>
                          <svg className="animate-spin h-3.5 w-3.5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Байршуулж байна…
                        </>
                      ) : (
                        "Зураг сонгох"
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        disabled={uploadingSignature}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploadingSignature(true);
                          setSignatureError(null);
                          try {
                            const fd = new FormData();
                            fd.append("file", file);
                            const res = await fetch(`/api/uploads/signature?userId=${id}`, {
                              method: "POST",
                              body: fd,
                            });
                            const data = await res.json();
                            if (!res.ok) {
                              setSignatureError(data?.error || "Зураг байршуулахад алдаа гарлаа");
                            } else {
                              setForm((f) => ({ ...f, signatureImagePath: data.filePath }));
                            }
                          } catch {
                            setSignatureError("Зураг байршуулахад алдаа гарлаа");
                          } finally {
                            setUploadingSignature(false);
                            e.target.value = "";
                          }
                        }}
                      />
                    </label>
                  </div>
                  {signatureError && (
                    <div className="text-red-600 text-xs mt-1">{signatureError}</div>
                  )}
                  {form.signatureImagePath && (
                    <div className="mt-2">
                      <img
                        src={toAbsoluteFileUrl(form.signatureImagePath)}
                        alt="Гарын үсэг"
                        className="max-h-16 max-w-[200px] border border-gray-200 rounded bg-white object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <SignaturePad ref={signaturePadRef} disabled={savingPadSignature} />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      disabled={savingPadSignature}
                      onClick={() => {
                        signaturePadRef.current?.clear();
                        setPadSignatureError(null);
                      }}
                      className="px-2 py-1 rounded-md border border-gray-300 bg-white text-[13px] cursor-pointer whitespace-nowrap"
                    >
                      Арилгах
                    </button>
                    <button
                      type="button"
                      disabled={savingPadSignature}
                      onClick={async () => {
                        if (!signaturePadRef.current?.hasDrawn()) {
                          setPadSignatureError("Гарын үсэг зураагүй байна.");
                          return;
                        }
                        setSavingPadSignature(true);
                        setPadSignatureError(null);
                        try {
                          const blob = await signaturePadRef.current.getBlob();
                          if (!blob) {
                            setPadSignatureError("Зураг авахад алдаа гарлаа.");
                            return;
                          }
                          const fd = new FormData();
                          fd.append("file", blob, "signature.png");
                          const res = await fetch(`/api/uploads/signature?userId=${id}`, {
                            method: "POST",
                            body: fd,
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            setPadSignatureError(data?.error || "Зураг байршуулахад алдаа гарлаа");
                          } else {
                            setForm((f) => ({ ...f, signatureImagePath: data.filePath }));
                          }
                        } catch {
                          setPadSignatureError("Зураг байршуулахад алдаа гарлаа");
                        } finally {
                          setSavingPadSignature(false);
                        }
                      }}
                      className={`px-2 py-1 rounded-md border-0 text-white text-[13px] whitespace-nowrap ${savingPadSignature ? "bg-gray-400 cursor-default" : "bg-blue-600 cursor-pointer"}`}
                    >
                      {savingPadSignature ? "Байршуулж байна…" : "Гарын үсэг хадгалах"}
                    </button>
                  </div>
                  {padSignatureError && (
                    <div className="text-red-600 text-xs mt-1">{padSignatureError}</div>
                  )}
                </>
              )}
            </div>

            <div className="col-span-full">
              <div className="text-gray-500 mb-0.5">Тамганы зураг</div>
              <div className="flex gap-2 items-center">
                <input
                  name="stampImagePath"
                  type="text"
                  value={form.stampImagePath}
                  onChange={(e) => {
                    handleChange(e);
                    setStampError(null);
                  }}
                  placeholder="/uploads/stamps/..."
                  className="flex-1 rounded-md border border-gray-300 px-1.5 py-1 text-[13px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, stampImagePath: "" }));
                    setStampError(null);
                  }}
                  className="px-2 py-1 rounded-md border border-gray-300 bg-white text-[13px] cursor-pointer whitespace-nowrap"
                >
                  Цэвэрлэх
                </button>
              </div>
              <div className="mt-1">
                <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-gray-300 bg-white text-[13px] cursor-pointer whitespace-nowrap hover:bg-gray-50">
                  {uploadingStamp ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Байршуулж байна…
                    </>
                  ) : (
                    "Зураг сонгох"
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploadingStamp}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingStamp(true);
                      setStampError(null);
                      try {
                        const fd = new FormData();
                        fd.append("file", file);
                        const res = await fetch(`/api/uploads/stamp?userId=${id}`, {
                          method: "POST",
                          body: fd,
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          setStampError(data?.error || "Зураг байршуулахад алдаа гарлаа");
                        } else {
                          setForm((f) => ({ ...f, stampImagePath: data.filePath }));
                        }
                      } catch {
                        setStampError("Зураг байршуулахад алдаа гарлаа");
                      } finally {
                        setUploadingStamp(false);
                        e.target.value = "";
                      }
                    }}
                  />
                </label>
              </div>
              {stampError && (
                <div className="text-red-600 text-xs mt-1">{stampError}</div>
              )}
              {form.stampImagePath && (
                <div className="mt-2">
                  <img
                    src={toAbsoluteFileUrl(form.stampImagePath)}
                    alt="Тамга"
                    className="max-h-16 max-w-[200px] border border-gray-200 rounded bg-white object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}
            </div>
          </div>

          <div
            className="mt-4 flex gap-2 justify-end"
          >
            <button
              type="button"
              onClick={() => {
                setError(null);
                resetFormFromDoctor();
                setIsEditingProfile(false);
              }}
              disabled={saving || uploading || uploadingSignature || uploadingStamp || savingPadSignature}
              className={`px-3 py-1.5 rounded-md border border-gray-300 bg-gray-50 text-[13px] ${saving || uploading || uploadingSignature || uploadingStamp || savingPadSignature ? "cursor-default" : "cursor-pointer"}`}
            >
              Болих
            </button>

            <button
              type="submit"
              disabled={saving || uploading || uploadingSignature || uploadingStamp || savingPadSignature}
              className={`px-3 py-1.5 rounded-md border-0 ${saving || uploading || uploadingSignature || uploadingStamp || savingPadSignature ? "bg-gray-400" : "bg-blue-600"} text-white text-[13px] ${saving || uploading || uploadingSignature || uploadingStamp || savingPadSignature ? "cursor-default" : "cursor-pointer"}`}
            >
              {saving ? "Хадгалж байна..." : "Хадгалах"}
            </button>
          </div>
        </form>
      )}
    </div>

    {/* Branch assignment - render in patient-card style */}
    <div
      className="mt-4 rounded-xl border border-gray-200 p-4 bg-white"
    >
      <div
        className="flex items-center justify-between mb-3"
      >
        <h2 className="text-base mt-0 mb-0">
          Салбарын тохиргоо
        </h2>

        <button
          type="button"
          onClick={handleSaveBranches}
          disabled={savingBranches}
          className={`px-3 py-1.5 rounded-md border-0 ${savingBranches ? "bg-gray-400" : "bg-emerald-600"} text-white text-[13px] ${savingBranches ? "cursor-default" : "cursor-pointer"}`}
        >
          {savingBranches ? "Салбар хадгалж байна..." : "Салбар хадгалах"}
        </button>
      </div>

      <div className="text-gray-500 text-[13px] mb-2.5">
        Энэ эмч аль салбаруудад ажиллахыг доороос сонгоно уу.
      </div>

      <div className="flex flex-wrap gap-2">
        {branches.map((b) => (
          <label
            key={b.id}
            className="inline-flex items-center gap-1.5 border border-gray-300 rounded px-2 py-1 text-[13px]"
          >
            <input
              type="checkbox"
              checked={selectedBranchIds.includes(b.id)}
              onChange={() => toggleBranch(b.id)}
            />
            {b.name}
          </label>
        ))}
      </div>
    </div>
  </>
)}

          {/* DASHBOARD TAB */}
          {activeTab === "dashboard" && doctor && (
            <DoctorDashboardTab doctorId={doctor.id} />
          )}

          {/* SCHEDULE TAB */}
          {activeTab === "schedule" && (
            <div className="flex flex-col gap-4">
              <Card title="Ажлын хуваарь шинээр нэмэх">
                <div className="text-gray-500 text-[13px] mb-2.5">
                  Сонгосон өдөр, салбар, ээлжийн дагуу шинэ ажлын хуваарь үүсгэнэ.
                </div>

                <form
                  onSubmit={handleSaveSchedule}
                  className="flex flex-col gap-2.5 max-w-[600px]"
                >
                 <div>
                    <div className="text-gray-500 mb-0.5 text-[13px]">Огноо</div>
                  <input
                    className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-[13px] bg-white"
                      type="date"
                      name="date"
                      value={scheduleForm.date}
                      onChange={handleScheduleFormChange}
                    />
                </div>

                  <label className="flex flex-col gap-1">
                    Салбар
                    <select
                      name="branchId"
                      value={scheduleForm.branchId}
                      onChange={handleScheduleFormChange}
                      className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-[13px] bg-white"
                    >
                      <option value="">Сонгох</option>
                      {doctorAssignedBranches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    Ээлж
                    <select
                      name="shiftType"
                      value={scheduleForm.shiftType}
                      onChange={handleScheduleFormChange}
                      className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-[13px] bg-white"
                    >
                      <option value="AM">Өглөө ээлж</option>
                      <option value="PM">Орой ээлж</option>
                      <option value="WEEKEND_FULL">Амралтын өдөр</option>
                    </select>
                  </label>

                  <div className="flex gap-3 flex-wrap">
                    <label className="flex flex-col gap-1">
                      Эхлэх цаг
                      <input
                        type="time"
                        name="startTime"
                        value={scheduleForm.startTime}
                        onChange={handleScheduleFormChange}
                        className="rounded-md border border-gray-300 px-1.5 py-1 text-[13px] bg-white"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Дуусах цаг
                      <input
                        type="time"
                        name="endTime"
                        value={scheduleForm.endTime}
                        onChange={handleScheduleFormChange}
                        className="rounded-md border border-gray-300 px-1.5 py-1 text-[13px] bg-white"
                      />
                    </label>
                  </div>


                  
                  <div>
  <div className="text-gray-500 mb-0.5 text-[13px]">Тэмдэглэл</div>
                    <textarea
                      className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-[13px] bg-white"
                      name="note"
                      rows={2}
                      value={scheduleForm.note}
                      onChange={handleScheduleFormChange}
                      placeholder="Жишээ нь: 30 минут хоцорч эхэлнэ"
                    />
                 </div>

                  <button
                    type="submit"
                    disabled={scheduleSaving || !isCreatingSchedule}
                    className="mt-1 px-4 py-2 rounded-lg border-0 bg-violet-600 text-white cursor-pointer self-start font-bold"
                  >
                    {scheduleSaving ? "Хуваарь хадгалж байна..." : "Хуваарь хадгалах"}
                  </button>

                  {scheduleSaveError && (
                    <div className="text-red-500 mt-1">
                      {scheduleSaveError}
                    </div>
                  )}
                  {scheduleSaveSuccess && (
                    <div className="text-green-600 mt-1">
                      {scheduleSaveSuccess}
                    </div>
                  )}
                </form>
              </Card>

              <Card title="Дараагийн 1 сарын ажлын хуваарь">
                <div className="text-gray-500 text-[13px] mb-2.5">
                  Нийт төлөвлөгдсөн хуваарь
                </div>

                {scheduleLoading && <div>Ажлын хуваарь ачааллаж байна...</div>}

                {!scheduleLoading && scheduleError && (
                  <div className="text-red-500">{scheduleError}</div>
                )}

                {!scheduleLoading && !scheduleError && schedule.length === 0 && (
                  <div className="text-gray-400">Төлөвлөсөн ажлын хуваарь алга.</div>
                )}

                {!scheduleLoading && !scheduleError && schedule.length > 0 && (
                  <>
                  <table
                    className="w-full border-collapse mt-2 text-sm"
                  >
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left border-b border-gray-300 p-2">
                          Огноо
                        </th>
                        <th className="text-left border-b border-gray-300 p-2">
                          Салбар
                        </th>
                        <th className="text-left border-b border-gray-300 p-2">
                          Цаг
                        </th>
                        <th className="text-left border-b border-gray-300 p-2">
                          Тэмдэглэл
                        </th>
                        <th className="text-left border-b border-gray-300 p-2">
                          Үйлдэл
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.slice((schedulePage - 1) * schedulePageSize, schedulePage * schedulePageSize).map((s) => {
                        const isRowEditing = editingScheduleId === s.id;

                        return (
                          <tr key={s.id}>
                            <td className="border-b border-gray-100 p-2">
                              {isRowEditing ? (
                                <input
                                  type="date"
                                  name="date"
                                  value={inlineForm.date}
                                  onChange={handleInlineChange}
                                  className="text-xs p-1"
                                />
                              ) : (
                                formatScheduleDate(s.date)
                              )}
                            </td>

                            <td className="border-b border-gray-100 p-2">
                              {isRowEditing ? (
                                <select
                                  name="branchId"
                                  value={inlineForm.branchId}
                                  onChange={handleInlineChange}
                                  className="text-xs p-1"
                                >
                                  <option value="">Сонгох</option>
                                  {doctorAssignedBranches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                s.branch?.name || "-"
                              )}
                            </td>

                            <td className="border-b border-gray-100 p-2">
                              {isRowEditing ? (
                                <div className="flex gap-1">
                                  <input
                                    type="time"
                                    name="startTime"
                                    value={inlineForm.startTime}
                                    onChange={handleInlineChange}
                                    className="text-xs p-1"
                                  />
                                  <span>-</span>
                                  <input
                                    type="time"
                                    name="endTime"
                                    value={inlineForm.endTime}
                                    onChange={handleInlineChange}
                                    className="text-xs p-1"
                                  />
                                </div>
                              ) : (
                                <>
                                  {s.startTime} - {s.endTime}
                                </>
                              )}
                            </td>

                            <td className="border-b border-gray-100 p-2">
                              {isRowEditing ? (
                                <textarea
                                  name="note"
                                  rows={1}
                                  value={inlineForm.note}
                                  onChange={handleInlineChange}
                                  className="text-xs p-1 w-full"
                                />
                              ) : (
                                s.note || "-"
                              )}
                            </td>

                            <td className="border-b border-gray-100 p-2">
                              {isRowEditing ? (
                                <div className="flex gap-[6px]">
                                  <button
                                    type="button"
                                    onClick={handleInlineSaveSchedule}
                                    disabled={scheduleSaving}
                                    className="px-[10px] py-1 rounded-lg border border-[#4ade80] bg-[#dcfce7] cursor-pointer text-xs font-bold"
                                  >
                                    {scheduleSaving ? "Хадгалж..." : "Хадгалах"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditRow}
                                    className="border border-gray-300 bg-gray-50 px-3 py-1.5 rounded-md text-[13px]"
                                  >
                                    Цуцлах
                                  </button>
                                </div>
                              ) : (
                                <div className="flex gap-[6px]">
                                  <button
                                    type="button"
                                    onClick={() => startEditRow(s)}
                                    className="px-[10px] py-1 rounded-lg border border-gray-300 bg-white cursor-pointer text-xs font-bold"
                                  >
                                    Засах
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSchedule(s.id)}
                                    className="px-[10px] py-1 rounded-lg border border-red-200 bg-red-100 text-red-700 cursor-pointer text-xs font-bold"
                                  >
                                    Устгах
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {/* Pagination controls */}
                  {Math.ceil(schedule.length / schedulePageSize) > 1 && (
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-[13px] text-gray-500">
                        Нийт {schedule.length} бичлэг — {schedulePage}/{Math.ceil(schedule.length / schedulePageSize)} хуудас
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={schedulePage === 1}
                          onClick={() => setSchedulePage((p) => p - 1)}
                          className="px-3 py-1 rounded-md border border-gray-300 bg-white text-[13px] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          ‹ Өмнөх
                        </button>
                        <button
                          type="button"
                          disabled={schedulePage >= Math.ceil(schedule.length / schedulePageSize)}
                          onClick={() => setSchedulePage((p) => p + 1)}
                          className="px-3 py-1 rounded-md border border-gray-300 bg-white text-[13px] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          Дараах ›
                        </button>
                      </div>
                    </div>
                  )}
                  </>
                )}
              </Card>

              <Card title="Олон өдрийн хуваарь оруулах (Mode 2)">
                <div className="text-gray-500 text-[13px] mb-2.5">
                  Огнооны мужид дахь өдөр бүрт ээлж сонгож нэг удаад хуваарилна.
                  Амралтын өдөр зөвхөн «Амралтын өдөр» ээлж боломжтой.
                </div>

                <div className="flex flex-wrap gap-3 items-end mb-3">
                  <label className="flex flex-col gap-1 text-[13px]">
                    Эхлэх огноо
                    <input
                      type="date"
                      value={bulkDateFrom}
                      onChange={(e) => {
                        setBulkDateFrom(e.target.value);
                        setBulkShiftByDate({});
                      }}
                      className="rounded-md border border-gray-300 px-1.5 py-1 text-[13px] bg-white"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-[13px]">
                    Дуусах огноо
                    <input
                      type="date"
                      value={bulkDateTo}
                      onChange={(e) => {
                        setBulkDateTo(e.target.value);
                        setBulkShiftByDate({});
                      }}
                      className="rounded-md border border-gray-300 px-1.5 py-1 text-[13px] bg-white"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-[13px]">
                    Салбар
                    <select
                      value={bulkBranchId}
                      onChange={(e) => setBulkBranchId(e.target.value)}
                      className="rounded-md border border-gray-300 px-1.5 py-1 text-[13px] bg-white"
                    >
                      <option value="">Сонгох</option>
                      {doctorAssignedBranches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {bulkDateFrom && bulkDateTo && getDatesInRange(bulkDateFrom, bulkDateTo).length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-3 max-h-[320px] overflow-y-auto border border-gray-200 rounded-lg p-2">
                    {getDatesInRange(bulkDateFrom, bulkDateTo).map((ymd) => {
                      const [y, m, d] = ymd.split("-").map(Number);
                      const dow = new Date(y, m - 1, d).getDay();
                      const isWeekend = dow === 0 || dow === 6;
                      const selectedShift = bulkShiftByDate[ymd] ?? "";

                      return (
                        <div key={ymd} className="flex items-center gap-3 text-[13px]">
                          <span className={`w-40 shrink-0 ${isWeekend ? "text-blue-600 font-medium" : ""}`}>
                            {formatScheduleDate(ymd)}
                          </span>
                          <select
                            value={selectedShift}
                            onChange={(e) => {
                              const val = e.target.value as ShiftType | "";
                              setBulkShiftByDate((prev) => {
                                const next = { ...prev };
                                if (val === "") {
                                  delete next[ymd];
                                } else {
                                  next[ymd] = val as ShiftType;
                                }
                                return next;
                              });
                            }}
                            className="rounded border border-gray-300 px-1.5 py-0.5 text-[13px] bg-white"
                          >
                            <option value="">— Алгасах —</option>
                            {isWeekend ? (
                              <option value="WEEKEND_FULL">Амралтын өдөр (10:00–19:00)</option>
                            ) : (
                              <>
                                <option value="AM">Өглөө ээлж (09:00–15:00)</option>
                                <option value="PM">Орой ээлж (15:00–21:00)</option>
                                <option value="WEEKEND_FULL">Бүтэн ажлын өдөр (09:00–21:00)</option>
                              </>
                            )}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}

                {bulkError && (
                  <div className="text-red-500 text-[13px] mb-2">{bulkError}</div>
                )}
                {bulkSuccess && (
                  <div className="text-green-600 text-[13px] mb-2">{bulkSuccess}</div>
                )}

                <button
                  type="button"
                  onClick={handleBulkSaveSchedule}
                  disabled={bulkSaving || Object.keys(bulkShiftByDate).length === 0}
                  className="px-4 py-2 rounded-lg border-0 bg-violet-600 text-white cursor-pointer font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {bulkSaving ? "Хадгалж байна..." : `${Object.keys(bulkShiftByDate).length} өдрийн хуваарь хадгалах`}
                </button>
              </Card>

              <Card title="Хуваарийн түүх">
                <div className="text-gray-500 text-[13px] mb-2.5">
                  Өнгөрсөн (эсвэл ирээдүйн) тодорхой хугацааны ажлын хуваарийг харах.
                </div>

                <div
                  className="flex flex-wrap gap-3 items-end mb-3"
                >
                  <label className="flex flex-col gap-1">
                    Эхлэх огноо
                    <input
                      type="date"
                      value={historyFrom}
                      onChange={(e) => setHistoryFrom(e.target.value)}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    Дуусах огноо
                    <input
                      type="date"
                      value={historyTo}
                      onChange={(e) => setHistoryTo(e.target.value)}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={loadHistory}
                    disabled={historyLoading}
                    className="px-4 py-2 rounded-lg border-0 bg-teal-700 text-white cursor-pointer h-[38px] font-bold"
                  >
                    {historyLoading ? "Ачааллаж байна..." : "Харах"}
                  </button>
                </div>

                {historyError && (
                  <div className="text-red-500 mb-2">{historyError}</div>
                )}

                {!historyLoading && historyItems.length === 0 && !historyError && (
                  <div className="text-gray-400">
                    Хуваарийн түүх хараахан ачаалаагүй эсвэл өгөгдөл олдсонгүй.
                  </div>
                )}

                {historyItems.length > 0 && (
                  <>
                  <table
                    className="w-full border-collapse mt-2 text-sm"
                  >
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left border-b border-gray-300 p-2">
                          Огноо
                        </th>
                        <th className="text-left border-b border-gray-300 p-2">
                          Салбар
                        </th>
                        <th className="text-left border-b border-gray-300 p-2">
                          Цаг
                        </th>
                        <th className="text-left border-b border-gray-300 p-2">
                          Тэмдэглэл
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyItems.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize).map((s) => (
                        <tr key={s.id}>
                          <td className="border-b border-gray-100 p-2">
                            {formatScheduleDate(s.date)}
                          </td>
                          <td className="border-b border-gray-100 p-2">
                            {s.branch?.name || "-"}
                          </td>
                          <td className="border-b border-gray-100 p-2">
                            {s.startTime} - {s.endTime}
                          </td>
                          <td className="border-b border-gray-100 p-2">
                            {s.note || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {Math.ceil(historyItems.length / historyPageSize) > 1 && (
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-[13px] text-gray-500">
                        Нийт {historyItems.length} бичлэг — {historyPage}/{Math.ceil(historyItems.length / historyPageSize)} хуудас
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={historyPage === 1}
                          onClick={() => setHistoryPage((p) => p - 1)}
                          className="px-3 py-1 rounded-md border border-gray-300 bg-white text-[13px] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          ‹ Өмнөх
                        </button>
                        <button
                          type="button"
                          disabled={historyPage >= Math.ceil(historyItems.length / historyPageSize)}
                          onClick={() => setHistoryPage((p) => p + 1)}
                          className="px-3 py-1 rounded-md border border-gray-300 bg-white text-[13px] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          Дараах ›
                        </button>
                      </div>
                    </div>
                  )}
                  </>
                )}
              </Card>
            </div>
          )}

          {activeTab === "appointments" && (() => {
            // ── helpers scoped to render ──────────────────────────────────
            const todayStr = new Date().toISOString().slice(0, 10);
            const todayDate = new Date(todayStr);
            const isWeekend = todayDate.getDay() === 0 || todayDate.getDay() === 6;

            // Change 1: derive calendar bounds from today's schedule entry
            const todaySchedule = schedule.find((s) => s.date === todayStr);
            let calendarFirstMinute: number;
            let calendarLastMinute: number;
            let calendarTitle: string;
            if (todaySchedule) {
              const [sh, sm] = todaySchedule.startTime.split(":").map(Number);
              const [eh, em] = todaySchedule.endTime.split(":").map(Number);
              calendarFirstMinute = sh * 60 + (sm || 0);
              calendarLastMinute  = eh * 60 + (em || 0);
              calendarTitle = `Өнөөдрийн цагийн хуваарь (${todaySchedule.startTime}–${todaySchedule.endTime})`;
            } else {
              calendarFirstMinute = isWeekend ? 10 * 60 : 9 * 60;
              calendarLastMinute  = isWeekend ? 19 * 60 : 21 * 60;
              calendarTitle = "Өнөөдрийн цагийн хуваарь";
            }
            const totalSlots = (calendarLastMinute - calendarFirstMinute) / 30;
            const cellPx     = 80; // px per 30-min slot (Tailwind w-20 = 80px)

            const todayAppts = appointments.filter(
              (a) => a.scheduledAt && a.scheduledAt.slice(0, 10) === todayStr
            );

            // upcoming list: exclude cancelled, sort asc
            const upcoming = appointments
              .filter((a) => a.status !== "cancelled")
              .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));

            // group by date
            const groupedMap = new Map<string, DoctorAppointment[]>();
            for (const a of upcoming) {
              const key = (a.scheduledAt ?? "").slice(0, 10);
              if (!key) continue;
              if (!groupedMap.has(key)) groupedMap.set(key, []);
              groupedMap.get(key)!.push(a);
            }
            const sortedDates = Array.from(groupedMap.keys()).sort();

            // slot index for a given ISO time string (can be fractional)
            function slotIndex(iso: string): number {
              const d = new Date(iso);
              const minutes = d.getHours() * 60 + d.getMinutes();
              return (minutes - calendarFirstMinute) / 30;
            }

            // Change 2: build slotMap for 2-row stacked layout
            const slotMap = new Map<number, DoctorAppointment[]>();
            for (const appt of todayAppts) {
              if (!appt.scheduledAt) continue;
              const si = Math.floor(slotIndex(appt.scheduledAt));
              if (!slotMap.has(si)) slotMap.set(si, []);
              const existing = slotMap.get(si)!;
              if (existing.length < 2) existing.push(appt);
            }

            return (
              <>
                {/* ── Section 1: Today's horizontal calendar ─────────────── */}
                <Card title={calendarTitle}>
                  <div className="overflow-x-auto">
                    {/* time labels row */}
                    <div className="flex" style={{ width: totalSlots * cellPx }}>
                      {Array.from({ length: totalSlots }, (_, i) => {
                        const totalMin = calendarFirstMinute + i * 30;
                        const h = String(Math.floor(totalMin / 60)).padStart(2, "0");
                        const m = String(totalMin % 60).padStart(2, "0");
                        return (
                          <div
                            key={i}
                            className="shrink-0 w-20 text-[11px] text-gray-400 border-l border-gray-100 pl-1 py-0.5"
                          >
                            {h}:{m}
                          </div>
                        );
                      })}
                    </div>

                    {/* appointment area — 2-row stacked layout (h-28 = 112px = 2 × 56px) */}
                    <div
                      className="relative border-t border-gray-100 bg-gray-50 rounded-lg"
                      style={{ height: 112, width: totalSlots * cellPx }}
                    >
                      {/* slot grid lines */}
                      {Array.from({ length: totalSlots }, (_, i) => (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 border-l border-gray-200"
                          style={{ left: i * cellPx }}
                        />
                      ))}

                      {todayAppts.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">
                          Өнөөдөр энэ эмчид цаг захиалга байхгүй байна.
                        </div>
                      )}

                      {Array.from(slotMap.entries()).flatMap(([si, appts]) =>
                        appts.map((appt, rowIndex) => {
                          if (!appt.scheduledAt) return null;
                          const MIN_APPT_SLOTS = 0.5;
                          const APPT_SPACING_PX = 2;
                          const exactStartSlot = slotIndex(appt.scheduledAt);
                          const endSlot = appt.endAt
                            ? slotIndex(appt.endAt)
                            : exactStartSlot + 1;
                          const duration = Math.max(endSlot - exactStartSlot, MIN_APPT_SLOTS);
                          const leftPx  = exactStartSlot * cellPx;
                          const widthPx = duration * cellPx - APPT_SPACING_PX;
                          const topPx   = rowIndex * 56;

                          if (si < 0 || si >= totalSlots) return null;

                          const bgCls   = getApptStatusBgClass(appt.status);
                          const textCls = getApptStatusTextClass(appt.status);

                          return (
                            <button
                              key={appt.id}
                              type="button"
                              onClick={() => setDetailsModal({ open: true, appointment: appt })}
                              className={`absolute ${bgCls} ${textCls} rounded-lg shadow-sm cursor-pointer border-0 px-1.5 py-0.5 overflow-hidden flex flex-col justify-center`}
                              style={{ left: leftPx, width: widthPx, top: topPx, height: 52 }}
                            >
                              <span className="text-[10px] font-semibold leading-tight truncate">
                                {formatApptPatientLabel(appt)}
                              </span>
                              <span className="text-[9px] leading-tight truncate opacity-90">
                                {formatApptTimeRange(appt)}
                              </span>
                              <span className="text-[9px] leading-tight truncate opacity-75">
                                {formatApptStatus(appt.status)}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </Card>

                {/* ── Section 2: Date filter ──────────────────────────────── */}
                <Card>
                  <div className="flex gap-3 items-end flex-wrap">
                    <div className="shrink-0">
                      <label className="block text-[13px] font-medium mb-1 text-gray-700">
                        Эхлэх өдөр:
                      </label>
                      <input
                        type="date"
                        value={appointmentsFrom}
                        onChange={(e) => setAppointmentsFrom(e.target.value)}
                        className="px-2.5 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <div className="shrink-0">
                      <label className="block text-[13px] font-medium mb-1 text-gray-700">
                        Дуусах өдөр:
                      </label>
                      <input
                        type="date"
                        value={appointmentsTo}
                        onChange={(e) => setAppointmentsTo(e.target.value)}
                        className="px-2.5 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={loadAppointments}
                      disabled={appointmentsLoading || !appointmentsFrom || !appointmentsTo}
                      className={`px-4 py-2 ${appointmentsLoading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-500 cursor-pointer"} text-white border-0 rounded-md text-sm font-medium`}
                    >
                      {appointmentsLoading ? "Ачаалж байна..." : "Харах"}
                    </button>
                  </div>
                </Card>

                {/* ── Section 3: Grouped appointment list ────────────────── */}
                <Card title="Цагууд">
                  {appointmentsLoading && (
                    <div className="text-gray-500 text-sm py-5">
                      Цагуудыг ачаалж байна...
                    </div>
                  )}
                  {appointmentsError && !appointmentsLoading && (
                    <div className="text-red-600 text-sm py-3">
                      {appointmentsError}
                    </div>
                  )}
                  {!appointmentsLoading && !appointmentsError && upcoming.length === 0 && (
                    <div className="text-gray-500 text-sm py-5">
                      Тухайн хугацаанд цаг олдсонгүй.
                    </div>
                  )}
                  {!appointmentsLoading && !appointmentsError && sortedDates.length > 0 && (
                    <div className="flex flex-col gap-4">
                      {sortedDates.map((dateKey) => {
                        const dayAppts = groupedMap.get(dateKey)!;
                        return (
                          <div key={dateKey}>
                            <div className="text-[13px] font-semibold text-gray-700 mb-2">
                              {formatScheduleDate(dateKey)}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {dayAppts.map((appt) => {
                                const bgCls   = getApptStatusBgClass(appt.status);
                                const textCls = getApptStatusTextClass(appt.status);
                                return (
                                  <button
                                    key={appt.id}
                                    type="button"
                                    onClick={() => setDetailsModal({ open: true, appointment: appt })}
                                    className={`${bgCls} ${textCls} rounded-lg shadow-sm cursor-pointer border-0 px-3 py-2 flex flex-col items-start min-w-[150px] max-w-[220px]`}
                                  >
                                    <span className="text-xs font-semibold">
                                      {formatApptPatientLabel(appt)}
                                    </span>
                                    <span className="text-[11px] mt-0.5">
                                      {formatApptTimeRange(appt)}
                                    </span>
                                    <span className="text-[10px] mt-0.5 opacity-75">
                                      {formatApptStatus(appt.status)}{appt.branchName ? ` · ${appt.branchName}` : ""}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>

                {/* ── Section 4: AppointmentDetailsModal ─────────────────── */}
                {detailsModal.open && detailsModal.appointment && (
                  <AppointmentDetailsModal
                    open={detailsModal.open}
                    onClose={() => setDetailsModal({ open: false, appointment: null })}
                    doctor={
                      doctor
                        ? { id: doctor.id, name: doctor.name ?? null, ovog: doctor.ovog ?? null, regNo: null, phone: doctor.phone ?? null }
                        : null
                    }
                    appointments={[doctorApptToModalAppt(detailsModal.appointment)]}
                    slotAppointmentCount={1}
                    onStatusUpdated={(updated) => {
                      setAppointments((prev) =>
                        prev.map((a) =>
                          a.id === updated.id
                            ? { ...a, status: updated.status, notes: updated.notes ?? null }
                            : a
                        )
                      );
                    }}
                  />
                )}
              </>
            );
          })()}

          {activeTab === "sales" && (
            <div className="flex flex-col gap-4">
              {/* Date range filter */}
              <Card>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="mb-1 block text-[13px] font-medium text-gray-700">
                      Эхлэх өдөр:
                    </label>
                    <input
                      type="date"
                      value={salesStartDate}
                      onChange={(e) => setSalesStartDate(e.target.value)}
                      className="rounded-md border border-gray-300 px-2.5 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[13px] font-medium text-gray-700">
                      Дуусах өдөр:
                    </label>
                    <input
                      type="date"
                      value={salesEndDate}
                      onChange={(e) => setSalesEndDate(e.target.value)}
                      className="rounded-md border border-gray-300 px-2.5 py-2 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={fetchSalesData}
                    disabled={salesDataLoading || !salesStartDate || !salesEndDate}
                    className={`rounded-md border-0 px-4 py-2 text-sm font-medium text-white ${salesDataLoading ? "cursor-not-allowed bg-gray-400" : "cursor-pointer bg-blue-500 hover:bg-blue-600"}`}
                  >
                    {salesDataLoading ? "Ачаалж байна..." : "Харах"}
                  </button>
                </div>
              </Card>

              {salesDataError && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                  {salesDataError}
                </div>
              )}

              {salesDataLoading ? (
                <p className="text-sm text-gray-600">Ачаалж байна...</p>
              ) : salesData && (
                <>
                  {/* Summary totals */}
                  <Card>
                    <div className="flex flex-wrap gap-8">
                      <div>
                        <div className="text-xs text-gray-500">Нийт борлуулалт</div>
                        <div className="text-lg font-bold text-gray-900">
                          {fmtMnt(salesData.totals.totalSalesMnt)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Нийт эмчийн хувь</div>
                        <div className="text-lg font-bold text-gray-900">
                          {fmtMnt(salesData.totals.totalIncomeMnt)}
                        </div>
                      </div>
                    </div>
                  </Card>

                  {/* Category table with expandable rows */}
                  <Card>
                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                      <table className="w-full border-collapse text-sm">
                        <thead className="bg-gray-50 text-left">
                          <tr>
                            <th className="px-4 py-3 font-semibold text-gray-700">Ангилал</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-700">Хувь (%)</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-700">Борлуулалт</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-700">Эмчийн хувь</th>
                            <th className="px-4 py-3 text-center font-semibold text-gray-700">Үйлдэл</th>
                          </tr>
                        </thead>
                        <tbody>
                          {salesData.categories.map((row) => {
                            const isOpen = salesExpandedCategories.has(row.key);
                            const lines = salesCategoryLines[row.key];
                            const lineError = salesCategoryErrors[row.key];
                            return (
                              <React.Fragment key={row.key}>
                                <tr className="border-t border-gray-200">
                                  <td className="px-4 py-3">{row.label}</td>
                                  <td className="px-4 py-3 text-right">{Number(row.pctUsed || 0)}%</td>
                                  <td className="px-4 py-3 text-right">{fmtMnt(row.salesMnt)}</td>
                                  <td className="px-4 py-3 text-right">{fmtMnt(row.incomeMnt)}</td>
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      type="button"
                                      aria-label={isOpen ? "Хаах" : "Дэлгэрэнгүй харах"}
                                      onClick={() => toggleSalesCategory(row.key)}
                                      className="inline-flex items-center justify-center rounded border border-gray-300 bg-white p-1.5 text-gray-600 hover:bg-gray-50 hover:text-blue-600"
                                    >
                                      <SalesChevronIcon open={isOpen} />
                                    </button>
                                  </td>
                                </tr>
                                {isOpen && (
                                  <tr>
                                    <td colSpan={5} className="p-0">
                                      <div className="border-t border-blue-100 bg-blue-50/20">
                                        {lines === null ? (
                                          <p className="px-8 py-3 text-xs text-gray-500">
                                            Ачаалж байна...
                                          </p>
                                        ) : lineError ? (
                                          <p className="px-8 py-3 text-xs text-red-600">{lineError}</p>
                                        ) : (
                                          <div className="overflow-x-auto">
                                            <table className="w-full border-collapse text-xs">
                                              <thead className="bg-blue-50 text-left">
                                                <tr>
                                                  <th className="py-2 pl-8 pr-3 font-semibold text-gray-600">
                                                    Нэхэмжлэл #
                                                  </th>
                                                  <th className="px-3 py-2 font-semibold text-gray-600">
                                                    Үзлэгийн огноо
                                                  </th>
                                                  <th className="px-3 py-2 font-semibold text-gray-600">
                                                    Үйлчлүүлэгч
                                                  </th>
                                                  <th className="px-3 py-2 font-semibold text-gray-600">
                                                    Үйлчилгээ
                                                  </th>
                                                  <th className="px-3 py-2 text-right font-semibold text-gray-600">
                                                    Үнийн дүн
                                                  </th>
                                                  <th className="px-3 py-2 text-right font-semibold text-gray-600">
                                                    Хөнгөлөлт
                                                  </th>
                                                  <th className="px-3 py-2 text-right font-semibold text-gray-600">
                                                    Нийт
                                                  </th>
                                                  <th className="px-3 py-2 font-semibold text-gray-600">
                                                    Төлбөрийн хэрэгсэл
                                                  </th>
                                                  <th className="px-3 py-2 font-semibold text-gray-600">
                                                    Үйлчилгээний төрөл
                                                  </th>
                                                  <th className="px-3 py-2 text-center font-semibold text-gray-600">
                                                    Үйлдэл
                                                  </th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                <SalesDrillDownRows
                                                  lines={lines ?? []}
                                                  onOpenReport={(apptId) =>
                                                    setSalesReportModalAppointmentId(apptId)
                                                  }
                                                />
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-gray-50">
                          <tr className="border-t-2 border-gray-200 font-bold">
                            <td className="px-4 py-3">Нийт</td>
                            <td className="px-4 py-3" />
                            <td className="px-4 py-3 text-right">{fmtMnt(salesData.totals.totalSalesMnt)}</td>
                            <td className="px-4 py-3 text-right">{fmtMnt(salesData.totals.totalIncomeMnt)}</td>
                            <td className="px-4 py-3" />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </Card>
                </>
              )}
            </div>
          )}

          {activeTab === "history" && (() => {
            const historyTotalPages = Math.max(1, Math.ceil(apptHistory.length / apptHistoryPageSize));
            const historyPaged = apptHistory.slice(
              (apptHistoryPage - 1) * apptHistoryPageSize,
              apptHistoryPage * apptHistoryPageSize
            );

            return (
              <>
                {/* Date filter */}
                <Card>
                  <div className="flex gap-3 items-end flex-wrap">
                    <div className="shrink-0">
                      <label className="block text-[13px] font-medium mb-1 text-gray-700">
                        Эхлэх өдөр:
                      </label>
                      <input
                        type="date"
                        value={apptHistoryFrom}
                        onChange={(e) => setApptHistoryFrom(e.target.value)}
                        className="px-2.5 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <div className="shrink-0">
                      <label className="block text-[13px] font-medium mb-1 text-gray-700">
                        Дуусах өдөр:
                      </label>
                      <input
                        type="date"
                        value={apptHistoryTo}
                        onChange={(e) => setApptHistoryTo(e.target.value)}
                        className="px-2.5 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={loadApptHistory}
                      disabled={apptHistoryLoading || !apptHistoryFrom || !apptHistoryTo}
                      className={`px-4 py-2 ${apptHistoryLoading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-500 cursor-pointer"} text-white border-0 rounded-md text-sm font-medium`}
                    >
                      {apptHistoryLoading ? "Ачаалж байна..." : "Харах"}
                    </button>
                    <div className="shrink-0 ml-auto flex items-center gap-1">
                      <label className="text-[13px] text-gray-600">Хуудсанд:</label>
                      <select
                        value={apptHistoryPageSize}
                        onChange={(e) => {
                          setApptHistoryPageSize(Number(e.target.value));
                          setApptHistoryPage(1);
                        }}
                        className="px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                      >
                        <option value={15}>15</option>
                        <option value={30}>30</option>
                        <option value={45}>45</option>
                      </select>
                    </div>
                  </div>
                </Card>

                {/* History list */}
                <Card title="Үзлэгийн түүх">
                  {apptHistoryLoading && (
                    <div className="text-gray-500 text-sm py-5">
                      Үзлэгийн түүхийг ачаалж байна...
                    </div>
                  )}
                  {apptHistoryError && !apptHistoryLoading && (
                    <div className="text-red-600 text-sm py-3">
                      {apptHistoryError}
                    </div>
                  )}
                  {!apptHistoryLoading && !apptHistoryError && apptHistory.length === 0 && (
                    <div className="text-gray-500 text-sm py-5">
                      Тухайн хугацаанд үзлэг олдсонгүй.
                    </div>
                  )}
                  {!apptHistoryLoading && !apptHistoryError && apptHistory.length > 0 && (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">
                                Огноо
                              </th>
                              <th className="text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">
                                Цаг
                              </th>
                              <th className="text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700">
                                Үйлчлүүлэгч
                              </th>
                              <th className="text-left border-b border-gray-200 py-2 px-2 font-semibold text-gray-700">
                                Утас
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
                            {historyPaged.map((a) => {
                              const dateStr = (a.scheduledAt ?? "").slice(0, 10);
                              return (
                                <tr key={a.id} className="odd:bg-white even:bg-gray-50">
                                  <td className="border-b border-gray-100 py-1.5 px-2 whitespace-nowrap text-[13px]">
                                    {formatScheduleDate(dateStr)}
                                  </td>
                                  <td className="border-b border-gray-100 py-1.5 px-2 whitespace-nowrap text-[13px]">
                                    {formatApptTimeRange(a)}
                                  </td>
                                  <td className="border-b border-gray-100 py-1.5 px-2 text-[13px]">
                                    {formatApptPatientLabel(a)}
                                  </td>
                                  <td className="border-b border-gray-100 py-1.5 px-2 text-[13px] text-gray-600">
                                    {a.patientPhone || "—"}
                                  </td>
                                  <td className="border-b border-gray-100 py-1.5 px-2 text-[13px]">
                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${getApptStatusBgClass(a.status)} ${getApptStatusTextClass(a.status)}`}>
                                      {formatApptStatus(a.status)}
                                    </span>
                                  </td>
                                  <td className="border-b border-gray-100 py-1.5 px-2 text-[13px] text-gray-600 max-w-[200px] truncate">
                                    {a.notes || "—"}
                                  </td>
                                  <td className="border-b border-gray-100 py-1.5 px-2">
                                    {a.status === "completed" && (
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          title="Дэлгэрэнгүй"
                                          onClick={() => {
                                            setHistoryReportAppointmentId(a.id);
                                            setHistoryReportModalOpen(true);
                                          }}
                                          className="inline-flex items-center justify-center w-7 h-7 rounded border border-blue-300 bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer"
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                            <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                                            <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                          </svg>
                                        </button>
                                        <button
                                          type="button"
                                          title="Хавсралтууд"
                                          disabled={(a.materialsCount ?? 0) < 1}
                                          onClick={() => {
                                            if (a.encounterId) {
                                              setHistoryMaterialsEncounterId(a.encounterId);
                                              setHistoryMaterialsModalOpen(true);
                                            }
                                          }}
                                          className="inline-flex items-center justify-center w-7 h-7 rounded border border-gray-300 bg-gray-50 text-gray-500 hover:bg-gray-100 cursor-pointer disabled:opacity-40 disabled:cursor-default"
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                                          </svg>
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {/* Pagination */}
                      <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
                        <span>
                          Нийт {apptHistory.length} бүртгэл
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setApptHistoryPage((p) => Math.max(1, p - 1))}
                            disabled={apptHistoryPage === 1}
                            className="px-2 py-1 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer disabled:opacity-40 disabled:cursor-default"
                          >
                            ‹ Өмнөх
                          </button>
                          <span>
                            {apptHistoryPage} / {historyTotalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setApptHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                            disabled={apptHistoryPage === historyTotalPages}
                            className="px-2 py-1 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer disabled:opacity-40 disabled:cursor-default"
                          >
                            Дараах ›
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </Card>

                {/* Encounter Report Modal */}
                <EncounterReportModal
                  open={historyReportModalOpen}
                  onClose={() => {
                    setHistoryReportModalOpen(false);
                    setHistoryReportAppointmentId(null);
                  }}
                  appointmentId={historyReportAppointmentId}
                />

                {/* Encounter Materials Modal */}
                <EncounterMaterialsModal
                  open={historyMaterialsModalOpen}
                  onClose={() => {
                    setHistoryMaterialsModalOpen(false);
                    setHistoryMaterialsEncounterId(null);
                  }}
                  encounterId={historyMaterialsEncounterId}
                />
              </>
            );
          })()}
        </div>
      </section>

      {/* Sales tab: Encounter Report Modal */}
      <EncounterReportModal
        open={salesReportModalAppointmentId != null}
        onClose={() => setSalesReportModalAppointmentId(null)}
        appointmentId={salesReportModalAppointmentId}
      />
    </main>
  );
}
