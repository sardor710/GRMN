// Pure parser for the admin "Paste specs" dialog (plan M3.5, A4). Turns whatever a content manager copies
// into spec groups ({title, items:[{label, value}]}):
//   (a) Excel / Google Sheets TSV: two columns label/value; a row with one non-empty cell is a group header
//   (b) "Label: Value" or "Label – Value" lines; groups are blank-line blocks or header lines
//   (c) HTML tables from websites (clipboard text/html): th/td rows; a caption, an in-row heading or a
//       full-width row is a group header; several tables become several groups; <dl> lists also work
// Every cell is trimmed and its whitespace collapsed; empty rows are dropped. No DOM needed (htmlparser2),
// so it runs the same in the browser and in node:test.
import { DomUtils, parseDocument } from "htmlparser2";

export interface SpecRow { label: string; value: string }
export interface SpecGroupDraft { title: string; items: SpecRow[] }
export type SpecPasteFormat = "html" | "tsv" | "lines" | "empty";
export interface ParsedSpecs { format: SpecPasteFormat; groups: SpecGroupDraft[]; rowCount: number }

export const DEFAULT_GROUP_TITLE = "General";

type DomNode = ReturnType<typeof parseDocument>["children"][number];
type DomElement = Extract<DomNode, { name: string }>;

const clean = (value: string): string => value.replace(/[\s​﻿]+/g, " ").trim();
const cleanLabel = (value: string): string => clean(value).replace(/\s*[:：]$/, "").trim();

// A first row like "Characteristic | Value" (EN / RU / KK) is a column header, not a spec.
const HEADER_LABELS = /^(label|name|characteristic|characteristics|spec|specs|specification|specifications|feature|features|parameter|property|attribute|характеристика|характеристики|параметр|свойство|наименование|название|сипаттама|сипаттамалар|параметрлер|атауы)$/i;
const HEADER_VALUES = /^(value|values|details|description|значение|значения|описание|мәні|мән|сипаттамасы)$/i;
const isColumnHeader = (label: string, value: string) => HEADER_LABELS.test(label) && HEADER_VALUES.test(value);

/** Collects rows into groups; drops exact duplicate rows inside one group and empty groups. */
class GroupBuilder {
  groups: SpecGroupDraft[] = [];
  private current: SpecGroupDraft | null = null;
  private fallbackTitle = DEFAULT_GROUP_TITLE;
  header(title: string) {
    const text = cleanLabel(title);
    if (!text) return;
    this.current = { title: text, items: [] };
    this.groups.push(this.current);
  }
  /** The next rows without a header start a fresh untitled group (used between separate tables). */
  breakGroup(fallbackTitle = DEFAULT_GROUP_TITLE) { this.current = null; this.fallbackTitle = fallbackTitle; }
  row(rawLabel: string, rawValue: string) {
    const label = cleanLabel(rawLabel), value = clean(rawValue);
    if (!label && !value) return;
    if (!this.current) { this.current = { title: this.fallbackTitle, items: [] }; this.groups.push(this.current); }
    if (!label) {
      // A value with no label continues the previous row (a wrapped multi-line value).
      const last = this.current.items.at(-1);
      if (last) last.value = last.value ? `${last.value}; ${value}` : value;
      return;
    }
    if (this.current.items.some(item => item.label.toLowerCase() === label.toLowerCase() && item.value === value)) return;
    this.current.items.push({ label, value });
  }
  result(): SpecGroupDraft[] { return this.groups.filter(group => group.items.length > 0); }
}

const countRows = (groups: SpecGroupDraft[]) => groups.reduce((total, group) => total + group.items.length, 0);

// ---- (a) TSV ---------------------------------------------------------------------------------------

