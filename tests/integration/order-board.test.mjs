// Owner 2026-11-25 (plan docs/plans/2026-11-25-order-board-serials-xl.md, M3): packing records one serial per unit of
// every electronic device; a serial can be on one active order only; the staff board shows New / Packed / Shipped /
// Delivered with next-day archive in Asia/Almaty, periods and search (serials included); returns name the serial
// that came back; customers see a four-step tracker and their serials. Paid orders come from the TEST-ONLY sandbox
// adapter, as in aftersales.test.mjs.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {randomUUID,randomBytes,createHmac,timingSafeEqual} from "node:crypto";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {AuthFailure,parseAuthConfig} from "../../src/server/auth/config.ts";
import {createAuthFoundation} from "../../src/server/auth/http.ts";
import {requirePrincipal} from "../../src/server/auth/principal.ts";

let temporary,database,runtime,mainId,serial=0,carts,payments,checkout,fulfillment,aftersales,staffId,provider,providers,api,account;
const secret=randomBytes(32).toString("hex"),baseURL="http://localhost:3000",q=(sql,args=[])=>database.pool.query(sql,args);
async function rejectsWith(promise,status,code){await assert.rejects(promise,error=>{assert.equal(error.status,status,error.message);if(code)assert.equal(error.code,code,error.message);return true;});}
const KZ={kind:"inline",address:{recipientName:"Aftersales Buyer",phone:"+77010000003",countryCode:"KZ",city:"Almaty",line1:"Abay 4"}};
const key=()=>"board-test-"+randomUUID();

const PERMS={fulfiller:["orders:read","orders:fulfill"],refunder:["orders:read","orders:fulfill","payments:refund"],support:["orders:read"]};
async function authorize(headers,permission){
  const role=headers.get("x-test-role");
  if(!role)throw new AuthFailure("UNAUTHENTICATED",401,"Sign in is required");
  if(!PERMS[role].includes(permission))throw new AuthFailure("FORBIDDEN",403,"Permission is required");
  return{userId:staffId,permissions:PERMS[role]};
}
const fulfiller=new Headers({"x-test-role":"fulfiller"}),refunder=new Headers({"x-test-role":"refunder"});

async function sessionCookie(id){const session=await(await runtime.auth.$context).internalAdapter.createSession(id);return "grmn-auth.session_token="+encodeURIComponent(session.token+"."+createHmac("sha256",secret).update(session.token).digest("base64"));}
async function owner(){const id=randomUUID(),n=++serial;await q("INSERT INTO users(id,name,email,phone_number,phone_number_verified) VALUES($1,'Aftersales owner',$2,$3,true)",[id,`after-${n}@example.invalid`,"+7706000"+String(n).padStart(4,"0")]);return{id,headers:new Headers({cookie:await sessionCookie(id)})};}
async function product({price=10000,stock=10,serialPolicy="none",name}={}){
  const id=randomUUID(),variant=randomUUID(),n=++serial;
  await q("INSERT INTO products(id,public_key,name,status,serial_policy) VALUES($1,$2,$3,'published',$4)",[id,"board-fixture-"+n,name??"Board fixture "+n,serialPolicy]);
  await q("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,$3,'Base',true,'active')",[variant,id,"AFTER-SKU-"+n]);
  await q("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,$3)",[randomUUID(),variant,price]);
  await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[variant,mainId]);
  await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,0,'opening',$5,'synthetic:fixture')",[randomUUID(),variant,mainId,stock,"opening-"+variant]);
  return{id,variant};
}
async function coupon(code){await q("INSERT INTO promotions(id,code,name,kind,percentage_bps,status,usage_limit,scope) VALUES($1,$2,$3,'percentage',1000,'active',50,'all')",[randomUUID(),code,"Coupon "+code]);}

