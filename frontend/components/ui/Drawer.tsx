import React, { useEffect, useId } from "react";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export function Drawer({ open, onClose, title, children }: DrawerProps) {
  const titleId = useId();

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white p-5 shadow-xl max-h-[80vh] overflow-y-auto"
      >
        <div className="mb-4 flex items-center justify-between">
          {title && (
            <h3 id={titleId} className="text-base font-semibold text-gray-800">{title}</h3>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-md p-1 text-gray-400 hover:text-gray-600"
            aria-label="Хаах"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
