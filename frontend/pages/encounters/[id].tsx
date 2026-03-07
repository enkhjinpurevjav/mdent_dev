 import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import type {
  Encounter,
  Diagnosis,
  DiagnosisProblem,
  Service,
  EditableDiagnosis,
  ActiveIndicator,
  EditablePrescriptionItem,
  ChartToothRow,
  EncounterMediaType,
  ConsentType,
  EncounterConsent,
  EncounterMedia,
  VisitCard,
  WarningLine,
  EncounterService,
  AssignedTo,
  Branch,
} from "../../types/encounter-admin";
import { formatDateTime, formatShortDate, ymdLocal, addDays, getTimeHHMM, isTimeWithinRangeStr } from "../../utils/date-formatters";
import { formatPatientName, formatDoctorDisplayName, formatStaffName } from "../../utils/name-formatters";
import { extractWarningLinesFromVisitCard } from "../../utils/visit-card-helpers";
import { displayOrDash } from "../../utils/display-helpers";
import { ADULT_TEETH, CHILD_TEETH, ALL_TEETH_LABEL, stringifyToothList } from "../../utils/tooth-helpers";
import { buildFollowUpAvailability } from "../../utils/scheduling";
import SignaturePad from "../../components/SignaturePad";
import PatientHeader from "../../components/encounter/PatientHeader";
import ToothChartSelector from "../../components/encounter/ToothChartSelector";
import DiagnosesEditor from "../../components/encounter/DiagnosesEditor";
import MediaGallery from "../../components/encounter/MediaGallery";
import PrescriptionEditor from "../../components/encounter/PrescriptionEditor";
import FollowUpScheduler from "../../components/encounter/FollowUpScheduler";
import ConsentFormsBlock from "../../components/encounter/ConsentFormsBlock";

type DiagnosisServiceRow = EditableDiagnosis;



const isDxRowEffectivelyEmpty = (r: DiagnosisServiceRow | undefined | null) => {
  if (!r) return true;

  const hasDiagnosis = !!r.diagnosisId;
  const hasProblems = Array.isArray(r.selectedProblemIds) && r.selectedProblemIds.length > 0;
  const hasNote = !!(r.note || "").trim();
  const hasService = !!r.serviceId;
  const hasIndicators = Array.isArray(r.indicatorIds) && r.indicatorIds.length > 0;

  return !hasDiagnosis && !hasProblems && !hasNote && !hasService && !hasIndicators;
};


