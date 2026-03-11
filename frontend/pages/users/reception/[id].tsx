import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

type Branch = {
  id: number;
  name: string;
};

type Reception = {
  id: number;
  email: string;
  name?: string;
  ovog?: string | null;
  role: string;
  branchId?: number | null;
  regNo?: string | null;
  phone?: string | null;
  idPhotoPath?: string | null;
  branch?: Branch | null;
};

type ReceptionScheduleDay = {
  id: number;
  date: string; // "YYYY-MM-DD"
  branch: Branch;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  note?: string | null;
};

type ShiftType = "AM" | "PM" | "WEEKEND_FULL";
type ReceptionTabKey = "profile" | "schedule";

function formatStaffShortName(staff: { name?: string | null; ovog?: string | null; email?: string | null }) {
  const name = (staff.name || "").toString().trim();
  const ovog = (staff.ovog || "").toString().trim();
  const email = (staff.email || "").toString().trim();

  if (ovog) {
    const first = ovog.charAt(0).toUpperCase();
    return `${first}.${name || email || "-"}`;
  }
  return name || email || "-";
}

export default function ReceptionProfilePage() {
  const router = useRouter();
  const { id } = router.query;

  const [reception, setReception] = useState<Reception | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBranches, setSavingBranches] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ReceptionTabKey>("profile");
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  useEffect(() => {
    const tabParam = router.query.tab as string | undefined;
    if (!tabParam) return;
    const allowed: ReceptionTabKey[] = ["profile", "schedule"];
    if (allowed.includes(tabParam as ReceptionTabKey)) {
      setActiveTab(tabParam as ReceptionTabKey);
      setIsEditingProfile(false);
      setError(null);
    }
  }, [router.query.tab]);

  const [form, setForm] = useState({
    name: "",
    ovog: "",
    email: "",
    branchId: "",
    regNo: "",
    phone: "",
  });

  // selected multiple branches (ReceptionBranch)
  const [selectedBranchIds, setSelectedBranchIds] = useState<number[]>([]);

  // schedule state (next 31 days)
  const [schedule, setSchedule] = useState<ReceptionScheduleDay[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // schedule table pagination
  const [schedulePage, setSchedulePage] = useState(1);
  const schedulePageSize = 10;

  // History (Хуваарийн түүх) state
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<ReceptionScheduleDay[]>([]);
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

  // schedule editor form state (create only)
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
  const [scheduleSaveSuccess, setScheduleSaveSuccess] = useState<
    string | null
  >(null);

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

  const resetFormFromReception = () => {
    if (!reception) return;
    setForm({
      name: reception.name || "",
      ovog: reception.ovog || "",
      email: reception.email || "",
      branchId: reception.branchId ? String(reception.branchId) : "",
      regNo: reception.regNo || "",
      phone: reception.phone || "",
    });
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

      if (name === "shiftType") {
        const shift = value as ShiftType;

        if (prev.date) {
          const d = new Date(prev.date);
          const day = d.getDay();
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

  // Load branches + receptionist + schedule
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

        // load user (defensive JSON parsing)
        const rRes = await fetch(`/api/users/${id}`);

        let rData: any = null;
        try {
          rData = await rRes.json();
        } catch {
          rData = null;
        }

        if (!rRes.ok || !rData) {
          setError(
            (rData && rData.error) ||
              "Ресепшний мэдээллийг ачаалж чадсангүй"
          );
          setLoading(false);
          return;
        }

        const rec: Reception = rData;
        setReception(rec);

        setForm({
          name: rec.name || "",
          ovog: rec.ovog || "",
          email: rec.email || "",
          branchId: rec.branchId ? String(rec.branchId) : "",
          regNo: rec.regNo || "",
          phone: rec.phone || "",
        });

        // initial multi-branch selection
        const initialBranchIds =
          rData.branches && Array.isArray(rData.branches)
            ? (rData.branches as Branch[]).map((b) => b.id)
            : rec.branchId
              ? [rec.branchId]
              : [];
        setSelectedBranchIds(initialBranchIds);

        setScheduleForm((prev) => ({
          ...prev,
          branchId: initialBranchIds[0]
            ? String(initialBranchIds[0])
            : prev.branchId,
        }));

        setIsEditingProfile(false);
        // do not force activeTab here; let query-param effect decide

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
          `/api/users/${id}/reception-schedule?from=${from}&to=${to}`
        );
        const data = await res.json();

        if (res.ok && Array.isArray(data)) {
          setSchedule(data);
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

    load();
    loadSchedule();
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

      const res = await fetch(
        `/api/users/${id}/reception-schedule?from=${from}&to=${to}`
      );
      const data = await res.json();

      if (res.ok && Array.isArray(data)) {
        setSchedule(data);
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
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: form.name || null,
        ovog: form.ovog || null,
        email: form.email || null,
        branchId: form.branchId ? Number(form.branchId) : null,
        regNo: form.regNo || null,
        phone: form.phone || null,
        // NO license fields for reception
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

      setReception(data);
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

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          (data && (data as any).error) ||
            "Салбар хадгалах үед алдаа гарлаа"
        );
        setSavingBranches(false);
        return;
      }
    } catch (err) {
      console.error(err);
      setError("Сүлжээгээ шалгана уу");
    } finally {
      setSavingBranches(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!id) return;

    const ok = window.confirm(
      "Та энэхүү ресепшний аккаунтыг устгахдаа итгэлтэй байна уу?"
    );
    if (!ok) return;

    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert((data && (data as any).error) || "Устгах үед алдаа гарлаа");
        return;
      }

      router.push("/users/reception");
    } catch (err) {
      console.error(err);
      alert("Сүлжээгээ шалгана уу");
    }
  };

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

      const res = await fetch(`/api/users/${id}/reception-schedule`, {
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

  const startEditRow = (s: ReceptionScheduleDay) => {
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

      const res = await fetch(`/api/users/${id}/reception-schedule`, {
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
      const res = await fetch(
        `/api/users/${id}/reception-schedule/${scheduleId}`,
        {
          method: "DELETE",
        }
      );

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

  function formatScheduleDate(ymd: string): string {
    if (!ymd) return "";
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const weekdays = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];
    const weekday = weekdays[dt.getDay()];
    return `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")} ${weekday}`;
  }

  const loadHistory = async () => {
    if (!id) return;
    if (!historyFrom || !historyTo) {
      setHistoryError("Эхлэх болон дуусах огноог сонгоно уу.");
      return;
    }
    setHistoryLoading(true);
    setHistoryError(null);
    setHistoryItems([]);
    setHistoryPage(1);
    try {
      const res = await fetch(
        `/api/users/${id}/reception-schedule?from=${historyFrom}&to=${historyTo}`
      );
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setHistoryItems(data);
      } else {
        setHistoryError(
          (data && data.error) || "Хуваарийн түүхийг ачааллаж чадсангүй"
        );
      }
    } catch (err) {
      console.error(err);
      setHistoryError("Сүлжээгээ шалгана уу");
    } finally {
      setHistoryLoading(false);
    }
  };

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
      const res = await fetch(`/api/users/${id}/reception-schedule/bulk`, {
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

  const headerName = reception ? formatStaffShortName(reception) : "";

  const mainBranchName = useMemo(() => {
    if (!reception?.branchId) return null;
    return branches.find((b) => b.id === reception.branchId)?.name || null;
  }, [reception?.branchId, branches]);

  const receptionAssignedBranches: Branch[] =
    selectedBranchIds.length > 0
      ? branches.filter((b) => selectedBranchIds.includes(b.id))
      : branches;

  const isCreatingSchedule =
    !!scheduleForm.date &&
    !!scheduleForm.branchId &&
    editingScheduleId === null;

  if (loading) {
    return (
      <div className="p-6">
        <div>Ачааллаж байна...</div>
      </div>
    );
  }

  if (error && !reception) {
    return (
      <div className="p-6">
        <h1>Ресепшний мэдээлэл</h1>
        <div className="text-red-600 mt-2">{error}</div>
      </div>
    );
  }

  if (!reception) {
    return (
      <div className="p-6">
        <h1>Ресепшн олдсонгүй</h1>
      </div>
    );
  }

  return (
    <main className="p-6 font-sans">
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined" && window.history.length <= 1) {
            router.push("/users/reception");
          } else {
            router.back();
          }
        }}
        className="mb-4 px-2 py-1 rounded border border-gray-300 bg-gray-50 cursor-pointer text-[13px]"
      >
        ← Буцах
      </button>

      <section className="grid grid-cols-[260px_1fr] gap-4 items-stretch mb-6">
        {/* LEFT SIDEBAR */}
        <div className="border border-gray-200 rounded-xl p-4 bg-white">
          <div className="mb-1 text-lg font-semibold">
            {headerName}
          </div>

          <div className="text-[13px] text-gray-500 space-y-0.5 mb-1">
            <div>Утас: {reception.phone || "-"}</div>
            <div>И-мэйл: {reception.email || "-"}</div>
            <div>Үндсэн салбар: {mainBranchName || "-"}</div>
          </div>

          {/* Side menu (2 tabs) */}
          <div className="mt-4">
            <div className="text-xs uppercase text-gray-400 mb-1">
              Цэс
            </div>
            <div className="flex flex-col gap-1 text-[13px]">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("profile");
                  setIsEditingProfile(false);
                  setError(null);
                }}
                className={`text-left px-2.5 py-1.5 rounded-md border-0 cursor-pointer ${activeTab === "profile" ? "bg-blue-50" : "bg-transparent"} ${activeTab === "profile" ? "text-blue-700" : "text-gray-500"} ${activeTab === "profile" ? "font-medium" : "font-normal"}`}
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
                className={`text-left px-2.5 py-1.5 rounded-md border-0 cursor-pointer ${activeTab === "schedule" ? "bg-blue-50" : "bg-transparent"} ${activeTab === "schedule" ? "text-blue-700" : "text-gray-500"} ${activeTab === "schedule" ? "font-medium" : "font-normal"}`}
              >
                Ажлын хуваарь
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
          {/* PROFILE TAB */}
          {activeTab === "profile" && (
            <>
              {/* Basic information (view/edit) */}
              <div className="rounded-xl border border-gray-200 p-4 bg-white">
                <div className="flex items-center justify-between mb-3">
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
                  <div className="grid [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] gap-3 text-[13px]">
                    <div>
                      <div className="text-gray-500 mb-0.5">
                        Овог
                      </div>
                      <div>{reception.ovog || "-"}</div>
                    </div>

                    <div>
                      <div className="text-gray-500 mb-0.5">
                        Нэр
                      </div>
                      <div>{reception.name || "-"}</div>
                    </div>

                    <div>
                      <div className="text-gray-500 mb-0.5">
                        И-мэйл
                      </div>
                      <div>{reception.email || "-"}</div>
                    </div>

                    <div>
                      <div className="text-gray-500 mb-0.5">
                        Утас
                      </div>
                      <div>{reception.phone || "-"}</div>
                    </div>

                    <div>
                      <div className="text-gray-500 mb-0.5">
                        РД
                      </div>
                      <div>{reception.regNo || "-"}</div>
                    </div>

                    <div>
                      <div className="text-gray-500 mb-0.5">
                        Үндсэн салбар
                      </div>
                      <div>{mainBranchName || reception.branchId || "-"}</div>
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={handleSave}
                  >
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
                    </div>

                    <div className="mt-4 flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          resetFormFromReception();
                          setIsEditingProfile(false);
                        }}
                        disabled={saving}
                        className={`px-3 py-1.5 rounded-md border border-gray-300 bg-gray-50 text-[13px] ${saving ? "cursor-default" : "cursor-pointer"}`}
                      >
                        Болих
                      </button>

                      <button
                        type="submit"
                        disabled={saving}
                        className={`px-3 py-1.5 rounded-md border-0 ${saving ? "bg-gray-400" : "bg-blue-600"} text-white text-[13px] ${saving ? "cursor-default" : "cursor-pointer"}`}
                      >
                        {saving ? "Хадгалж байна..." : "Хадгалах"}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Branch assignment */}
              <div className="rounded-xl border border-gray-200 p-4 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base mt-0 mb-0">
                    Салбарын тохиргоо
                  </h2>

                  <button
                    type="button"
                    onClick={handleSaveBranches}
                    disabled={savingBranches}
                    className={`px-3 py-1.5 rounded-md border-0 ${savingBranches ? "bg-gray-400" : "bg-emerald-600"} text-white text-[13px] ${savingBranches ? "cursor-default" : "cursor-pointer"}`}
                  >
                    {savingBranches
                      ? "Салбар хадгалж байна..."
                      : "Салбар хадгалах"}
                  </button>
                </div>

                <div className="text-gray-500 text-[13px] mb-2.5">
                  Энэ ресепшн аль салбаруудад ажиллахыг доороос сонгоно уу.
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
              {/* Schedule create form */}
              <div className="rounded-xl border border-gray-200 p-4 bg-white">
                <h2 className="text-base mt-0 mb-2">
                  Ажлын хуваарь шинээр нэмэх
                </h2>
                <div className="text-gray-500 text-[13px] mb-2.5">
                  Сонгосон өдөр, салбар, ээлжийн дагуу шинэ ажлын хуваарь үүсгэнэ.
                </div>

                <form
                  onSubmit={handleSaveSchedule}
                  className="flex flex-col gap-[10px] max-w-[600px]"
                >
                  <label className="flex flex-col gap-1 text-[13px] text-gray-600">
                    Огноо
                    <input
                      type="date"
                      name="date"
                      value={scheduleForm.date}
                      onChange={handleScheduleFormChange}
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-[13px] bg-white"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-[13px] text-gray-600">
                    Салбар
                    <select
                      name="branchId"
                      value={scheduleForm.branchId}
                      onChange={handleScheduleFormChange}
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-[13px] bg-white"
                    >
                      <option value="">Сонгох</option>
                      {receptionAssignedBranches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-[13px] text-gray-600">
                    Ээлж
                    <select
                      name="shiftType"
                      value={scheduleForm.shiftType}
                      onChange={handleScheduleFormChange}
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-[13px] bg-white"
                    >
                      <option value="AM">Өглөө ээлж</option>
                      <option value="PM">Орой ээлж</option>
                      <option value="WEEKEND_FULL">Амралтын өдөр</option>
                    </select>
                  </label>

                  <div className="flex gap-3 flex-wrap">
                    <label className="flex flex-col gap-1 text-[13px] text-gray-600">
                      Эхлэх цаг
                      <input
                        type="time"
                        name="startTime"
                        value={scheduleForm.startTime}
                        onChange={handleScheduleFormChange}
                        className="rounded-md border border-gray-300 px-2 py-1.5 text-[13px] bg-white"
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-[13px] text-gray-600">
                      Дуусах цаг
                      <input
                        type="time"
                        name="endTime"
                        value={scheduleForm.endTime}
                        onChange={handleScheduleFormChange}
                        className="rounded-md border border-gray-300 px-2 py-1.5 text-[13px] bg-white"
                      />
                    </label>
                  </div>

                  <label className="flex flex-col gap-1 text-[13px] text-gray-600">
                    Тэмдэглэл
                    <textarea
                      name="note"
                      rows={2}
                      value={scheduleForm.note}
                      onChange={handleScheduleFormChange}
                      placeholder="Жишээ нь: 30 минут хоцорч эхэлнэ"
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-[13px] resize-none"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={scheduleSaving || !isCreatingSchedule}
                    className="mt-1 px-4 py-2 rounded-md border-0 bg-violet-600 text-white cursor-pointer self-start font-bold text-[13px]"
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
              </div>

              {/* Upcoming schedule table */}
              <div className="rounded-xl border border-gray-200 p-4 bg-white">
                <h2 className="text-base mt-0 mb-2">
                  Дараагийн 1 сарын ажлын хуваарь
                </h2>
                <div className="text-gray-500 text-[13px] mb-2.5">
                  Нийт төлөвлөгдсөн хуваарь
                </div>

                {scheduleLoading && <div>Ажлын хуваарь ачааллаж байна...</div>}

                {!scheduleLoading && scheduleError && (
                  <div className="text-red-500">{scheduleError}</div>
                )}

                {!scheduleLoading && !scheduleError && schedule.length === 0 && (
                  <div className="text-gray-400">
                    Төлөвлөсөн ажлын хуваарь алга.
                  </div>
                )}

                {!scheduleLoading && !scheduleError && schedule.length > 0 && (
                  <>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left border-b border-gray-200 px-3 py-2 font-semibold text-gray-600">
                          Огноо
                        </th>
                        <th className="text-left border-b border-gray-200 px-3 py-2 font-semibold text-gray-600">
                          Салбар
                        </th>
                        <th className="text-left border-b border-gray-200 px-3 py-2 font-semibold text-gray-600">
                          Цаг
                        </th>
                        <th className="text-left border-b border-gray-200 px-3 py-2 font-semibold text-gray-600">
                          Тэмдэглэл
                        </th>
                        <th className="text-left border-b border-gray-200 px-3 py-2 font-semibold text-gray-600">
                          Үйлдэл
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.slice((schedulePage - 1) * schedulePageSize, schedulePage * schedulePageSize).map((s, idx) => {
                        const isRowEditing = editingScheduleId === s.id;

                        return (
                          <tr key={s.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                            <td className="border-b border-gray-100 px-3 py-2">
                              {isRowEditing ? (
                                <input
                                  type="date"
                                  name="date"
                                  value={inlineForm.date}
                                  onChange={handleInlineChange}
                                  className="text-xs p-1 rounded border border-gray-300"
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

                            <td className="border-b border-gray-100 px-3 py-2">
                              {isRowEditing ? (
                                <select
                                  name="branchId"
                                  value={inlineForm.branchId}
                                  onChange={handleInlineChange}
                                  className="text-xs p-1 rounded border border-gray-300 bg-white"
                                >
                                  <option value="">Сонгох</option>
                                  {receptionAssignedBranches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                s.branch?.name || "-"
                              )}
                            </td>

                            <td className="border-b border-gray-100 px-3 py-2">
                              {isRowEditing ? (
                                <div className="flex gap-1">
                                  <input
                                    type="time"
                                    name="startTime"
                                    value={inlineForm.startTime}
                                    onChange={handleInlineChange}
                                    className="text-xs p-1 rounded border border-gray-300"
                                  />
                                  <span>-</span>
                                  <input
                                    type="time"
                                    name="endTime"
                                    value={inlineForm.endTime}
                                    onChange={handleInlineChange}
                                    className="text-xs p-1 rounded border border-gray-300"
                                  />
                                </div>
                              ) : (
                                <>
                                  {s.startTime} - {s.endTime}
                                </>
                              )}
                            </td>

                            <td className="border-b border-gray-100 px-3 py-2">
                              {isRowEditing ? (
                                <textarea
                                  name="note"
                                  rows={1}
                                  value={inlineForm.note}
                                  onChange={handleInlineChange}
                                  className="text-xs p-1 w-full rounded border border-gray-300 resize-none"
                                />
                              ) : (
                                s.note || "-"
                              )}
                            </td>

                            <td className="border-b border-gray-100 px-3 py-2">
                              {isRowEditing ? (
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={handleInlineSaveSchedule}
                                    disabled={scheduleSaving}
                                    className="px-2 py-1 rounded border border-green-400 bg-green-100 text-green-700 cursor-pointer text-xs"
                                  >
                                    {scheduleSaving ? "Хадгалж..." : "Хадгалах"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditRow}
                                    className="px-2 py-1 rounded border border-gray-300 bg-gray-50 cursor-pointer text-xs"
                                  >
                                    Цуцлах
                                  </button>
                                </div>
                              ) : (
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => startEditRow(s)}
                                    className="px-2 py-1 rounded border border-gray-300 bg-gray-50 cursor-pointer text-xs"
                                  >
                                    Засах
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSchedule(s.id)}
                                    className="px-2 py-1 rounded border border-red-200 bg-red-100 text-red-700 cursor-pointer text-xs"
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
                  </div>
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
              </div>

              {/* Mode 2: Bulk schedule */}
              <div className="rounded-xl border border-gray-200 p-4 bg-white">
                <h2 className="text-base mt-0 mb-2">Олон өдрийн хуваарь оруулах (Mode 2)</h2>
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
                      {receptionAssignedBranches.map((b) => (
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
              </div>

              {/* Schedule history */}
              <div className="rounded-xl border border-gray-200 p-4 bg-white">
                <h2 className="text-base mt-0 mb-2">Хуваарийн түүх</h2>
                <div className="text-gray-500 text-[13px] mb-2.5">
                  Өнгөрсөн (эсвэл ирээдүйн) тодорхой хугацааны ажлын хуваарийг харах.
                </div>

                <div className="flex flex-wrap gap-3 items-end mb-3">
                  <label className="flex flex-col gap-1 text-[13px]">
                    Эхлэх огноо
                    <input
                      type="date"
                      value={historyFrom}
                      onChange={(e) => setHistoryFrom(e.target.value)}
                      className="rounded-md border border-gray-300 px-1.5 py-1 text-[13px] bg-white"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-[13px]">
                    Дуусах огноо
                    <input
                      type="date"
                      value={historyTo}
                      onChange={(e) => setHistoryTo(e.target.value)}
                      className="rounded-md border border-gray-300 px-1.5 py-1 text-[13px] bg-white"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={loadHistory}
                    disabled={historyLoading}
                    className="px-4 py-2 rounded-lg border-0 bg-teal-700 text-white cursor-pointer h-[38px] font-bold text-[13px]"
                  >
                    {historyLoading ? "Ачааллаж байна..." : "Харах"}
                  </button>
                </div>

                {historyError && (
                  <div className="text-red-500 mb-2 text-[13px]">{historyError}</div>
                )}

                {!historyLoading && historyItems.length === 0 && !historyError && (
                  <div className="text-gray-400 text-[13px]">
                    Хуваарийн түүх хараахан ачаалаагүй эсвэл өгөгдөл олдсонгүй.
                  </div>
                )}

                {historyItems.length > 0 && (
                  <>
                  <table className="w-full border-collapse mt-2 text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left border-b border-gray-300 p-2">Огноо</th>
                        <th className="text-left border-b border-gray-300 p-2">Салбар</th>
                        <th className="text-left border-b border-gray-300 p-2">Цаг</th>
                        <th className="text-left border-b border-gray-300 p-2">Тэмдэглэл</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyItems.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize).map((s) => (
                        <tr key={s.id}>
                          <td className="border-b border-gray-100 p-2">{formatScheduleDate(s.date)}</td>
                          <td className="border-b border-gray-100 p-2">{s.branch?.name || "-"}</td>
                          <td className="border-b border-gray-100 p-2">{s.startTime} - {s.endTime}</td>
                          <td className="border-b border-gray-100 p-2">{s.note || "-"}</td>
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
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
