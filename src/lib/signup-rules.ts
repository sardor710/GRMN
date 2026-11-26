// Owner 2026-11-26: the one-page sign-up's field rules (shared by SignUpForm and its tests).
import type { CustomerGender } from "../contracts/commerce.ts";

const E164 = /^[+][1-9][0-9]{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanPhone = (value: string) => value.replace(/[\s().-]/g, "");
const yearsAgoISO = (years: number) => { const date = new Date(); date.setUTCFullYear(date.getUTCFullYear() - years); return date.toISOString().slice(0, 10); };

export type SignUpField = "name" | "phone" | "code" | "email" | "birthDate";
export interface SignUpValues { name: string; phone: string; code: string; email: string; gender: CustomerGender | ""; birthDate: string }

/** Field problems in form order (message keys under AccountPortal.signUpPage.errors). */
export function signUpProblems(values: SignUpValues, codeSent: boolean): Partial<Record<SignUpField, string>> {
  const problems: Partial<Record<SignUpField, string>> = {};
  if (!values.name.trim()) problems.name = "name";
  if (!E164.test(cleanPhone(values.phone))) problems.phone = "phone";
  if (!codeSent) problems.code = "codeFirst";
  else if (!/^[0-9]{4,6}$/.test(values.code.trim())) problems.code = "code";
  if (!EMAIL.test(values.email.trim())) problems.email = "email";
  if (values.birthDate && (values.birthDate > yearsAgoISO(10) || values.birthDate < yearsAgoISO(120))) problems.birthDate = "birthDate";
  return problems;
}
