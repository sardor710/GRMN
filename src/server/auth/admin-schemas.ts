import "server-only";
import { z } from "zod";

const text = z.string().max(10000);
const short = z.string().max(500);
const id = z.string().min(1).max(128);
const money = z.number().finite().min(0).max(1e12);
const count = z.number().int().min(0).max(1e8);
const list = z.array(short).max(200);
const link = z.string().max(2048).refine(value => !value || value === "#" || /^\/(?!\/)/.test(value) || /^https?:\/\//i.test(value), "Use a relative or HTTP(S) URL");
const seo = { seoTitle: short.optional(), seoDescription: text.optional(), focusKeywords: list.optional(), canonicalUrl: link.optional(), noIndex: z.boolean().optional(), ogImage: link.optional() };
export const seoPatchInput = z.object({id,...seo}).strict().refine(value=>Object.keys(value).length>1);
export const productInput = z.object({
  id: id.optional(), name: short.min(1), price: money, sku: short.optional(), originalPrice: money.optional(), priceSuffix: short.optional(),
  description: text.optional(), image: link.optional(), badge: short.optional(), family: short.optional(), category: short.optional(), subCategory: short.optional(),
  activities: list.optional(), level: z.enum(["Entry","Advanced","Premium","Youth"]).optional(), caseSize: z.enum(["Small","Medium","Large"]).optional(),
  stock: count.optional(), status: z.enum(["published","draft","archived"]).optional(), isFeatured: z.boolean().optional(),
  specs: z.array(z.object({label: short, value: text}).strict()).max(200).optional(), inTheBox: list.optional(), compatibleAccessories: list.optional(),
  features: z.array(z.object({title: short, body: text, image: link.optional()}).strict()).max(200).optional(), ...seo,
}).strict();
export const bannerInput = z.object({id:id.optional(),title:short.min(1),subtitle:text.optional(),ctaLabel:short.optional(),ctaUrl:link.optional(),image:link.optional(),position:z.enum(["hero","promo_pod","announcement"]).optional(),active:z.boolean().optional(),order:count.optional()}).strict();
export const blogInput = z.object({id:id.optional(),slug:short.optional(),title:short.min(1),excerpt:text.optional(),content:z.string().min(1).max(50000),coverImage:link.optional(),category:short.optional(),readingTime:short.optional(),author:short.optional(),status:z.enum(["published","draft"]).optional(),publishedAt:short.optional(),...seo}).strict();
export const discountInput = z.object({id:id.optional(),code:short.min(1),description:text.optional(),type:z.enum(["percentage","fixed"]).optional(),value:money,minSpend:money.optional(),usageLimit:count.optional(),perCustomerLimit:count.optional(),applyType:z.enum(["all","categories","skus"]).optional(),targetCategories:list.optional(),targetSkus:list.optional(),startDate:short.optional(),expiresAt:short.optional(),isStackable:z.boolean().optional(),status:z.enum(["active","expired","disabled"]).optional()}).strict();
export const settingsInput = z.object({storeName:short,contactEmail:z.email().max(254),supportPhone:short,currency:short,currencySymbol:short,freeShippingThreshold:money,taxRate:z.number().min(0).max(100),maintenanceMode:z.boolean(),garminPaySandbox:z.boolean(),stripeEnabled:z.boolean(),seoTitle:short,seoDescription:text}).strict();
const tile = z.object({id,title:short,image:link,href:link,cta:short,order:count}).strict();
const carouselItem = z.object({id,title:short,description:text,price:short.optional(),originalPrice:short.optional(),badge:short.optional(),image:link,href:link,ctaText:short.optional(),order:count}).strict();
export const homepageInput = z.object({
  heroBanners:z.array(z.object({id,key:short,title:short,subtitle:text,image:link,href:link,active:z.boolean(),order:count}).strict()).max(100),
  carousels:z.array(z.object({id,title:short,subtitle:text.optional(),type:z.enum(["product","promo"]),active:z.boolean(),order:count,items:z.array(carouselItem).max(200)}).strict()).max(100),
  promoTiles:z.array(tile).max(100),storyTiles:z.array(tile).max(100),categoryTiles:z.array(tile).max(100),updatedAt:short.optional(),
}).strict();
export const orderUpdateInput = z.object({id,fulfillmentStatus:z.enum(["new","processing","shipped","delivered","canceled","returned","cancelled"]).optional(),trackingNumber:short.optional(),carrier:short.optional(),estimatedDeliveryDate:short.optional(),notes:text.optional(),paymentStatus:z.enum(["paid","pending","refunded"]).optional()}).strict().refine(value=>Object.keys(value).length>1);
export const emptyInput = z.object({}).strict();
export const deleteInput = z.object({id}).strict();

// Response projection is deliberately independent of mutation validation. Old
// source values stay intact for migration while unrecognized fields never leave
// this boundary, including nested credential/provider metadata.
const dtoKeys = {
  products:[...Object.keys(productInput.shape),"createdAt"], banners:[...Object.keys(bannerInput.shape),"createdAt"],
  blogs:[...Object.keys(blogInput.shape),"createdAt"], discounts:[...Object.keys(discountInput.shape),"usageCount","createdAt"],
  clients:["id","name","email","phone","country","status","totalSpent","ordersCount","avatar","notes","createdAt"],
  orders:["id","orderNumber","clientName","clientEmail","total","itemsCount","items","paymentStatus","fulfillmentStatus","shippingAddress","clientPhone","comments","notes","trackingNumber","carrier","estimatedDeliveryDate","milestones","coordinates","createdAt"],
  settings:Object.keys(settingsInput.shape),
};
type OutputShape = { readonly [key: string]: OutputType };
type OutputType = "string" | "number" | "boolean" | readonly [OutputType] | OutputShape;
const strings = (keys: readonly string[]): OutputShape => Object.fromEntries(keys.map(key => [key, "string"]));
const productOutput: OutputShape = { ...strings(dtoKeys.products), price: "number", originalPrice: "number", stock: "number", isFeatured: "boolean", noIndex: "boolean", activities: ["string"], inTheBox: ["string"], compatibleAccessories: ["string"], focusKeywords: ["string"], specs: [{label:"string",value:"string"}], features: [{title:"string",body:"string",image:"string"}] };
const outputs: Record<keyof typeof dtoKeys, OutputShape> = {
  products: productOutput,
  banners: { ...strings(dtoKeys.banners), active:"boolean",order:"number" },
  blogs: { ...strings(dtoKeys.blogs), noIndex:"boolean",focusKeywords:["string"] },
  discounts: { ...strings(dtoKeys.discounts), value:"number",minSpend:"number",usageLimit:"number",perCustomerLimit:"number",usageCount:"number",isStackable:"boolean",targetCategories:["string"],targetSkus:["string"] },
  clients: { ...strings(dtoKeys.clients), totalSpent:"number",ordersCount:"number" },
  orders: { ...strings(dtoKeys.orders), total:"number",itemsCount:"number",items:[{productId:"string",name:"string",price:"number",quantity:"number",image:"string"}],milestones:[{stage:"string",label:"string",date:"string",description:"string",completed:"boolean",current:"boolean",location:"string"}],coordinates:{lat:"number",lng:"number"} },
  settings: { ...strings(dtoKeys.settings), freeShippingThreshold:"number",taxRate:"number",maintenanceMode:"boolean",garminPaySandbox:"boolean",stripeEnabled:"boolean" },
};
function typedOutput(value: unknown, shape: OutputType): unknown {
  if (typeof shape === "string") return typeof value === shape && (shape !== "number" || Number.isFinite(value)) ? value : undefined;
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) return undefined;
    return value.map(item => typedOutput(item, shape[0])).filter(item => item !== undefined);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record=value as Record<string,unknown>, output:Record<string,unknown>={};
  for (const [key, type] of Object.entries(shape)) {
    if (!Object.hasOwn(record,key)) continue;
    const safe=typedOutput(record[key],type);
    if (safe!==undefined) output[key]=safe;
  }
  return output;
}
export function adminDTO(resource: keyof typeof dtoKeys, value: unknown): Record<string,unknown> {
  return typedOutput(value,outputs[resource]) as Record<string,unknown> ?? {};
}
