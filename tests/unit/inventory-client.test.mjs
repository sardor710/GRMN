// Task 18B (11A M7): the admin restock action posts an audited stock adjustment to
// /api/admin/inventory, reusing one idempotency key across retries of the same action.
import assert from "node:assert/strict";
import {test} from "node:test";
import {createStockAdjuster} from "../../src/lib/admin/inventory-client.ts";

test("a restock posts a receive adjustment with one key reused on retry",async()=>{
  const calls=[];let fail=1;
  const fetcher=async(url,init)=>{calls.push({url,init});if(fail-->0)throw new TypeError("network down");return new Response(JSON.stringify({movementId:"m",replayed:false,stock:{variantId:"v",locationKey:"main",onHand:11,reserved:0,available:11,version:2}}),{status:200,headers:{"content-type":"application/json"}});};
  const adjust=createStockAdjuster(fetcher);
  const action=adjust.prepare({variantId:"0b6f6a3e-2f7d-4c2b-9b1e-0d4f3d2c1a00",delta:10,note:"Restock from dashboard"});
  await assert.rejects(action.send());
  const result=await action.send();
  assert.equal(result.stock.available,11);
  assert.equal(calls.length,2);
  for(const call of calls){
    assert.equal(call.url,"/api/admin/inventory");
    assert.equal(call.init.method,"POST");
    assert.equal(call.init.headers["content-type"],"application/json");
  }
  const [first,second]=calls.map(call=>JSON.parse(call.init.body));
  assert.deepEqual(first,second,"a retry sends the same request");
  assert.equal(first.reason,"receive");assert.equal(first.delta,10);assert.match(first.idempotencyKey,/^[A-Za-z0-9_:-]{8,128}$/);
});

test("a counted correction uses reason adjust, and server errors surface their message",async()=>{
  const fetcher=async()=>new Response(JSON.stringify({error:{code:"INSUFFICIENT_STOCK",message:"Stock cannot go below the reserved quantity"}}),{status:409,headers:{"content-type":"application/json"}});
  const action=createStockAdjuster(fetcher).prepare({variantId:"0b6f6a3e-2f7d-4c2b-9b1e-0d4f3d2c1a00",delta:-3,note:"Count"});
  await assert.rejects(action.send(),error=>{assert.equal(error.message,"Stock cannot go below the reserved quantity");assert.equal(error.code,"INSUFFICIENT_STOCK");return true;});
  assert.throws(()=>createStockAdjuster(fetcher).prepare({variantId:"x",delta:0,note:"n"}));
});

test("review I8: the UI keeps one pending action per row until it succeeds or is definitively refused",async()=>{
  const {createPendingActions}=await import("../../src/lib/admin/inventory-client.ts");
  const bodies=[];let mode="network";
  const fetcher=async(_url,init)=>{bodies.push(init.body);if(mode==="network")throw new TypeError("offline");if(mode==="refused")return new Response(JSON.stringify({error:{code:"INSUFFICIENT_STOCK",message:"No"}}),{status:409,headers:{"content-type":"application/json"}});return new Response(JSON.stringify({movementId:"m",replayed:false,stock:{variantId:"v",locationKey:"main",onHand:5,reserved:0,available:5,version:1}}),{status:200,headers:{"content-type":"application/json"}});};
  const pending=createPendingActions(createStockAdjuster(fetcher));
  const input={variantId:"0b6f6a3e-2f7d-4c2b-9b1e-0d4f3d2c1a00",delta:10,note:"Restock"};
  await assert.rejects(pending.run("row-1",input));
  assert.equal(pending.isPending("row-1"),true,"a lost response keeps the action for retry");
  mode="ok";
  await pending.run("row-1",input);
  assert.equal(bodies[0],bodies[1],"the retry reuses the same request and key");
  assert.equal(pending.isPending("row-1"),false);
  mode="refused";
  await assert.rejects(pending.run("row-1",input));
  assert.equal(pending.isPending("row-1"),false,"a definitive refusal is not retried");
  assert.notEqual(JSON.parse(bodies[2]).idempotencyKey,JSON.parse(bodies[0]).idempotencyKey,"a new action gets a new key");
});
