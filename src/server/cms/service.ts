import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { Permission, Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";
import { adminDTO, productInput, blogInput, bannerInput, homepageInput } from "../auth/admin-schemas.ts";

export type CMSResource = "products" | "blogs" | "banners" | "clients";
export interface CMSItem extends Record<string, unknown> { id: string; version: number }
export interface CMSPage { items: CMSItem[]; nextCursor: string | null }
interface Options { pool: Pool; authorize: (headers: Headers, permission: Permission) => Promise<Principal> }
const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const json = (value: unknown) => JSON.stringify(value);
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
const version = z.number().int().min(1).max(2147483646);
const identity = z.string().trim().min(1).max(128);
const money = z.union([z.string(),z.number()]).transform((value,ctx) => {
  const text=String(value), match=/^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(text);
  if(!match){ctx.addIssue({code:"custom",message:"Use exact KZT with at most two decimal places"});return z.NEVER;}
  const minor=BigInt(match[1])*BigInt(100)+BigInt((match[2]??"").padEnd(2,"0"));
  if(minor>BigInt("100000000000000")){ctx.addIssue({code:"custom",message:"Amount exceeds the supported range"});return z.NEVER;}
  return minor.toString();
});
const productCommand = productInput.extend({id:identity.optional(),version:version.optional(),price:money,originalPrice:money.nullable().optional(),sku:z.string().trim().min(1).max(128)}).strict();
const blogCommand = blogInput.extend({id:z.uuid().optional(),version:version.optional(),slug:z.string().trim().max(200).regex(/^[\p{L}\p{N}_-]*$/u).optional()}).strict();
const bannerCommand = bannerInput.extend({id:z.uuid().optional(),version:version.optional()}).strict();
const clientCommand = z.object({id:z.uuid().optional(),version:version.optional(),name:z.string().trim().min(1).max(200),phone:z.string().trim().min(1).max(64),email:z.union([z.email().max(254),z.literal("")]).optional(),country:z.string().regex(/^(?:[A-Z]{2})?$/).optional(),status:z.enum(["active","vip","pending","suspended"]).optional(),avatar:z.string().max(2048).optional(),notes:z.string().max(10000).optional()}).strict();
const querySchema = z.object({limit:z.number().int().min(1).max(100).default(20),cursor:z.string().max(2048).optional(),search:z.string().trim().max(200).default(""),status:z.string().max(30).optional(),family:z.string().max(200).optional(),category:z.string().max(200).optional()}).strict();
function parse<T>(schema:z.ZodType<T>, value:unknown):T { const result=schema.safeParse(value);if(!result.success)return fail("INVALID_INPUT",400,"Invalid or unknown fields");return result.data; }
const entityTypes={products:"product",blogs:"blog",banners:"banner",clients:"customer",homepage:"homepage"} as const;
const permissions:Record<CMSResource,readonly[Permission,Permission]>={products:["catalog:read","catalog:write"],blogs:["content:write","content:write"],banners:["content:write","content:write"],clients:["customers:read","customers:write"]};

function productDTO(row:Record<string,unknown>):CMSItem {
  const extra=adminDTO("products",row.legacy_content), amount=Number(row.amount_minor??0)/100;
  if(row.amount_minor==null||!Number.isSafeInteger(Number(row.amount_minor))||(row.compare_at_minor!=null&&!Number.isSafeInteger(Number(row.compare_at_minor))))return fail("UNAVAILABLE",503,"Price is unavailable or outside the supported display range");
  const defaults={image:"",category:"",subCategory:"",activities:[],level:"Entry",caseSize:"Medium",compatibleAccessories:[]};
  const projected=adminDTO("products",{...extra,
    id:String(row.public_key),name:String(row.name),sku:String(row.sku??""),description:String(row.description),family:String(row.family??""),badge:row.badge??undefined,priceSuffix:row.price_suffix??undefined,
    currency:"KZT",price:amount,originalPrice:row.compare_at_minor==null?undefined:Number(row.compare_at_minor)/100,status:String(row.status),isFeatured:row.is_featured===true,
    specs:row.specs,inTheBox:row.in_the_box,features:row.features,stock:0,stockManaged:false,version:Number(row.version),createdAt:(row.created_at as Date).toISOString(),
    seoTitle:row.seo_title??"",seoDescription:row.seo_description??"",focusKeywords:row.focus_keywords??[],canonicalUrl:row.canonical_url??"",noIndex:row.no_index===true,ogImage:row.og_image_source??""});
  return {...defaults,...projected,id:String(row.public_key),version:Number(row.version),currency:"KZT",stockManaged:false};
}
function contentDTO(row:Record<string,unknown>):CMSItem {
  const extra=record(row.legacy_content),kind=String(row.kind);
  if(kind==="homepage") return {id:String(row.id),version:Number(row.version),config:parse(homepageInput,Array.isArray(row.blocks)?row.blocks[0]:undefined)};
  const resource=kind==="blog"?"blogs":"banners";
  const projected=adminDTO(resource,{...extra,id:row.id,title:row.title,subtitle:row.subtitle,excerpt:row.summary,content:row.body,slug:row.slug,status:row.status,
    author:row.author_label??"",category:row.category??"",readingTime:row.reading_time??"",coverImage:row.cover_source??"",position:row.position,order:row.sort_order,ctaLabel:row.cta_label,ctaUrl:row.cta_url,image:row.image_source,
    active:row.status==="published",seoTitle:row.seo_title,seoDescription:row.seo_description,focusKeywords:row.focus_keywords,canonicalUrl:row.canonical_url,noIndex:row.no_index,ogImage:row.og_image_source,
    createdAt:(row.created_at as Date).toISOString(),publishedAt:row.published_at instanceof Date?row.published_at.toISOString():""});
  return {...projected,id:String(row.id),version:Number(row.version),updatedAt:(row.revision_created_at instanceof Date?row.revision_created_at:row.created_at as Date).toISOString()};
}
function customerDTO(row:Record<string,unknown>,principal:Principal):CMSItem {return {id:String(row.id),version:Number(row.version),name:row.name,email:row.email??"",phone:row.entered_phone,country:row.country_code??"",status:row.status,avatar:row.avatar??"",...(principal.permissions.includes("customers:write")?{notes:row.notes??""}:{}),createdAt:(row.created_at as Date).toISOString()};}
const customerSelect="SELECT c.*,n.body AS notes FROM customer_profiles c LEFT JOIN LATERAL (SELECT body FROM customer_private_notes WHERE profile_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) n ON true";
const productSelect = "SELECT p.*,v.sku,v.id AS variant_id,pr.id AS price_id,pr.amount_minor,pr.compare_at_minor FROM products p LEFT JOIN LATERAL (SELECT * FROM product_variants WHERE product_id=p.id AND is_default ORDER BY (status='archived'),created_at DESC,id DESC LIMIT 1) v ON true LEFT JOIN prices pr ON pr.variant_id=v.id AND pr.is_active AND pr.currency='KZT' AND pr.market='default'";
const contentSelect = (published=false) => `SELECT p.id,p.key,p.kind,p.slug,p.status,p.version,p.created_at,pv.*,p.id AS id,p.version AS version,p.created_at AS created_at,pv.created_at AS revision_created_at,b.author_label,b.category,b.reading_time,b.cover_source,bn.position,bn.sort_order,bn.cta_label,bn.cta_url,bn.image_source,pub.published_at FROM pages p ${published?"JOIN page_publications pub ON pub.page_id=p.id JOIN page_versions pv ON pv.id=pub.version_id":"JOIN LATERAL (SELECT * FROM page_versions WHERE page_id=p.id ORDER BY version DESC LIMIT 1) pv ON true LEFT JOIN page_publications pub ON pub.page_id=p.id"} LEFT JOIN blog_posts b ON b.version_id=pv.id LEFT JOIN banners bn ON bn.version_id=pv.id`;

export function createCMSService({pool,authorize}:Options) {
  async function tx<T>(action:(client:PoolClient)=>Promise<T>):Promise<T> {
    const client=await pool.connect();let broken=false;
    try{await client.query("BEGIN");const result=await action(client);await client.query("COMMIT");return result;}
    catch(error){try{await client.query("ROLLBACK");}catch{broken=true;}if((error as {code?:string}).code==="23505")return fail("CONFLICT",409,"Identity or SKU already exists");throw error;}
    finally{client.release(broken);}
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
    const data=record(input),kind=homepage?"homepage":resource==="blogs"?"blog":"banner";
    if(homepage)await client.query("SELECT pg_advisory_xact_lock(hashtextextended('cms:homepage',0))");
    const old=homepage?(await client.query("SELECT * FROM pages WHERE kind='homepage' ORDER BY id LIMIT 1 FOR UPDATE")).rows[0]:data.id?(await client.query("SELECT * FROM pages WHERE id=$1 AND kind=$2 FOR UPDATE",[data.id,kind])).rows[0]:undefined;
    if(data.id&&!old)return fail("NOT_FOUND",404,"Content was not found");
    const oldVersion=old?Number(old.version):0;
    if((old&&data.version!==oldVersion)||(!old&&data.version!==undefined&&data.version!==0))return fail("VERSION_CONFLICT",409,"Content changed; reload before saving");
    if(old?.status==="archived")return fail("CONFLICT",409,"Archived content cannot be overwritten");
    const id=old?.id??randomUUID(),next=oldVersion+1,versionId=randomUUID();
    const slug=kind==="blog"?String(data.slug||String(data.title).toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu,"-").replace(/^-|-$/g,"")||id):null;
    if(old?.slug&&slug!==old.slug)return fail("CONFLICT",409,"Changing a public URL requires a redirect workflow");
    if(old)await client.query("UPDATE pages SET version=$2 WHERE id=$1",[id,next]);
    else await client.query("INSERT INTO pages(id,key,kind,slug) VALUES($1,$2,$3,$4)",[id,homepage?"homepage":id,kind,slug]);
    const config=homepage?{...record(data.config),updatedAt:new Date().toISOString()}:undefined;
    await client.query("INSERT INTO page_versions(id,page_id,page_kind,version,title,subtitle,summary,body,blocks,legacy_content,seo_title,seo_description,focus_keywords,canonical_url,no_index,og_image_source,author_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)",[versionId,id,kind,next,homepage?"Homepage":data.title,data.subtitle??null,data.excerpt??"",data.content??"",json(homepage?[config]:[]),json(homepage?{}:data),data.seoTitle??null,data.seoDescription??null,json(data.focusKeywords??[]),data.canonicalUrl||null,data.noIndex??false,data.ogImage||null,principal.userId]);
    if(kind==="blog")await client.query("INSERT INTO blog_posts(version_id,page_id,author_label,category,reading_time,cover_source) VALUES($1,$2,$3,$4,$5,$6)",[versionId,id,data.author??null,data.category??null,data.readingTime??null,data.coverImage??null]);
    if(kind==="banner")await client.query("INSERT INTO banners(version_id,page_id,position,sort_order,cta_label,cta_url,image_source) VALUES($1,$2,$3,$4,$5,$6,$7)",[versionId,id,data.position??"hero",data.order??0,data.ctaLabel??null,data.ctaUrl??null,data.image??null]);
    const status=homepage||data.status==="published"||data.active===true?"published":"draft";
    if(status==="published")await client.query("INSERT INTO page_publications(page_id,version_id) VALUES($1,$2) ON CONFLICT(page_id) DO UPDATE SET version_id=excluded.version_id",[id,versionId]);
    await client.query("UPDATE pages SET status=$2 WHERE id=$1",[id,status]);
    await audit(client,principal,"cms.saved",entityTypes[resource],id,Object.keys(data).filter(key=>!["id","version","config"].includes(key)),oldVersion,next);
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
          const compareAt=data.originalPrice===undefined?old?.compare_at_minor??null:data.originalPrice;
          if(compareAt!==null&&BigInt(compareAt)<BigInt(data.price))return fail("INVALID_INPUT",400,"Compare-at price cannot be below selling price");
          const metadata={...record(old?.legacy_content),...data,price:Number(data.price)/100,originalPrice:compareAt===null?undefined:Number(compareAt)/100};
          const fields=[data.name,data.description??old?.description??"",data.family??old?.family??null,data.badge??old?.badge??null,data.priceSuffix??old?.price_suffix??null,status,data.isFeatured??old?.is_featured??false,json(data.specs??old?.specs??[]),json(data.features??old?.features??[]),json(data.inTheBox??old?.in_the_box??[]),json(metadata),data.seoTitle??old?.seo_title??null,data.seoDescription??old?.seo_description??null,json(data.focusKeywords??old?.focus_keywords??[]),data.canonicalUrl??old?.canonical_url??null,data.noIndex??old?.no_index??false,data.ogImage??old?.og_image_source??null];
          if(old)await client.query("UPDATE products SET name=$2,description=$3,family=$4,badge=$5,price_suffix=$6,status=$7,is_featured=$8,specs=$9,features=$10,in_the_box=$11,legacy_content=$12,seo_title=$13,seo_description=$14,focus_keywords=$15,canonical_url=$16,no_index=$17,og_image_source=$18,version=version+1,updated_at=clock_timestamp() WHERE id=$1",[id,...fields]);
          else await client.query("INSERT INTO products(id,name,description,family,badge,price_suffix,status,is_featured,specs,features,in_the_box,legacy_content,seo_title,seo_description,focus_keywords,canonical_url,no_index,og_image_source,public_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)",[id,...fields,publicKey]);
          const variantId=old?.variant_id??randomUUID();
          if(old?.variant_id)await client.query("UPDATE product_variants SET sku=$2,status=$3,version=version+1 WHERE id=$1",[variantId,data.sku,status==="archived"?"archived":status==="published"?"active":"draft"]);
          else await client.query("INSERT INTO product_variants(id,product_id,sku,is_default,status) VALUES($1,$2,$3,true,$4)",[variantId,id,data.sku,status==="archived"?"archived":status==="published"?"active":"draft"]);
          if(old?.price_id)await client.query("UPDATE prices SET amount_minor=$2,compare_at_minor=$3,version=version+1 WHERE id=$1",[old.price_id,data.price,compareAt]);
          else await client.query("INSERT INTO prices(id,variant_id,amount_minor,compare_at_minor) VALUES($1,$2,$3,$4)",[randomUUID(),variantId,data.price,compareAt]);
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
