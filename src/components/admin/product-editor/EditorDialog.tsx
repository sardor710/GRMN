"use client";

import { useEffect, useId } from "react";
import { X } from "lucide-react";

interface EditorDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}

/**
 * A dialog that stacks above the product editor's AdminModal. Escape is captured here so it closes
 * only this dialog and never the editor underneath (which would discard unsaved form state).
 */
export function EditorDialog({ open, onClose, title, subtitle, children, footer, wide }: EditorDialogProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="presentation">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden border border-neutral-300 bg-white font-sans shadow-2xl rounded-none ${
          wide ? "max-w-6xl" : "max-w-2xl"
        }`}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <div>
            <h3 id={titleId} className="g-heading uppercase tracking-wider text-[18px] text-black font-normal">
              {title}
            </h3>
            {subtitle && <p className="mt-0.5 text-[12px] text-neutral-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-black rounded-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 text-black">{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 border-t border-neutral-200 px-6 py-3">{footer}</div>}
      </div>
    </div>
  );
}
