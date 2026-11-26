import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./identity.ts";

const id = () => uuid("id").primaryKey().$defaultFn(randomUUID);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());

export const customerProfiles = pgTable("customer_profiles", {
  id: id(),
  userId: uuid("user_id").references(() => user.id, { onDelete: "restrict" }),
  legacyClientId: text("legacy_client_id").unique(),
  name: text("name").notNull(),
  email: text("email"),
  // Null = unverified contact value (customer-typed or imported); never an ownership signal.
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  enteredPhone: text("entered_phone").notNull(),
  normalizedPhone: text("normalized_phone"),
  countryCode: text("country_code"),
  birthDate: date("birth_date"),
  /** 0033 (owner 2026-11-26): optional, asked on sign-up and editable in Profile. */
  gender: text("gender"),
  avatar: text("avatar"),
  status: text("status", { enum: ["active", "vip", "pending", "suspended"] }).notNull().default("active"),
  profileState: text("profile_state", { enum: ["provisional", "complete"] }).notNull().default("provisional"),
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  check("customer_profiles_gender_valid", sql`${table.gender} IS NULL OR ${table.gender} IN ('male','female','unspecified')`),
  uniqueIndex("customer_profiles_user_unique").on(table.userId).where(sql`${table.userId} IS NOT NULL`),
  index("customer_profiles_phone_lookup_idx").on(table.normalizedPhone),
  check("customer_profiles_name_present", sql`length(btrim(${table.name})) BETWEEN 1 AND 200`),
  check("customer_profiles_phone_present", sql`length(btrim(${table.enteredPhone})) BETWEEN 1 AND 64`),
  check("customer_profiles_email_normalized", sql`${table.email} IS NULL OR (${table.email}=lower(btrim(${table.email})) AND length(${table.email})>0)`),
  check("customer_profiles_phone_format", sql`${table.normalizedPhone} IS NULL OR ${table.normalizedPhone} ~ '^[+][1-9][0-9]{7,14}$'`),
  check("customer_profiles_country_format", sql`${table.countryCode} IS NULL OR ${table.countryCode} ~ '^[A-Z]{2}$'`),
  check("customer_profiles_state_valid", sql`${table.profileState} IN ('provisional','complete')`),
  check("customer_profiles_status_valid", sql`${table.status} IN ('active','vip','pending','suspended')`),
  check("customer_profiles_complete_fields", sql`${table.profileState}<>'complete' OR (${table.userId} IS NOT NULL AND ${table.email} IS NOT NULL AND ${table.normalizedPhone} IS NOT NULL)`),
  check("customer_profiles_version_valid", sql`${table.version} >= 1`),
]);

export const customerPrivateNotes = pgTable("customer_private_notes", {
  id: id(),
  profileId: uuid("profile_id").notNull().references(() => customerProfiles.id, { onDelete: "restrict" }),
  authorUserId: uuid("author_user_id").references(() => user.id, { onDelete: "restrict" }),
  legacyAuthorLabel: text("legacy_author_label"),
  body: text("body").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("customer_private_notes_profile_idx").on(table.profileId), index("customer_private_notes_author_idx").on(table.authorUserId)]);