/** Splits Excel/Sheets TSV, honouring quoted cells that contain tabs, newlines or "" escapes. */
export function splitTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, atCellStart = true;
  const source = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"' && atCellStart) { quoted = true; atCellStart = false; continue; }
    if (char === "\t") { row.push(cell); cell = ""; atCellStart = true; continue; }
    if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; atCellStart = true; continue; }
    cell += char; atCellStart = false;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function parseSpecTsv(text: string): SpecGroupDraft[] {
  const builder = new GroupBuilder();
  let first = true;
  for (const raw of splitTsv(text)) {
    const cells = raw.map(clean);
    const filled = cells.filter(Boolean);
    if (!filled.length) continue;
    if (first && filled.length === 2 && isColumnHeader(cells[0] ?? "", filled[1])) { first = false; continue; }
    first = false;
    if (filled.length === 1 && cells[0]) { builder.header(cells[0]); continue; }
    if (filled.length === 1) { builder.row("", filled[0]); continue; }
    const [label, ...rest] = cells[0] ? [cells[0], ...cells.slice(1).filter(Boolean)] : filled;
    builder.row(label, rest.join(" · "));
  }
  return builder.result();
}

// ---- (b) "Label: Value" lines ------------------------------------------------------------------------

const LINE_PAIR = /^(.{1,200}?)\s*(?:[:：]\s+|[:：](?=\S)(?!\/\/)|\s+[–—-]\s+|\t+)(.+)$/;
const stripMarkers = (line: string) => line.replace(/^\s*(?:[-*•·▪◦]|\d+[.)])\s+/, "").replace(/^#{1,6}\s+/, "").replace(/^\*\*(.+)\*\*$/, "$1").replace(/^__(.+)__$/, "$1");

export function parseSpecLines(text: string): SpecGroupDraft[] {
  const builder = new GroupBuilder();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = clean(stripMarkers(lines[i]));
    if (!line) continue;
    const pair = LINE_PAIR.exec(line);
    if (pair && clean(pair[2])) { builder.row(pair[1], pair[2]); continue; }
    // A line ending with ":" or without a separator is a group header when rows follow it.
    const next = lines.slice(i + 1).map(l => clean(stripMarkers(l))).find(Boolean);
    if (next && LINE_PAIR.test(next)) builder.header(line);
    else if (/[:：]$/.test(line)) builder.header(line);
    else builder.row("", line);
  }
  return builder.result();
}

// ---- (c) HTML tables ---------------------------------------------------------------------------------

const isElement = (node: DomNode): node is DomElement => "name" in node && typeof (node as DomElement).name === "string";
const HEADING = /^h[1-6]$/;

function textOf(node: DomNode): string {
  if (node.type === "text") return (node as { data: string }).data;
  if (!isElement(node)) return "";
  if (node.name === "script" || node.name === "style") return "";
  if (node.name === "br") return " ";
  if (node.name === "img") return node.attribs.alt ?? "";
  const inner = node.children.map(textOf).join("");
  return /^(p|div|li|tr|h[1-6])$/.test(node.name) ? ` ${inner} ` : inner;
}

function cellText(cell: DomElement): string {
  const text = clean(textOf(cell));
  if (text) return text;
  // garmin.com marks feature support with td class "yes"/"no" and an icon.
  const classes = ` ${cell.attribs.class ?? ""} `.toLowerCase();
  if (/\s(yes|check|checked|true)\s/.test(classes)) return "Yes";
  if (/\s(no|cross|false)\s/.test(classes)) return "No";
  return "";
}

function directCells(row: DomElement): DomElement[] {
  return row.children.filter(isElement).filter(child => child.name === "td" || child.name === "th");
}

function parseTable(table: DomElement, builder: GroupBuilder, fallbackTitle: string) {
  builder.breakGroup(fallbackTitle);
  const caption = DomUtils.getElementsByTagName("caption", table, true, 1)[0];
  if (caption) builder.header(textOf(caption));
  let first = true;
  for (const row of DomUtils.getElementsByTagName("tr", table)) {
    const heading = DomUtils.findOne(el => HEADING.test(el.name), row.children, true);
    if (heading) { builder.header(textOf(heading)); first = false; continue; }
    const cells = directCells(row);
    const texts = cells.map(cellText);
    const filled = texts.filter(Boolean);
    if (!filled.length) continue;
    if (first && filled.length === 2 && isColumnHeader(texts[0], filled[1])) { first = false; continue; }
    first = false;
    const span = Number(cells[0]?.attribs.colspan ?? 1);
    if (filled.length === 1 && (cells.length === 1 || span > 1 || texts[0])) {
      // One non-empty cell: a full-width row or an Excel-style header row.
      if (texts[0]) builder.header(texts[0]); else builder.row("", filled[0]);
      continue;
    }
    const [label, ...rest] = texts[0] ? [texts[0], ...texts.slice(1).filter(Boolean)] : filled;
    builder.row(label, rest.join(" · "));
  }
}

