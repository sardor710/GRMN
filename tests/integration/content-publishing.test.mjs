// Task 18A: scheduled publishing on Task 08's versioned CMS, draft isolation, restoring a prior
// version, slug redirects, rich-text sanitization, product-referenced merchandising collections,
// and authorized scoped media uploads (MIME, magic bytes, size, checksum, expiring grant, immutable
// key, private namespace, orphan cleanup after a grace period).
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {randomBytes,randomUUID,createHmac,createHash} from "node:crypto";
import {mkdtemp,rm,readdir} from "node:fs/promises";
import {existsSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {parseAuthConfig} from "../../src/server/auth/config.ts";
import {createAuthFoundation} from "../../src/server/auth/http.ts";
import {bootstrapFirstStaff} from "../../src/server/auth/bootstrap.ts";
import {requirePermission,requireStaffPrincipal} from "../../src/server/auth/principal.ts";

let temporary,database,runtime,admin,cms,content,media,storage,serial=0;
const secret=randomBytes(32).toString("hex");
const config=parseAuthConfig({AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:"http://localhost:3000",NODE_ENV:"test"});
const q=(sql,args=[])=>database.pool.query(sql,args);
async function rejectsWith(promise,status,code){await assert.rejects(promise,error=>{assert.equal(error.status,status,error.message);if(code)assert.equal(error.code,code,error.message);return true;});}
async function admitted(id){
  await q("UPDATE users SET two_factor_enabled=true WHERE id=$1",[id]);
  await q("INSERT INTO auth_two_factors(id,user_id,secret,backup_codes,verified) VALUES($1,$2,'synthetic-proof-fixture','synthetic-proof-fixture',true)",[randomUUID(),id]);
  const session=await(await runtime.auth.$context).internalAdapter.createSession(id);
  await q("INSERT INTO staff_session_grants(session_id,user_id,method) VALUES($1,$2,'totp')",[session.id,id]);
  return new Headers({cookie:`grmn-auth.session_token=${encodeURIComponent(session.token+"."+createHmac("sha256",config.secret).update(session.token).digest("base64"))}`});
}
const authorize=async(headers,permission)=>{await requireStaffPrincipal(runtime,headers);return requirePermission(runtime,headers,permission);};
const blog=extra=>({title:"Synthetic article "+(++serial),content:"Body "+serial,status:"published",category:"Fixture",...extra});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const publicBlog=async slug=>(await cms.publicContent("blog",{slug})).items[0];
const pageVersion=async id=>(await q("SELECT version FROM pages WHERE id=$1",[id])).rows[0].version;
const PNG=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),randomBytes(64)]);
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");

before(async()=>{
  temporary=await startTemporaryPostgres();database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"6",DATABASE_CONNECT_TIMEOUT_MS:"10000"}));
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  runtime=createAuthFoundation({database,config});
  const bootstrap=await bootstrapFirstStaff(database,{name:"Synthetic content operator",email:"content@example.invalid",password:randomBytes(24).toString("base64url")});
  admin=await admitted(bootstrap.userId);
  storage=await mkdtemp(path.join(os.tmpdir(),"grmn-media-test-"));
  cms=(await import("../../src/server/cms/service.ts")).createCMSService({pool:database.pool,authorize});
  content=(await import("../../src/server/content/publishing.ts")).createPublishingService({pool:database.pool,authorize});
  media=await import("../../src/server/content/media.ts");
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();if(storage)await rm(storage,{recursive:true,force:true});}},{timeout:45000});

test("draft isolation: a draft version of a live page never changes what the public sees until it is published",async()=>{
  const live=await cms.save("blogs",admin,blog({title:"Live title"}));
  const draft=await cms.save("blogs",admin,{...blog({title:"Draft title"}),id:live.id,version:live.version,slug:live.slug,draft:true});
  assert.equal(draft.title,"Draft title");
  assert.equal((await publicBlog(live.slug)).title,"Live title","the public still reads the published version");
  const versions=await content.versions(admin,live.id);
  assert.deepEqual(versions.items.map(v=>[v.version,v.published]),[[2,false],[1,true]]);
  await content.publish(admin,{pageId:live.id,versionId:versions.items[0].id,expectedPageVersion:await pageVersion(live.id)});
  assert.equal((await publicBlog(live.slug)).title,"Draft title");
  // A brand-new draft page is invisible.
  const hidden=await cms.save("blogs",admin,blog({title:"Never public",status:"draft"}));
  assert.equal(await publicBlog(hidden.slug),undefined);
});

