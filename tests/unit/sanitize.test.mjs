// Task 18A review fixes: the rich-text sanitizer balances tags, stays linear on hostile input,
// rejects backslash links, and the plain-text helper drops all markup.
import assert from "node:assert/strict";
import {test} from "node:test";
import {sanitizeRichText,plainText} from "../../src/server/content/sanitize.ts";

test("review I1: unbalanced tags are closed or dropped, and links never nest",()=>{
  assert.equal(sanitizeRichText('<p>Hi <a href="https://x.example">Read more'),'<p>Hi <a href="https://x.example" rel="noopener noreferrer">Read more</a></p>');
  assert.equal(sanitizeRichText("</strong>text</p>"),"text");
  assert.equal(sanitizeRichText('<a href="/a">one <a href="/b">two</a></a>'),'<a href="/a" rel="noopener noreferrer">one two</a>');
  assert.equal(sanitizeRichText("<ul><li>x</ul>"),"<ul><li>x</li></ul>");
});

test("review I2: hostile input is sanitized in linear time",()=>{
  const started=performance.now();
  sanitizeRichText("<a".repeat(25000));
  sanitizeRichText("<a href=\"".repeat(10000));
  assert.ok(performance.now()-started<500,"sanitizing took "+(performance.now()-started)+" ms");
});

test("backslash and protocol-relative links are dropped",()=>{
  assert.equal(sanitizeRichText('<a href="/\\evil.com">x</a>'),"<a>x</a>");
  assert.equal(sanitizeRichText('<a href="//evil.com">x</a>'),"<a>x</a>");
});

test("plainText strips every tag and decodes nothing into markup",()=>{
  assert.equal(plainText("<b>Short</b><script>x()</script> a < b"),"Short a < b");
});

test("Task 18B: CSV cells neutralise formulas, including padded and full-width triggers",async()=>{
  const {csvCell}=await import("../../src/server/reports/exports.ts");
  for(const value of ["=1+1","+1","-1","@SUM(A1)","\tx","\rx","\nx"," =1+1","\u00a0=1","＝1","＋1","－1","＠x"])assert.ok(csvCell(value).startsWith("\"'"),JSON.stringify(value)+" -> "+csvCell(value));
  assert.equal(csvCell('He said "hi"'),'"He said ""hi"""');
  assert.equal(csvCell(42),'"42"');
});
