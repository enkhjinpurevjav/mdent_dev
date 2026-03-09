import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import StaffAvatar from "../../../components/StaffAvatar";
import SignaturePad, { SignaturePadRef } from "../../../components/SignaturePad";
import { toAbsoluteFileUrl } from "../../../utils/toAbsoluteFileUrl";

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
};

type ShiftType = "AM" | "PM" | "WEEKEND_FULL";
type DoctorTabKey = "profile" | "schedule" | "appointments" | "test1" | "test2";

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

  // Bulk schedule tool state
  const [bulkBranchId, setBulkBranchId] = useState<string>("");
  const [bulkDays, setBulkDays] = useState<7 | 14 | 30>(7);
  const [bulkWeekdayMode, setBulkWeekdayMode] = useState<"AM" | "PM" | "BOTH">("AM");
  const [bulkIncludeWeekends, setBulkIncludeWeekends] = useState(false);
  const [bulkNote, setBulkNote] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);

  // Clear range tool state
  const [clearFrom, setClearFrom] = useState("");
  const [clearTo, setClearTo] = useState("");
  const [clearBranchId, setClearBranchId] = useState<string>("");
  const [clearLoading, setClearLoading] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearSuccess, setClearSuccess] = useState<string | null>(null);

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

        // preselect first assigned branch in bulk tool forms
        if (initialBranchIds[0]) {
          setBulkBranchId(String(initialBranchIds[0]));
          setClearBranchId(String(initialBranchIds[0]));
        }

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

  // Auto-load appointments when tab is active and dates are set
  useEffect(() => {
    if (activeTab === "appointments") {
      loadAppointments();
    }
  }, [activeTab, loadAppointments]);

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
    } catch (err) {
      console.error(err);
      setHistoryError("Сүлжээгээ шалгана уу");
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleBulkCreate = async () => {
    if (!id) return;
    if (!bulkBranchId) {
      setBulkError("Салбар сонгоно уу.");
      return;
    }
    setBulkLoading(true);
    setBulkError(null);
    setBulkSuccess(null);
    try {
      const res = await fetch(`/api/users/${id}/schedule/bulk-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: bulkDays,
          branchId: Number(bulkBranchId),
          template: {
            weekdayMode: bulkWeekdayMode,
            includeWeekends: bulkIncludeWeekends,
          },
          note: bulkNote || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBulkError(data?.error || "Хуваарь үүсгэх үед алдаа гарлаа");
      } else {
        setBulkSuccess(
          `Амжилттай: ${data.created} шинэ, ${data.updated} шинэчлэгдсэн (нийт ${data.total})`
        );
        await reloadSchedule();
        setTimeout(() => setBulkSuccess(null), 5000);
      }
    } catch {
      setBulkError("Сүлжээгээ шалгана уу");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleClearRange = async () => {
    if (!id) return;
    if (!clearFrom || !clearTo) {
      setClearError("Эхлэх болон дуусах огноог сонгоно уу.");
      return;
    }
    if (!clearBranchId) {
      setClearError("Салбар сонгоно уу.");
      return;
    }
    const ok = window.confirm(
      `${clearFrom} – ${clearTo} хооронд сонгосон салбарын хуваарийг устгахдаа итгэлтэй байна уу?`
    );
    if (!ok) return;
    setClearLoading(true);
    setClearError(null);
    setClearSuccess(null);
    try {
      const params = new URLSearchParams({
        from: clearFrom,
        to: clearTo,
        branchId: clearBranchId,
      });
      const res = await fetch(`/api/users/${id}/schedule/bulk-clear?${params}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setClearError(data?.error || "Хуваарь цэвэрлэх үед алдаа гарлаа");
      } else {
        setClearSuccess(`${data.deleted} хуваарь устгагдлаа.`);
        await reloadSchedule();
        setTimeout(() => setClearSuccess(null), 5000);
      }
    } catch {
      setClearError("Сүлжээгээ шалгана уу");
    } finally {
      setClearLoading(false);
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
  onClick={() => router.push("/users/doctors")}
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
        setActiveTab("test1");
        setIsEditingProfile(false);
        setError(null);
      }}
      className={`text-left px-2.5 py-1.5 rounded-md border-0 ${activeTab === "test1" ? "bg-blue-50" : "bg-transparent"} ${activeTab === "test1" ? "text-blue-700" : "text-gray-500"} ${activeTab === "test1" ? "font-medium" : "font-normal"} cursor-pointer`}
    >
      Борлуулалт
    </button>

    <button
      type="button"
      onClick={() => {
        setActiveTab("test2");
        setIsEditingProfile(false);
        setError(null);
      }}
      className={`text-left px-2.5 py-1.5 rounded-md border-0 ${activeTab === "test2" ? "bg-blue-50" : "bg-transparent"} ${activeTab === "test2" ? "text-blue-700" : "text-gray-500"} ${activeTab === "test2" ? "font-medium" : "font-normal"} cursor-pointer`}
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
                                new Date(s.date).toLocaleDateString("mn-MN", {
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                  weekday: "short",
                                })
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

              <Card title="Хуваарь хэрэгсэл">
                <div className="text-gray-500 text-[13px] mb-3">
                  Загвараас олон өдрийн хуваарийг нэг дор үүсгэх буюу хугацааны хуваарийг цэвэрлэх.
                </div>

                {/* Bulk create section */}
                <div className="mb-5">
                  <div className="font-medium text-[13px] mb-2">Хуваарь үүсгэх</div>
                  <div className="flex flex-col gap-2.5 max-w-[520px]">
                    <label className="flex flex-col gap-1 text-[13px]">
                      Салбар <span className="text-red-500 text-xs">*</span>
                      <select
                        value={bulkBranchId}
                        onChange={(e) => setBulkBranchId(e.target.value)}
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

                    <div>
                      <div className="text-[13px] text-gray-600 mb-1">Хугацаа (өдөр)</div>
                      <div className="flex gap-2">
                        {([7, 14, 30] as const).map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setBulkDays(d)}
                            className={`px-3 py-1 rounded-md border text-[13px] cursor-pointer ${
                              bulkDays === d
                                ? "bg-violet-600 text-white border-violet-600"
                                : "bg-white border-gray-300 text-gray-700"
                            }`}
                          >
                            {d} өдөр
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-[13px] text-gray-600 mb-1">Ажлын өдрийн ээлж</div>
                      <div className="flex gap-2">
                        {(["AM", "PM", "BOTH"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setBulkWeekdayMode(mode)}
                            className={`px-3 py-1 rounded-md border text-[13px] cursor-pointer ${
                              bulkWeekdayMode === mode
                                ? "bg-violet-600 text-white border-violet-600"
                                : "bg-white border-gray-300 text-gray-700"
                            }`}
                          >
                            {mode === "AM" ? "Өглөө (09–15)" : mode === "PM" ? "Орой (15–21)" : "Хоёр ээлж"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bulkIncludeWeekends}
                        onChange={(e) => setBulkIncludeWeekends(e.target.checked)}
                      />
                      Амралтын өдрийг оруулах (10:00–19:00)
                    </label>

                    <div>
                      <div className="text-[13px] text-gray-600 mb-1">Тэмдэглэл (заавал биш)</div>
                      <input
                        type="text"
                        value={bulkNote}
                        onChange={(e) => setBulkNote(e.target.value)}
                        placeholder="Жишээ нь: Орлон ажиллана"
                        className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-[13px] bg-white"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleBulkCreate}
                      disabled={bulkLoading || !bulkBranchId}
                      className={`mt-1 px-4 py-2 rounded-lg border-0 text-white text-[13px] font-bold self-start ${
                        bulkLoading || !bulkBranchId
                          ? "bg-gray-400 cursor-default"
                          : "bg-violet-600 cursor-pointer"
                      }`}
                    >
                      {bulkLoading ? "Үүсгэж байна..." : "Үүсгэх"}
                    </button>

                    {bulkError && (
                      <div className="text-red-500 text-[13px]">{bulkError}</div>
                    )}
                    {bulkSuccess && (
                      <div className="text-green-600 text-[13px]">{bulkSuccess}</div>
                    )}
                  </div>
                </div>

                {/* Clear range section */}
                <div className="border-t border-gray-200 pt-4">
                  <div className="font-medium text-[13px] mb-2 text-red-700">Хугацаа цэвэрлэх</div>
                  <div className="text-gray-500 text-[13px] mb-2.5">
                    Сонгосон огнооны хоорондох хуваарийг бүр мөсөн устгана.
                  </div>
                  <div className="flex flex-col gap-2.5 max-w-[520px]">
                    <div className="flex flex-wrap gap-3">
                      <label className="flex flex-col gap-1 text-[13px]">
                        Эхлэх огноо <span className="text-red-500 text-xs">*</span>
                        <input
                          type="date"
                          value={clearFrom}
                          onChange={(e) => setClearFrom(e.target.value)}
                          className="rounded-md border border-gray-300 px-1.5 py-1 text-[13px] bg-white"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[13px]">
                        Дуусах огноо <span className="text-red-500 text-xs">*</span>
                        <input
                          type="date"
                          value={clearTo}
                          onChange={(e) => setClearTo(e.target.value)}
                          className="rounded-md border border-gray-300 px-1.5 py-1 text-[13px] bg-white"
                        />
                      </label>
                    </div>

                    <label className="flex flex-col gap-1 text-[13px]">
                      Салбар <span className="text-red-500 text-xs">*</span>
                      <select
                        value={clearBranchId}
                        onChange={(e) => setClearBranchId(e.target.value)}
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

                    <button
                      type="button"
                      onClick={handleClearRange}
                      disabled={clearLoading || !clearFrom || !clearTo || !clearBranchId}
                      className={`mt-1 px-4 py-2 rounded-lg border-0 text-white text-[13px] font-bold self-start ${
                        clearLoading || !clearFrom || !clearTo || !clearBranchId
                          ? "bg-gray-400 cursor-default"
                          : "bg-red-600 cursor-pointer"
                      }`}
                    >
                      {clearLoading ? "Цэвэрлэж байна..." : "Хугацаа цэвэрлэх"}
                    </button>

                    {clearError && (
                      <div className="text-red-500 text-[13px]">{clearError}</div>
                    )}
                    {clearSuccess && (
                      <div className="text-green-600 text-[13px]">{clearSuccess}</div>
                    )}
                  </div>
                </div>
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
                      {historyItems.map((s) => (
                        <tr key={s.id}>
                          <td className="border-b border-gray-100 p-2">
                            {new Date(s.date).toLocaleDateString("mn-MN", {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              weekday: "short",
                            })}
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
                )}
              </Card>
            </div>
          )}

          {activeTab === "appointments" && (
            <Card title="Цагууд">
              {/* Date Range Filter */}
              <div
                className="flex gap-3 mb-4 items-end flex-wrap"
              >
                <div className="shrink-0">
                  <label
                    className="block text-[13px] font-medium mb-1 text-gray-700"
                  >
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
                  <label
                    className="block text-[13px] font-medium mb-1 text-gray-700"
                  >
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
                  onClick={loadAppointments}
                  disabled={appointmentsLoading || !appointmentsFrom || !appointmentsTo}
                  className={`px-4 py-2 ${appointmentsLoading ? "bg-gray-400" : "bg-blue-500"} text-white border-0 rounded-md text-sm font-medium ${appointmentsLoading ? "cursor-not-allowed" : "cursor-pointer"}`}
                >
                  {appointmentsLoading ? "Ачаалж байна..." : "Харах"}
                </button>
              </div>

              {/* Loading State */}
              {appointmentsLoading && (
                <div className="text-gray-500 text-sm py-5">
                  Цагуудыг ачаалж байна...
                </div>
              )}

              {/* Error State */}
              {appointmentsError && !appointmentsLoading && (
                <div className="text-red-600 text-sm py-3">
                  {appointmentsError}
                </div>
              )}

              {/* Empty State */}
              {!appointmentsLoading &&
                !appointmentsError &&
                appointments.length === 0 && (
                  <div className="text-gray-500 text-sm py-5">
                    Тухайн хугацаанд цаг олдсонгүй.
                  </div>
                )}

              {/* Appointments Table */}
              {!appointmentsLoading &&
                !appointmentsError &&
                appointments.length > 0 && (
                  <div className="overflow-x-auto">
                    <table
                      className="w-full border-collapse text-sm"
                    >
                      <thead>
                        <tr
                          className="border-b-2 border-gray-200 bg-gray-50"
                        >
                          <th
                            className="px-2 py-2.5 text-left font-semibold text-gray-700"
                          >
                            Огноо
                          </th>
                          <th
                            className="px-2 py-2.5 text-left font-semibold text-gray-700"
                          >
                            Цаг
                          </th>
                          <th
                            className="px-2 py-2.5 text-left font-semibold text-gray-700"
                          >
                            Өвчтөн
                          </th>
                          <th
                            className="px-2 py-2.5 text-left font-semibold text-gray-700"
                          >
                            Төлөв
                          </th>
                          <th
                            className="px-2 py-2.5 text-left font-semibold text-gray-700"
                          >
                            Салбар
                          </th>
                          <th
                            className="px-2 py-2.5 text-left font-semibold text-gray-700"
                          >
                            Үйлдэл
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {appointments.map((appt) => {
                          const scheduledDate = appt.scheduledAt
                            ? new Date(appt.scheduledAt)
                            : null;
                          const dateStr = scheduledDate
                            ? scheduledDate.toISOString().slice(0, 10)
                            : "";
                          const timeStr = formatTime(appt.scheduledAt);
                          const endTimeStr = formatTime(appt.endAt);

                          const patientFullName = [appt.patientOvog, appt.patientName]
                            .filter(Boolean)
                            .join(" ");

                          return (
                            <tr
                              key={appt.id}
                              className="border-b border-gray-200"
                            >
                              <td className="px-2 py-2.5">{dateStr}</td>
                              <td className="px-2 py-2.5">
                                {timeStr}
                                {endTimeStr && ` - ${endTimeStr}`}
                              </td>
                              <td className="px-2 py-2.5">
                                {patientFullName || "—"}
                              </td>
                              <td className="px-2 py-2.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-medium ${appt.status === "completed" ? "bg-[#d1fae5] text-[#065f46]" : appt.status === "ongoing" ? "bg-[#fef3c7] text-[#92400e]" : "bg-[#dbeafe] text-[#1e40af]"}`}
                                >
                                  {appt.status}
                                </span>
                              </td>
                              <td className="px-2 py-2.5">
                                {appt.branchName || `#${appt.branchId}`}
                              </td>
                              <td className="px-2 py-2.5">
                                {appt.patientBookNumber ? (
                                  <button
                                    onClick={() =>
                                      router.push(
                                        `/patients/${appt.patientBookNumber}`
                                      )
                                    }
                                    className="px-3 py-1 bg-blue-500 text-white border-0 rounded text-[13px] font-medium cursor-pointer"
                                  >
                                    Харах
                                  </button>
                                ) : (
                                  <span className="text-gray-400 text-xs">
                                    —
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
            </Card>
          )}

          {activeTab === "test1" && (
            <Card title="Test Page 1">
              <div className="text-gray-500 text-[13px]">Placeholder page.</div>
            </Card>
          )}

          {activeTab === "test2" && (
            <Card title="Test Page 2">
              <div className="text-gray-500 text-[13px]">Placeholder page.</div>
            </Card>
          )}
        </div>
      </section>
    </main>
  );
}
