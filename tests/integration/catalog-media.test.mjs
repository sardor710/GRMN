import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";

let temporary, handle;
const productId = randomUUID(), otherProductId = randomUUID(), simpleVariantId = randomUUID();
async function constraint(query, code) {
  await assert.rejects(handle.db.execute(query), (error) => { assert.equal(error.cause?.code ?? error.code, code); return true; });
}
before(async () => {
  temporary = await startTemporaryPostgres();
  handle = createDatabase(parseServerEnv({ DATABASE_URL: temporary.url, DATABASE_POOL_MAX: "3" }));
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const tempRoot = resolve("temp");
  const prior = await mkdtemp(join(tempRoot, "catalog-prior-"));
  if (!prior.startsWith(tempRoot + sep)) throw new Error("Invalid prior migration fixture directory");
  try {
    await mkdir(join(prior, "meta"));
    await copyFile("drizzle/0000_identity-customers.sql", join(prior, "0000_identity-customers.sql"));
    await writeFile(join(prior, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }));
    await migrate(handle.db, { migrationsFolder: prior });
  } finally { await rm(prior, { recursive: true, force: true }); }
  await handle.db.execute(sql`INSERT INTO users (id,name,email) VALUES (${randomUUID()},'Prior migration sentinel','prior@example.invalid')`);
  await migrate(handle.db, { migrationsFolder: "drizzle" });
  await handle.db.execute(sql`INSERT INTO products (id,public_key,name) VALUES (${productId},'preserved-legacy-key','Қазақша / Русский / English'),(${otherProductId},'other-product','Other synthetic product')`);
  await handle.db.execute(sql`INSERT INTO product_variants (id,product_id,sku,is_default,status) VALUES (${simpleVariantId},${productId},'Synthetic-SKU',true,'active')`);
}, { timeout: 120000 });
after(async () => { try { await handle?.close(); } finally { await temporary?.stop(); } }, { timeout: 45000 });

test("catalog migration upgrades identity history, preserves prior rows and replays safely", async () => {
  await migrate(handle.db, { migrationsFolder: "drizzle" });
  const history = await handle.db.execute(sql`SELECT count(*)::integer AS count FROM drizzle.__drizzle_migrations`);
  const expectedCount = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")).entries.length;
  assert.equal(history.rows[0].count, expectedCount);
  const sentinel = await handle.db.execute(sql`SELECT name FROM users WHERE email='prior@example.invalid'`);
  assert.equal(sentinel.rows[0].name, "Prior migration sentinel");
  const original = await handle.db.execute(sql`SELECT public_key,name FROM products WHERE id=${productId}`);
  assert.deepEqual(original.rows[0], { public_key: "preserved-legacy-key", name: "Қазақша / Русский / English" });
});

test("public keys and case-insensitive SKUs are unique; a simple product has one default variant", async () => {
  await constraint(sql`INSERT INTO products (id,public_key,name) VALUES (${randomUUID()},'preserved-legacy-key','Duplicate')`, "23505");
  await constraint(sql`INSERT INTO product_variants (id,product_id,sku) VALUES (${randomUUID()},${otherProductId},'synthetic-sku')`, "23505");
  await constraint(sql`INSERT INTO product_variants (id,product_id,sku,is_default) VALUES (${randomUUID()},${productId},'Another-SKU',true)`, "23505");
  const result = await handle.db.execute(sql`SELECT count(*)::integer AS count FROM product_variants WHERE product_id=${productId} AND is_default`);
  assert.equal(result.rows[0].count, 1);
});

test("KZT price constraints preserve bigint precision and prevent duplicate active prices", async () => {
  await handle.db.execute(sql`INSERT INTO prices (id,variant_id,amount_minor) VALUES (${randomUUID()},${simpleVariantId},'9007199254740993')`);
  const row = await handle.db.execute(sql`SELECT currency,amount_minor FROM prices WHERE variant_id=${simpleVariantId}`);
  assert.deepEqual(row.rows[0], { currency: "KZT", amount_minor: "9007199254740993" });
  await constraint(sql`INSERT INTO prices (id,variant_id,amount_minor) VALUES (${randomUUID()},${simpleVariantId},1)`, "23505");
  await constraint(sql`INSERT INTO prices (id,variant_id,amount_minor,market) VALUES (${randomUUID()},${simpleVariantId},-1,'negative')`, "23514");
  await constraint(sql`INSERT INTO prices (id,variant_id,amount_minor,currency,market) VALUES (${randomUUID()},${simpleVariantId},1,'USD','display-only')`, "23514");
  await handle.db.execute(sql`UPDATE products SET status='archived' WHERE id=${productId}`);
  const saved = await handle.db.execute(sql`SELECT amount_minor FROM prices WHERE variant_id=${simpleVariantId}`);
  assert.equal(saved.rows[0].amount_minor, "9007199254740993");
});

