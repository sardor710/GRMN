// Overview video markup (plan M5.4). Stored form: CKEditor Media Embed blocks
//   <figure class="media"><oembed url="https://www.youtube.com/watch?v=ID"></oembed></figure>
// Legacy imports stored a poster link instead:
//   <div class="ov-video"><a href="https://www.youtube-nocookie.com/embed/ID"><img src="…"></a></div>
// Both are pure string transforms over SANITIZED overview HTML (sanitizeOverviewHtml normalizes quoting and
// entities), so they run identically on the server and in the browser and never see raw user input.
import { isAllowedOverviewImageSrc } from "./allowlist.ts";
import { thumbnailUrl, watchUrl, youtubeIdFromUrl } from "./youtube.ts";

const LEGACY_VIDEO = /<div class="ov-video">\s*<a\b([^>]*)>\s*(<img\b[^>]*>)?\s*<\/a>\s*<\/div>/g;
const MEDIA_BLOCK = /<figure class="media">\s*<oembed\b([^>]*?)\/?>\s*(?:<\/oembed>)?\s*<\/figure>/g;

const decode = (value: string) =>
  value.replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (attrs: string, name: string) => {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(` ${attrs}`);
  return match ? decode(match[1]) : null;
};

/** A CKEditor media block for a YouTube video (canonical watch URL). */
export function mediaBlock(id: string): string {
  return `<figure class="media"><oembed url="${escapeAttr(watchUrl(id))}"></oembed></figure>`;
}

/**
 * Legacy imported `div.ov-video` poster links → media blocks, so the editor shows a swappable video.
 * Non-YouTube links are left untouched. Idempotent.
 */
export function legacyVideoToMedia(html: string): string {
  return String(html || "").replace(LEGACY_VIDEO, (whole, linkAttrs: string) => {
    const id = youtubeIdFromUrl(attr(linkAttrs, "href"));
    return id ? mediaBlock(id) : whole;
  });
}

function poster(id: string, image: string | null, extraClass = ""): string {
  const src = image && isAllowedOverviewImageSrc(image) ? image : thumbnailUrl(id);
  return (
    `<div class="ov-yt${extraClass}" data-yt-id="${id}">` +
    `<a class="ov-yt-poster" href="${escapeAttr(watchUrl(id))}" aria-label="Play video">` +
    `<img src="${escapeAttr(src)}" alt="" loading="lazy">` +
    `<span class="ov-yt-play" aria-hidden="true"></span></a></div>`
  );
}

/**
 * Storefront rendering: every YouTube media block and legacy `ov-video` link becomes a click-to-play poster
 * (`div.ov-yt[data-yt-id]`). OverviewContent swaps it for an inline youtube-nocookie iframe on click; without
 * JavaScript the poster is a plain link to the video.
 */
export function renderOverviewVideos(html: string): string {
  return String(html || "")
    .replace(MEDIA_BLOCK, (whole, oembedAttrs: string) => {
      const id = youtubeIdFromUrl(attr(oembedAttrs, "url"));
      return id ? poster(id, null) : "";
    })
    .replace(LEGACY_VIDEO, (whole, linkAttrs: string, img: string | undefined) => {
      const id = youtubeIdFromUrl(attr(linkAttrs, "href"));
      if (!id) return whole;
      return poster(id, img ? attr(img, "src") : null, " ov-yt-banner");
    });
}
