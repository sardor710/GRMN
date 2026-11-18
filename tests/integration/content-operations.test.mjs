import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { readFile, mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";

let temporary, handle;
const priorOrder = randomUUID(), owner = randomUUID(), product = randomUUID();
const hash = value => createHash("sha256").update(value).digest("hex");
const q = (sql, values = []) => handle.pool.query(sql, values);
const reject = (sql, values, code = "23514") => assert.rejects(q(sql, values), e => { assert.equal(e.code, code); return true; });
before(async () => {
  temporary = await startTemporaryPostgres();
  handle = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "4" }));
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")), root = resolve("temp"), prior = await mkdtemp(join(root, "content-prior-"));
  assert.ok(prior.startsWith(root + sep));
  try {
    await mkdir(join(prior, "meta"));
    for (const entry of journal.entries.slice(0, 4)) await copyFile(`drizzle/${entry.tag}.sql`, join(prior, `${entry.tag}.sql`));
    await writeFile(join(prior, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 4) }));
    await migrate(handle.db, { migrationsFolder: prior });
  } finally { await rm(prior, { recursive: true, force: true }); }
  await q("INSERT INTO orders(id,order_number,contact_name,data_quality,total_minor,payment_mode) VALUES($1,'preserved-content-upgrade','Synthetic historical','legacy_incomplete',12345,'legacy_unknown')", [priorOrder]);
  await migrate(handle.db, { migrationsFolder: "drizzle" });
  await q("INSERT INTO users(id,name,email) VALUES($1,'Synthetic editor','editor@example.invalid')", [owner]);
  await q("INSERT INTO products(id,public_key,name) VALUES($1,'content-product','Synthetic product')", [product]);
}, { timeout: 120000 });
after(async () => { try { await handle?.close(); } finally { await temporary?.stop(); } }, { timeout: 45000 });

