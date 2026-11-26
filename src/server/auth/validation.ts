import "server-only";
import { z } from "zod";

export const phoneInput = z.string().regex(/^[+][1-9][0-9]{7,14}$/);
export const emailInput = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const nameInput = z.string().trim().min(1).max(200);
export const completeProfileInput = z.object({ name: nameInput, email: emailInput, phoneNumber: phoneInput }).strict();
/** Owner 2026-11-26: optional sign-up/profile gender. */
export const GENDERS = ["male", "female", "unspecified"] as const;
export const genderInput = z.enum(GENDERS);
/** ISO date, 10 to 120 years ago (same rule as Profile). */
export const birthDateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  const years = (n: number) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - n); return d.toISOString().slice(0, 10); };
  return value <= years(10) && value >= years(120);
}, "Birthday must be 10 to 120 years ago");
/** Owner 2026-11-26: one-page sign-up. The phone code is always checked (the fixed test code included). */
export const signUpInput = z.object({
  name: nameInput, email: emailInput, phoneNumber: phoneInput,
  challengeId: z.uuid(), code: z.string().regex(/^[0-9]{4,6}$/),
  gender: genderInput.nullable().optional(), birthDate: birthDateInput.nullable().optional(),
}).strict();
export const bootstrapInput = z.object({ name: nameInput, email: emailInput, password: z.string().min(16).max(128) }).strict();
