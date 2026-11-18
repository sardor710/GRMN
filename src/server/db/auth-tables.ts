import "server-only";
import { account, rateLimit, session, twoFactor, user, verification } from "./schema/identity.ts";

// Keys are the pinned Better Auth logical model names, not SQL table names.
export const authTables = { user, session, account, verification, twoFactor, rateLimit };
