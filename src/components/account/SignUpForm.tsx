"use client";

// Owner 2026-11-26 (plan docs/plans/2026-11-26-signup-orders-pickup-devices-xl.md, D1): one-page sign-up. Every field is
// on the page at once: full name, phone with "Send code" beside it, the SMS code, email, and optional gender and
// birthday. The server checks the code (the fixed code while SMS is not connected) and creates the account in one step.
// Delivery addresses are added later in Profile.
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import type { CustomerGender } from "@/contracts/commerce";
import { AccountRequestError, announceSessionChange, createAccountClient, type AuthMode } from "@/lib/account-client";

const E164 = /^[+][1-9][0-9]{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;
const cleanPhone = (value: string) => value.replace(/[\s().-]/g, "");
const yearsAgoISO = (years: number) => { const date = new Date(); date.setUTCFullYear(date.getUTCFullYear() - years); return date.toISOString().slice(0, 10); };
const GENDERS: readonly CustomerGender[] = ["male", "female", "unspecified"];

type Field = "name" | "phone" | "code" | "email" | "birthDate";
export interface SignUpValues { name: string; phone: string; code: string; email: string; gender: CustomerGender | ""; birthDate: string }

/** Field problems in form order (message keys under AccountPortal.signUpPage.errors). Pure, shared with the tests. */
export function signUpProblems(values: SignUpValues, codeSent: boolean): Partial<Record<Field, string>> {
  const problems: Partial<Record<Field, string>> = {};
  if (!values.name.trim()) problems.name = "name";
  if (!E164.test(cleanPhone(values.phone))) problems.phone = "phone";
  if (!codeSent) problems.code = "codeFirst";
  else if (!/^[0-9]{4,6}$/.test(values.code.trim())) problems.code = "code";
  if (!EMAIL.test(values.email.trim())) problems.email = "email";
  if (values.birthDate && (values.birthDate > yearsAgoISO(10) || values.birthDate < yearsAgoISO(120))) problems.birthDate = "birthDate";
  return problems;
}

export function SignUpForm() {
  const t = useTranslations("AccountPortal");
  const router = useRouter();
  const client = useMemo(() => createAccountClient((url, init) => fetch(url, init)), []);
  const [values, setValues] = useState<SignUpValues>({ name: "", phone: "", code: "", email: "", gender: "", birthDate: "" });
  const [mode, setMode] = useState<AuthMode | null>(null);
  const [challenge, setChallenge] = useState<{ id: string; phone: string } | null>(null);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState<"send" | "create" | null>(null);
  const [problems, setProblems] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { client.authMode().then(setMode, () => setMode({ testCode: false, signUp: false })); }, [client]);
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(seconds => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const set = (field: keyof SignUpValues) => (value: string) => {
    setValues(current => ({ ...current, [field]: value }));
    setProblems(current => { const rest = { ...current }; delete rest[field as Field]; return rest; });
    // A different phone needs a new code.
    if (field === "phone" && challenge && cleanPhone(value) !== challenge.phone) { setChallenge(null); setWait(0); }
  };
  const message = (reason: unknown) => reason instanceof Error && reason.message ? reason.message : t("genericError");

  async function sendCode() {
    const phone = cleanPhone(values.phone);
    if (!E164.test(phone)) { setProblems(current => ({ ...current, phone: "phone" })); return; }
    setBusy("send"); setError(null);
    try {
      const result = await client.sendCode(phone, "sign_in");
      setChallenge({ id: result.challengeId, phone }); setWait(RESEND_SECONDS);
      setProblems(current => { const rest = { ...current }; delete rest.code; return rest; });
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(null); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const found = signUpProblems(values, challenge !== null);
    setProblems(found);
    if (Object.keys(found).length || !challenge) return;
    setBusy("create"); setError(null);
    try {
      await client.signUp({ name: values.name.trim(), email: values.email.trim(), phoneNumber: challenge.phone, challengeId: challenge.id, code: values.code.trim(),
        ...(values.gender ? { gender: values.gender } : {}), ...(values.birthDate ? { birthDate: values.birthDate } : {}) });
      announceSessionChange();
      router.push("/account");
    } catch (reason) {
      setError(message(reason));
      // A refused or expired code is spent: ask for a new one.
      if (reason instanceof AccountRequestError && reason.status === 401) { setChallenge(null); setWait(0); set("code")(""); }
    } finally { setBusy(null); }
  }

  const unavailable = mode !== null && !mode.signUp;
  const invalid = (field: Field) => Boolean(problems[field]);
  const hint = (field: Field) => problems[field] ? <p id={`signup-${field}-error`} className="mt-1 text-[13px] text-garmin-error">{t(`signUpPage.errors.${problems[field]}`)}</p> : null;
  const describedBy = (field: Field) => problems[field] ? `signup-${field}-error` : undefined;
  const inputClass = (field: Field) => `g-input mb-0 ${invalid(field) ? "border-garmin-error" : ""}`;

  return (
    <div className="mx-auto max-w-[480px] px-4 py-12 font-sans">
      <div className="border border-[#e5e5e5] bg-white p-6 sm:p-8">
        <h1 className="g-heading m-0 text-[24px] font-semibold leading-tight text-black">{t("signUp.title")}</h1>
        <p className="mt-2 text-[14px] leading-[21px] text-neutral-600">{t("signUpPage.intro")}</p>
        {mode?.testCode && <p data-fixed-code className="mt-4 border border-[#e5e5e5] bg-[#f7f7f7] p-3 text-[13px] text-black">{mode.code ? t("auth.testModeCode", { code: mode.code }) : t("auth.testMode")}</p>}
        {unavailable ? (
          <p role="status" className="mt-6 border border-[#e5e5e5] bg-[#f7f7f7] p-4 text-[14px] text-black">{t("signUpPage.unavailable")}</p>
        ) : (
          <form name="sign-up" noValidate onSubmit={submit} className="mt-6 space-y-5">
            <div>
              <label className="g-label text-black" htmlFor="signUpName">{t("signIn.fullName")}</label>
              <input id="signUpName" name="name" autoComplete="name" maxLength={200} value={values.name} aria-invalid={invalid("name")} aria-describedby={describedBy("name")} onChange={event => set("name")(event.target.value)} className={inputClass("name")} />
              {hint("name")}
            </div>
            <div>
              <label className="g-label text-black" htmlFor="signUpPhone">{t("signIn.phone")}</label>
              <div className="flex gap-2">
                <input id="signUpPhone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+77001234567" value={values.phone} aria-invalid={invalid("phone")} aria-describedby={describedBy("phone")} onChange={event => set("phone")(event.target.value)} className={`${inputClass("phone")} min-w-0 flex-1`} />
                <button type="button" onClick={() => void sendCode()} disabled={busy !== null || wait > 0} className="g-btn g-btn--secondary shrink-0 whitespace-nowrap">
                  {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}{challenge ? t("signUpPage.resend") : t("signIn.send")}
                </button>
              </div>
              {hint("phone")}
            </div>
            <div>
              <label className="g-label text-black" htmlFor="signUpCode">{t("signUpPage.code")}</label>
              <input id="signUpCode" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} disabled={!challenge} value={values.code} aria-invalid={invalid("code")} aria-describedby={describedBy("code") ?? "signup-code-help"} onChange={event => set("code")(event.target.value.replace(/\D/g, ""))} className={`${inputClass("code")} w-40 tracking-[0.3em] disabled:bg-[#f7f7f7]`} />
              {hint("code") ?? <p id="signup-code-help" className="mt-1 text-[13px] text-neutral-600">{challenge ? (wait > 0 ? t("signUpPage.sentWait", { phone: challenge.phone, seconds: wait }) : t("signUpPage.sent", { phone: challenge.phone })) : t("signUpPage.codeHelp")}</p>}
            </div>
            <div>
              <label className="g-label text-black" htmlFor="signUpEmail">{t("signIn.email")}</label>
              <input id="signUpEmail" name="email" type="email" autoComplete="email" maxLength={254} value={values.email} aria-invalid={invalid("email")} aria-describedby={describedBy("email")} onChange={event => set("email")(event.target.value)} className={inputClass("email")} />
              {hint("email")}
            </div>
            <fieldset>
              <legend className="g-label text-black">{t("signUpPage.gender")} <span className="font-normal text-neutral-500">{t("signUpPage.optional")}</span></legend>
              <div role="radiogroup" className="grid grid-cols-3 border border-garmin-control">
                {GENDERS.map((gender, index) => (
                  <label key={gender} className={`flex cursor-pointer items-center justify-center px-2 py-2.5 text-center text-[14px] ${index ? "border-l border-garmin-control" : ""} ${values.gender === gender ? "bg-black text-white" : "bg-white text-black hover:bg-[#f2f2f2]"}`}>
                    <input type="radio" name="gender" value={gender} checked={values.gender === gender} onChange={() => set("gender")(gender)} className="sr-only" />
                    {t(`genders.${gender}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className="g-label text-black" htmlFor="signUpBirthDate">{t("details.birthday")} <span className="font-normal text-neutral-500">{t("signUpPage.optional")}</span></label>
              <input id="signUpBirthDate" name="birthDate" type="date" min={yearsAgoISO(120)} max={yearsAgoISO(10)} value={values.birthDate} aria-invalid={invalid("birthDate")} aria-describedby={describedBy("birthDate")} onChange={event => set("birthDate")(event.target.value)} className={`${inputClass("birthDate")} w-56`} />
              {hint("birthDate")}
            </div>
            {error && <p role="alert" className="flex items-start gap-2 border border-red-200 bg-red-50 p-3 text-[13px] text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{error}</p>}
            <button type="submit" disabled={busy !== null} className="g-btn g-btn--lg g-btn--black w-full">{busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}{t("signIn.create")}</button>
            <p className="text-[13px] leading-[20px] text-neutral-600">{t("signUpPage.addressLater")}</p>
          </form>
        )}
        <p className="mt-6 border-t border-[#e5e5e5] pt-5 text-[14px] text-black">{t("signUpPage.haveAccount")} <Link href="/account" className="font-medium text-garmin-blue hover:underline">{t("auth.signInTab")}</Link></p>
      </div>
    </div>
  );
}
