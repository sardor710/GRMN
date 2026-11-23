import "server-only";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import type { Availability, DisplayCurrency, ExchangeRateSnapshotDTO, MediaDTO, PriceDTO, ProductCardDTO, ProductDetailDTO, ProductQuery, VariantDTO } from "../../contracts/commerce.ts";
import type { Page, PageInput } from "../../contracts/pagination.ts";
import { AuthFailure } from "../auth/config.ts";
import type { ConcurrencyLimit } from "./limit.ts";
import { PRODUCT_SPEC, isRecordTranslated, localizeRecord, resolveSeoText } from "../../i18n/translate-record.ts";
import type { Locale } from "../../i18n/config.ts";
import { effectiveVariantContent, localizeVariantOverride, parseVariantContent, type ProductContentDTO, type VariantContent } from "../../lib/catalog/variant-content.ts";
import { PRODUCT_HTML_FIELDS } from "../../lib/cms/product-input.ts";
import { cardColors } from "../../lib/catalog/card-colors.ts";
import { stableUuid } from "../cms/product-projection.ts";
import type { CategoryDTO, CategoryPageDTO, ProductOptionDTO } from "../../contracts/catalog-browse.ts";
import { initialVariantId } from "../../lib/variant-availability.ts";
import { categorySlugsWithProducts, localizedCategoryNames, loadCategoryPage, resolveCategory, type CategoryPageInput } from "./category-page.ts";
import { compatibleAccessories, compatibleDevices, primaryCategoryPath } from "./compatibility-public.ts";
import { sanitizeOverviewHtml } from "../../lib/import/garmin-parse.ts";