// The test-only sandbox adapter. Refund behaviour is scripted per call; a repeated idempotency key
// returns the same provider refund id, like a real provider.
function sandbox(){
  const signingKey=randomBytes(32),merchant="sandbox-merchant",name="kaspi";
  const sign=raw=>createHmac("sha256",signingKey).update(raw).digest("hex");
  const refundIds=new Map();
  const adapter={
    name,environment:"sandbox",merchantAccount:merchant,simulated:false,refundCalls:[],refundScript:[],
    async startSession(request){const id="sbx-"+createHmac("sha256",signingKey).update(request.idempotencyKey).digest("hex").slice(0,16);return{sessionId:id,redirectUrl:null,provenance:{provider:name,environment:"sandbox",merchantAccount:merchant,simulated:false}};},
    verifySignature(raw,headers){const given=Buffer.from(headers.get("x-test-signature")??"","hex"),want=Buffer.from(sign(Buffer.from(raw)),"hex");return given.length===want.length&&timingSafeEqual(given,want);},
    parseEvent(raw){try{const e=JSON.parse(Buffer.from(raw).toString("utf8"));return{eventId:e.id,kind:e.type,merchantAccount:e.merchant,environment:e.environment,merchantReference:e.reference,sessionId:e.session??null,transactionId:e.transaction??null,amountMinor:String(e.amount),currency:e.currency,occurredAt:e.at??null};}catch{return null;}},
    async lookup(){return{state:"pending"};},
    async refund(request){
      adapter.refundCalls.push(request);
      const step=adapter.refundScript.shift()??"succeeded";
      if(step==="timeout")throw new Error("provider timeout after accepting the refund");
      let id=refundIds.get(request.idempotencyKey);if(!id){id="rf-"+randomUUID();refundIds.set(request.idempotencyKey,id);}
      return{state:step,providerRefundId:step==="failed"?null:id};
    },
    event(attempt){return{id:"evt-"+randomUUID(),type:"captured",merchant,environment:"sandbox",reference:attempt.merchant_reference,session:attempt.provider_session_id,transaction:"txn-"+randomUUID(),amount:attempt.amount,currency:"KZT",at:new Date().toISOString()};},
    signed(event){const raw=Buffer.from(JSON.stringify(event));return{raw,headers:new Headers({"x-test-signature":sign(raw)})};},
  };
  return adapter;
}
async function load(){
  if(aftersales)return;
  const {createCartService}=await import("../../src/server/cart/service.ts");
  carts=createCartService({database,secret,identify:async h=>{try{return await requirePrincipal(runtime,h);}catch(error){if(error.status===401)return null;throw error;}}});
  checkout=await import("../../src/server/checkout/service.ts");
  payments=await import("../../src/server/payments/service.ts");
  provider=sandbox();providers=payments.createPaymentProviders([provider]);
  fulfillment=(await import("../../src/server/fulfillment/service.ts")).createFulfillmentService({pool:database.pool,authorize});
  aftersales=await import("../../src/server/fulfillment/aftersales.ts");
  api=aftersales.createAfterSalesService({pool:database.pool,authorize,providers});
  account=(await import("../../src/server/account/service.ts")).createAccountService({database,authorize:h=>requirePrincipal(runtime,h),secret});
}
async function quoted(headers,lines,extra={}){
  let version=0;for(const [variantId,quantity] of lines)version=(await carts.addLine(headers,{variantId,quantity,expectedCartVersion:version})).cart.version;
  return carts.quote(headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ,...extra});
}
/** A placed live order with a started session, not yet paid. */
async function placedOrder(lines,{couponCode}={}){
  await load();
  const buyer=await owner(),quote=await quoted(buyer.headers,lines,couponCode?{couponCode}:{});
  const result=await checkout.placeOrder(database.pool,secret,{userId:buyer.id,guestTokenHash:null},key(),{quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"kaspi"},{payments:providers});
  const attemptId=(await q("SELECT id FROM payment_attempts WHERE order_id=$1",[result.orderId])).rows[0].id;
  await payments.startPaymentSession(database.pool,providers,attemptId);
  const items=(await q("SELECT id,variant_id FROM order_items WHERE order_id=$1",[result.orderId])).rows;
  return{orderId:result.orderId,buyer,attemptId,item:Object.fromEntries(items.map(row=>[row.variant_id,row.id]))};
}
async function capture(order,extra={}){
  const attempt=(await q("SELECT merchant_reference,provider_session_id,amount_minor::text AS amount FROM payment_attempts WHERE id=$1",[order.attemptId])).rows[0];
  const {raw,headers}=provider.signed({...provider.event(attempt),...extra});
  const receipt=await payments.receiveWebhook(database.pool,providers,"kaspi",raw,headers);
  return payments.processInboxEvent(database.pool,providers,receipt.inboxId);
}
async function paidOrder(lines,options){const order=await placedOrder(lines,options);assert.equal((await capture(order)).outcome,"paid");return order;}
const balance=async variant=>(await q("SELECT on_hand,reserved FROM inventory_balances WHERE variant_id=$1",[variant])).rows[0];
const orderRow=async id=>(await q("SELECT order_status,payment_status,fulfillment_status,version,total_minor::text AS total FROM orders WHERE id=$1",[id])).rows[0];
const version=async id=>(await orderRow(id)).version;
const movements=async(variant,reason)=>(await q("SELECT count(*)::int AS n,COALESCE(sum(delta_on_hand),0)::int AS units FROM stock_movements WHERE variant_id=$1 AND reason=$2",[variant,reason])).rows[0];
const refunds=async orderId=>(await q("SELECT id,status,amount_minor::text AS amount,provider_refund_id FROM refunds WHERE order_id=$1 ORDER BY created_at,id",[orderId])).rows;
const cancel=async(orderId,headers=refunder,extra={})=>api.cancelOrder(headers,{orderId,expectedOrderVersion:await version(orderId),idempotencyKey:key(),reason:"Customer asked",...extra});
async function shipAndDispatch(order,variant,quantity){
  const created=await fulfillment.createShipment(fulfiller,{orderId:order.orderId,expectedOrderVersion:await version(order.orderId),idempotencyKey:key(),lines:[{orderItemId:order.item[variant],quantity}]});
  return fulfillment.updateShipment(fulfiller,{shipmentId:created.shipment.id,expectedVersion:created.shipment.version,idempotencyKey:key(),action:"dispatch"});
}

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"16",DATABASE_CONNECT_TIMEOUT_MS:"10000"}));
  runtime=createAuthFoundation({database,config:parseAuthConfig({AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:baseURL,NODE_ENV:"test"})});
  staffId=randomUUID();await q("INSERT INTO users(id,name,email) VALUES($1,'Synthetic aftersales','aftersales@example.invalid')",[staffId]);
  mainId=randomUUID();await q("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location')",[mainId]);
  const tax=randomUUID(),policy=randomUUID(),zone=randomUUID();
  await q("INSERT INTO tax_configuration(id,version,mode,rate_bps,country_code) VALUES($1,1,'exclusive',1200,'KZ')",[tax]);
  await q("INSERT INTO shipping_policy_versions(id,version) VALUES($1,1)",[policy]);
  await q("INSERT INTO shipping_zones(id,key,name,countries,active) VALUES($1,'zone-board','Zone','[\"KZ\"]'::jsonb,true)",[zone]);
  await q("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'standard',1500)",[randomUUID(),policy,zone]);
  await q("INSERT INTO store_settings(id,active_tax_configuration_id,active_shipping_policy_id) VALUES(1,$1,$2)",[tax,policy]);
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

