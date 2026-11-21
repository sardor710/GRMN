import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { Permission, Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";
import { adminDTO, productInput, blogInput, bannerInput, homepageInput, exactMoneyVariantInput } from "../auth/admin-schemas.ts";
import { plainText, sanitizeRichText } from "../content/sanitize.ts";
import { CONTENT_INVALIDATE_KIND } from "../content/events.ts";
import { appendOutboxEvent } from "../operations/outbox.ts";
import { mergeTranslationsSafely } from "../../lib/cms/translation-input.ts";
import { PRODUCT_HTML_FIELDS, sanitizeProductInput } from "../../lib/cms/product-input.ts";
import { projectProduct, toMinor, type ProductDocument } from "./product-projection.ts";
import { PRICE_TO_PUBLISH } from "../../lib/cms/publish-price.ts";
import { BLOG_HTML_FIELDS } from "../../lib/cms/content-input.ts";
import { BANNER_SPEC, BLOG_SPEC, HOMEPAGE_SPEC, PRODUCT_SPEC } from "../../i18n/translate-record.ts";
import type { FieldSpec } from "../../i18n/translate-record.ts";

export type CMSResource = "products" | "blogs" | "banners" | "clients";
export interface CMSItem extends Record<string, unknown> { id: string; version: number }
export interface CMSPage { items: CMSItem[]; nextCursor: string | null }
interface Options { pool: Pool; authorize: (headers: Headers, permission: Permission) => Promise<Principal> }
const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const json = (value: unknown) => JSON.stringify(value);
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
const version = z.number().int().min(1).max(2147483646);
const identity = z.string().trim().min(1).max(128);
type ProductStatus = "published" | "draft" | "archived";
type BulkAction = "publish" | "draft" | "archive" | "delete";
export type BulkResult = { id: string; ok: true; version?: number } | { id: string; ok: false; code: string; message: string };
const BULK_STATUS: Record<Exclude<BulkAction, "delete">, ProductStatus> = { publish: "published", draft: "draft", archive: "archived" };
const statusCommand = z.object({ id: identity, version, status: z.enum(["published", "draft", "archived"]) }).strict();
const bulkCommand = z.object({ action: z.enum(["publish", "draft", "archive", "delete"]), items: z.array(z.object({ id: identity, version }).strict()).min(1).max(100) }).strict();
const money = z.union([z.string(),z.number()]).transform((value,ctx) => {
  const text=String(value), match=/^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(text);
  if(!match){ctx.addIssue({code:"custom",message:"Use exact KZT with at most two decimal places"});return z.NEVER;}
  const minor=BigInt(match[1])*BigInt(100)+BigInt((match[2]??"").padEnd(2,"0"));
  if(minor>BigInt("100000000000000")){ctx.addIssue({code:"custom",message:"Amount exceeds the supported range"});return z.NEVER;}
  return minor.toString();
});
// Task 24: ru/kk translation overlays (record.translations) are stored in product_translations and
// page_version_translations (migration 0019), validated and merged per locale like the legacy CMS.
const productCommand = productInput.extend({variants:z.array(exactMoneyVariantInput).max(500).optional(),id:identity.optional(),version:version.optional(),price:money,originalPrice:money.nullable().optional(),sku:z.string().trim().min(1).max(128)}).strict();
const blogCommand = blogInput.extend({id:z.uuid().optional(),version:version.optional(),slug:z.string().trim().max(200).regex(/^[\p{L}\p{N}_-]*$/u).optional(),draft:z.boolean().optional()}).strict();
// Task 18A: draft:true saves a new version without changing what is live (draft isolation).
const bannerCommand = bannerInput.extend({id:z.uuid().optional(),version:version.optional(),draft:z.boolean().optional()}).strict();
const clientCommand = z.object({id:z.uuid().optional(),version:version.optional(),name:z.string().trim().min(1).max(200),phone:z.string().trim().min(1).max(64),email:z.union([z.email().max(254),z.literal("")]).optional(),country:z.string().regex(/^(?:[A-Z]{2})?$/).optional(),status:z.enum(["active","vip","pending","suspended"]).optional(),avatar:z.string().max(2048).optional(),notes:z.string().max(10000).optional()}).strict();
const querySchema = z.object({limit:z.number().int().min(1).max(100).default(20),cursor:z.string().max(2048).optional(),search:z.string().trim().max(200).default(""),status:z.string().max(30).optional(),family:z.string().max(200).optional(),category:z.string().max(200).optional()}).strict();
// The message names the offending fields (paths only, never values) so staff can fix the form.
function parse<T>(schema:z.ZodType<T>, value:unknown):T { const result=schema.safeParse(value);if(!result.success){const fields=[...new Set(result.error.issues.map(issue=>issue.path.join(".")||(issue.code==="unrecognized_keys"?(issue as {keys?:string[]}).keys?.join(", "):"")).filter(Boolean))].slice(0,5);return fail("INVALID_INPUT",400,`Invalid or unknown fields${fields.length?": "+fields.join("; "):""}`);}return result.data; }
const LOCALES=["ru","kk"] as const;
/** Validates `incoming` and merges it per locale with `stored` (a sent locale replaces, blank removes). */
function mergedTranslations(stored:unknown,incoming:unknown,spec:FieldSpec,html?:Record<string,(value:string)=>string>):Record<string,unknown>{
  if(incoming===undefined)return record(stored);
  if(incoming!==null&&typeof incoming==="object"&&!Array.isArray(incoming)&&Object.keys(incoming).some(key=>!(LOCALES as readonly string[]).includes(key)))return fail("INVALID_INPUT",400,"Invalid translations: only ru and kk can be translated");
  if(incoming!==null&&typeof incoming==="object"&&Object.values(incoming).some(value=>value===null||typeof value!=="object"||Array.isArray(value)))return fail("INVALID_INPUT",400,"Invalid translations: each locale must be an object");
  const merged=mergeTranslationsSafely({translations:record(stored)},incoming,spec,html);
  if(!merged.ok)return fail("INVALID_INPUT",400,`Invalid translations: ${merged.error}`);
  return merged.translations;
}
/**
 * Task 2.2: variant translations (translations.<locale>.variants[<editor variant id>].content) follow the
 * saved document. A locale that was sent without a `variants` key keeps its stored ones (an older form
 * must not wipe them; `variants: {}` clears them). Only blocks the variant owns are kept, for variants
 * that still exist; absent blocks are never invented.
 */
function variantTranslations(translations:Record<string,unknown>,stored:unknown,incoming:unknown,variants:unknown):Record<string,unknown>{
  const owned=new Map<string,Record<string,unknown>>();
  if(Array.isArray(variants))for(const v of variants){const item=record(v);if(typeof item.id==="string"&&item.content!==null&&typeof item.content==="object"&&!Array.isArray(item.content))owned.set(item.id,record(item.content));}
  const out:Record<string,unknown>={};
  for(const locale of LOCALES){
    const overlay=translations[locale];if(overlay===undefined)continue;
    const sent=record(incoming)[locale]!==undefined,hasKey=sent&&Object.hasOwn(record(record(incoming)[locale]),"variants");
    const source=sent&&!hasKey?record(record(stored)[locale]).variants:record(overlay).variants;
    const {variants:_dropped,...rest}=record(overlay);void _dropped;
    const kept:Record<string,unknown>={};
    for(const [id,entry] of Object.entries(record(source))){
      const own=owned.get(id);if(!own)continue;
      const content=record(record(entry).content),blocks=Object.fromEntries(Object.entries(content).filter(([key])=>Object.hasOwn(own,key)));
      if(Object.keys(blocks).length)kept[id]={content:blocks};
    }
    const next=Object.keys(kept).length?{...rest,variants:kept}:rest;
    if(Object.keys(next).length)out[locale]=next;
  }
  return out;
}
/** JSON with object keys sorted, so a jsonb round trip (which reorders keys) compares equal. */
const sortedJSON=(value:unknown):string=>Array.isArray(value)?"["+value.map(sortedJSON).join(",")+"]"
  :value!==null&&typeof value==="object"?"{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+sortedJSON((value as Record<string,unknown>)[key])).join(",")+"}"
  :JSON.stringify(value);
