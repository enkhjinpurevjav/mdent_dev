// Type definitions for encounter admin page

export type Branch = {
  id: number;
  name: string;
};

export type Patient = {
  id: number;
  regNo?: string | null;
  ovog?: string | null;
  name: string;
  gender?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  address?: string | null;
  bloodType?: string | null;
  citizenship?: string | null;
  emergencyPhone?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  branchId: number;
  branch?: Branch | null;
};

export type AssignedTo = "DOCTOR" | "NURSE";

export type PatientBook = {
  id: number;
  bookNumber: string;
  patient: Patient;
};

export type Doctor = {
  id: number;
  email: string;
  name?: string | null;
  ovog?: string | null;
  signatureImagePath?: string | null;
};

export type Nurse = {
  id: number;
  email: string;
  name?: string | null;
  ovog?: string | null;
};

export type Diagnosis = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
};

export type DiagnosisProblem = {
  id: number;
  diagnosisId: number;
  label: string;
  order: number;
  active: boolean;
};

export type EncounterDiagnosisProblemText = {
  id: number;
  encounterDiagnosisId: number;
  text: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
};

export type EncounterDiagnosisRow = {
  id?: number;
  diagnosisId: number | null;
  diagnosis?: Diagnosis | null;
  selectedProblemIds: number[];
  note?: string;
  toothCode?: string | null;
  problemTexts?: EncounterDiagnosisProblemText[];
};

export type ServiceCategory =
  | "ORTHODONTIC_TREATMENT"
  | "IMAGING"
  | "DEFECT_CORRECTION"
  | "ADULT_TREATMENT"
  | "WHITENING"
  | "CHILD_TREATMENT"
  | "SURGERY"
  | "PREVIOUS";

export type ServiceBranch = {
  branchId: number;
  branch: Branch;
};

export type Service = {
  id: number;
  code?: string | null;
  category: ServiceCategory;
  name: string;
  price: number;
  isActive: boolean;
  description?: string | null;
  serviceBranches: ServiceBranch[];
};

export type EncounterServiceText = {
  id: number;
  encounterServiceId: number;
  text: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
};

export type EncounterService = {
  id?: number;
  encounterId: number;
  serviceId: number;
  service?: Service;
  quantity: number;
  price: number;

  // ✅ add diagnosisId so service<->diagnosis row mapping survives refresh
  meta?: {
    assignedTo?: AssignedTo;
    diagnosisId?: number | null;
    nurseId?: number | null;
    toothScope?: string;
  } | null;
  texts?: EncounterServiceText[];
};

export type PrescriptionItem = {
  id?: number;
  order: number;
  drugName: string;
  durationDays: number;
  quantityPerTake: number;
  frequencyPerDay: number;
  note?: string | null;
};

export type Prescription = {
  id: number;
  encounterId: number;
  createdAt: string;
  updatedAt: string;
  doctorNameSnapshot?: string | null;
  patientNameSnapshot?: string | null;
  diagnosisSummary?: string | null;
  clinicNameSnapshot?: string | null;
  items: PrescriptionItem[];
};

export type Encounter = {
  id: number;
  patientBookId: number;
  visitDate: string;
  notes?: string | null;
  doctorId: number;
  doctor: Doctor | null;
  nurseId?: number | null;
  nurse?: Nurse | null;
  appointmentId?: number | null;
  patientBook: PatientBook;
  encounterDiagnoses: EncounterDiagnosisRow[];
  encounterServices: EncounterService[];
  invoice?: any | null;
  prescription?: Prescription | null;
  // Shared consent signatures
  patientSignaturePath?: string | null;
  patientSignedAt?: string | null;
  doctorSignaturePath?: string | null;
  doctorSignedAt?: string | null;
};

