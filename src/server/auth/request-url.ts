import "server-only";

// Task 21B finding. Behind the TLS reverse proxy (Section 11), the Next.js standalone server builds
// request.url from its own bind address and port (for example https://0.0.0.0:3000/...), not from the
// public host, so a plain `new URL(request.url).origin !== baseURL` check refused every real request.
//
// The proxy sets Host (and Next adds x-forwarded-host / x-forwarded-proto from it). When the forwarded
// host and protocol name exactly the configured public origin, the request is mapped onto that origin;
// otherwise the raw URL is returned and the caller's origin check refuses it. Browsers cannot forge
// Host, and the separate Origin-header check on writes is unchanged.
export function requestURL(request: Request, baseURL: string): URL {
  const url = new URL(request.url);
  if (url.origin === baseURL) return url;
  const base = new URL(baseURL);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto");
  if (host === base.host && protocol !== null && protocol + ":" === base.protocol) return new URL(url.pathname + url.search, base.origin);
  return url;
}
