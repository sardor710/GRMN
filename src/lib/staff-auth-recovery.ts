export interface StaffCleanupResult {
  response: { ok: boolean };
  data: { success?: boolean };
}
/** Erase proof material before any fallible network/JSON cleanup operation. */
export async function restartStaffAuthentication(input: {
  clearSensitive(): void;
  setStep(step: "restart"|"password"): void;
  signOut(): Promise<StaffCleanupResult>;
}) {
  input.clearSensitive();
  input.setStep("restart");
  try {
    const result = await input.signOut();
    if (!result.response.ok || result.data.success!==true) throw new Error("Sign-out was not acknowledged");
    input.setStep("password");
    return { signedOut: true, message: "The browser session and pending sign-in have been cancelled. Sign in again using your authenticator or a different backup code." };
  } catch {
    return { signedOut: false, message: "Sign-out could not be confirmed. Retry sign out and restart before continuing." };
  }
}
