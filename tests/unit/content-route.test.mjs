// Task 18A: the content and media routes are thin Node-runtime delegates to the guarded runtime,
// and the public /media route never reads private storage.
import assert from "node:assert/strict";
import {test} from "node:test";
import {existsSync,readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
const count=(source,text)=>source.split(text).length-1;

test("admin content and media routes delegate to the guarded admin runtime",()=>{
  const routes=[
    ["src/app/api/admin/content/route.ts",'handleAdminRequest("content", request)',["GET","POST"]],
    ["src/app/api/admin/media/route.ts",'handleAdminRequest("media", request)',["POST","PATCH"]],
    ["src/app/api/admin/media/upload/route.ts","handleMediaUpload(request)",["PUT"]],
  ];
  for(const [file,call,methods] of routes){
    assert.ok(existsSync(new URL("../../"+file,import.meta.url)),file+" is missing");
    const route=read(file);
    assert.match(route,/export const runtime = "nodejs"/);
    for(const method of methods)assert.ok(route.includes(`export async function ${method}(request: Request)`),file+" "+method);
    assert.equal(count(route,call),methods.length,file);
    assert.doesNotMatch(route,/pg|drizzle|cms\/store|data\.json/);
  }
  const admin=read("src/server/auth/admin-runtime.ts");
  assert.match(admin,/resource === "content"/);assert.match(admin,/resource === "media"/);
});

test("the content runtime is PostgreSQL-only, staff-guarded, and the public media route serves only public files",()=>{
  const runtime=read("src/server/content/runtime.ts"),media=read("src/server/content/media.ts"),route=read("src/app/media/[...key]/route.ts");
  assert.match(runtime,/cmsBackend\(\) !== "postgres"/);
  assert.match(runtime,/requireStaffPrincipal/);
  assert.match(runtime,/requirePermission\(/);
  assert.match(route,/handlePublicMedia/);
  assert.match(media,/storage_namespace='cms-public' AND visibility='public' AND status='ready'/);
  assert.match(media,/folder\(storageDir, "public"\)/);
});
