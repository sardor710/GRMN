import test from "node:test";
import assert from "node:assert/strict";
import { mergeSpecGroups, parseSpecPaste, parseSpecTsv, splitTsv } from "../../src/lib/admin/spec-paste.ts";

const titles = (parsed) => parsed.groups.map(group => group.title);

test("Excel TSV: column header row skipped, one-cell rows become groups", () => {
  const text = [
    "Characteristic\tValue",
    "General\t",
    "Lens material\tDomed sapphire crystal",
    "Bezel material\tTitanium",
    "\t",
    "Battery\t",
    "Smartwatch\tUp to 16 days",
    "GPS only\tUp to 47 hours",
    "",
  ].join("\r\n");
  const parsed = parseSpecPaste({ text });
  assert.equal(parsed.format, "tsv");
  assert.deepEqual(titles(parsed), ["General", "Battery"]);
  assert.equal(parsed.rowCount, 4);
  assert.deepEqual(parsed.groups[1].items[0], { label: "Smartwatch", value: "Up to 16 days" });
});

test("Google Sheets TSV: quoted multi-line cells, extra columns and empty cells", () => {
  const text = 'Display size\t"1.4""\n(35.4 mm)"\nWater rating\t10 ATM\t\nSensors\tGPS\tGLONASS\n\t\nColors\t\t';
  assert.deepEqual(splitTsv('a\t"b\tc"\n')[0], ["a", "b\tc"]);
  const groups = parseSpecTsv(text);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, "General");
  assert.deepEqual(groups[0].items, [
    { label: "Display size", value: '1.4" (35.4 mm)' },
    { label: "Water rating", value: "10 ATM" },
    { label: "Sensors", value: "GPS · GLONASS" },
  ]);
  // "Colors" alone in column A is a group header with no rows, so it is dropped.
});

test("garmin.com spec table HTML: h3 rows are groups, yes/no cells become Yes/No", () => {
  const html = `<table class="specs"><tbody>
    <tr><th colspan="2"><h3>General</h3></th></tr>
    <tr><th>Lens material</th><td>Domed sapphire crystal</td></tr>
    <tr><th>Strap&nbsp;material</th><td>  silicone
        </td></tr>
    <tr><th colspan="2"><h3>Sensors</h3></th></tr>
    <tr><th>GPS</th><td class="yes"><span class="icon"></span></td></tr>
    <tr><th>Pulse Ox</th><td class="no"></td></tr>
  </tbody></table>`;
  const parsed = parseSpecPaste({ html, text: "ignored plain text" });
  assert.equal(parsed.format, "html");
  assert.deepEqual(titles(parsed), ["General", "Sensors"]);
  assert.deepEqual(parsed.groups[0].items[1], { label: "Strap material", value: "silicone" });
  assert.deepEqual(parsed.groups[1].items, [{ label: "GPS", value: "Yes" }, { label: "Pulse Ox", value: "No" }]);
});

test("website HTML: several tables become several groups (caption or preceding heading)", () => {
  const html = `<div><h3>Дисплей</h3><table><tr><td>Диагональ</td><td>1,4"</td></tr><tr><td>Тип</td><td>AMOLED</td></tr></table>
    <table><caption>Аккумулятор</caption><thead><tr><th>Характеристика</th><th>Значение</th></tr></thead>
    <tbody><tr><td>Время работы</td><td>до 16 дней<br>в режиме смарт-часов</td></tr></tbody></table>
    <table><tr><td>Weight</td><td>63 g</td></tr></table></div>`;
  const parsed = parseSpecPaste({ html });
  assert.deepEqual(titles(parsed), ["Дисплей", "Аккумулятор", "General"]);
  assert.deepEqual(parsed.groups[1].items, [{ label: "Время работы", value: "до 16 дней в режиме смарт-часов" }]);
  assert.equal(parsed.rowCount, 4);
});

