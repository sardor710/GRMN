import { NextResponse, type NextRequest } from "next/server";
import { decideLocaleRedirect, stripLocale } from "@/i18n/routing";
import { LOCALE_COOKIE } from "@/i18n/config";

/** next-intl reads the request locale from this header when `setRequestLocale` was not called. */
const INTL_LOCALE_HEADER = "X-NEXT-INTL-LOCALE";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const target = decideLocaleRedirect(
    pathname,
    search,
    request.cookies.get(LOCALE_COOKIE)?.value,
    request.headers.get("accept-language") ?? undefined,
  );
  if (target) return NextResponse.redirect(new URL(target, request.url), 307);

  const headers = new Headers(request.headers);
  const { locale } = stripLocale(pathname);
  if (locale) headers.set(INTL_LOCALE_HEADER, locale);
  else headers.delete(INTL_LOCALE_HEADER);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Never run for the Global Constraints paths (admin, api, uploads, Next internals, SEO files,
  // static asset folders) or any path with a file extension. decideLocaleRedirect re-checks this.
  // Use [.] rather than \. : path-to-regexp drops the backslash inside a group.
  matcher: [
    "/((?!(?:admin|api|uploads|_next|seo|homepage|images|videos)(?:/|$)|robots[.]txt$|sitemap[.]xml$|.*[.][^/]+$).*)",
  ],
};