export default function EncounterAdminPage() {
  const router = useRouter();
  const { id } = router.query;

  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<ActiveIndicator[]>([]);
  const [openIndicatorIndex, setOpenIndicatorIndex] = useState<number | null>(null);
  
  // Tool line metadata cache for rendering chips
  const [toolLineMetadata, setToolLineMetadata] = useState<Map<number, { toolName: string; cycleCode: string }>>(new Map());

  const [services, setServices] = useState<Service[]>([]);
  const [serviceFilterBranchId, setServiceFilterBranchId] = useState<
    number | null
  >(null);

  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [problemsByDiagnosis, setProblemsByDiagnosis] = useState<
    Record<number, DiagnosisProblem[]>
  >({});

  const [editableDxRows, setEditableDxRows] = useState<EditableDiagnosis[]>(
    []
  );
  const [editableServices, setEditableServices] = useState<
    EncounterService[]
  >([]);

  const [prescriptionItems, setPrescriptionItems] = useState<
    EditablePrescriptionItem[]
  >([]);
  const [prescriptionSaving, setPrescriptionSaving] = useState(false);
  const [prescriptionError, setPrescriptionError] = useState("");

  const [media, setMedia] = useState<EncounterMedia[]>([]);
  const [mediaTypeFilter, setMediaTypeFilter] =
    useState<EncounterMediaType | "ALL">("ALL");
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const [chartTeeth, setChartTeeth] = useState<ChartToothRow[]>([]);
  const [chartError, setChartError] = useState("");
  const [toothMode, setToothMode] = useState<"ADULT" | "CHILD">("ADULT");
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([]);
  const [activeDxRowIndex, setActiveDxRowIndex] = useState<number | null>(null);
  const [customToothRange, setCustomToothRange] = useState("");

  const loadActiveIndicators = async (branchId: number) => {
  try {
    // Try new cycle-based API first
    const resNew = await fetch(
      `/api/sterilization/cycles/active-indicators?branchId=${branchId}`
    );
    if (resNew.ok) {
      const jsonNew = await resNew.json().catch(() => []);
      if (Array.isArray(jsonNew)) {
        // Transform new format to match old ActiveIndicator type
        const transformed = jsonNew.map((item: any) => ({
          id: item.cycleId, // Use cycleId as the identifier
          packageName: item.toolName, // Tool name instead of package name
          code: item.cycleCode, // Cycle code
          current: item.remaining,
          produced: item.produced,
          used: item.used,
          indicatorDate: item.completedAt || new Date().toISOString(),
        }));
        setActiveIndicators(transformed);
        return;
      }
    }

    // Fallback to old API if new one fails
    const res = await fetch(
      `/api/sterilization/indicators/active?branchId=${branchId}`
    );
    const json = await res.json().catch(() => []);
    if (res.ok && Array.isArray(json)) {
      setActiveIndicators(json);
    } else {
      setActiveIndicators([]);
    }
  } catch {
    setActiveIndicators([]);
  }
};

  const [openDxIndex, setOpenDxIndex] = useState<number | null>(null);
  const [openServiceIndex, setOpenServiceIndex] = useState<number | null>(null);

  const toggleToothMode = (mode: "ADULT" | "CHILD") => {
    setToothMode(mode);
  };

  const isToothSelected = (code: string) => selectedTeeth.includes(code);

  const areAllModeTeethSelected = () => {
    const allCodes = toothMode === "ADULT" ? ADULT_TEETH : CHILD_TEETH;
    return allCodes.length > 0 && allCodes.every((c) => selectedTeeth.includes(c));
  };
 const [rows, setRows] = useState<DiagnosisServiceRow[]>([]);
  
  function createDiagnosisRow(initialTeeth: string[]): number {
    const idx = rows.length;
    const nextLocalId =
      rows.length === 0 ? 1 : Math.max(...rows.map((r) => r.localId)) + 1;

    const newRow: EditableDiagnosis = {
      localId: nextLocalId,
      diagnosisId: null,
      diagnosis: null,
      selectedProblemIds: [],
      note: "",
      toothCode: stringifyToothList(initialTeeth),
      serviceId: undefined,
      searchText: "",
      serviceSearchText: "",
      locked: false,
      indicatorIds: [],
      indicatorSearchText: "",
      indicatorsDirty: false,
      selectedToolLineIds: [], // NEW: Initialize empty array for local selections
      toolLineSearchText: "",
      draftProblemTexts: [""], // Start with one empty text field
      draftServiceTexts: undefined,
    };

    setEditableDxRows((prev) => [...prev, newRow]);
    setRows((prev) => [...prev, newRow]);

    return idx;
  }

 const updateActiveRowToothList = (
  nextTeeth: string[],
  opts?: { isAllTeeth?: boolean }
) => {
  const hasWritableActiveRow =
    activeDxRowIndex !== null &&
    rows[activeDxRowIndex] &&
    !rows[activeDxRowIndex].locked;

  if (!hasWritableActiveRow) {
    if (nextTeeth.length === 0 && !opts?.isAllTeeth) return;

    const idx = createDiagnosisRow(nextTeeth);
    setActiveDxRowIndex(idx);

    const toothStr = opts?.isAllTeeth
      ? ALL_TEETH_LABEL
      : stringifyToothList(nextTeeth);

    setEditableDxRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, toothCode: toothStr } : row))
    );
    setRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, toothCode: toothStr } : row))
    );
    return;
  }

  const idx = activeDxRowIndex as number;
  const toothStr = opts?.isAllTeeth
    ? ALL_TEETH_LABEL
    : stringifyToothList(nextTeeth);

  // update both
  setEditableDxRows((prev) =>
    prev.map((row, i) => (i === idx ? { ...row, toothCode: toothStr } : row))
  );

  setRows((prev) => {
    const next = prev.map((row, i) =>
      i === idx ? { ...row, toothCode: toothStr } : row
    );

    if (nextTeeth.length === 0 && !opts?.isAllTeeth) {
      if (isDxRowEffectivelyEmpty(next[idx])) {
        // remove from BOTH states
        setEditableDxRows((prevEd) => prevEd.filter((_, i) => i !== idx));
        setActiveDxRowIndex(null);
        return next.filter((_, i) => i !== idx);
      }
    }

    return next;
  });
};

  const [consents, setConsents] = useState<EncounterConsent[]>([]);
  const [consentTypeDraft, setConsentTypeDraft] =
    useState<ConsentType | null>(null);
  const [consentAnswersDraft, setConsentAnswersDraft] = useState<any>({});
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentLoading, setConsentLoading] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [uploadingPatientSignature, setUploadingPatientSignature] = useState(false);
  const [uploadingDoctorSignature, setUploadingDoctorSignature] = useState(false);
  const [attachingDoctorSignature, setAttachingDoctorSignature] = useState(false);

  // Follow-up appointment scheduling state
  const [showFollowUpScheduler, setShowFollowUpScheduler] = useState(false);
  const [followUpDateFrom, setFollowUpDateFrom] = useState("");
  const [followUpDateTo, setFollowUpDateTo] = useState("");
  const [followUpSlotMinutes, setFollowUpSlotMinutes] = useState(30);
  const [followUpAvailability, setFollowUpAvailability] = useState<{
    days: Array<{
      date: string;
      dayLabel: string;
      slots: Array<{
        start: string;
        end: string;
        status: "available" | "booked" | "off";
        appointmentIds?: number[];
      }>;
    }>;
    timeLabels: string[];
  } | null>(null);

  // NEW: store appointments and no-schedule flag
  const [followUpAppointments, setFollowUpAppointments] = useState<any[]>([]);
  const [followUpNoSchedule, setFollowUpNoSchedule] = useState(false);
 
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState("");
  const [followUpBooking, setFollowUpBooking] = useState(false);
  const [followUpSuccess, setFollowUpSuccess] = useState("");

  const [nursesForEncounter, setNursesForEncounter] = useState<
    {
      nurseId: number;
      name?: string | null;
      ovog?: string | null;
      email: string;
      phone?: string | null;
      schedules: {
        id: number;
        date: string;
        branch: Branch;
        startTime: string;
        endTime: string;
        note?: string | null;
      }[];
    }[]
  >([]);
  const [changingNurse, setChangingNurse] = useState(false);

  const [visitCard, setVisitCard] = useState<VisitCard | null>(null);
  const [visitCardLoading, setVisitCardLoading] = useState(false);

  const [saveError, setSaveError] = useState("");

 
  const [servicesLoadError, setServicesLoadError] = useState("");
  const [dxError, setDxError] = useState("");
  
  const encounterId = useMemo(
    () => (typeof id === "string" ? Number(id) : NaN),
    [id]
  );

  // Helper functions for tooth selection
  function normalizeUnique(list: string[]) {
    return Array.from(new Set(list.filter(Boolean)));
  }

  function parseCustomToothRange(input: string): string[] {
    // Supports: "21-24, 25-26, 11,21,22"
    // Very simple parser; expects FDI numeric codes.
    const raw = (input || "")
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);

    const out: string[] = [];

    for (const token of raw) {
      if (token.includes("-")) {
        const [a, b] = token.split("-").map((x) => x.trim());
        const start = Number(a);
        const end = Number(b);
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

        // only expand if same quadrant (e.g. 21-24)
        const startQ = Math.floor(start / 10);
        const endQ = Math.floor(end / 10);
        if (startQ !== endQ) continue;

        const from = Math.min(start, end);
        const to = Math.max(start, end);

        for (let n = from; n <= to; n++) {
          out.push(String(n));
        }
      } else {
        // single tooth
        if (/^\d{2}$/.test(token)) out.push(token);
      }
    }

    return normalizeUnique(out);
  }

  function resetToothSelectionSession() {
    setSelectedTeeth([]);
    setActiveDxRowIndex(null);
    setCustomToothRange("");
  }

  function toggleToothSelection(code: string) {
    // 1) Handle "ALL"
    if (code === "ALL") {
      const allCodes = toothMode === "ADULT" ? ADULT_TEETH : CHILD_TEETH;

      const allSelected =
        allCodes.length > 0 && allCodes.every((c) => selectedTeeth.includes(c));

      const nextTeeth = allSelected ? [] : [...allCodes];

      setSelectedTeeth(nextTeeth);

      // Update diagnosis row toothCode
      updateActiveRowToothList(nextTeeth, { isAllTeeth: !allSelected });

      return;
    }

    // 2) Normal tooth toggle
    const isSelected = selectedTeeth.includes(code);

    const nextTeeth = isSelected
      ? selectedTeeth.filter((t) => t !== code)
      : [...selectedTeeth, code];

    const normalized = normalizeUnique(nextTeeth);

    setSelectedTeeth(normalized);

    // If "ALL" label was previously used, we now treat it as normal list
    updateActiveRowToothList(normalized, { isAllTeeth: false });
  }

  // OPTIONAL: if you want custom range to auto-apply when user types,
  // call this from an effect or from the input onBlur/onEnter.
  function applyCustomToothRange() {
    const parsed = parseCustomToothRange(customToothRange);

    setSelectedTeeth(parsed);
    updateActiveRowToothList(parsed, { isAllTeeth: false });
  }

  // Helper to update a single field in both rows and editableDxRows
  const updateDxRowField = useCallback(
    <K extends keyof EditableDiagnosis>(
      index: number,
      field: K,
      value: EditableDiagnosis[K]
    ) => {
      // If updating indicatorIds, also mark as dirty
      const updates: Partial<EditableDiagnosis> = { [field]: value };
      if (field === "indicatorIds") {
        updates.indicatorsDirty = true;
      }
      
      setRows((prev) =>
        prev.map((row, i) => (i === index ? { ...row, ...updates } : row))
      );
      setEditableDxRows((prev) =>
        prev.map((row, i) => (i === index ? { ...row, ...updates } : row))
      );
    },
    []
  );

  useEffect(() => {
    if (!id || typeof id !== "string") return;
    const eid = Number(id);
    if (!eid || Number.isNaN(eid)) {
      setError("ID буруу байна.");
      setLoading(false);
      return;
    }

    const loadServices = async () => {
      try {
        const res = await fetch("/api/services");
        const json = await res.json().catch(() => null);
        if (res.ok && Array.isArray(json)) {
          setServices(json);
          setServicesLoadError("");
        } else {
          setServicesLoadError("Үйлчилгээ ачааллахад алдаа гарлаа.");
        }
      } catch {
        setServicesLoadError("Үйлчилгээ ачааллахэд алдаа гарлаа.");
      }
    };

    const loadNursesForEncounter = async () => {
      try {
        const res = await fetch(`/api/encounters/${id}/nurses`);
        const json = await res.json().catch(() => null);
        if (res.ok && json && Array.isArray(json.items)) {
          setNursesForEncounter(json.items);
        } else {
          setNursesForEncounter([]);
        }
      } catch {
        setNursesForEncounter([]);
      }
    };

    // NOTE: This is the FULL `loadEncounter` function for frontend/pages/encounters/[id].tsx
// based on the code you pasted, with the "merged" behavior:
// - serviceId + serviceSearchText are restored from encounterServices using meta.diagnosisId
// - serviceSearchText uses svc.name (as you requested)
// - BOTH rows and editableDxRows are set to the same merged array (prevents drift + "sometimes disappears")

const loadEncounter = async () => {
  setLoading(true);
  setError("");

  try {
    const res = await fetch(`/api/encounters/${id}`);
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((json && json.error) || "failed to load");
    }

    const enc: Encounter = json;
    setEncounter(enc);

    // 1) Build base diagnosis rows from encounterDiagnoses
    const dxRows: EditableDiagnosis[] =
      enc.encounterDiagnoses?.map((row, idx) => ({
        ...row,
        diagnosisId: row.diagnosisId ?? null,
        diagnosis: (row as any).diagnosis ?? null,
        localId: idx + 1,
        selectedProblemIds: Array.isArray(row.selectedProblemIds)
          ? row.selectedProblemIds
          : [],
        note: row.note || "",
        toothCode: row.toothCode || "",

        // service fields filled in merge step
        serviceId: undefined,
        serviceSearchText: "",

        searchText: (row as any).diagnosis
          ? `${(row as any).diagnosis.code} – ${(row as any).diagnosis.name}`
          : "",

        locked: true,

        // NEW: tool-line based draft attachments (replaces indicatorIds)
        draftAttachments: Array.isArray((row as any).draftAttachments)
          ? (row as any).draftAttachments
          : [],
        toolLineSearchText: "",
        selectedToolLineIds: [], // Local selections - empty on load, will be populated on add
        
        // DEPRECATED: old indicator-based approach (kept for backward compatibility)
        indicatorIds: Array.isArray((row as any).sterilizationIndicators)
          ? (row as any).sterilizationIndicators
              .map((x: any) => x.indicatorId)
              .filter(Boolean)
          : [],
        indicatorSearchText: "",
        indicatorsDirty: false, // Not dirty when loaded from backend

        // Initialize draft text arrays from saved texts
        draftProblemTexts: row.problemTexts?.map((pt) => pt.text) || undefined,
        draftServiceTexts: undefined, // Will be set during merge with services
      })) || [];

    // 2) Load active indicators for patient's branch (needed for display)
    const patientBranchId = enc?.patientBook?.patient?.branchId;
    if (patientBranchId) {
      await loadActiveIndicators(patientBranchId);
    }

    // 3) Build saved encounter services list (for linking to diagnoses)
    const svcRows: EncounterService[] =
      enc.encounterServices?.map((row) => ({
        ...row,
        quantity: row.quantity || 1,
      })) || [];
    setEditableServices(svcRows);

    // 4) Merge services back into diagnosis rows via meta.diagnosisId
    const mergedRows: DiagnosisServiceRow[] = dxRows.map((dxRow) => {
      const linkedService = svcRows.find(
        (svc) => (svc.meta as any)?.diagnosisId === dxRow.id
      );

      const assignedTo: AssignedTo =
        ((linkedService?.meta as any)?.assignedTo as AssignedTo) || "DOCTOR";

      // Build service search text with same format as after save (code – name)
      let serviceSearchText = "";
      if (linkedService?.service) {
        const svc = linkedService.service;
        serviceSearchText = svc.code ? `${svc.code} – ${svc.name}` : svc.name;
      }

      // Initialize draft service texts from saved texts
      const draftServiceTexts = linkedService?.texts?.map((t) => t.text) || undefined;

      return {
        ...dxRow,
        serviceId: linkedService?.serviceId,
        serviceSearchText,
        assignedTo,
        draftServiceTexts,
      };
    });

    // ✅ IMPORTANT: keep both arrays in sync to avoid "sometimes disappears"
    setRows(mergedRows);
    setEditableDxRows(mergedRows);

    // Preload problems for all diagnosis IDs in the encounter
    // ensureProblemsLoaded already handles errors internally
    const uniqueDiagnosisIds = Array.from(
      new Set(
        mergedRows
          .map((row) => row.diagnosisId)
          .filter((id): id is number => id != null)
      )
    );
    if (uniqueDiagnosisIds.length > 0) {
      try {
        await Promise.all(
          uniqueDiagnosisIds.map((diagnosisId) => ensureProblemsLoaded(diagnosisId))
        );
      } catch (err) {
        // Log but don't fail the entire load if problem fetching fails
        console.error("Failed to preload some diagnosis problems", err);
      }
    }

    // 5) Prescription items
    const rxItems: EditablePrescriptionItem[] =
      enc.prescription?.items?.map((it) => ({
        localId: it.order,
        drugName: it.drugName,
        durationDays: it.durationDays,
        quantityPerTake: it.quantityPerTake,
        frequencyPerDay: it.frequencyPerDay,
        note: it.note || "",
      })) || [];

    if (rxItems.length === 0) {
      rxItems.push({
        localId: 1,
        drugName: "",
        durationDays: null,
        quantityPerTake: null,
        frequencyPerDay: null,
        note: "",
      });
    }

    setPrescriptionItems(rxItems);
  } catch (err) {
    console.error(err);
    setError("Үзлэгийн дэлгэ��энгүйг ачааллах үед алдаа гарлаа");
    setEncounter(null);
  } finally {
    setLoading(false);
  }
};

    const loadDx = async () => {
      try {
        const res = await fetch("/api/diagnoses");
        const json = await res.json().catch(() => null);
        if (res.ok && Array.isArray(json)) {
          setDiagnoses(json);
          setDxError("");
        } else {
          setDxError("Онош ачааллахад алдаа гарлаа.");
        }
      } catch {
        setDxError("Онош ачааллахад алдаа гарлаа.");
      }
    };

    const loadConsents = async () => {
      try {
        setConsentLoading(true);
        const res = await fetch(`/api/encounters/${id}/consents`);
        const json = await res.json().catch(() => null);
        if (!res.ok) return;

        if (Array.isArray(json)) {
          setConsents(json);
          // If there's at least one consent, set the first one as active for editing
          if (json.length > 0) {
            setConsentTypeDraft(json[0].type || null);
            setConsentAnswersDraft(json[0].answers || {});
          } else {
            setConsentTypeDraft(null);
            setConsentAnswersDraft({});
          }
        } else {
          setConsents([]);
          setConsentTypeDraft(null);
          setConsentAnswersDraft({});
        }
      } catch (err) {
        console.error("loadConsents failed", err);
      } finally {
        setConsentLoading(false);
      }
    };

    const loadChartTeeth = async () => {
      try {
        const res = await fetch(`/api/encounters/${id}/chart-teeth`);
        const json = await res.json().catch(() => null);
        if (res.ok && Array.isArray(json)) {
          setChartTeeth(json);
          setChartError("");
        } else {
          setChartTeeth([]);
          setChartError("Шүдний диаграм ачааллахад алдаа гарлаа.");
        }
      } catch (err) {
        console.error("loadChartTeeth failed", err);
        setChartTeeth([]);
        setChartError("Шүдний диаграм ачааллахад алдаа гарлаа.");
      }
    };

    const loadVisitCardForEncounter = async () => {
      try {
        setVisitCardLoading(true);
        setVisitCard(null);

        const encRes = await fetch(`/api/encounters/${id}`);
        const encJson = await encRes.json().catch(() => null);
        if (!encRes.ok || !encJson?.patientBook?.bookNumber) {
          setVisitCardLoading(false);
          return;
        }
        const bookNumber: string = encJson.patientBook.bookNumber;

        const vcRes = await fetch(
          `/api/patients/visit-card/by-book/${encodeURIComponent(
            bookNumber
          )}`
        );
        const vcJson = await vcRes.json().catch(() => null);
        if (vcRes.ok && vcJson?.visitCard) {
          setVisitCard(vcJson.visitCard as VisitCard);
        } else {
          setVisitCard(null);
        }
      } catch (err) {
        console.error("loadVisitCardForEncounter failed", err);
        setVisitCard(null);
      } finally {
        setVisitCardLoading(false);
      }
    };

    void loadServices();
    void loadDx();
    void loadEncounter();
    void loadConsents();
    void loadNursesForEncounter();
    void loadChartTeeth();
    void loadVisitCardForEncounter();
  }, [id]);

  // Update serviceSearchText when services are loaded
