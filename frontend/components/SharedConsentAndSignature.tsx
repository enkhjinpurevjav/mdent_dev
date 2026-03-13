import React, { useRef, useState } from "react";
import SignaturePad, { SignaturePadRef } from "./SignaturePad";

type Props = {
  sharedSignature: { filePath: string; signedAt: string } | null;
  sharedSignatureLoading: boolean;
  signatureSaving: boolean;
  consentAccepted: boolean;
  onConsentChange: (accepted: boolean) => void;
  onSaveSignature: (blob: Blob) => Promise<void>;
  formatDate: (iso?: string) => string;
};

export default function SharedConsentAndSignature({
  sharedSignature,
  sharedSignatureLoading,
  signatureSaving,
  consentAccepted,
  onConsentChange,
  onSaveSignature,
  formatDate,
}: Props) {
  const signaturePadRef = useRef<SignaturePadRef>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);

  const handleSaveSignature = async () => {
    if (!signaturePadRef.current) return;
    
    const blob = await signaturePadRef.current.getBlob();
    if (!blob) {
      alert("Гарын үсэг зураагүй байна.");
      return;
    }
    
    await onSaveSignature(blob);
    setShowSignaturePad(false);
  };

  const handleRedrawSignature = () => {
    setShowSignaturePad(true);
  };

  // If signature exists and we're not in draw mode, show it
  const hasExistingSignature = !sharedSignatureLoading && sharedSignature && !showSignaturePad;

  return (
    <div className="rounded-xl border border-gray-200 p-4 bg-white mt-4">
      {/* Consent Section */}
      <section className="pb-3 border-b border-dashed border-gray-200 text-[13px]">
        <label className="flex items-start gap-1.5">
          <input
            type="checkbox"
            checked={consentAccepted}
            onChange={(e) => onConsentChange(e.target.checked)}
          />
          <span>
            Урьдчилан сэргийлэх асуумжийг үнэн зөв бөглөж, эмчилгээний
            нөхцөлтэй танилцсан үйлчлүүлэгч/асран хамгаалагч.
          </span>
        </label>
      </section>

      {/* Signature Section */}
      <section className="mt-3">
        <div className="text-[13px] mb-2 font-medium">
          Гарын үсэг
        </div>

        {hasExistingSignature ? (
          <div>
            <div className="flex flex-col gap-1">
              <img
                src={sharedSignature.filePath}
                alt="Shared signature"
                className="max-w-[400px] rounded-lg border border-gray-300 bg-white"
              />
              {sharedSignature.signedAt && (
                <span className="text-[11px] text-gray-500">
                  Огноо: {formatDate(sharedSignature.signedAt)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleRedrawSignature}
              className="mt-2 px-3 py-1.5 rounded border border-gray-400 bg-gray-50 text-[13px] cursor-pointer"
            >
              Дахин гарын үсэг зурах
            </button>
          </div>
        ) : (
          <div>
            <SignaturePad ref={signaturePadRef} disabled={signatureSaving} />
            <div className="text-[11px] text-gray-500 mt-1 mb-2">
              Таблет, утас эсвэл хулгана ашиглан доор гарын үсэг зурна уу.
            </div>
            <button
              type="button"
              onClick={handleSaveSignature}
              disabled={signatureSaving}
              className={`px-3 py-1.5 rounded border-none text-white text-[13px] ${signatureSaving ? "bg-gray-400 cursor-default" : "bg-emerald-500 cursor-pointer"}`}
            >
              {signatureSaving ? "Хадгалж байна..." : "Гарын үсэг хадгалах"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
