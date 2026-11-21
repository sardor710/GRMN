import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Small layout helpers shared by the editor tabs: a labelled field and a titled section.
export function Field({ label, htmlFor, hint, error, required, className, children }: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={htmlFor} className="mb-1 block text-[12px] font-bold text-black">
        {label}
        {required && <span className="text-[#c20f2f]" aria-hidden="true"> *</span>}
      </label>
      {children}
      {error ? <p className="mt-1 text-[12px] text-[#c20f2f]">{error}</p> : hint ? <p className="mt-1 text-[12px] text-[#666]">{hint}</p> : null}
    </div>
  );
}

export function Section({ title, description, actions, children, id }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="border-t border-[#e5e5e5] pt-6 first:border-t-0 first:pt-0">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 id={id} className="g-heading text-[20px] uppercase leading-tight tracking-[0.02em] text-black">{title}</h3>
          {description && <p className="mt-1 max-w-2xl text-[13px] text-[#666]">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
