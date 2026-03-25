// Hook for visit card loading/saving/signature logic

import { useEffect, useState } from 'react';
import type { VisitCard, VisitCardType, VisitCardAnswers } from '../types/visitCard';
import type { ActiveTab } from '../types/patients';

interface UseVisitCardProps {
  bookNumber: string | string[] | undefined;
  activeTab: ActiveTab;
  patientBookId: number | null;
}

export function useVisitCard({ bookNumber, activeTab, patientBookId }: UseVisitCardProps) {
  const [visitCard, setVisitCard] = useState<VisitCard | null>(null);
  const [visitCards, setVisitCards] = useState<VisitCard[]>([]);
  const [visitCardLoading, setVisitCardLoading] = useState(false);
  const [visitCardError, setVisitCardError] = useState("");
  const [visitCardTypeDraft, setVisitCardTypeDraft] = useState<VisitCardType | null>("ADULT");
  const [visitCardAnswers, setVisitCardAnswers] = useState<VisitCardAnswers>({});
  const [visitCardSaving, setVisitCardSaving] = useState(false);
  const [visitCardSavedAt, setVisitCardSavedAt] = useState(0);
  const [signatureSaving, setSignatureSaving] = useState(false);
  
  // Shared signature state
  const [sharedSignature, setSharedSignature] = useState<{ filePath: string; signedAt: string } | null>(null);
  const [sharedSignatureLoading, setSharedSignatureLoading] = useState(false);

  // Load visit card only when visit_card tab is active
  useEffect(() => {
    if (!bookNumber || typeof bookNumber !== "string") return;
    if (activeTab !== "visit_card") return;

    const loadVisitCard = async () => {
      setVisitCardLoading(true);
      setVisitCardError("");
      try {
        const res = await fetch(
          `/api/patients/visit-card/by-book/${encodeURIComponent(bookNumber)}`
        );
        const json = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(
            (json && json.error) || "Үзлэгийн карт ачаалахад алдаа гарлаа."
          );
        }

        const card: VisitCard | null = json.visitCard || null;
        const cards: VisitCard[] = json.visitCards || [];
        
        setVisitCard(card);
        setVisitCards(cards);
        
        if (card) {
          setVisitCardTypeDraft(card.type);
          setVisitCardAnswers(card.answers || {});
        } else {
          setVisitCardTypeDraft("ADULT");
          setVisitCardAnswers({});
        }
      } catch (err: any) {
        console.error("loadVisitCard failed", err);
        setVisitCardError(
          err?.message || "Үзлэгийн карт ачаалахад алдаа гарлаа."
        );
        setVisitCard(null);
        setVisitCards([]);
      } finally {
        setVisitCardLoading(false);
      }
    };

    void loadVisitCard();
  }, [bookNumber, activeTab]);

  // Load shared signature when visit_card tab is active
  useEffect(() => {
    if (!patientBookId) return;
    if (activeTab !== "visit_card") return;

    const loadSharedSignature = async () => {
      setSharedSignatureLoading(true);
      try {
        const res = await fetch(
          `/api/patients/visit-card/${patientBookId}/shared-signature`
        );
        if (res.ok) {
          const json = await res.json();
          setSharedSignature(json);
        } else {
          setSharedSignature(null);
        }
      } catch (err) {
        console.error("loadSharedSignature failed", err);
        setSharedSignature(null);
      } finally {
        setSharedSignatureLoading(false);
      }
    };

    void loadSharedSignature();
  }, [patientBookId, activeTab]);

  const handleTypeChange = (newType: VisitCardType) => {
    setVisitCardTypeDraft(newType);
    
    const existingCard = visitCards.find(c => c.type === newType);
    
    if (existingCard) {
      setVisitCardAnswers(existingCard.answers || {});
      setVisitCard(existingCard);
    } else {
      setVisitCardAnswers({});
      setVisitCard(null);
    }
  };

  const updateVisitCardAnswer = (
    key: keyof VisitCardAnswers,
    value: VisitCardAnswers[typeof key]
  ) => {
    setVisitCardAnswers((prev: VisitCardAnswers) => ({
      ...(prev || {}),
      [key]: value,
    }));
  };

  const updateNested = (
    section: keyof VisitCardAnswers,
    field: string,
    value: any
  ) => {
    setVisitCardAnswers((prev: VisitCardAnswers) => ({
      ...(prev || {}),
      [section]: {
        ...(prev?.[section] as any),
        [field]: value,
      },
    }));
  };

  // Normalize answers to ensure all fields have default values
  const normalizeAnswers = (answers: VisitCardAnswers): VisitCardAnswers => {
    const normalized = { ...answers };
    
    // Ensure each section exists with at least an empty object
    if (!normalized.generalMedical) normalized.generalMedical = {};
    if (!normalized.allergies) normalized.allergies = {};
    if (!normalized.habits) normalized.habits = {};
    if (!normalized.dentalFollowup) normalized.dentalFollowup = {};
    
    return normalized;
  };

  const handleClearVisitCard = async () => {
    if (!patientBookId) {
      setVisitCardError("PatientBook ID олдсонгүй.");
      return;
    }

    const type = visitCardTypeDraft;
    if (!type) {
      setVisitCardError("Картын төрлийг сонгоно уу.");
      return;
    }

    setVisitCardSaving(true);
    setVisitCardError("");
    try {
      const res = await fetch(
        `/api/patients/visit-card/${patientBookId}?type=${encodeURIComponent(type)}`,
        { method: "DELETE" }
      );

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (json && json.error) || "Үзлэгийн карт устгахад алдаа гарлаа."
        );
      }

      // Remove the deleted card from local state and reset answers
      setVisitCards((prev) => prev.filter((c) => c.type !== type));
      setVisitCard(null);
      setVisitCardAnswers({});
    } catch (err: any) {
      console.error("clear visit card failed", err);
      setVisitCardError(
        err?.message || "Үзлэгийн карт устгахад алдаа гарлаа."
      );
    } finally {
      setVisitCardSaving(false);
    }
  };

  const handleSaveVisitCard = async () => {
    if (!patientBookId) {
      setVisitCardError("PatientBook ID олдсонгүй.");
      return;
    }

    const type = visitCardTypeDraft;
    if (!type) {
      setVisitCardError(
        "Эхлээд картын төрлийг сонгоно уу (том хүн / хүүхэд)."
      );
      return;
    }

    setVisitCardSaving(true);
    setVisitCardError("");
    try {
      // Normalize answers before sending to ensure non-empty structure
      const normalizedAnswers = normalizeAnswers(visitCardAnswers);
      
      const res = await fetch(`/api/patients/visit-card/${patientBookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          answers: normalizedAnswers,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (json && json.error) || "Үзлэгийн карт хадгалахад алдаа гарлаа."
        );
      }

      const card: VisitCard = json.visitCard;
      
      setVisitCards((prev) => {
        const filtered = prev.filter(c => c.type !== card.type);
        return [...filtered, card];
      });
      
      setVisitCard(card);
      setVisitCardTypeDraft(card.type);
      setVisitCardAnswers(card.answers || {});
      setVisitCardSavedAt(Date.now());
    } catch (err: any) {
      console.error("save visit card failed", err);
      setVisitCardError(
        err?.message || "Үзлэгийн карт хадгалахад алдаа гарлаа."
      );
    } finally {
      setVisitCardSaving(false);
    }
  };

  const handleUploadSignature = async (blob: Blob) => {
    if (!patientBookId) {
      setVisitCardError("PatientBook ID олдсонгүй.");
      return;
    }
    
    const currentType = visitCardTypeDraft;
    if (!currentType) {
      setVisitCardError("Картын төрлийг сонгоно уу.");
      return;
    }
    
    setSignatureSaving(true);
    setVisitCardError("");
    try {
      const formData = new FormData();
      formData.append("file", blob, "signature.png");
      formData.append("type", currentType);

      const res = await fetch(
        `/api/patients/visit-card/${patientBookId}/signature`,
        {
          method: "POST",
          body: formData,
        }
      );

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (json && json.error) || "Гарын үсэг хадгалахад алдаа гарлаа."
        );
      }

      const existingCard = visitCards.find(c => c.type === json.type);
      const updatedCard = {
        ...(existingCard || visitCard || {}),
        patientSignaturePath: json.patientSignaturePath,
        signedAt: json.signedAt,
        type: json.type,
      } as VisitCard;
      
      setVisitCard(updatedCard);
      
      setVisitCards((prev) => {
        const filtered = prev.filter(c => c.type !== json.type);
        return [...filtered, updatedCard];
      });
    } catch (err: any) {
      console.error("upload signature failed", err);
      setVisitCardError(
        err?.message || "Гарын үсэг хадгалахад алдаа гарлаа."
      );
    } finally {
      setSignatureSaving(false);
    }
  };

  const handleUploadSharedSignature = async (blob: Blob) => {
    if (!patientBookId) {
      setVisitCardError("PatientBook ID олдсонгүй.");
      return;
    }
    
    setSignatureSaving(true);
    setVisitCardError("");
    try {
      const formData = new FormData();
      formData.append("file", blob, "signature.png");

      const res = await fetch(
        `/api/patients/visit-card/${patientBookId}/shared-signature`,
        {
          method: "POST",
          body: formData,
        }
      );

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (json && json.error) || "Гарын үсэг хадгалахад алдаа гарлаа."
        );
      }

      setSharedSignature({
        filePath: json.filePath,
        signedAt: json.signedAt,
      });
    } catch (err: any) {
      console.error("upload shared signature failed", err);
      setVisitCardError(
        err?.message || "Гарын үсэг хадгалахад алдаа гарлаа."
      );
    } finally {
      setSignatureSaving(false);
    }
  };

  return {
    visitCard,
    visitCards,
    visitCardLoading,
    visitCardError,
    visitCardTypeDraft,
    visitCardAnswers,
    visitCardSaving,
    visitCardSavedAt,
    signatureSaving,
    sharedSignature,
    sharedSignatureLoading,
    handleTypeChange,
    updateVisitCardAnswer,
    updateNested,
    handleSaveVisitCard,
    handleClearVisitCard,
    handleUploadSignature,
    handleUploadSharedSignature,
    setVisitCardTypeDraft,
  };
}
