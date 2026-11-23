"use client";

import { useEffect } from "react";
import Script from "next/script";
import { initAnalytics } from "@/lib/analytics/events";

// Task 5.2: Google tags for the storefront only (rendered by src/app/[lang]/layout.tsx; the admin root layout
// never renders it). GTM when a container id is set (GA4 is configured inside the container, so gtag.js is not
// loaded too); otherwise gtag.js when a GA4 id is set; otherwise nothing.
//
// The queue (window.dataLayer, and gtag() with its js/config commands) is set up in an effect. This component is
// the first child of <body>, so its effect runs before any page effect: the first view_item always finds the
// delivery mode set. The tag script itself loads afterInteractive and reads the queued entries.

export function Analytics({ ga4Id, gtmId }: { ga4Id?: string; gtmId?: string }) {
  useEffect(() => { initAnalytics({ ga4Id, gtmId }); }, [ga4Id, gtmId]);

  if (gtmId) {
    const id = encodeURIComponent(gtmId);
    return (
      <>
        <Script id="gtm" strategy="afterInteractive" src={`https://www.googletagmanager.com/gtm.js?id=${id}`} />
        <noscript>
          <iframe src={`https://www.googletagmanager.com/ns.html?id=${id}`} title="Google Tag Manager" height="0" width="0" className="invisible hidden" />
        </noscript>
      </>
    );
  }
  if (ga4Id) return <Script id="gtag" strategy="afterInteractive" src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`} />;
  return null;
}
