import "server-only";
import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { DatabaseHandle } from "../db/client.ts";
import { AuthFailure } from "./config.ts";
import { completeProfileInput, signUpInput } from "./validation.ts";

export const PHONE_PURPOSES = ["sign_in", "phone_change_current", "phone_change_new", "order_claim"] as const;
export type PhonePurpose = typeof PHONE_PURPOSES[number];
// The provider must use purpose-specific message text so a code is never read out for the wrong action.
export type PhoneSender = (input: { phoneNumber: string; code: string; purpose: PhonePurpose }) => Promise<void>;
export interface VerifiedPhoneProof { readonly phoneNumber: string; readonly challengeId: string }
// Real delivered codes are 6 digits; the owner's test code (AUTH_TEST_OTP_CODE) may be 4-6. A short guess against a
// real challenge simply fails the hash check and counts as a failed attempt.
export const OTP_PATTERN = /^[0-9]{4,6}$/;
export const canonicalPhone = (phone: string) => /^[+][1-9][0-9]{7,14}$/.test(phone);
export const capabilityHash = (value: string) => createHash("sha256").update(value).digest("hex");
export function authDigest(secret: string, value: string) { return createHmac("sha256", secret).update(value).digest("hex"); }

export async function consumeAuthBudget(database: Pick<DatabaseHandle, "pool">, secret: string, operation: string, subject: string, max: number, seconds: number) {
  const bucket = Math.floor(Date.now()/(seconds*1000));
  const key = "grmn:" + authDigest(secret, `${operation}:${subject}:${bucket}`);
  const result = await database.pool.query("INSERT INTO auth_request_budgets(id,key,count,expires_at) VALUES($1,$2,1,clock_timestamp()+$3*interval '1 second') ON CONFLICT(key) DO UPDATE SET count=auth_request_budgets.count+1 WHERE auth_request_budgets.count<$4 RETURNING count", [randomUUID(), key, seconds, max]);
  if (!result.rowCount) throw new AuthFailure("RATE_LIMITED", 429, "Too many authentication requests", seconds);
}

