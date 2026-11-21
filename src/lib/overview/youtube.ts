// YouTube helpers shared by the overview sanitizer, the admin editor (CKEditor Media Embed) and the
// storefront click-to-play player. Pure and dependency-free so the storefront bundle stays small.

/** A YouTube video ID: 11 URL-safe base64 characters. */
const ID = /^[A-Za-z0-9_-]{11}$/;

const WATCH_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
const EMBED_HOSTS = new Set([...WATCH_HOSTS, "youtube-nocookie.com", "www.youtube-nocookie.com"]);
const SHORT_HOSTS = new Set(["youtu.be", "www.youtu.be"]);

export function isYoutubeId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

/**
 * The video ID of any YouTube link the owner might paste: watch?v=, youtu.be/, /shorts/, /embed/, /live/,
 * /v/ and youtube-nocookie.com/embed/. Protocol-relative and scheme-less links are accepted; anything that
 * is not https/http on a YouTube host returns null.
 */
export function youtubeIdFromUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let text = raw.trim();
  if (!text || text.length > 2048) return null;
  if (text.startsWith("//")) text = `https:${text}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  let id: string | null | undefined;
  if (SHORT_HOSTS.has(host)) id = parts[0];
  else if (EMBED_HOSTS.has(host) && ["embed", "shorts", "live", "v"].includes(parts[0] ?? "")) id = parts[1];
  else if (WATCH_HOSTS.has(host) && parts[0] === "watch") id = url.searchParams.get("v");
  return isYoutubeId(id) ? id : null;
}

/** Canonical link stored in `<oembed url>` (one form, whatever the owner pasted). */
export function watchUrl(id: string): string {
  if (!isYoutubeId(id)) throw new Error("Invalid YouTube video ID");
  return `https://www.youtube.com/watch?v=${id}`;
}

/** Privacy-enhanced player URL (youtube-nocookie.com). */
export function embedUrl(id: string, { autoplay = false }: { autoplay?: boolean } = {}): string {
  if (!isYoutubeId(id)) throw new Error("Invalid YouTube video ID");
  return `https://www.youtube-nocookie.com/embed/${id}${autoplay ? "?autoplay=1" : ""}`;
}

/** Poster frame YouTube serves for every public video (480x360, letterboxed to 16:9 by CSS). */
export function thumbnailUrl(id: string): string {
  if (!isYoutubeId(id)) throw new Error("Invalid YouTube video ID");
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}
