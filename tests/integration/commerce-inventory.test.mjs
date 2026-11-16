import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { readFile, mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";

let temporary, handle;
const product = randomUUID(), variant = randomUUID(), location = randomUUID(), userId = randomUUID();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const query = (sql, values = []) => handle.pool.query(sql, values);
const rejects = (sql, values, code = "23514") => assert.rejects(query(sql, values), (error) => { assert.equal(error.code, code); return true; });
before(async () => {
  temporary = await startTemporaryPostgres();
  handle = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "4" }));
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const root = resolve("temp"), prior = await mkdtemp(join(root, "commerce-prior-"));
  assert.ok(prior.startsWith(root + sep));
  try {
    await mkdir(join(prior, "meta"));
    for (const entry of journal.entries.slice(0, 2)) await copyFile(`drizzle/${entry.tag}.sql`, join(prior, `${entry.tag}.sql`));
    await writeFile(join(prior, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 2) }));
    await migrate(handle.db, { migrationsFolder: prior });
  } finally { await rm(prior, { recursive: true, force: true }); }
  await query("INSERT INTO users(id,name,email) VALUES($1,'Synthetic buyer','commerce@example.invalid')", [userId]);
  await query("INSERT INTO products(id,public_key,name) VALUES($1,'commerce-sentinel','Қазақша / Русский / English')", [product]);
  await query("INSERT INTO product_variants(id,product_id,sku,is_default,status) VALUES($1,$2,'Commerce-SKU',true,'active')", [variant, product]);
  await migrate(handle.db, { migrationsFolder: "drizzle" });
}, { timeout: 120000 });
after(async () => { try { await handle?.close(); } finally { await temporary?.stop(); } }, { timeout: 45000 });