const translationsColumn=(table:string,key:string,ref:string)=>`(SELECT jsonb_object_agg(t.locale,t.content) FROM ${table} t WHERE t.${key}=${ref}) AS translations`;
const translationsOf=(row:Record<string,unknown>)=>row.translations&&typeof row.translations==="object"?row.translations as Record<string,unknown>:undefined;
const entityTypes={products:"product",blogs:"blog",banners:"banner",clients:"customer",homepage:"homepage"} as const;
const permissions:Record<CMSResource,readonly[Permission,Permission]>={products:["catalog:read","catalog:write"],blogs:["content:write","content:write"],banners:["content:write","content:write"],clients:["customers:read","customers:write"]};

// Documents saved before 2026-11-19 kept variant prices as exact text; read them back as numbers
// so the editor gets every price (otherwise the DTO drops them and the next save is refused).
function numericVariantPrices(content:unknown):unknown{
  const doc=record(content);if(!Array.isArray(doc.variants))return content;
  const num=(value:unknown)=>typeof value==="string"&&/^(0|[1-9][0-9]{0,13})(\.[0-9]{1,2})?$/.test(value)?Number(value):value;
  return{...doc,variants:doc.variants.map(v=>{const variant=record(v);return{...variant,price:num(variant.price),...(variant.originalPrice===undefined?{}:{originalPrice:num(variant.originalPrice)})};})};
}
function productDTO(row:Record<string,unknown>):CMSItem {
  const extra=adminDTO("products",numericVariantPrices(row.legacy_content)), amount=Number(row.amount_minor??0)/100;
  if(row.amount_minor==null||!Number.isSafeInteger(Number(row.amount_minor))||(row.compare_at_minor!=null&&!Number.isSafeInteger(Number(row.compare_at_minor))))return fail("UNAVAILABLE",503,"Price is unavailable or outside the supported display range");
  const defaults={image:"",category:"",subCategory:"",activities:[],level:"Entry",caseSize:"Medium",compatibleAccessories:[]};
  const projected=adminDTO("products",{...extra,
    id:String(row.public_key),name:String(row.name),sku:String(row.sku??""),description:String(row.description),family:String(row.family??""),badge:row.badge??undefined,priceSuffix:row.price_suffix??undefined,
    currency:"KZT",price:amount,originalPrice:row.compare_at_minor==null?undefined:Number(row.compare_at_minor)/100,status:String(row.status),isFeatured:row.is_featured===true,
    specs:row.specs,inTheBox:row.in_the_box,features:row.features,stock:Number(row.stock_available??0),stockManaged:Number(row.stock_known??0)>0,version:Number(row.version),createdAt:(row.created_at as Date).toISOString(),
    seoTitle:row.seo_title??"",seoDescription:row.seo_description??"",focusKeywords:row.focus_keywords??[],canonicalUrl:row.canonical_url??"",noIndex:row.no_index===true,ogImage:row.og_image_source??"",translations:translationsOf(row)});
  return {...defaults,...projected,id:String(row.public_key),version:Number(row.version),currency:"KZT",stockManaged:Number(row.stock_known??0)>0};
}
function contentDTO(row:Record<string,unknown>):CMSItem {
  const extra=record(row.legacy_content),kind=String(row.kind);
  if(kind==="homepage"){const blocks=record(Array.isArray(row.blocks)?row.blocks[0]:undefined),translations=translationsOf(row);return {id:String(row.id),version:Number(row.version),config:parse(homepageInput,translations?{...blocks,translations}:blocks)};}
  const resource=kind==="blog"?"blogs":"banners";
  const projected=adminDTO(resource,{...extra,id:row.id,title:row.title,subtitle:row.subtitle,excerpt:row.summary,content:row.body,slug:row.slug,status:row.status,
    author:row.author_label??"",category:row.category??"",readingTime:row.reading_time??"",coverImage:row.cover_source??"",position:row.position,order:row.sort_order,ctaLabel:row.cta_label,ctaUrl:row.cta_url,image:row.image_source,
    active:row.status==="published",seoTitle:row.seo_title,seoDescription:row.seo_description,focusKeywords:row.focus_keywords,canonicalUrl:row.canonical_url,noIndex:row.no_index,ogImage:row.og_image_source,
    createdAt:(row.created_at as Date).toISOString(),publishedAt:row.published_at instanceof Date?row.published_at.toISOString():"",translations:translationsOf(row)});
  return {...projected,id:String(row.id),version:Number(row.version),updatedAt:(row.revision_created_at instanceof Date?row.revision_created_at:row.created_at as Date).toISOString()};
}
function customerDTO(row:Record<string,unknown>,principal:Principal):CMSItem {return {id:String(row.id),version:Number(row.version),name:row.name,email:row.email??"",phone:row.entered_phone,country:row.country_code??"",status:row.status,avatar:row.avatar??"",...(principal.permissions.includes("customers:write")?{notes:row.notes??""}:{}),createdAt:(row.created_at as Date).toISOString()};}
const customerSelect="SELECT c.*,n.body AS notes FROM customer_profiles c LEFT JOIN LATERAL (SELECT body FROM customer_private_notes WHERE profile_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) n ON true";
const productSelect = `SELECT p.*,v.sku,v.id AS variant_id,pr.id AS price_id,pr.amount_minor,pr.compare_at_minor,stock.stock_known,stock.stock_available,${translationsColumn("product_translations","product_id","p.id")} FROM products p LEFT JOIN LATERAL (SELECT * FROM product_variants WHERE product_id=p.id AND is_default ORDER BY (status='archived'),created_at DESC,id DESC LIMIT 1) v ON true LEFT JOIN prices pr ON pr.variant_id=v.id AND pr.is_active AND pr.currency='KZT' AND pr.market='default' LEFT JOIN LATERAL (SELECT count(*) AS stock_known,COALESCE(sum(ib.on_hand-ib.reserved),0) AS stock_available FROM product_variants pv JOIN inventory_balances ib ON ib.variant_id=pv.id JOIN stock_locations sl ON sl.id=ib.location_id AND sl.archived_at IS NULL WHERE pv.product_id=p.id AND pv.status<>'archived') stock ON true`;
const contentSelect = (published=false) => `SELECT p.id,p.key,p.kind,p.slug,p.status,p.version,p.created_at,pv.*,p.id AS id,p.version AS version,p.created_at AS created_at,pv.created_at AS revision_created_at,b.author_label,b.category,b.reading_time,b.cover_source,bn.position,bn.sort_order,bn.cta_label,bn.cta_url,bn.image_source,pub.published_at,${translationsColumn("page_version_translations","version_id","pv.id")} FROM pages p ${published?"JOIN page_publications pub ON pub.page_id=p.id AND pub.published_at<=now() AND (pub.scheduled_until IS NULL OR pub.scheduled_until>now()) JOIN page_versions pv ON pv.id=pub.version_id":"JOIN LATERAL (SELECT * FROM page_versions WHERE page_id=p.id ORDER BY version DESC LIMIT 1) pv ON true LEFT JOIN page_publications pub ON pub.page_id=p.id"} LEFT JOIN blog_posts b ON b.version_id=pv.id LEFT JOIN banners bn ON bn.version_id=pv.id`;

