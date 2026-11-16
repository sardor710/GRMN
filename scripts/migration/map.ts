import { createHash } from "node:crypto";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export const compareExact = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => compareExact(a, b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function stableId(...parts: string[]): string {
  const hash = sha256(JSON.stringify(parts)).slice(0, 32).split("");
  hash[12] = "5";
  hash[16] = ((parseInt(hash[16], 16) & 3) | 8).toString(16);
  const value = hash.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function moneyToMinor(value: unknown): string {
  if (typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) >= Number.MAX_SAFE_INTEGER / 100)) throw new Error("Invalid money");
  if (typeof value !== "number" && typeof value !== "string") throw new Error("Invalid money");
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(String(value));
  if (!match) throw new Error("Invalid money");
  const minor = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (minor > BigInt("9223372036854775807")) throw new Error("Invalid money");
  return minor.toString();
}

const credential = /^(?:.*password.*|.*secret.*|.*token.*|.*credential.*|.*(?:Pass|Pwd|Passphrase)|api[_-]?key|private[_-]?key|client[_-]?key|otp[_-]?seed|totp[_-]?seed|authorization|cookie|backupCodes?|twoFactor)$/i;
export function redact(value: Json, path = "", paths: string[] = []): Json {
  if (Array.isArray(value)) return value.map((item, i) => redact(item, `${path}[${i}]`, paths));
  if (!value || typeof value !== "object") return value;
  const entries: [string, Json][] = [];
  for (const [key, item] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (credential.test(key)) paths.push(next);
    else entries.push([key, redact(item, next, paths)]);
  }
  return Object.fromEntries(entries);
}

export function asObject(value: Json | undefined): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export const text = (value: Json | undefined): string | null => typeof value === "string" && value.trim() ? value : null;
export const databaseText = (value: string): string => value.isWellFormed() && !value.includes("\u0000") ? value : `encoded-json:${Buffer.from(JSON.stringify(value)).toString("base64")}`;

export function archivePayload(payload: JsonObject): JsonObject {
  const unsafe = (value: Json): boolean => typeof value === "string" ? !value.isWellFormed() || value.includes("\u0000")
    : value !== null && typeof value === "object" && Object.entries(value).some(([key, item]) => !key.isWellFormed() || key.includes("\u0000") || unsafe(item));
  return unsafe(payload) ? { $encoding: "canonical-json-base64-v1", $jsonBase64: Buffer.from(canonical(payload), "utf8").toString("base64") } : payload;
}

export function storedRecordPayload(record: { payload: JsonObject; numberLexemes: Record<string, string> }): JsonObject {
  return { format: "legacy-record-v2", data: archivePayload(record.payload), numberLexemes: record.numberLexemes };
}

export function legacyOrderStatus(value: Json | undefined): string {
  if (value === "canceled" || value === "cancelled") return "cancelled";
  // Other legacy lifecycle labels are retained in the restricted summary only.
  return "pending_payment";
}
