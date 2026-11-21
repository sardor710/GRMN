// Browser-only clean-up of UNSAVED overview HTML for the admin preview. The server sanitizes with an
// allowlist on save (sanitizeOverviewHtml); this only keeps the preview from running scripts or loading
// foreign frames while the editor holds unsaved text.
const BLOCKED = "script,style,iframe,object,embed,link,meta,base,form,input,button,textarea,select,frame,frameset,noscript,template";
const URL_ATTRS = ["href", "src", "srcset", "action", "formaction", "xlink:href", "poster"];

export function previewSafeHtml(html: string): string {
  if (typeof DOMParser === "undefined" || !html.trim()) return "";
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  doc.querySelectorAll(BLOCKED).forEach((element) => element.remove());
  doc.body.querySelectorAll("*").forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || (name === "style" && /expression|url\s*\(\s*['"]?\s*javascript/.test(value))) element.removeAttribute(attribute.name);
      else if (URL_ATTRS.includes(name) && /^(javascript|vbscript|data:text)/.test(value.replace(/\s+/g, ""))) element.removeAttribute(attribute.name);
    }
    if (element.tagName === "A") { element.setAttribute("target", "_blank"); element.setAttribute("rel", "noopener noreferrer"); }
  });
  return doc.body.innerHTML;
}
