import type { ButtonHTMLAttributes, Ref } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlPillPadding, controlRadius } from "./shape";

// Admin button built from garmin.com `.g__button` (docs/research/www.garmin.com/CONTROLS.md):
// Roboto 500 uppercase, 1px border, background/border/color transition .2s, disabled = #D9D9D9 fill.
// Garmin has no :focus-visible ring; we add a 2px black outline for keyboard users.
export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

const base =
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap border font-sans font-medium uppercase tracking-[0.04em] transition-[background-color,border-color,color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed aria-disabled:cursor-not-allowed";

const variants: Record<ButtonVariant, string> = {
  // contained--black: solid black CTA, hover #333
  primary:
    "border-black bg-black text-white hover:border-[#333] hover:bg-[#333] disabled:border-[#d9d9d9] disabled:bg-[#d9d9d9] disabled:text-black",
  // contained--light: white with a black border, inverts on hover
  secondary:
    "border-black bg-white text-black hover:bg-black hover:text-white disabled:border-[#d9d9d9] disabled:bg-[#d9d9d9] disabled:text-black disabled:hover:text-black",
  // dense toolbar control: the select's #D9D9D9 line, black on hover
  outline:
    "border-[#d9d9d9] bg-white text-black hover:border-black disabled:bg-[#f2f2f2] disabled:text-[#808080] disabled:hover:border-[#d9d9d9]",
  // flat: text only, underline on hover
  ghost: "border-transparent bg-transparent text-black hover:underline disabled:text-[#808080] disabled:no-underline",
  danger:
    "border-[#c20f2f] bg-[#c20f2f] text-white hover:border-[#9a0c25] hover:bg-[#9a0c25] disabled:border-[#d9d9d9] disabled:bg-[#d9d9d9] disabled:text-black",
  // flat--secondary: blue link button
  link: "border-transparent bg-transparent normal-case tracking-normal text-[#106fad] hover:text-[#0d5a8c] hover:underline disabled:text-[#808080]",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[12px]",
  md: "h-10 px-5 text-[13px]",
  lg: "h-12 px-8 text-[14px]",
  icon: "h-10 w-10 p-0",
  "icon-sm": "h-8 w-8 p-0",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets aria-busy and blocks clicks. */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/** Class string for elements that must look like a button but are not one (e.g. a Link). */
export function buttonClass({ variant = "outline", size = "md", className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  const flat = variant === "ghost" || variant === "link";
  return cn(base, controlRadius, variants[variant], sizes[size], flat && size !== "icon" && size !== "icon-sm" ? "px-1" : !size.startsWith("icon") && controlPillPadding, className);
}

export function Button({ variant = "outline", size = "md", loading = false, className, children, disabled, type = "button", ref, ...props }: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, className })}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
