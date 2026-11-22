import type { Ref } from "react";
import { cn } from "@/lib/utils";
import { Select, type SelectSize } from "./Select";
import { statusLabel, toneDot, toneForStatus } from "./StatusBadge";

// A status dropdown: the Garmin select (shape from ./shape) with the status colour shown as a dot,
// so the current state reads at a glance and changing it is still a plain native <select>.
export interface StatusSelectProps {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  size?: SelectSize;
  disabled?: boolean;
  id?: string;
  name?: string;
  "aria-label"?: string;
  /** Optional custom labels (status key → text). */
  labels?: Partial<Record<string, string>>;
  wrapperClassName?: string;
  ref?: Ref<HTMLSelectElement>;
}

export function StatusSelect({ value, options, onChange, size = "md", labels, wrapperClassName, ref, ...rest }: StatusSelectProps) {
  const list = options.includes(value) || !value ? options : [value, ...options];
  return (
    <div className={cn("relative", wrapperClassName)}>
      <span
        aria-hidden="true"
        data-status-dot
        className={cn("pointer-events-none absolute top-1/2 z-10 h-2 w-2 -translate-y-1/2 rounded-none", size === "sm" ? "left-2.5" : "left-3", toneDot[toneForStatus(value)])}
      />
      <Select ref={ref} size={size} value={value} onChange={(event) => onChange(event.target.value)} className={size === "sm" ? "pl-6" : "pl-7"} {...rest}>
        {list.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? statusLabel(option)}
          </option>
        ))}
      </Select>
    </div>
  );
}
