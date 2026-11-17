// Task 13A: the cart API routes bind the session/capability-owned handler and stay closed (503, no-store)
// outside PostgreSQL + auth mode, where the browser keeps its local cart.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("every cart API route binds the cart handler and stays closed outside postgres+auth mode", async () => {
  const routes = { "": ["GET", "DELETE"], "lines": ["POST"], "lines/[variantId]": ["PUT", "DELETE"], "merge": ["POST"], "import": ["POST"], "acknowledge": ["POST"], "quote": ["POST"] };
  const saved = { AUTH_ENABLED: process.env.AUTH_ENABLED, CMS_BACKEND: process.env.CMS_BACKEND };
  try {
    for (const env of [{ CMS_BACKEND: "legacy", AUTH_ENABLED: "1" }, { CMS_BACKEND: "postgres", AUTH_ENABLED: "0" }]) {
      Object.assign(process.env, env);
      for (const [path, methods] of Object.entries(routes)) {
        const file = `src/app/api/cart/${path ? path + "/" : ""}route.ts`;
        const source = read(file); assert.match(source, /handleCartRequest/, file); assert.doesNotMatch(source, /cms\/store|request\.json/, file);
        const route = await import(`../../${file}`);
        assert.deepEqual(Object.keys(route).filter(key => /^[A-Z]+$/.test(key)).sort(), [...methods].sort(), file);
        for (const method of methods) {
          const url = "http://localhost:3000/api/cart" + (path ? "/" + path.replace("[variantId]", "00000000-0000-4000-8000-000000000000") : "");
          const response = await route[method](new Request(url, { method, headers: { origin: "http://localhost:3000" } }));
          assert.equal(response.status, 503, `${file} ${method}`); assert.equal(response.headers.get("cache-control"), "no-store");
        }
      }
    }
  } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