test("variant selections enforce product/option ownership and unique completed combinations", async () => {
  const p = randomUUID(), option = randomUUID(), value = randomUUID(), first = randomUUID(), duplicate = randomUUID();
  await handle.db.execute(sql`INSERT INTO products (id,public_key,name) VALUES (${p},'variant-test','Variant fixture')`);
  await handle.db.execute(sql`INSERT INTO product_options (id,product_id,key,name) VALUES (${option},${p},'color','Color')`);
  await handle.db.execute(sql`INSERT INTO option_values (id,product_id,option_id,key,label) VALUES (${value},${p},${option},'black','Black')`);
  await handle.db.execute(sql`INSERT INTO product_variants (id,product_id,sku) VALUES (${first},${p},'Option-A'),(${duplicate},${p},'Option-B')`);
  await handle.db.execute(sql`INSERT INTO variant_option_values (variant_id,product_id,option_id,option_value_id) VALUES (${first},${p},${option},${value})`);
  await handle.db.execute(sql`UPDATE product_variants SET status='active' WHERE id=${first}`);
  await constraint(sql`INSERT INTO variant_option_values (variant_id,product_id,option_id,option_value_id) VALUES (${duplicate},${p},${option},${value})`, "23505");
  await constraint(sql`INSERT INTO variant_option_values (variant_id,product_id,option_id,option_value_id) VALUES (${duplicate},${otherProductId},${option},${value})`, "23503");
  await constraint(sql`UPDATE product_variants SET status='active' WHERE id=${duplicate}`, "23514");
  await constraint(sql`UPDATE product_variants SET option_signature=ARRAY[${value}]::uuid[] WHERE id=${duplicate}`, "23514");
});

test("category hierarchy rejects cycles and duplicate/orphan memberships", async () => {
  const root = randomUUID(), child = randomUUID();
  await handle.db.execute(sql`INSERT INTO categories (id,key,name) VALUES (${root},'root','Root')`);
  await handle.db.execute(sql`INSERT INTO categories (id,key,name,parent_id) VALUES (${child},'child','Child',${root})`);
  await constraint(sql`UPDATE categories SET parent_id=${child} WHERE id=${root}`, "23514");
  await handle.db.execute(sql`INSERT INTO product_categories (product_id,category_id) VALUES (${productId},${root})`);
  await constraint(sql`INSERT INTO product_categories (product_id,category_id) VALUES (${productId},${root})`, "23505");
  await constraint(sql`INSERT INTO product_categories (product_id,category_id) VALUES (${productId},${randomUUID()})`, "23503");
});

test("concurrent completed variant combinations have only one winner", async () => {
  const p = randomUUID(), option = randomUUID(), value = randomUUID(), first = randomUUID(), second = randomUUID();
  await handle.db.execute(sql`INSERT INTO products (id,public_key,name) VALUES (${p},'combination-race','Race fixture')`);
  await handle.db.execute(sql`INSERT INTO product_options (id,product_id,key,name) VALUES (${option},${p},'color','Color')`);
  await handle.db.execute(sql`INSERT INTO option_values (id,product_id,option_id,key,label) VALUES (${value},${p},${option},'white','White')`);
  await handle.db.execute(sql`INSERT INTO product_variants (id,product_id,sku) VALUES (${first},${p},'Race-A'),(${second},${p},'Race-B')`);
  const result = await Promise.allSettled([first, second].map((variant) => handle.db.execute(sql`INSERT INTO variant_option_values (variant_id,product_id,option_id,option_value_id) VALUES (${variant},${p},${option},${value})`)));
  assert.equal(result.filter((entry) => entry.status === "fulfilled").length, 1);
  const rejected = result.find((entry) => entry.status === "rejected");
  assert.equal(rejected.reason.cause?.code ?? rejected.reason.code, "23505");
  const saved = await handle.db.execute(sql`SELECT count(*)::integer AS count FROM product_variants WHERE product_id=${p} AND option_signature IS NOT NULL`);
  assert.equal(saved.rows[0].count, 1);
});

