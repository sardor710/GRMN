import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// Owner 2026-11-25: traffic analytics (plan docs/plans/2026-11-25-traffic-analytics-xl.md).
// - traffic_sessions: one row per visit. Its first page view is the "click" a source gets credit for;
//   the source (platform, medium, campaign) is decided once, at landing. No IP and no raw user agent.
// - traffic_views: every page view of a visit. product_id has no foreign key on purpose: deleting a
//   product must not delete its view history.
// - traffic_links: campaign links saved in Admin ▸ Campaign links.
// Retention: sessions older than 13 months are pruned by the worker (views cascade).

const id = () => uuid("id").primaryKey().$defaultFn(randomUUID);
const time = (name: string) => timestamp(name, { withTimezone: true });

export const trafficSessions = pgTable("traffic_sessions", {
  id: id(),
  visitorId: uuid("visitor_id").notNull(),
  startedAt: time("started_at").notNull().defaultNow(),
  lastSeenAt: time("last_seen_at").notNull().defaultNow(),
  platform: text("platform").notNull(),
  medium: text("medium"),
  campaign: text("campaign"),
  referrerHost: text("referrer_host"),
  landingPath: text("landing_path").notNull(),
  locale: text("locale"),
  os: text("os").notNull(),
  deviceType: text("device_type").notNull(),
  browser: text("browser"),
  views: integer("views").notNull().default(1),
}, t => [
  index("traffic_sessions_started_idx").on(t.startedAt),
  index("traffic_sessions_platform_started_idx").on(t.platform, t.startedAt),
  index("traffic_sessions_visitor_idx").on(t.visitorId),
  check("traffic_sessions_valid", sql`char_length(${t.platform}) BETWEEN 1 AND 40
    AND (${t.medium} IS NULL OR char_length(${t.medium}) BETWEEN 1 AND 80)
    AND (${t.campaign} IS NULL OR char_length(${t.campaign}) BETWEEN 1 AND 80)
    AND (${t.referrerHost} IS NULL OR char_length(${t.referrerHost}) BETWEEN 1 AND 253)
    AND char_length(${t.landingPath}) BETWEEN 1 AND 512
    AND (${t.locale} IS NULL OR ${t.locale} IN ('en','ru','kk'))
    AND char_length(${t.os}) BETWEEN 1 AND 20
    AND ${t.deviceType} IN ('mobile','tablet','desktop')
    AND (${t.browser} IS NULL OR char_length(${t.browser}) BETWEEN 1 AND 40)
    AND ${t.views}>=1`),
]);

export const trafficViews = pgTable("traffic_views", {
  id: id(),
  sessionId: uuid("session_id").notNull().references(() => trafficSessions.id, { onDelete: "cascade" }),
  occurredAt: time("occurred_at").notNull().defaultNow(),
  path: text("path").notNull(),
  productId: uuid("product_id"),
  locale: text("locale"),
}, t => [
  index("traffic_views_occurred_idx").on(t.occurredAt),
  index("traffic_views_product_occurred_idx").on(t.productId, t.occurredAt),
  index("traffic_views_session_idx").on(t.sessionId),
  check("traffic_views_valid", sql`char_length(${t.path}) BETWEEN 1 AND 512 AND (${t.locale} IS NULL OR ${t.locale} IN ('en','ru','kk'))`),
]);

export const trafficLinks = pgTable("traffic_links", {
  id: id(),
  platform: text("platform").notNull(),
  medium: text("medium").notNull(),
  campaign: text("campaign").notNull(),
  targetPath: text("target_path").notNull(),
  label: text("label"),
  createdBy: text("created_by"),
  createdAt: time("created_at").notNull().defaultNow(),
  archivedAt: time("archived_at"),
}, t => [
  uniqueIndex("traffic_links_active_unique").on(t.platform, t.medium, t.campaign, t.targetPath).where(sql`${t.archivedAt} IS NULL`),
  check("traffic_links_valid", sql`char_length(${t.platform}) BETWEEN 1 AND 40 AND char_length(${t.medium}) BETWEEN 1 AND 80
    AND ${t.campaign} ~ '^[a-z0-9][a-z0-9-]{0,59}$' AND char_length(${t.targetPath}) BETWEEN 1 AND 512
    AND (${t.label} IS NULL OR char_length(${t.label}) BETWEEN 1 AND 120)`),
]);