function parseDefinitionList(list: DomElement, builder: GroupBuilder, fallbackTitle: string) {
  builder.breakGroup(fallbackTitle);
  let label = "";
  for (const child of list.children.filter(isElement)) {
    if (child.name === "dt") label = textOf(child);
    else if (child.name === "dd") { builder.row(label, textOf(child)); label = ""; }
    else if (child.name === "div") for (const pair of child.children.filter(isElement)) {
      if (pair.name === "dt") label = textOf(pair); else if (pair.name === "dd") { builder.row(label, textOf(pair)); label = ""; }
    }
  }
}

export function parseSpecHtml(html: string): SpecGroupDraft[] {
  const document = parseDocument(html, { decodeEntities: true });
  const builder = new GroupBuilder();
  let lastHeading = "";
  const walk = (nodes: DomNode[]) => {
    for (const node of nodes) {
      if (!isElement(node)) continue;
      if (node.name === "script" || node.name === "style" || node.name === "head") continue;
      if (HEADING.test(node.name)) { lastHeading = cleanLabel(textOf(node)); continue; }
      if (node.name === "table") { parseTable(node, builder, lastHeading || DEFAULT_GROUP_TITLE); lastHeading = ""; continue; }
      if (node.name === "dl") { parseDefinitionList(node, builder, lastHeading || DEFAULT_GROUP_TITLE); lastHeading = ""; continue; }
      walk(node.children);
    }
  };
  walk(document.children);
  return builder.result();
}

// ---- detection + merge -------------------------------------------------------------------------------

/** Picks the best parser for the clipboard: HTML tables first, then TSV, then label/value lines. */
export function parseSpecPaste(input: { text?: string | null; html?: string | null }): ParsedSpecs {
  const html = input.html ?? "";
  if (/<(table|dl)[\s>]/i.test(html)) {
    const groups = parseSpecHtml(html);
    if (groups.length) return { format: "html", groups, rowCount: countRows(groups) };
  }
  const text = input.text ?? "";
  if (!text.trim()) return { format: "empty", groups: [], rowCount: 0 };
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  // Pasted HTML source (no text/html flavour) still parses as a table.
  if (/<(table|dl)[\s>]/i.test(text)) {
    const groups = parseSpecHtml(text);
    if (groups.length) return { format: "html", groups, rowCount: countRows(groups) };
  }
  const tabbed = lines.filter(line => line.includes("\t")).length;
  if (tabbed > 0 && tabbed >= lines.length / 2) {
    const groups = parseSpecTsv(text);
    return { format: "tsv", groups, rowCount: countRows(groups) };
  }
  const groups = parseSpecLines(text);
  return { format: "lines", groups, rowCount: countRows(groups) };
}

/** Replace, or append (rows join an existing group with the same title, case-insensitive). */
export function mergeSpecGroups(existing: SpecGroupDraft[], incoming: SpecGroupDraft[], mode: "replace" | "append"): SpecGroupDraft[] {
  const copy = (groups: SpecGroupDraft[]) => groups.map(group => ({ title: group.title, items: group.items.map(item => ({ ...item })) }));
  if (mode === "replace") return copy(incoming);
  const result = copy(existing);
  for (const group of incoming) {
    const target = result.find(candidate => candidate.title.trim().toLowerCase() === group.title.trim().toLowerCase());
    if (target) target.items.push(...group.items.map(item => ({ ...item })));
    else result.push({ title: group.title, items: group.items.map(item => ({ ...item })) });
  }
  return result;
}
