import { NextResponse } from "next/server";
import { requireCatalogWriter } from "@/lib/cms/admin-guard";
import { saveSettings } from "@/lib/cms/store";
import { downloadRemoteImage, type DownloadResult } from "@/lib/media/storage";
import { parseGarminProduct, validateGarminUrl, type GarminDraft } from "@/lib/import/garmin-parse";

export const runtime = "nodejs";
export const maxDuration = 120;

const PAGE_TIMEOUT_MS = 15_000;
const MAX_PAGE_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_IMAGES_PER_VARIANT = 8;
const MAX_IMAGES_PER_IMPORT = 300;
const DOWNLOAD_CONCURRENCY = 6;
const MAX_IMPORT_BYTES = 500 * 1024 * 1024;
const IMPORT_DEADLINE_MS = 120_000;
const MAX_BOX_IMAGES = 40;

/** In-the-box item as parsed: a label, or a label with a res.garmin.com photo. */
type BoxItem = string | { label: string; image?: string };

/** One import at a time per server process (imports download hundreds of photos). */
let importInFlight = false;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

class ImportError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Fetch a Garmin page, following redirects manually so every hop is re-validated. */
async function fetchGarminPage(start: URL): Promise<{ html: string; finalUrl: URL }> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      const next = validateGarminUrl(new URL(res.headers.get("location") || "", url).href);
      if (!next.ok) throw new ImportError(`Garmin redirected to a link we don't import: ${next.error}`);
      url = next.url;
      continue;
    }
    if (!res.ok || !res.body) throw new ImportError(`garmin.com answered HTTP ${res.status}`, 502);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > MAX_PAGE_BYTES) throw new ImportError("The Garmin page is unexpectedly large.", 502);
      chunks.push(chunk);
    }
    return { html: Buffer.concat(chunks).toString("utf8"), finalUrl: url };
  }
  throw new ImportError("Too many redirects from garmin.com.", 502);
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