test("publish conflicts: a stale page version is 409, and a version of another page is 404",async()=>{
  const a=await cms.save("blogs",admin,blog()),b=await cms.save("blogs",admin,blog());
  const [va]=(await content.versions(admin,a.id)).items,[vb]=(await content.versions(admin,b.id)).items;
  await rejectsWith(content.publish(admin,{pageId:a.id,versionId:va.id,expectedPageVersion:(await pageVersion(a.id))+5}),409,"VERSION_CONFLICT");
  await rejectsWith(content.publish(admin,{pageId:a.id,versionId:vb.id,expectedPageVersion:await pageVersion(a.id)}),404,"NOT_FOUND");
  // Publishing enqueues the cache invalidation in the same transaction.
  const before=(await q("SELECT count(*)::int AS n FROM outbox_events WHERE topic='content.published' AND aggregate_id=$1",[a.id])).rows[0].n;
  await content.publish(admin,{pageId:a.id,versionId:va.id,expectedPageVersion:await pageVersion(a.id)});
  assert.equal((await q("SELECT count(*)::int AS n FROM outbox_events WHERE topic='content.published' AND aggregate_id=$1",[a.id])).rows[0].n,before+1);
});

test("scheduled publishing: a future publication is invisible until its time and leaves the public lists",async()=>{
  const page=await cms.save("blogs",admin,blog({title:"Scheduled",status:"draft"}));
  const [version]=(await content.versions(admin,page.id)).items;
  const at=new Date(Date.now()+2500).toISOString();
  await content.publish(admin,{pageId:page.id,versionId:version.id,expectedPageVersion:await pageVersion(page.id),publishAt:at});
  assert.equal(await publicBlog(page.slug),undefined,"not before its time");
  assert.ok(!(await cms.publicContent("blog",{search:"Scheduled",limit:50})).items.some(item=>item.id===page.id),"not in public lists or the sitemap");
  await sleep(3000);
  assert.equal((await publicBlog(page.slug))?.title,"Scheduled");
  // A live page cannot be replaced by a future publication (it would go offline until then).
  const [again]=(await content.versions(admin,page.id)).items;
  await rejectsWith(content.publish(admin,{pageId:page.id,versionId:again.id,expectedPageVersion:await pageVersion(page.id),publishAt:new Date(Date.now()+60000).toISOString()}),409,"SCHEDULE_CONFLICT");
  // An end time takes it down; an end before the start is invalid.
  await rejectsWith(content.publish(admin,{pageId:page.id,versionId:again.id,expectedPageVersion:await pageVersion(page.id),unpublishAt:new Date(Date.now()-1000).toISOString()}),400,"INVALID_INPUT");
  await content.publish(admin,{pageId:page.id,versionId:again.id,expectedPageVersion:await pageVersion(page.id),unpublishAt:new Date(Date.now()+1500).toISOString()});
  await sleep(2000);
  assert.equal(await publicBlog(page.slug),undefined,"withdrawn at the end of its window");
});

test("rich text is sanitized on save: no scripts, handlers, javascript: links or embedded media",async()=>{
  const saved=await cms.save("blogs",admin,blog({content:'<p onclick="steal()">Hello <strong>world</strong><script>alert(1)</script><a href="javascript:alert(2)">bad</a> <a href="https://example.com/x" target="_blank">good</a><img src=x onerror="y()"><iframe src="https://evil.invalid"></iframe></p>',excerpt:"<b>Short</b><script>x()</script>"}));
  const body=String(saved.content),excerpt=String(saved.excerpt);
  for(const bad of ["<script","onclick","javascript:","onerror","<img","<iframe","alert(1)"])assert.ok(!body.includes(bad),bad+" survived: "+body);
  assert.ok(body.includes("<strong>world</strong>"),"allowed formatting is kept");
  assert.ok(body.includes('href="https://example.com/x"'),"safe links are kept");
  assert.ok(!excerpt.includes("<script"));
});

