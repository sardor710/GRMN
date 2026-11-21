import type { Ref, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { controlRadius } from "./shape";

// Native select styled like garmin.com's sort dropdown (`g-drop-down`): 1px #D9D9D9 border, white,
// appearance:none, Garmin chevron 12px at inset-inline-end 1rem, focus border #000, disabled opacity .5,
// error border #920000. Sizes are denser than garmin.com's 48px for admin tables.
export type SelectSize = "sm" | "md" | "lg";

const sizes: Record<SelectSize, string> = {
  sm: "h-8 pl-2.5 pr-8 text-[12px]",
  md: "h-10 pl-3 pr-10 text-[13px]",
  lg: "h-12 pl-3.5 pr-12 text-[16px]",
};
const chevronPos: Record<SelectSize, string> = { sm: "right-2.5 h-2.5 w-2.5", md: "right-3.5 h-3 w-3", lg: "right-4 h-3 w-3" };

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: SelectSize;
  invalid?: boolean;
  /** Classes for the wrapper (width, margins). `className` goes to the <select>. */
  wrapperClassName?: string;
  ref?: Ref<HTMLSelectElement>;
}

export function GarminChevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18.2 11.2" aria-hidden="true" focusable="false" className={className}>
      <path fill="currentColor" d="M9.1 11.2L0 2.2 2.2 0l6.9 7L16 0l2.2 2.2-9.1 9z" />
    </svg>
  );
}

export function Select({ size = "md", invalid = false, className, wrapperClassName, children, ref, ...props }: SelectProps) {
  return (
    <div className={cn("relative flex items-center", props.disabled && "opacity-50", wrapperClassName)}>
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "w-full min-w-0 cursor-pointer appearance-none truncate border bg-white font-sans leading-[1.15] text-black outline-none transition-colors focus:border-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed",
          invalid ? "border-[#920000]" : "border-[#d9d9d9] hover:border-[#737373]",
          controlRadius,
          sizes[size],
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <GarminChevron className={cn("pointer-events-none absolute text-black", chevronPos[size])} />
    </div>
  );
}
