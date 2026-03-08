import React, { useCallback, useEffect, useRef, useState } from "react";
import MediaGallery from "../components/encounter/MediaGallery";
import { StatusBadge } from "../components/xray/StatusBadge";
import { AppointmentListItem } from "../components/xray/AppointmentListItem";
import type { AppointmentRow } from "../types/appointments";
import type { EncounterMedia, Service, Nurse } from "../types/encounter-admin";

type XrayAppointment = AppointmentRow & {
  branchId?: number;
  /** Canonical field returned by the appointments list API */
  scheduledAt?: string | null;
  /** Canonical regNo field returned by the API */
  patientRegNo?: string | null;
};

/** Imaging config loaded from / saved to the backend */
type ImagingConfig = {
  encounterId: number | null;
  performerType: "DOCTOR" | "NURSE";
  nurseId: number | null;
  selectedServiceIds: number[];
};

/** How often (ms) to poll for new appointments when the nurse is idle. */
const APPOINTMENT_POLL_INTERVAL_MS = 60_000;

const inputCls =
  "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function XrayPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [searchText, setSearchText] = useState("");
  const [appointments, setAppointments] = useState<XrayAppointment[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<XrayAppointment[]>([]);
  const [loading, setLoading] = useState(false);

  // Currently selected appointment / encounter
  const [selectedAppt, setSelectedAppt] = useState<XrayAppointment | null>(null);
  const [encounterId, setEncounterId] = useState<number | null>(null);

  // Media
  const [media, setMedia] = useState<EncounterMedia[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Imaging config — single performer for the whole encounter
  const [performerType, setPerformerType] = useState<"DOCTOR" | "NURSE">("DOCTOR");
  const [selectedNurseId, setSelectedNurseId] = useState<number | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);

  // Supporting data
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [loadingNurses, setLoadingNurses] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);

  // Track whether the imaging config has been loaded for the current appointment.
  // We use this to avoid saving the initial server state back immediately.
  const configLoadedForApptRef = useRef<number | null>(null);

  // Action state
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Debounce timer for auto-saving imaging config
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Load appointments (initial + idle polling every 60s) ──────────────────
  // Polling is active only when no appointment is selected, so nurses working
  // on an appointment (uploading images, selecting services) are never
  // interrupted by a list refresh.
  // Re-fetches immediately when transitioning back to idle so any Reception
  // changes (e.g., ready_to_pay) appear without waiting for the next interval.
  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("dateFrom", dateFrom);
      params.set("dateTo", dateTo);
      const res = await fetch(`/api/appointments?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch appointments");
      const data = await res.json();
      const filtered: XrayAppointment[] = Array.isArray(data)
        ? data.filter(
            (a: XrayAppointment) => a.status === "ongoing" || a.status === "imaging"
          )
        : [];
      setAppointments(filtered);
    } catch (err: any) {
      setError(err.message || "Цаг татахад алдаа гарлаа");
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (selectedAppt !== null) return;

    fetchAppointments();
    const id = setInterval(fetchAppointments, APPOINTMENT_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [selectedAppt, fetchAppointments]);

  // ─── Filter by search text ───────────────────────────────────────────────
  useEffect(() => {
    if (!searchText.trim()) {
      setFilteredAppointments(appointments);
      return;
    }
    const lowerSearch = searchText.toLowerCase();
    setFilteredAppointments(
      appointments.filter((a) => {
        const regNo = a.patientRegNo ?? a.regNo ?? "";
        return (
          a.patientName?.toLowerCase().includes(lowerSearch) ||
          regNo.toLowerCase().includes(lowerSearch) ||
          a.doctorName?.toLowerCase().includes(lowerSearch)
        );
      })
    );
  }, [searchText, appointments]);

  // ─── On appointment selection: ensure encounter, load media, load config ─
  useEffect(() => {
    if (!selectedAppt) {
      setEncounterId(null);
      setMedia([]);
      setPerformerType("DOCTOR");
      setSelectedNurseId(null);
      setSelectedServiceIds([]);
      configLoadedForApptRef.current = null;
      return;
    }

    const init = async () => {
      setError("");
      setSuccessMsg("");
      setMedia([]);
      setPerformerType("DOCTOR");
      setSelectedNurseId(null);
      setSelectedServiceIds([]);
      configLoadedForApptRef.current = null;

      // 1. Ensure encounter exists
      try {
        const res = await fetch(
          `/api/appointments/${selectedAppt.id}/ensure-encounter`,
          { method: "POST" }
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to ensure encounter");
        }
        const data = await res.json();
        setEncounterId(data.encounterId);

        // 2. Load XRAY media scoped to this encounter
        fetchMedia(data.encounterId);

        // 3. For imaging appointments: load saved config + supporting data
        if (selectedAppt.status === "imaging") {
          loadImagingConfig(selectedAppt.id);
          fetchNurses(selectedAppt);
          fetchServices();
        }
      } catch (err: any) {
        setError(err.message || "Үзлэг үүсгэхэд алдаа гарлаа");
      }
    };

    init();
  // Re-run only when the selected appointment ID changes to avoid redundant
  // re-fetches when the parent component re-renders with the same appointment.
  // selectedAppt is captured via closure; the stable ID is the correct trigger.
  }, [selectedAppt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const fetchMedia = async (eid: number) => {
    setMediaLoading(true);
    setMediaError("");
    try {
      const res = await fetch(`/api/encounters/${eid}/media?type=XRAY`);
      if (!res.ok) throw new Error("Failed to fetch media");
      const data = await res.json();
      setMedia(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setMediaError(err.message || "Зураг татахад алдаа гарлаа");
    } finally {
      setMediaLoading(false);
    }
  };

  const loadImagingConfig = async (apptId: number) => {
    setConfigLoading(true);
    try {
      const res = await fetch(`/api/appointments/${apptId}/imaging/config`);
      if (!res.ok) return; // silently ignore — will use defaults
      const cfg: ImagingConfig = await res.json();
      setPerformerType(cfg.performerType ?? "DOCTOR");
      setSelectedNurseId(cfg.nurseId ?? null);
      setSelectedServiceIds(Array.isArray(cfg.selectedServiceIds) ? cfg.selectedServiceIds : []);
      // Mark config as loaded so auto-save doesn't fire for the initial population
      configLoadedForApptRef.current = apptId;
    } catch (err) {
      console.error("Failed to load imaging config:", err);
    } finally {
      setConfigLoading(false);
    }
  };

  const fetchNurses = async (appt: XrayAppointment) => {
    if (!appt.branchId) {
      console.warn("Branch ID not available for appointment", appt.id);
      return;
    }
    setLoadingNurses(true);
    try {
      const res = await fetch(`/api/users/nurses/today?branchId=${appt.branchId}`);
      if (!res.ok) throw new Error("Failed to fetch nurses");
      const data = await res.json();
      const nurseItems = data.items || [];
      setNurses(
        nurseItems.map((n: any) => ({
          id: n.nurseId,
          name: n.name,
          email: "",
        }))
      );
    } catch (err: any) {
      console.error("Error fetching nurses:", err);
    } finally {
      setLoadingNurses(false);
    }
  };

  const fetchServices = async () => {
    setLoadingServices(true);
    try {
      const res = await fetch("/api/services");
      if (!res.ok) throw new Error("Failed to fetch services");
      const data = await res.json();
      setServices(data.filter((s: Service) => s.category === "IMAGING"));
    } catch (err: any) {
      console.error("Error fetching services:", err);
    } finally {
      setLoadingServices(false);
    }
  };

  // ─── Auto-save imaging config ─────────────────────────────────────────────
  // Fires 600 ms after any change to performer / services, but only after the
  // initial config has been loaded from the backend (to avoid echoing the
  // server state straight back on appointment selection).
  useEffect(() => {
    if (
      !selectedAppt ||
      selectedAppt.status !== "imaging" ||
      !encounterId ||
      configLoadedForApptRef.current !== selectedAppt.id
    ) {
      return;
    }

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveImagingConfig().catch((err) =>
        console.error("Auto-save imaging config failed:", err)
      );
    }, 600);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  // selectedAppt and encounterId are checked in the guard above; including
  // them ensures the effect re-evaluates its guard whenever they change.
  }, [performerType, selectedNurseId, selectedServiceIds, selectedAppt, encounterId]);

  /** Persist current performer + service selection to the backend. */
  const saveImagingConfig = async (): Promise<void> => {
    if (!selectedAppt || selectedAppt.status !== "imaging") return;

    const body = {
      performerType,
      nurseId: performerType === "NURSE" ? selectedNurseId : null,
      selectedServiceIds,
    };

    const res = await fetch(`/api/appointments/${selectedAppt.id}/imaging/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Тохиргоо хадгалахад алдаа гарлаа");
    }
  };

  // ─── Media handlers (scoped to the currently selected encounterId) ────────

  const handleMediaUpload = async (files: File[]) => {
    if (!encounterId || files.length === 0) return;

    setUploadingMedia(true);
    setError("");
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", "XRAY");

        const res = await fetch(`/api/encounters/${encounterId}/media`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Зураг хуулахад алдаа гарлаа");
        }
      }

      // Reload media after all uploads
      const mediaRes = await fetch(`/api/encounters/${encounterId}/media?type=XRAY`);
      if (mediaRes.ok) {
        const data = await mediaRes.json();
        setMedia(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      setError(err.message || "Зураг хуулахад алдаа гарлаа");
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleMediaDelete = async (mediaId: number) => {
    if (!encounterId) return;

    setError("");
    try {
      const res = await fetch(`/api/encounters/${encounterId}/media/${mediaId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Зураг устгахад алдаа гарлаа");
      }

      setMedia((prev) => prev.filter((m) => m.id !== mediaId));
    } catch (err: any) {
      setError(err.message || "Зураг устгахад алдаа гарлаа");
    }
  };

  const handleMediaRefresh = async () => {
    if (!encounterId) return;
    setMediaLoading(true);
    setMediaError("");
    try {
      const res = await fetch(`/api/encounters/${encounterId}/media?type=XRAY`);
      if (!res.ok) throw new Error("Failed to fetch media");
      const data = await res.json();
      setMedia(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setMediaError(err.message || "Зураг татахад алдаа гарлаа");
    } finally {
      setMediaLoading(false);
    }
  };

  // ─── Transfer to billing ──────────────────────────────────────────────────

  const handleTransitionToReady = async () => {
    if (!selectedAppt || selectedAppt.status !== "imaging") return;

    if (selectedServiceIds.length === 0) {
      setError("Төлбөрт шилжүүлэхээс өмнө дор хаяж нэг үйлчилгээ сонгоно уу");
      return;
    }

    if (performerType === "NURSE" && !selectedNurseId) {
      setError("Сувилагч сонгоно уу");
      return;
    }

    setTransitioning(true);
    setError("");
    setSuccessMsg("");

    try {
      // 1. Persist the current selection to the backend
      await saveImagingConfig();

      // 2. Transition the appointment to ready_to_pay (backend reads saved config)
      const res = await fetch(
        `/api/appointments/${selectedAppt.id}/imaging/transition-to-ready`,
        { method: "POST" }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Төлбөрт шилжүүлэхэд алдаа гарлаа");
      }

      const data = await res.json().catch((parseErr) => {
        console.warn("[xray] transition-to-ready: failed to parse response JSON", parseErr);
        return {};
      });
      if (data.encounterId) {
        console.log(
          `[xray] transition-to-ready: appointmentId=${selectedAppt.id} encounterId=${data.encounterId}`
        );
      }

      setSuccessMsg("Төлбөрт амжилттай шилжүүллээ");

      // Remove the appointment from the list after a short delay
      setTimeout(() => {
        const apptId = selectedAppt.id;
        setSelectedAppt(null);
        setAppointments((prev) => prev.filter((a) => a.id !== apptId));
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Төлбөрт шилжүүлэхэд алдаа гарлаа");
    } finally {
      setTransitioning(false);
    }
  };

  // ─── Service checkbox toggle ───────────────────────────────────────────────

  const toggleService = (serviceId: number, checked: boolean) => {
    setSelectedServiceIds((prev) =>
      checked ? [...prev, serviceId] : prev.filter((id) => id !== serviceId)
    );
  };

  /** Format a scheduled date+time string for display: YYYY.MM.DD HH:MM */
  const formatDateTime = (appt: XrayAppointment) => {
    const iso = appt.scheduledAt ?? appt.startTime ?? null;
    if (!iso) return "—";

    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");

    return `${y}.${m}.${day} ${hh}:${mm}`;
  };

  /** Return the patient registration number from either API field. */
  const getRegNo = (appt: XrayAppointment) => appt.patientRegNo ?? appt.regNo ?? "—";

  // ─── Billing button disabled state ───────────────────────────────────────

  const billingDisabled =
    transitioning ||
    selectedServiceIds.length === 0 ||
    (performerType === "NURSE" && !selectedNurseId);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen">
      {/* Page header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-semibold text-gray-900">XRAY ажлын өрөө</h1>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ─ Left panel: appointment list ─ */}
        <aside className="w-80 border-r border-gray-200 flex flex-col bg-gray-50 shrink-0">
          {/* Search & date filters */}
          <div className="p-3 border-b border-gray-200 bg-gray-50">
            <input
              type="text"
              placeholder="Өвчтөний нэр, РД хайх..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className={`${inputCls} mb-2`}
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {loading && (
              <p className="mt-2 text-xs text-gray-500">Уншиж байна...</p>
            )}
            {error && !selectedAppt && (
              <p className="mt-2 text-xs text-red-600">{error}</p>
            )}
          </div>

          {/* Appointment list */}
          <div className="flex-1 overflow-y-auto">
            {filteredAppointments.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">Цаг олдсонгүй</p>
            ) : (
              filteredAppointments.map((appt) => (
                <AppointmentListItem
                  key={appt.id}
                  appt={appt}
                  selected={selectedAppt?.id === appt.id}
                  formatDateTime={formatDateTime}
                  getRegNo={getRegNo}
                  onClick={setSelectedAppt}
                />
              ))
            )}
          </div>
        </aside>

        {/* ─ Right panel: appointment details ─ */}
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4">
          {!selectedAppt ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-gray-400">Цаг сонгоно уу</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-4">
              {/* ── Patient / appointment header card ── */}
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center gap-3">
                  <h2 className="text-base font-semibold text-gray-900">
                    {selectedAppt.patientName}
                  </h2>
                  <StatusBadge status={selectedAppt.status} />
                </div>
                <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-y-1 gap-x-4 text-sm text-gray-600">
                  <div>
                    <span className="font-medium text-gray-700">РД: </span>
                    {getRegNo(selectedAppt)}
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Эмч: </span>
                    {selectedAppt.doctorName || "—"}
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Салбар: </span>
                    {selectedAppt.branchName || "—"}
                  </div>
                </div>
              </div>

              {/* ── Alerts ── */}
              {successMsg && (
                <div className="rounded-md bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
                  {successMsg}
                </div>
              )}
              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              {/* ── Media gallery card ── */}
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-800">Зурагнууд</h3>
                </div>
                <div className="p-4">
                  <MediaGallery
                    media={media}
                    mediaLoading={mediaLoading}
                    mediaError={mediaError}
                    uploadingMedia={uploadingMedia}
                    onUpload={handleMediaUpload}
                    onDelete={handleMediaDelete}
                    onRefresh={handleMediaRefresh}
                  />
                </div>
              </div>

              {/* ─ Imaging-only section ─ */}
              {selectedAppt.status === "imaging" && (
                <>
                  {/* ── Performer selection card ── */}
                  <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                      <h3 className="text-sm font-semibold text-gray-800">Гүйцэтгэгч</h3>
                    </div>
                    <div className="p-4">
                      {configLoading ? (
                        <p className="text-sm text-gray-500">Тохиргоо уншиж байна...</p>
                      ) : (
                        <div className="space-y-3">
                          {/* Radio: Doctor / Nurse */}
                          <div className="flex gap-6">
                            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="radio"
                                name="xray-performerType"
                                checked={performerType === "DOCTOR"}
                                onChange={() => {
                                  setPerformerType("DOCTOR");
                                  setSelectedNurseId(null);
                                }}
                              />
                              <span>Эмч: {selectedAppt.doctorName || "—"}</span>
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="radio"
                                name="xray-performerType"
                                checked={performerType === "NURSE"}
                                onChange={() => setPerformerType("NURSE")}
                              />
                              <span>Сувилагч</span>
                            </label>
                          </div>

                          {/* Nurse select */}
                          {performerType === "NURSE" && (
                            <div>
                              {loadingNurses ? (
                                <p className="text-sm text-gray-500">Уншиж байна...</p>
                              ) : (
                                <>
                                  <select
                                    value={selectedNurseId ?? ""}
                                    onChange={(e) =>
                                      setSelectedNurseId(
                                        e.target.value ? Number(e.target.value) : null
                                      )
                                    }
                                    className={`rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px] ${
                                      selectedNurseId === null
                                        ? "border-red-400"
                                        : "border-gray-300"
                                    }`}
                                  >
                                    <option value="">— Сувилагч сонгох —</option>
                                    {nurses.map((n) => (
                                      <option key={n.id} value={n.id}>
                                        {n.name}
                                      </option>
                                    ))}
                                  </select>
                                  {selectedNurseId === null && (
                                    <p className="mt-1 text-xs text-red-500">
                                      Сувилагч сонгоно уу
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Service selection card ── */}
                  <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                      <h3 className="text-sm font-semibold text-gray-800">Үйлчилгээ сонгох</h3>
                    </div>
                    <div className="p-4">
                      {loadingServices ? (
                        <p className="text-sm text-gray-500">Уншиж байна...</p>
                      ) : services.length === 0 ? (
                        <p className="text-sm text-gray-500">IMAGING үйлчилгээ олдсонгүй</p>
                      ) : (
                        <div className="space-y-2">
                          {services.map((s) => {
                            const isChecked = selectedServiceIds.includes(s.id);
                            return (
                              <label
                                key={s.id}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-md border cursor-pointer text-sm transition-colors ${
                                  isChecked
                                    ? "border-blue-300 bg-blue-50 text-gray-900"
                                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => toggleService(s.id, e.target.checked)}
                                  className="shrink-0"
                                />
                                <span>
                                  {s.code ? `${s.code}: ` : ""}
                                  {s.name}{" "}
                                  <span className="text-gray-500">
                                    ({s.price.toLocaleString("mn-MN")}₮)
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Transfer to billing ── */}
                  <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4">
                    {selectedServiceIds.length === 0 && (
                      <p className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                        Төлбөрт шилжүүлэхийн тулд дор хаяж нэг үйлчилгээ сонгоно уу.
                      </p>
                    )}
                    {performerType === "NURSE" && !selectedNurseId && (
                      <p className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                        Сувилагч сонгоно уу.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handleTransitionToReady}
                      disabled={billingDisabled}
                      className="w-full rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {transitioning ? "Шилжүүлж байна..." : "Төлбөрт шилжүүлэх"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