test("restoring a prior version creates a new version with the old content and can publish it",async()=>{
  const first=await cms.save("blogs",admin,blog({title:"First words"}));
  const second=await cms.save("blogs",admin,{...blog({title:"Second words"}),id:first.id,version:first.version,slug:first.slug});
  assert.equal((await publicBlog(first.slug)).title,"Second words");
  const versions=(await content.versions(admin,first.id)).items;
  const original=versions.find(v=>v.version===1);
  const restored=await content.restore(admin,{pageId:first.id,versionId:original.id,expectedPageVersion:await pageVersion(first.id),publish:true});
  assert.equal(restored.version,3);
  assert.equal((await publicBlog(first.slug)).title,"First words");
  assert.equal((await content.versions(admin,first.id)).items.length,3,"history is kept, never rewritten");
  assert.ok(second.version<restored.version);
});

test("slug changes leave a redirect; noindex and canonical data reach the public DTO",async()=>{
  const page=await cms.save("blogs",admin,blog({title:"Moving post",noIndex:true,canonicalUrl:"https://www.garmin.com/blog/canonical-target"}));
  const old=page.slug;
  await content.changeSlug(admin,{pageId:page.id,slug:"moved-post-"+serial,expectedPageVersion:await pageVersion(page.id)});
  assert.equal(await publicBlog(old),undefined);
  const moved=await publicBlog("moved-post-"+serial);
  assert.equal(moved.noIndex,true);assert.equal(moved.canonicalUrl,"https://www.garmin.com/blog/canonical-target");
  // The proxy answers old URLs from the redirects table through the catalog service.
  const catalog=(await import("../../src/server/catalog/service.ts")).createCatalogService({pool:database.pool});
  assert.deepEqual(await catalog.getRedirect("/blog/"+old),{targetPath:"/blog/moved-post-"+serial,statusCode:308});
  assert.equal(await catalog.getRedirect("/blog/never-existed"),null);
  await rejectsWith(content.changeSlug(admin,{pageId:page.id,slug:"bad slug!",expectedPageVersion:await pageVersion(page.id)}),400,"INVALID_INPUT");
});

test("homepage collections reference products; archived or unpublished products drop out of the public read",async()=>{
  const keys=[];
  for(let i=0;i<3;i++){const saved=await cms.save("products",admin,{name:"Collection item "+i,sku:"COL-"+i+"-"+serial,price:"100.00",status:"published",description:"x",image:"/images/products/x.jpg"});keys.push(saved.id);}
  const saved=await content.saveCollection(admin,{key:"homepage-featured",name:"Featured",productKeys:keys,expectedVersion:0});
  assert.equal((await content.readCollection("homepage-featured")),null,"a draft collection is not public");
  await content.publishCollection(admin,{key:"homepage-featured",expectedVersion:saved.version});
  assert.deepEqual((await content.readCollection("homepage-featured")).products.map(p=>p.id),keys);
  const middle=await cms.get("products",admin,keys[1]);
  await cms.archive("products",admin,keys[1],middle.version);
  assert.deepEqual((await content.readCollection("homepage-featured")).products.map(p=>p.id),[keys[0],keys[2]],"the deleted product reference is skipped, the order kept");
  await rejectsWith(content.saveCollection(admin,{key:"homepage-featured",name:"Featured",productKeys:["no-such-product"],expectedVersion:2}),404,"NOT_FOUND");
});