async function cart() {
  const id = randomUUID();
  await query("INSERT INTO carts(id,guest_token_hash,expires_at) VALUES($1,$2,now()+interval '1 day')", [id, hash(id)]);
  return id;
}
async function order({ legacy = false, unit = "100", quantity = 2, attemptId = null } = {}) {
  const id = randomUUID(), item = randomUUID();
  const subtotal = (BigInt(unit) * BigInt(quantity)).toString();
  const client = await handle.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO orders(id,contact_name,contact_phone,data_quality,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,placed_at,checkout_attempt_id) VALUES($1,'Синтетический покупатель',$2,$3,$4,0,0,0,$4,now(),$5)", [id, legacy ? null : "+77000000000", legacy ? "legacy_incomplete" : "complete", subtotal, attemptId]);
    if (!legacy) {
      await client.query("INSERT INTO order_addresses(id,order_id,kind,recipient_name,phone,country_code,city,line1) VALUES($1,$2,'structured','Synthetic buyer','+77000000000','KZ','Алматы','Synthetic street')", [randomUUID(), id]);
      await client.query("INSERT INTO order_items(id,order_id,variant_id,product_id,product_key,sku,name,quantity,unit_price_minor,discount_minor,tax_minor,total_minor) VALUES($1,$2,$3,$4,'commerce-sentinel','Commerce-SKU','Қазақша товар',$5,$6,0,0,$7)", [item, id, variant, product, quantity, unit, subtotal]);
    }
    await client.query("COMMIT");
    return { id, item, subtotal };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

test("commerce migration upgrades prior catalog and identity, replays and retains source keys", async () => {
  const table = await query("SELECT to_regclass('inventory_balances') AS name");
  assert.equal(table.rows[0].name, "inventory_balances");
  await migrate(handle.db, { migrationsFolder: "drizzle" });
  assert.equal((await query("SELECT name FROM products WHERE id=$1", [product])).rows[0].name, "Қазақша / Русский / English");
  const expected = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")).entries.length;
  assert.equal(Number((await query("SELECT count(*) FROM drizzle.__drizzle_migrations")).rows[0].count), expected);
});

test("stock constraints and concurrent last-unit reservations prevent overselling", async () => {
  await query("INSERT INTO stock_locations(id,key,name) VALUES($1,'synthetic-main','Private warehouse')", [location]);
  await query("INSERT INTO inventory_balances(variant_id,location_id,on_hand,reserved) VALUES($1,$2,1,0)", [variant, location]);
  await rejects("UPDATE inventory_balances SET reserved=2 WHERE variant_id=$1", [variant]);
  await rejects("UPDATE inventory_balances SET on_hand=-1 WHERE variant_id=$1", [variant]);
  const attempts = await Promise.all([1, 2].map(() => query("UPDATE inventory_balances SET reserved=reserved+1 WHERE variant_id=$1 AND location_id=$2 AND on_hand-reserved>=1 RETURNING reserved", [variant, location])));
  assert.equal(attempts.reduce((sum, result) => sum + result.rowCount, 0), 1);
});

test("carts require one actor, deduplicate current account carts and bound item quantities", async () => {
  await rejects("INSERT INTO carts(id,expires_at) VALUES($1,now()+interval '1 day')", [randomUUID()]);
  await query("INSERT INTO carts(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [randomUUID(), userId]);
  await rejects("INSERT INTO carts(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [randomUUID(), userId], "23505");
  const id = await cart();
  await query("INSERT INTO cart_items(cart_id,variant_id,quantity) VALUES($1,$2,1)", [id, variant]);
  await rejects("UPDATE cart_items SET quantity=0 WHERE cart_id=$1", [id]);
  await rejects("UPDATE cart_items SET quantity=100 WHERE cart_id=$1", [id]);
  await rejects("INSERT INTO cart_items(cart_id,variant_id,quantity) VALUES($1,$2,1)", [id, variant], "23505");
});

test("order snapshots seal, preserve exact bigint values, and survive catalog/account edits", async () => {
  const saved = await order({ unit: "9007199254740993" });
  const row = (await query("SELECT order_number,total_minor,snapshot_sealed,payment_status FROM orders WHERE id=$1", [saved.id])).rows[0];
  assert.match(row.order_number, /^GRM-[0-9]+$/);
  assert.equal(row.total_minor, "18014398509481986");
  assert.equal(row.snapshot_sealed, true);
  assert.equal(row.payment_status, "unpaid");
  await rejects("UPDATE orders SET total_minor=total_minor+1 WHERE id=$1", [saved.id]);
  await rejects("UPDATE order_items SET name='Rewritten' WHERE id=$1", [saved.item]);
  await rejects("DELETE FROM order_addresses WHERE order_id=$1", [saved.id]);
  await rejects("UPDATE orders SET snapshot_sealed=false WHERE id=$1", [saved.id]);
  await rejects("INSERT INTO order_items(id,order_id,name,quantity,unit_price_minor,discount_minor,tax_minor,total_minor) VALUES($1,$2,'Late free item',1,0,0,0,0)", [randomUUID(), saved.id]);
  await query("UPDATE products SET name='Changed catalog',status='archived' WHERE id=$1", [product]);
  assert.equal((await query("SELECT name FROM order_items WHERE id=$1", [saved.item])).rows[0].name, "Қазақша товар");
  await rejects("DELETE FROM product_variants WHERE id=$1", [variant], "23001");
});

test("complete orders reject missing snapshots and inconsistent line totals; legacy facts stay explicit", async () => {
  await rejects("INSERT INTO orders(id,contact_name,contact_phone,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,placed_at) VALUES($1,'Synthetic','+77000000000',100,0,0,0,100,now())", [randomUUID()]);
  const legacy = await order({ legacy: true });
  assert.equal((await query("SELECT data_quality,contact_phone FROM orders WHERE id=$1", [legacy.id])).rows[0].contact_phone, null);
  await rejects("INSERT INTO orders(id,order_number,contact_name,data_quality,currency,total_minor) VALUES($1,'legacy-usd','Historical','legacy_incomplete','USD',100)", [randomUUID()]);
  const saved = await order();
  await rejects("INSERT INTO orders(id,order_number,contact_name,data_quality,total_minor) SELECT $1,order_number,'Duplicate','legacy_incomplete',0 FROM orders WHERE id=$2", [randomUUID(), saved.id], "23505");
  await query("UPDATE orders SET order_status='cancel_requested',version=version+1 WHERE id=$1", [saved.id]);
  const client = await handle.pool.connect(), mismatch = randomUUID();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO orders(id,contact_name,contact_phone,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,placed_at) VALUES($1,'Synthetic','+77000000000',100,0,0,0,100,now())", [mismatch]);
    await client.query("INSERT INTO order_addresses(id,order_id,kind,recipient_name,phone,country_code,city,line1) VALUES($1,$2,'structured','Synthetic','+77000000000','KZ','Almaty','Synthetic street')", [randomUUID(), mismatch]);
    await client.query("INSERT INTO order_items(id,order_id,name,quantity,unit_price_minor,discount_minor,tax_minor,total_minor) VALUES($1,$2,'Mismatched sum',1,99,0,0,99)", [randomUUID(), mismatch]);
    await assert.rejects(client.query("COMMIT"), error => error.code === "23514");
    await client.query("ROLLBACK");
  } finally { client.release(); }
  assert.equal((await query("SELECT id FROM orders WHERE id=$1", [mismatch])).rowCount, 0);
});

test("order events and stock movements are append-only and deduplicated; capabilities require hashes", async () => {
  const saved = await order(), event = randomUUID(), movement = randomUUID();
  await query("INSERT INTO order_events(id,order_id,type,source,dedupe_key,payload) VALUES($1,$2,'created','test','synthetic-event','{}')", [event, saved.id]);
  await rejects("UPDATE order_events SET type='fabricated' WHERE id=$1", [event]);
  await rejects("TRUNCATE order_events", []);
  await rejects("INSERT INTO order_events(id,order_id,type,source,dedupe_key) VALUES($1,$2,'created','test','synthetic-event')", [randomUUID(), saved.id], "23505");
  await query("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key) VALUES($1,$2,$3,1,0,'receive','synthetic-receive')", [movement, variant, location]);
  await rejects("DELETE FROM stock_movements WHERE id=$1", [movement]);
  await rejects("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key) VALUES($1,$2,$3,1,0,'receive','synthetic-receive')", [randomUUID(), variant, location], "23505");
  await rejects("INSERT INTO order_access_tokens(id,order_id,token_hash,expires_at) VALUES($1,$2,'raw-token',now()+interval '1 day')", [randomUUID(), saved.id]);
});

test("quotes and checkout attempts bind a cart revision and allow one checkout winner", async () => {
  const id = await cart(), quote = randomUUID(), attempt = randomUUID();
  await query("INSERT INTO checkout_quotes(id,cart_id,cart_version,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,expires_at) VALUES($1,$2,1,100,0,0,0,100,now()+interval '10 minutes')", [quote, id]);
  await query("INSERT INTO checkout_attempts(id,cart_id,cart_version,quote_id,actor_scope,idempotency_key,request_hash) VALUES($1,$2,1,$3,'synthetic-guest','synthetic-key-0001',$4)", [attempt, id, quote, hash("payload")]);
  await rejects("INSERT INTO checkout_attempts(id,cart_id,cart_version,quote_id,actor_scope,idempotency_key,request_hash) VALUES($1,$2,1,$3,'synthetic-guest','synthetic-key-0002',$4)", [randomUUID(), id, quote, hash("payload")], "23505");
  await rejects("UPDATE checkout_quotes SET total_minor=200 WHERE id=$1", [quote]);
  await rejects("INSERT INTO checkout_attempts(id,cart_id,cart_version,quote_id,actor_scope,idempotency_key,request_hash) VALUES($1,$2,2,$3,'synthetic-other','synthetic-key-0003',$4)", [randomUUID(), id, quote, hash("payload")], "23503");
});

test("reservation quantities reference stock; terminal states and allocation ownership are protected", async () => {
  const id = await cart(), quote = randomUUID(), attempt = randomUUID(), reservation = randomUUID(), line = randomUUID();
  await query("INSERT INTO checkout_quotes(id,cart_id,cart_version,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,expires_at) VALUES($1,$2,1,1,0,0,0,1,now()+interval '10 minutes')", [quote, id]);
  await query("INSERT INTO checkout_attempts(id,cart_id,cart_version,quote_id,actor_scope,idempotency_key,request_hash) VALUES($1,$2,1,$3,'reservation-fixture','synthetic-key-0004',$4)", [attempt, id, quote, hash("reservation")]);
  await query("INSERT INTO inventory_reservations(id,checkout_attempt_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')", [reservation, attempt]);
  await rejects("INSERT INTO reservation_lines(id,reservation_id,variant_id,location_id,quantity) VALUES($1,$2,$3,$4,0)", [line, reservation, variant, location]);
  await query("INSERT INTO reservation_lines(id,reservation_id,variant_id,location_id,quantity) VALUES($1,$2,$3,$4,1)", [line, reservation, variant, location]);
  await query("UPDATE inventory_reservations SET status='released',ended_at=now() WHERE id=$1", [reservation]);
  await rejects("UPDATE inventory_reservations SET status='active',ended_at=NULL WHERE id=$1", [reservation]);
  await rejects("UPDATE reservation_lines SET quantity=2 WHERE id=$1", [line]);
  const saved = await order({ attemptId: attempt }), consumed = randomUUID(), consumedLine = randomUUID();
  await rejects("INSERT INTO inventory_allocations(id,order_item_id,variant_id,location_id,quantity,reservation_line_id) VALUES($1,$2,$3,$4,1,$5)", [randomUUID(), saved.item, variant, location, line]);
  await query("INSERT INTO inventory_reservations(id,checkout_attempt_id,order_id,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')", [consumed, attempt, saved.id]);
  await query("INSERT INTO reservation_lines(id,reservation_id,variant_id,location_id,quantity) VALUES($1,$2,$3,$4,2)", [consumedLine, consumed, variant, location]);
  await query("UPDATE inventory_reservations SET status='consumed',ended_at=now() WHERE id=$1", [consumed]);
  await query("INSERT INTO inventory_allocations(id,order_item_id,variant_id,location_id,quantity,reservation_line_id) VALUES($1,$2,$3,$4,2,$5)", [randomUUID(), saved.item, variant, location, consumedLine]);
  await rejects("INSERT INTO inventory_allocations(id,order_item_id,variant_id,location_id,quantity,restored_quantity) VALUES($1,$2,$3,$4,1,2)", [randomUUID(), saved.item, variant, location]);
});

test("cart line cap is enforced across transactions, including concurrent final slots", async () => {
  const id = await cart(), p = randomUUID();
  await query("INSERT INTO products(id,public_key,name) VALUES($1,$2,'Many synthetic variants')", [p, p]);
  const variants = Array.from({ length: 101 }, () => randomUUID());
  // Archived fixture variants keep the no-option catalog combination invariant.
  for (const v of variants) await query("INSERT INTO product_variants(id,product_id,sku,status) VALUES($1,$2,$3,'archived')", [v, p, v]);
  const client = await handle.pool.connect();
  try {
    await client.query("BEGIN");
    for (const v of variants.slice(0, 99)) await client.query("INSERT INTO cart_items(cart_id,variant_id,quantity) VALUES($1,$2,1)", [id, v]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  const result = await Promise.allSettled(variants.slice(99).map(v => query("INSERT INTO cart_items(cart_id,variant_id,quantity) VALUES($1,$2,1)", [id, v])));
  assert.equal(result.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(result.find(r => r.status === "rejected").reason.code, "23514");
  assert.equal(Number((await query("SELECT count(*) FROM cart_items WHERE cart_id=$1", [id])).rows[0].count), 100);
});

test("concurrent order numbers are unique and checkout keys remain scoped after failure", async () => {
  const saved = await Promise.all([order(), order(), order()]);
  const numbers = await query("SELECT order_number FROM orders WHERE id=ANY($1::uuid[])", [saved.map(o => o.id)]);
  assert.equal(new Set(numbers.rows.map(o => o.order_number)).size, 3);
  const first = await cart(), second = await cart(), quoteA = randomUUID(), quoteB = randomUUID(), attempt = randomUUID();
  for (const [quote, c] of [[quoteA, first], [quoteB, second]]) await query("INSERT INTO checkout_quotes(id,cart_id,cart_version,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,expires_at) VALUES($1,$2,1,1,0,0,0,1,now()+interval '10 minutes')", [quote, c]);
  await query("INSERT INTO checkout_attempts(id,cart_id,cart_version,quote_id,actor_scope,idempotency_key,request_hash) VALUES($1,$2,1,$3,'key-fixture','synthetic-key-0005',$4)", [attempt, first, quoteA, hash("original")]);
  await rejects("UPDATE checkout_attempts SET request_hash=$1 WHERE id=$2", [hash("changed"), attempt]);
  await query("UPDATE checkout_attempts SET status='failed' WHERE id=$1", [attempt]);
  await rejects("INSERT INTO checkout_attempts(id,cart_id,cart_version,quote_id,actor_scope,idempotency_key,request_hash) VALUES($1,$2,1,$3,'key-fixture','synthetic-key-0005',$4)", [randomUUID(), second, quoteB, hash("other")], "23505");
  const outcomes = await Promise.allSettled([1, 2].map(n => query("INSERT INTO checkout_attempts(id,cart_id,cart_version,quote_id,actor_scope,idempotency_key,request_hash) VALUES($1,$2,1,$3,'key-fixture',$4,$5)", [randomUUID(), first, quoteA, `synthetic-retry-000${n}`, hash("retry")])));
  assert.equal(outcomes.filter(o => o.status === "fulfilled").length, 1);
  assert.equal(outcomes.find(o => o.status === "rejected").reason.code, "23505");
});

test("a stock movement cannot mix reservation and allocation provenance from different orders", async () => {
  const c = await cart(), quote = randomUUID(), attempt = randomUUID(), reservation = randomUUID(), line = randomUUID();
  await query("INSERT INTO checkout_quotes(id,cart_id,cart_version,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,expires_at) VALUES($1,$2,1,200,0,0,0,200,now()+interval '10 minutes')", [quote, c]);
  await query("INSERT INTO checkout_attempts(id,cart_id,cart_version,quote_id,actor_scope,idempotency_key,request_hash) VALUES($1,$2,1,$3,'provenance-fixture','synthetic-key-0006',$4)", [attempt, c, quote, hash("provenance")]);
  const saved = await order({ attemptId: attempt });
  await query("INSERT INTO inventory_reservations(id,checkout_attempt_id,order_id,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')", [reservation, attempt, saved.id]);
  await query("INSERT INTO reservation_lines(id,reservation_id,variant_id,location_id,quantity) VALUES($1,$2,$3,$4,2)", [line, reservation, variant, location]);
  const other = (await query("SELECT a.id,i.order_id FROM inventory_allocations a JOIN order_items i ON i.id=a.order_item_id WHERE a.variant_id=$1 AND a.location_id=$2", [variant, location])).rows[0];
  assert.notEqual(other.order_id, saved.id);
  await rejects("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,reservation_line_id,allocation_id) VALUES($1,$2,$3,1,0,'compensate','contradictory-source',$4,$5)", [randomUUID(), variant, location, line, other.id]);
});
