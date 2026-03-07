import React, { useEffect, useRef, useState } from "react";
import MediaGallery from "../components/encounter/MediaGallery";
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

  // ─── Load appointments ───────────────────────────────────────────────────
  useEffect(() => {
    const fetchAppointments = async () => {
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
    };

    fetchAppointments();
  }, [dateFrom, dateTo]);

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

  // ─── Status badge ─────────────────────────────────────────────────────────

  const getStatusBadge = (status: string) => {
    if (status === "ongoing") {
      return (
        <span
          style={{
            padding: "4px 8px",
            borderRadius: 4,
            fontSize: 12,
            background: "#fef3c7",
            color: "#92400e",
          }}
        >
          Явагдаж байна
        </span>
      );
    }
    if (status === "imaging") {
      return (
        <span
          style={{
            padding: "4px 8px",
            borderRadius: 4,
            fontSize: 12,
            background: "#dbeafe",
            color: "#1e40af",
          }}
        >
          Зураг
        </span>
      );
    }
    return null;
  };

  /** Format a scheduled time string for display. */
  const formatTime = (appt: XrayAppointment) => {
    const iso = appt.scheduledAt ?? appt.startTime ?? null;
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleTimeString("mn-MN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  /** Return the patient registration number from either API field. */
  const getRegNo = (appt: XrayAppointment) => appt.patientRegNo ?? appt.regNo ?? "—";

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ padding: 16, borderBottom: "1px solid #e5e7eb" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>XRAY ажлын өрөө</h1>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* ─ Left panel: appointment list ─ */}
        <div
          style={{
            width: 400,
            borderRight: "1px solid #e5e7eb",
            display: "flex",
            flexDirection: "column",
            background: "#f9fafb",
          }}
        >
          <div style={{ padding: 12 }}>
            <input
              type="text"
              placeholder="Өвчтөний нэр, РД хайх..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                fontSize: 14,
                marginBottom: 8,
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              />
            </div>
            {loading && <div style={{ fontSize: 13 }}>Уншиж байна...</div>}
            {error && !selectedAppt && (
              <div style={{ color: "red", fontSize: 13, marginTop: 8 }}>{error}</div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {filteredAppointments.length === 0 ? (
              <div style={{ padding: 16, fontSize: 13, color: "#6b7280" }}>Цаг олдсонгүй</div>
            ) : (
              filteredAppointments.map((appt) => (
                <div
                  key={appt.id}
                  onClick={() => setSelectedAppt(appt)}
                  style={{
                    padding: 12,
                    borderBottom: "1px solid #e5e7eb",
                    cursor: "pointer",
                    background: selectedAppt?.id === appt.id ? "#eff6ff" : "white",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{appt.patientName}</span>
                    {getStatusBadge(appt.status)}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>РД: {getRegNo(appt)}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Эмч: {appt.doctorName || "—"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Цаг: {formatTime(appt)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ─ Right panel: appointment details ─ */}
        <div
          style={{ flex: 1, padding: 16, overflowY: "auto", background: "white" }}
        >
          {!selectedAppt ? (
            <div
              style={{ fontSize: 14, color: "#6b7280", textAlign: "center", marginTop: 100 }}
            >
              Цаг сонгоно уу
            </div>
          ) : (
            <div>
              {/* Header */}
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
                    {selectedAppt.patientName}
                  </h2>
                  {getStatusBadge(selectedAppt.status)}
                </div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  РД: {getRegNo(selectedAppt)}
                </div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  Эмч: {selectedAppt.doctorName || "—"}
                </div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  Салбар: {selectedAppt.branchName || "—"}
                </div>
              </div>

              {successMsg && (
                <div
                  style={{
                    padding: 12,
                    background: "#d1fae5",
                    color: "#065f46",
                    borderRadius: 6,
                    marginBottom: 16,
                    fontSize: 13,
                  }}
                >
                  {successMsg}
                </div>
              )}

              {error && (
                <div
                  style={{
                    padding: 12,
                    background: "#fee2e2",
                    color: "#991b1b",
                    borderRadius: 6,
                    marginBottom: 16,
                    fontSize: 13,
                  }}
                >
                  {error}
                </div>
              )}

              {/* Media gallery — shown for ALL statuses */}
              <MediaGallery
                media={media}
                mediaLoading={mediaLoading}
                mediaError={mediaError}
                uploadingMedia={uploadingMedia}
                onUpload={handleMediaUpload}
                onDelete={handleMediaDelete}
                onRefresh={handleMediaRefresh}
              />

              {/* ─ Imaging-only section ─ */}
              {selectedAppt.status === "imaging" && (
                <div style={{ marginTop: 24 }}>
                  <div
                    style={{
                      borderTop: "1px dashed #e5e7eb",
                      paddingTop: 16,
                      marginBottom: 16,
                    }}
                  >
                    {/* Single performer selection for the whole encounter */}
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                      Гүйцэтгэгч
                    </h3>

                    {configLoading ? (
                      <div style={{ fontSize: 13, color: "#6b7280" }}>
                        Тохиргоо уншиж байна...
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                          <label
                            style={{
                              display: "inline-flex",
                              gap: 6,
                              alignItems: "center",
                              fontSize: 13,
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="radio"
                              name="xray-performerType"
                              checked={performerType === "DOCTOR"}
                              onChange={() => {
                                setPerformerType("DOCTOR");
                                setSelectedNurseId(null);
                              }}
                            />
                            Эмч: {selectedAppt.doctorName || "—"}
                          </label>

                          <label
                            style={{
                              display: "inline-flex",
                              gap: 6,
                              alignItems: "center",
                              fontSize: 13,
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="radio"
                              name="xray-performerType"
                              checked={performerType === "NURSE"}
                              onChange={() => setPerformerType("NURSE")}
                            />
                            Сувилагч
                          </label>
                        </div>

                        {performerType === "NURSE" && (
                          <div style={{ paddingLeft: 4 }}>
                            {loadingNurses ? (
                              <span style={{ fontSize: 13, color: "#6b7280" }}>
                                Уншиж байна...
                              </span>
                            ) : (
                              <>
                                <select
                                  value={selectedNurseId ?? ""}
                                  onChange={(e) =>
                                    setSelectedNurseId(
                                      e.target.value ? Number(e.target.value) : null
                                    )
                                  }
                                  style={{
                                    padding: "6px 8px",
                                    border:
                                      selectedNurseId === null
                                        ? "1.5px solid #ef4444"
                                        : "1px solid #d1d5db",
                                    borderRadius: 4,
                                    fontSize: 13,
                                    minWidth: 200,
                                  }}
                                >
                                  <option value="">— Сувилагч сонгох —</option>
                                  {nurses.map((n) => (
                                    <option key={n.id} value={n.id}>
                                      {n.name}
                                    </option>
                                  ))}
                                </select>
                                {selectedNurseId === null && (
                                  <div
                                    style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}
                                  >
                                    Сувилагч сонгоно уу
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Service checkbox list */}
                    <h3
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        marginTop: 20,
                        marginBottom: 12,
                      }}
                    >
                      Үйлчилгээ сонгох
                    </h3>

                    {loadingServices ? (
                      <div style={{ fontSize: 13, color: "#6b7280" }}>Уншиж байна...</div>
                    ) : services.length === 0 ? (
                      <div style={{ fontSize: 13, color: "#6b7280" }}>
                        IMAGING үйлчилгээ олдсонгүй
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {services.map((s) => {
                          const isChecked = selectedServiceIds.includes(s.id);
                          return (
                            <label
                              key={s.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "8px 12px",
                                border: "1px solid #e5e7eb",
                                borderRadius: 6,
                                background: isChecked ? "#f0f9ff" : "white",
                                cursor: "pointer",
                                fontSize: 13,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => toggleService(s.id, e.target.checked)}
                              />
                              <span>
                                {s.code ? `${s.code}: ` : ""}
                                {s.name}{" "}
                                <span style={{ color: "#6b7280" }}>
                                  ({s.price.toLocaleString("mn-MN")}₮)
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Transfer to billing button */}
                  <button
                    onClick={handleTransitionToReady}
                    disabled={
                      transitioning ||
                      selectedServiceIds.length === 0 ||
                      (performerType === "NURSE" && !selectedNurseId)
                    }
                    style={{
                      width: "100%",
                      padding: "10px 16px",
                      background: "#16a34a",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 500,
                      cursor:
                        transitioning ||
                        selectedServiceIds.length === 0 ||
                        (performerType === "NURSE" && !selectedNurseId)
                          ? "default"
                          : "pointer",
                      opacity:
                        transitioning ||
                        selectedServiceIds.length === 0 ||
                        (performerType === "NURSE" && !selectedNurseId)
                          ? 0.6
                          : 1,
                    }}
                  >
                    {transitioning ? "Шилжүүлж байна..." : "Төлбөрт шилжүүлэх"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
