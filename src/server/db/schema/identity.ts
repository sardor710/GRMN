import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgTable, pgView, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().$defaultFn(randomUUID);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());

export const user = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  // Better Auth requires email; incomplete customers live in customer_profiles.
  email: text("email").notNull().unique("users_email_unique"),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  phoneNumber: text("phone_number").unique("users_phone_number_unique"),
  phoneNumberVerified: boolean("phone_number_verified").notNull().default(false),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  status: text("status", { enum: ["active", "suspended", "disabled"] }).notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  check("users_email_normalized", sql`${table.email} = lower(btrim(${table.email})) AND length(${table.email}) > 0`),
  check("users_name_present", sql`length(btrim(${table.name})) BETWEEN 1 AND 200`),
  check("users_status_valid", sql`${table.status} IN ('active','suspended','disabled')`),
  check("users_verified_phone_only", sql`(${table.phoneNumber} IS NULL AND NOT ${table.phoneNumberVerified}) OR (${table.phoneNumber} IS NOT NULL AND ${table.phoneNumber} ~ '^[+][1-9][0-9]{7,14}$' AND ${table.phoneNumberVerified})`),
]);

export const session = pgTable("auth_sessions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique("auth_sessions_token_unique"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("auth_sessions_user_idx").on(table.userId), index("auth_sessions_expiry_idx").on(table.expiresAt)]);

export const account = pgTable("auth_accounts", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  password: text("password"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("auth_accounts_user_idx").on(table.userId),
  uniqueIndex("auth_accounts_provider_account_unique").on(table.providerId, table.accountId),
]);

export const verification = pgTable("auth_verifications", {
  id: id(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("auth_verifications_identifier_idx").on(table.identifier), index("auth_verifications_expiry_idx").on(table.expiresAt)]);

export const twoFactor = pgTable("auth_two_factors", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  verified: boolean("verified").notNull().default(true),
  failedVerificationCount: integer("failed_verification_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
}, (table) => [
  index("auth_two_factors_user_idx").on(table.userId),
  index("auth_two_factors_secret_idx").on(table.secret),
  check("auth_two_factors_attempts_valid", sql`${table.failedVerificationCount} >= 0`),
]);

export const rateLimit = pgTable("auth_rate_limits", {
  id: id(),
  key: text("key").notNull().unique("auth_rate_limits_key_unique"),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
}, (table) => [
  index("auth_rate_limits_last_request_idx").on(table.lastRequest),
  check("auth_rate_limits_nonnegative", sql`${table.count} >= 0 AND ${table.lastRequest} >= 0`),
]);

// Read-only logical phone identity; no duplicate phone table to synchronize.
export const phoneIdentities = pgView("phone_identities", {
  userId: uuid("user_id").notNull(),
  phoneNumber: text("phone_number").notNull(),
}).as(sql`SELECT id AS user_id, phone_number FROM users WHERE phone_number_verified = true`);

export const roles = pgTable("roles", {
  id: id(),
  code: text("code").notNull().unique(),
  createdAt: createdAt(),
}, (table) => [check("roles_code_valid", sql`${table.code} IN ('super_admin','editor','product_manager','support')`)]);

export const permissions = pgTable("permissions", {
  id: id(),
  code: text("code").notNull().unique(),
  createdAt: createdAt(),
}, (table) => [check("permissions_code_present", sql`length(btrim(${table.code})) > 0`)]);

export const userRoles = pgTable("user_roles", {
  userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
}, (table) => [primaryKey({ columns: [table.userId, table.roleId] }), index("user_roles_role_idx").on(table.roleId)]);

export const rolePermissions = pgTable("role_permissions", {
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "restrict" }),
}, (table) => [primaryKey({ columns: [table.roleId, table.permissionId] }), index("role_permissions_permission_idx").on(table.permissionId)]);
