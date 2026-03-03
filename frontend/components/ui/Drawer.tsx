import React, { useEffect, useId } from "react";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  side?: "bottom" | "left";
};

export function Drawer({ open, onClose, title, children, side = "bottom" }: DrawerProps) {
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

  // Body scroll lock: only runs when open=true, always restores on cleanup
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  if (side === "left") {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={onClose}
          aria-hidden="true"
        />
        {/* Left drawer panel */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          className="fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-xl overflow-y-auto flex flex-col"
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
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
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Bottom drawer panel */}
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
