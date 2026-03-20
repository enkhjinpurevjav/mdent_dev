// Type definitions for visit card

export type VisitCardType = "ADULT" | "CHILD";

export type VisitCard = {
  id: number;
  patientBookId: number;
  type: VisitCardType;
  answers: any;
  patientSignaturePath?: string | null;
  signedAt?: string | null;
  savedAt?: string | null;
  updatedBy?: { id: number; name: string | null; ovog: string | null } | null;
};

export type VisitCardAnswers = {
  // shared header
  date?: string;
  email?: string;
  phone?: string;
  workPlace?: string;
  address?: string;

  // adult/child-specific simple text fields
  previousClinicName?: string;
  previousTreatmentIssues?: string;
  dentistAttentionNotes?: string;

  // simple complaint fields we already use in JSX
  mainComplaint?: string;
  pastHistory?: string;

  // prevention reason (multi-choice)
  reasonToVisit?: {
    toothPain?: boolean;
    toothBroken?: boolean;
    toothDecay?: boolean;
    badBite?: boolean;
    preventiveCheck?: boolean;
    cosmeticSmile?: boolean;
    other?: string;
  };

  previousDentalVisit?: {
    hasVisited?: "yes" | "no";
    clinicName?: string;
    reactionOrComplication?: string;
    hadComplication?: "yes" | "no";
  };

  generalMedical?: {
    heartDisease?: "yes" | "no";
    highBloodPressure?: "yes" | "no";
    infectiousDisease?: "yes" | "no";
    tuberculosis?: "yes" | "no";
    hepatitisBC?: "yes" | "no";
    diabetes?: "yes" | "no";
    onMedication?: "yes" | "no";
    seriousIllnessOrSurgery?: "yes" | "no";
    implant?: "yes" | "no";
    generalAnesthesia?: "yes" | "no";
    chemoOrRadiation?: "yes" | "no";
    pregnant?: "yes" | "no";
    childAllergyFood?: "yes" | "no";
    details?: string;
  };

  allergies?: {
    drug?: "yes" | "no";
    drugDetail?: string;
    metal?: "yes" | "no";
    localAnesthetic?: "yes" | "no";
    latex?: "yes" | "no";
    other?: "yes" | "no";
    otherDetail?: string;
  };

  habits?: {
    smoking?: "yes" | "no";
    smokingDetail?: string;

    alcohol?: "yes" | "no";
    alcoholDetail?: string;

    coffee?: "yes" | "no";
    coffeeDetail?: string;

    nightGrinding?: "yes" | "no";
    nightGrindingDetail?: string;

    mouthBreathing?: "yes" | "no";
    mouthBreathingDetail?: string;

    other?: "yes" | "no";
    otherDetail?: string;
  };

  dentalFollowup?: {
    regularCheckups?: "yes" | "no";
    regularCheckupsDetail?: string;

    bleedingAfterExtraction?: "yes" | "no";
    bleedingAfterExtractionDetail?: string;

    gumBleeding?: "yes" | "no";
    gumBleedingDetail?: string;

    badBreath?: "yes" | "no";
    badBreathDetail?: string;
  };

  consentAccepted?: boolean; // adult (deprecated, use sharedConsentAccepted)
  childConsentAccepted?: boolean; // child (deprecated, use sharedConsentAccepted)
  sharedConsentAccepted?: boolean; // shared consent for both adult and child
  notes?: string;
};
