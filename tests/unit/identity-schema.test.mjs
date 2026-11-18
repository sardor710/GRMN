import assert from "node:assert/strict";
import test from "node:test";
import { getAuthTables } from "better-auth/db";
import { getTableColumns } from "drizzle-orm";
import { authSchemaOptions } from "../../src/server/auth/schema-options.ts";
import { authTables } from "../../src/server/db/auth-tables.ts";

test("identity schema contains every field required by pinned core, phone, MFA and shared rate-limit storage", () => {
  const expected = getAuthTables(authSchemaOptions);
  assert.deepEqual(Object.keys(authTables).sort(), Object.keys(expected).sort());
  for (const [model, definition] of Object.entries(expected)) {
    const columns = getTableColumns(authTables[model]);
    assert.ok(columns.id, `${model}.id`);
    for (const [field, attributes] of Object.entries(definition.fields)) {
      assert.ok(columns[attributes.fieldName ?? field], `${model}.${field}`);
      if (attributes.required) assert.equal(columns[attributes.fieldName ?? field].notNull, true, `${model}.${field} required`);
    }
  }
});

test("schema options cannot create fake-email users or send an OTP", async () => {
  const phone = authSchemaOptions.plugins.find((plugin) => plugin.id === "phone-number");
  assert.equal(phone.options.signUpOnVerification, undefined);
  await assert.rejects(phone.options.sendOTP({ phoneNumber: "+77000000000", code: "000000" }), /not configured/);
  assert.equal(authSchemaOptions.advanced.database.generateId, "uuid");
  assert.equal(authSchemaOptions.rateLimit.storage, "database");
});