test("an atomic swap of two completed combinations commits while duplicate final combinations roll back", async () => {
  const p = randomUUID(), option = randomUUID(), red = randomUUID(), blue = randomUUID(), first = randomUUID(), second = randomUUID();
  await handle.db.execute(sql`INSERT INTO products (id,public_key,name) VALUES (${p},'atomic-swap','Swap fixture')`);
  await handle.db.execute(sql`INSERT INTO product_options (id,product_id,key,name) VALUES (${option},${p},'color','Color')`);
  await handle.db.execute(sql`INSERT INTO option_values (id,product_id,option_id,key,label) VALUES (${red},${p},${option},'red','Red'),(${blue},${p},${option},'blue','Blue')`);
  await handle.db.execute(sql`INSERT INTO product_variants (id,product_id,sku) VALUES (${first},${p},'Swap-A'),(${second},${p},'Swap-B')`);
  await handle.db.execute(sql`INSERT INTO variant_option_values (variant_id,product_id,option_id,option_value_id) VALUES (${first},${p},${option},${red}),(${second},${p},${option},${blue})`);
  await handle.db.execute(sql`UPDATE product_variants SET status='active' WHERE product_id=${p}`);
  const client = await handle.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE variant_option_values SET option_value_id=$1 WHERE variant_id=$2", [blue, first]);
    await client.query("UPDATE variant_option_values SET option_value_id=$1 WHERE variant_id=$2", [red, second]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  const rows = await handle.db.execute(sql`SELECT id,option_signature FROM product_variants WHERE product_id=${p}`);
  assert.deepEqual(rows.rows.find((row) => row.id === first).option_signature, [blue]);
  assert.deepEqual(rows.rows.find((row) => row.id === second).option_signature, [red]);
  await constraint(sql`UPDATE variant_option_values SET option_value_id=${blue} WHERE variant_id=${second}`, "23505");
  const preserved = await handle.db.execute(sql`SELECT option_value_id FROM variant_option_values WHERE variant_id=${second}`);
  assert.equal(preserved.rows[0].option_value_id, red);
});

test("competing category reparenting cannot create a cycle at read-committed or repeatable-read isolation", async () => {
  for (const isolation of ["READ COMMITTED", "REPEATABLE READ"]) {
    const a = randomUUID(), b = randomUUID();
    await handle.db.execute(sql`INSERT INTO categories (id,key,name) VALUES (${a},${a},'A'),(${b},${b},'B')`);
    const clients = await Promise.all([handle.pool.connect(), handle.pool.connect()]);
    try {
      for (const client of clients) {
        await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
        await client.query("SELECT epoch FROM catalog_taxonomy_guard WHERE id=1");
      }
      const results = await Promise.allSettled(clients.map(async (client, position) => {
        try {
          await client.query("UPDATE categories SET parent_id=$1 WHERE id=$2", position === 0 ? [b, a] : [a, b]);
          await client.query("COMMIT");
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      }));
      assert.equal(results.filter((entry) => entry.status === "fulfilled").length, 1);
      assert.equal(results.find((entry) => entry.status === "rejected").reason.code, isolation === "REPEATABLE READ" ? "40001" : "23514");
      const rows = await handle.db.execute(sql`SELECT id,parent_id FROM categories WHERE id IN (${a},${b})`);
      assert.equal(rows.rows.every((row) => row.parent_id !== null), false);
    } finally { for (const client of clients) client.release(); }
  }
});

test("typed attribute values reject mismatched types and unknown enum choices", async () => {
  const definition = randomUUID();
  await handle.db.execute(sql`INSERT INTO attribute_definitions (id,key,name,data_type) VALUES (${definition},'level','Level','enum')`);
  await handle.db.execute(sql`INSERT INTO attribute_enum_values (attribute_id,key,label) VALUES (${definition},'Premium','Premium')`);
  await handle.db.execute(sql`INSERT INTO product_attribute_values (product_id,attribute_id,data_type,enum_value) VALUES (${productId},${definition},'enum','Premium')`);
  await constraint(sql`UPDATE product_attribute_values SET enum_value='Unknown' WHERE product_id=${productId} AND attribute_id=${definition}`, "23503");
  await constraint(sql`UPDATE product_attribute_values SET number_value=1 WHERE product_id=${productId} AND attribute_id=${definition}`, "23514");
});

test("relations reject self-links and media associations cannot cross product ownership", async () => {
  await constraint(sql`INSERT INTO product_relations (source_product_id,target_product_id,relation_type) VALUES (${productId},${productId},'related')`, "23514");
  const asset = randomUUID();
  await handle.db.execute(sql`INSERT INTO media_assets (id,storage_namespace,storage_key,kind) VALUES (${asset},'synthetic','product.jpg','image')`);
  await handle.db.execute(sql`INSERT INTO product_media (id,product_id,media_id,is_primary) VALUES (${randomUUID()},${productId},${asset},true)`);
  await constraint(sql`INSERT INTO product_media (id,product_id,variant_id,media_id) VALUES (${randomUUID()},${otherProductId},${simpleVariantId},${asset})`, "23503");
  await constraint(sql`UPDATE media_assets SET byte_size=-1 WHERE id=${asset}`, "23514");
  await constraint(sql`UPDATE media_assets SET status='ready' WHERE id=${asset}`, "23514");
});
