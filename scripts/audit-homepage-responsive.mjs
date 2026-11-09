import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const url = process.argv[2] || "http://localhost:3000/";
const outputDir = process.argv[3] || join(process.cwd(), "docs", "design-references", "responsive-audit");
const widths = (process.env.AUDIT_WIDTHS || "320,375,390,428,540,768,820,1114")
  .split(",").map(Number).filter((width) => Number.isInteger(width) && width > 0);
const profile = await mkdtemp(join(tmpdir(), "garmin-home-audit-"));
await mkdir(outputDir, { recursive: true });
const child = spawn(chrome, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank",
], { windowsHide: true, stdio: "ignore" });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]);
      break;
    } catch { await sleep(100); }
  }
  if (!port) throw new Error("Chrome debugging endpoint did not start");
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = tabs.find((tab) => tab.type === "page");
  if (!page) throw new Error("Chrome page target was not found");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    pending.set(key, { resolve, reject });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  const report = [];
  for (const width of widths) {
    const height = width >= 1000 ? 720 : width >= 700 ? 900 : width >= 500 ? 720 : 844;
    await send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: width < 700,
      screenWidth: width, screenHeight: height,
    });
    await send("Emulation.setTouchEmulationEnabled", { enabled: width < 700 });
    await send("Page.navigate", { url });
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await evaluate("document.readyState") === "complete") break;
      await sleep(100);
    }
    await sleep(500);
    const metrics = await evaluate(`(() => {
      const rect = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y + scrollY), width: Math.round(r.width), height: Math.round(r.height) };
      };
      const controls = [...document.querySelectorAll('header a, header button')].filter(el => {
        const r = el.getBoundingClientRect();
        return getComputedStyle(el).display !== 'none' && r.width && r.height;
      }).map(el => ({ label: el.getAttribute('aria-label') || el.textContent.trim(), x: Math.round(el.getBoundingClientRect().x), right: Math.round(el.getBoundingClientRect().right) }));
      return {
        innerWidth, scrollWidth: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        sections: [...document.querySelectorAll('main > *')].map(el => {
          const r = el.getBoundingClientRect();
          return { tag: el.tagName, className: String(el.className).slice(0, 70), text: el.innerText?.trim().slice(0, 55), y: Math.round(r.y + scrollY), height: Math.round(r.height),
            children: [...el.children].slice(0, 12).map(child => { const cr = child.getBoundingClientRect(); return { tag: child.tagName, text: child.innerText?.trim().slice(0, 38), y: Math.round(cr.y + scrollY), height: Math.round(cr.height) }; }) };
        }),
        promoTiles: [...document.querySelectorAll('main > .container.white g-tile, main > section:nth-child(3) > a')].map(el => {
          const r = el.getBoundingClientRect(); return { text: el.innerText?.trim().slice(0, 60), y: Math.round(r.y + scrollY), height: Math.round(r.height) };
        }),
        header: rect('header'), hero: rect('main section:first-child'), featured: rect('main section:nth-child(2)'),
        promo: rect('main section:nth-child(3)'), stories: rect('main section:nth-child(4)'), categories: rect('main section:nth-child(5)'),
        signup: rect('main section:nth-child(6)'), footer: rect('footer'), controls,
      };
    })()`);
    const result = { requestedWidth: width, ...metrics };
    report.push(result);
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(join(outputDir, `home-${width}.png`), Buffer.from(data, "base64"));
    if (process.env.AUDIT_FULLPAGE === "1") {
      await evaluate("document.querySelectorAll('img').forEach(img => { img.loading = 'eager'; img.fetchPriority = 'high' })");
      await sleep(1000);
      const layout = await send("Page.getLayoutMetrics");
      const { data: fullData } = await send("Page.captureScreenshot", {
        format: "png", captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height: Math.min(layout.cssContentSize.height, 18000), scale: 1 },
      });
      await writeFile(join(outputDir, `home-${width}-full.png`), Buffer.from(fullData, "base64"));
      const footerClip = await evaluate(`(() => { const r = document.querySelector('footer').getBoundingClientRect(); return { x: 0, y: Math.round(r.y + scrollY), width: innerWidth, height: Math.round(r.height), scale: 1 }; })()`);
      const { data: footerData } = await send("Page.captureScreenshot", {
        format: "png", captureBeyondViewport: true, clip: footerClip,
      });
      await writeFile(join(outputDir, `footer-${width}.png`), Buffer.from(footerData, "base64"));
    }
    if (process.env.AUDIT_INTERACTIONS === "1") {
      await evaluate(`document.querySelector('button[aria-label="Pause slideshow"]')?.click()`);
      result.slides = [];
      for (let slide = 0; slide < 6; slide++) {
        if (slide) {
          await evaluate(`document.querySelector('button[aria-label="Next slide"]')?.click()`);
          await sleep(80);
        }
        result.slides.push(await evaluate(`(() => {
          const hero = document.querySelector('main section:first-child');
          const active = hero.querySelector('[aria-hidden="false"]');
          const caption = active.querySelector('div:last-child');
          const shop = caption.querySelector('a');
          return {
            title: caption.querySelector('h1').textContent,
            captionHeight: Math.round(caption.getBoundingClientRect().height),
            captionScrollHeight: caption.scrollHeight,
            shopBottom: Math.round(shop.getBoundingClientRect().bottom),
            heroBottom: Math.round(hero.getBoundingClientRect().bottom),
            shopVisible: shop.getBoundingClientRect().bottom <= hero.getBoundingClientRect().bottom,
          };
        })()`));
      }
      if (width < 700) {
        await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 220, y: 180 }] });
        await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [{ x: 50, y: 180 }] });
        await sleep(80);
        result.swipeTitle = await evaluate(`document.querySelector('main section:first-child [aria-hidden="false"] h1')?.textContent`);
      }
      if (width <= 900) {
        result.mobileControls = await evaluate(`(async () => {
          const menu = document.querySelector('button[aria-label="Menu"]');
          menu.click();
          await new Promise(requestAnimationFrame);
          const menuOpen = menu.getAttribute('aria-expanded') === 'true';
          menu.click();
          await new Promise(requestAnimationFrame);
          const search = document.querySelector('button[aria-label="Search"]');
          search.click();
          await new Promise(requestAnimationFrame);
          const searchOpen = search.getAttribute('aria-expanded') === 'true' && !!document.querySelector('#home-search');
          search.click();
          await new Promise(requestAnimationFrame);
          const details = document.querySelector('footer details');
          if (details) details.querySelector('summary').click();
          return { menuOpen, searchOpen, footerOpen: details?.open ?? null };
        })()`);
      }
    }
    console.log(`${width}: layout ${metrics.innerWidth}, scroll ${metrics.scrollWidth}, height ${metrics.height}`);
  }
  await writeFile(join(outputDir, "metrics.json"), JSON.stringify(report, null, 2));
  console.log(`Saved ${report.length} viewport screenshots and metrics to ${outputDir}`);
} finally {
  socket?.close();
  child.kill();
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
