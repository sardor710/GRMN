import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// Compile the actual legacy module against a synthetic disk fixture. Only the
// failing OS write is replaced; no real source records or global cwd are used.
function fixture(t, failWrite = true, mode = "legacy") {
  const root = path.resolve("temp");
  const directory = fs.mkdtempSync(path.join(root, "cms-write-test-"));
  t.after(() => {
    assert.ok(directory.startsWith(root + path.sep));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const file = path.join(directory, "src/lib/cms/data.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data = { products: [{ id: "synthetic-product", name: "Original", price: 10 }], activities: [] };
  fs.writeFileSync(file, JSON.stringify(data));
  const io = { ...fs, writeFileSync: (...args) => {
    if (failWrite && args[0] === file) throw new Error("INERT_PRIVATE_DISK_DETAIL");
    return fs.writeFileSync(...args);
  } };
  const compiled = ts.transpileModule(fs.readFileSync("src/lib/cms/store.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const cms = {};
  new Function("require", "exports", "process", "console", compiled)(name => {
    if (name === "fs") return io;
    if (name === "path") return path;
    if (name === "./data.json") return structuredClone(data);
    if (name === "./seed") return { initialCMSData: structuredClone(data) };
    if (name === "./product-variants") return { syncLegacyFields: product => product };
    if (name === "./homepage-schema") return { createDefaultHomepageConfig: () => ({heroBanners:[],carousels:[],promoTiles:[],storyTiles:[],categoryTiles:[]}) };
    return {};
  }, cms, { cwd: () => directory, env: {CMS_BACKEND:mode} }, { error() {} });
  return { cms, file, data };
}

test("actual CMS product save rejects a failed disk write instead of reporting saved", t => {
  const { cms, file, data } = fixture(t);
  assert.throws(() => cms.saveProduct({ id: "synthetic-product", name: "Changed", price: 10 }), /CMS persistence is unavailable/);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), data);
});

test("a missing source after a rejected CMS save is unavailable rather than cached seed content", t => {
  const { cms, file } = fixture(t);
  try { cms.saveProduct({ id: "synthetic-product", name: "Changed", price: 10 }); } catch {}
  fs.unlinkSync(file);
  assert.throws(() => cms.getProducts(), /CMS persistence is unavailable/);
});

test("legacy homepage default reads never mutate the source file",t=>{
  const {cms,file}=fixture(t,false),before=fs.readFileSync(file,"utf8");
  assert.deepEqual(cms.getHomepageConfig().heroBanners,[]);assert.equal(fs.readFileSync(file,"utf8"),before);
});
test("selected PostgreSQL mode cannot accidentally read or write through legacy exports",t=>{
  const {cms,file}=fixture(t,false,"postgres"),before=fs.readFileSync(file,"utf8");
  assert.throws(()=>cms.getProducts(),/Legacy CMS access/);
  assert.throws(()=>cms.saveProduct({name:"Blocked",price:1}),/Legacy CMS access/);
  assert.equal(fs.readFileSync(file,"utf8"),before);
});

test("a successful CMS save still persists the requested edit", t => {
  const { cms, file } = fixture(t, false);
  cms.saveProduct({ id: "synthetic-product", name: "Changed", price: 10 });
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).products[0].name, "Changed");
});