export function createPhoneService(input: { database: Pick<DatabaseHandle, "pool">; secret: string; send?: PhoneSender; ttlMs?: number; testCode?: string }) {
  const { database, secret, send, testCode } = input;
  if (testCode !== undefined && !OTP_PATTERN.test(testCode)) throw new Error("Invalid test verification code");
  const ttlMs = input.ttlMs ?? 300000;
  if (!Number.isInteger(ttlMs) || ttlMs<100 || ttlMs>300000) throw new Error("Invalid phone challenge lifetime");
  const invalid = () => new AuthFailure("UNAUTHENTICATED", 401, "Invalid or expired verification");
  const proofs = new WeakSet<VerifiedPhoneProof>();
  const service = {
    async request(phoneNumber: string, purpose: PhonePurpose = "sign_in") {
      if (!PHONE_PURPOSES.includes(purpose)) throw new AuthFailure("INVALID_INPUT", 400, "Invalid verification purpose");
      if (!canonicalPhone(phoneNumber)) throw new AuthFailure("INVALID_INPUT", 400, "Invalid phone number");
      if (!send && !testCode) throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Phone delivery is not configured");
      // Test mode sends nothing, so the owner gets a looser budget while trying the flows.
      await consumeAuthBudget(database, secret, "phone-send", phoneNumber, testCode ? 30 : 5, 900);
      const id = randomUUID(), code = testCode ?? randomInt(0, 1000000).toString().padStart(6, "0");
      const client = await database.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('grmn-phone'),hashtext($1))", [phoneNumber]);
        await client.query("UPDATE phone_challenges SET consumed_at=now() WHERE phone_number=$1 AND consumed_at IS NULL", [phoneNumber]);
        await client.query("INSERT INTO phone_challenges(id,phone_number,code_hash,expires_at,purpose) VALUES($1,$2,$3,clock_timestamp()+$4*interval '1 millisecond',$5)", [id, phoneNumber, authDigest(secret, `${id}:${phoneNumber}:${code}`), ttlMs, purpose]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
      if (testCode) return { challengeId: id, testCode: true as const };
      try { await send!({ phoneNumber, code, purpose }); }
      catch { await database.pool.query("UPDATE phone_challenges SET consumed_at=now() WHERE id=$1 AND consumed_at IS NULL", [id]); throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Phone delivery is unavailable"); }
      return { challengeId: id };
    },
    async consume(challengeId: string, phoneNumber: string, code: string, purpose: PhonePurpose = "sign_in") {
      if (!/^[a-f0-9-]{36}$/i.test(challengeId) || !canonicalPhone(phoneNumber) || !OTP_PATTERN.test(code)) throw invalid();
      await consumeAuthBudget(database, secret, "phone-verify", phoneNumber, 20, 300);
      const consumed = await database.pool.query<{ consumed_at: Date | null }>("UPDATE phone_challenges SET failed_attempts=failed_attempts+CASE WHEN code_hash=$3 THEN 0 ELSE 1 END,consumed_at=CASE WHEN code_hash=$3 THEN clock_timestamp() ELSE NULL END WHERE id=$1 AND phone_number=$2 AND purpose=$4 AND consumed_at IS NULL AND expires_at>clock_timestamp() AND failed_attempts<5 RETURNING consumed_at", [challengeId, phoneNumber, authDigest(secret, `${challengeId}:${phoneNumber}:${code}`), purpose]);
      if (!consumed.rows[0]?.consumed_at) throw invalid();
      const proof = Object.freeze({ phoneNumber, challengeId });
      proofs.add(proof);
      return proof;
    },
    async issueCompletion(proof: VerifiedPhoneProof) {
      if (!proofs.has(proof)) throw invalid();
      proofs.delete(proof);
      const token = randomBytes(32).toString("base64url");
      await database.pool.query("INSERT INTO customer_completion_sessions(id,phone_number,token_hash,phone_verified_at,expires_at) VALUES($1,$2,$3,now(),now()+interval '10 minutes')", [randomUUID(), proof.phoneNumber, capabilityHash(token)]);
      return token;
    },
    /**
     * Owner 2026-11-26 (one-page sign-up): checks the phone code and creates the account with the optional gender and
     * birthday in one step. Details are validated before the code is spent, so a typo never burns it.
     */
    async signUp(input: { name: string; email: string; phoneNumber: string; challengeId: string; code: string; gender?: string | null; birthDate?: string | null }) {
      const parsed = signUpInput.safeParse(input);
      if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400, "Invalid sign-up details");
      const details = parsed.data;
      const taken = await database.pool.query("SELECT 1 FROM users WHERE phone_number=$1 OR lower(email)=$2 LIMIT 1", [details.phoneNumber, details.email]);
      if (taken.rowCount) throw new AuthFailure("VERSION_CONFLICT", 409, "This phone or email already has an account; sign in instead");
      await service.consume(details.challengeId, details.phoneNumber, details.code, "sign_in");
      const client = await database.pool.connect();
      try {
        await client.query("BEGIN");
        const id = randomUUID();
        await client.query("INSERT INTO users(id,name,email,phone_number,phone_number_verified) VALUES($1,$2,$3,$4,true)", [id, details.name, details.email, details.phoneNumber]);
        await client.query("INSERT INTO customer_profiles(id,user_id,name,email,entered_phone,normalized_phone,profile_state,gender,birth_date) VALUES($1,$2,$3,$4,$5,$5,'complete',$6,$7::date)",
          [randomUUID(), id, details.name, details.email, details.phoneNumber, details.gender ?? null, details.birthDate ?? null]);
        await client.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key) VALUES($1,$2,'customer.signed_up','user',$2,$3)", [randomUUID(), id, `signed-up:${id}`]);
        await client.query("COMMIT");
        return id;
      } catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof Error && "code" in error && error.code==="23505") throw new AuthFailure("VERSION_CONFLICT", 409, "This phone or email already has an account; sign in instead");
        throw error;
      } finally { client.release(); }
    },
    async complete(token: string, details: { name: string; email: string; phoneNumber: string }) {
      const parsed = completeProfileInput.safeParse(details);
      if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400, "Invalid profile details");
      details = parsed.data;
      const client = await database.pool.connect();
      try {
        await client.query("BEGIN");
        const proof = await client.query("UPDATE customer_completion_sessions SET consumed_at=clock_timestamp() WHERE token_hash=$1 AND phone_number=$2 AND purpose='complete_profile' AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>clock_timestamp() RETURNING id", [capabilityHash(token), details.phoneNumber]);
        if (!proof.rowCount) throw invalid();
        const id = randomUUID();
        await client.query("INSERT INTO users(id,name,email,phone_number,phone_number_verified) VALUES($1,$2,$3,$4,true)", [id, details.name, details.email, details.phoneNumber]);
        await client.query("INSERT INTO customer_profiles(id,user_id,name,email,entered_phone,normalized_phone,profile_state) VALUES($1,$2,$3,$4,$5,$5,'complete')", [randomUUID(), id, details.name, details.email, details.phoneNumber]);
        await client.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key) VALUES($1,$2,'customer.profile_completed','user',$2,$3)", [randomUUID(), id, `profile-completed:${id}`]);
        await client.query("COMMIT");
        return id;
      } catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof Error && "code" in error && error.code==="23505") throw new AuthFailure("VERSION_CONFLICT", 409, "Identity details already exist; sign in or use recovery");
        throw error;
      } finally { client.release(); }
    },
  };
  return service;
}
