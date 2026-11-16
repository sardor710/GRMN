import "server-only";
import { z } from "zod";

export const phoneInput = z.string().regex(/^[+][1-9][0-9]{7,14}$/);
export const emailInput = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const nameInput = z.string().trim().min(1).max(200);
export const completeProfileInput = z.object({ name: nameInput, email: emailInput, phoneNumber: phoneInput }).strict();
export const bootstrapInput = z.object({ name: nameInput, email: emailInput, password: z.string().min(16).max(128) }).strict();
