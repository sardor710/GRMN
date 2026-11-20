"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"

import { cn } from "@/lib/utils"

/**
 * Task 5a.2: the one button system (garmin.com `.g__button`, docs/research/www.garmin.com/components/Buttons.spec.md).
 * The styles live in `.g-btn*` (src/app/globals.css) so plain <a>/<button>/<Link> elements and CSS modules can use
 * them too; this file is the typed entry point.
 *
 * variant: primary (candy-blue buy CTA) | black | secondary (white, black border) | dark | on-image | text | text-link | text-dark
 * size:    lg (16px, 52px tall) | md (14px, 34px, default) | sm (12px, 26px). Text variants ignore size.
 */
export type ButtonVariant = "primary" | "black" | "secondary" | "dark" | "on-image" | "text" | "text-link" | "text-dark"
export type ButtonSize = "lg" | "md" | "sm"

export function buttonVariants({ variant = "black", size = "md", className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn("g-btn", `g-btn--${variant}`, size === "lg" && "g-btn--lg", size === "sm" && "g-btn--sm", className)
}

function Button({
  className,
  variant = "black",
  size = "md",
  ...props
}: ButtonPrimitive.Props & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={buttonVariants({ variant, size, className: typeof className === "string" ? className : undefined })}
      {...props}
    />
  )
}

export { Button }