const watch=()=>product({serialPolicy:"required",name:"Synthetic fēnix "+(serial+1)});
const band=()=>product({serialPolicy:"none",name:"Synthetic QuickFit band "+(serial+1)});
async function pack(orderId,lines,serials,extra={}){return fulfillment.createShipment(fulfiller,{orderId,expectedOrderVersion:await version(orderId),idempotencyKey:key(),lines,...(serials?{serials}:{}),...extra});}
async function act(shipment,action,extra={}){
  const current=(await q("SELECT version FROM shipments WHERE id=$1",[shipment.id])).rows[0].version;
  return fulfillment.updateShipment(fulfiller,{shipmentId:shipment.id,expectedVersion:current,idempotencyKey:key(),action,...extra});
}
const serialRows=async orderId=>(await q("SELECT u.serial,u.serial_key,u.unit_index,u.shipment_item_id FROM order_unit_serials u WHERE u.order_id=$1 ORDER BY u.shipment_item_id,u.unit_index",[orderId])).rows;
const uniq=()=>"SN"+randomUUID().replace(/-/g,"").slice(0,10).toUpperCase();

// ---------------------------------------------------------------- T3.1 pack with serials
test("packing a watch needs its serial; the band in the same order needs none",async()=>{
  const w=await watch(),b=await band();
  const order=await paidOrder([[w.variant,1],[b.variant,1]]);
  const lines=[{orderItemId:order.item[w.variant],quantity:1},{orderItemId:order.item[b.variant],quantity:1}];
  await rejectsWith(pack(order.orderId,lines),409,"SERIALS_REQUIRED");
  await rejectsWith(pack(order.orderId,lines,[{orderItemId:order.item[w.variant],units:[]}]),409,"SERIALS_REQUIRED");
  const sn=uniq();
  const packed=await pack(order.orderId,lines,[{orderItemId:order.item[w.variant],units:[sn]}]);
  assert.equal(packed.shipment.status,"ready");
  assert.deepEqual((await serialRows(order.orderId)).map(row=>[row.serial,row.unit_index]),[[sn,1]]);
  assert.equal((await orderRow(order.orderId)).fulfillment_status,"processing");
});

