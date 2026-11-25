"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, Failure, Loading, Muted, RangePicker, count, getJSON, useRange } from "../_components/shared";

// Owner 2026-11-25: Admin ▸ Campaign links. Build a tagged store link for a post, story, reels, bio or ad,
// copy it, and see its clicks. Each platform's total in Admin ▸ Traffic is the sum of its campaigns.

interface LinkRow { id: string; platform: string; medium: string; campaign: string; targetPath: string; label: string | null; url: string; clicks: number; createdAt: string }
const PLATFORMS = ["Instagram", "Facebook", "Telegram", "Google", "Yandex", "TikTok", "WhatsApp"];
const FORMATS = [["story", "Story"], ["post", "Post"], ["reels", "Reels"], ["bio", "Bio link"], ["ad", "Ad (paid)"], ["message", "Message"], ["other", "Other"]] as const;
const field = "h-10 w-full border border-garmin-control bg-white px-3 text-sm text-black focus:border-black focus:outline-none";

/** A pasted store URL becomes its path; a path stays as it is. */
function toPath(value: string): string {
  const text = value.trim();
  if (!/^https?:\/\//i.test(text)) return text.startsWith("/") ? text : `/${text}`;
  try { const url = new URL(text); return url.host === window.location.host ? url.pathname + url.search : text; } catch { return text; }
}
async function post<T>(body: unknown): Promise<T> {
  const response = await fetch("/api/admin/traffic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(response.status === 400 ? "Check the fields: the page must be a store address (like /p/… or /c/…), and the campaign needs letters or numbers." : data?.error?.message ?? `Request failed (${response.status})`);
  return data as T;
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => { void navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }} className="g-btn g-btn--sm g-btn--black shrink-0">
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export function LinkBuilder() {
  const range = useRange();
  const [platform, setPlatform] = useState("Instagram");
  const [other, setOther] = useState("");
  const [medium, setMedium] = useState("story");
  const [campaign, setCampaign] = useState("");
  const [target, setTarget] = useState("/");
  const [created, setCreated] = useState<LinkRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<{ state: "loading" } | { state: "error"; message: string } | { state: "ready"; rows: LinkRow[] }>({ state: "loading" });

  const reload = useCallback(() => getJSON<{ links: LinkRow[] }>(`view=links&from=${range.from}&to=${range.to}`)
    .then(data => setLinks({ state: "ready", rows: data.links }), (e: Error) => setLinks({ state: "error", message: e.message })), [range.from, range.to]);
  useEffect(() => { void reload(); }, [reload]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const row = await post<LinkRow>({ action: "create_link", platform: platform === "other" ? other : platform, medium, campaign, targetPath: toPath(target) });
      setCreated(row); setCampaign(""); await reload();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function archive(row: LinkRow) {
    if (!window.confirm(`Remove the link for "${row.campaign}"? Its clicks stay in Traffic.`)) return;
    try { await post({ action: "archive_link", id: row.id }); if (created?.id === row.id) setCreated(null); await reload(); } catch (e) { setError((e as Error).message); }
  }

  const byPlatform = links.state === "ready" ? Object.entries(links.rows.reduce<Record<string, number>>((sum, row) => ({ ...sum, [row.platform]: (sum[row.platform] ?? 0) + row.clicks }), {})).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="g-heading g-h2 text-black">Campaign links</h1>
          <p className="text-sm text-muted-foreground">Make a link for each post, story or ad. Clicks on it are counted under its platform, format and campaign.</p>
        </div>
        <Link href="/admin/traffic" className="g-btn g-btn--sm g-btn--secondary">Traffic</Link>
      </div>

      <Card title="New link">
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-bold">Platform
            <select value={platform} onChange={e => setPlatform(e.target.value)} className={cn(field, "mt-1 font-normal")}>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}<option value="other">Other…</option>
            </select>
            {platform === "other" && <input required aria-label="Platform name" value={other} maxLength={40} onChange={e => setOther(e.target.value)} placeholder="e.g. Newsletter" className={cn(field, "mt-2 font-normal")} />}
          </label>
          <label className="text-sm font-bold">Format
            <select value={medium} onChange={e => setMedium(e.target.value)} className={cn(field, "mt-1 font-normal")}>
              {FORMATS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold">Campaign name
            <input required value={campaign} maxLength={60} onChange={e => setCampaign(e.target.value)} placeholder="e.g. fenix9-december" className={cn(field, "mt-1 font-normal")} />
          </label>
          <label className="text-sm font-bold">Store page
            <input required value={target} maxLength={512} onChange={e => setTarget(e.target.value)} placeholder="/p/… or paste a store address" className={cn(field, "mt-1 font-normal")} />
          </label>
          <div className="flex items-center gap-3 md:col-span-2 lg:col-span-4">
            <button type="submit" disabled={busy} className="g-btn g-btn--black">{busy ? "Creating…" : "Create link"}</button>
            {error && <Failure message={error} />}
          </div>
        </form>
        {created && (
          <div data-created-link className="mt-4 flex flex-wrap items-center gap-3 border border-garmin-control bg-[#fafafa] p-3">
            <code className="min-w-0 flex-1 break-all text-sm">{created.url}</code>
            <CopyButton text={created.url} />
          </div>
        )}
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-bold">For Meta ads (Instagram and Facebook)</summary>
          <p className="mt-2 text-muted-foreground">In Ads Manager, open the ad, find <b>URL parameters</b> and paste one of these. Every ad then shows up as its own campaign under Ads.</p>
          {["utm_source=instagram&utm_medium=ad&utm_campaign={{campaign.name}}", "utm_source=facebook&utm_medium=ad&utm_campaign={{campaign.name}}"].map(line => (
            <div key={line} className="mt-2 flex items-center gap-3"><code className="min-w-0 flex-1 break-all bg-[#f4f4f4] p-2">{line}</code><CopyButton text={line} /></div>
          ))}
        </details>
      </Card>

      <RangePicker {...range} />
      <Card title="Saved links">
        {links.state === "loading" ? <Loading /> : links.state === "error" ? <Failure message={links.message} /> : links.rows.length === 0 ? <Muted>No links yet. Create one above.</Muted> : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">Clicks in this range: {byPlatform.map(([name, clicks]) => <span key={name} data-platform-total={name} className="mr-3"><b className="text-black">{name}</b> {count(clicks)}</span>)}</p>
            <table className="w-full min-w-[640px] text-sm tabular-nums">
              <thead><tr className="border-b border-garmin-rule text-left"><th className="py-2 font-medium">Platform</th><th className="py-2 font-medium">Format</th><th className="py-2 font-medium">Campaign</th><th className="py-2 font-medium">Page</th><th className="py-2 text-right font-medium">Clicks</th><th className="py-2"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {links.rows.map(row => (
                  <tr key={row.id} data-link={row.campaign} className="border-b border-garmin-rule last:border-0">
                    <td className="py-2">{row.platform}</td><td className="py-2">{row.medium}</td><td className="py-2 font-bold">{row.campaign}</td>
                    <td className="max-w-[16rem] truncate py-2" title={row.targetPath}>{row.targetPath}</td>
                    <td className="py-2 text-right font-bold">{count(row.clicks)}</td>
                    <td className="py-2 text-right"><span className="inline-flex items-center gap-2"><CopyButton text={row.url} />
                      <button type="button" aria-label={`Remove link ${row.campaign}`} onClick={() => void archive(row)} className="p-1.5 hover:bg-[#f4f4f4]"><Trash2 aria-hidden className="h-4 w-4" /></button></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>
    </div>
  );
}
