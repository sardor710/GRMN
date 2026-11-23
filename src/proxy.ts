import { NextResponse, type NextRequest } from "next/server";
import { cmsBackend } from "./server/cms/source";
import { getCatalogService } from "./server/catalog/runtime";
import { isInvalidPublicInput } from "./server/public-input";
import {
  LOCALE_REDIRECT_HEADERS,
  cmsRedirectLookupPaths,
  decideLocaleRedirect,
  internalLocalePath,
  legacySegmentRedirect,
  localizeCmsRedirectTarget,
  stripLocale,
} from "./i18n/routing";
import { LOCALE_COOKIE } from "./i18n/config";
import { maintenanceGate } from "./server/operations/maintenance-runtime";

// The locale and CMS-redirect logic never runs for these (beta2's original matcher exclusions);
// the proxy itself also runs for /api and /admin so the maintenance freeze can gate them.
const NOT_LOCALIZED = /^\/(?:admin|api|uploads|media|fonts|_next|seo|homepage|images|videos|feeds)(?:\/|$)|^\/robots[.]txt$|^\/sitemap[.]xml$|[.][^/]+$/;

/** next-intl reads the request locale from this header when `setRequestLocale` was not called. */
const INTL_LOCALE_HEADER = "X-NEXT-INTL-LOCALE";

/**
 * Backend (non-legacy) CMS redirect rules. A matching rule wins over the locale redirect. Malformed
 * percent-encoding and invalid sources are treated as "no rule"; a real database failure is a 503.
 */
async function cmsRedirect(request: NextRequest): Promise<NextResponse | null> {
  let path: string;
  try {
    path = decodeURI(request.nextUrl.pathname);
  } catch {
    return null;
  }
  const candidates = cmsRedirectLookupPaths(path);
  if (!candidates.length) return null;
  try {
    const catalog = getCatalogService();
    for (const candidate of candidates) {
      const rule = await catalog.getRedirect(candidate);
      if (!rule) continue;
      const target = localizeCmsRedirectTarget(rule.targetPath, path);
      return NextResponse.redirect(new URL(target, request.url), {
        status: rule.statusCode,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return null;
  } catch (error) {
    if (isInvalidPublicInput(error)) return null;
    return new NextResponse("Content temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function proxy(request: NextRequest) {
  // Task 23 G1: the maintenance freeze gates pages and every /api route, in both modes.
  const frozen = await maintenanceGate(request.nextUrl.pathname, request.method, request.headers);
  if (frozen) return frozen;
  if (NOT_LOCALIZED.test(request.nextUrl.pathname)) return NextResponse.next();
  if (cmsBackend() !== "legacy") {
    const redirect = await cmsRedirect(request);
    if (redirect) return redirect;
  }

  const { pathname, search } = request.nextUrl;
  // Owner 2026-11-19: Kazakh lives at /kz; old /kk links move there permanently.
  const legacy = legacySegmentRedirect(pathname, search);
  if (legacy) return NextResponse.redirect(new URL(legacy, request.url), 301);
  const target = decideLocaleRedirect(
    pathname,
    search,
    request.cookies.get(LOCALE_COOKIE)?.value,
    request.headers.get("accept-language") ?? undefined,
  );
  if (target) {
    const response = NextResponse.redirect(new URL(target, request.url), 307);
    for (const [name, value] of Object.entries(LOCALE_REDIRECT_HEADERS)) response.headers.set(name, value);
    return response;
  }

  const headers = new Headers(request.headers);
  const { locale } = stripLocale(pathname);
  if (locale) headers.set(INTL_LOCALE_HEADER, locale);
  else headers.delete(INTL_LOCALE_HEADER);
  // The app route segment is the locale code (/kk/…); the public URL is /kz/….
  const internal = internalLocalePath(pathname);
  if (internal) return NextResponse.rewrite(new URL(internal + search, request.url), { request: { headers } });
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Static assets stay outside the proxy (they are not writes). Pages, /api and /admin run it: the
  // maintenance gate first, then (for localized paths only, see NOT_LOCALIZED) CMS and locale redirects.
  matcher: [
    "/((?!_next/static|_next/image|images|videos|fonts|homepage|seo|favicon.ico|robots.txt).*)",
  ],
};
