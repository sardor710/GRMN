import "server-only";
import type { BetterAuthOptions } from "better-auth";
import { phoneNumber, twoFactor } from "better-auth/plugins";

// Schema contract only. No auth instance, HTTP route, live OTP or fake-email signup.
export const authSchemaOptions = {
  advanced: { database: { generateId: "uuid" } },
  rateLimit: { storage: "database" },
  user: {
    additionalFields: {
      status: { type: ["active", "suspended", "disabled"], required: true, defaultValue: "active", input: false },
    },
  },
  plugins: [
    phoneNumber({
      sendOTP: async () => { throw new Error("Phone verification delivery is not configured"); },
    }),
    twoFactor(),
  ],
} satisfies BetterAuthOptions;
