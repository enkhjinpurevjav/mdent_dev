import React, { useState, useEffect, useRef } from "react";
import { displayOrEmpty } from "../../utils/format";

type Patient = {
  id: number;
  regNo?: string | null;
  ovog?: string | null;
  name: string;
  gender?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  workPlace?: string | null;
};

type PatientBook = {
  id: number;
  bookNumber: string;
};

type VisitCard = {
  id: number;
  type: "ADULT" | "CHILD";
  answers: any;
  signedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type DiagnosisEntry = {
  id: number;
  diagnosisId?: number | null;
  toothCode?: string | null;
  note?: string | null;
  selectedProblemIds?: number[];
  diagnosis?: {
    code: string;
    name: string;
    problems?: Array<{
      id: number;
      label: string;
      order: number;
    }>;
  } | null;
  problemTexts?: Array<{
    text: string;
    order: number;
  }>;
  sterilizationIndicators?: Array<{
    indicator: {
      id: number;
      code?: string;   // add this
      name: string;
      tool?: {
        name: string;
      };
    };
  }>;
  draftAttachments?: Array<{
    id: number;
    encounterDiagnosisId: number;
    cycleId: number;
    cycle: {
      id: number;
      code: string;
    };
    tool: {
      id: number;
      name: string;
    };
  }>;
};

type EncounterService = {
  id: number;
  serviceId: number;
  quantity: number;
  price: number;
  meta?: any;
  service?: {
    name: string;
  };
  texts?: Array<{
    text: string;
    order: number;
  }>;
};

type Encounter = {
  id: number;
  visitDate: string;
  notes?: string | null;
  doctor?: {
    ovog?: string | null;
    name: string;
  };
  nurse?: {
    ovog?: string | null;
    name: string;
  } | null;
  diagnoses?: DiagnosisEntry[];
  encounterServices?: EncounterService[];
};

// Type for encounter details API response
type EncounterDetails = {
  id: number;
  visitDate: string;
  notes?: string | null;
  doctor?: {
    ovog?: string | null;
    name: string;
  };
  nurse?: {
    ovog?: string | null;
    name: string;
  } | null;
  diagnoses?: DiagnosisEntry[];
  encounterDiagnoses?: DiagnosisEntry[];
  encounterServices?: EncounterService[];
};

type Props = {
  patient: Patient;
  patientBook: PatientBook;
  visitCard?: VisitCard | null;
  encounters: Encounter[];
  isDoctor?: boolean;
};

const PatientHistoryBook: React.FC<Props> = ({
  patient,
  patientBook,
  visitCard,
  encounters,
  isDoctor = false,
}) => {
  const [showFilters, setShowFilters] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [showHeader, setShowHeader] = useState(true);
  const [showQuestionnaire, setShowQuestionnaire] = useState(true);
  const [showTable, setShowTable] = useState(true);

  // Cache for encounter details (map: encounterId -> EncounterDetails)
  const [encounterDetailsCache, setEncounterDetailsCache] = useState<
    Map<number, EncounterDetails>
  >(new Map());

  // Use refs to track fetching state synchronously to prevent race conditions
  const fetchingEncounterIdsRef = useRef<Set<number>>(new Set());
  const encounterDetailsCacheRef = useRef<Map<number, EncounterDetails>>(
    new Map()
  );

  // Helper functions
  const displayOrDash = (value?: string | null) => {
    if (value == null || value === "") return "-";
    return value;
  };

  const hasText = (value?: string | null) => {
    return value != null && value.trim() !== "";
  };

  // Label mappings matching the UI exactly
  const REASON_TO_VISIT_LABELS: Record<string, string> = {
    toothPain: "Шүд өвдсөн",
    toothBroken: "Шүд цоорсон",
    badBite: "Шүд буруу ургасан",
    toothDecay: "Ломбо унасан",
    preventiveCheck: "Урьдчилан сэргийлэх хяналтанд орох",
    cosmeticSmile: "Гоо сайхны /цайруулах, Hollywood smile гэх мэт/",
  };

  // Adult labels
  const GENERAL_MEDICAL_LABELS_ADULT: Record<string, string> = {
    heartDisease: "Зүрх судасны өвчтэй эсэх",
    highBloodPressure: "Даралт ихсэх өвчтэй эсэх",
    infectiousDisease: "Халдварт өвчний түүхтэй эсэх",
    tuberculosis: "Сүрьеэ өвчнөөр өвчилж байсан эсэх",
    hepatitisBC: "Халдварт гепатит B, C‑сээр өвдөж байсан эсэх",
    diabetes: "Чихрийн шижинтэй эсэх",
    onMedication: "Одоо хэрэглэж байгаа эм, тариа байгаа эсэх",
    seriousIllnessOrSurgery: "Ойрын 5 жилд хүнд өвчнөөр өвчилсөн болон мэс ажилбар хийлгэж байсан эсэх",
    implant: "Зүрхний импланттай эсэх",
    generalAnesthesia: "Бүтэн наркоз хийлгэж байсан эсэх",
    chemoOrRadiation: "Хими / туяа эмчилгээ хийлгэж байгаа эсэх",
  };

  // Child labels (slightly different wording)
  const GENERAL_MEDICAL_LABELS_CHILD: Record<string, string> = {
    heartDisease: "Зүрх судасны өвчинтэй эсэх",
    highBloodPressure: "Даралт ихсэх өвчинтэй эсэх",
    infectiousDisease: "Халдварт өвчинтэй эсэх",
    tuberculosis: "Сүрьеэ өвчнөөр өвчилж байсан эсэх",
    hepatitisBC: "Халдварт гепатит В, С-ээр өвдөж байсан эсэх",
    diabetes: "Чихрийн шижинтэй эсэх",
    onMedication: "Одоо хэрэглэж байгаа эм, тариа байгаа эсэх",
    seriousIllnessOrSurgery: "Ойрын 5 жилд хүнд өвчнөөр өвчилсөн болон мэс ажилбарт орж байсан эсэх",
    implant: "Зүрхний импланттай эсэх",
    generalAnesthesia: "Бүтэн наркоз хийлгэж байсан эсэх",
    chemoOrRadiation: "Химийн/ туяа эмчилгээ хийлгэж байгаа эсэх",
  };

  const ALLERGIES_LABELS: Record<string, string> = {
    drug: "Эм тариа",
    metal: "Метал",
    localAnesthetic: "Шүдний мэдээ алдуулах тариа",
    latex: "Латекс",
    other: "Бусад",
  };

  // Adult habits labels
  const HABITS_LABELS_ADULT: Record<string, string> = {
    smoking: "Тамхи татдаг эсэх",
    alcohol: "Архи хэрэглэдэг эсэх",
    coffee: "Кофе хэрэглэдэг эсэх",
    nightGrinding: "Шөнө шүдээ хавирдаг эсэх",
    mouthBreathing: "Ам ангайж унтдаг / амаар амьсгалдаг эсэх",
    other: "Бусад",
  };

  // Child habits labels (different questions)
  const HABITS_LABELS_CHILD: Record<string, string> = {
    mouthBreathing: "Хэл, хуруу хөхдөг эсэх",
    nightGrinding: "Шөнө амаа ангайж унтдаг эсэх",
    other: "Бусад",
  };

  const DENTAL_FOLLOWUP_LABELS_ADULT: Record<string, string> = {
    regularCheckups: "Шүдний эмчид байнга үзүүлдэг эсэх",
    bleedingAfterExtraction: "Шүд авахуулсны дараа цус тогтол удаан эсэх",
    gumBleeding: "Буйлнаас цус гардаг эсэх",
    badBreath: "Амнаас эвгүй үнэр гардаг эсэх",
  };

  const DENTAL_FOLLOWUP_LABELS_CHILD: Record<string, string> = {
    regularCheckups: "Шүдний эмчид байнга үзүүлдэг эсэх",
    bleedingAfterExtraction: "Шүд авахуулсны дараа цус тогтолт удаан эсэх",
    gumBleeding: "Буйлнаас цус гардаг эсэх",
    badBreath: "Амнаас эвгүй үнэр гардаг эсэх",
  };

  const collectYesFindings = (answers: any, isChild: boolean): Array<{ label: string; detail?: string }> => {
    const findings: Array<{ label: string; detail?: string }> = [];
    
    // Select appropriate label sets based on card type
    const GENERAL_MEDICAL_LABELS = isChild ? GENERAL_MEDICAL_LABELS_CHILD : GENERAL_MEDICAL_LABELS_ADULT;
    const HABITS_LABELS = isChild ? HABITS_LABELS_CHILD : HABITS_LABELS_ADULT;
    const DENTAL_FOLLOWUP_LABELS = isChild ? DENTAL_FOLLOWUP_LABELS_CHILD : DENTAL_FOLLOWUP_LABELS_ADULT;
    
    // General Medical section - using UI labels
    const generalMed = answers.generalMedical || {};
    Object.keys(GENERAL_MEDICAL_LABELS).forEach((key) => {
      if (generalMed[key] === "yes") {
        const detailKey = `${key}Detail`;
        findings.push({ 
          label: GENERAL_MEDICAL_LABELS[key], 
          detail: generalMed[detailKey] || generalMed.details || ""
        });
      }
    });

    // Allergies section - using UI labels
    const allergies = answers.allergies || {};
    Object.keys(ALLERGIES_LABELS).forEach((key) => {
      if (allergies[key] === "yes") {
        const detailKey = key === "other" ? "otherDetail" : `${key}Detail`;
        findings.push({ 
          label: ALLERGIES_LABELS[key], 
          detail: allergies[detailKey] || ""
        });
      }
    });

    // Habits section - using UI labels
    const habits = answers.habits || {};
    Object.keys(HABITS_LABELS).forEach((key) => {
      if (habits[key] === "yes") {
        const detailKey = key === "other" ? "otherDetail" : `${key}Detail`;
        findings.push({ 
          label: HABITS_LABELS[key], 
          detail: habits[detailKey] || ""
        });
      }
    });

    // Dental followup section - using UI labels
    const dentalFollowup = answers.dentalFollowup || {};
    Object.keys(DENTAL_FOLLOWUP_LABELS).forEach((key) => {
      if (dentalFollowup[key] === "yes") {
        const detailKey = `${key}Detail`;
        findings.push({ 
          label: DENTAL_FOLLOWUP_LABELS[key], 
          detail: dentalFollowup[detailKey] || ""
        });
      }
    });

    return findings;
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "-";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}/${month}/${day}`;
  };

  const calculateAge = (birthDate?: string | null) => {
    if (!birthDate) return "-";
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return "-";
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age >= 0 ? age : "-";
  };

  const getInitials = (ovog?: string | null, name?: string) => {
    if (!name) return "";
    const firstLetter = ovog ? ovog.charAt(0).toUpperCase() : "";
    return firstLetter ? `${firstLetter}.${name}` : name;
  };

  const getCardFillDate = () => {
    if (visitCard?.signedAt) {
      return formatDate(visitCard.signedAt);
    }
    if (visitCard?.updatedAt) {
      return formatDate(visitCard.updatedAt);
    }
    if (visitCard?.createdAt) {
      return formatDate(visitCard.createdAt);
    }
    return "-";
  };

  // Fetch encounter details to get draft attachments
  const fetchEncounterDetails = async (encounterId: number) => {
    try {
      const res = await fetch(`/api/encounters/${encounterId}`);
      if (res.ok) {
        const data: EncounterDetails = await res.json();
        encounterDetailsCacheRef.current.set(encounterId, data);
        setEncounterDetailsCache(new Map(encounterDetailsCacheRef.current));
      } else {
        console.warn(`Failed to fetch encounter ${encounterId}:`, res.status);
      }
    } catch (err) {
      console.warn(`Error fetching encounter ${encounterId}:`, err);
    }
  };

  // Filter encounters by date range
  const filteredEncounters = encounters.filter((enc) => {
    if (!filterStartDate && !filterEndDate) return true;
    const encDate = new Date(enc.visitDate);
    if (filterStartDate) {
      const start = new Date(filterStartDate);
      if (encDate < start) return false;
    }
    if (filterEndDate) {
      const end = new Date(filterEndDate);
      end.setHours(23, 59, 59, 999);
      if (encDate > end) return false;
    }
    return true;
  });

  // Fetch encounter details for filtered encounters (to get draft attachments)
  useEffect(() => {
    filteredEncounters.forEach((enc) => {
      // Check cache ref synchronously to prevent duplicate fetches from concurrent renders
      if (
        !encounterDetailsCacheRef.current.has(enc.id) &&
        !fetchingEncounterIdsRef.current.has(enc.id)
      ) {
        fetchingEncounterIdsRef.current.add(enc.id);
        fetchEncounterDetails(enc.id).finally(() => {
          fetchingEncounterIdsRef.current.delete(enc.id);
        });
      }
    });
  }, [filterStartDate, filterEndDate, encounters]);

  // Build diagnosis rows (one row per diagnosis entry)
  const diagnosisRows: Array<{
    date: string;
    toothCode: string;
    complaints: string[];
    diagnosis: string;
    treatment: string[];
    indicators: string[];
    note: string;
    doctorNurse: string;
  }> = [];

  filteredEncounters.forEach((enc) => {
    const diagnoses = enc.diagnoses || [];
    const services = enc.encounterServices || [];

    diagnoses.forEach((diag) => {
      // Tooth code
      const toothCode = diag.toothCode || "-";

      // Complaints: First, selected chip labels from selectedProblemIds
      const complaints: string[] = [];
      
      // Add selected problem chips first
      if (
        Array.isArray(diag.selectedProblemIds) && 
        diag.diagnosis?.problems && 
        diag.diagnosis.problems.length > 0
      ) {
        const problemsMap = new Map(
          diag.diagnosis.problems.map(p => [p.id, p.label])
        );
        diag.selectedProblemIds.forEach((id) => {
          const label = problemsMap.get(id);
          if (label) {
            complaints.push(label);
          }
        });
      }
      
      // Then add free-text problem texts
      const problemTexts = (diag.problemTexts || [])
        .sort((a, b) => a.order - b.order)
        .map((pt) => pt.text);
      complaints.push(...problemTexts);

      // Diagnosis code only (strip description)
      let diagnosisCode = "-";
      if (diag.diagnosis?.code) {
        // Split on various dash types (hyphen, en-dash, em-dash) and take first part
        diagnosisCode = diag.diagnosis.code.split(/[-–—]/)[0].trim();
      }

      // Treatment lines (services assigned to this diagnosis)
      const diagServices = services.filter(
        (svc) => svc.meta?.diagnosisId === diag.id
      );
      const treatment: string[] = [];
      diagServices.forEach((svc) => {
        if (svc.texts && svc.texts.length > 0) {
          svc.texts
            .sort((a, b) => a.order - b.order)
            .forEach((t) => treatment.push(t.text));
        }
      });

      // Indicators (sterilization tools)
      // First try sterilizationIndicators from the profile response
      let indicators = (diag.sterilizationIndicators || [])
        .map((si) => si.indicator?.code || si.indicator?.name)
        .filter((v): v is string => Boolean(v && v.trim()));

      // If empty, fallback to draft attachments cycle codes from encounter details
      if (indicators.length === 0) {
        const encounterDetails = encounterDetailsCache.get(enc.id);
        if (encounterDetails) {
          // Backend may return diagnoses as 'diagnoses' or 'encounterDiagnoses'
          const detailDiagnoses =
            encounterDetails.encounterDiagnoses || encounterDetails.diagnoses || [];
          const detailDiag = detailDiagnoses.find((d) => d.id === diag.id);
          if (detailDiag?.draftAttachments) {
            indicators = detailDiag.draftAttachments
              .map((da) => da.cycle?.code)
              .filter((code): code is string => Boolean(code && code.trim()));
          }
        }
      }

      // Note
      const note = diag.note || "";

      // Doctor and nurse initials
      const doctorInitials = enc.doctor
        ? getInitials(enc.doctor.ovog, enc.doctor.name)
        : "";
      const nurseInitials = enc.nurse
        ? getInitials(enc.nurse.ovog, enc.nurse.name)
        : "";
      const doctorNurse =
        doctorInitials && nurseInitials
          ? `${doctorInitials} / ${nurseInitials}`
          : doctorInitials || nurseInitials || "-";

      diagnosisRows.push({
        date: formatDate(enc.visitDate),
        toothCode,
        complaints,
        diagnosis: diagnosisCode,
        treatment,
        indicators,
        note,
        doctorNurse,
      });
    });
  });

  // Get questionnaire data
  const answers = visitCard?.answers || {};

  const renderQuestionnaireSection = () => {
    if (!visitCard) {
      return (
        <div className="text-gray-500 text-[13px] mt-4">
          Үзлэгийн карт бөглөөгүй байна.
        </div>
      );
    }

    const isAdult = visitCard.type === "ADULT";

    // Build reason to visit bullet list
    const reasonBullets: string[] = [];
    const reasonToVisit = answers.reasonToVisit || {};
    
    Object.keys(REASON_TO_VISIT_LABELS).forEach((key) => {
      if (reasonToVisit[key]) {
        reasonBullets.push(REASON_TO_VISIT_LABELS[key]);
      }
    });
    
    if (hasText(reasonToVisit.other)) {
      reasonBullets.push(`Бусад: ${reasonToVisit.other}`);
    }

    // Previous dental visit
    const prevDental = answers.previousDentalVisit || {};

    // Collect all YES findings - pass isChild parameter
    const yesFindings = collectYesFindings(answers, !isAdult);

    return (
      <div className="mt-4">
        <div className="text-sm font-semibold mb-2 border-b border-gray-200 pb-1">
          УРЬДЧИЛАН СЭРГИЙЛЭХ АСУУМЖ
        </div>
        
        {/* Reason to visit - bullet format */}
        {reasonBullets.length > 0 && (
          <div className="text-xs mb-2">
            <div className="font-semibold mb-1">
              Таны эмнэлэгт хандах болсон шалтгаан юу вэ?
            </div>
            {reasonBullets.map((reason, idx) => (
              <div key={idx}>• {reason}</div>
            ))}
          </div>
        )}
        
        {/* Previous dental visit section - only show if hasVisited is yes */}
        {prevDental.hasVisited === "yes" && (
          <>
            <div className="text-xs mb-1">
              • Өмнө нь шүдний эмнэлэгт үзүүлж байсан: Тийм
            </div>
            {hasText(prevDental.clinicName) && (
              <div className="text-xs mb-1">
                • Өмнө үзүүлж байсан эмнэлгийн нэр: {prevDental.clinicName}
              </div>
            )}
          </>
        )}

        {/* Complication section - NOT nested under hasVisited */}
        {prevDental.hadComplication === "yes" && (
          <>
            <div className="text-xs mb-1">
              • Өмнө шүдний эмчилгээ хийхэд хүндрэл гарч байсан: Тийм
            </div>
            {hasText(prevDental.reactionOrComplication) && (
              <div className="text-xs mb-1">
                • Тайлбар: {prevDental.reactionOrComplication}
              </div>
            )}
          </>
        )}

        {/* Dentist attention notes - only if has text */}
        {hasText(answers.dentistAttentionNotes) && (
          <div className="text-xs mb-1">
            • Шүдний эмчилгээний үед эмчийн зүгээс анхаарах зүйлс: {answers.dentistAttentionNotes}
          </div>
        )}

        <div className="text-sm font-semibold mt-4 mb-2 border-b border-gray-200 pb-1">
          ЕРӨНХИЙ БИЕИЙН ТАЛААРХИ АСУУМЖ
        </div>
        <div className="text-xs">
          {yesFindings.length > 0 ? (
            yesFindings.map((finding, idx) => (
              <div key={idx}>
                • {finding.label}: Тийм
                {hasText(finding.detail) && ` - ${finding.detail}`}
              </div>
            ))
          ) : (
            <div className="text-gray-500">Мэдээлэл ороогүй байна.</div>
          )}
        </div>

        {answers.mainComplaint && (
          <div className="text-xs mt-3">
            <strong>Гол гомдол:</strong> {answers.mainComplaint}
          </div>
        )}
        {answers.pastHistory && (
          <div className="text-xs mt-1">
            <strong>Өмнөх түүх:</strong> {answers.pastHistory}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Print and filter controls (hide in print) */}
      <div className="no-print mb-4">
        {!isDoctor && (
        <div className="flex gap-3 mb-3">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-blue-600 text-white border-none rounded-md cursor-pointer font-medium"
          >
            🖨 Хэвлэх
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 bg-gray-500 text-white border-none rounded-md cursor-pointer"
          >
            {showFilters ? "Шүүлтүүр хаах" : "Шүүлтүүр нээх"}
          </button>
        </div>
        )}

        {showFilters && (
          <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
            <div className="text-sm font-semibold mb-2">
              Шүүлтүүр
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-500 block">
                  Эхлэх огноо:
                </label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="w-full px-[6px] py-1 rounded border border-gray-300"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block">
                  Дуусах огноо:
                </label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="w-full px-[6px] py-1 rounded border border-gray-300"
                />
              </div>
            </div>
            <div className="text-xs">
              <label className="block mb-1">
                <input
                  type="checkbox"
                  checked={showHeader}
                  onChange={(e) => setShowHeader(e.target.checked)}
                  className="mr-1.5"
                />
                Толгой хэсэг харуулах
              </label>
              <label className="block mb-1">
                <input
                  type="checkbox"
                  checked={showQuestionnaire}
                  onChange={(e) => setShowQuestionnaire(e.target.checked)}
                  className="mr-1.5"
                />
                Асуумж харуулах
              </label>
              <label className="block">
                <input
                  type="checkbox"
                  checked={showTable}
                  onChange={(e) => setShowTable(e.target.checked)}
                  className="mr-1.5"
                />
                Онош эмчилгээний хүснэгт харуулах
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Printable content */}
      <div
        id="patient-history-book-printable"
        className="printable-content bg-white p-6 rounded-lg border border-gray-200"
      >
        {showHeader && !isDoctor && (
          <>
            {/* Logo and header */}
<div className="grid [grid-template-columns:160px_1fr_160px] items-start gap-3 mb-4">
  {/* Left: logo + date (left aligned) */}
  <div>
    <img
      src="/clinic-logo.png"
      alt="Clinic Logo"
      onError={(e) => {
        // Fallback to placeholder if logo fails to load
        e.currentTarget.style.display = "none";
        const placeholder = document.createElement("div");
        placeholder.style.cssText =
          "width:100px;height:100px;background:#f3f4f6;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#6b7280;text-align:center;margin-bottom:6px;";
        placeholder.textContent = "CLINIC LOGO";
        e.currentTarget.parentElement?.insertBefore(placeholder, e.currentTarget);
      }}
      className="w-[100px] h-auto object-contain block mb-1.5"
    />

    <div className="text-xs text-left whitespace-nowrap">
      <strong>Огноо:</strong> {getCardFillDate()}
    </div>
  </div>

  {/* Middle: title centered */}
  <div className="text-center">
    <h1 className="text-lg font-bold m-0 mt-1.5">
      ҮЙЛЧЛҮҮЛЭГЧИЙН КАРТ
    </h1>
  </div>

  {/* Right: book number on far right */}
  <div className="text-xs text-right whitespace-nowrap">
    <strong>Дугаар:</strong> {patientBook.bookNumber}
  </div>
</div>

            {/* Patient information grid */}
            <div className="grid grid-cols-2 gap-2 text-xs mb-4 pb-4 border-b-2 border-gray-200">
              <div>
                <strong>Овог Нэр:</strong>{" "}
                {patient.ovog
                  ? `${patient.ovog} ${patient.name}`
                  : patient.name}
              </div>
              <div>
                <strong>Төрсөн огноо:</strong>{" "}
                {formatDate(patient.birthDate)}
              </div>
              <div>
                <strong>Регистрийн дугаар:</strong> {patient.regNo || "-"}
              </div>
              <div>
                <strong>Хүйс:</strong> {patient.gender || "-"}
              </div>
              <div>
                <strong>Нас:</strong> {calculateAge(patient.birthDate)}
              </div>
              <div>
                <strong>Утасны дугаар:</strong> {patient.phone || "-"}
              </div>
              <div>
                <strong>E-mail:</strong> {displayOrEmpty(patient.email)}
              </div>
              <div>
                <strong>Гэрийн хаяг:</strong> {displayOrEmpty(patient.address)}
              </div>
              <div className="col-span-2">
                <strong>Ажлын газар:</strong> {displayOrEmpty(patient.workPlace)}
              </div>
            </div>
          </>
        )}

        {/* Questionnaire sections */}
        {showQuestionnaire && renderQuestionnaireSection()}

        {/* Diagnosis/Treatment table */}
        {showTable && diagnosisRows.length > 0 && (
          <div className="mt-6">
            <div className="text-sm font-semibold mb-3 text-center">
              ЭМЧИЛГЭЭНИЙ БҮРТГЭЛ
            </div>
            <div className="overflow-x-auto max-w-full" style={{ WebkitOverflowScrolling: "touch" }}>
            <table className="w-full border-collapse text-[10px] border border-black min-w-[900px]">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-black p-[4px_6px] text-left font-semibold w-[8%]">
                    Огноо
                  </th>
                  <th className="border border-black p-[4px_6px] text-left font-semibold w-[8%]">
                    Шүдний дугаар
                  </th>
                  <th className="border border-black p-[4px_6px] text-left font-semibold w-[18%]">
                    Бодит үзлэг, зовиур
                  </th>
                  <th className="border border-black p-[4px_6px] text-left font-semibold w-[8%]">
                    Онош
                  </th>
                  <th className="border border-black p-[4px_6px] text-left font-semibold w-[20%]">
                    Эмчилгээ
                  </th>
                  <th
                    className={`border border-black p-[4px_6px] text-left font-semibold w-[12%] ${isDoctor ? "hidden md:table-cell" : ""}`}
                  >
                    Индикатор
                  </th>
                  <th
                    className={`border border-black p-[4px_6px] text-left font-semibold w-[14%] ${isDoctor ? "hidden md:table-cell" : ""}`}
                  >
                    Тэмдэглэл
                  </th>
                  <th className="border border-black p-[4px_6px] text-left font-semibold w-[12%]">
                    Эмч болон сувилагч
                  </th>
                </tr>
              </thead>
              <tbody>
                {diagnosisRows.map((row, idx) => (
                  <tr key={idx}>
                    <td className="border border-black p-[4px_6px] align-top">
                      {row.date}
                    </td>
                    <td className="border border-black p-[4px_6px] align-top">
                      {row.toothCode}
                    </td>
                    <td className="border border-black p-[4px_6px] align-top">
                      {row.complaints.map((c, i) => (
                        <div key={i}>{c}</div>
                      ))}
                      {row.complaints.length === 0 && "-"}
                    </td>
                    <td className="border border-black p-[4px_6px] align-top">
                      {row.diagnosis}
                    </td>
                    <td className="border border-black p-[4px_6px] align-top">
                      {row.treatment.map((t, i) => (
                        <div key={i}>{t}</div>
                      ))}
                      {row.treatment.length === 0 && "-"}
                    </td>
                    <td
                      className={`border border-black p-[4px_6px] align-top ${isDoctor ? "hidden md:table-cell" : ""}`}
                    >
                      {row.indicators.length > 0 ? row.indicators.join(", ") : "-"}
                    </td>
                    <td
                      className={`border border-black p-[4px_6px] align-top ${isDoctor ? "hidden md:table-cell" : ""}`}
                    >
                      {row.note || "-"}
                    </td>
                    <td className="border border-black p-[4px_6px] align-top">
                      {row.doctorNurse}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {showTable && diagnosisRows.length === 0 && (
          <div className="mt-6 text-gray-500 text-[13px] text-center">
            Онош эмчилгээний бүртгэл алга.
          </div>
        )}
      </div>

      {/* Print styles */}
     <style jsx global>{`
  @media print {
    /* Hide everything by default */
    body * {
      visibility: hidden !important;
    }

    /* Show only the printable content */
    #patient-history-book-printable,
    #patient-history-book-printable * {
      visibility: visible !important;
    }

    /* Position printable content at top-left of page */
    #patient-history-book-printable {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      border: none !important;
      padding: 0 !important;
      margin: 0 !important;
      background: white !important;
    }

    /* Existing rules */
    .no-print {
      display: none !important;
    }

    @page {
      size: A4;
      margin: 15mm;
    }

    body {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    table {
      page-break-inside: auto;
    }
    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    thead {
      display: table-header-group;
    }
    tfoot {
      display: table-footer-group;
    }
  }
`}</style>
    </div>
  );
};

export default PatientHistoryBook;