test("collection draft isolation: edits to a published collection stay invisible until it is published again",async()=>{
  const keys=[];
  for(let i=0;i<3;i++){const saved=await cms.save("products",admin,{name:"Isolated item "+i,sku:"ISO-"+i+"-"+(++serial),price:"100.00",status:"published",description:"x",image:"/images/products/x.jpg"});keys.push(saved.id);}
  const first=await content.saveCollection(admin,{key:"isolated-featured",name:"Live name",productKeys:keys,expectedVersion:0});
  const published=await content.publishCollection(admin,{key:"isolated-featured",expectedVersion:first.version});
  const edited=await content.saveCollection(admin,{key:"isolated-featured",name:"Draft name",productKeys:[keys[2],keys[0]],expectedVersion:published.version});
  assert.equal(edited.status,"published","a saved edit does not unpublish the live collection");
  let live=await content.readCollection("isolated-featured");
  assert.equal(live.name,"Live name","the public keeps the published name");
  assert.deepEqual(live.products.map(p=>p.id),keys,"the public keeps the published product list and order");
  await content.publishCollection(admin,{key:"isolated-featured",expectedVersion:edited.version});
  live=await content.readCollection("isolated-featured");
  assert.equal(live.name,"Draft name");
  assert.deepEqual(live.products.map(p=>p.id),[keys[2],keys[0]],"publishing replaces the snapshot");
});

test("uploads: scoped grant, type, size, content and checksum checks, immutable key, private namespace",async()=>{
  const svc=media.createMediaService({pool:database.pool,authorize,secret,storageDir:storage});
  await rejectsWith(svc.createUploadGrant(admin,{mimeType:"image/svg+xml",byteSize:PNG.length,checksumSha256:sha(PNG),altText:"x",visibility:"public"}),400,"INVALID_INPUT");
  await rejectsWith(svc.createUploadGrant(admin,{mimeType:"image/png",byteSize:6*1024*1024,checksumSha256:sha(PNG),altText:"x",visibility:"public"}),400,"INVALID_INPUT");
  const grant=await svc.createUploadGrant(admin,{mimeType:"image/png",byteSize:PNG.length,checksumSha256:sha(PNG),altText:"Fenix on a trail",visibility:"public"});
  assert.match(grant.uploadUrl,/^\/api\/admin\/media\/upload\?grant=/);
  await rejectsWith(svc.upload(grant.token,Buffer.concat([Buffer.from("GIF89a"),randomBytes(PNG.length-6)])),400,"MEDIA_CONTENT_MISMATCH");
  const wrong=Buffer.from(PNG);wrong[20]^=0xff;
  await rejectsWith(svc.upload(grant.token,wrong),409,"CHECKSUM_MISMATCH");
  const ready=await svc.upload(grant.token,PNG);
  assert.equal(ready.status,"ready");assert.equal(ready.altText,"Fenix on a trail");assert.match(ready.url,/^\/media\/[0-9a-f-]{36}\.png$/);
  await rejectsWith(svc.upload(grant.token,PNG),409,"GRANT_USED");
  const served=await media.readPublicMedia(database.pool,storage,ready.url.slice("/media/".length));
  assert.equal(served.mimeType,"image/png");assert.equal(sha(served.bytes),sha(PNG));
  // Private files are never served from the public route.
  const privateGrant=await svc.createUploadGrant(admin,{mimeType:"image/png",byteSize:PNG.length,checksumSha256:sha(PNG),altText:"internal",visibility:"private"});
  const hidden=await svc.upload(privateGrant.token,PNG);
  assert.equal(hidden.url,null);
  assert.equal(await media.readPublicMedia(database.pool,storage,hidden.storageKey),null);
  // An expired grant is refused.
  const late=media.createMediaService({pool:database.pool,authorize,secret,storageDir:storage,grantTtlMs:1});
  const expired=await late.createUploadGrant(admin,{mimeType:"image/png",byteSize:PNG.length,checksumSha256:sha(PNG),altText:"late",visibility:"public"});
  await sleep(20);
  await rejectsWith(late.upload(expired.token,PNG),410,"GRANT_EXPIRED");
  await rejectsWith(svc.upload("forged."+expired.token,PNG),403,"FORBIDDEN");
  await rejectsWith(svc.createUploadGrant(new Headers(),{mimeType:"image/png",byteSize:PNG.length,checksumSha256:sha(PNG),altText:"x",visibility:"public"}),401);
  // Alt text is editable.
  assert.equal((await svc.setAltText(admin,{mediaId:ready.id,altText:"New alt"})).altText,"New alt");
});