useEffect(() => {
  if (services.length === 0) return;

  setRows((prevRows) =>
    prevRows.map((row) => {
      if (!row.serviceId) return row;
      if ((row.serviceSearchText || "").trim()) return row; // ✅ don't overwrite
      const svc = services.find((s) => s.id === row.serviceId);
      return { ...row, serviceSearchText: svc ? svc.name : "" };
    })
  );
}, [services]);

  const reloadEncounter = async () => {
    if (!id || typeof id !== "string") return;
    try {
      const res = await fetch(`/api/encounters/${id}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((json && json.error) || "failed to reload");
      }
      const enc: Encounter = json;
      setEncounter(enc);
    } catch (err) {
      console.error("reloadEncounter failed", err);
    }
  };



  
  const reloadMedia = async () => {
    if (!id || typeof id !== "string") return;
    try {
      setMediaLoading(true);
      setMediaError("");
      const query =
        mediaTypeFilter === "ALL"
          ? ""
          : `?type=${encodeURIComponent(mediaTypeFilter)}`;
      const res = await fetch(`/api/encounters/${id}/media${query}`);
      const json = await res.json().catch(() => null);
      if (res.ok && Array.isArray(json)) {
        setMedia(json);
      } else {
        setMedia([]);
        setMediaError("Зураг ачааллахад алдаа гарлаа.");
      }
    } catch (err) {
      console.error("reloadMedia failed", err);
      setMedia([]);
      setMediaError("Зураг ачааллахад алдаа гарлаа.");
    } finally {
      setMediaLoading(false);
    }
  };

  useEffect(() => {
    void reloadMedia();
  }, [id, mediaTypeFilter]);

  // Initialize follow-up date range when checkbox is toggled on (14 days)
  useEffect(() => {
    if (showFollowUpScheduler && !followUpDateFrom) {
      const today = new Date();
      const todayStr = ymdLocal(today);
      const plusFourteen = new Date(today);
      plusFourteen.setDate(plusFourteen.getDate() + 14);
      const plusFourteenStr = ymdLocal(plusFourteen);

      setFollowUpDateFrom(todayStr);
      setFollowUpDateTo(plusFourteenStr);
    }
  }, [showFollowUpScheduler]);

  // Load availability when dates/filters change
  useEffect(() => {
    if (showFollowUpScheduler && followUpDateFrom && followUpDateTo && encounter) {
      void loadFollowUpAvailability();
    }
  }, [showFollowUpScheduler, followUpDateFrom, followUpDateTo, followUpSlotMinutes, encounter]);

  const ensureProblemsLoaded = async (diagnosisId: number) => {
    if (problemsByDiagnosis[diagnosisId]) return;
    try {
      const res = await fetch(`/api/diagnoses/${diagnosisId}/problems`);
      const json = await res.json().catch(() => null);
      if (res.ok && Array.isArray(json)) {
        setProblemsByDiagnosis((prev) => ({
          ...prev,
          [diagnosisId]: json,
        }));
      }
    } catch (err) {
      console.error("ensureProblemsLoaded failed", err);
    }
  };

function removeDiagnosisRow(index: number) {
  const row = rows[index];
  if (row?.locked) {
    alert("Түгжигдсэн мөрийг устгах боломжгүй. Эхлээд түгжээг тайлна уу.");
    return;
  }

  setEditableDxRows((prev) => prev.filter((_, i) => i !== index));
  setRows((prev) => prev.filter((_, i) => i !== index));

  setOpenDxIndex((prev) => {
    if (prev === null) return null;
    if (prev === index) return null;
    if (prev > index) return prev - 1;
    return prev;
  });

  setOpenServiceIndex((prev) => {
    if (prev === null) return null;
    if (prev === index) return null;
    if (prev > index) return prev - 1;
    return prev;
  });

  setActiveDxRowIndex((prev) => {
    if (prev === null) return null;
    if (prev === index) return null;
    if (prev > index) return prev - 1;
    return prev;
  });
}

  const unlockRow = (index: number) => {
    if (confirm("Энэ мөрийн түгжээг тайлж, засварлахыг зөвшөөрч байна уу?")) {
      setEditableDxRows((prev) =>
        prev.map((row, i) =>
          i === index ? { ...row, locked: false } : row
        )
      );
      setRows((prev) =>
        prev.map((row, i) =>
          i === index ? { ...row, locked: false } : row
        )
      );
    }
  };

  const lockRow = (index: number) => {
    setEditableDxRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, locked: true } : row
      )
    );
    setRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, locked: true } : row
      )
    );
  };

  const saveConsentApi = async (type: ConsentType | null) => {
    if (!id || typeof id !== "string") return;
    if (!type) {
      // Delete all consents
      setConsentSaving(true);
      setConsentError("");
      try {
        const res = await fetch(`/api/encounters/${id}/consent`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: null }),
        });
        if (!res.ok) {
          throw new Error("Failed to delete consents");
        }
        setConsents([]);
        setConsentTypeDraft(null);
        setConsentAnswersDraft({});
      } catch (err: any) {
        console.error("delete consents failed", err);
        setConsentError(err?.message || "Зөвшөөрөл устгахад алдаа гарлаа");
      } finally {
        setConsentSaving(false);
      }
      return;
    }

    setConsentSaving(true);
    setConsentError("");
    try {
      const res = await fetch(`/api/encounters/${id}/consents/${type}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: consentAnswersDraft || {},
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (json && json.error) || "Зөвшөөрлийн хуудас хадгалахад алдаа гарлаа"
        );
      }

      // Reload all consents
      const consentsRes = await fetch(`/api/encounters/${id}/consents`);
      const consentsJson = await consentsRes.json().catch(() => null);
      if (consentsRes.ok && Array.isArray(consentsJson)) {
        setConsents(consentsJson);
      }
    } catch (err: any) {
      console.error("saveConsent failed", err);
      setConsentError(
        err?.message || "Зөвшөөрлийн хуудас хадгалахад алдаа гарлаа"
      );
    } finally {
      setConsentSaving(false);
    }
  };

  const updateConsentAnswers = (partial: any) => {
    setConsentAnswersDraft((prev: any) => ({
      ...(prev || {}),
      ...(partial || {}),
    }));
  };

  const saveCurrentConsent = async () => {
    await saveConsentApi(consentTypeDraft);
  };

  const handlePatientSignatureUpload = async (blob: Blob) => {
    if (!id || typeof id !== "string") return;
    setUploadingPatientSignature(true);
    setConsentError("");
    try {
      const formData = new FormData();
      formData.append("file", blob, "patient-signature.png");

      const res = await fetch(`/api/encounters/${id}/patient-signature`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (json && json.error) || "Гарын үсэг хадгалахад алдаа гарлаа"
        );
      }

      // Reload encounter to get updated signature fields
      await reloadEncounter();
    } catch (err: any) {
      console.error("handlePatientSignatureUpload failed", err);
      setConsentError(err?.message || "Гарын үсэг хадгалахад алдаа гарлаа");
    } finally {
      setUploadingPatientSignature(false);
    }
  };

  const handleDoctorSignatureUpload = async (blob: Blob) => {
    if (!id || typeof id !== "string") return;
    setUploadingDoctorSignature(true);
    setConsentError("");
    try {
      const formData = new FormData();
      formData.append("file", blob, "doctor-signature.png");

      const res = await fetch(`/api/encounters/${id}/doctor-signature`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (json && json.error) || "Эмчийн гарын үсэг хадгалахад алдаа гарлаа"
        );
      }

      // Reload encounter to get updated signature fields
      await reloadEncounter();
    } catch (err: any) {
      console.error("handleDoctorSignatureUpload failed", err);
      setConsentError(err?.message || "Эмчийн гарын үсэг хадгалахад алдаа гарлаа");
    } finally {
      setUploadingDoctorSignature(false);
    }
  };

  const handleAttachDoctorSignature = async () => {
    if (!id || typeof id !== "string") return;
    setAttachingDoctorSignature(true);
    setConsentError("");
    try {
      const res = await fetch(`/api/encounters/${id}/doctor-signature`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (json && json.error) || "Эмчийн гарын үсэг холбохд алдаа гарлаа"
        );
      }

      // Reload encounter to get updated signature fields
      await reloadEncounter();
    } catch (err: any) {
      console.error("handleAttachDoctorSignature failed", err);
      setConsentError(err?.message || "Эмчийн гарын үсэг холбохд алдаа гарлаа");
    } finally {
      setAttachingDoctorSignature(false);
    }
  };

  // Follow-up appointment scheduling functions
  const loadFollowUpAvailability = async () => {
    if (!encounter || !followUpDateFrom || !followUpDateTo) return;

    setFollowUpLoading(true);
    setFollowUpError("");
    setFollowUpNoSchedule(false);

    try {
      const doctorId = encounter.doctorId;
      const branchId = encounter.patientBook.patient.branchId;

      // 1) Load doctor schedules
      const schedParams = new URLSearchParams({
        doctorId: String(doctorId),
        dateFrom: followUpDateFrom,
        dateTo: followUpDateTo,
      });
      if (branchId) {
        schedParams.append("branchId", String(branchId));
      }

      const schedRes = await fetch(`/api/doctors/scheduled?${schedParams}`);
      if (!schedRes.ok) {
        const schedJson = await schedRes.json().catch(() => ({}));
        throw new Error(schedJson?.error || "Failed to load doctor schedules");
      }
      const schedJson = await schedRes.json();

      // schedJson is array of doctors with schedules
      const doctors = Array.isArray(schedJson) ? schedJson : [];
      const doctor = doctors.find((d: any) => d.id === doctorId);
      const schedules = doctor?.schedules || [];

      // 2) Load appointments
      // 2) Load appointments (IMPORTANT: do NOT filter by branch here)
// Reason: front desk bookings might be created under a different branchId,
// but they still must block the doctor's time for follow-up scheduling.
const apptParams = new URLSearchParams({
  doctorId: String(doctorId),
  dateFrom: followUpDateFrom,
  dateTo: followUpDateTo,
  status: "ALL",
});

// ❌ remove this branch filter:
// if (branchId) {
//   apptParams.append("branchId", String(branchId));
// }

const apptRes = await fetch(`/api/appointments?${apptParams}`);
      if (!apptRes.ok) {
        const apptJson = await apptRes.json().catch(() => ({}));
        throw new Error(apptJson?.error || "Failed to load appointments");
      }
      const apptJson = await apptRes.json();

      const appointments = Array.isArray(apptJson) ? apptJson : [];

      // Store appointments for details modal
      setFollowUpAppointments(appointments);

      // Check if no schedules exist across the range
      if (schedules.length === 0) {
        setFollowUpNoSchedule(true);
        setFollowUpAvailability(null);
      } else {
        setFollowUpNoSchedule(false);

        // 3) Build availability grid
        const availability = buildFollowUpAvailability({
          dateFrom: followUpDateFrom,
          dateTo: followUpDateTo,
          schedules: schedules.map((s: any) => ({
            id: s.id,
            doctorId: s.doctorId,
            branchId: s.branchId,
            date: s.date,
            startTime: s.startTime,
            endTime: s.endTime,
            note: s.note,
          })),
          appointments: appointments.map((a: any) => ({
            id: a.id,
            scheduledAt: a.scheduledAt,
            endAt: a.endAt,
            status: a.status,
          })),
          slotMinutes: followUpSlotMinutes,
          capacityPerSlot: 2,
        });

        setFollowUpAvailability(availability);
      }
    } catch (err: any) {
      console.error("loadFollowUpAvailability failed", err);
      setFollowUpError(err?.message || "Цагийн хуваарь татахад алдаа гарлаа");
      setFollowUpAvailability(null);
      setFollowUpAppointments([]);
      setFollowUpNoSchedule(false);
    } finally {
      setFollowUpLoading(false);
    }
  };

  const createFollowUpAppointment = async (slotStartIso: string, durationMinutes: number = 30) => {
  if (!encounter) return;

  setFollowUpBooking(true);
  setFollowUpError("");
  setFollowUpSuccess("");

  try {
    // Use the new dedicated endpoint that derives branchId from doctor's schedule
    const res = await fetch(`/api/encounters/${encounter.id}/follow-up-appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotStartIso: slotStartIso,
        durationMinutes: durationMinutes,
      }),
    });

    const json = await res.json();

    if (!res.ok) throw new Error(json.error || "Цаг авахад алдаа гарлаа");

    setFollowUpSuccess(
      `Цаг амжилттай авлаа: ${formatDateTime(slotStartIso)}`
    );

    // Refresh the grid state by calling the grid loader
    await loadFollowUpAvailability();
  } catch (err) {
    console.error("createFollowUpAppointment failed", err);
    setFollowUpError("Цаг авахад алдаа гарлаа.");
  } finally {
    setFollowUpBooking(false);
  }
};

  // Quick create handler for manual date/time entry (Option 3A)
  const handleQuickCreateAppointment = async (params: {
    date: string;
    time: string;
    durationMinutes: number;
  }) => {
    if (!encounter) return;

    setFollowUpBooking(true);
    setFollowUpError("");
    setFollowUpSuccess("");

    try {
      // Build ISO datetime from local date + time
      const [hh, mm] = params.time.split(":").map(Number);
      const [y, m, d] = params.date.split("-").map(Number);
      const startDate = new Date(y, m - 1, d, hh, mm, 0, 0);

      // Use the new dedicated endpoint that derives branchId from doctor's schedule
      const res = await fetch(`/api/encounters/${encounter.id}/follow-up-appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotStartIso: startDate.toISOString(),
          durationMinutes: params.durationMinutes,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to create appointment");
      }

      setFollowUpSuccess(
        `Цаг амжилттай үүсгэлээ: ${params.date} ${params.time}`
      );

      // Auto-hide success message after 5 seconds
      setTimeout(() => {
        setFollowUpSuccess("");
      }, 5000);
    } catch (err: any) {
      console.error("handleQuickCreateAppointment failed", err);
      setFollowUpError(err?.message || "Цаг үүсгэхэд алдаа гарлаа");
    } finally {
      setFollowUpBooking(false);
    }
  };

  // Delete follow-up appointment handler
  const deleteFollowUpAppointment = async (appointmentId: number) => {
    if (!encounter) return;
    
    try {
      const res = await fetch(`/api/appointments/${appointmentId}?encounterId=${encounter.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Цаг устгахад алдаа гарлаа");
      }

      setFollowUpSuccess("Цаг амжилттай устгагдлаа");

      // Refresh the grid state
      await loadFollowUpAvailability();

      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setFollowUpSuccess("");
      }, 3000);
    } catch (err: any) {
      console.error("deleteFollowUpAppointment failed", err);
      throw err; // Re-throw so the component can show the error
    }
  };

  const handleDiagnosisChange = async (
    index: number,
    diagnosisId: number
  ) => {
    setEditableDxRows((prev) =>
      prev.map((row, i) => {
        if (i !== index || row.locked) return row;
        return {
          ...row,
          diagnosisId,
          selectedProblemIds: [],
        };
      })
    );
    const dx = diagnoses.find((d) => d.id === diagnosisId) || null;
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index || row.locked) return row;
        return {
          ...row,
          diagnosisId,
          diagnosis: dx,
          selectedProblemIds: [],
          searchText: dx ? `${dx.code} – ${dx.name}` : "",
        };
      })
    );
    if (diagnosisId) {
      await ensureProblemsLoaded(diagnosisId);
    }
  };

  const toggleProblem = (index: number, problemId: number) => {
    setEditableDxRows((prev) =>
      prev.map((row, i) => {
        if (i !== index || row.locked) return row;
        const exists = row.selectedProblemIds.includes(problemId);
        return {
          ...row,
          selectedProblemIds: exists
            ? row.selectedProblemIds.filter((id) => id !== problemId)
            : [...row.selectedProblemIds, problemId],
        };
      })
    );
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index || row.locked) return row;
        const exists =
          row.selectedProblemIds &&
          row.selectedProblemIds.includes(problemId);
        return {
          ...row,
          selectedProblemIds: exists
            ? row.selectedProblemIds.filter((id) => id !== problemId)
            : [...(row.selectedProblemIds || []), problemId],
        };
      })
    );
  };

  const handleNoteChange = (index: number, value: string) => {
    setEditableDxRows((prev) =>
      prev.map((row, i) =>
        i === index && !row.locked ? { ...row, note: value } : row
      )
    );
    setRows((prev) =>
      prev.map((row, i) =>
        i === index && !row.locked ? { ...row, note: value } : row
      )
    );
  };

  const handleDxToothCodeChange = (index: number, value: string) => {
    setEditableDxRows((prev) =>
      prev.map((row, i) =>
        i === index && !row.locked ? { ...row, toothCode: value } : row
      )
    );
    setRows((prev) =>
      prev.map((row, i) =>
        i === index && !row.locked ? { ...row, toothCode: value } : row
      )
    );
  };

  // NEW: Tool-line draft handlers
  const handleAddToolLineDraft = async (index: number, toolLineId: number) => {
    const row = editableDxRows[index];
    if (!row || !row.id) {
      console.error("Cannot add tool line draft: diagnosis row not saved yet");
      return;
    }

    try {
      const res = await fetch("/api/sterilization/draft-attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encounterDiagnosisId: row.id,
          toolLineId,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to add tool line draft");
      }

      const draft = await res.json();

      // Helper to update draft attachments in a row
      const updateDraftsInRow = (r: EditableDiagnosis, i: number) => {
        if (i !== index) return r;
        const existing = r.draftAttachments || [];
        // Check if we're incrementing an existing draft or adding new
        const existingIndex = existing.findIndex((d) => d.id === draft.id);
        if (existingIndex >= 0) {
          // Update existing draft with new requestedQty
          const updated = [...existing];
          updated[existingIndex] = draft;
          return { ...r, draftAttachments: updated };
        } else {
          // Add new draft
          return { ...r, draftAttachments: [...existing, draft] };
        }
      };

      // Update local state with new draft
      setEditableDxRows((prev) => prev.map(updateDraftsInRow));
      setRows((prev) => prev.map(updateDraftsInRow));
    } catch (err) {
      console.error("Failed to add tool line draft:", err);
    }
  };

  const handleRemoveToolLineDraft = async (index: number, draftId: number) => {
    try {
      const res = await fetch(`/api/sterilization/draft-attachments/${draftId}/decrement`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to remove tool line draft");
      }

      const result = await res.json();

      // Helper to update drafts after removal/decrement
      const updateDraftsAfterRemoval = (r: EditableDiagnosis, i: number) => {
        if (i !== index) return r;
        const drafts = r.draftAttachments || [];
        if (result.deleted) {
          // Remove draft entirely
          return { ...r, draftAttachments: drafts.filter((d) => d.id !== draftId) };
        } else {
          // Update with decremented qty
          return {
            ...r,
            draftAttachments: drafts.map((d) => (d.id === draftId ? result : d)),
          };
        }
      };

      // Update local state
      setEditableDxRows((prev) => prev.map(updateDraftsAfterRemoval));
      setRows((prev) => prev.map(updateDraftsAfterRemoval));
    } catch (err) {
      console.error("Failed to remove tool line draft:", err);
    }
  };

  // NEW: Local handlers for tool line selection (no API calls until save)
  const handleAddToolLineLocal = async (index: number, toolLineId: number) => {
    // Fetch metadata if not cached
    if (!toolLineMetadata.has(toolLineId)) {
      try {
        const branchId = encounter?.patientBook?.patient?.branchId;
        if (branchId) {
          const res = await fetch(`/api/sterilization/tool-lines/search?branchId=${branchId}`);
          if (res.ok) {
            const results = await res.json();
            const newMetadata = new Map(toolLineMetadata);
            for (const result of results) {
              newMetadata.set(result.toolLineId, {
                toolName: result.toolName,
                cycleCode: result.cycleCode,
              });
            }
            setToolLineMetadata(newMetadata);
          }
        }
      } catch (err) {
        console.error("Failed to fetch tool line metadata:", err);
      }
    }

    // Add toolLineId to local array (allow duplicates)
    const updateRow = (r: EditableDiagnosis, i: number) =>
      i === index
        ? { ...r, selectedToolLineIds: [...(r.selectedToolLineIds || []), toolLineId] }
        : r;
    
    setEditableDxRows((prev) => prev.map(updateRow));
    setRows((prev) => prev.map(updateRow));
  };

  const handleRemoveToolLineLocal = (index: number, chipIndex: number) => {
    // Remove one occurrence at chipIndex
    const updateRow = (r: EditableDiagnosis, i: number) => {
      if (i !== index) return r;
      const newIds = [...(r.selectedToolLineIds || [])];
      newIds.splice(chipIndex, 1);
      return { ...r, selectedToolLineIds: newIds };
    };
    
    setEditableDxRows((prev) => prev.map(updateRow));
    setRows((prev) => prev.map(updateRow));
  };

  const handleSaveDiagnoses = async () => {
  if (!id || typeof id !== "string") return;

  setSaving(true);
  setSaveError("");

  try {
    // Build unified payload with all row state
    const payload = {
      rows: editableDxRows.map((row) => {
        // Build toolLineDrafts from TWO sources:
        // 1. Existing server-backed drafts (from row.draftAttachments)
        // 2. New local selections (from row.selectedToolLineIds)
        
        const toolLineCounts = new Map<number, number>();
        
        // First, add existing server-backed drafts with their requestedQty
        if (row.draftAttachments && Array.isArray(row.draftAttachments)) {
          row.draftAttachments.forEach((draft) => {
            if (draft.toolLineId) {
              toolLineCounts.set(
                draft.toolLineId, 
                (toolLineCounts.get(draft.toolLineId) || 0) + (draft.requestedQty || 1)
              );
            }
          });
        }
        
        // Then, add local unsaved selections (each occurrence increments count)
        if (row.selectedToolLineIds && Array.isArray(row.selectedToolLineIds)) {
          row.selectedToolLineIds.forEach((toolLineId) => {
            toolLineCounts.set(toolLineId, (toolLineCounts.get(toolLineId) || 0) + 1);
          });
        }
        
        // Convert aggregated counts to toolLineDrafts array
        const toolLineDrafts = Array.from(toolLineCounts.entries()).map(([toolLineId, requestedQty]) => ({
          toolLineId,
          requestedQty,
        }));

        return {
          id: row.id ?? null,
          localId: row.localId ?? 0,
          diagnosisId: row.diagnosisId ?? null,
          toothCode: row.toothCode || null,
          note: row.note || null,
          selectedProblemIds: Array.isArray(row.selectedProblemIds) ? row.selectedProblemIds : [],
          indicatorIds: Array.isArray(row.indicatorIds) ? row.indicatorIds : [],
          serviceId: row.serviceId ?? null,
          assignedTo: row.assignedTo ?? "DOCTOR",
          toolLineDrafts, // Includes both existing and new selections
        };
      }),
    };

    const res = await fetch(`/api/encounters/${id}/diagnosis-rows`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((json && json.error) || "Онош хадгалахад алдаа гарлаа");
    }

    const { savedRows = [], failedRows = [], deletedDiagnosisIds = [] } = json || {};

    // Surface any per-row errors
    if (failedRows.length > 0) {
      const errorMsg = failedRows
        .map((f: any) => {
          // Use localId from failed row for reference
          const rowDisplay = f.localId || f.id || "Unknown";
          return `• Мөр ${rowDisplay}: ${f.error}`;
        })
        .join("\n");
      console.error("Some rows failed to save:", errorMsg);
      setSaveError(`Зарим мөрүүд хадгалагдсангүй:\n${errorMsg}`);
    }

    // Update state with saved rows
    const savedDxRows: EditableDiagnosis[] = savedRows.map((serverRow: any) => {
      // Get service info for display text
      const svc = services.find((s) => s.id === serverRow.serviceId);
      const serviceSearchText = svc ? `${svc.code} – ${svc.name}` : "";

      // Ensure localId is a number for comparison
      const serverLocalId = serverRow.localId ?? 0;

      // Find the original editable row to preserve UI state (match by localId)
      const originalRow = editableDxRows.find(row => row.localId === serverLocalId);

      return {
        ...serverRow,
        diagnosisId: serverRow.diagnosisId ?? null,
        diagnosis: serverRow.diagnosis ?? null,
        localId: serverLocalId,
        selectedProblemIds: Array.isArray(serverRow.selectedProblemIds)
          ? serverRow.selectedProblemIds
          : [],
        note: serverRow.note || "",
        toothCode: serverRow.toothCode || "",

        // Service data (now saved atomically with diagnosis)
        serviceId: serverRow.serviceId ?? null,
        serviceSearchText,
        assignedTo: serverRow.assignedTo ?? "DOCTOR",

        // Indicator data (now saved atomically with diagnosis)
        indicatorIds: Array.isArray(serverRow.indicatorIds) ? serverRow.indicatorIds : [],
        indicatorSearchText: "",
        indicatorsDirty: false,

        // Preserve tool-line based draft attachments and search text
        // Priority: 1) backend draftAttachments array, 2) original row state, 3) empty array
        draftAttachments: Array.isArray(serverRow.draftAttachments) 
          ? serverRow.draftAttachments 
          : originalRow?.draftAttachments || [],
        toolLineSearchText: originalRow?.toolLineSearchText || "",
        // Keep selectedToolLineIds empty after save - chips will be rendered from draftAttachments
        selectedToolLineIds: [],

        searchText: serverRow.diagnosis
          ? `${serverRow.diagnosis.code} – ${serverRow.diagnosis.name}`
          : "",
        locked: true,
      };
    });

    setEditableDxRows(savedDxRows);
    setRows(savedDxRows);

    // Sync problem texts and service texts for each saved diagnosis
    for (const srvRow of savedRows) {
      if (!srvRow.id) continue;

      // Find the corresponding editable row to get draft texts
      const editableRow = editableDxRows.find(r => r.localId === srvRow.localId);
      if (!editableRow) continue;

      // Sync problem texts if there are drafts
      if (editableRow.draftProblemTexts && Array.isArray(editableRow.draftProblemTexts)) {
        try {
          await fetch(`/api/encounter-diagnoses/${srvRow.id}/problem-texts/sync`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texts: editableRow.draftProblemTexts }),
          });
        } catch (err) {
          console.error(`Error syncing problem texts for diagnosis ${srvRow.id}:`, err);
        }
      }

      // Sync service texts if the row has a service and encounterServiceId
      if (srvRow.serviceId && srvRow.encounterServiceId && editableRow.draftServiceTexts && Array.isArray(editableRow.draftServiceTexts)) {
        try {
          await fetch(`/api/encounter-services/${srvRow.encounterServiceId}/texts/sync`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texts: editableRow.draftServiceTexts }),
          });
        } catch (err) {
          console.error(`Error syncing service texts for service ${srvRow.encounterServiceId}:`, err);
        }
      }
    }

    // Update encounter services to match saved state
    if (encounter) {
      // Fetch updated encounter to refresh services and text arrays
      const servicesRes = await fetch(`/api/encounters/${id}`);
      if (servicesRes.ok) {
        const encounterData = await servicesRes.json();
        setEncounter({
          ...encounter,
          encounterServices: encounterData.encounterServices || [],
          encounterDiagnoses: encounterData.encounterDiagnoses || [],
        });
        setEditableServices(encounterData.encounterServices || []);
        
        // Update savedDxRows with fresh problemTexts and serviceTexts from backend
        const refreshedDxRows: EditableDiagnosis[] = savedDxRows.map((savedRow) => {
          const backendDx = encounterData.encounterDiagnoses?.find((dx: any) => dx.id === savedRow.id);
          return {
            ...savedRow,
            // Preserve draftAttachments from backend refresh
            draftAttachments: backendDx?.draftAttachments ?? savedRow.draftAttachments ?? [],
            problemTexts: backendDx?.problemTexts || [],
            draftProblemTexts: undefined, // Clear drafts, use saved data
            draftServiceTexts: undefined, // Clear drafts, use saved data
          };
        });
        
        setEditableDxRows(refreshedDxRows);
        setRows(refreshedDxRows);
      }
    }

    // Log deletion info for debugging
    if (deletedDiagnosisIds.length > 0) {
      console.log("Deleted diagnosis IDs:", deletedDiagnosisIds);
    }
  } catch (err: any) {
    console.error("handleSaveDiagnoses failed", err);
    setSaveError(err?.message || "Онош хадгалахад алдаа гарлаа.");
  } finally {
    setSaving(false);
  }
};

  const handleSaveServices = async () => {
    if (!id || typeof id !== "string") return;
    setSaving(true);
    setSaveError("");
    try {
      // Validate that all rows with services have been saved (have database IDs)
      const rowsWithServices = rows.filter((r) => r.serviceId);
      const unsavedDiagnosisRows = rowsWithServices.filter((r) => !r.id);
      
      if (unsavedDiagnosisRows.length > 0) {
        throw new Error(
          "Онош эхлээд хадгална уу. Онош хадгалсны дараа үйлчилгээ хадгалах боломжтой."
        );
      }

      const payload = {
  items: rowsWithServices.map((r) => {
      const svc = services.find((s) => s.id === r.serviceId);
      const isImaging = svc?.category === "IMAGING";

      return {
        serviceId: r.serviceId!,
        quantity: 1,
        assignedTo: isImaging ? (r.assignedTo ?? "DOCTOR") : "DOCTOR",
        diagnosisId: r.id!, // Now guaranteed to exist due to validation
      };
    }),
};

      const res = await fetch(`/api/encounters/${id}/services`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (json && json.error) || "Үйлчилгээ хадгалахад алдаа гарлаа"
        );
      }

      if (encounter) {
        setEncounter({
          ...encounter,
          encounterServices: json,
        });
      }
      setEditableServices(json);
setRows((prev) =>
  prev.map((dxRow) => {
    const linked = (Array.isArray(json) ? json : []).find(
      (es: any) => (es.meta as any)?.diagnosisId === dxRow.id
    );
    if (!linked) return dxRow;

    const svc = services.find((s) => s.id === linked.serviceId);
    return {
      ...dxRow,
      serviceId: linked.serviceId,
      serviceSearchText: svc ? `${svc.code} – ${svc.name}` : dxRow.serviceSearchText,
      assignedTo: (linked.meta as any)?.assignedTo ?? dxRow.assignedTo ?? "DOCTOR",
    };
  })
);
     
    } catch (err: any) {
      console.error("handleSaveServices failed", err);
      setSaveError(
        err?.message || "Үйлчилгээ хадгалахад алдаа гарлаа."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleChangeNurse = async (nurseIdStr: string) => {
    if (!id || typeof id !== "string") return;
    setChangingNurse(true);
    try {
      const nurseId =
        nurseIdStr === "" ? null : Number(nurseIdStr) || null;

      const res = await fetch(`/api/encounters/${id}/nurse`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nurseId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (json && json.error) || "Сувилагч сонгоход алдаа гарлаа"
        );
      }

      if (encounter) {
        setEncounter({
          ...encounter,
          nurse: json.nurse || null,
          nurseId: json.nurse ? json.nurse.id : null,
        });
      }
    } catch (err) {
      console.error("handleChangeNurse failed", err);
    } finally {
      setChangingNurse(false);
    }
  };

  const savePrescription = async () => {
    if (!id || typeof id !== "string") return;
    setPrescriptionSaving(true);
    setPrescriptionError("");
    try {
      const payload = {
        items: prescriptionItems.map((it) => ({
          drugName: it.drugName,
          durationDays: it.durationDays ?? 1,
          quantityPerTake: it.quantityPerTake ?? 1,
          frequencyPerDay: it.frequencyPerDay ?? 1,
          note: it.note || "",
        })),
      };

      const res = await fetch(`/api/encounters/${id}/prescription`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (json && json.error) || "Жор хадгалахад алдаа гарлаа"
        );
      }

      if (encounter) {
        setEncounter({
          ...encounter,
          prescription: json.prescription,
        });
      }

      const newItems: EditablePrescriptionItem[] =
        json.prescription?.items?.map((it: any) => ({
          localId: it.order,
          drugName: it.drugName,
          durationDays: it.durationDays,
          quantityPerTake: it.quantityPerTake,
          frequencyPerDay: it.frequencyPerDay,
          note: it.note || "",
        })) || [];

      if (newItems.length === 0) {
  newItems.push({
    localId: 1,
    drugName: "",
    durationDays: null,
    quantityPerTake: null,
    frequencyPerDay: null,
    note: "",
  });
}

      setPrescriptionItems(newItems);
    } catch (err: any) {
      console.error("savePrescription failed", err);
      setPrescriptionError(
        err?.message || "Жор хадгалахад алдаа гарлаа."
      );
    } finally {
      setPrescriptionSaving(false);
    }
  };

 

  const handleMediaUpload = async (files: File[]) => {
    if (!id || typeof id !== "string" || files.length === 0) return;
    try {
      setUploadingMedia(true);
      setMediaError("");

      // Upload all files sequentially
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("toothCode", selectedTeeth.join(",") || "");
        formData.append(
          "type",
          mediaTypeFilter === "ALL" ? "XRAY" : mediaTypeFilter
        );

        const res = await fetch(`/api/encounters/${id}/media`, {
          method: "POST",
          body: formData,
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (json && json.error) || "Файл байршуулахад алдаа гарлаа"
          );
        }
      }

      await reloadMedia();
    } catch (err: any) {
      console.error("handleMediaUpload failed", err);
      setMediaError(
        err?.message || "Файл байршуулахад алдаа гарлаа."
      );
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleMediaDelete = async (mediaId: number) => {
    if (!id || typeof id !== "string") return;
    try {
      setMediaError("");
      const res = await fetch(`/api/encounters/${id}/media/${mediaId}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (json && json.error) || "Зураг устгахад алдаа гарлаа"
        );
      }

      // Update local state immediately
      setMedia((prev) => prev.filter((m) => m.id !== mediaId));
    } catch (err: any) {
      console.error("handleMediaDelete failed", err);
      setMediaError(
        err?.message || "Зураг устгахад алдаа гарлаа."
      );
    }
  };

