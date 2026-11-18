import "server-only";
import { AuthFailure } from "../auth/config.ts";
import type { CMSBlog, CMSProduct, HomepageConfig } from "../../lib/cms/types";

export function cmsBackend(source:Readonly<Record<string,string|undefined>>=process.env):"legacy"|"postgres" {
  const mode=source.CMS_BACKEND??"legacy";
  if(mode!=="legacy"&&mode!=="postgres")throw new AuthFailure("UNAVAILABLE",503,"CMS configuration is unavailable");
  return mode;
}
type Resource="products"|"blogs"|"homepage";
interface Page {items:unknown[];nextCursor:string|null}
export function createCMSReadAdapter(options:{mode:"legacy"|"postgres";postgres:(resource:Resource,input:Record<string,unknown>)=>Promise<Page>;legacy:(resource:Resource,input:Record<string,unknown>)=>Promise<unknown[]|Page>}) {
  return async(resource:Resource,input:Record<string,unknown>={}):Promise<Page>=>{
    if(options.mode==="postgres")return options.postgres(resource,input);
    const data=await options.legacy(resource,input);return Array.isArray(data)?{items:data,nextCursor:null}:data;
  };
}
async function read(resource:Resource,input:Record<string,unknown>={}):Promise<Page> {
  return createCMSReadAdapter({mode:cmsBackend(),
    postgres:async(name,query)=>{
      const {getCMSService}=await import("./runtime.ts");const cms=getCMSService();
      if(name==="products")return cms.publicProducts(query);
      return cms.publicContent(name==="blogs"?"blog":"homepage",query);
    },
    legacy:async(name,query)=>{
      const store=await import("../../lib/cms/store");
      if(name==="homepage")return[{config:store.getHomepageConfig()}];
      const raw=name==="products"?store.getProducts():store.getBlogs();
      let rows:unknown[]=raw.filter(item=>item.status==="published");
      if(name==="products"&&typeof query.id==="string"){
        const explicit=raw.find(item=>item.id===query.id);if(explicit)return explicit.status==="published"?[explicit]:[];
        const {products}=await import("../../lib/public-products");const item=products.find(product=>product.id===query.id);
        return item?[{...item,sku:"",status:"published",stock:0,stockManaged:false,currency:"USD",createdAt:"",category:"",subCategory:"",specs:[],inTheBox:[],compatibleAccessories:[]}]:[];
      }
      if(name==="blogs"){
        const {blogPosts,articleBody}=await import("../../lib/blog");
        const claimed=new Set(raw.map(item=>"slug"in item?item.slug:undefined));
        const editorial=blogPosts.filter(post=>!claimed.has(post.slug)).map(post=>{
          const date=new Date(post.date);const publishedAt=Number.isFinite(date.getTime())?date.toISOString():"";
          return{id:"editorial:"+post.slug,slug:post.slug,title:post.title,excerpt:post.excerpt,content:articleBody(post).join("\n\n"),coverImage:post.image,category:post.categories[0]??post.category,readingTime:post.readTime,author:"Garmin Editorial Team",status:"published",publishedAt,createdAt:publishedAt};
        });
        rows=[...rows,...editorial];
        if(typeof query.slug==="string")return rows.filter(item=>item!==null&&typeof item==="object"&&"slug"in item&&item.slug===query.slug);
      }
      const normalize=(value:unknown)=>String(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-|-$/g,"");
      rows=rows.filter(value=>{const item=value as Record<string,unknown>;const activities=Array.isArray(item.activities)?item.activities.map(normalize):[];
        if(query.search&&![item.name,item.title,item.excerpt,item.description].some(v=>typeof v==="string"&&v.toLowerCase().includes(String(query.search).toLowerCase())))return false;
        if(query.category&&normalize(item.category)!==normalize(query.category))return false;
        if(Array.isArray(query.activities)&&query.activities.length&&!query.activities.some(v=>activities.includes(normalize(v))))return false;
        if(Array.isArray(query.activitiesAll)&&!query.activitiesAll.every(v=>activities.includes(normalize(v))))return false;
        if(Array.isArray(query.levels)&&query.levels.length&&!query.levels.includes(item.level))return false;
        if(Array.isArray(query.caseSizes)&&query.caseSizes.length&&!query.caseSizes.includes(item.caseSize))return false;
        return true;
      });
      const sort=String(query.sort??"name_asc");rows.sort((a,b)=>{const x=a as Record<string,unknown>,y=b as Record<string,unknown>;if(sort==="price_asc"||sort==="price_desc")return (Number(x.price)-Number(y.price))*(sort==="price_desc"?-1:1);if(sort==="newest")return String(y.createdAt).localeCompare(String(x.createdAt));return String(x.name??x.title).localeCompare(String(y.name??y.title));});
      const binding=JSON.stringify(Object.fromEntries(Object.entries(query).filter(([k])=>!["cursor","limit"].includes(k)).sort()));
      if(query.cursor!==undefined&&(typeof query.cursor!=="string"||query.cursor.length<1||query.cursor.length>2048))throw new AuthFailure("INVALID_CURSOR",400,"Invalid page cursor");
      const limit=typeof query.limit==="number"?query.limit:24;if(!Number.isInteger(limit)||limit<1||limit>100)throw new AuthFailure("INVALID_INPUT",400,"Invalid page limit");
      let offset=0;
      if(query.cursor){try{const cursor=JSON.parse(Buffer.from(String(query.cursor),"base64url").toString("utf8"));if(cursor.source!=="legacy"||cursor.resource!==name||cursor.binding!==binding||!Number.isSafeInteger(cursor.offset)||cursor.offset<0)throw Error();offset=cursor.offset;}catch{throw new AuthFailure("INVALID_CURSOR",400,"Invalid page cursor");}}
      const selected=rows.slice(offset,offset+limit);return{items:selected,nextCursor:offset+limit<rows.length?Buffer.from(JSON.stringify({source:"legacy",resource:name,binding,offset:offset+limit})).toString("base64url"):null};
    },
  })(resource,input);
}
export async function readProductsPage(input:{limit?:number;cursor?:string}&Partial<import("../../contracts/commerce").ProductQuery>={}){return await read("products",input) as {items:CMSProduct[];nextCursor:string|null};}
export async function readProduct(id:string){return (await read("products",{id})).items[0] as CMSProduct|undefined;}
export async function readBlogsPage(input:{limit?:number;cursor?:string;search?:string;category?:string}={}){return await read("blogs",input) as {items:CMSBlog[];nextCursor:string|null};}
export async function readBlog(slug:string){return (await read("blogs",{slug})).items[0] as CMSBlog|undefined;}
export async function readHomepage(){
  const item=(await read("homepage")).items[0] as {config:HomepageConfig}|undefined;
  if(!item)throw new AuthFailure("UNAVAILABLE",503,"Homepage content is unavailable");
  if(cmsBackend()!=="postgres")return item.config;
  // 18A ruling I6: carousels bound to a merchandising collection show its published snapshot.
  const [{resolveHomepageCollections},{createPublishingService},{getDatabase}]=await Promise.all([import("../../lib/cms/homepage-collections.ts"),import("../content/publishing.ts"),import("../db/client.ts")]);
  const publishing=createPublishingService({pool:getDatabase().pool,authorize:async()=>{throw new AuthFailure("FORBIDDEN",403,"Public reads cannot authorize staff actions");}});
  return resolveHomepageCollections(item.config,key=>publishing.readCollection(key));
}
