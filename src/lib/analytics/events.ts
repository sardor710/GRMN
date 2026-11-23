import { minorToMajor } from "../money.ts";

// Task 5.2: GA4 ecommerce events from the storefront (view_item, add_to_cart, begin_checkout, purchase).
//
// Delivery: <Analytics/> calls initAnalytics() once per page load, before any page effect runs.
// - GTM set: the GTM bootstrap event is queued on window.dataLayer and window.gtag is NOT defined; track()
//   pushes the GTM ecommerce pair { ecommerce: null } then { event, ecommerce } and GA4 is configured in GTM.
// - Only GA4 set: initAnalytics() defines the standard gtag() queue (js + config with send_page_view) and
//   marks the page as gtag delivery; track() then calls gtag("event", name, params), which gtag.js reads as
//   an Arguments entry (gtag.js ignores plain dataLayer objects).
// - Nothing set (or before init): track() still pushes the GTM-style objects; nothing reads them.
// Every call is a no-op without a window (server render) and never throws into the page.

export interface GaItem {
  item_id: string;
  item_name: string;
  item_group_id: string;
  item_variant?: string;
  item_brand: "Garmin";
  item_category?: string;
  price: number;
  quantity: number;
}

export type GaEvent = "view_item" | "add_to_cart" | "begin_checkout" | "purchase";

export interface GaEventParams {
  currency: "KZT";
  value: number;
  items: GaItem[];
  transaction_id?: string;
  shipping?: number;
  tax?: number;
  coupon?: string;
}

type Gtag = (...args: unknown[]) => void;
interface AnalyticsWindow {
  dataLayer?: unknown[];
  gtag?: Gtag;
  /** "gtag" once initAnalytics() set up plain gtag.js on this page; "gtm" with Tag Manager. */
  grmnAnalytics?: "gtag" | "gtm";
  sessionStorage?: Pick<Storage, "getItem" | "setItem">;
}

const browser = (): AnalyticsWindow | null => typeof window === "undefined" ? null : window as unknown as AnalyticsWindow;
const layerOf = (win: AnalyticsWindow): unknown[] => (win.dataLayer ??= []);

/** One GA4 item for a product variant: item_id is the SKU, item_group_id the product code. */
export function toGaItem(input: { productCode: string; name: string; sku: string; variantName?: string; priceMajor: number; quantity?: number; category?: string }): GaItem {
  return {
    item_id: input.sku,
    item_name: input.name,
    item_group_id: input.productCode,
    ...(input.variantName ? { item_variant: input.variantName } : {}),
    item_brand: "Garmin",
    ...(input.category ? { item_category: input.category } : {}),
    price: input.priceMajor,
    quantity: input.quantity ?? 1,
  };
}

/** KZT major amount as a number from an exact minor-unit string ("18999000" -> 189990); 0 when malformed. */
export function gaPriceFromMinor(amountMinor: string): number {
  try { return Number(minorToMajor(amountMinor)); } catch { return 0; }
}

/**
 * Sets up event delivery for the configured tags. GTM wins over GA4 (GA4 then lives in the container).
 * Idempotent per page: a remounted layout does not queue a second config.
 */
export function initAnalytics(config: { ga4Id?: string; gtmId?: string }): void {
  const win = browser();
  if (!win || win.grmnAnalytics) return;
  try {
    const layer = layerOf(win);
    if (config.gtmId) {
      win.grmnAnalytics = "gtm";
      layer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    } else if (config.ga4Id) {
      win.grmnAnalytics = "gtag";
      // The standard snippet: gtag.js only reads Arguments objects from the queue.
      win.gtag = function gtag() { layer.push(arguments); }; // eslint-disable-line prefer-rest-params
      win.gtag("js", new Date());
      win.gtag("config", config.ga4Id, { send_page_view: true });
    }
  } catch { /* analytics never breaks the page */ }
}

/** Sends one GA4 ecommerce event (see the delivery note at the top of this file). */
export function track(event: GaEvent, params: GaEventParams): void {
  const win = browser();
  if (!win) return;
  try {
    if (win.grmnAnalytics === "gtag" && typeof win.gtag === "function") { win.gtag("event", event, params); return; }
    const layer = layerOf(win);
    layer.push({ ecommerce: null });
    layer.push({ event, ecommerce: params });
  } catch { /* analytics never breaks the page */ }
}

// Orders already sent on this page, for when sessionStorage is unavailable.
const sentThisPage = new Set<string>();

/** purchase, at most once per order number per browser session (sessionStorage key ga-purchase-<orderNumber>). */
export function trackPurchaseOnce(orderNumber: string, params: GaEventParams): void {
  const win = browser();
  if (!win) return;
  const key = `ga-purchase-${orderNumber}`;
  if (sentThisPage.has(key)) return;
  let storage: AnalyticsWindow["sessionStorage"] | undefined;
  try { storage = win.sessionStorage; if (storage?.getItem(key)) return; } catch { storage = undefined; }
  sentThisPage.add(key);
  try { storage?.setItem(key, "1"); } catch { /* the in-page guard still applies */ }
  track("purchase", { ...params, transaction_id: orderNumber });
}