const handleFinishEncounter = async () => {
    if (!id || typeof id !== "string") return;

    setFinishing(true);
    try {
      await handleSaveDiagnoses();
      // Services are now saved by handleSaveDiagnoses - no separate call needed
      await savePrescription();

      const res = await fetch(`/api/encounters/${id}/finish`, { method: "PUT" });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          (json && json.error) ||
            "Үзлэг дууссаны төлөв шинэчлэх үед алдаа гарлаа."
        );
      }

      await router.push(`/billing/${id}`);
    } catch (err) {
      console.error("handleFinishEncounter failed", err);
    } finally {
      setFinishing(false);
    }
  };
     
  const warningLines: WarningLine[] = extractWarningLinesFromVisitCard(
    visitCard
  );

  const totalDiagnosisServicesPrice = rows.reduce((sum, r) => {
    if (!r.serviceId) return sum;
    const svc = services.find((x) => x.id === r.serviceId);
    const price = svc?.price ?? 0;
    return sum + price;
  }, 0);

  if (!id || typeof id !== "string") {
    return (
      <main
        style={{
          maxWidth: 900,
          margin: "40px auto",
          padding: 24,
          fontFamily: "sans-serif",
        }}
      >
        <h1>Үзлэгийн дэлгэрэнгүй</h1>
        <div style={{ color: "red" }}>ID буруу байна.</div>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 1000,
        margin: "40px auto",
        padding: 24,
        fontFamily: "sans-serif",
      }}
    >
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>
        Үзлэгийн дэлгэрэнгүй
      </h1>

      {loading && <div>Ачаалж байна...</div>}
      {!loading && error && (
        <div style={{ color: "red", marginBottom: 12 }}>{error}</div>
      )}

      {!loading && !error && encounter && (
        <>
          <PatientHeader
            encounter={encounter}
            warningLines={warningLines}
            nursesForEncounter={nursesForEncounter}
            changingNurse={changingNurse}
            onChangeNurse={handleChangeNurse}
            onNavigateToPatient={() =>
              router.push(
                `/patients/${encodeURIComponent(
                  encounter.patientBook.bookNumber
                )}`
              )
            }
            onNavigateToVisitCard={() =>
              router.push(
                `/patients/${encodeURIComponent(
                  encounter.patientBook.bookNumber
                )}?tab=visit-card`
              )
            }
            onNavigateToOrtho={() =>
              router.push(
                `/ortho/${encodeURIComponent(
                  encounter.patientBook.bookNumber
                )}`
              )
            }
            onNavigateToPreviousEncounters={() =>
              router.push(
                `/patients/${encodeURIComponent(
                  encounter.patientBook.bookNumber
                )}?tab=encounters`
              )
            }
          />

          <section
            style={{
              marginBottom: 16,
            }}
          >
            <ConsentFormsBlock
              encounter={encounter}
              consents={consents}
              consentTypeDraft={consentTypeDraft}
              consentAnswersDraft={consentAnswersDraft}
              consentSaving={consentSaving}
              consentLoading={consentLoading}
              consentError={consentError}
              uploadingPatientSignature={uploadingPatientSignature}
              uploadingDoctorSignature={uploadingDoctorSignature}
              attachingDoctorSignature={attachingDoctorSignature}
              onConsentTypeDraftChange={setConsentTypeDraft}
              onConsentAnswersDraftUpdate={updateConsentAnswers}
              onSaveConsent={saveCurrentConsent}
              onSaveConsentApi={saveConsentApi}
              onPatientSignatureUpload={handlePatientSignatureUpload}
              onDoctorSignatureUpload={handleDoctorSignatureUpload}
              onAttachDoctorSignature={handleAttachDoctorSignature}
            />

            {/* Follow-up Appointment Scheduler */}
            <FollowUpScheduler
              showFollowUpScheduler={showFollowUpScheduler}
              followUpDateFrom={followUpDateFrom}
              followUpDateTo={followUpDateTo}
              followUpSlotMinutes={followUpSlotMinutes}
              followUpAvailability={followUpAvailability}
              followUpLoading={followUpLoading}
              followUpError={followUpError}
              followUpSuccess={followUpSuccess}
              followUpBooking={followUpBooking}
              followUpAppointments={followUpAppointments}
              followUpNoSchedule={followUpNoSchedule}
              onToggleScheduler={(checked) => {
                setShowFollowUpScheduler(checked);
                if (!checked) {
                  setFollowUpError("");
                  setFollowUpSuccess("");
                  setFollowUpAvailability(null);
                  setFollowUpAppointments([]);
                  setFollowUpNoSchedule(false);
                }
              }}
              onDateFromChange={setFollowUpDateFrom}
              onDateToChange={setFollowUpDateTo}
              onSlotMinutesChange={setFollowUpSlotMinutes}
              onBookAppointment={createFollowUpAppointment}
              onDeleteAppointment={deleteFollowUpAppointment}
              onQuickCreate={handleQuickCreateAppointment}
              doctorId={encounter?.doctorId || undefined}
              encounterId={encounter?.id || undefined}
              onReloadAvailability={loadFollowUpAvailability}
            />
          </section>

          <ToothChartSelector
            toothMode={toothMode}
            selectedTeeth={selectedTeeth}
            customToothRange={customToothRange}
            chartError={chartError}
            onToggleToothMode={toggleToothMode}
            onToggleToothSelection={toggleToothSelection}
            onCustomToothRangeChange={setCustomToothRange}
            isToothSelected={isToothSelected}
            areAllModeTeethSelected={areAllModeTeethSelected}
          />

          <section
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
            }}
          >
            <DiagnosesEditor
              rows={rows}
              diagnoses={diagnoses}
              services={services}
              activeIndicators={activeIndicators}
              problemsByDiagnosis={problemsByDiagnosis}
              dxError={dxError}
              servicesLoadError={servicesLoadError}
              saveError={saveError}
              saving={saving}
              finishing={finishing}
              prescriptionSaving={prescriptionSaving}
              openDxIndex={openDxIndex}
              openServiceIndex={openServiceIndex}
              openIndicatorIndex={openIndicatorIndex}
              activeDxRowIndex={activeDxRowIndex}
              totalDiagnosisServicesPrice={totalDiagnosisServicesPrice}
              encounterServices={editableServices}
              branchId={encounter?.patientBook?.patient?.branchId}
              onDiagnosisChange={handleDiagnosisChange}
              onToggleProblem={toggleProblem}
              onNoteChange={handleNoteChange}
              onToothCodeChange={handleDxToothCodeChange}
              onRemoveRow={removeDiagnosisRow}
              onUnlockRow={unlockRow}
              onLockRow={lockRow}
              onSetOpenDxIndex={setOpenDxIndex}
              onSetOpenServiceIndex={setOpenServiceIndex}
              onSetOpenIndicatorIndex={setOpenIndicatorIndex}
              onSetActiveDxRowIndex={setActiveDxRowIndex}
              onUpdateRowField={updateDxRowField}
              onAddToolLineDraft={handleAddToolLineDraft}
              onRemoveToolLineDraft={handleRemoveToolLineDraft}
              onAddToolLineLocal={handleAddToolLineLocal}
              onRemoveToolLineLocal={handleRemoveToolLineLocal}
              toolLineMetadata={toolLineMetadata}
              onSave={async () => {
  if (saving || finishing) return;

  try {
    await handleSaveDiagnoses();  // includes services + indicators now
    await savePrescription();
  } catch (err: any) {
    console.error("Save failed:", err);
    setSaveError(err?.message || "Хадгалахад алдаа гарлаа");
  }
}}
              onFinish={handleFinishEncounter}
              onResetToothSelection={resetToothSelectionSession}
              onReloadEncounter={reloadEncounter}
       
            />

            <MediaGallery
              media={media}
              mediaLoading={mediaLoading}
              mediaError={mediaError}
              uploadingMedia={uploadingMedia}
              onUpload={handleMediaUpload}
              onDelete={handleMediaDelete}
              onRefresh={reloadMedia}
            />

            <PrescriptionEditor
              prescriptionItems={prescriptionItems}
              prescriptionSaving={prescriptionSaving}
              prescriptionError={prescriptionError}
              onUpdateItem={(idx, updates) =>
                setPrescriptionItems((prev) =>
                  prev.map((p, i) => (i === idx ? { ...p, ...updates } : p))
                )
              }
              onRemoveItem={(idx) =>
                setPrescriptionItems((prev) =>
                  prev.filter((_, i) => i !== idx)
                )
              }
              onAddItem={() => {
                if (prescriptionItems.length >= 3) return;
                setPrescriptionItems((prev) => [
                  ...prev,
                  {
                    localId: prev.length + 1,
                    drugName: "",
                    durationDays: null,
                    quantityPerTake: null,
                    frequencyPerDay: null,
                    note: "",
                  },
                ]);
              }}
              onSave={savePrescription}
            />
          </section>
        </>
      )}
    </main>
  );
}
