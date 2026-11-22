// The ONE switch for the admin control shape (plan item 14). Owner chose option A on 2026-11-22.
//   "square" = option A, garmin.com's real controls: 0 radius buttons/selects (docs/research/www.garmin.com/CONTROLS.md)
//   "pill"   = option B, fully rounded buttons and dropdowns
// Badges are square in the admin since 2026-11-22 (owner choice A); StatusBadge hard-codes rounded-none.
export type AdminControlShape = "square" | "pill";

export const ADMIN_CONTROL_SHAPE: AdminControlShape = "square";

const RADIUS: Record<AdminControlShape, string> = { square: "rounded-none", pill: "rounded-full" };
/** Inline padding is a little larger on pills so the text does not touch the curve. */
const PILL_PAD: Record<AdminControlShape, string> = { square: "", pill: "px-5" };

/** Radius class for buttons, selects and inputs. */
export const controlRadius = RADIUS[ADMIN_CONTROL_SHAPE];
/** Extra horizontal padding when the shape is a pill. */
export const controlPillPadding = PILL_PAD[ADMIN_CONTROL_SHAPE];