test("orphan cleanup archives unfinished and unreferenced uploads after the grace period, keeping referenced ones",async()=>{
  const svc=media.createMediaService({pool:database.pool,authorize,secret,storageDir:storage});
  const used=await svc.upload((await svc.createUploadGrant(admin,{mimeType:"image/png",byteSize:PNG.length,checksumSha256:sha(PNG),altText:"used",visibility:"public"})).token,PNG);
  const unused=await svc.upload((await svc.createUploadGrant(admin,{mimeType:"image/png",byteSize:PNG.length,checksumSha256:sha(PNG),altText:"unused",visibility:"public"})).token,PNG);
  const pending=await svc.createUploadGrant(admin,{mimeType:"image/png",byteSize:PNG.length,checksumSha256:sha(PNG),altText:"never uploaded",visibility:"public"});
  await cms.save("blogs",admin,blog({coverImage:used.url}));
  const fresh=await media.cleanupOrphanMedia(database.pool,storage,{graceMs:60*60*1000});
  assert.equal(fresh.archived,0,"nothing inside the grace period");
  await q("UPDATE media_assets SET created_at=created_at-interval '2 days',updated_at=updated_at-interval '2 days' WHERE id=ANY($1::uuid[])",[[used.id,unused.id,pending.mediaId]]);
  const swept=await media.cleanupOrphanMedia(database.pool,storage,{graceMs:60*60*1000});
  assert.ok(swept.archived>=2);
  const status=async id=>(await q("SELECT status FROM media_assets WHERE id=$1",[id])).rows[0].status;
  assert.equal(await status(used.id),"ready","a referenced asset is kept");
  assert.equal(await status(unused.id),"archived");
  assert.equal(await status(pending.mediaId),"archived");
  assert.equal(await media.readPublicMedia(database.pool,storage,unused.url.slice("/media/".length)),null,"archived media is no longer served");
  assert.ok(existsSync(path.join(storage,"public",unused.storageKey)),"archived files stay recoverable");
  assert.ok((await readdir(path.join(storage,"public"))).length>=2);
});

// Review fixes (Task 18A).
test("review I3/I5: a normal published save clears a stale window and enqueues invalidation",async()=>{
  const page=await cms.save("blogs",admin,blog({title:"Windowed"}));
  const [version]=(await content.versions(admin,page.id)).items;
  await content.publish(admin,{pageId:page.id,versionId:version.id,expectedPageVersion:await pageVersion(page.id),unpublishAt:new Date(Date.now()+1500).toISOString()});
  const before=(await q("SELECT count(*)::int AS n FROM outbox_events WHERE topic='content.published' AND aggregate_id=$1",[page.id])).rows[0].n;
  const current=await cms.get("blogs",admin,page.id);
  await cms.save("blogs",admin,{...blog({title:"Windowed again"}),id:page.id,version:current.version,slug:page.slug});
  assert.equal((await q("SELECT count(*)::int AS n FROM outbox_events WHERE topic='content.published' AND aggregate_id=$1",[page.id])).rows[0].n,before+1,"the normal publish path invalidates too");
  await sleep(2000);
  assert.equal((await publicBlog(page.slug))?.title,"Windowed again","the old end time no longer applies");
});

test("review I4: the homepage cannot be scheduled offline",async()=>{
  await cms.saveHomepage(admin,{version:0,config:{heroBanners:[],carousels:[],promoTiles:[],storyTiles:[],categoryTiles:[]}});
  const id=(await q("SELECT id FROM pages WHERE kind='homepage'")).rows[0].id;
  const [version]=(await content.versions(admin,id)).items;
  await rejectsWith(content.publish(admin,{pageId:id,versionId:version.id,expectedPageVersion:await pageVersion(id),unpublishAt:new Date(Date.now()+60000).toISOString()}),409,"HOMEPAGE_ALWAYS_LIVE");
  await rejectsWith(content.publish(admin,{pageId:id,versionId:version.id,expectedPageVersion:await pageVersion(id),publishAt:new Date(Date.now()+60000).toISOString()}),409,"HOMEPAGE_ALWAYS_LIVE");
});

test("excerpts are stored as plain text",async()=>{
  const saved=await cms.save("blogs",admin,blog({excerpt:"<b>Short</b> & sweet"}));
  assert.equal(saved.excerpt,"Short & sweet");
});