test("serials for an item that is not in the shipment, or more serials than units, are refused",async()=>{
  const w=await watch(),b=await band();
  const order=await paidOrder([[w.variant,1],[b.variant,1]]);
  await rejectsWith(pack(order.orderId,[{orderItemId:order.item[w.variant],quantity:1}],[{orderItemId:order.item[w.variant],units:[uniq()]},{orderItemId:order.item[b.variant],units:[uniq()]}]),400,"INVALID_INPUT");
  await rejectsWith(pack(order.orderId,[{orderItemId:order.item[w.variant],quantity:1}],[{orderItemId:order.item[w.variant],units:[uniq(),uniq()]}]),400,"INVALID_INPUT");
});

test("two units of one watch get serials 1 and 2 on the shipment line",async()=>{
  const w=await watch();
  const order=await paidOrder([[w.variant,2]]);
  const [s1,s2]=[uniq(),uniq()];
  await pack(order.orderId,[{orderItemId:order.item[w.variant],quantity:2}],[{orderItemId:order.item[w.variant],units:[s1,s2]}]);
  assert.deepEqual((await serialRows(order.orderId)).map(row=>[row.serial,row.unit_index]),[[s1,1],[s2,2]]);
});

test("packing tells the customer once, even when the request is replayed",async()=>{
  const b=await band();
  const order=await paidOrder([[b.variant,1]]);
  const command={orderId:order.orderId,expectedOrderVersion:await version(order.orderId),idempotencyKey:key(),lines:[{orderItemId:order.item[b.variant],quantity:1}]};
  const first=await fulfillment.createShipment(fulfiller,command);
  const again=await fulfillment.createShipment(fulfiller,command);
  assert.equal(again.replayed,true);assert.equal(again.shipment.id,first.shipment.id);
  const events=(await q("SELECT type,visibility FROM order_events WHERE order_id=$1 AND type='fulfillment.packed'",[order.orderId])).rows;
  assert.deepEqual(events,[{type:"fulfillment.packed",visibility:"customer"}]);
});
