import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { session, user } from "./identity.ts";

export const phoneChallenges = pgTable("phone_challenges", {
  id: uuid("id").primaryKey().$defaultFn(randomUUID), phoneNumber: text("phone_number").notNull(), codeHash: text("code_hash").notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), consumedAt: timestamp("consumed_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("phone_challenges_phone_idx").on(t.phoneNumber, t.createdAt), index("phone_challenges_expiry_idx").on(t.expiresAt), check("phone_challenges_valid", sql`${t.phoneNumber} ~ '^[+][1-9][0-9]{7,14}$' AND ${t.codeHash} ~ '^[0-9a-f]{64}$' AND ${t.failedAttempts} BETWEEN 0 AND 5 AND ${t.expiresAt}>${t.createdAt} AND (${t.consumedAt} IS NULL OR ${t.consumedAt}>=${t.createdAt})`)]);

export const staffSessionGrants = pgTable("staff_session_grants", {
  sessionId: uuid("session_id").primaryKey().references(() => session.id, { onDelete: "cascade" }), userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }), method: text("method").notNull(), verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("staff_session_grants_user_idx").on(t.userId), check("staff_session_grants_method_valid", sql`${t.method} IN ('totp','backup_code')`)]);

export const authRequestBudgets = pgTable("auth_request_budgets", {
  id: uuid("id").primaryKey().$defaultFn(randomUUID), key: text("key").notNull().unique(), count: integer("count").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("auth_request_budgets_expiry_idx").on(t.expiresAt), check("auth_request_budgets_valid", sql`${t.key} ~ '^grmn:[a-f0-9]{64}$' AND ${t.count}>0 AND isfinite(${t.expiresAt}) AND ${t.expiresAt}>${t.createdAt}`)]);