export type EditableDiagnosis = EncounterDiagnosisRow & {
  localId: number;
  serviceId?: number;
  encounterServiceId?: number | null;
  searchText?: string;
  serviceSearchText?: string;
  locked?: boolean;
  // Sterilization indicators selection per diagnosis row (DEPRECATED - use draftAttachments)
  indicatorIds?: number[];
  indicatorSearchText?: string;
  // NEW: Tool-line based draft attachments
  draftAttachments?: SterilizationDraftAttachment[];
  toolLineSearchText?: string;
  // NEW: Local tool line selections (allows duplicates, stored before save)
  selectedToolLineIds?: number[];
  assignedTo?: AssignedTo;
  nurseId?: number | null;
  // Dirty tracking: true if user has explicitly modified indicators
  indicatorsDirty?: boolean;
  // Draft text arrays for local editing before save
  draftProblemTexts?: string[];
  draftServiceTexts?: string[];
};

export type SterilizationDraftAttachment = {
  id: number;
  encounterDiagnosisId: number;
  cycleId: number;
  toolId: number;
  toolLineId?: number | null; // NEW: Added for round-trip persistence
  requestedQty: number;
  createdAt: string;
  cycle: {
    id: number;
    code: string;
  };
  tool: {
    id: number;
    name: string;
  };
};

export type ToolLineSearchResult = {
  toolLineId: number;
  cycleId: number;
  cycleCode: string;
  toolId: number;
  toolName: string;
  remaining: number;
};

export type ActiveIndicator = {
  id: number;
  packageName: string;
  code: string;
  current: number;
  produced: number;
  used: number;
  indicatorDate: string;
};

export type EditablePrescriptionItem = {
  localId: number;
  drugName: string;
  durationDays: number | null;
  quantityPerTake: number | null;
  frequencyPerDay: number | null;
  note?: string;
};

export type ChartToothRow = {
  id?: number;
  toothCode: string;
  toothGroup?: string | null;
  status?: string | null;
  notes?: string | null;
};

export type EncounterMediaType = "XRAY" | "PHOTO" | "DOCUMENT";

export type ConsentType = "root_canal" | "surgery" | "orthodontic" | "prosthodontic";

export type SurgeryConsentAnswers = {
  surgeryMode?: "SURGERY" | "PROCEDURE";
  name?: string;
  outcome?: string;
  risks?: string;
  complications?: string;
  additionalProcedures?: string;
  alternativeTreatments?: string;
  advantages?: string;
  anesthesiaGeneral?: boolean;
  anesthesiaSpinal?: boolean;
  anesthesiaLocal?: boolean;
  anesthesiaSedation?: boolean;
  patientQuestions?: string;
  questionSummary?: string;
  doctorPhone?: string;
  doctorExplained?: boolean;
  patientConsentMain?: boolean;
  patientConsentInfo?: boolean;
  patientSignatureName?: string;
  guardianName?: string;
  guardianRelationDescription?: string;
  incapacityReason?: {
    minor?: boolean;
    unconscious?: boolean;
    mentalDisorder?: boolean;
    other?: boolean;
    otherText?: string;
  };
  husbandConsent?: boolean;
  husbandName?: string;
  husbandRefuseReason?: string;
};

export type EncounterConsent = {
  encounterId: number;
  type: ConsentType;
  answers: any;
  createdAt?: string;
  updatedAt?: string;
};

export type EncounterMedia = {
  id: number;
  encounterId: number;
  filePath: string;
  toothCode?: string | null;
  type: EncounterMediaType;
  createdAt?: string;
};

export type VisitCardType = "ADULT" | "CHILD";

export type VisitCardAnswers = {
  generalMedical?: Record<string, any>;
  allergies?: Record<string, any>;
  habits?: Record<string, any>;
  dentalFollowup?: Record<string, any>;
  [key: string]: any;
};

export type VisitCard = {
  id: number;
  patientBookId: number;
  type: VisitCardType;
  answers: VisitCardAnswers;
};

export type WarningLine = { label: string; value: string };
