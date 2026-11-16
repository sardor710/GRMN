import "server-only";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import type { Availability, DisplayCurrency, ExchangeRateSnapshotDTO, MediaDTO, PriceDTO, ProductCardDTO, ProductDetailDTO, ProductQuery, VariantDTO } from "../../contracts/commerce.ts";
import type { Page, PageInput } from "../../contracts/pagination.ts";
import { AuthFailure } from "../auth/config.ts";

const fail = (): never => { throw new AuthFailure("INVALID_INPUT", 400, "Invalid catalog query or cursor"); };
const text = z.string().trim().min(1).max(200);
const level = z.enum(["Entry", "Advanced", "Premium", "Youth"]);
const size = z.enum(["Small", "Medium", "Large"]);
const schema = z.object({market:text,locale:z.enum(["en","ru","kk"]),displayCurrency:z.enum(["KZT","USD"]),search:z.string().trim().max(200).optional(),category:text.optional(),activities:z.array(text).max(30).optional(),activitiesAll:z.array(text).max(30).optional(),level:level.optional(),levels:z.array(level).max(4).optional(),caseSize:size.optional(),caseSizes:z.array(size).max(3).optional(),sort:z.enum(["name_asc","price_asc","price_desc","newest"]).default("name_asc")}).strict();
const pages = z.object({limit:z.number().int().min(1).max(100).default(24),cursor:z.string().min(1).max(2048).optional()}).strict();
function parse<T>(s:z.ZodType<T>,input:unknown):T { const result=s.safeParse(input);return result.success?result.data:fail(); }
type Row = Record<string,unknown>;
const obj = (v:unknown):Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
const array = (v:unknown):unknown[] => Array.isArray(v)?v:[];
const strings = (v:unknown) => array(v).filter((x):x is string=>typeof x==="string");
const key = (v:string) => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-|-$/g,"");
export function publicImage(url:unknown):string|null {
  if(typeof url!=="string"||url.length>2048||/[\u0000-\u0020\\]/.test(url))return null;
  if(url.startsWith("/images/")&&!url.startsWith("//")&&!url.split("/").includes(".."))return url;
  return null;
}
function media(value:unknown):MediaDTO|null {const v=obj(value),url=publicImage(v.url);return url?{url,alt:typeof v.alt==="string"?v.alt:"",width:typeof v.width==="number"?v.width:null,height:typeof v.height==="number"?v.height:null}:null;}
const imageSQL = `SELECT jsonb_build_object('url',COALESCE(m.source_path,m.storage_key),'alt',COALESCE(pm.alt_text,m.alt_text,''),'width',m.width,'height',m.height) AS image FROM product_media pm JOIN media_assets m ON m.id=pm.media_id WHERE pm.product_id=p.id AND (pm.variant_id=v.id OR pm.variant_id IS NULL) AND m.status='ready' AND m.visibility='public' AND m.kind='image' ORDER BY (pm.variant_id IS NOT NULL) DESC,pm.is_primary DESC,pm.position,pm.id`;
// All eligible variants, classification and media are read in one bounded SQL operation.
// Only projected fields leave this module. Legacy JSON is compatibility input, never a DTO.
const base = `WITH eligible AS (
 SELECT p.id,p.public_key,p.name,p.description,p.family,p.badge,p.price_suffix,p.specs,p.features,p.in_the_box,p.seo_title,p.seo_description,p.canonical_url,p.no_index,p.og_image_source,
 to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_key,
 CASE WHEN p.legacy_content ? 'category' THEN ARRAY[trim(both '-' from regexp_replace(lower(p.legacy_content->>'category'),'[^[:alnum:]]+','-','g'))] ELSE ARRAY(SELECT c.key FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=p.id AND NOT c.archived) END AS category_keys,
 CASE WHEN jsonb_typeof(p.legacy_content->'activities')='array' THEN ARRAY(SELECT trim(both '-' from regexp_replace(lower(a),'[^[:alnum:]]+','-','g')) FROM jsonb_array_elements_text(p.legacy_content->'activities') a) ELSE ARRAY(SELECT a.key FROM product_activities pa JOIN activities a ON a.id=pa.activity_id WHERE pa.product_id=p.id) END AS activity_keys,
 COALESCE(p.legacy_content->>'level',(SELECT ae.label FROM product_attribute_values av JOIN attribute_definitions ad ON ad.id=av.attribute_id JOIN attribute_enum_values ae ON ae.attribute_id=ad.id AND ae.key=av.enum_value WHERE av.product_id=p.id AND ad.key='level')) AS level,
 COALESCE(p.legacy_content->>'caseSize',(SELECT ae.label FROM product_attribute_values av JOIN attribute_definitions ad ON ad.id=av.attribute_id JOIN attribute_enum_values ae ON ae.attribute_id=ad.id AND ae.key=av.enum_value WHERE av.product_id=p.id AND ad.key='case_size')) AS case_size,
 offers.variants,chosen.offer, (chosen.offer->>'amount')::bigint AS amount,
 CASE WHEN offers.variants @> '[{"availability":"available"}]' THEN 'available' WHEN offers.variants @> '[{"availability":"unavailable"}]' THEN 'unavailable' ELSE 'out_of_stock' END AS availability
 FROM products p
 JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'name',v.name,'amount',pr.amount_minor::text,'compare',pr.compare_at_minor::text,
 'options',COALESCE((SELECT jsonb_object_agg(po.key,ov.label) FROM variant_option_values vo JOIN product_options po ON po.id=vo.option_id JOIN option_values ov ON ov.id=vo.option_value_id WHERE vo.variant_id=v.id),'{}'),
 'availability',CASE WHEN balance.known=0 THEN 'unavailable' WHEN balance.free>0 THEN 'available' ELSE 'out_of_stock' END,
 'gallery',CASE WHEN EXISTS(SELECT 1 FROM product_media pm WHERE pm.product_id=p.id AND (pm.variant_id=v.id OR pm.variant_id IS NULL)) THEN COALESCE((SELECT jsonb_agg(im.image) FROM (${imageSQL}) im),'[]') ELSE CASE WHEN p.legacy_content->>'image' IS NOT NULL THEN jsonb_build_array(jsonb_build_object('url',p.legacy_content->>'image','alt',p.name)) ELSE '[]' END END
 ) ORDER BY v.is_default DESC,v.id) AS variants FROM product_variants v
 JOIN prices pr ON pr.variant_id=v.id AND pr.is_active AND pr.currency='KZT' AND pr.market=$1
 CROSS JOIN LATERAL (SELECT count(*) AS known,COALESCE(sum(ib.on_hand-ib.reserved),0) AS free FROM inventory_balances ib JOIN stock_locations sl ON sl.id=ib.location_id AND sl.archived_at IS NULL WHERE ib.variant_id=v.id) balance
 WHERE v.product_id=p.id AND v.status='active' AND NOT EXISTS(SELECT 1 FROM product_options po WHERE po.product_id=p.id AND NOT EXISTS(SELECT 1 FROM variant_option_values vo WHERE vo.variant_id=v.id AND vo.option_id=po.id))) offers ON offers.variants IS NOT NULL
 CROSS JOIN LATERAL (SELECT item AS offer FROM jsonb_array_elements(offers.variants) item ORDER BY (item->>'availability'='available') DESC,(item->>'amount')::bigint,item->>'id' LIMIT 1) chosen
 WHERE p.status='published'
 )`;

