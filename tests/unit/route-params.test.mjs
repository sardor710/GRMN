import test from "node:test";
import assert from "node:assert/strict";
import {decodeRouteParam} from "../../src/lib/route-params.ts";

test("percent-encoded Unicode route params decode to the stored slug",()=>{
  assert.equal(decodeRouteParam("%D2%9B%D0%B0%D0%B7%D0%B0%D2%9B%D1%88%D0%B0-ui-%D0%BC%D0%B0%D2%9B%D0%B0%D0%BB%D0%B0"),"қазақша-ui-мақала");
  assert.equal(decodeRouteParam("қазақша-ui-мақала"),"қазақша-ui-мақала");
  assert.equal(decodeRouteParam("train-for-triathlon"),"train-for-triathlon");
});

test("malformed escapes are returned unchanged instead of throwing",()=>{
  assert.equal(decodeRouteParam("100%-bad"),"100%-bad");
  assert.equal(decodeRouteParam("%E0%A4%A"),"%E0%A4%A");
});
