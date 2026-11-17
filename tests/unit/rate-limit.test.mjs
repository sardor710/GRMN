// Task 21A review C1/C2/I1/I2: rate limits key on the trusted proxy client address only
// (AUTH_TRUSTED_IP_HEADER, the auth layer's convention), never on cookies or X-Forwarded-For, and
// never collapse anonymous traffic into one shared bucket.
import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

test("the client address comes only from the validated trusted header",async()=>{
  const {trustedClientAddress}=await import("../../src/server/operations/rate-limit.ts");
  const env={AUTH_TRUSTED_IP_HEADER:"x-grmn-client-ip"};
  assert.equal(trustedClientAddress(new Headers({"x-grmn-client-ip":"203.0.113.9","x-forwarded-for":"198.51.100.1"}),env),"203.0.113.9");
  assert.equal(trustedClientAddress(new Headers({"x-grmn-client-ip":"2001:db8::1"}),env),"2001:db8::1");
  for(const value of [null,"","not-an-ip","203.0.113.9, 10.0.0.1"]){
    const headers=new Headers(value===null?{}:{"x-grmn-client-ip":value});
    assert.throws(()=>trustedClientAddress(headers,env),error=>{assert.equal(error.status,503);return true;},String(value));
  }
  // No trusted proxy configured (development): no per-client identity, so no shared bucket either.
  assert.equal(trustedClientAddress(new Headers({"x-forwarded-for":"198.51.100.1"}),{}),null);
});

test("bucket keys are keyed hashes when a secret is given",async()=>{
  const {bucketKey}=await import("../../src/server/operations/rate-limit.ts");
  const plain=bucketKey("checkout","203.0.113.9"),keyed=bucketKey("checkout","203.0.113.9","a".repeat(64));
  assert.match(plain,/^[0-9a-f]{64}$/);assert.match(keyed,/^[0-9a-f]{64}$/);assert.notEqual(plain,keyed);
});

test("cart and webhook limits use the trusted address, not cookies or forwarded-for",()=>{
  for(const file of ["src/server/cart/runtime.ts","src/server/payments/runtime.ts"]){
    const source=read(file);
    assert.match(source,/trustedClientAddress\(/,file);
    assert.doesNotMatch(source,/grmn-cart|session_token|x-forwarded-for|clientIdentifier/i,file);
  }
  assert.doesNotMatch(read("src/server/operations/rate-limit.ts"),/TRUST_PROXY|x-forwarded-for/i);
});