async function page() {
  const id = randomUUID(), version = randomUUID(), client = await handle.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO pages(id,key,kind,slug) VALUES($1,$2,'page',$2)", [id, id]);
    await client.query("INSERT INTO page_versions(id,page_id,page_kind,version,title,blocks) VALUES($1,$2,'page',1,'Қазақша / Русский / English','[{\"heroBanners\":[],\"carousels\":[]}]')", [version, id]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  return { id, version };
}

test("operations migration preserves prior orders, installs schema and replays safely", async () => {
  assert.equal((await q("SELECT to_regclass('audit_events') AS name")).rows[0].name, "audit_events");
  await migrate(handle.db, { migrationsFolder: "drizzle" });
  assert.deepEqual((await q("SELECT order_number,total_minor,snapshot_sealed FROM orders WHERE id=$1", [priorOrder])).rows[0], { order_number: "preserved-content-upgrade", total_minor: "12345", snapshot_sealed: true });
  assert.equal(Number((await q("SELECT count(*) FROM drizzle.__drizzle_migrations")).rows[0].count), JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")).entries.length);
});

test("content snapshots seal and publication cannot point to another page", async () => {
  const first = await page(), other = await page();
  await reject("UPDATE page_versions SET title='Rewritten' WHERE id=$1", [first.version]);
  await reject("UPDATE pages SET status='published' WHERE id=$1", [first.id]);
  await reject("INSERT INTO page_publications(page_id,version_id) VALUES($1,$2)", [first.id, other.version], "23503");
  await q("INSERT INTO page_publications(page_id,version_id) VALUES($1,$2)", [first.id, first.version]);
  await q("UPDATE pages SET status='published' WHERE id=$1", [first.id]);
  assert.equal((await q("SELECT title,snapshot_sealed FROM page_versions WHERE id=$1", [first.version])).rows[0].title, "Қазақша / Русский / English");
  await reject("INSERT INTO page_version_media(version_id,media_id,role) VALUES($1,$2,'hero')", [first.version, randomUUID()]);
});

test("curated product and authenticated wishlist memberships are unique and enforce foreign keys", async () => {
  const collection = randomUUID(), wishlist = randomUUID();
  await q("INSERT INTO merchandising_collections(id,key,name) VALUES($1,'synthetic-collection','Featured')", [collection]);
  await q("INSERT INTO collection_products(collection_id,product_id) VALUES($1,$2)", [collection, product]);
  await reject("INSERT INTO collection_products(collection_id,product_id) VALUES($1,$2)", [collection, product], "23505");
  await q("INSERT INTO wishlists(id,user_id) VALUES($1,$2)", [wishlist, owner]);
  await q("INSERT INTO wishlist_items(wishlist_id,product_id) VALUES($1,$2)", [wishlist, product]);
  await reject("INSERT INTO wishlist_items(wishlist_id,product_id) VALUES($1,$2)", [wishlist, product], "23505");
  await reject("INSERT INTO wishlists(id,user_id) VALUES($1,$2)", [randomUUID(), randomUUID()], "23503");
});

test("manual FX versions remain immutable and USD display requires an explicit valid rate", async () => {
  const rate = randomUUID();
  await reject("INSERT INTO exchange_rate_versions(id,version,kzt_per_usd) VALUES($1,1,0)", [rate]);
  await q("INSERT INTO exchange_rate_versions(id,version,kzt_per_usd,editor_user_id) VALUES($1,1,'500.12345678',$2)", [rate, owner]);
  await reject("UPDATE exchange_rate_versions SET kzt_per_usd=1 WHERE id=$1", [rate]);
  await reject("INSERT INTO store_settings(id,usd_display_enabled) VALUES(1,true)", []);
  await q("INSERT INTO store_settings(id,usd_display_enabled,active_exchange_rate_id) VALUES(1,true,$1)", [rate]);
  assert.equal((await q("SELECT kzt_per_usd FROM exchange_rate_versions WHERE id=$1", [rate])).rows[0].kzt_per_usd, "500.12345678");
});

test("shipping and tax policies reject negative money and preserve version history", async () => {
  const policy = randomUUID(), zone = randomUUID(), tax = randomUUID();
  await q("INSERT INTO shipping_policy_versions(id,version) VALUES($1,1)", [policy]);
  await q("INSERT INTO shipping_zones(id,key,name) VALUES($1,'test-zone','Synthetic zone')", [zone]);
  await reject("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'default',-1)", [randomUUID(), policy, zone]);
  await q("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'default',100)", [randomUUID(), policy, zone]);
  await q("INSERT INTO tax_configuration(id,version,mode,rate_bps) VALUES($1,1,'exclusive',1200)", [tax]);
  await reject("UPDATE tax_configuration SET rate_bps=0 WHERE id=$1", [tax]);
});

test("audit and outbox facts are append-only and stable event IDs deduplicate", async () => {
  const audit = randomUUID(), event = randomUUID();
  await q("INSERT INTO audit_events(id,action,target_type,dedupe_key) VALUES($1,'synthetic-edit','page','audit-one')", [audit]);
  await reject("DELETE FROM audit_events WHERE id=$1", [audit]);
  await q("INSERT INTO outbox_events(id,topic,dedupe_key,payload) VALUES($1,'synthetic.created','outbox-one','{}')", [event]);
  await reject("UPDATE outbox_events SET payload='{\"changed\":true}' WHERE id=$1", [event]);
  await reject("INSERT INTO outbox_events(id,topic,dedupe_key) VALUES($1,'synthetic.created','outbox-one')", [randomUUID()], "23505");
});

test("job claims have one winner and stale lease tokens cannot finish a reclaimed job", async () => {
  const job = randomUUID(), first = hash("lease-first"), second = hash("lease-second");
  await q("INSERT INTO job_runs(id,kind,dedupe_key) VALUES($1,'synthetic-job','job-one')", [job]);
  const claims = await Promise.all([1, 2].map(() => q("UPDATE job_runs SET status='leased',attempts=attempts+1,lease_owner='synthetic',lease_token_hash=$1,leased_until=now()+interval '1 minute' WHERE id=$2 AND status='pending' RETURNING id", [first, job])));
  assert.equal(claims.reduce((n, r) => n+r.rowCount, 0), 1);
  await q("UPDATE job_runs SET status='pending',lease_owner=NULL,lease_token_hash=NULL,leased_until=NULL WHERE id=$1", [job]);
  await q("UPDATE job_runs SET status='leased',attempts=attempts+1,lease_owner='synthetic',lease_token_hash=$1,leased_until=now()+interval '1 minute' WHERE id=$2", [second, job]);
  const stale = await q("UPDATE job_runs SET status='done',finished_at=now(),lease_owner=NULL,lease_token_hash=NULL,leased_until=NULL WHERE id=$1 AND status='leased' AND lease_token_hash=$2", [job, first]);
  assert.equal(stale.rowCount, 0);
  await reject("UPDATE job_runs SET status='done',lease_owner=NULL,lease_token_hash=NULL,leased_until=NULL WHERE id=$1", [job]);
});

test("unsigned webhook IDs cannot poison verified deduplication and raw bytes remain intact", async () => {
  const first = randomUUID(), duplicate = randomUUID(), body = Buffer.from('{"synthetic":true}');
  for (const id of [first, duplicate]) await q("INSERT INTO webhook_inbox(id,provider,environment,merchant_account,external_event_id,raw_body,body_sha256) VALUES($1,'kaspi','sandbox','synthetic','event-one',$2,$3)", [id, body, hash(body)]);
  await reject("UPDATE webhook_inbox SET status='processed' WHERE id=$1", [first]);
  await q("UPDATE webhook_inbox SET verification_state='verified',verified_at=now(),status='queued' WHERE id=$1", [first]);
  await reject("UPDATE webhook_inbox SET verification_state='verified',verified_at=now(),status='queued' WHERE id=$1", [duplicate], "23505");
  assert.deepEqual((await q("SELECT raw_body FROM webhook_inbox WHERE id=$1", [first])).rows[0].raw_body, body);
  await reject("UPDATE webhook_inbox SET raw_body=$1 WHERE id=$2", [Buffer.from("altered"), first]);
});

test("idempotency keys retain request hashes and export results must stay private", async () => {
  const key = randomUUID(), job = randomUUID(), asset = randomUUID();
  await q("INSERT INTO idempotency_records(id,actor_scope,operation,key,request_hash,expires_at) VALUES($1,'synthetic-owner','synthetic','key-1234567890123456',$2,now()+interval '1 day')", [key, hash("request")]);
  await reject("UPDATE idempotency_records SET request_hash=$1 WHERE id=$2", [hash("different"), key]);
  await q("INSERT INTO media_assets(id,storage_namespace,storage_key,kind,visibility,status,mime_type,byte_size,checksum_sha256) VALUES($1,'test-export','result.csv','document','public','ready','text/csv',0,$2)", [asset, hash("")]);
  await q("INSERT INTO export_jobs(id,requested_by_user_id,kind,expires_at) VALUES($1,$2,'orders',now()+interval '1 day')", [job, owner]);
  await reject("UPDATE export_jobs SET status='completed',result_media_id=$1,completed_at=now() WHERE id=$2", [asset, job]);
  await q("UPDATE media_assets SET visibility='private' WHERE id=$1", [asset]);
  await q("UPDATE export_jobs SET status='completed',result_media_id=$1,completed_at=now() WHERE id=$2", [asset, job]);
});

test("notification sending stays deferred and marketing requires consent evidence", async () => {
  const id = randomUUID();
  await q("INSERT INTO notification_deliveries(id,dedupe_key,purpose,recipient_address) VALUES($1,'notify-one','transactional','synthetic@example.invalid')", [id]);
  assert.equal((await q("SELECT status FROM notification_deliveries WHERE id=$1", [id])).rows[0].status, "deferred");
  await reject("INSERT INTO notification_deliveries(id,dedupe_key,purpose,recipient_address) VALUES($1,'notify-marketing','marketing','synthetic@example.invalid')", [randomUUID()]);
});

test("import records preserve unresolved fields and mappings remain owned by their source run", async () => {
  const run = randomUUID(), other = randomUUID(), record = randomUUID();
  for (const r of [run, other]) await q("INSERT INTO migration_runs(id,source_namespace,source_version,source_checksum) VALUES($1,'synthetic-source','v1',$2)", [r, hash("source")]);
  await q("INSERT INTO legacy_source_records(id,run_id,entity,source_key,record_checksum,payload) VALUES($1,$2,'products','original-key',$3,'{\"unresolved\":\"original\"}')", [record, run, hash("record")]);
  await reject("INSERT INTO legacy_id_map(id,source_namespace,entity,source_key,run_id,record_id,target_type,target_id) VALUES($1,'synthetic-source','products','original-key',$2,$3,'product',$4)", [randomUUID(), other, record, product], "23503");
  await q("INSERT INTO legacy_id_map(id,source_namespace,entity,source_key,run_id,record_id,target_type,target_id) VALUES($1,'synthetic-source','products','original-key',$2,$3,'product',$4)", [randomUUID(), run, record, product]);
  assert.equal((await q("SELECT payload FROM legacy_source_records WHERE id=$1", [record])).rows[0].payload.unresolved, "original");
});

async function privateAsset() {
  const id = randomUUID();
  await q("INSERT INTO media_assets(id,storage_namespace,storage_key,kind,visibility,status,mime_type,byte_size,checksum_sha256) VALUES($1,'private-test',$2,'document','private','ready','text/plain',0,$3)", [id, id, hash("")]);
  return id;
}
test("publication pointers cannot be removed through truncate", async () => { await reject("TRUNCATE page_publications", []); });
test("live idempotency retention cannot be bypassed through truncate", async () => { await reject("TRUNCATE idempotency_records", []); });
test("an export cannot transfer its requester or restart a completed result", async () => {
  const asset = await privateAsset(), job = randomUUID(), other = randomUUID();
  await q("INSERT INTO users(id,name,email) VALUES($1,'Other synthetic editor',$2)", [other, `${other}@example.invalid`]);
  await q("INSERT INTO export_jobs(id,requested_by_user_id,kind,expires_at) VALUES($1,$2,'orders',now()+interval '1 day')", [job, owner]);
  await q("UPDATE export_jobs SET status='completed',result_media_id=$1,completed_at=now() WHERE id=$2", [asset, job]);
  await reject("UPDATE export_jobs SET requested_by_user_id=$1 WHERE id=$2", [other, job]);
  await reject("UPDATE export_jobs SET status='pending' WHERE id=$1", [job]);
});
test("export and import archive privacy links survive expiry and cannot be severed", async () => {
  const asset = await privateAsset(), archive = await privateAsset(), job = randomUUID(), run = randomUUID();
  await q("INSERT INTO export_jobs(id,requested_by_user_id,kind,expires_at) VALUES($1,$2,'orders',now()+interval '1 day')", [job, owner]);
  await q("UPDATE export_jobs SET status='completed',result_media_id=$1,completed_at=now() WHERE id=$2", [asset, job]);
  await q("UPDATE export_jobs SET status='expired' WHERE id=$1", [job]);
  await reject("UPDATE export_jobs SET result_media_id=NULL WHERE id=$1", [job]);
  await reject("UPDATE media_assets SET visibility='public' WHERE id=$1", [asset]);
  await q("INSERT INTO migration_runs(id,source_namespace,source_version,source_checksum,archive_media_id) VALUES($1,'archive-source','v1',$2,$3)", [run, hash("source"), archive]);
  await reject("UPDATE migration_runs SET archive_media_id=NULL WHERE id=$1", [run]);
});
test("marketing evidence must match the recipient and its purpose", async () => {
  const profile = randomUUID(), grant = randomUUID(), unrelated = randomUUID();
  await q("INSERT INTO customer_profiles(id,user_id,name,email,entered_phone) VALUES($1,$2,'Synthetic consent owner','editor@example.invalid','+77000000000')", [profile, owner]);
  for (const [id, purpose] of [[grant, "newsletter"], [unrelated, "transactional_updates"]]) await q("INSERT INTO consent_events(id,profile_id,purpose,channel,action,policy_version,source) VALUES($1,$2,$3,'email','granted','synthetic-v1','test')", [id, profile, purpose]);
  await reject("INSERT INTO notification_deliveries(id,dedupe_key,purpose,recipient_address,recipient_user_id,consent_event_id) VALUES($1,$2,'marketing','someone-else@example.invalid',$3,$4)", [randomUUID(), randomUUID(), owner, grant]);
  await reject("INSERT INTO notification_deliveries(id,dedupe_key,purpose,recipient_address,recipient_user_id,consent_event_id) VALUES($1,$2,'marketing','editor@example.invalid',$3,$4)", [randomUUID(), randomUUID(), owner, unrelated]);
  await q("INSERT INTO notification_deliveries(id,dedupe_key,purpose,recipient_address,recipient_user_id,consent_event_id) VALUES($1,$2,'marketing','editor@example.invalid',$3,$4)", [randomUUID(), randomUUID(), owner, grant]);
});
test("an expired lease requires a fresh token and an incremented reclaim attempt", async () => {
  const id = randomUUID(), first = hash("expired-first"), second = hash("reclaimed-second");
  await q("INSERT INTO job_runs(id,kind,dedupe_key,max_attempts) VALUES($1,'expiry-test',$2,2)", [id, id]);
  await q("UPDATE job_runs SET status='leased',attempts=1,lease_owner='worker',lease_token_hash=$1,leased_until=clock_timestamp()+interval '1 second' WHERE id=$2", [first, id]);
  await delay(1200);
  await reject("UPDATE job_runs SET leased_until=now()+interval '1 minute' WHERE id=$1", [id]);
  await q("UPDATE job_runs SET attempts=2,lease_token_hash=$1,leased_until=now()+interval '1 minute' WHERE id=$2", [second, id]);
});
test("an exhausted attempt cannot return to an unclaimable pending queue", async () => {
  const id = randomUUID();
  await q("INSERT INTO job_runs(id,kind,dedupe_key,max_attempts) VALUES($1,'exhaustion-test',$2,1)", [id, id]);
  await q("UPDATE job_runs SET status='leased',attempts=1,lease_owner='worker',lease_token_hash=$1,leased_until=now()+interval '1 minute' WHERE id=$2", [hash(id), id]);
  await reject("UPDATE job_runs SET status='pending',lease_owner=NULL,lease_token_hash=NULL,leased_until=NULL WHERE id=$1", [id]);
});
test("leases must have finite expiration", async () => {
  const id = randomUUID();
  await q("INSERT INTO job_runs(id,kind,dedupe_key) VALUES($1,'finite-test',$2)", [id, id]);
  await reject("UPDATE job_runs SET status='leased',attempts=1,lease_owner='worker',lease_token_hash=$1,leased_until='infinity' WHERE id=$2", [hash(id), id]);
});
test("manual FX rejects PostgreSQL NaN", async () => {
  await reject("INSERT INTO exchange_rate_versions(id,version,kzt_per_usd) VALUES($1,9999,'NaN')", [randomUUID()]);
});
test("shipping activation and new bands cannot commit against stale repeatable-read snapshots", async () => {
  const policy = randomUUID(), zone = randomUUID();
  await q("INSERT INTO shipping_policy_versions(id,version) VALUES($1,2)", [policy]);
  await q("INSERT INTO shipping_zones(id,key,name) VALUES($1,'rr-zone','RR synthetic zone')", [zone]);
  await q("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'initial',100)", [randomUUID(), policy, zone]);
  const clients = await Promise.all([handle.pool.connect(), handle.pool.connect()]);
  try {
    for (const client of clients) { await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ"); await client.query("SELECT snapshot_sealed FROM shipping_policy_versions WHERE id=$1", [policy]); }
    const outcomes = await Promise.allSettled(clients.map(async (client, i) => {
      try {
        if (i===0) await client.query("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'new-band',200)", [randomUUID(), policy, zone]);
        else await client.query("UPDATE store_settings SET active_shipping_policy_id=$1 WHERE id=1", [policy]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    }));
    assert.equal(outcomes.filter(o => o.status === "fulfilled").length, 1);
    assert.equal(outcomes.find(o => o.status === "rejected").reason.code, "40001");
  } finally { for (const client of clients) client.release(); }
});
