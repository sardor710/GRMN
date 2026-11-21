import "server-only";
import { z } from "zod";
import { getAuthRuntime } from "../auth/runtime.ts";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { adminJSON, readAdminJSON } from "../auth/admin-service.ts";
import { requirePermission, requireStaffPrincipal } from "../auth/principal.ts";
import { requestURL } from "../auth/request-url.ts";
import { BANNER_SPEC, BLOG_SPEC, HOMEPAGE_SPEC, PRODUCT_SPEC } from "../../i18n/translate-record.ts";
import { createHash } from "node:crypto";
import { getDatabase } from "../db/client.ts";
import { MAX_PRODUCT_BODY_BYTES } from "../cms/http.ts";
import { translateRecord, translationModelFromEnv, withTranslationMemory, type MachineLocale, type TranslationModel } from "./machine-translate.ts";

/** The OpenRouter model behind the database translation memory (migration 0020). */
function memoryModel(model: TranslationModel): TranslationModel {
  const pool = getDatabase().pool, name = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-super-vl:free";
  return withTranslationMemory(model, {
    hash: text => createHash("sha256").update(text, "utf8").digest("hex"),
    async read(locale: MachineLocale, hashes: string[]) {
      const rows = (await pool.query<{ source_sha256: string; translated: string }>("SELECT source_sha256,translated FROM translation_memory WHERE locale=$1 AND source_sha256=ANY($2::text[])", [locale, hashes])).rows;
      return new Map(rows.map(r => [r.source_sha256, r.translated]));
    },
    async write(locale: MachineLocale, rows: { hash: string; text: string }[]) {
      for (const row of rows) await pool.query("INSERT INTO translation_memory(source_sha256,locale,translated,model) VALUES($1,$2,$3,$4) ON CONFLICT (source_sha256,locale) DO NOTHING", [row.hash, locale, row.text, name]);
    },
  });
}

// POST /api/admin/translate { kind, record, locales? } → { translations, filled, model } (owner
// 2026-11-19). The record is the editor's current form; nothing is saved here. Each call works for
// about 15 s plus one call of at most 40 s (under the proxies' 60 s limit) and reports `remaining`; the admin button repeats it. Staff with the
// kind's write permission only.
const kinds = {
  product: { spec: PRODUCT_SPEC, html: ["overviewHtml"], permission: "catalog:write" },
  blog: { spec: BLOG_SPEC, html: ["content"], permission: "content:write" },
  banner: { spec: BANNER_SPEC, html: [], permission: "content:write" },
  homepage: { spec: HOMEPAGE_SPEC, html: [], permission: "content:write" },
} as const;
const body = z.object({ kind: z.enum(["product", "blog", "banner", "homepage"]), record: z.record(z.string(), z.unknown()), locales: z.array(z.enum(["ru", "kk"])).min(1).max(2).optional() }).strict();

export async function handleTranslateRequest(request: Request, model: TranslationModel | null = translationModelFromEnv()): Promise<Response> {
  try {
    const runtime = getAuthRuntime(), baseURL = new URL(process.env.AUTH_BASE_URL!).origin;
    if (request.method !== "POST") throw new AuthFailure("METHOD_NOT_ALLOWED", 405, "Method not allowed");
    if (requestURL(request, baseURL).origin !== baseURL || request.headers.get("origin") !== baseURL) throw new AuthFailure("FORBIDDEN", 403, "Invalid request origin");
    // The editor sends the whole record (with its translations so far): same limit as product saves.
    const raw = await readAdminJSON(request, false, MAX_PRODUCT_BODY_BYTES);
    const parsed = body.safeParse(raw);
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400, "Send { kind, record }");
    const kind = kinds[parsed.data.kind];
    await requireStaffPrincipal(runtime, request.headers);
    await requirePermission(runtime, request.headers, kind.permission);
    if (!model) throw new AuthFailure("DEPENDENCY_UNAVAILABLE", 503, "Automatic translation is not configured (OPENROUTER_API_KEY)");
    const { translations: existing, ...record } = parsed.data.record;
    const result = await translateRecord({ record, spec: kind.spec, htmlFields: kind.html, existing: existing as Record<string, unknown> | undefined, locales: parsed.data.locales ?? ["ru", "kk"], model: memoryModel(model), budgetMs: 15_000 });
    return adminJSON({ success: true, ...result, model: process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-super-vl:free" });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return adminJSON({ error: { code: "DEPENDENCY_UNAVAILABLE", message: "The translation service took too long. Press the button again: finished fields are kept." } }, 503);
    if (error instanceof Error && /^Translation service daily limit/.test(error.message)) return adminJSON({ error: { code: "RATE_LIMITED", message: `${error.message}.` } }, 429);
    if (error instanceof Error && /^Translation service/.test(error.message)) return adminJSON({ error: { code: "DEPENDENCY_UNAVAILABLE", message: `${error.message}. Try again in a minute.` } }, 503);
    return authErrorResponse(error);
  }
}
