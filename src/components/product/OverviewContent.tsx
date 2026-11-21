"use client";

import { useMemo, type MouseEvent } from "react";
import { renderOverviewVideos } from "@/lib/overview/video";
import { embedUrl, isYoutubeId } from "@/lib/overview/youtube";
import { cn } from "@/lib/utils";
import styles from "./CmsOverview.module.css";

/**
 * Sanitized overview HTML with click-to-play YouTube posters (plan M5.4). Media blocks and legacy imported
 * `ov-video` links are rendered as posters (`div.ov-yt[data-yt-id]`, see renderOverviewVideos); a click
 * swaps the poster for an inline youtube-nocookie player in the same place. The HTML string never changes
 * after mount, so React leaves the swapped player alone.
 *
 * `html` must already be sanitized (sanitizeOverviewHtml on write/read, or previewSafeHtml in the admin).
 */
export function OverviewContent({ html, className }: { html: string; className?: string }) {
  const rendered = useMemo(() => renderOverviewVideos(html), [html]);

  const play = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target : null;
    const host = target?.closest<HTMLElement>("[data-yt-id]");
    if (!host || !event.currentTarget.contains(host) || host.classList.contains("is-playing")) return;
    const id = host.dataset.ytId;
    if (!isYoutubeId(id)) return;
    event.preventDefault();
    const frame = document.createElement("iframe");
    frame.src = embedUrl(id, { autoplay: true });
    frame.title = "YouTube video player";
    frame.allow = "autoplay; encrypted-media; picture-in-picture";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    host.classList.add("is-playing");
    host.replaceChildren(frame);
    frame.focus();
  };

  return (
    // Clicks are delegated from the posters (real links, so keyboard Enter works) to this container.
    <div className={cn(styles.overview, className)} onClick={play} dangerouslySetInnerHTML={{ __html: rendered }} />
  );
}
