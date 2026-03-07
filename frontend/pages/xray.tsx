import React, { useEffect, useState } from "react";
import MediaGallery from "../components/encounter/MediaGallery";
import type { AppointmentRow } from "../types/appointments";
import type { EncounterMedia, Service, Nurse } from "../types/encounter-admin";

type XrayAppointment = AppointmentRow & {
  branchId?: number;
};

export default function XrayPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [searchText, setSearchText] = useState("");
  const [appointments, setAppointments] = useState<XrayAppointment[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<XrayAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<XrayAppointment | null>(null);

  // Encounter and media state
  const [encounterId, setEncounterId] = useState<number | null>(null);
  const [media, setMedia] = useState<EncounterMedia[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Performer state (for imaging appointments) - per-service attribution
  type ServiceLine = { serviceId: number; assignedTo: "DOCTOR" | "NURSE"; nurseId: number | null };
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [loadingNurses, setLoadingNurses] = useState(false);

  // Service state (for imaging appointments)
  const [services, setServices] = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);

  // Action state
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Load appointments with ongoing or imaging status
  useEffect(() => {
    const fetchAppointments = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("dateFrom", dateFrom);
        params.set("dateTo", dateTo);
        // Fetch all appointments and filter in the UI
        const res = await fetch(`/api/appointments?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch appointments");
        
        const data = await res.json();
        const filtered = Array.isArray(data) 
          ? data.filter((a: XrayAppointment) => 
              a.status === "ongoing" || a.status === "imaging"
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

  // Filter appointments by search text
  useEffect(() => {
    if (!searchText.trim()) {
      setFilteredAppointments(appointments);
      return;
    }
    const lowerSearch = searchText.toLowerCase();
    const filtered = appointments.filter((a) => {
      return (
        a.patientName?.toLowerCase().includes(lowerSearch) ||
        a.regNo?.toLowerCase().includes(lowerSearch) ||
        a.doctorName?.toLowerCase().includes(lowerSearch)
      );
    });
    setFilteredAppointments(filtered);
  }, [searchText, appointments]);

  // Load encounter when appointment is selected
  useEffect(() => {
    if (!selectedAppt) {
      setEncounterId(null);
      setMedia([]);
      setServiceLines([]);
      return;
    }

    const ensureEncounter = async () => {
      try {
        const res = await fetch(`/api/appointments/${selectedAppt.id}/ensure-encounter`, {
          method: "POST",
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to ensure encounter");
        }
        const data = await res.json();
        setEncounterId(data.encounterId);
      } catch (err: any) {
        setError(err.message || "Үзлэг үүсгэхэд алдаа гарлаа");
      }
    };

    ensureEncounter();
  }, [selectedAppt]);

  // Load media when encounter is set
  useEffect(() => {
    if (!encounterId) return;

    const fetchMedia = async () => {
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

    fetchMedia();
  }, [encounterId]);

  // Load nurses if imaging appointment
  useEffect(() => {
    if (!selectedAppt || selectedAppt.status !== "imaging") return;
    if (!selectedAppt.branchId) {
      console.warn("Branch ID not available for appointment", selectedAppt.id);
      return;
    }

    const fetchNurses = async () => {
      setLoadingNurses(true);
      try {
        const res = await fetch(`/api/users/nurses/today?branchId=${selectedAppt.branchId}`);
        if (!res.ok) throw new Error("Failed to fetch nurses");
        const data = await res.json();
        const nurseItems = data.items || [];
        setNurses(nurseItems.map((n: any) => ({
          id: n.nurseId,
          name: n.name,
          email: "",
        })));
      } catch (err: any) {
        console.error("Error fetching nurses:", err);
      } finally {
        setLoadingNurses(false);
      }
    };

    fetchNurses();
  }, [selectedAppt]);

  // Load services if imaging appointment
  useEffect(() => {
    if (!selectedAppt || selectedAppt.status !== "imaging") return;

    const fetchServices = async () => {
      setLoadingServices(true);
      try {
        const res = await fetch("/api/services");
        if (!res.ok) throw new Error("Failed to fetch services");
        const data = await res.json();
        const imagingServices = data.filter((s: Service) => s.category === "IMAGING");
        setServices(imagingServices);
      } catch (err: any) {
        console.error("Error fetching services:", err);
      } finally {
        setLoadingServices(false);
      }
    };

    fetchServices();
  }, [selectedAppt]);

  const handleMediaUpload = async (files: File[]) => {
    if (!encounterId || files.length === 0) return;

    setUploadingMedia(true);
    setError("");
    try {
      // Upload all files sequentially
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

      // Update local state immediately
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

  const updateServiceLine = (
    serviceId: number,
    patch: Partial<{ assignedTo: "DOCTOR" | "NURSE"; nurseId: number | null }>
  ) => {
    setServiceLines((prev) =>
      prev.map((l) => (l.serviceId === serviceId ? { ...l, ...patch } : l))
    );
  };

  const handleTransitionToReady = async () => {
    if (!selectedAppt || selectedAppt.status !== "imaging") return;

    // Validate service selection
    if (serviceLines.length === 0) {
      setError("Төлбөрт шилжүүлэхээс өмнө үйлчилгээ сонгоно уу");
      return;
    }

    // Validate per-service performer attribution
    for (const line of serviceLines) {
      if (line.assignedTo === "NURSE" && !line.nurseId) {
        setError("Бүх IMAGING үйлчилгээнд сувилагч сонгоно уу");
        return;
      }
    }

    setTransitioning(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch(
        `/api/appointments/${selectedAppt.id}/imaging/transition-to-ready`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serviceLines }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Төлбөрт шилжүүлэхэд алдаа гарлаа");
      }

      setSuccessMsg("Төлбөрт амжилттай шилжүүллээ");
      
      // Remove from list since status changed
      setTimeout(() => {
        setSelectedAppt(null);
        setAppointments((prev) => prev.filter((a) => a.id !== selectedAppt.id));
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Төлбөрт шилжүүлэхэд алдаа гарлаа");
    } finally {
      setTransitioning(false);
    }
  };

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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ padding: 16, borderBottom: "1px solid #e5e7eb" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
          XRAY ажлын өрөө
        </h1>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left panel: appointment list */}
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
            {error && (
              <div style={{ color: "red", fontSize: 13, marginTop: 8 }}>
                {error}
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {filteredAppointments.length === 0 ? (
              <div style={{ padding: 16, fontSize: 13, color: "#6b7280" }}>
                Цаг олдсонгүй
              </div>
            ) : (
              filteredAppointments.map((appt) => (
                <div
                  key={appt.id}
                  onClick={() => setSelectedAppt(appt)}
                  style={{
                    padding: 12,
                    borderBottom: "1px solid #e5e7eb",
                    cursor: "pointer",
                    background:
                      selectedAppt?.id === appt.id ? "#eff6ff" : "white",
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
                    <span style={{ fontSize: 14, fontWeight: 500 }}>
                      {appt.patientName}
                    </span>
                    {getStatusBadge(appt.status)}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    РД: {appt.regNo || "—"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Эмч: {appt.doctorName || "—"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Цаг:{" "}
                    {appt.startTime
                      ? new Date(appt.startTime).toLocaleTimeString("mn-MN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right panel: appointment details */}
        <div
          style={{
            flex: 1,
            padding: 16,
            overflowY: "auto",
            background: "white",
          }}
        >
          {!selectedAppt ? (
            <div style={{ fontSize: 14, color: "#6b7280", textAlign: "center", marginTop: 100 }}>
              Цаг сонгоно уу
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
                    {selectedAppt.patientName}
                  </h2>
                  {getStatusBadge(selectedAppt.status)}
                </div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  РД: {selectedAppt.regNo || "—"}
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

              {/* Media section - shown for all statuses */}
              <MediaGallery
                media={media}
                mediaLoading={mediaLoading}
                mediaError={mediaError}
                uploadingMedia={uploadingMedia}
                onUpload={handleMediaUpload}
                onDelete={handleMediaDelete}
                onRefresh={handleMediaRefresh}
              />

              {/* Imaging-specific section */}
              {selectedAppt.status === "imaging" && (
                <div style={{ marginTop: 24 }}>
                  <div
                    style={{
                      borderTop: "1px dashed #e5e7eb",
                      paddingTop: 16,
                      marginBottom: 16,
                    }}
                  >
                    <h3 style={{ fontSize: 14, marginBottom: 8 }}>
                      Үйлчилгээ сонгох / Гүйцэтгэгч оноох
                    </h3>
                    {loadingServices ? (
                      <div style={{ fontSize: 13 }}>Уншиж байна...</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {services.map((s) => {
                          const line = serviceLines.find((l) => l.serviceId === s.id);
                          const isSelected = !!line;
                          return (
                            <div
                              key={s.id}
                              style={{
                                border: "1px solid #e5e7eb",
                                borderRadius: 6,
                                padding: "8px 12px",
                                background: isSelected ? "#f0f9ff" : "white",
                              }}
                            >
                              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setServiceLines((prev) => [
                                        ...prev,
                                        { serviceId: s.id, assignedTo: "DOCTOR", nurseId: null },
                                      ]);
                                    } else {
                                      setServiceLines((prev) =>
                                        prev.filter((l) => l.serviceId !== s.id)
                                      );
                                    }
                                  }}
                                />
                                {s.code ? `${s.code}: ` : ""}{s.name} ({s.price.toLocaleString("mn-MN")}₮)
                              </label>

                              {isSelected && (
                                <div style={{ marginTop: 8, paddingLeft: 24, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                                  <span style={{ fontSize: 12, color: "#6b7280" }}>Гүйцэтгэгч:</span>
                                  <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12, cursor: "pointer" }}>
                                    <input
                                      type="radio"
                                      name={`xray-assignedTo-${s.id}`}
                                      checked={(line?.assignedTo ?? "DOCTOR") === "DOCTOR"}
                                      onChange={() => updateServiceLine(s.id, { assignedTo: "DOCTOR", nurseId: null })}
                                    />
                                    Эмч: {selectedAppt.doctorName || "—"}
                                  </label>
                                  <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12, cursor: "pointer" }}>
                                    <input
                                      type="radio"
                                      name={`xray-assignedTo-${s.id}`}
                                      checked={line?.assignedTo === "NURSE"}
                                      onChange={() => updateServiceLine(s.id, { assignedTo: "NURSE", nurseId: null })}
                                    />
                                    Сувилагч
                                  </label>

                                  {line?.assignedTo === "NURSE" && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                      {loadingNurses ? (
                                        <span style={{ fontSize: 12 }}>Уншиж байна...</span>
                                      ) : (
                                        <select
                                          value={line.nurseId ?? ""}
                                          onChange={(e) =>
                                            updateServiceLine(s.id, {
                                              nurseId: e.target.value ? Number(e.target.value) : null,
                                            })
                                          }
                                          style={{
                                            padding: "4px 8px",
                                            border: line.nurseId === null ? "1.5px solid #ef4444" : "1px solid #d1d5db",
                                            borderRadius: 4,
                                            fontSize: 12,
                                          }}
                                        >
                                          <option value="">— Сувилагч сонгох —</option>
                                          {nurses.map((n) => (
                                            <option key={n.id} value={n.id}>
                                              {n.name}
                                            </option>
                                          ))}
                                        </select>
                                      )}
                                      {line.nurseId === null && (
                                        <span style={{ fontSize: 11, color: "#ef4444" }}>Сувилагч сонгоно уу</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 12 }}>
                    <button
                      onClick={handleTransitionToReady}
                      disabled={transitioning || serviceLines.length === 0}
                      style={{
                        flex: 1,
                        padding: "10px 16px",
                        background: "#16a34a",
                        color: "white",
                        border: "none",
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: (transitioning || serviceLines.length === 0) ? "default" : "pointer",
                        opacity: (transitioning || serviceLines.length === 0) ? 0.6 : 1,
                      }}
                    >
                      {transitioning ? "Шилжүүлж байна..." : "Төлбөрт шилжүүлэх"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