/** Download variant galleries (capped), overview and in-the-box photos; rewrite srcs to /uploads. Returns warnings. */
async function localizeImages(draft: GarminDraft, remoteImages: { id: string; url: string }[]): Promise<string[]> {
  const warnings: string[] = [];
  const deadline = Date.now() + IMPORT_DEADLINE_MS;
  let bytes = 0;
  let budgetHit = false;
  const withinBudget = () => {
    if (bytes > MAX_IMPORT_BYTES || Date.now() > deadline) budgetHit = true;
    return !budgetHit;
  };
  const folder = `products/garmin/${(draft.source?.partNumber || "import").replace(/[^A-Za-z0-9-]/g, "")}`;
  const cache = new Map<string, DownloadResult>();
  const urlById = new Map(remoteImages.map((r) => [r.id, r.url]));

  const keep = new Set<string>();
  const variants = draft.variants || [];
  const ordered = [...variants.filter((v) => v.isDefault), ...variants.filter((v) => !v.isDefault)];
  for (const v of ordered) {
    for (const id of v.imageIds.slice(0, MAX_IMAGES_PER_VARIANT)) {
      if (keep.size >= MAX_IMAGES_PER_IMPORT) break;
      keep.add(id);
    }
  }
  const overviewUrls = [...new Set([...(draft.overviewHtml || "").matchAll(/src="(https:\/\/res\.garmin\.com\/[^"]+)"/g)].map((m) => m[1]))]
    .filter((u) => !/\.svg(\?|$)/i.test(u))
    .slice(0, Math.max(0, MAX_IMAGES_PER_IMPORT - keep.size));

  const localById = new Map<string, string>();
  await mapLimit([...keep], DOWNLOAD_CONCURRENCY, async (id) => {
    if (!withinBudget()) return;
    const result = await downloadRemoteImage(urlById.get(id) || "", { folder, cache });
    if ("src" in result) {
      localById.set(id, result.src);
      bytes += result.bytes;
    } else warnings.push(result.error.slice(0, 200));
  });
  await mapLimit(overviewUrls, DOWNLOAD_CONCURRENCY, async (url) => {
    if (!withinBudget()) return;
    const result = await downloadRemoteImage(url, { folder: `${folder}/overview`, cache });
    if ("src" in result) bytes += result.bytes;
    else warnings.push(result.error.slice(0, 200));
  });
  // In-the-box photos (res.garmin.com only, same size caps and budget). A photo that fails to download is
  // dropped and the item keeps its label; items are never added or defaulted here.
  const box = (draft.inTheBox ?? []) as unknown as BoxItem[];
  const boxUrls = [...new Set(box.flatMap((item) => (typeof item === "object" && item.image ? [item.image] : [])))].slice(0, MAX_BOX_IMAGES);
  await mapLimit(boxUrls, DOWNLOAD_CONCURRENCY, async (url) => {
    if (!withinBudget()) return;
    const result = await downloadRemoteImage(url, { folder: `${folder}/in-the-box`, cache });
    if ("src" in result) bytes += result.bytes;
    else warnings.push(result.error.slice(0, 200));
  });
  let boxDropped = 0;
  draft.inTheBox = box.map((item) => {
    if (typeof item === "string" || !item.image) return item;
    const hit = cache.get(item.image);
    if (hit && "src" in hit) return { label: item.label, image: hit.src };
    boxDropped += 1;
    return item.label;
  }) as unknown as GarminDraft["inTheBox"];
  if (boxDropped) warnings.push(`${boxDropped} in-the-box photo(s) could not be downloaded; those items keep their label only.`);
  if (budgetHit) warnings.push("Stopped downloading photos early (time or size limit reached); some photos were skipped.");

  draft.images = (draft.images || [])
    .filter((img) => localById.has(img.id))
    .map((img) => ({ ...img, src: localById.get(img.id) as string }));
  draft.variants = variants.map((v) => ({ ...v, imageIds: v.imageIds.filter((id) => localById.has(id)) }));
  const def = draft.variants.find((v) => v.isDefault);
  draft.defaultImageId = def?.imageIds[0] || draft.images[0]?.id;
  draft.image = draft.images.find((i) => i.id === draft.defaultImageId)?.src || draft.image;
  draft.overviewHtml = (draft.overviewHtml || "").replace(/src="(https:\/\/res\.garmin\.com\/[^"]+)"/g, (m, url: string) => {
    const hit = cache.get(url);
    return hit && "src" in hit ? `src="${hit.src}"` : m;
  });

  const dropped = remoteImages.length - keep.size;
  if (dropped > 0) warnings.push(`${dropped} extra gallery photos were skipped (up to ${MAX_IMAGES_PER_VARIANT} per variant).`);
  return warnings;
}

/** POST { url, rateKztPerUsd, downloadImages? } → { draft, warnings }. Never saves the product. */
export async function POST(request: Request) {
  const denied = await requireCatalogWriter(request);
  if (denied) return denied;

  let body: { url?: unknown; rateKztPerUsd?: unknown; downloadImages?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }
  const checked = validateGarminUrl(String(body.url || ""));
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const rate = Number(body.rateKztPerUsd);
  if (!(rate > 0) || rate > 100_000) {
    return NextResponse.json({ error: "Enter how many tenge equal 1 USD (a positive number)." }, { status: 400 });
  }

  if (importInFlight) {
    return NextResponse.json({ error: "Another import is running — try again when it finishes." }, { status: 429 });
  }
  importInFlight = true;
  try {
    const { html, finalUrl } = await fetchGarminPage(checked.url);
    const { product, remoteImages, warnings } = parseGarminProduct(html, { sourceUrl: finalUrl.href, rateKztPerUsd: rate });
    if (body.downloadImages !== false) warnings.push(...(await localizeImages(product, remoteImages)));
    // Remember the rate for the next import (legacy JSON store only; PostgreSQL uses the USD rate editor).
    if (process.env.CMS_BACKEND !== "postgres") saveSettings({ importRateKztPerUsd: rate });
    return NextResponse.json({ draft: product, warnings });
  } catch (err) {
    const status = err instanceof ImportError ? err.status : err instanceof Error && err.name === "GarminParseError" ? 422 : 502;
    const message =
      err instanceof Error && err.name === "TimeoutError" ? "garmin.com did not answer in time." : err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status });
  } finally {
    importInFlight = false;
  }
}
