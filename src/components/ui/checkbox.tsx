"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { CheckIcon, MinusIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // Task 5a.2: garmin.com g-checkbox (Forms.spec.md): 1.15em square, 2px #737373, radius 0; checked = black border + black check on white.
        "group/checkbox peer relative flex size-[1.15em] shrink-0 cursor-pointer items-center justify-center rounded-none border-2 border-garmin-checkbox bg-white text-black transition-colors outline-none focus-visible:border-black focus-visible:shadow-[0_0_0.5em_rgba(0,0,0,0.4)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-garmin-error data-checked:border-black data-indeterminate:border-black",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-[0.8em]"
      >
        <CheckIcon className="group-data-indeterminate/checkbox:hidden" />
        <MinusIcon className="hidden group-data-indeterminate/checkbox:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
