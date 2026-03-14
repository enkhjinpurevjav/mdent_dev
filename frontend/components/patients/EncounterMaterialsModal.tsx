import React from "react";
import BillingMaterialsView from "../billing/BillingMaterialsView";

type Props = {
  open: boolean;
  onClose: () => void;
  encounterId: number | null;
};

export default function EncounterMaterialsModal({ open, onClose, encounterId }: Props) {
  if (!open || encounterId == null) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1100] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-full max-w-[800px] max-h-[90vh] overflow-auto shadow-[0_4px_24px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
          <h2 className="m-0 text-[17px] font-semibold">
            Хавсралтууд
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="bg-transparent border-none text-[22px] cursor-pointer text-gray-500 leading-none"
            aria-label="Хаах"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <BillingMaterialsView encounterId={encounterId} />
        </div>
      </div>
    </div>
  );
}
