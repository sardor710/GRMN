// Task 4.2: pure helpers of the PostgreSQL admin dashboard. Real money is "live" only; demo and
// sandbox stay apart and are never summed into it. Money is BigInt-safe minor units in strings.
import assert from "node:assert/strict";
import {test} from "node:test";
import {splitTotals,formatMinor,dailyRevenue,dateRange,seriesTotal,niceMax,axisLabel,currenciesOf,statusRows,ORDER_STATUS_LABELS} from "../../src/lib/admin/dashboard.ts";

const total=(environment,currency,captured,refunded,orders=1)=>({currency,environment,capturedMinor:captured,refundedMinor:refunded,netMinor:(BigInt(captured)-BigInt(refunded)).toString(),ordersPaid:orders});

test("splitTotals keeps live, demo and sandbox apart and never sums across them or across currencies",()=>{
  const split=splitTotals([total("demo","KZT","100000","0"),total("live","KZT","841500","1500",2),total("sandbox","KZT","5000","0"),total("live","USD","1000","0")]);
  assert.deepEqual(split.real,[{currency:"KZT",capturedMinor:"841500",refundedMinor:"1500",netMinor:"840000",ordersPaid:2},{currency:"USD",capturedMinor:"1000",refundedMinor:"0",netMinor:"1000",ordersPaid:1}]);
  assert.deepEqual(split.demo,[{currency:"KZT",capturedMinor:"100000",refundedMinor:"0",netMinor:"100000",ordersPaid:1}]);
  assert.deepEqual(split.sandbox.map(line=>line.netMinor),["5000"]);
});

test("splitTotals with only demo revenue leaves real revenue empty",()=>{
  const split=splitTotals([total("demo","KZT","100000","0")]);
  assert.deepEqual(split.real,[]);assert.equal(split.demo[0].netMinor,"100000");
});

test("splitTotals sums beyond Number precision exactly",()=>{
  const big="9007199254740993";// 2^53 + 1
  const split=splitTotals([total("live","KZT",big,"0"),total("live","KZT",big,"0")]);
  assert.equal(split.real[0].netMinor,"18014398509481986");
});

test("formatMinor groups thousands, keeps cents and sign, and is exact for huge minor strings",()=>{
  assert.equal(formatMinor("0","KZT"),"0.00 KZT");
  assert.equal(formatMinor("841500","KZT"),"8,415.00 KZT");
  assert.equal(formatMinor("5","KZT"),"0.05 KZT");
  assert.equal(formatMinor("-1550","KZT"),"-15.50 KZT");
  assert.equal(formatMinor("123456789012345678901","KZT"),"1,234,567,890,123,456,789.01 KZT");
  assert.throws(()=>formatMinor("1.5","KZT"),RangeError);
  assert.throws(()=>formatMinor("abc","KZT"),RangeError);
});

test("dailyRevenue fills every day of the range and keeps real and demo as separate series",()=>{
  const days=[
    {date:"2026-11-02",currency:"KZT",environment:"live",capturedMinor:"500",refundedMinor:"0",netMinor:"500"},
    {date:"2026-11-02",currency:"KZT",environment:"demo",capturedMinor:"700",refundedMinor:"0",netMinor:"700"},
    {date:"2026-11-03",currency:"KZT",environment:"sandbox",capturedMinor:"900",refundedMinor:"0",netMinor:"900"},
    {date:"2026-11-03",currency:"USD",environment:"live",capturedMinor:"300",refundedMinor:"0",netMinor:"300"},
  ];
  const points=dailyRevenue(days,"2026-11-01","2026-11-03","KZT");
  assert.deepEqual(points,[{date:"2026-11-01",realMinor:"0",demoMinor:"0"},{date:"2026-11-02",realMinor:"500",demoMinor:"700"},{date:"2026-11-03",realMinor:"0",demoMinor:"0"}]);
  assert.equal(seriesTotal(points,"real"),"500");assert.equal(seriesTotal(points,"demo"),"700");
});

test("dateRange crosses month ends and DST-free UTC days",()=>{
  assert.deepEqual(dateRange("2026-02-27","2026-03-02"),["2026-02-27","2026-02-28","2026-03-01","2026-03-02"]);
  assert.deepEqual(dateRange("2026-03-02","2026-03-01"),[]);
});

test("axis helpers give clean maxima and compact labels",()=>{
  assert.equal(niceMax(0),1);assert.equal(niceMax(8415),10000);assert.equal(niceMax(1000),1000);assert.equal(niceMax(2100),2500);
  assert.equal(axisLabel(5000),"5,000");assert.equal(axisLabel(10000),"10K");assert.equal(axisLabel(2500000),"2.5M");assert.equal(axisLabel(-20000),"-20K");
});

test("currenciesOf puts KZT first; statusRows orders known statuses and drops zeros",()=>{
  assert.deepEqual(currenciesOf([total("live","USD","1","0")],[{date:"2026-11-01",currency:"KZT",environment:"demo",capturedMinor:"1",refundedMinor:"0",netMinor:"1"}]),["KZT","USD"]);
  assert.deepEqual(statusRows({confirmed:2,pending_payment:1,cancelled:0,mystery_state:3},ORDER_STATUS_LABELS),[
    {status:"pending_payment",label:"Awaiting payment",count:1},{status:"confirmed",label:"Confirmed",count:2},{status:"mystery_state",label:"mystery state",count:3}]);
});