export const customerAddresses = pgTable("customer_addresses", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  label: text("label").notNull(),
  recipientName: text("recipient_name").notNull(),
  phone: text("phone").notNull(),
  countryCode: text("country_code").notNull(),
  city: text("city").notNull(),
  line1: text("line1").notNull(),
  line2: text("line2"),
  region: text("region"),
  postalCode: text("postal_code"),
  isPrimary: boolean("is_primary").notNull().default(false),
  // Optional map pin (0013). numeric(9,6) is ~0.11 m resolution; node-postgres returns decimal strings.
  latitude: numeric("latitude", { precision: 9, scale: 6 }),
  longitude: numeric("longitude", { precision: 9, scale: 6 }),
  geoPrecision: text("geo_precision", { enum: ["exact", "street", "locality", "manual"] }),
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("customer_addresses_user_idx").on(table.userId),
  check("customer_addresses_geo_pair", sql`(${table.latitude} IS NULL)=(${table.longitude} IS NULL)`),
  check("customer_addresses_geo_range", sql`(${table.latitude} IS NULL OR ${table.latitude} BETWEEN -90 AND 90) AND (${table.longitude} IS NULL OR ${table.longitude} BETWEEN -180 AND 180)`),
  check("customer_addresses_geo_precision_valid", sql`${table.geoPrecision} IS NULL OR (${table.geoPrecision} IN ('exact','street','locality','manual') AND ${table.latitude} IS NOT NULL)`),
  uniqueIndex("customer_addresses_primary_unique").on(table.userId).where(sql`${table.isPrimary} = true`),
  check("customer_addresses_required_fields", sql`length(btrim(${table.label}))>0 AND length(btrim(${table.recipientName}))>0 AND length(btrim(${table.city}))>0 AND length(btrim(${table.line1}))>0`),
  check("customer_addresses_phone_format", sql`${table.phone} ~ '^[+][1-9][0-9]{7,14}$'`),
  check("customer_addresses_country_format", sql`${table.countryCode} ~ '^[A-Z]{2}$'`),
  check("customer_addresses_version_valid", sql`${table.version} >= 1`),
]);

export const customerPreferences = pgTable("customer_preferences", {
  profileId: uuid("profile_id").primaryKey().references(() => customerProfiles.id, { onDelete: "restrict" }),
  locale: text("locale", { enum: ["kk", "ru", "en"] }),
  marketingEmailRequested: boolean("marketing_email_requested").notNull().default(false),
  version: integer("version").notNull().default(1),
  updatedAt: updatedAt(),
}, (table) => [
  check("customer_preferences_locale_valid", sql`${table.locale} IS NULL OR ${table.locale} IN ('kk','ru','en')`),
  check("customer_preferences_version_valid", sql`${table.version} >= 1`),
]);

export const consentEvents = pgTable("consent_events", {
  id: id(),
  profileId: uuid("profile_id").notNull().references(() => customerProfiles.id, { onDelete: "restrict" }),
  actorUserId: uuid("actor_user_id").references(() => user.id, { onDelete: "restrict" }),
  purpose: text("purpose").notNull(),
  channel: text("channel", { enum: ["email", "sms"] }).notNull(),
  action: text("action", { enum: ["granted", "withdrawn"] }).notNull(),
  policyVersion: text("policy_version").notNull(),
  source: text("source").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("consent_events_profile_time_idx").on(table.profileId, table.occurredAt),
  index("consent_events_actor_idx").on(table.actorUserId),
  check("consent_events_channel_valid", sql`${table.channel} IN ('email','sms')`),
  check("consent_events_action_valid", sql`${table.action} IN ('granted','withdrawn')`),
  check("consent_events_evidence_present", sql`length(btrim(${table.purpose}))>0 AND length(btrim(${table.policyVersion}))>0 AND length(btrim(${table.source}))>0`),
]);

export const customerCompletionSessions = pgTable("customer_completion_sessions", {
  id: id(),
  profileId: uuid("profile_id").references(() => customerProfiles.id, { onDelete: "restrict" }),
  phoneNumber: text("phone_number").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  purpose: text("purpose").notNull().default("complete_profile"),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (table) => [
  index("customer_completion_sessions_profile_idx").on(table.profileId),
  index("customer_completion_sessions_expiry_idx").on(table.expiresAt),
  check("customer_completion_sessions_phone_format", sql`${table.phoneNumber} ~ '^[+][1-9][0-9]{7,14}$'`),
  check("customer_completion_sessions_hash_format", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
  check("customer_completion_sessions_scope", sql`${table.purpose} = 'complete_profile'`),
  check("customer_completion_sessions_expiry_valid", sql`${table.expiresAt}>${table.createdAt} AND ${table.phoneVerifiedAt}<=${table.expiresAt}`),
]);
