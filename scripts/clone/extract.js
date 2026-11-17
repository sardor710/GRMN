// In-page extractor. Defines window.__cx. Injected by inspect.mjs, or paste into a
// browser-MCP JS tool as a fallback, then call e.g. JSON.stringify(__cx.section('header')).
// Every function returns compact JSON-safe data: only values that differ from the
// tag's UA default (and, for inherited props, from the parent) are emitted.
(() => {
  if (window.__cx) return;
  const PROPS = [
    "display", "position", "top", "right", "bottom", "left", "z-index", "float", "box-sizing",
    "width", "height", "min-width", "max-width", "min-height", "max-height", "aspect-ratio",
    "margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding-top", "padding-right", "padding-bottom", "padding-left",
    "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis", "order",
    "justify-content", "justify-items", "align-items", "align-content", "align-self", "justify-self",
    "row-gap", "column-gap", "grid-template-columns", "grid-template-rows", "grid-template-areas",
    "grid-auto-flow", "grid-auto-columns", "grid-auto-rows", "grid-column", "grid-row",
    "font-family", "font-size", "font-weight", "font-style", "font-stretch", "line-height",
    "letter-spacing", "word-spacing", "text-align", "text-transform", "text-indent", "white-space",
    "font-feature-settings", "font-variation-settings", "font-variant-numeric", "font-kerning",
    "-webkit-font-smoothing", "text-rendering", "text-overflow", "-webkit-line-clamp", "overflow-wrap",
    "vertical-align", "list-style-type", "color", "text-decoration-line", "text-decoration-color",
    "text-decoration-thickness", "text-underline-offset", "text-shadow",
    "background-color", "background-image", "background-size", "background-position", "background-repeat",
    "background-clip", "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
    "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
    "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius",
    "outline-width", "outline-style", "outline-color", "outline-offset",
    "box-shadow", "opacity", "visibility", "overflow-x", "overflow-y", "transform", "transform-origin",
    "filter", "backdrop-filter", "mix-blend-mode", "isolation", "clip-path", "mask-image",
    "object-fit", "object-position", "cursor", "pointer-events", "user-select", "will-change",
    "transition-property", "transition-duration", "transition-timing-function", "transition-delay",
    "animation-name", "animation-duration", "animation-timing-function", "animation-delay",
    "animation-iteration-count", "animation-direction", "animation-fill-mode", "animation-timeline",
    "scroll-snap-type", "scroll-snap-align", "scroll-behavior", "content", "fill", "stroke", "stroke-width",
  ];
  const INHERITED = new Set(["font-family", "font-size", "font-weight", "font-style", "font-stretch",
    "line-height", "letter-spacing", "word-spacing", "text-align", "text-transform", "text-indent",
    "white-space", "font-feature-settings", "font-variation-settings", "font-variant-numeric",
    "font-kerning", "-webkit-font-smoothing", "text-rendering", "overflow-wrap", "color", "visibility",
    "cursor", "list-style-type", "text-shadow", "fill", "stroke", "stroke-width", "pointer-events", "user-select"]);
  const LAYOUT = new Set(["display", "position", "top", "right", "bottom", "left", "width", "height",
    "max-width", "min-height", "flex-direction", "flex-wrap", "grid-template-columns", "grid-template-rows",
    "row-gap", "column-gap", "justify-content", "align-items", "font-size", "line-height", "letter-spacing",
    "padding-top", "padding-right", "padding-bottom", "padding-left", "margin-top", "margin-right",
    "margin-bottom", "margin-left", "text-align", "order", "visibility", "aspect-ratio"]);

  // UA defaults per tag, from a style-free iframe.
  let frame;
  const defCache = {};
  const defaults = (tag) => {
    if (defCache[tag]) return defCache[tag];
    if (!frame) {
      frame = document.createElement("iframe");
      frame.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
      document.documentElement.appendChild(frame);
    }
    const d = frame.contentDocument;
    const el = d.createElement(tag);
    d.body.appendChild(el);
    const cs = d.defaultView.getComputedStyle(el);
    const o = {};
    PROPS.forEach((p) => (o[p] = cs.getPropertyValue(p)));
    el.remove();
    return (defCache[tag] = o);
  };

  const round = (v) => v.replace(/(\d+\.\d{3,})px/g, (_, n) => `${+(+n).toFixed(2)}px`);
  const collapse = (o) => {
    const four = (prefix, keys, out) => {
      const v = keys.map((k) => o[k]);
      if (v.some((x) => x === undefined)) return;
      keys.forEach((k) => delete o[k]);
      o[out] = v[0] === v[2] && v[1] === v[3] ? (v[0] === v[1] ? v[0] : `${v[0]} ${v[1]}`) : v.join(" ");
    };
    four("", ["padding-top", "padding-right", "padding-bottom", "padding-left"], "padding");
    four("", ["margin-top", "margin-right", "margin-bottom", "margin-left"], "margin");
    four("", ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"], "border-radius");
    ["width", "style", "color"].forEach((k) =>
      four("", ["top", "right", "bottom", "left"].map((s) => `border-${s}-${k}`), `border-${k}`));
    if (o["row-gap"] && o["row-gap"] === o["column-gap"]) { o.gap = o["row-gap"]; delete o["row-gap"]; delete o["column-gap"]; }
    if (o["overflow-x"] && o["overflow-x"] === o["overflow-y"]) { o.overflow = o["overflow-x"]; delete o["overflow-x"]; delete o["overflow-y"]; }
    return o;
  };

  const css = (el, pseudo, parentCS) => {
    const cs = getComputedStyle(el, pseudo);
    const def = defaults(pseudo ? "span" : el.tagName.toLowerCase());
    const o = {};
    for (const p of PROPS) {
      const v = cs.getPropertyValue(p);
      if (!v || v === def[p]) continue;
      if (INHERITED.has(p) && parentCS && parentCS.getPropertyValue(p) === v) continue;
      // Width/height of flow boxes are usually derived; keep only when explicitly fixed-looking.
      o[p] = round(v);
    }
    // Drop values the browser derives (currentColor echoes, inert borders/outlines, used sizes).
    const color = cs.color;
    for (const p of Object.keys(o)) if (/-color$/.test(p) && p !== "background-color" && o[p] === color) delete o[p];
    ["top", "right", "bottom", "left"].forEach((s) => { if (cs.getPropertyValue(`border-${s}-width`) === "0px") ["style", "color", "width"].forEach((k) => delete o[`border-${s}-${k}`]); });
    if (cs.outlineStyle === "none") ["outline-width", "outline-style", "outline-color", "outline-offset"].forEach((p) => delete o[p]);
    if (!o.transform || o.transform === "matrix(1, 0, 0, 1, 0, 0)") { delete o.transform; delete o["transform-origin"]; }
    ["min-width", "min-height"].forEach((p) => o[p] === "auto" && delete o[p]);
    // Used width/height are derived for flow boxes; `r` carries the box size instead.
    if (pseudo || !["IMG", "SVG", "VIDEO", "CANVAS", "IFRAME", "INPUT"].includes(el.tagName.toUpperCase())) { delete o.width; delete o.height; }
    for (const g of ["grid-template-columns", "grid-template-rows"]) if (o[g]) {
      const t = o[g].split(" ");
      if (g.endsWith("rows") && !o["grid-template-areas"] && t.length < 2) { delete o[g]; continue; }
      if (t.length > 1 && t.every((v) => /px$/.test(v) && Math.abs(parseFloat(v) - parseFloat(t[0])) < 1)) o[g] = `repeat(${t.length}, 1fr) /* ${t[0]} each */`;
    }
    const nt = parseFloat(cs.transitionDuration);
    if (!nt) ["transition-property", "transition-duration", "transition-timing-function", "transition-delay"].forEach((p) => delete o[p]);
    if (cs.animationName === "none") Object.keys(o).filter((p) => p.startsWith("animation")).forEach((p) => delete o[p]);
    return collapse(o);
  };

  const sel = (el) => {
    if (!(el instanceof Element)) return "";
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id) && document.querySelectorAll(`#${el.id}`).length === 1) return `#${el.id}`;
    const parts = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      if (n.id && /^[A-Za-z][\w-]*$/.test(n.id)) { parts.unshift(`#${n.id}`); break; }
      let s = n.tagName.toLowerCase();
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
      if (same.length > 1) s += `:nth-of-type(${same.indexOf(n) + 1})`;
      parts.unshift(s);
    }
    return parts.join(">");
  };
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)];
  };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").replace(/\s+/g, " ").trim();
  const ATTRS = ["href", "src", "alt", "aria-label", "role", "type", "placeholder", "title", "target", "aria-expanded", "aria-controls", "data-state"];
  const attrs = (el) => {
    const o = {};
    ATTRS.forEach((a) => { const v = el.getAttribute(a); if (v != null && v !== "") o[a] = v.slice(0, 200); });
    if (el.tagName === "IMG") Object.assign(o, img(el));
    return Object.keys(o).length ? o : undefined;
  };
  const img = (el) => ({
    src: el.currentSrc || el.src, srcset: el.getAttribute("srcset") || undefined, sizes: el.getAttribute("sizes") || undefined,
    natural: [el.naturalWidth, el.naturalHeight], loading: el.getAttribute("loading") || undefined,
    sources: el.parentElement?.tagName === "PICTURE"
      ? [...el.parentElement.querySelectorAll("source")].map((s) => ({ srcset: s.srcset, media: s.media || undefined, type: s.type || undefined }))
      : undefined,
  });
  const visible = (el, cs) => cs.display !== "none" && !(el.getBoundingClientRect().width === 0 && el.getBoundingClientRect().height === 0 && cs.overflow !== "visible");

  // Style tree for a section. Identical consecutive siblings collapse into `rep`.
  const node = (el, depth, parentCS, opt) => {
    const cs = getComputedStyle(el);
    const tag = el.tagName.toLowerCase();
    if (!visible(el, cs)) return opt.keepHidden ? { tag, sel: sel(el), hidden: true } : null;
    const n = { tag };
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(" ") : "";
    if (cls) n.cls = cls;
    n.r = rect(el);
    const t = ownText(el);
    if (t) n.t = t.slice(0, 300);
    const a = attrs(el);
    if (a) n.a = a;
    n.css = css(el, null, parentCS);
    for (const ps of ["::before", "::after"]) {
      const pc = getComputedStyle(el, ps);
      if (pc.content && pc.content !== "none" && pc.content !== "normal") n[ps === "::before" ? "before" : "after"] = css(el, ps, cs);
    }
    if (tag === "svg") { n.svg = svgKey(el); return n; }
    if (depth >= opt.depth) { if (el.children.length) n.more = el.children.length; return n; }
    const kids = [];
    let prevSig = null;
    for (const c of el.children) {
      const k = node(c, depth + 1, cs, opt);
      if (!k) continue;
      const sig = JSON.stringify([k.tag, k.cls, k.css, k.c?.length]);
      if (sig === prevSig) {
        const last = kids[kids.length - 1];
        (last.rep ||= []).push({ t: k.t || textOf(c), href: k.a?.href, src: k.a?.src || c.querySelector("img")?.currentSrc });
      } else kids.push(k);
      prevSig = sig;
    }
    if (kids.length) n.c = kids;
    return n;
  };
  const textOf = (el) => el.innerText?.replace(/\s+/g, " ").trim().slice(0, 160) || undefined;

  // SVGs: dedupe by markup; trees reference them by key.
  const svgStore = new Map();
  const svgKey = (svg) => {
    let markup = svg.outerHTML;
    const use = svg.querySelector("use");
    const ref = use && (use.getAttribute("href") || use.getAttribute("xlink:href"));
    if (ref?.startsWith("#")) {
      const sym = document.querySelector(ref);
      if (sym) markup = `<svg viewBox="${sym.getAttribute("viewBox") || svg.getAttribute("viewBox") || ""}">${sym.innerHTML}</svg>`;
    }
    markup = markup.replace(/\s(class|data-[\w-]+|style)="[^"]*"/g, "").replace(/\s+/g, " ");
    let entry = svgStore.get(markup);
    if (!entry) {
      const hint = svg.getAttribute("aria-label") || svg.querySelector("title")?.textContent ||
        svg.closest("[aria-label]")?.getAttribute("aria-label") || ref?.slice(1) || "";
      entry = { key: `svg${svgStore.size + 1}`, hint: hint.slice(0, 40), count: 0, markup: markup.slice(0, 6000),
        size: [Math.round(svg.getBoundingClientRect().width), Math.round(svg.getBoundingClientRect().height)],
        currentColor: /currentColor/i.test(markup) };
      svgStore.set(markup, entry);
    }
    entry.count++;
    return entry.key;
  };

  const all = () => [...document.querySelectorAll("body *")].filter((el) => !el.closest("svg") || el.tagName === "svg");
  const bump = (m, k, ex) => { const e = m.get(k) || { n: 0, ex }; e.n++; m.set(k, e); };
  const top = (m, n = 30) => [...m].sort((a, b) => b[1].n - a[1].n).slice(0, n).map(([k, v]) => ({ v: k, n: v.n, ex: v.ex }));

  const cx = {
    version: 2,
    sel,
    section(selector, depth = 10) {
      const el = document.querySelector(selector);
      if (!el) return { error: `not found: ${selector}` };
      svgStore.clear();
      const parent = el.parentElement ? getComputedStyle(el.parentElement) : null;
      const tree = node(el, 0, parent, { depth, keepHidden: true });
      // Root keeps inherited values so the builder never has to look them up.
      const rcs = getComputedStyle(el);
      ["font-family", "font-size", "line-height", "color", "letter-spacing", "font-weight"].forEach((p) => (tree.css[p] ||= round(rcs.getPropertyValue(p))));
      return { url: location.href, vw: innerWidth, tree, svgs: [...svgStore.values()] };
    },
    // Flat selector -> css map used for state/responsive diffs.
    snap(selector, depth = 3, viewport = false) {
      const root = document.querySelector(selector);
      if (!root) return {};
      const out = {};
      const walk = (el, d) => {
        const cs = getComputedStyle(el);
        const o = {};
        PROPS.forEach((p) => (o[p] = cs.getPropertyValue(p)));
        // Used sizes always vary with viewport; keep track counts, not resolved px.
        delete o.width; delete o.height; delete o["transform-origin"]; delete o["perspective-origin"];
        ["grid-template-columns", "grid-template-rows"].forEach((g) => { if (/^[\d.px ]+$/.test(o[g])) o[g] = `${o[g].trim().split(/\s+/).length} tracks`; });
        o["@rect"] = (viewport ? (({ x, y, width, height }) => [x, y, width, height].map(Math.round))(el.getBoundingClientRect()) : rect(el)).join(",");
        out[sel(el)] = o;
        if (d < depth) [...el.children].forEach((c) => walk(c, d + 1));
      };
      walk(root, 0);
      return out;
    },
    diff(a, b, layoutOnly = false) {
      const out = {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (!a[k] || !b[k]) { out[k] = a[k] ? "removed" : "added"; continue; }
        const d = {};
        for (const p in b[k]) if (a[k][p] !== b[k][p] && (!layoutOnly || LAYOUT.has(p))) d[p] = `${a[k][p]} → ${b[k][p]}`;
        if (Object.keys(d).length) out[k] = d;
      }
      return out;
    },
    interactive(selector = "body", max = 40) {
      const root = document.querySelector(selector) || document.body;
      const seen = new Set();
      return [...root.querySelectorAll("a,button,input,select,textarea,summary,label,[role=button],[role=tab],[role=link],[role=menuitem],[tabindex],[onclick],*")]
        .filter((el, i, arr) => arr.indexOf(el) === i)
        .filter((el) => {
          const cs = getComputedStyle(el);
          if (!visible(el, cs)) return false;
          const isI = el.matches("a,button,input,select,textarea,summary,[role=button],[role=tab],[role=link],[role=menuitem],[tabindex]") ||
            (cs.cursor === "pointer" && getComputedStyle(el.parentElement || el).cursor !== "pointer");
          if (!isI) return false;
          const sig = `${el.tagName}.${el.className}`;
          if (seen.has(sig)) return false;
          seen.add(sig);
          return true;
        })
        .slice(0, max)
        .map((el) => ({ sel: sel(el), label: (el.getAttribute("aria-label") || textOf(el) || el.tagName).slice(0, 50),
          transition: getComputedStyle(el).transition }));
    },
    // Page-level sections in visual order.
    topology() {
      let root = document.body;
      while (root.children.length === 1 || [...root.children].filter((c) => c.getBoundingClientRect().height > innerHeight * 0.5).length === 1 && root.children.length < 4) {
        const big = [...root.children].find((c) => c.getBoundingClientRect().height > innerHeight * 0.5) || root.children[0];
        if (!big || big.children.length === 0) break;
        root = big;
      }
      let list = [...document.querySelectorAll("header,nav,main>*,footer,[role=banner],[role=contentinfo]"), ...root.children];
      // Split oversized wrappers (e.g. a single <main>) into their visible children.
      for (let pass = 0; pass < 3; pass++) list = list.flatMap((el) => {
        const kids = [...el.children].filter((c) => c.getBoundingClientRect().height > 8 && getComputedStyle(c).display !== "none");
        return el.getBoundingClientRect().height > innerHeight * 1.5 && kids.length > 1 ? kids : [el];
      });
      return [...new Set(list)].filter((el) => {
        const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
        return cs.display !== "none" && r.height > 8 && !list.some((o) => o !== el && o.contains(el));
      }).map((el) => {
        const cs = getComputedStyle(el);
        return { sel: sel(el), tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60), r: rect(el), pos: cs.position,
          z: cs.zIndex, bg: cs.backgroundColor, h: el.querySelector("h1,h2,h3")?.textContent.trim().slice(0, 60) || textOf(el)?.slice(0, 60) };
      }).sort((a, b) => a.r[1] - b.r[1]);
    },
    // Stacking + sticky/fixed layers.
    layers() {
      return all().map((el) => [el, getComputedStyle(el)]).filter(([el, cs]) =>
        (["fixed", "sticky"].includes(cs.position) || (cs.zIndex !== "auto" && cs.position !== "static")) && visible(el, cs))
        .slice(0, 60).map(([el, cs]) => ({ sel: sel(el), pos: cs.position, z: cs.zIndex, top: cs.top, r: rect(el), bg: cs.backgroundColor, backdrop: cs.backdropFilter !== "none" ? cs.backdropFilter : undefined }));
    },
    tokens() {
      const colors = new Map(), type = new Map(), radii = new Map(), shadows = new Map(), spacing = new Map();
      for (const el of all()) {
        const cs = getComputedStyle(el);
        if (!visible(el, cs)) continue;
        const s = sel(el);
        if (ownText(el)) {
          bump(colors, `text ${cs.color}`, s);
          bump(type, [cs.fontFamily.split(",")[0].replace(/"/g, ""), cs.fontSize, cs.fontWeight, cs.lineHeight, cs.letterSpacing, cs.textTransform, cs.fontFeatureSettings].join(" | "), s);
        }
        if (cs.backgroundColor !== "rgba(0, 0, 0, 0)") bump(colors, `bg ${cs.backgroundColor}`, s);
        if (parseFloat(cs.borderTopWidth)) bump(colors, `border ${cs.borderTopColor}`, s);
        if (cs.borderRadius !== "0px") bump(radii, cs.borderRadius, s);
        if (cs.boxShadow !== "none") bump(shadows, cs.boxShadow, s);
        [cs.paddingTop, cs.paddingLeft, cs.rowGap, cs.columnGap].forEach((v) => v && v !== "0px" && v !== "normal" && bump(spacing, v, s));
      }
      const rootCS = getComputedStyle(document.documentElement);
      const vars = {};
      for (let i = 0; i < rootCS.length; i++) { const p = rootCS[i]; if (p.startsWith("--")) vars[p] = rootCS.getPropertyValue(p).trim().slice(0, 120); }
      return { colors: top(colors, 40), type: top(type, 40), radii: top(radii, 12), shadows: top(shadows, 12), spacing: top(spacing, 24),
        vars: Object.keys(vars).length > 300 ? { note: `${Object.keys(vars).length} vars; first 300`, ...Object.fromEntries(Object.entries(vars).slice(0, 300)) } : vars,
        body: { bg: getComputedStyle(document.body).backgroundColor, color: getComputedStyle(document.body).color, font: getComputedStyle(document.body).fontFamily,
          smoothing: getComputedStyle(document.body).webkitFontSmoothing, scrollBehavior: rootCS.scrollBehavior } };
    },
    fonts() {
      return [...document.fonts].map((f) => ({ family: f.family.replace(/"/g, ""), weight: f.weight, style: f.style, status: f.status,
        unicodeRange: f.unicodeRange !== "U+0-10FFFF" ? f.unicodeRange : undefined, display: f.display, features: f.featureSettings !== "normal" ? f.featureSettings : undefined }))
        .filter((f, i, a) => a.findIndex((g) => JSON.stringify(g) === JSON.stringify(f)) === i);
    },
    assets() {
      const bgs = [];
      for (const el of all()) {
        for (const ps of [null, "::before", "::after"]) {
          const bi = getComputedStyle(el, ps).backgroundImage;
          if (bi && bi.includes("url(")) bgs.push({ sel: sel(el) + (ps || ""), urls: [...bi.matchAll(/url\("?([^")]+)"?\)/g)].map((m) => m[1]), size: getComputedStyle(el, ps).backgroundSize });
        }
      }
      const meta = {};
      document.querySelectorAll("meta[property^='og:'],meta[name^='twitter:'],meta[name=description],meta[name=theme-color]").forEach((m) => (meta[m.getAttribute("property") || m.name] = m.content));
      return {
        images: [...document.images].map((el) => ({ sel: sel(el), alt: el.alt, r: rect(el), fit: getComputedStyle(el).objectFit, ...img(el) })),
        backgrounds: bgs,
        videos: [...document.querySelectorAll("video")].map((v) => ({ sel: sel(v), src: v.currentSrc || v.src, sources: [...v.querySelectorAll("source")].map((s) => ({ src: s.src, type: s.type })),
          poster: v.poster, autoplay: v.autoplay, loop: v.loop, muted: v.muted, playsInline: v.playsInline })),
        icons: [...document.querySelectorAll("link[rel*=icon],link[rel=manifest],link[rel=mask-icon]")].map((l) => ({ rel: l.rel, href: l.href, sizes: l.sizes?.toString() || undefined })),
        meta: { title: document.title, lang: document.documentElement.lang, ...meta },
        other: { canvas: document.querySelectorAll("canvas").length, iframes: [...document.querySelectorAll("iframe")].map((f) => f.src).slice(0, 10),
          lottie: document.querySelectorAll("lottie-player,dotlottie-player,[data-animation-path]").length },
      };
    },
    libs() {
      const w = window, h = document.documentElement;
      const found = {
        lenis: !!(w.lenis || w.Lenis || h.classList.contains("lenis")), locomotive: !!document.querySelector("[data-scroll-container]"),
        gsap: !!w.gsap, scrollTrigger: !!(w.ScrollTrigger || w.gsap?.ScrollTrigger), swiper: !!(w.Swiper || document.querySelector(".swiper")),
        splide: !!document.querySelector(".splide"), slick: !!document.querySelector(".slick-slider"), embla: !!document.querySelector("[class*=embla]"),
        framer: !!document.querySelector("[data-framer-name],[data-projection-id]"), aos: !!document.querySelector("[data-aos]"),
        three: !!w.THREE, react: !!document.querySelector("[data-reactroot]") || !!w.__NEXT_DATA__ || !!w.next, vue: !!w.__VUE__, jquery: !!w.jQuery,
      };
      const snaps = all().filter((el) => getComputedStyle(el).scrollSnapType !== "none").map(sel).slice(0, 10);
      return { ...Object.fromEntries(Object.entries(found).filter(([, v]) => v)), snapContainers: snaps.length ? snaps : undefined };
    },
    animations() {
      return document.getAnimations().slice(0, 40).map((a) => ({ type: a.constructor.name, name: a.animationName || a.transitionProperty, target: sel(a.effect?.target),
        ...(a.effect?.getComputedTiming ? (({ duration, delay, iterations, easing }) => ({ duration, delay, iterations, easing }))(a.effect.getComputedTiming()) : {}) }));
    },
    // Text-anchored style map: lets a clone be compared to the target without matching DOM.
    textmap(selector = "body") {
      const root = document.querySelector(selector) || document.body;
      const [rx, ry] = rect(root);
      const out = [];
      for (const el of root.querySelectorAll("*")) {
        const t = ownText(el);
        if (!t || t.length < 2) continue;
        const cs = getComputedStyle(el);
        if (!visible(el, cs)) continue;
        const r = rect(el);
        out.push({ t: t.slice(0, 60), x: r[0] - rx, y: r[1] - ry, w: r[2], h: r[3], ff: cs.fontFamily.split(",")[0].replace(/"/g, "").trim(),
          fs: cs.fontSize, fw: cs.fontWeight, lh: cs.lineHeight, ls: cs.letterSpacing, c: cs.color, tt: cs.textTransform });
      }
      return out.slice(0, 400);
    },
    // Same-origin stylesheet scan (MCP fallback; inspect.mjs reads all sheets via CDP instead).
    cssRules() {
      const media = {}, keyframes = [], fontFaces = [];
      for (const sh of document.styleSheets) {
        let rules; try { rules = sh.cssRules; } catch { continue; }
        const walk = (list) => { for (const r of list) {
          if (r instanceof CSSMediaRule) { media[r.conditionText] = (media[r.conditionText] || 0) + r.cssRules.length; walk(r.cssRules); }
          else if (r instanceof CSSKeyframesRule) keyframes.push(r.cssText.slice(0, 800));
          else if (r instanceof CSSFontFaceRule) fontFaces.push(r.cssText.slice(0, 600));
          else if (r.cssRules) walk(r.cssRules);
        } };
        walk(rules);
      }
      return { media, keyframes, fontFaces };
    },
  };
  window.__cx = cx;
})();