export function createCMSService({pool,authorize}:Options) {
  async function tx<T>(action:(client:PoolClient)=>Promise<T>):Promise<T> {
    const client=await pool.connect();let broken=false;
    try{await client.query("BEGIN");const result=await action(client);await client.query("COMMIT");return result;}
    catch(error){try{await client.query("ROLLBACK");}catch{broken=true;}if((error as {code?:string}).code==="23505")return fail("CONFLICT",409,"Identity or SKU already exists");throw error;}
    finally{client.release(broken);}
  }
  async function setStatusIn(client:PoolClient,principal:Principal,data:{id:string;version:number;status:ProductStatus}){
    const old=(await client.query(`${productSelect} WHERE p.public_key=$1 FOR UPDATE OF p`,[data.id])).rows[0];
    if(!old)return fail("NOT_FOUND",404,"Product was not found");
    if(data.version!==Number(old.version))return fail("VERSION_CONFLICT",409,"Product changed; reload before saving");
    // No default variant or no price row at all: only the editor can repair it (409), whatever the target status.
    if(old.sku==null||old.amount_minor==null)return fail("CONFLICT",409,"This product has no default variant or price; open it in the editor and save it first");
    const meta=record(old.legacy_content);
    // Fast path for a simple product's own price; projectProduct below checks the variants the storefront
    // sells (active ones), so a draft default variant at 0 does not block a variant product (I1).
    const hasVariants=Array.isArray(meta.options)&&meta.options.length>0&&Array.isArray(meta.variants)&&meta.variants.length>0;
    if(data.status==="published"&&!hasVariants&&BigInt(old.amount_minor)<=BigInt(0))return fail("INVALID_INPUT",400,PRICE_TO_PUBLISH);
    // The column and the editor document keep the same status, like save.
    await client.query("UPDATE products SET status=$2,legacy_content=jsonb_set(legacy_content,'{status}',to_jsonb($2::text)),version=version+1,updated_at=clock_timestamp() WHERE id=$1",[old.id,data.status]);
    // Archiving mirrors archive(): the projection would clear is_default on the only variant and hide the product from every admin read.
    if(data.status!=="archived")await projectProduct(client,old.id,{status:data.status,sku:old.sku,priceMinor:String(old.amount_minor??"0"),compareMinor:old.compare_at_minor==null?null:String(old.compare_at_minor),
      options:(Array.isArray(meta.options)?meta.options:[]) as ProductDocument["options"],variants:(Array.isArray(meta.variants)?meta.variants:[]) as ProductDocument["variants"],
      images:(Array.isArray(meta.images)?meta.images:[]) as ProductDocument["images"],defaultImageId:typeof meta.defaultImageId==="string"?meta.defaultImageId:undefined},(Array.isArray(meta.variants)?meta.variants:[]).map(record));
    await audit(client,principal,"cms.saved",entityTypes.products,old.id,["status"],Number(old.version),Number(old.version)+1);
    return{id:data.id,version:Number(old.version)+1,status:data.status};
  }
  async function deleteIn(client:PoolClient,principal:Principal,publicKey:string,expected:number){
      const product=(await client.query("SELECT id,version,name FROM products WHERE public_key=$1 FOR UPDATE",[publicKey])).rows[0]??fail("NOT_FOUND",404,"Product was not found");
      if(Number(product.version)!==expected)return fail("VERSION_CONFLICT",409,"Product changed; reload before deleting");
      const id=product.id,variants=(await client.query<{id:string}>("SELECT id FROM product_variants WHERE product_id=$1",[id])).rows.map(r=>r.id);
      if((await client.query("SELECT 1 FROM order_items WHERE product_id=$1 OR variant_id=ANY($2::uuid[]) LIMIT 1",[id,variants])).rowCount)
        return fail("CONFLICT",409,"This product has orders, so it cannot be deleted; archive it instead");
      if((await client.query("SELECT 1 FROM stock_movements WHERE variant_id=ANY($1::uuid[]) LIMIT 1",[variants])).rowCount)
        return fail("CONFLICT",409,"This product has stock history, so it cannot be deleted; archive it instead");
      const del=(sql:string,args:unknown[])=>client.query(sql,args);
      await del("DELETE FROM cart_items WHERE variant_id=ANY($1::uuid[])",[variants]);
      await del("DELETE FROM wishlist_items WHERE product_id=$1",[id]);
      await del("DELETE FROM promotion_variants WHERE variant_id=ANY($1::uuid[])",[variants]);
      await del("DELETE FROM price_adjustment_variants WHERE variant_id=ANY($1::uuid[])",[variants]);
      await del("DELETE FROM collection_products WHERE product_id=$1",[id]);
      await del("DELETE FROM collection_published_products WHERE product_id=$1",[id]);
      await del("DELETE FROM product_relations WHERE source_product_id=$1 OR target_product_id=$1",[id]);
      for(const table of ["product_categories","product_activities","product_attribute_values","product_translations","product_media"])await del(`DELETE FROM ${table} WHERE product_id=$1`,[id]);
      await del("DELETE FROM inventory_balances WHERE variant_id=ANY($1::uuid[])",[variants]);
      await del("DELETE FROM variant_option_values WHERE product_id=$1",[id]);
      await del("DELETE FROM prices WHERE variant_id=ANY($1::uuid[])",[variants]);
      await del("DELETE FROM product_variants WHERE product_id=$1",[id]);
      await del("DELETE FROM option_values WHERE product_id=$1",[id]);
      await del("DELETE FROM product_options WHERE product_id=$1",[id]);
      await del("DELETE FROM products WHERE id=$1",[id]);
      await audit(client,principal,"cms.deleted",entityTypes.products,id,["permanent"],expected,expected);
      return{deleted:true as const};
  }
  async function actor(headers:Headers,resource:CMSResource,write=false){return authorize(headers,permissions[resource][write?1:0]);}
  async function audit(client:PoolClient,principal:Principal,action:string,type:string,id:string,fields:string[],oldVersion:number,newVersion:number){
    await client.query("INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,$3,$4,$5,$6,$7)",[randomUUID(),principal.userId,action,type,id,randomUUID(),json({fields,beforeVersion:oldVersion,version:newVersion})]);
  }
  function pageInput(scope:string,input:unknown){
    const query=parse(querySchema,input),binding=json([scope,query.search,query.status??null,query.family??null,query.category??null]);let last:string|undefined;
    if(query.cursor){try{const data=JSON.parse(Buffer.from(query.cursor,"base64url").toString("utf8"));if(data.scope!==binding||!z.uuid().safeParse(data.last).success||Object.keys(data).length!==2)throw Error();last=data.last;}catch{return fail("INVALID_CURSOR",400,"Invalid page cursor");}}
    return{...query,binding,last};
  }
  async function listing(resource:CMSResource,input:unknown,principal?:Principal,published=false):Promise<CMSPage>{
    const query=pageInput(`${published?"public":"admin"}:${resource}`,input),values:unknown[]=[],conditions:string[]=[];
    const param=(value:unknown)=>{values.push(value);return `$${values.length}`;};
    const alias=resource==="clients"?"c":"p";
    if(query.last)conditions.push(`${alias}.id>${param(query.last)}::uuid`);
    if(query.search){const pattern=`%${query.search.replace(/[\\%_]/g,"\\$&")}%`,ref=param(pattern);conditions.push(resource==="products"?`(p.name ILIKE ${ref} OR v.sku ILIKE ${ref} OR p.family ILIKE ${ref} OR p.legacy_content->>'category' ILIKE ${ref})`:resource==="clients"?`(c.name ILIKE ${ref} OR c.email ILIKE ${ref} OR c.entered_phone ILIKE ${ref} OR c.country_code ILIKE ${ref})`:`(pv.title ILIKE ${ref} OR p.slug ILIKE ${ref} OR b.category ILIKE ${ref} OR b.author_label ILIKE ${ref})`);}
    if(query.family){if(resource!=="products")return fail("INVALID_INPUT",400,"Invalid family filter");conditions.push(`p.family=${param(query.family)}`);}
    if(query.category){if(resource!=="blogs")return fail("INVALID_INPUT",400,"Invalid category filter");conditions.push(`b.category=${param(query.category)}`);}
    if(query.status){const allowed=resource==="clients"?["active","vip","pending","suspended"]:["published","draft","archived"];if(!allowed.includes(query.status))return fail("INVALID_INPUT",400,"Invalid status");conditions.push(`${alias}.status=${param(query.status)}`);}
    if(resource==="blogs"||resource==="banners")conditions.push(`p.kind=${param(resource==="blogs"?"blog":"banner")}`);
    if(published){conditions.push("p.status='published'");if(resource==="products")conditions.push("v.status='active'");}
    else if(!query.status&&(resource==="blogs"||resource==="banners"))conditions.push("p.status<>'archived'");
    const base=resource==="products"?productSelect:resource==="clients"?customerSelect:contentSelect(published);
    const rows=(await pool.query(`${base}${conditions.length?" WHERE "+conditions.join(" AND "):""} ORDER BY ${alias}.id LIMIT ${param(query.limit+1)}`,values)).rows;
    const more=rows.length>query.limit,selected=rows.slice(0,query.limit),items=selected.map(row=>resource==="products"?productDTO(row):resource==="clients"?customerDTO(row,principal!):contentDTO(row));
    return{items,nextCursor:more?Buffer.from(json({scope:query.binding,last:selected.at(-1)!.id})).toString("base64url"):null};
  }
  async function saveContent(client:PoolClient,principal:Principal,resource:"blogs"|"banners"|"homepage",raw:unknown):Promise<CMSItem>{
    const homepage=resource==="homepage",input=homepage?parse(z.object({version:z.number().int().min(0),config:homepageInput}).strict(),raw):resource==="blogs"?parse(blogCommand,raw):parse(bannerCommand,raw);
    const {draft,translations:sentTranslations,...rest}=record(input),kind=homepage?"homepage":resource==="blogs"?"blog":"banner";
    // Homepage overlays travel inside the config; they are stored in page_version_translations, not in the blocks.
    const {translations:sentHomepage,...homepageConfig}=homepage?record(rest.config):{} as Record<string,unknown>;
    const fields=homepage?{...rest,config:homepageConfig}:rest,incoming=homepage?sentHomepage:sentTranslations;
    // Task 18A: editor rich text is sanitized before it is stored; the excerpt is shown as text, so it is plain text.
    const data=kind==="blog"?{...fields,content:sanitizeRichText(String(fields.content??"")),...(typeof fields.excerpt==="string"?{excerpt:plainText(fields.excerpt)}:{})}:fields;
    if(homepage)await client.query("SELECT pg_advisory_xact_lock(hashtextextended('cms:homepage',0))");
    const old=homepage?(await client.query("SELECT * FROM pages WHERE kind='homepage' ORDER BY id LIMIT 1 FOR UPDATE")).rows[0]:data.id?(await client.query("SELECT * FROM pages WHERE id=$1 AND kind=$2 FOR UPDATE",[data.id,kind])).rows[0]:undefined;
    if(data.id&&!old)return fail("NOT_FOUND",404,"Content was not found");
    const oldVersion=old?Number(old.version):0;
    if((old&&data.version!==oldVersion)||(!old&&data.version!==undefined&&data.version!==0))return fail("VERSION_CONFLICT",409,"Content changed; reload before saving");
    if(old?.status==="archived")return fail("CONFLICT",409,"Archived content cannot be overwritten");
    const id=old?.id??randomUUID(),next=oldVersion+1,versionId=randomUUID();
    // The new version carries the previous version's overlays, with any sent locale replaced.
    const previous=old?(await client.query("SELECT jsonb_object_agg(t.locale,t.content) AS translations FROM page_version_translations t JOIN page_versions pv ON pv.id=t.version_id WHERE pv.page_id=$1 AND pv.version=$2",[id,oldVersion])).rows[0]?.translations:undefined;
    const translations=mergedTranslations(previous,incoming,kind==="blog"?BLOG_SPEC:kind==="banner"?BANNER_SPEC:HOMEPAGE_SPEC,kind==="blog"?BLOG_HTML_FIELDS:undefined);
    const slug=kind==="blog"?String(data.slug||String(data.title).toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu,"-").replace(/^-|-$/g,"")||id):null;
    if(old?.slug&&slug!==old.slug)return fail("CONFLICT",409,"Changing a public URL requires a redirect workflow");
    if(old)await client.query("UPDATE pages SET version=$2 WHERE id=$1",[id,next]);
    else await client.query("INSERT INTO pages(id,key,kind,slug) VALUES($1,$2,$3,$4)",[id,homepage?"homepage":id,kind,slug]);
    const config=homepage?{...record(data.config),updatedAt:new Date().toISOString()}:undefined;
    await client.query("INSERT INTO page_versions(id,page_id,page_kind,version,title,subtitle,summary,body,blocks,legacy_content,seo_title,seo_description,focus_keywords,canonical_url,no_index,og_image_source,author_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)",[versionId,id,kind,next,homepage?"Homepage":data.title,data.subtitle??null,data.excerpt??"",data.content??"",json(homepage?[config]:[]),json(homepage?{}:data),data.seoTitle??null,data.seoDescription??null,json(data.focusKeywords??[]),data.canonicalUrl||null,data.noIndex??false,data.ogImage||null,principal.userId]);
    for(const locale of LOCALES)if(translations[locale])await client.query("INSERT INTO page_version_translations(version_id,locale,content) VALUES($1,$2,$3)",[versionId,locale,json(translations[locale])]);
    if(kind==="blog")await client.query("INSERT INTO blog_posts(version_id,page_id,author_label,category,reading_time,cover_source) VALUES($1,$2,$3,$4,$5,$6)",[versionId,id,data.author??null,data.category??null,data.readingTime??null,data.coverImage??null]);
    if(kind==="banner")await client.query("INSERT INTO banners(version_id,page_id,position,sort_order,cta_label,cta_url,image_source) VALUES($1,$2,$3,$4,$5,$6,$7)",[versionId,id,data.position??"hero",data.order??0,data.ctaLabel??null,data.ctaUrl??null,data.image??null]);
    const keepLive=draft===true&&old?.status==="published";
    const status=keepLive?"published":draft===true?"draft":homepage||data.status==="published"||data.active===true?"published":"draft";
    // Task 18A review I3: publishing from the editor makes the page live now; an earlier schedule or
    // end time no longer applies (the original publish date is kept). Review I5: invalidate caches.
    if(status==="published"&&!keepLive){
      await client.query("INSERT INTO page_publications(page_id,version_id) VALUES($1,$2) ON CONFLICT(page_id) DO UPDATE SET version_id=excluded.version_id,published_at=LEAST(page_publications.published_at,now()),scheduled_until=NULL",[id,versionId]);
      await appendOutboxEvent(client,{topic:"content.published",dedupeKey:`content.published:${id}:${next}`,aggregate:{type:"page",id},payload:{pageId:id,kind,slug,versionId},consumers:[CONTENT_INVALIDATE_KIND]});
    }
    await client.query("UPDATE pages SET status=$2 WHERE id=$1",[id,status]);
    await audit(client,principal,"cms.saved",entityTypes[resource],id,[...Object.keys(data).filter(key=>!["id","version","config"].includes(key)),...(incoming!==undefined?["translations"]:[])],oldVersion,next);
    const row=(await client.query(`${contentSelect()} WHERE p.id=$1`,[id])).rows[0];return contentDTO(row);
  }
  return {
    async get(resource:CMSResource,headers:Headers,id:string):Promise<CMSItem>{
      const principal=await actor(headers,resource);let row;
      if(resource==="products")row=(await pool.query(`${productSelect} WHERE p.public_key=$1`,[parse(identity,id)])).rows[0];
      else if(resource==="clients") {const row=(await pool.query(`${customerSelect} WHERE c.id=$1`,[parse(z.uuid(),id)])).rows[0];if(!row)return fail("NOT_FOUND",404,"Customer was not found");return customerDTO(row,principal);}
      else row=(await pool.query(`${contentSelect()} WHERE p.id=$1 AND p.kind=$2`,[parse(z.uuid(),id),resource==="blogs"?"blog":"banner"])).rows[0];
      if(!row)return fail("NOT_FOUND",404,"Record was not found");return resource==="products"?productDTO(row):contentDTO(row);
    },
    async list(resource:CMSResource,headers:Headers,input:unknown={}){const principal=await actor(headers,resource);return listing(resource,input,principal);},
    async save(resource:CMSResource,headers:Headers,raw:unknown):Promise<CMSItem>{
      const principal=await actor(headers,resource,true);
      if(resource==="blogs"||resource==="banners")return tx(client=>saveContent(client,principal,resource,raw));
      if(resource==="products"){
        const data=parse(productCommand,raw);if(data.stock!==undefined&&data.stock!==0)return fail("NOT_IMPLEMENTED",501,"Stock changes require the inventory workflow");
        if(data.originalPrice!=null&&BigInt(data.originalPrice)<BigInt(data.price))return fail("INVALID_INPUT",400,"Compare-at price cannot be below selling price");
        if(!data.id)await authorize(headers,"inventory:write");
        return tx(async client=>{
          const old=data.id?(await client.query(`${productSelect} WHERE p.public_key=$1 FOR UPDATE OF p`,[data.id])).rows[0]:undefined;
          if(data.id&&!old)return fail("NOT_FOUND",404,"Product was not found");
          if(old&&data.version!==old.version)return fail("VERSION_CONFLICT",409,"Product changed; reload before saving");
          const id=old?.id??randomUUID(),publicKey=old?.public_key??randomUUID(),next=old?Number(old.version)+1:1;
          const status=data.status??old?.status??"draft";
          // Final review I1: "price above 0 to publish" is checked by projectProduct on the projected document
          // (every non-archived variant, or the product price without options), inside this transaction.
          const compareAt=data.originalPrice===undefined?old?.compare_at_minor??null:data.originalPrice;
          if(compareAt!==null&&BigInt(compareAt)<BigInt(data.price))return fail("INVALID_INPUT",400,"Compare-at price cannot be below selling price");
          const {translations:sentTranslations,...unsafe}=data;
          // Overview HTML, image URLs and swatch colours are sanitized like the legacy admin route.
          const clean=sanitizeProductInput(unsafe as Record<string,unknown>,undefined);
          if(!clean.ok)return fail("INVALID_INPUT",400,clean.error);
          // Task 2.1: a variant's own overview HTML is sanitized like the product overview.
          // Variant prices may arrive as exact text (the admin route keeps money lexemes); the editor
          // document stores them as numbers in KZT major units, like the legacy store.
          const base={...(clean.product as typeof unsafe),...(Array.isArray(unsafe.variants)?{variants:(clean.product as typeof unsafe).variants!.map(v=>({...v,...(v.content?.overviewHtml===undefined?{}:{content:{...v.content,overviewHtml:PRODUCT_HTML_FIELDS.overviewHtml(v.content.overviewHtml)}}),price:Number(toMinor(v.price,`Price of ${v.sku}`))/100,
            ...(v.originalPrice===undefined||v.originalPrice===""?{}:{originalPrice:Number(toMinor(v.originalPrice,`Compare-at price of ${v.sku}`))/100})}))}:{})} as typeof unsafe;
          const merged=mergedTranslations(old?.translations,sentTranslations,PRODUCT_SPEC,PRODUCT_HTML_FIELDS);
          const metadata={...record(old?.legacy_content),...base,price:Number(data.price)/100,originalPrice:compareAt===null?undefined:Number(compareAt)/100};
          const translations=variantTranslations(merged,old?.translations,sentTranslations,metadata.variants);
          const fields=[data.name,data.description??old?.description??"",data.family??old?.family??null,data.badge??old?.badge??null,data.priceSuffix??old?.price_suffix??null,status,data.isFeatured??old?.is_featured??false,json(data.specs??old?.specs??[]),json(data.features??old?.features??[]),json(data.inTheBox??old?.in_the_box??[]),json(metadata),data.seoTitle??old?.seo_title??null,data.seoDescription??old?.seo_description??null,json(data.focusKeywords??old?.focus_keywords??[]),data.canonicalUrl??old?.canonical_url??null,data.noIndex??old?.no_index??false,data.ogImage??old?.og_image_source??null];
          if(old)await client.query("UPDATE products SET name=$2,description=$3,family=$4,badge=$5,price_suffix=$6,status=$7,is_featured=$8,specs=$9,features=$10,in_the_box=$11,legacy_content=$12,seo_title=$13,seo_description=$14,focus_keywords=$15,canonical_url=$16,no_index=$17,og_image_source=$18,version=version+1,updated_at=clock_timestamp() WHERE id=$1",[id,...fields]);
          else await client.query("INSERT INTO products(id,name,description,family,badge,price_suffix,status,is_featured,specs,features,in_the_box,legacy_content,seo_title,seo_description,focus_keywords,canonical_url,no_index,og_image_source,public_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)",[id,...fields,publicKey]);
          // The editor document (options, variants, photos) is projected into the commerce tables.
          const document:ProductDocument={status,sku:data.sku,priceMinor:data.price,compareMinor:compareAt,
            options:(Array.isArray(metadata.options)?metadata.options:[]) as ProductDocument["options"],variants:(Array.isArray(metadata.variants)?metadata.variants:[]) as ProductDocument["variants"],
            images:(Array.isArray(metadata.images)?metadata.images:[]) as ProductDocument["images"],defaultImageId:typeof metadata.defaultImageId==="string"?metadata.defaultImageId:undefined};
          // F-c: the previous document names each editor variant's SKU at the last save, so a renamed SKU keeps its row.
          const previous=record(old?.legacy_content).variants;
          await projectProduct(client,id,document,Array.isArray(previous)?previous.map(record):[]);
          // Final review M8: stale variant translations (a removed variant, a block no longer owned) are pruned on
          // every save, not only when translations are sent; a locale that did not change is left untouched.
          const storedTranslations=record(old?.translations);
          for(const locale of LOCALES){
            if(sentTranslations===undefined&&sortedJSON(translations[locale]??null)===sortedJSON(storedTranslations[locale]??null))continue;
            if(translations[locale])await client.query("INSERT INTO product_translations(product_id,locale,content,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(product_id,locale) DO UPDATE SET content=excluded.content,updated_by=excluded.updated_by,updated_at=clock_timestamp()",[id,locale,json(translations[locale]),principal.userId]);
            else await client.query("DELETE FROM product_translations WHERE product_id=$1 AND locale=$2",[id,locale]);
          }
          await audit(client,principal,"cms.saved",entityTypes.products,id,Object.keys(data),old?Number(old.version):0,next);
          return productDTO((await client.query(`${productSelect} WHERE p.id=$1`,[id])).rows[0]);
        });
      }
      const data=parse(clientCommand,raw);
      return tx(async client=>{
        const old=data.id?(await client.query("SELECT * FROM customer_profiles WHERE id=$1 FOR UPDATE",[data.id])).rows[0]:undefined;
        if(data.id&&!old)return fail("NOT_FOUND",404,"Customer was not found");if(old&&data.version!==old.version)return fail("VERSION_CONFLICT",409,"Customer changed; reload before saving");
        const email=data.email===undefined?old?.email??null:data.email.trim().toLowerCase()||null;
        if(old?.user_id&&(old.email!==email||old.entered_phone!==data.phone))return fail("CONFLICT",409,"Account-linked contacts can only be changed by the customer's account workflow");
        const id=old?.id??randomUUID();
        if(old)await client.query("UPDATE customer_profiles SET name=$2,email=$3,entered_phone=$4,avatar=$5,status=$6,country_code=$7,version=version+1,updated_at=clock_timestamp() WHERE id=$1",[id,data.name,email,data.phone,data.avatar??old.avatar??null,data.status??old.status??"active",data.country===undefined?old.country_code:data.country||null]);
        else await client.query("INSERT INTO customer_profiles(id,name,email,entered_phone,avatar,status,country_code) VALUES($1,$2,$3,$4,$5,$6,$7)",[id,data.name,email,data.phone,data.avatar??null,data.status??"active",data.country||null]);
        if(data.notes!==undefined)await client.query("INSERT INTO customer_private_notes(id,profile_id,author_user_id,body) VALUES($1,$2,$3,$4)",[randomUUID(),id,principal.userId,data.notes]);
        await audit(client,principal,"cms.saved",entityTypes.clients,id,Object.keys(data),old?Number(old.version):0,old?Number(old.version)+1:1);
        return customerDTO((await client.query(`${customerSelect} WHERE c.id=$1`,[id])).rows[0],principal);
      });
    },
    /**
     * Owner 2026-11-19: delete a product permanently. Allowed only when it was never ordered and has
     * no stock history (orders and the stock ledger are immutable); everything that only describes
     * the product goes with it: variants, prices, options, selections, photo links, translations,
     * collection entries, relations, promotion links, and cart and wishlist lines.
     */
    async deleteProduct(headers:Headers,publicKey:string,expected:number):Promise<{deleted:true}>{
      const principal=await actor(headers,"products",true);parse(identity,publicKey);parse(version,expected);
      return tx(client=>deleteIn(client,principal,publicKey,expected));
    },
    /** Status-only change (list dropdown and bulk bar): same lock, version check, column + document + projection as save. */
    async setProductStatus(headers:Headers,raw:{id:string;version:number;status:ProductStatus}):Promise<{id:string;version:number;status:string}>{
      const principal=await actor(headers,"products",true);const data=parse(statusCommand,raw);
      return tx(client=>setStatusIn(client,principal,data));
    },
    /** Up to 100 products, each in its own transaction, so one stale row never blocks the others. */
    async bulkProducts(headers:Headers,raw:{action:BulkAction;items:{id:string;version:number}[]}):Promise<{results:BulkResult[]}>{
      const principal=await actor(headers,"products",true);const data=parse(bulkCommand,raw);
      for(const item of data.items)parse(identity,item.id);
      const results:BulkResult[]=[],action=data.action;
      for(const item of data.items){
        try{
          if(action==="delete"){await tx(client=>deleteIn(client,principal,item.id,item.version));results.push({id:item.id,ok:true});}
          else{const done=await tx(client=>setStatusIn(client,principal,{...item,status:BULK_STATUS[action]}));results.push({id:item.id,ok:true,version:done.version});}
        }catch(error){
          if(error instanceof AuthFailure)results.push({id:item.id,ok:false,code:error.code,message:error.message});
          else{
            // Final review M7: an unexpected failure is logged (product id and error code only, no data) before it is mapped.
            const code=(error as {code?:unknown}|null)?.code;
            console.error("Bulk product action failed",action,item.id,typeof code==="string"?code:error instanceof Error?error.name:"UNKNOWN");
            results.push({id:item.id,ok:false,code:"INTERNAL_ERROR",message:"Product could not be updated"});
          }
        }
      }
      return{results};
    },
    async archive(resource:CMSResource,headers:Headers,id:string,expected:number){
      const principal=await actor(headers,resource,true);parse(version,expected);parse(resource==="products"?identity:z.uuid(),id);
      return tx(async client=>{
        const table=resource==="products"?"products":resource==="clients"?"customer_profiles":"pages",key=resource==="products"?"public_key":"id";
        const result=await client.query(`UPDATE ${table} SET status=$3,version=version+1 WHERE ${key}=$1 AND version=$2${table==="pages"?" AND kind=$4":""} RETURNING id,version`,table==="pages"?[id,expected,"archived",resource==="blogs"?"blog":"banner"]:[id,expected,resource==="clients"?"suspended":"archived"]);
        if(!result.rowCount)return fail("VERSION_CONFLICT",409,"Record changed or is unavailable");
        await audit(client,principal,"cms.archived",entityTypes[resource],result.rows[0].id,["status"],expected,expected+1);return{success:true,version:expected+1};
      });
    },
    async categories(headers:Headers,input:unknown={}){
      await authorize(headers,"content:write");const query=parse(querySchema.pick({limit:true,cursor:true,search:true}),input);
      const binding=json(["blog-categories",query.search]);let last:string|undefined;
      if(query.cursor){try{const cursor=JSON.parse(Buffer.from(query.cursor,"base64url").toString("utf8"));if(cursor.scope!==binding||typeof cursor.last!=="string"||!cursor.last||cursor.last.length>500||Object.keys(cursor).length!==2)throw Error();last=cursor.last;}catch{return fail("INVALID_CURSOR",400,"Invalid category cursor");}}
      const pattern="%"+query.search.replace(/[\\%_]/g,match=>"\\"+match)+"%";
      const rows=(await pool.query("SELECT DISTINCT b.category FROM pages p JOIN LATERAL (SELECT id FROM page_versions WHERE page_id=p.id ORDER BY version DESC LIMIT 1) pv ON true JOIN blog_posts b ON b.version_id=pv.id WHERE p.kind='blog' AND p.status<>'archived' AND b.category IS NOT NULL AND b.category<>'' AND ($1::text IS NULL OR b.category>$1) AND b.category ILIKE $2 ORDER BY b.category LIMIT $3",[last??null,pattern,query.limit+1])).rows;
      const items=rows.slice(0,query.limit).map(row=>({id:String(row.category),category:String(row.category)}));
      return{items,nextCursor:rows.length>query.limit?Buffer.from(json({scope:binding,last:items.at(-1)!.id})).toString("base64url"):null};
    },
    async homepage(headers:Headers){await authorize(headers,"content:write");const row=(await pool.query(`${contentSelect()} WHERE p.kind='homepage' ORDER BY p.id LIMIT 1`)).rows[0];return row?contentDTO(row):{id:"homepage",version:0,config:null};},
    async saveHomepage(headers:Headers,input:unknown){const principal=await authorize(headers,"content:write");return tx(client=>saveContent(client,principal,"homepage",input));},
    /** Public: the live products of a published collection snapshot, in snapshot order, in one query. */
    async publicCollectionProducts(collectionId:string):Promise<CMSItem[]>{
      return (await pool.query(`${productSelect} JOIN collection_published_products c ON c.product_id=p.id WHERE c.collection_id=$1 AND p.status='published' AND v.status='active' ORDER BY c.position`,[collectionId])).rows.map(productDTO);
    },
    async publicProducts(input:{id?:string;limit?:number;cursor?:string}={}):Promise<CMSPage>{
      if(input.id){const row=(await pool.query(`${productSelect} WHERE p.public_key=$1 AND p.status='published' AND v.status='active'`,[input.id])).rows[0];return{items:row?[productDTO(row)]:[],nextCursor:null};}
      return listing("products",{limit:input.limit??24,cursor:input.cursor},undefined,true);
    },
    async publicContent(kind:"blog"|"banner"|"homepage",input:{slug?:string;limit?:number;cursor?:string;search?:string;category?:string}={}):Promise<CMSPage>{
      if(kind==="homepage"||input.slug){const row=(await pool.query(`${contentSelect(true)} WHERE p.kind=$1 AND p.status='published'${input.slug?" AND p.slug=$2":""} ORDER BY p.id LIMIT 1`,input.slug?[kind,input.slug]:[kind])).rows[0];return{items:row?[contentDTO(row)]:[],nextCursor:null};}
      return listing(kind==="blog"?"blogs":"banners",{limit:input.limit??24,cursor:input.cursor,search:input.search,category:input.category},undefined,true);
    },
  };
}
export type CMSService = ReturnType<typeof createCMSService>;
