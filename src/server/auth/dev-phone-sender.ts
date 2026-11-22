import "server-only";
import type { PhoneSender } from "./phone-service.ts";

// Development-only phone "delivery": the one-time code is printed to the server console as
//   [dev-otp] <phone> <code>
// so customer phone sign-in can be exercised locally without an SMS provider. It is wired into the
// auth runtime only when AUTH_DEV_OTP_CONSOLE=1 and NODE_ENV is not "production"; enabling it in a
// production process is a configuration error that stops the auth runtime from starting.

export const DEV_OTP_FLAG = "AUTH_DEV_OTP_CONSOLE";

export function createDevConsolePhoneSender(log: (line: string) => void = line => console.info(line)): PhoneSender {
  return async ({ phoneNumber, code }) => { log(`[dev-otp] ${phoneNumber} ${code}`); };
}

/** The console sender when explicitly enabled outside production; undefined when disabled. Throws in production. */
export function devPhoneSenderFromEnv(env: Readonly<Record<string, string | undefined>>, log?: (line: string) => void): PhoneSender | undefined {
  const flag = env[DEV_OTP_FLAG];
  if (flag === undefined || flag === "" || flag === "0") return undefined;
  if (flag !== "1") throw new Error(`Missing or invalid auth configuration: ${DEV_OTP_FLAG}`);
  if (env.NODE_ENV === "production") throw new Error(`${DEV_OTP_FLAG} must not be enabled in production`);
  return createDevConsolePhoneSender(log);
}
