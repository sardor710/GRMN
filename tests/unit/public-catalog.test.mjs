import assert from "node:assert/strict";
import {test} from "node:test";
import {existsSync} from "node:fs";

async function helpers(){assert.ok(existsSync(new URL("../../src/lib/public-catalog.ts",import.meta.url)),"Browser-safe exact-money/catalog helpers are required");return import("../../src/lib/public-catalog.ts");}
test("public money formatting keeps bigint cents exact without a floating-point conversion",async()=>{
  const {formatMinorMoney}=await helpers();const value=formatMinorMoney("9007199254740993","KZT","en-US");assert.ok(value.includes("90,071,992,547,409.93"));assert.ok(value.includes("KZT"));
  assert.ok(formatMinorMoney("1","USD","en-US").includes("0.01"));for(const bad of ["-1","1e2","1.2","00",""])assert.throws(()=>formatMinorMoney(bad,"KZT","en-US"));
});
test("USD presentation is a labelled estimate and unavailable rates keep the authoritative KZT amount",async()=>{
  const {catalogPriceLabel}=await helpers();const price={selling:{amountMinor:"500000",currency:"KZT"},compareAt:null,usdEquivalent:null};
  assert.match(catalogPriceLabel(price,"USD","en-US"),/5,000\.00.*KZT/);
  const usd={...price,usdEquivalent:{amountMinor:"1000",currency:"USD",exchangeRate:{id:"rate",version:1,kztPerUsd:"500",updatedAt:"2020-01-01T00:00:00Z"}}};assert.match(catalogPriceLabel(usd,"USD","en-US"),/10\.00.*USD.*estimate/i);
});
test("catalog view adapters use public keys, safe metadata and exact labels without private stock fields",async()=>{
  const {catalogCardView}=await helpers();const view=catalogCardView({id:"internal",publicKey:"public-key",name:"Model",description:"Text",image:null,badge:null,availability:"unavailable",price:{selling:{amountMinor:"123456",currency:"KZT"},compareAt:null,usdEquivalent:null},legacyContent:{privateToken:"INERT-PRIVATE"},onHand:99},"KZT","en-US");
  assert.equal(view.id,"public-key");assert.ok(view.priceLabel.includes("1,234.56"));assert.ok(!JSON.stringify(view).includes("INERT-PRIVATE"));assert.ok(!("stock"in view));assert.equal(view.purchasable,false);
});
