"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GarminLogo } from "@/components/icons";
import { restartStaffAuthentication } from "@/lib/staff-auth-recovery";

type Step = "password"|"enroll"|"verify"|"restart";
interface AuthResult {
  success?: boolean;
  mfaRestartRequired?: boolean;
  error?: { code?: string; message?: string };
  mfaRequired?: boolean;
  mfaEnrolled?: boolean;
  staff?: boolean;
  user?: { id: string } | null;
  totpURI?: string;
  backupCodes?: string[];
}
async function authPost(operation: string, body: Record<string,unknown>) {
  const response = await fetch("/api/auth/"+operation, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data: AuthResult = await response.json();
  return { response, data };
}
export default function AdminLoginPage() {
  const router = useRouter();
  const [step,setStep] = useState<Step>("password");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [code,setCode] = useState("");
  const [backup,setBackup] = useState(false);
  const [totpURI,setTotpURI] = useState("");
  const [backupCodes,setBackupCodes] = useState<string[]>([]);
  const [savedCodes,setSavedCodes] = useState(false);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/auth/get-session", { cache: "no-store" }).then(async response => {
      if (!response.ok) return;
      const data: AuthResult = await response.json();
      if (!active || !data.user || !data.staff) return;
      // Already admitted, or MFA is switched off (STAFF_MFA_REQUIRED=0): go straight to the admin.
      if (data.mfaRequired===false && !data.mfaRestartRequired) { router.replace("/admin"); return; }
      setStep(current => current==="restart" || data.mfaRestartRequired ? "restart" : data.mfaEnrolled ? "verify" : "enroll");
    }).catch(() => {});
    return () => { active = false; };
  }, [router]);

  const clearSensitive = () => {
    setPassword(""); setCode(""); setTotpURI(""); setBackupCodes([]); setSavedCodes(false); setBackup(false);
  };
  const recover = async (reason: string) => {
    const result = await restartStaffAuthentication({clearSensitive,setStep,signOut:()=>authPost("sign-out",{})});
    setError(reason+" "+result.message);
    if (result.signedOut) router.refresh();
    return result;
  };
  const restart = async () => {
    setLoading(true);
    try { await recover(""); }
    finally { setLoading(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (step==="restart") return; setLoading(true); setError("");
    try {
      if (step==="password") {
        const credential=password; setPassword("");
        const {response,data} = await authPost("sign-in/email", {email,password:credential});
        if (!response.ok) throw new Error(data.error?.message || "Sign-in could not be completed");
        setPassword("");
        if (data.mfaRequired) { setStep("verify"); return; }
        const sessionResponse = await fetch("/api/auth/get-session", {cache:"no-store"});
        const session: AuthResult = await sessionResponse.json();
        if (!sessionResponse.ok || !session.staff) throw new Error("Staff sign-in is required");
        if (session.mfaRequired===false && !session.mfaRestartRequired) { router.replace("/admin"); router.refresh(); return; }
        setStep(session.mfaEnrolled ? "verify" : "enroll");
      } else if (step==="enroll" && !totpURI) {
        const credential=password; setPassword("");
        const {response,data} = await authPost("two-factor/enable", {password:credential});
        if (!response.ok || !data.totpURI || !data.backupCodes) throw new Error(data.error?.message || "MFA enrollment is unavailable");
        setPassword(""); setTotpURI(data.totpURI); setBackupCodes(data.backupCodes);
      } else {
        let proof: Awaited<ReturnType<typeof authPost>>;
        try { proof=await authPost(backup ? "two-factor/verify-backup-code" : "two-factor/verify-totp", {code}); }
        catch { await recover("Verification could not be confirmed."); return; }
        const {response,data}=proof;
        if (!response.ok) {
          if (data.error?.code==="MFA_STEP_UP_RETRY") {
            clearSensitive(); setStep("verify"); setError(data.error.message || "Fresh proof was not refreshed; previous admission remains unchanged."); return;
          }
          if (data.error?.code==="MFA_ADMISSION_RETRY" || data.error?.code==="MFA_RESTART_REQUIRED" || response.status>=500) {
            await recover("Your proof may have been consumed; this sign-in cannot continue."); return;
          }
          setCode(""); throw new Error(data.error?.message || "MFA verification could not be completed");
        }
        clearSensitive();
        router.replace("/admin"); router.refresh();
      }
    } catch (failure) {
      if (step==="enroll") await recover("Enrollment could not be confirmed.");
      else setError(failure instanceof Error ? failure.message : "Authentication is unavailable");
    }
    finally { setLoading(false); }
  };
  const enrollmentProof = step==="enroll" && !!totpURI;
  return <div className="fixed inset-0 z-50 flex min-h-screen items-center justify-center overflow-y-auto bg-neutral-100 p-4 text-black">
    <div className="my-auto w-full max-w-lg border border-border bg-white p-8 shadow-garmin-raised">
      <GarminLogo className="mx-auto h-6 w-auto text-black" />
      <h1 className="mt-6 text-center text-2xl">{step==="restart" ? "Restart staff sign-in" : step==="password" ? "Administrator sign in" : step==="enroll" ? "Set up staff MFA" : "Verify staff MFA"}</h1>
      <p className="mt-3 text-sm text-neutral-600">Use your configured staff account. Access requires a password and an authenticator or backup code.</p>
      {error && <p role="alert" className="mt-4 border border-garmin-error bg-white p-3 text-sm text-garmin-error">{error}</p>}
      {step!=="restart" && <form onSubmit={submit} className="mt-6 space-y-4">
        {step==="password" && <label className="block text-sm">Email address<input type="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 block w-full border border-neutral-400 p-2" /></label>}
        {(step==="password" || (step==="enroll" && !totpURI)) && <label className="block text-sm">{step==="enroll" ? "Confirm your staff password" : "Password"}<input type="password" autoComplete="current-password" required minLength={16} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 block w-full border border-neutral-400 p-2" /></label>}
        {enrollmentProof && <div className="space-y-3 text-sm">
          <p>Add this setup URI to your authenticator on a private device. Keep the recovery codes somewhere safe; they are shown only during enrollment.</p>
          <label className="block">Authenticator setup URI<textarea readOnly value={totpURI} className="mt-1 block h-20 w-full break-all border border-neutral-400 p-2 font-mono text-xs" /></label>
          <p className="whitespace-pre-wrap break-all border border-border bg-neutral-50 p-3 font-mono text-xs">{backupCodes.join("\n")}</p>
          <label className="flex gap-2"><input type="checkbox" checked={savedCodes} onChange={e=>setSavedCodes(e.target.checked)} required />I saved my recovery codes privately.</label>
        </div>}
        {(step==="verify" || enrollmentProof) && <>
          <label className="block text-sm">{backup ? "Unused backup code" : "Authenticator code"}<input autoComplete="one-time-code" inputMode={backup ? "text" : "numeric"} required minLength={6} maxLength={backup ? 64 : 6} pattern={backup ? undefined : "[0-9]{6}"} value={code} onChange={e=>setCode(e.target.value)} className="mt-1 block w-full border border-neutral-400 p-2 tabular-nums" /></label>
          {step==="verify" && <button type="button" onClick={()=>{setBackup(!backup);setCode("");}} className="text-sm underline">{backup ? "Use authenticator" : "Use an unused backup code"}</button>}
        </>}
        <button type="submit" disabled={loading || (enrollmentProof && !savedCodes)} className="w-full bg-black p-3 text-sm uppercase text-white disabled:opacity-50">{loading ? "Please wait…" : step==="password" ? "Continue" : step==="enroll" && !totpURI ? "Create authenticator setup" : "Verify and continue"}</button>
      </form>}
      {step!=="password" && <button type="button" onClick={restart} disabled={loading} className="mt-4 text-sm underline">Sign out and restart</button>}
    </div>
  </div>;
}