test("Excel clipboard HTML: styles ignored, a row with one filled cell is a header", () => {
  const html = `<html><head><style>td{mso-number-format:"\\@"}</style></head><body><!--StartFragment-->
    <table><tr><td>Physical</td><td></td></tr><tr><td>Weight</td><td>71 g</td></tr>
    <tr><td></td><td></td></tr><tr><td>Connectivity</td><td></td></tr><tr><td>Wi-Fi</td><td>Yes</td></tr></table>
    <!--EndFragment--></body></html>`;
  const parsed = parseSpecPaste({ html, text: "Physical\t\nWeight\t71 g" });
  assert.equal(parsed.format, "html");
  assert.deepEqual(parsed.groups, [
    { title: "Physical", items: [{ label: "Weight", value: "71 g" }] },
    { title: "Connectivity", items: [{ label: "Wi-Fi", value: "Yes" }] },
  ]);
});

test("Label: Value lines with header lines, blank-line blocks and dash separators", () => {
  const text = `Battery life
Smartwatch: up to 16 days
GPS only – up to 47 hours

Display:
- Size: 1.4"
- Resolution - 454 x 454 pixels
Website: https://www.garmin.com/en-US/p/886785`;
  const parsed = parseSpecPaste({ text });
  assert.equal(parsed.format, "lines");
  assert.deepEqual(titles(parsed), ["Battery life", "Display"]);
  assert.deepEqual(parsed.groups[0].items[1], { label: "GPS only", value: "up to 47 hours" });
  assert.deepEqual(parsed.groups[1].items.map(item => item.label), ["Size", "Resolution", "Website"]);
  assert.equal(parsed.groups[1].items[2].value, "https://www.garmin.com/en-US/p/886785");
});

test("mixed RU / KK / EN lines keep Unicode labels and values", () => {
  const text = "Жалпы\nКорпус материалы: титан\nМатериал ремешка — силикон\nWater rating: 10 ATM\n\nБатарея\nАвтономность: до 16 дней";
  const parsed = parseSpecPaste({ text });
  assert.deepEqual(titles(parsed), ["Жалпы", "Батарея"]);
  assert.deepEqual(parsed.groups[0].items, [
    { label: "Корпус материалы", value: "титан" },
    { label: "Материал ремешка", value: "силикон" },
    { label: "Water rating", value: "10 ATM" },
  ]);
});

test("duplicate labels: exact duplicates in a group are dropped, different values and other groups kept", () => {
  const text = "Battery\t\nSmartwatch\tUp to 16 days\nSmartwatch\tUp to 16 days\nSmartwatch\tUp to 10 days (AMOLED on)\nSolar\t\nSmartwatch\tUp to 29 days";
  const parsed = parseSpecPaste({ text });
  assert.deepEqual(parsed.groups.map(group => group.items.length), [2, 1]);
  assert.equal(parsed.rowCount, 3);
});

test("empty input and whitespace-only cells", () => {
  assert.deepEqual(parseSpecPaste({ text: "  \n\t\n", html: "" }), { format: "empty", groups: [], rowCount: 0 });
  const parsed = parseSpecPaste({ text: "  Weight \u00a0 \t  63\u00a0g  \n\t\t\n" });
  assert.deepEqual(parsed.groups[0].items, [{ label: "Weight", value: "63 g" }]);
});

test("definition lists from product pages parse as label/value pairs", () => {
  const parsed = parseSpecPaste({ html: "<h4>Physical</h4><dl><dt>Weight:</dt><dd>63 g</dd><div><dt>Size</dt><dd>47 x 47 x 14.5 mm</dd></div></dl>" });
  assert.deepEqual(parsed.groups, [{ title: "Physical", items: [{ label: "Weight", value: "63 g" }, { label: "Size", value: "47 x 47 x 14.5 mm" }] }]);
});

test("append merges rows into a same-titled group; replace swaps everything", () => {
  const existing = [{ title: "General", items: [{ label: "Lens", value: "Sapphire" }] }];
  const incoming = [{ title: "general", items: [{ label: "Weight", value: "63 g" }] }, { title: "Battery", items: [{ label: "GPS", value: "47 h" }] }];
  const appended = mergeSpecGroups(existing, incoming, "append");
  assert.deepEqual(appended.map(group => [group.title, group.items.length]), [["General", 2], ["Battery", 1]]);
  assert.equal(existing[0].items.length, 1, "inputs are not mutated");
  assert.deepEqual(mergeSpecGroups(existing, incoming, "replace").map(group => group.title), ["general", "Battery"]);
});
