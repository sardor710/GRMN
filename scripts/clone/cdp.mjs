// Minimal headless-Chrome driver over the DevTools protocol (Node 24+, no deps).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].filter(Boolean);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ headed = false } = {}) {
  const chrome = CHROME_PATHS.find((p) => existsSync(p));
  if (!chrome) throw new Error("Chrome not found; set CHROME_PATH");
  const profile = await mkdtemp(join(tmpdir(), "clone-cdp-"));
  const child = spawn(chrome, [
    ...(headed ? [] : ["--headless=new"]), "--disable-gpu", "--no-first-run",
    "--no-default-browser-check", "--hide-scrollbars", "--mute-audio",
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank",
  ], { windowsHide: true, stdio: "ignore" });

  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); }
    catch { await sleep(100); }
  }
  if (!port) throw new Error("Chrome DevTools endpoint did not start");
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });

  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && pending.has(m.id)) {
      const { ok, bad } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? bad(new Error(`${m.error.message}`)) : ok(m.result);
    } else if (m.method) (listeners.get(m.method) || []).forEach((fn) => fn(m.params));
  };
  const send = (method, params = {}) => new Promise((ok, bad) => {
    const id = ++seq;
    pending.set(id, { ok, bad });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const on = (event, fn) => listeners.set(event, [...(listeners.get(event) || []), fn]);
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  await Promise.all(["Page.enable", "Runtime.enable", "DOM.enable", "CSS.enable", "Network.enable"].map((m) => send(m)));
  // Strip "HeadlessChrome" so bot filters treat us like a normal browser.
  const { userAgent } = await send("Browser.getVersion");
  await send("Network.setUserAgentOverride", { userAgent: userAgent.replace("HeadlessChrome", "Chrome") });

  const viewport = async (width, height = width >= 1024 ? 900 : width >= 700 ? 1024 : 844) => {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 });
    await send("Emulation.setTouchEmulationEnabled", { enabled: width < 700 });
  };

  const goto = async (url, settle = 1200) => {
    await send("Page.navigate", { url });
    for (let i = 0; i < 150; i++) {
      if ((await evaluate("document.readyState").catch(() => "")) === "complete") break;
      await sleep(100);
    }
    await evaluate("document.fonts?.ready.then(() => 1)").catch(() => {});
    await sleep(settle);
  };

  const close = async () => {
    try { ws.close(); } catch {}
    child.kill();
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  };

  return { send, on, evaluate, viewport, goto, close };
}
