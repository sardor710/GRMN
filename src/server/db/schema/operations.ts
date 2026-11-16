import "server-only";
import { randomUUID } from "node:crypto";
import type { Buffer } from "node:buffer";
import { sql } from "drizzle-orm";
import { bigint, check, customType, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { user } from "./identity.ts";
import { consentEvents } from "./customers.ts";
import { mediaAssets } from "./media.ts";

const id = () => uuid("id").primaryKey().$defaultFn(randomUUID);
const time = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => time("created_at").notNull().defaultNow();
const object = (name: string) => jsonb(name).$type<Record<string, unknown>>();
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const auditEvents = pgTable("audit_events", {
  id: id(), actorUserId: uuid("actor_user_id").references(() => user.id, { onDelete: "restrict" }), legacyActorLabel: text("legacy_actor_label"),
  action: text("action").notNull(), targetType: text("target_type").notNull(), targetId: uuid("target_id"), legacyTargetLabel: text("legacy_target_label"),
  requestId: text("request_id"), dedupeKey: text("dedupe_key").notNull().unique(), redactedChanges: object("redacted_changes").notNull().default({}), occurredAt: time("occurred_at"), recordedAt: time("recorded_at").notNull().defaultNow(),
}, t => [index("audit_events_target_idx").on(t.targetType, t.targetId, t.recordedAt, t.id), index("audit_events_actor_idx").on(t.actorUserId, t.recordedAt), check("audit_events_fields_valid", sql`length(btrim(${t.action}))>0 AND length(btrim(${t.targetType}))>0 AND length(btrim(${t.dedupeKey}))>0 AND jsonb_typeof(${t.redactedChanges})='object'`)]);

export const outboxEvents = pgTable("outbox_events", {
  id: id(), topic: text("topic").notNull(), payloadVersion: integer("payload_version").notNull().default(1), payload: object("payload").notNull().default({}),
  aggregateType: text("aggregate_type"), aggregateId: uuid("aggregate_id"), dedupeKey: text("dedupe_key").notNull().unique(), occurredAt: time("occurred_at").notNull().defaultNow(), createdAt: createdAt(),
}, t => [index("outbox_events_topic_idx").on(t.topic, t.createdAt, t.id), check("outbox_events_fields_valid", sql`length(btrim(${t.topic}))>0 AND length(btrim(${t.dedupeKey}))>0 AND ${t.payloadVersion}>0 AND jsonb_typeof(${t.payload})='object' AND ((${t.aggregateType} IS NULL AND ${t.aggregateId} IS NULL) OR (${t.aggregateType} IS NOT NULL AND ${t.aggregateId} IS NOT NULL))`)]);

export const jobRuns = pgTable("job_runs", {
  id: id(), kind: text("kind").notNull(), dedupeKey: text("dedupe_key").notNull(), eventId: uuid("event_id").references(() => outboxEvents.id, { onDelete: "restrict" }),
  replayOfJobId: uuid("replay_of_job_id").references((): AnyPgColumn => jobRuns.id, { onDelete: "restrict" }), payload: object("payload").notNull().default({}),
  status: text("status").notNull().default("pending"), attempts: integer("attempts").notNull().default(0), maxAttempts: integer("max_attempts").notNull().default(5),
  availableAt: time("available_at").notNull().defaultNow(), leaseOwner: text("lease_owner"), leaseTokenHash: text("lease_token_hash"), leasedUntil: time("leased_until"), finishedAt: time("finished_at"), lastErrorCode: text("last_error_code"), createdAt: createdAt(),
}, t => [
  uniqueIndex("job_runs_dedupe_unique").on(t.kind, t.dedupeKey), uniqueIndex("job_runs_event_consumer_unique").on(t.kind, t.eventId).where(sql`${t.eventId} IS NOT NULL`), index("job_runs_ready_idx").on(t.availableAt, t.id).where(sql`${t.status}='pending'`), index("job_runs_lease_idx").on(t.leasedUntil, t.id).where(sql`${t.status}='leased'`), index("job_runs_replay_idx").on(t.replayOfJobId),
  check("job_runs_fields_valid", sql`length(btrim(${t.kind}))>0 AND length(btrim(${t.dedupeKey}))>0 AND ${t.attempts}>=0 AND ${t.maxAttempts}>0 AND ${t.attempts}<=${t.maxAttempts} AND jsonb_typeof(${t.payload})='object' AND (${t.replayOfJobId} IS NULL OR ${t.replayOfJobId}<>${t.id})`),
  check("job_runs_state_valid", sql`((${t.status}='leased' AND ${t.attempts}>0 AND ${t.leaseOwner} IS NOT NULL AND length(btrim(${t.leaseOwner}))>0 AND ${t.leaseTokenHash} IS NOT NULL AND ${t.leaseTokenHash} ~ '^[0-9a-f]{64}$' AND ${t.leasedUntil} IS NOT NULL) OR (${t.status} IN ('pending','done','dead') AND ${t.leaseOwner} IS NULL AND ${t.leaseTokenHash} IS NULL AND ${t.leasedUntil} IS NULL)) AND ((${t.status} IN ('done','dead') AND ${t.finishedAt} IS NOT NULL AND ${t.finishedAt}>=${t.createdAt}) OR (${t.status} IN ('pending','leased') AND ${t.finishedAt} IS NULL))`),
]);

export const webhookInbox = pgTable("webhook_inbox", {
  id: id(), provider: text("provider").notNull(), environment: text("environment").notNull(), merchantAccount: text("merchant_account").notNull(), externalEventId: text("external_event_id"),
  rawBody: bytea("raw_body").notNull(), bodySha256: text("body_sha256").notNull(), verificationState: text("verification_state").notNull().default("unverified"), status: text("status").notNull().default("received"),
  verifiedAt: time("verified_at"), receivedAt: time("received_at").notNull().defaultNow(), processedAt: time("processed_at"),
}, t => [
  uniqueIndex("webhook_inbox_verified_identity_unique").on(t.provider, t.environment, t.merchantAccount, t.externalEventId).where(sql`${t.verificationState}='verified'`), index("webhook_inbox_queue_idx").on(t.status, t.receivedAt, t.id),
  check("webhook_inbox_fields_valid", sql`length(btrim(${t.provider}))>0 AND ${t.environment} IN ('sandbox','live') AND length(btrim(${t.merchantAccount}))>0 AND ${t.bodySha256} ~ '^[0-9a-f]{64}$' AND (${t.externalEventId} IS NULL OR length(btrim(${t.externalEventId}))>0)`),
  check("webhook_inbox_state_valid", sql`((${t.verificationState}='unverified' AND ${t.status}='received' AND ${t.verifiedAt} IS NULL) OR (${t.verificationState}='rejected' AND ${t.status}='rejected' AND ${t.verifiedAt} IS NULL) OR (${t.verificationState}='verified' AND ${t.status} IN ('queued','processed') AND ${t.verifiedAt} IS NOT NULL AND ${t.externalEventId} IS NOT NULL)) AND ((${t.status}='processed' AND ${t.processedAt} IS NOT NULL) OR (${t.status}<>'processed' AND ${t.processedAt} IS NULL))`),
]);

export const idempotencyRecords = pgTable("idempotency_records", {
  id: id(), actorScope: text("actor_scope").notNull(), operation: text("operation").notNull(), key: text("key").notNull(), requestHash: text("request_hash").notNull(),
  status: text("status").notNull().default("processing"), result: object("result"), expiresAt: time("expires_at").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("idempotency_records_scope_unique").on(t.actorScope, t.operation, t.key), index("idempotency_records_expiry_idx").on(t.expiresAt), check("idempotency_records_fields_valid", sql`length(btrim(${t.actorScope}))>0 AND length(btrim(${t.operation}))>0 AND ${t.key} ~ '^[ -~]{16,128}$' AND ${t.requestHash} ~ '^[0-9a-f]{64}$' AND ${t.expiresAt}>${t.createdAt} AND ((${t.status}='processing' AND ${t.result} IS NULL) OR (${t.status}='completed' AND ${t.result} IS NOT NULL AND jsonb_typeof(${t.result})='object') OR (${t.status}='abandoned' AND ${t.result} IS NULL))`)]);

export const exportJobs = pgTable("export_jobs", {
  id: id(), requestedByUserId: uuid("requested_by_user_id").notNull().references(() => user.id, { onDelete: "restrict" }), kind: text("kind").notNull(), filters: object("filters").notNull().default({}),
  status: text("status").notNull().default("pending"), resultMediaId: uuid("result_media_id").references(() => mediaAssets.id, { onDelete: "restrict" }), completedAt: time("completed_at"), expiresAt: time("expires_at").notNull(), createdAt: createdAt(),
}, t => [index("export_jobs_owner_idx").on(t.requestedByUserId, t.createdAt), index("export_jobs_media_idx").on(t.resultMediaId), index("export_jobs_expiry_idx").on(t.expiresAt), check("export_jobs_fields_valid", sql`${t.kind} IN ('orders','customers','catalog','audit') AND ${t.status} IN ('pending','running','completed','failed','expired') AND jsonb_typeof(${t.filters})='object' AND ${t.expiresAt}>${t.createdAt} AND (${t.status}<>'completed' OR (${t.resultMediaId} IS NOT NULL AND ${t.completedAt} IS NOT NULL))`)]);

export const notificationDeliveries = pgTable("notification_deliveries", {
  id: id(), eventId: uuid("event_id").references(() => outboxEvents.id, { onDelete: "restrict" }), recipientUserId: uuid("recipient_user_id").references(() => user.id, { onDelete: "restrict" }),
  recipientAddress: text("recipient_address").notNull(), purpose: text("purpose").notNull(), channel: text("channel").notNull().default("email"), consentEventId: uuid("consent_event_id").references(() => consentEvents.id, { onDelete: "restrict" }),
  dedupeKey: text("dedupe_key").notNull().unique(), payload: object("payload").notNull().default({}), status: text("status").notNull().default("deferred"), provider: text("provider"), providerReference: text("provider_reference"),
  availableAt: time("available_at").notNull().defaultNow(), sentAt: time("sent_at"), createdAt: createdAt(),
}, t => [uniqueIndex("notification_deliveries_provider_unique").on(t.provider, t.providerReference).where(sql`${t.providerReference} IS NOT NULL`), index("notification_deliveries_event_idx").on(t.eventId), index("notification_deliveries_user_idx").on(t.recipientUserId), index("notification_deliveries_consent_idx").on(t.consentEventId), index("notification_deliveries_ready_idx").on(t.availableAt, t.id).where(sql`${t.status}='pending'`), check("notification_deliveries_fields_valid", sql`${t.channel}='email' AND ${t.purpose} IN ('transactional','marketing') AND length(btrim(${t.recipientAddress}))>0 AND length(btrim(${t.dedupeKey}))>0 AND jsonb_typeof(${t.payload})='object' AND (${t.purpose}<>'marketing' OR ${t.consentEventId} IS NOT NULL) AND ${t.status} IN ('deferred','pending','leased','sent','failed','cancelled') AND (${t.status}<>'sent' OR (${t.sentAt} IS NOT NULL AND ${t.provider} IS NOT NULL AND ${t.providerReference} IS NOT NULL))`)]);

export const migrationRuns = pgTable("migration_runs", {
  id: id(), sourceNamespace: text("source_namespace").notNull(), sourceVersion: text("source_version").notNull(), sourceChecksum: text("source_checksum").notNull(),
  archiveMediaId: uuid("archive_media_id").references(() => mediaAssets.id, { onDelete: "restrict" }), manifest: object("manifest").notNull().default({}), counts: object("counts").notNull().default({}),
  status: text("status").notNull().default("pending"), reviewEpoch: bigint("review_epoch", { mode: "bigint" }).notNull().default(sql`0`), sourceCapturedAt: time("source_captured_at"), createdAt: createdAt(), finishedAt: time("finished_at"),
}, t => [index("migration_runs_source_idx").on(t.sourceNamespace, t.sourceChecksum), index("migration_runs_archive_idx").on(t.archiveMediaId), check("migration_runs_fields_valid", sql`length(btrim(${t.sourceNamespace}))>0 AND length(btrim(${t.sourceVersion}))>0 AND ${t.sourceChecksum} ~ '^[0-9a-f]{64}$' AND jsonb_typeof(${t.manifest})='object' AND jsonb_typeof(${t.counts})='object' AND ${t.reviewEpoch}>=0 AND ((${t.status} IN ('pending','running') AND ${t.finishedAt} IS NULL) OR (${t.status} IN ('completed','failed','quarantined') AND ${t.finishedAt} IS NOT NULL AND ${t.finishedAt}>=${t.createdAt}))`)]);

export const legacySourceRecords = pgTable("legacy_source_records", {
  id: id(), runId: uuid("run_id").notNull().references(() => migrationRuns.id, { onDelete: "restrict" }), entity: text("entity").notNull(), sourceKey: text("source_key").notNull(), recordChecksum: text("record_checksum").notNull(), payload: object("payload").notNull(), createdAt: createdAt(),
}, t => [unique("legacy_source_records_identity_unique").on(t.id, t.runId, t.entity, t.sourceKey), uniqueIndex("legacy_source_records_source_unique").on(t.runId, t.entity, t.sourceKey), check("legacy_source_records_fields_valid", sql`length(btrim(${t.entity}))>0 AND length(btrim(${t.sourceKey}))>0 AND ${t.recordChecksum} ~ '^[0-9a-f]{64}$' AND jsonb_typeof(${t.payload})='object' AND NOT (${t.entity}='admins' AND ${t.payload} ? 'password')`)]);
export const legacyIdMap = pgTable("legacy_id_map", {
  id: id(), sourceNamespace: text("source_namespace").notNull(), entity: text("entity").notNull(), sourceKey: text("source_key").notNull(), runId: uuid("run_id").notNull(), recordId: uuid("record_id").notNull(), targetType: text("target_type").notNull(), targetId: uuid("target_id").notNull(),
}, t => [foreignKey({ columns: [t.recordId, t.runId, t.entity, t.sourceKey], foreignColumns: [legacySourceRecords.id, legacySourceRecords.runId, legacySourceRecords.entity, legacySourceRecords.sourceKey] }).onDelete("restrict"), uniqueIndex("legacy_id_map_source_unique").on(t.sourceNamespace, t.entity, t.sourceKey), index("legacy_id_map_target_idx").on(t.targetType, t.targetId), check("legacy_id_map_fields_valid", sql`length(btrim(${t.sourceNamespace}))>0 AND length(btrim(${t.targetType}))>0`)]);
export const migrationIssues = pgTable("migration_issues", {
  id: id(), runId: uuid("run_id").notNull().references(() => migrationRuns.id, { onDelete: "restrict" }), entity: text("entity").notNull(), sourceKey: text("source_key").notNull(), fieldPath: text("field_path").notNull().default(""), code: text("code").notNull(), severity: text("severity").notNull().default("blocker"),
  disposition: text("disposition").notNull().default("open"), safeMessage: text("safe_message").notNull(), resolution: object("resolution"), resolvedAt: time("resolved_at"), createdAt: createdAt(),
}, t => [uniqueIndex("migration_issues_source_unique").on(t.runId, t.entity, t.sourceKey, t.fieldPath, t.code), index("migration_issues_gate_idx").on(t.runId, t.severity, t.disposition), check("migration_issues_fields_valid", sql`length(btrim(${t.entity}))>0 AND length(btrim(${t.code}))>0 AND length(btrim(${t.safeMessage}))>0 AND ${t.severity} IN ('warning','blocker') AND ((${t.disposition}='open' AND ${t.resolvedAt} IS NULL AND ${t.resolution} IS NULL) OR (${t.disposition} IN ('resolved','approved_quarantine') AND ${t.resolvedAt} IS NOT NULL AND ${t.resolution} IS NOT NULL AND jsonb_typeof(${t.resolution})='object'))`)]);
