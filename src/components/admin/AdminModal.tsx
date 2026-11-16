"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
}

const maxWidthClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
};

export function AdminModal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = "lg",
}: AdminModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Dialog container */}
      <div
        className={`relative z-10 w-full ${maxWidthClasses[maxWidth]} max-h-[90vh] flex flex-col border border-neutral-300 bg-white shadow-2xl overflow-hidden font-sans rounded-none`}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 bg-white">
          <div>
            <h3 className="g-heading uppercase tracking-wider text-[18px] text-black font-normal">{title}</h3>
            {subtitle && <p className="text-[12px] text-neutral-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-black rounded-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-white text-black">
          {children}
        </div>
      </div>
    </div>
  );
}