export function createCatalogService({pool,publicMarkets=["default"]}:{pool:Pick<Pool,"query">;publicMarkets?:readonly string[]}) {
  function queryInput(input:unknown){const q=parse(schema,input);if(!publicMarkets.includes(q.market))fail();return q;}
  async function rate(currency:DisplayCurrency):Promise<ExchangeRateSnapshotDTO|null>{
    if(currency!=="USD")return null;
    const row=(await pool.query("SELECT r.id,r.version,r.kzt_per_usd,r.created_at FROM store_settings s JOIN exchange_rate_versions r ON r.id=s.active_exchange_rate_id WHERE s.id=1 AND s.usd_display_enabled")).rows[0];
    return row?{id:row.id,version:row.version,kztPerUsd:row.kzt_per_usd,updatedAt:row.created_at.toISOString()}:null;
  }
  function price(offer:Row,fx:ExchangeRateSnapshotDTO|null):PriceDTO {
    const amount=String(offer.amount),result:PriceDTO={selling:{currency:"KZT",amountMinor:amount},compareAt:offer.compare==null?null:{currency:"KZT",amountMinor:String(offer.compare)},usdEquivalent:null};
    if(fx){const [a,b=""]=fx.kztPerUsd.split("."),scale=BigInt(10)**BigInt(b.length),den=BigInt(a+b);if(den>BigInt(0))result.usdEquivalent={currency:"USD",amountMinor:((BigInt(amount)*scale+den/BigInt(2))/den).toString(),exchangeRate:fx};}
    return result;
  }
  function card(row:Row,fx:ExchangeRateSnapshotDTO|null):ProductCardDTO {
    const offer=obj(row.offer);return {id:String(row.id),publicKey:String(row.public_key),name:String(row.name),description:String(row.description),noIndex:row.no_index===true,canonicalUrl:row.canonical_url==null?null:String(row.canonical_url),updatedAt:String(row.created_key),family:String(row.family??""),badge:row.badge==null?null:String(row.badge),priceSuffix:row.price_suffix==null?undefined:String(row.price_suffix),activities:strings(row.activity_keys),level:level.safeParse(row.level).success?row.level as ProductCardDTO["level"]:null,caseSize:size.safeParse(row.case_size).success?row.case_size as ProductCardDTO["caseSize"]:null,image:array(offer.gallery).map(media).find(Boolean)??null,price:price(offer,fx),availability:row.availability as Availability};
  }
  async function select(q:ReturnType<typeof queryInput>,page:PageInput={},keys?:string[]):Promise<{rows:Row[];nextCursor:string|null;fx:ExchangeRateSnapshotDTO|null}>{
    const pg=parse(pages,page),fx=await rate(q.displayCurrency),scope=createHash("sha256").update(JSON.stringify([q,fx?.id??null,keys??null])).digest("hex"),args:unknown[]=[q.market],where:string[]=[];
    const param=(v:unknown)=>{args.push(v);return `$${args.length}`;};
    if(keys)where.push(`public_key=ANY(${param(keys)}::text[])`);
    if(q.search)where.push(`(name ILIKE ${param("%"+q.search.replace(/[\\%_]/g,m=>"\\"+m)+"%")} OR description ILIKE $${args.length})`);
    if(q.category)where.push(`${param(key(q.category))}=ANY(category_keys)`);
    if(q.activities?.length)where.push(`activity_keys && ${param(q.activities.map(key))}::text[]`);
    if(q.activitiesAll?.length)where.push(`activity_keys @> ${param(q.activitiesAll.map(key))}::text[]`);
    if(q.level)where.push(`level=${param(q.level)}`);
    if(q.levels?.length)where.push(`level=ANY(${param(q.levels)}::text[])`);
    if(q.caseSize)where.push(`case_size=${param(q.caseSize)}`);
    if(q.caseSizes?.length)where.push(`case_size=ANY(${param(q.caseSizes)}::text[])`);
    const field=q.sort==="name_asc"?"name":q.sort==="newest"?"created_key":"amount",desc=q.sort==="price_desc"||q.sort==="newest",cast=field==="amount"?"::bigint":"::text";
    if(pg.cursor){let c;try{if(!/^[A-Za-z0-9_-]+$/.test(pg.cursor))throw Error();c=JSON.parse(Buffer.from(pg.cursor,"base64url").toString("utf8"));if(c.v!==1||c.scope!==scope||!z.uuid().safeParse(c.id).success||typeof c.value!=="string"||c.value.length>1000||Object.keys(c).length!==4||(field==="amount"&&!/^(0|[1-9][0-9]*)$/.test(c.value)))throw Error();}catch{return fail();}where.push(`(${field},id) ${desc?"<":">"} (${param(c.value)}${cast},${param(c.id)}::uuid)`);}
    const rows=(await pool.query(`${base} SELECT * FROM eligible${where.length?" WHERE "+where.join(" AND "):""} ORDER BY ${field} ${desc?"DESC":"ASC"},id ${desc?"DESC":"ASC"} LIMIT ${param(pg.limit+1)}`,args)).rows;
    const more=rows.length>pg.limit,items=rows.slice(0,pg.limit),last=items.at(-1);return{rows:items,fx,nextCursor:more?Buffer.from(JSON.stringify({v:1,scope,id:last!.id,value:String(last![field])})).toString("base64url"):null};
  }
  return {
    async getRedirect(sourcePath:string):Promise<{targetPath:string;statusCode:301|302|307|308}|null>{
      const safe=(path:string)=>path.startsWith("/")&&!path.startsWith("//")&&!/[\\\u0000-\u0020]/.test(path)&&path.length<=2048;
      if(!safe(sourcePath))return fail();
      const rows=(await pool.query(`WITH RECURSIVE chain AS (
        SELECT target_path,status_code,ARRAY[source_path] AS seen,1 AS depth FROM redirects WHERE source_path=$1 AND active
        UNION ALL SELECT r.target_path,r.status_code,c.seen||r.source_path,c.depth+1 FROM chain c JOIN redirects r ON r.source_path=c.target_path AND r.active WHERE c.depth<9 AND NOT c.target_path=ANY(c.seen)
      ) SELECT * FROM chain ORDER BY depth`,[sourcePath])).rows;
      if(!rows.length)return null;
      if(rows.some(r=>!safe(r.target_path)||r.seen.includes(r.target_path)||r.depth>=9))throw new AuthFailure("DEPENDENCY_UNAVAILABLE",503,"Redirect configuration is unavailable");
      return{targetPath:rows[0].target_path,statusCode:rows[0].status_code};
    },
    async listProducts(input:ProductQuery,page:PageInput={}):Promise<Page<ProductCardDTO>> {const result=await select(queryInput(input),page);return{items:result.rows.map(row=>card(row,result.fx)),nextCursor:result.nextCursor};},
    async getProductsByKeys(keys:string[],input:ProductQuery):Promise<Page<ProductCardDTO>> {parse(z.array(text).max(100),keys);const result=await select(queryInput(input),{limit:100},keys);return{items:result.rows.map(row=>card(row,result.fx)),nextCursor:null};},
    async getProductByPublicKey(publicKey:string,market:string,displayCurrency:DisplayCurrency):Promise<ProductDetailDTO|null>{
      parse(text,publicKey);const q=queryInput({market,displayCurrency,locale:"en"}),result=await select(q,{limit:1},[publicKey]),row=result.rows[0];if(!row)return null;
      const relations=(await pool.query(`SELECT p.public_key,r.relation_type FROM product_relations r JOIN products p ON p.id=r.target_product_id WHERE r.source_product_id=$1 AND p.status='published' AND EXISTS(SELECT 1 FROM product_variants v JOIN prices pr ON pr.variant_id=v.id AND pr.is_active AND pr.currency='KZT' AND pr.market=$2 WHERE v.product_id=p.id AND v.status='active') ORDER BY r.position,p.id LIMIT 100`,[row.id,market])).rows;
      const variants:VariantDTO[]=array(row.variants).map(value=>{const v=obj(value);return{id:String(v.id),sku:String(v.sku),name:String(v.name),options:Object.fromEntries(Object.entries(obj(v.options)).filter((pair):pair is [string,string]=>typeof pair[1]==="string")),price:price(v,result.fx),availability:v.availability as Availability,gallery:array(v.gallery).map(media).filter((x):x is MediaDTO=>x!==null)};});
      return{...card(row,result.fx),selectedVariantId:String(obj(row.offer).id),variants,gallery:variants.find(v=>v.id===obj(row.offer).id)?.gallery??[],specs:array(row.specs).flatMap(v=>{const r=obj(v);return typeof r.label==="string"&&typeof r.value==="string"?[{label:r.label,value:r.value}]:[];}),features:array(row.features).flatMap(v=>{const r=obj(v);return typeof r.title==="string"&&typeof r.body==="string"?[{title:r.title,body:r.body,image:media({url:r.image,alt:r.title})}]:[];}),inTheBox:strings(row.in_the_box),compatibleProductKeys:relations.filter(r=>r.relation_type==="compatible_accessory").map(r=>r.public_key),relatedProductKeys:relations.filter(r=>r.relation_type==="related"||r.relation_type==="upsell").map(r=>r.public_key),seo:{title:String(row.seo_title??row.name),description:String(row.seo_description??row.description),canonicalUrl:row.canonical_url==null?null:String(row.canonical_url),noIndex:row.no_index===true,image:publicImage(row.og_image_source)}};
    },
  };
}
