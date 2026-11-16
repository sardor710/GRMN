import "server-only";
import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { DatabaseHandle } from "../db/client.ts";
import { AuthFailure } from "./config.ts";
import { completeProfileInput } from "./validation.ts";

export type PhoneSender = (input: { phoneNumber: string; code: string }) => Promise<void>;
export interface VerifiedPhoneProof { readonly phoneNumber: string; readonly challengeId: string }
export const canonicalPhone = (phone: string) => /^[+][1-9][0-9]{7,14}$/.test(phone);
export const capabilityHash = (value: string) => createHash("sha256").update(value).digest("hex");
export function authDigest(secret: string, value: string) { return createHmac("sha256", secret).update(value).digest("hex"); }

export async function consumeAuthBudget(database: DatabaseHandle, secret: string, operation: string, subject: string, max: number, seconds: number) {
  const bucket = Math.floor(Date.now()/(seconds*1000));
  const key = "grmn:" + authDigest(secret, `${operation}:${subject}:${bucket}`);
  const result = await database.pool.query("INSERT INTO auth_request_budgets(id,key,count,expires_at) VALUES($1,$2,1,clock_timestamp()+$3*interval '1 second') ON CONFLICT(key) DO UPDATE SET count=auth_request_budgets.count+1 WHERE auth_request_budgets.count<$4 RETURNING count", [randomUUID(), key, seconds, max]);
  if (!result.rowCount) throw new AuthFailure("RATE_LIMITED", 429, "Too many authentication requests", seconds);
}

export function createPhoneService(input: { database: DatabaseHandle; secret: string; send?: PhoneSender; ttlMs?: number }) {
  const { database, secret, send } = input;
  const ttlMs = input.ttlMs ?? 300000;
  if (!Number.isInteger(ttlMs) || ttlMs<100 || ttlMs>300000) throw new Error("Invalid phone challenge lifetime");
  const invalid = () => new AuthFailure("UNAUTHENTICATED", 401, "Invalid or expired verification");
  const proofs = new WeakSet<VerifiedPhoneProof>();
  return {
    async request(phoneNumber: string) {
      if (!canonicalPhone(phoneNumber)) throw new AuthFailure("INVALID_INPUT", 400, "Invalid phone number");
      if (!send) throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Phone delivery is not configured");
      await consumeAuthBudget(database, secret, "phone-send", phoneNumber, 5, 900);
      const id = randomUUID(), code = randomInt(0, 1000000).toString().padStart(6, "0");
      const client = await database.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('grmn-phone'),hashtext($1))", [phoneNumber]);
        await client.query("UPDATE phone_challenges SET consumed_at=now() WHERE phone_number=$1 AND consumed_at IS NULL", [phoneNumber]);
        await client.query("INSERT INTO phone_challenges(id,phone_number,code_hash,expires_at) VALUES($1,$2,$3,clock_timestamp()+$4*interval '1 millisecond')", [id, phoneNumber, authDigest(secret, `${id}:${phoneNumber}:${code}`), ttlMs]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
      try { await send({ phoneNumber, code }); }
      catch { await database.pool.query("UPDATE phone_challenges SET consumed_at=now() WHERE id=$1 AND consumed_at IS NULL", [id]); throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Phone delivery is unavailable"); }
      return { challengeId: id };
    },
    async consume(challengeId: string, phoneNumber: string, code: string) {
      if (!/^[a-f0-9-]{36}$/i.test(challengeId) || !canonicalPhone(phoneNumber) || !/^[0-9]{6}$/.test(code)) throw invalid();
      await consumeAuthBudget(database, secret, "phone-verify", phoneNumber, 20, 300);
      const consumed = await database.pool.query<{ consumed_at: Date | null }>("UPDATE phone_challenges SET failed_attempts=failed_attempts+CASE WHEN code_hash=$3 THEN 0 ELSE 1 END,consumed_at=CASE WHEN code_hash=$3 THEN clock_timestamp() ELSE NULL END WHERE id=$1 AND phone_number=$2 AND consumed_at IS NULL AND expires_at>clock_timestamp() AND failed_attempts<5 RETURNING consumed_at", [challengeId, phoneNumber, authDigest(secret, `${challengeId}:${phoneNumber}:${code}`)]);
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
}
