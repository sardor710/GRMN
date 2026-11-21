import test from "node:test";
import assert from "node:assert/strict";
import { embedUrl, isYoutubeId, thumbnailUrl, watchUrl, youtubeIdFromUrl } from "../../src/lib/overview/youtube.ts";
import { legacyVideoToMedia, mediaBlock, renderOverviewVideos } from "../../src/lib/overview/video.ts";

const ID = "bdOC8EBYs_E";

test("youtubeIdFromUrl accepts every YouTube link form the owner might paste", () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s&list=PL123`,
    `https://m.youtube.com/watch?feature=share&v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `http://www.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc&t=10`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/shorts/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/embed/${ID}?autoplay=1`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `//www.youtube.com/embed/${ID}`,
    `youtu.be/${ID}`,
    `  https://youtu.be/${ID}  `,
  ]) {
    assert.equal(youtubeIdFromUrl(url), ID, url);
  }
});

test("youtubeIdFromUrl rejects other hosts, schemes and malformed IDs", () => {
  for (const url of [
    "",
    null,
    undefined,
    42,
    "not a url",
    `https://vimeo.com/${ID}`,
    `https://evil.example/watch?v=${ID}`,
    `https://youtube.com.evil.example/watch?v=${ID}`,
    `https://www.youtube.com.evil.example/embed/${ID}`,
    `javascript:alert("https://youtu.be/${ID}")`,
    `data:text/html,https://youtu.be/${ID}`,
    `ftp://youtu.be/${ID}`,
    `https://user:pass@youtu.be/${ID}`,
    "https://www.youtube.com/watch?v=short",
    `https://www.youtube.com/watch?v=${ID}x`,
    `https://www.youtube.com/watch?v=${ID.slice(0, 10)}"`,
    `https://www.youtube.com/channel/${ID}`,
    `https://www.youtube.com/playlist?list=${ID}`,
    `https://youtu.be/`,
  ]) {
    assert.equal(youtubeIdFromUrl(url), null, String(url));
  }
});

test("embedUrl uses youtube-nocookie.com; watch/thumbnail URLs are canonical; bad IDs throw", () => {
  assert.equal(embedUrl(ID), `https://www.youtube-nocookie.com/embed/${ID}`);
  assert.equal(embedUrl(ID, { autoplay: true }), `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1`);
  assert.equal(watchUrl(ID), `https://www.youtube.com/watch?v=${ID}`);
  assert.equal(thumbnailUrl(ID), `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  assert.equal(isYoutubeId(ID), true);
  assert.equal(isYoutubeId(`${ID}"`), false);
  assert.throws(() => embedUrl('x" onload="alert(1)'));
  assert.throws(() => watchUrl("../../x"));
});

test("legacyVideoToMedia converts imported ov-video poster links to media blocks (idempotent)", () => {
  const legacy =
    '<h2>Intro</h2><div class="ov-video"><a href="https://www.youtube-nocookie.com/embed/G9LZgkrKj7U" rel="noopener noreferrer" target="_blank">' +
    '<img src="/uploads/products/garmin/x/overview/poster.jpg" alt="Watch the video" loading="lazy" /></a></div><p>After</p>';
  const converted = legacyVideoToMedia(legacy);
  assert.equal(converted, `<h2>Intro</h2>${mediaBlock("G9LZgkrKj7U")}<p>After</p>`);
  assert.equal(mediaBlock("G9LZgkrKj7U"), '<figure class="media"><oembed url="https://www.youtube.com/watch?v=G9LZgkrKj7U"></oembed></figure>');
  assert.equal(legacyVideoToMedia(converted), converted);
  const vimeo = '<div class="ov-video"><a href="https://vimeo.com/1"><img src="/uploads/a.jpg"></a></div>';
  assert.equal(legacyVideoToMedia(vimeo), vimeo);
});

test("renderOverviewVideos turns media blocks and legacy links into click-to-play posters", () => {
  const html =
    `<p>A</p><figure class="media"><oembed url="https://www.youtube.com/watch?v=${ID}"></oembed></figure>` +
    '<div class="ov-video"><a href="https://www.youtube-nocookie.com/embed/G9LZgkrKj7U" rel="noopener noreferrer" target="_blank">' +
    '<img src="/uploads/poster.jpg" alt="Watch" loading="lazy" /></a></div>' +
    '<div class="ov-video"><a href="https://www.youtube-nocookie.com/embed/NJv-LqTfu7Y"><img src="https://evil.example/p.jpg"></a></div>';
  const out = renderOverviewVideos(html);
  assert.equal((out.match(/data-yt-id="/g) || []).length, 3);
  assert.match(out, new RegExp(`<div class="ov-yt" data-yt-id="${ID}"><a class="ov-yt-poster" href="https://www.youtube.com/watch\\?v=${ID}" aria-label="Play video"><img src="https://i.ytimg.com/vi/${ID}/hqdefault.jpg"`));
  // The imported poster is kept when it passes the image allowlist; a foreign poster falls back to YouTube's.
  assert.match(out, /data-yt-id="G9LZgkrKj7U"><a [^>]*><img src="\/uploads\/poster\.jpg"/);
  assert.match(out, /data-yt-id="NJv-LqTfu7Y"><a [^>]*><img src="https:\/\/i\.ytimg\.com\/vi\/NJv-LqTfu7Y\/hqdefault\.jpg"/);
  assert.doesNotMatch(out, /<oembed|<iframe|evil\.example|target="_blank"/);
  assert.equal(renderOverviewVideos("<p>No video</p>"), "<p>No video</p>");
});