const fail = (): never => { throw new AuthFailure("INVALID_INPUT", 400, "Invalid catalog query or cursor"); };
const text = z.string().trim().min(1).max(200);
const level = z.enum(["Entry", "Advanced", "Premium", "Youth"]);
const size = z.enum(["Small", "Medium", "Large"]);
const schema = z.object({market:text,locale:z.enum(["en","ru","kk"]),displayCurrency:z.enum(["KZT","USD"]),search:z.string().trim().max(200).optional(),category:text.optional(),activities:z.array(text).max(30).optional(),activitiesAll:z.array(text).max(30).optional(),level:level.optional(),levels:z.array(level).max(4).optional(),caseSize:size.optional(),caseSizes:z.array(size).max(3).optional(),sort:z.enum(["name_asc","name_desc","price_asc","price_desc","newest"]).default("name_asc")}).strict();
const pages = z.object({limit:z.number().int().min(1).max(100).default(24),cursor:z.string().min(1).max(2048).optional()}).strict();
function parse<T>(s:z.ZodType<T>,input:unknown):T { const result=s.safeParse(input);return result.success?result.data:fail(); }
type Row = Record<string,unknown>;
const obj = (v:unknown):Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
const array = (v:unknown):unknown[] => Array.isArray(v)?v:[];
const strings = (v:unknown) => array(v).filter((x):x is string=>typeof x==="string");
/** The product detail before per-variant content is attached (Task 2.1). */
type BaseDetail = Omit<ProductDetailDTO,"variants"> & { variants: VariantDTO[] };
const key = (v:string) => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-|-$/g,"");
export function publicImage(url:unknown):string|null {
  if(typeof url!=="string"||url.length>2048||/[\u0000-\u0020\\]/.test(url))return null;
  // Static images and CMS media (/media) by path; admin uploads and imported galleries are served by
  // /uploads/[...path] from UPLOAD_DIR (M4.8) with the same rules plus no percent-encoded traversal and no query/fragment.
  if(/^\/(images|media)\//.test(url)&&!url.startsWith("//")&&!url.split("/").includes(".."))return url;
  if(url.startsWith("/uploads/")&&!/[?#]/.test(url)){let decoded:string;try{decoded=decodeURIComponent(url);}catch{return null;}if(!/[\x00-\x20\\]/.test(decoded)&&!decoded.split("/").some(s=>s===".."||s==="."))return url;}
  return null;
}
/** Swatch images may be local media or garmin.com-hosted thumbnails (never downloaded, see migration 0014). */
export function swatchImage(url:unknown):string|null {
  const local=publicImage(url);if(local)return local;
  if(typeof url!=="string"||url.length>2048||/[\x00-\x20\\"'<>]/.test(url))return null;
  try{const u=new URL(url);return u.protocol==="https:"&&/(^|\.)(garmin\.com|garmincdn\.com)$/.test(u.hostname)?u.toString():null;}catch{return null;}
}
/** In-the-box labels (strings and `{label,image}` items alike) plus, when any item has a public photo, the items. */
function boxContent(value:unknown):Pick<ProductDetailDTO,"inTheBox"|"inTheBoxItems">{
  const items=array(value).flatMap(entry=>{if(typeof entry==="string")return entry.trim()?[{label:entry,image:null}]:[];const r=obj(entry);return typeof r.label==="string"&&r.label.trim()?[{label:r.label,image:publicImage(r.image)}]:[];});
  return{inTheBox:items.map(item=>item.label),...(items.some(item=>item.image)?{inTheBoxItems:items}:{})};
}
// Overview HTML is sanitized on every write; it is sanitized again on read (defense in depth: rows imported
// by older code or edited by hand). Sanitizing a 100 KB overview costs milliseconds, so results are cached.
const overviewCache=new Map<string,string>();
function overviewForStorefront(html:string):string{
  const hash=createHash("sha256").update(html).digest("base64url"),hit=overviewCache.get(hash);if(hit!==undefined)return hit;
  const clean=sanitizeOverviewHtml(html);if(overviewCache.size>=200)overviewCache.delete(overviewCache.keys().next().value as string);overviewCache.set(hash,clean);return clean;
}
function media(value:unknown):MediaDTO|null {const v=obj(value),url=publicImage(v.url);return url?{url,alt:typeof v.alt==="string"?v.alt:"",width:typeof v.width==="number"?v.width:null,height:typeof v.height==="number"?v.height:null}:null;}
const imageSQL = `SELECT jsonb_build_object('url',COALESCE(m.source_path,m.storage_key),'alt',COALESCE(pm.alt_text,m.alt_text,''),'width',m.width,'height',m.height) AS image FROM product_media pm JOIN media_assets m ON m.id=pm.media_id WHERE pm.product_id=p.id AND (pm.variant_id=v.id OR (pm.variant_id IS NULL AND NOT EXISTS(SELECT 1 FROM product_media own WHERE own.product_id=p.id AND own.variant_id IS NOT NULL AND own.media_id=pm.media_id))) AND m.status='ready' AND m.visibility='public' AND m.kind='image' ORDER BY (pm.variant_id IS NOT NULL) DESC,pm.is_primary DESC,pm.position,pm.id`;
// beta5 merge: the catalog writer also links the default photo at product level (admin thumbnail). A product-level
// photo that a variant owns belongs to that variant's gallery only, so it is not appended to the other colours.
// All eligible variants, classification and media are read in one bounded SQL operation.
// Only projected fields leave this module. Legacy JSON is compatibility input, never a DTO.
// Task 21A (catalog plans): `eligible` holds only what filtering, sorting and paging need; display
// columns, classification keys and the variant/gallery/option JSON are computed for the selected page
// only. Building them for every published product before LIMIT took ~1.5 s per listing at 1,000 products.
// A variant is eligible when it is active, has an active KZT price in the market and chooses every option.
// (The database also rejects an incomplete active variant at commit; the option check is defense in depth.
// A count comparison instead of NOT EXISTS was measured slower: ~1.17 s vs ~0.78 s for a price sort.)
export const eligibleFrom = (stock: boolean) => `FROM product_variants v
 JOIN prices pr ON pr.variant_id=v.id AND pr.is_active AND pr.currency='KZT' AND pr.market=$1${stock ? `
 CROSS JOIN LATERAL (SELECT count(*) AS known,COALESCE(sum(ib.on_hand-ib.reserved),0) AS free FROM inventory_balances ib JOIN stock_locations sl ON sl.id=ib.location_id AND sl.archived_at IS NULL WHERE ib.variant_id=v.id) balance` : ""}
 WHERE v.product_id=p.id AND v.status='active' AND NOT EXISTS(SELECT 1 FROM product_options po WHERE po.product_id=p.id AND NOT EXISTS(SELECT 1 FROM variant_option_values vo WHERE vo.variant_id=v.id AND vo.option_id=po.id))`;
// The same variants with their stock state.
export const variantsFrom = eligibleFrom(true);
export const stateSQL = `(CASE WHEN balance.known=0 THEN 'unavailable' WHEN balance.free>0 THEN 'available' ELSE 'out_of_stock' END)`;
// Classification keys of product `p`; `eligible` computes one only when a filter needs it.
export const keySQL = {
  category_keys: `CASE WHEN p.legacy_content ? 'category' THEN ARRAY[trim(both '-' from regexp_replace(lower(p.legacy_content->>'category'),'[^[:alnum:]]+','-','g'))] ELSE ARRAY(SELECT c.key FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=p.id AND NOT c.archived) END`,
  activity_keys: `CASE WHEN jsonb_typeof(p.legacy_content->'activities')='array' THEN ARRAY(SELECT trim(both '-' from regexp_replace(lower(a),'[^[:alnum:]]+','-','g')) FROM jsonb_array_elements_text(p.legacy_content->'activities') a) ELSE ARRAY(SELECT a.key FROM product_activities pa JOIN activities a ON a.id=pa.activity_id WHERE pa.product_id=p.id) END`,
  level: `COALESCE(p.legacy_content->>'level',(SELECT ae.label FROM product_attribute_values av JOIN attribute_definitions ad ON ad.id=av.attribute_id JOIN attribute_enum_values ae ON ae.attribute_id=ad.id AND ae.key=av.enum_value WHERE av.product_id=p.id AND ad.key='level'))`,
  case_size: `COALESCE(p.legacy_content->>'caseSize',(SELECT ae.label FROM product_attribute_values av JOIN attribute_definitions ad ON ad.id=av.attribute_id JOIN attribute_enum_values ae ON ae.attribute_id=ad.id AND ae.key=av.enum_value WHERE av.product_id=p.id AND ad.key='case_size'))`,
} as const;
type KeyColumn = keyof typeof keySQL;
// Paging and sorting read the maintained offer summary (catalog_variant_offers, migration 0015): one row
// per eligible variant and market, kept equal to the live definition above at every commit by deferred
// triggers. Price sorts take each product's chosen offer from its index (available first, then cheapest,
// then variant id: the same order as `chosen`) instead of ranking every variant per request (21B: 1.3 s
// per page at 5,000 products); other sorts only need to know an eligible offer exists. Display prices,
// stock states and the chosen offer of the selected page are still built live by offersSQL.
const chosenOffer = `SELECT o.amount_minor AS amount FROM catalog_variant_offers o WHERE o.product_id=p.id AND o.market=$1 ORDER BY o.available DESC NULLS LAST,o.amount_minor,o.variant_key LIMIT 1`;
const hasOffer = `EXISTS(SELECT 1 FROM catalog_variant_offers o WHERE o.product_id=p.id AND o.market=$1)`;
const base = (byPrice: boolean, keys: ReadonlySet<KeyColumn>) => `WITH eligible AS (
 SELECT p.id,p.public_key,p.name,p.description,to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_key,
 ${[...keys].map(column => `${keySQL[column]} AS ${column},`).join("\n ")}
 ${byPrice ? "summary.amount" : "NULL::bigint AS amount"}
 FROM products p
 ${byPrice
    ? `JOIN LATERAL (${chosenOffer}) summary ON true`
    : ""}
 WHERE p.status='published'${byPrice ? "" : ` AND ${hasOffer}`}
 )`;
// Display columns of the selected page (`p` is joined by offersSQL).
const pageColumns = `p.id,p.public_key,p.product_code,p.name,p.description,p.family,p.badge,p.price_suffix,p.specs,p.features,p.in_the_box,p.seo_title,p.seo_description,p.canonical_url,p.no_index,p.og_image_source,
 selected.created_key,selected.amount,${(Object.keys(keySQL) as KeyColumn[]).map(column => `${keySQL[column]} AS ${column}`).join(",")},
 offers.variants,chosen.offer,
 CASE WHEN jsonb_typeof(p.legacy_content->'options')='array' THEN p.legacy_content->'options' END AS editor_options,
 CASE WHEN offers.variants @> '[{"availability":"available"}]' THEN 'available' WHEN offers.variants @> '[{"availability":"unavailable"}]' THEN 'unavailable' ELSE 'out_of_stock' END AS availability`;
// Built only for the selected rows (`selected`): every eligible variant with options, stock state and gallery, and the chosen offer.
const offersSQL = `JOIN products p ON p.id=selected.id
 JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'name',v.name,'isDefault',v.is_default,'amount',pr.amount_minor::text,'compare',pr.compare_at_minor::text,
 'options',COALESCE((SELECT jsonb_object_agg(po.key,ov.label) FROM variant_option_values vo JOIN product_options po ON po.id=vo.option_id JOIN option_values ov ON ov.id=vo.option_value_id WHERE vo.variant_id=v.id),'{}'),
 'optionValueIds',COALESCE((SELECT jsonb_agg(vo.option_value_id) FROM variant_option_values vo WHERE vo.variant_id=v.id),'[]'),
 'availability',${stateSQL},
 'gallery',CASE WHEN EXISTS(SELECT 1 FROM product_media pm WHERE pm.product_id=p.id AND (pm.variant_id=v.id OR pm.variant_id IS NULL)) THEN COALESCE((SELECT jsonb_agg(im.image) FROM (${imageSQL}) im),'[]') ELSE CASE WHEN p.legacy_content->>'image' IS NOT NULL THEN jsonb_build_array(jsonb_build_object('url',p.legacy_content->>'image','alt',p.name)) ELSE '[]' END END
 ) ORDER BY v.is_default DESC,v.id) AS variants ${variantsFrom}) offers ON offers.variants IS NOT NULL
 CROSS JOIN LATERAL (SELECT item AS offer FROM jsonb_array_elements(offers.variants) item ORDER BY (item->>'availability'='available') DESC,(item->>'amount')::bigint,item->>'id' LIMIT 1) chosen`;

// `listingLimit` (Task 21B follow-up) caps concurrent listings only: key, product and redirect reads stay
// uncapped, so a burst of listings cannot starve product pages of pool connections.
export function createCatalogService({pool,publicMarkets=["default"],listingLimit}:{pool:Pick<Pool,"query">;publicMarkets?:readonly string[];listingLimit?:ConcurrencyLimit}) {
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
  // Task C-d: the card's colour dots, from the editor's colour option (legacy_content, already on the selected row)
  // and only the colours an eligible variant of this page's offers is in: no extra query per card. An editor value
  // is matched exactly by the id the projection gave its option_values row (product-projection.ts stableUuid), or,
  // for documents the catalog writer saved (beta5 merge), by the stored option value id itself.
  function colors(row:Row):NonNullable<ProductCardDTO["colors"]>{
    const productId=String(row.id),chosen=new Set(array(row.variants).flatMap(v=>strings(obj(v).optionValueIds)));
    return cardColors(row.editor_options,(option,value)=>option.id!==""&&value.id!==""&&(chosen.has(value.id)||chosen.has(stableUuid(stableUuid(productId,"option",option.id),"value",value.id))));
  }
  function card(row:Row,fx:ExchangeRateSnapshotDTO|null):ProductCardDTO {
    const offer=obj(row.offer),dots=colors(row);return {...(dots.length?{colors:dots}:{}),id:String(row.id),publicKey:String(row.public_key),productCode:String(row.product_code),name:String(row.name),description:String(row.description),noIndex:row.no_index===true,canonicalUrl:row.canonical_url==null?null:String(row.canonical_url),updatedAt:String(row.created_key),family:String(row.family??""),badge:row.badge==null?null:String(row.badge),priceSuffix:row.price_suffix==null?undefined:String(row.price_suffix),activities:strings(row.activity_keys),level:level.safeParse(row.level).success?row.level as ProductCardDTO["level"]:null,caseSize:size.safeParse(row.case_size).success?row.case_size as ProductCardDTO["caseSize"]:null,image:array(offer.gallery).map(media).find(Boolean)??null,price:price(offer,fx),availability:row.availability as Availability};
  }
  async function select(q:ReturnType<typeof queryInput>,page:PageInput={},keys?:string[]):Promise<{rows:Row[];nextCursor:string|null;fx:ExchangeRateSnapshotDTO|null}>{
    const pg=parse(pages,page),fx=await rate(q.displayCurrency),scope=createHash("sha256").update(JSON.stringify([q,fx?.id??null,keys??null])).digest("hex"),args:unknown[]=[q.market],where:string[]=[];
    const param=(v:unknown)=>{args.push(v);return `$${args.length}`;},keyColumns=new Set<KeyColumn>();
    if(keys)where.push(`public_key=ANY(${param(keys)}::text[])`);
    if(q.search)where.push(`(name ILIKE ${param("%"+q.search.replace(/[\\%_]/g,m=>"\\"+m)+"%")} OR description ILIKE $${args.length})`);
    if(q.category)keyColumns.add("category_keys");if(q.activities?.length||q.activitiesAll?.length)keyColumns.add("activity_keys");if(q.level||q.levels?.length)keyColumns.add("level");if(q.caseSize||q.caseSizes?.length)keyColumns.add("case_size");
    if(q.category)where.push(`${param(key(q.category))}=ANY(category_keys)`);
    if(q.activities?.length)where.push(`activity_keys && ${param(q.activities.map(key))}::text[]`);
    if(q.activitiesAll?.length)where.push(`activity_keys @> ${param(q.activitiesAll.map(key))}::text[]`);
    if(q.level)where.push(`level=${param(q.level)}`);
    if(q.levels?.length)where.push(`level=ANY(${param(q.levels)}::text[])`);
    if(q.caseSize)where.push(`case_size=${param(q.caseSize)}`);
    if(q.caseSizes?.length)where.push(`case_size=ANY(${param(q.caseSizes)}::text[])`);
    const field=q.sort==="name_asc"||q.sort==="name_desc"?"name":q.sort==="newest"?"created_key":"amount",desc=q.sort==="name_desc"||q.sort==="price_desc"||q.sort==="newest",cast=field==="amount"?"::bigint":"::text";
    if(pg.cursor){let c;try{if(!/^[A-Za-z0-9_-]+$/.test(pg.cursor))throw Error();c=JSON.parse(Buffer.from(pg.cursor,"base64url").toString("utf8"));if(c.v!==1||c.scope!==scope||!z.uuid().safeParse(c.id).success||typeof c.value!=="string"||c.value.length>1000||Object.keys(c).length!==4||(field==="amount"&&!/^(0|[1-9][0-9]*)$/.test(c.value)))throw Error();}catch{return fail();}where.push(`(${field},id) ${desc?"<":">"} (${param(c.value)}${cast},${param(c.id)}::uuid)`);}
    const order=`${field} ${desc?"DESC":"ASC"},id ${desc?"DESC":"ASC"}`;
    const rows=(await pool.query(`${base(field==="amount",keyColumns)}, selected AS (SELECT * FROM eligible${where.length?" WHERE "+where.join(" AND "):""} ORDER BY ${order} LIMIT ${param(pg.limit+1)}) SELECT ${pageColumns} FROM selected ${offersSQL} ORDER BY selected.${order.replace(",id",",selected.id")}`,args)).rows;
    const more=rows.length>pg.limit,items=rows.slice(0,pg.limit),last=items.at(-1);return{rows:items,fx,nextCursor:more?Buffer.from(JSON.stringify({v:1,scope,id:last!.id,value:String(last![field])})).toString("base64url"):null};
  }
  // Task 24: ru/kk overlays from product_translations (blank or missing fields fall back to English).
  async function translationsFor(ids:string[]):Promise<Map<string,Record<string,unknown>>>{
    if(!ids.length)return new Map();
    const rows=(await pool.query("SELECT product_id,jsonb_object_agg(locale,content) AS translations FROM product_translations WHERE product_id=ANY($1::uuid[]) GROUP BY product_id",[ids])).rows;
    return new Map(rows.map(r=>[String(r.product_id),obj(r.translations)]));
  }
  function localizedCard<T extends ProductCardDTO>(dto:T,translations:Record<string,unknown>|undefined,locale:Locale):T{
    if(locale==="en"||!translations)return dto;
    const local=localizeRecord({name:dto.name,description:dto.description,translations},locale,PRODUCT_SPEC);
    return{...dto,name:local.name,description:local.description};
  }
  async function localizedCards(items:ProductCardDTO[],locale:Locale):Promise<ProductCardDTO[]>{
    if(locale==="en")return items;const map=await translationsFor(items.map(i=>i.id));return items.map(i=>localizedCard(i,map.get(i.id),locale));
  }
  async function cardsByKeys(keys:string[],market:string,displayCurrency:DisplayCurrency):Promise<ProductCardDTO[]>{
    const out:ProductCardDTO[]=[];
    for(let i=0;i<keys.length;i+=100){const result=await select(queryInput({market,displayCurrency,locale:"en"}),{limit:100},keys.slice(i,i+100));out.push(...result.rows.map(row=>card(row,result.fx)));}
    return out;
  }
  /** M5.6: overview HTML and spec groups live in legacy_content; only these two projected fields leave it. */
  async function productContent(productId:string):Promise<Pick<ProductDetailDTO,"overviewHtml"|"specGroups">>{
    const row=(await pool.query("SELECT legacy_content->'overviewHtml' AS overview_html,legacy_content->'specGroups' AS spec_groups FROM products WHERE id=$1",[productId])).rows[0]??{};
    const specGroups=array(row.spec_groups).flatMap(value=>{const g=obj(value),items=array(g.items).flatMap(item=>{const r=obj(item);return typeof r.label==="string"&&typeof r.value==="string"&&(r.label||r.value)?[{label:r.label,value:r.value}]:[];});return items.length?[{title:typeof g.title==="string"?g.title:"",items}]:[];});
    const overviewHtml=typeof row.overview_html==="string"&&row.overview_html.trim()?overviewForStorefront(row.overview_html):"";
    return{...(overviewHtml?{overviewHtml}:{}),...(specGroups.length?{specGroups}:{})};
  }
  async function productOptions(productId:string):Promise<ProductOptionDTO[]>{
    const rows=(await pool.query(`SELECT po.key,po.name,po.display,COALESCE(jsonb_agg(jsonb_build_object('label',ov.label,'swatchColor',ov.swatch_color,'swatchImage',ov.swatch_image_source) ORDER BY ov.position,ov.key) FILTER (WHERE ov.id IS NOT NULL),'[]') AS values
      FROM product_options po LEFT JOIN option_values ov ON ov.option_id=po.id WHERE po.product_id=$1 GROUP BY po.id ORDER BY po.position,po.key`,[productId])).rows;
    return rows.map(r=>({key:String(r.key),name:String(r.name),display:r.display==="swatch"||r.display==="dropdown"?r.display:"buttons",values:array(r.values).map(value=>{const v=obj(value);return{label:String(v.label),swatchColor:typeof v.swatchColor==="string"?v.swatchColor:null,swatchImage:swatchImage(v.swatchImage)};})}));
  }
  async function englishDetail(publicKey:string,market:string,displayCurrency:DisplayCurrency):Promise<BaseDetail|null>{
      parse(text,publicKey);const q=queryInput({market,displayCurrency,locale:"en"}),result=await select(q,{limit:1},[publicKey]),row=result.rows[0];if(!row)return null;
      const relations=(await pool.query(`SELECT p.public_key,r.relation_type FROM product_relations r JOIN products p ON p.id=r.target_product_id WHERE r.source_product_id=$1 AND p.status='published' AND EXISTS(SELECT 1 FROM product_variants v JOIN prices pr ON pr.variant_id=v.id AND pr.is_active AND pr.currency='KZT' AND pr.market=$2 WHERE v.product_id=p.id AND v.status='active') ORDER BY r.position,p.id LIMIT 100`,[row.id,market])).rows;
      const variants:VariantDTO[]=array(row.variants).map(value=>{const v=obj(value);return{id:String(v.id),sku:String(v.sku),name:v.name==null?"":String(v.name),options:Object.fromEntries(Object.entries(obj(v.options)).filter((pair):pair is [string,string]=>typeof pair[1]==="string")),price:price(v,result.fx),availability:v.availability as Availability,gallery:array(v.gallery).map(media).filter((x):x is MediaDTO=>x!==null)};});
      const defaultVariantId=String(obj(array(row.variants).find(v=>obj(v).isDefault===true)??array(row.variants)[0]).id),selectedVariantId=initialVariantId(variants,{defaultId:defaultVariantId})??String(obj(row.offer).id);
      const productId=String(row.id),cards=(keys:string[])=>cardsByKeys(keys,market,displayCurrency);
      const [options,breadcrumb,compatibleAccessoriesList,compatibleDevicesList,content]=await Promise.all([productOptions(productId),primaryCategoryPath(pool,productId),compatibleAccessories(pool,productId,cards),compatibleDevices(pool,productId,cards),productContent(productId)]);
      return{...card(row,result.fx),selectedVariantId,defaultVariantId,options,breadcrumb,compatibleAccessories:compatibleAccessoriesList,compatibleDevices:compatibleDevicesList,variants,gallery:variants.find(v=>v.id===selectedVariantId)?.gallery??[],specs:array(row.specs).flatMap(v=>{const r=obj(v);return typeof r.label==="string"&&typeof r.value==="string"?[{label:r.label,value:r.value}]:[];}),features:array(row.features).flatMap(v=>{const r=obj(v);return typeof r.title==="string"&&typeof r.body==="string"?[{title:r.title,body:r.body,image:media({url:r.image,alt:r.title})}]:[];}),...boxContent(row.in_the_box),...content,compatibleProductKeys:relations.filter(r=>r.relation_type==="compatible_accessory").map(r=>r.public_key),relatedProductKeys:relations.filter(r=>r.relation_type==="related"||r.relation_type==="upsell").map(r=>r.public_key),seo:{title:String(row.seo_title??row.name),description:String(row.seo_description??row.description),canonicalUrl:row.canonical_url==null?null:String(row.canonical_url),noIndex:row.no_index===true,image:publicImage(row.og_image_source)}};
    }
  const api = {
    /** Taxonomy page for any category slug (any depth); null when the slug is unknown or archived. */
    async getCategoryPage(slug:string,input:Omit<CategoryPageInput,"market">&{market?:string;displayCurrency?:DisplayCurrency}={}):Promise<CategoryPageDTO|null>{
      const {displayCurrency="KZT",market="default",...rest}=input;if(!publicMarkets.includes(market))fail();
      return loadCategoryPage(pool,slug,{...rest,market},keys=>cardsByKeys(keys,market,displayCurrency));
    },
    async getCategory(slug:string):Promise<CategoryDTO|null>{const found=await resolveCategory(pool,slug);return found?{name:found.name,slug:found.slug,kind:found.kind,description:found.description,path:found.path,presetFilters:found.presetFilters}:null;},
    async listCategorySlugsWithProducts(market="default"):Promise<string[]>{if(!publicMarkets.includes(market))fail();return categorySlugsWithProducts(pool,market);},
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
    async listProducts(input:ProductQuery,page:PageInput={}):Promise<Page<ProductCardDTO>> {const q=queryInput(input),run=()=>select(q,page),result=await(listingLimit?listingLimit(run):run());return{items:await localizedCards(result.rows.map(row=>card(row,result.fx)),q.locale),nextCursor:result.nextCursor};},
    async getProductsByKeys(keys:string[],input:ProductQuery):Promise<Page<ProductCardDTO>> {parse(z.array(text).max(100),keys);const q=queryInput(input),result=await select(q,{limit:100},keys);return{items:await localizedCards(result.rows.map(row=>card(row,result.fx)),q.locale),nextCursor:null};},
    /** Task 24: languages each product is indexable in (en plus translated name and description). */
    async translatedLocales(productIds:string[]):Promise<Map<string,Locale[]>>{
      parse(z.array(z.uuid()).max(500),productIds);const map=await translationsFor(productIds);
      return new Map(productIds.map(id=>{const t=map.get(id);return[id,["en",...(["ru","kk"] as const).filter(l=>t&&isRecordTranslated({translations:t},l,["name","description"]))] as Locale[]];}));
    },
    /** The given product codes that belong to published products (homepage links to garmin.com ids, 0029). */
    async publishedProductCodes(codes:string[]):Promise<Set<string>>{
      const valid=[...new Set(codes)].filter(code=>/^[0-9]{1,12}$/.test(code)).slice(0,500);if(!valid.length)return new Set();
      return new Set((await pool.query("SELECT product_code FROM products WHERE product_code=ANY($1::text[]) AND status='published'",[valid])).rows.map(r=>String(r.product_code)));
    },
    /** Owner 2026-11-23: the product page /p/{code}; null for an unknown code or an unpublished product. */
    async getProductByCode(code:string,market:string,displayCurrency:DisplayCurrency,locale:Locale="en"):Promise<ProductDetailDTO|null>{
      if(!/^[0-9]{1,12}$/.test(code))return null;
      const row=(await pool.query("SELECT public_key FROM products WHERE product_code=$1 AND status='published'",[code])).rows[0];
      return row?api.getProductByPublicKey(String(row.public_key),market,displayCurrency,locale):null;
    },
    async getProductByPublicKey(publicKey:string,market:string,displayCurrency:DisplayCurrency,locale:Locale="en"):Promise<ProductDetailDTO|null>{
      const english=await englishDetail(publicKey,market,displayCurrency);if(!english)return null;
      // Owner 2026-11-22: breadcrumb and Accessories tab headings use the category names of the page's language.
      const names=await localizedCategoryNames(pool,locale),localCrumb=(crumb:{slug:string;name:string})=>({...crumb,name:names.get(crumb.slug)??crumb.name});
      const found=names.size?{...english,breadcrumb:english.breadcrumb?.map(localCrumb),compatibleAccessories:english.compatibleAccessories?.map(a=>a.group?{...a,group:localCrumb(a.group)}:a)}:english;
      // Task 2.1: the editor variants' ids and SKUs (translated overrides are keyed by editor id; after the
      // beta5 merge the catalog writer stores them by variant id, so both keys are looked up below).
      const editorial=obj((await pool.query("SELECT jsonb_build_object('variants',(SELECT jsonb_agg(jsonb_build_object('id',e->'id','sku',e->'sku')) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(legacy_content->'variants')='array' THEN legacy_content->'variants' ELSE '[]'::jsonb END) e)) AS doc FROM products WHERE id=$1",[found.id])).rows[0]?.doc);
      const overrideRows=(await pool.query("SELECT id::text AS id,content_overrides FROM product_variants WHERE product_id=$1 AND id=ANY($2::uuid[])",[found.id,found.variants.map(v=>v.id)])).rows;
      const overrides=new Map<string,VariantContent>(overrideRows.map(r=>[String(r.id),parseVariantContent(r.content_overrides)]));
      const editorIds=new Map<string,string>(array(editorial.variants).flatMap(e=>{const v=obj(e);return typeof v.id==="string"&&typeof v.sku==="string"?[[v.sku.trim().toLowerCase(),v.id] as [string,string]]:[];}));
      const optionNames=Object.fromEntries((await pool.query("SELECT key,name FROM product_options WHERE product_id=$1 ORDER BY position,key",[found.id])).rows.map(r=>[String(r.key),String(r.name)]));
      // beta5 merge: overview HTML and grouped specs come from productContent() inside englishDetail (sanitized for the storefront).
      const detail:BaseDetail={...found,...(Object.keys(optionNames).length?{optionNames}:{})};
      const translations=(await translationsFor([detail.id])).get(detail.id);
      const translatedLocales:Locale[]=["en",...(["ru","kk"] as const).filter(l=>translations&&isRecordTranslated({translations},l,["name","description"]))];
      // Task 2.1: each variant's effective content (own blocks replace the product's, absent keys inherit).
      const withVariants=(product:ProductContentDTO,localize?:(english:VariantContent,variant:VariantDTO)=>VariantContent)=>detail.variants.map(v=>{const english=overrides.get(v.id)??{};return{...v,content:effectiveVariantContent(product,{content:localize?localize(english,v):english}),ownsOverview:english.overviewHtml!==undefined};});
      if(locale==="en"||!translations)return{...detail,translatedLocales,variants:withVariants({specs:detail.specs,specGroups:detail.specGroups,overviewHtml:detail.overviewHtml,inTheBox:detail.inTheBox})};
      const local=localizeRecord({name:detail.name,description:detail.description,specs:detail.specs,features:detail.features.map(f=>({title:f.title,body:f.body})),inTheBox:detail.inTheBox,overviewHtml:detail.overviewHtml,specGroups:detail.specGroups,translations},locale,PRODUCT_SPEC);
      const seoTitle=resolveSeoText({seoTitle:detail.seo?.title,name:detail.name,translations} as {translations?:unknown},locale,["seoTitle","name"]);
      // RU/KK: a translated override (product_translations.content.variants[<editor id>].content) wins per
      // row; an owned block without one keeps the English override, never the product's translation.
      const localOverlay=obj(obj(translations)[locale]),variantOverlays=obj(localOverlay.variants);
      const variants=withVariants({specs:local.specs,specGroups:local.specGroups,overviewHtml:local.overviewHtml,inTheBox:local.inTheBox},(english,v)=>{
        const editorId=editorIds.get(v.sku.trim().toLowerCase()),translated=obj(variantOverlays[editorId??v.id]??variantOverlays[v.id]).content;
        const own=localizeVariantOverride(english,translated,locale);
        return own.overviewHtml!==undefined&&own.overviewHtml!==english.overviewHtml?{...own,overviewHtml:PRODUCT_HTML_FIELDS.overviewHtml(own.overviewHtml)}:own;
      });
      return{...detail,variants,translatedLocales,name:local.name,description:local.description,specs:local.specs,inTheBox:local.inTheBox,
        ...(local.overviewHtml?{overviewHtml:local.overviewHtml}:{}),...(local.specGroups?{specGroups:local.specGroups}:{}),
        features:detail.features.map((f,i)=>({...f,title:local.features[i]?.title??f.title,body:local.features[i]?.body??f.body})),
        ...(detail.seo?{seo:{...detail.seo,title:seoTitle??local.name,description:resolveSeoText({seoDescription:detail.seo.description,description:detail.description,translations} as {translations?:unknown},locale,["seoDescription","description"])??local.description}}:{})};
    },
  };
  return api;
}
