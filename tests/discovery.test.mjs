import assert from "node:assert/strict";
import test from "node:test";
import {areaQuery,listingRows,searchArea} from "../pages/discovery.mjs";

test("Area search scopes city, ZIP and southwest Missouri to Missouri",()=>{
  assert.match(areaQuery("Springfield, MO"),/CITY = 'SPRINGFIELD'/);
  assert.match(areaQuery("65613"),/DISPLAY_ZIP_CODE = 65613/);
  assert.match(areaQuery("Southwest Missouri"),/CITY IN .*'PLEASANT HOPE'/);
  assert.throws(()=>areaQuery("10000; SELECT *"));
  assert.match(areaQuery("O'Fallon"),/O''FALLON/);
});
test("Historical records retain case, ZIP and acquisition date and are deduplicated",()=>{
  const a={CASE_NUM:"case-test",CITY:"Example",ADDRESS:" Test Rd ",DISPLAY_ZIP_CODE:65613,DATE_ACQUIRED:0};
  const rows=listingRows({features:[{attributes:a},{attributes:a},{attributes:{}}]});
  assert.deepEqual(rows,[{address:"Test Rd",city:"Example",zip:"65613",caseNumber:"case-test",acquired:"1970-01-01"}]);
  assert.throws(()=>listingRows({error:{}}));
});
test("A source outage remains distinct from a successful zero-result search",async()=>{
  const response=body=>({ok:true,json:async()=>body});
  const request=async url=>String(url).endsWith(".json") ? response({"65613":[]}) : {ok:false,status:503};
  const result=await searchArea("65613",undefined,request);
  assert.equal(result.properties.status,"rejected");
  assert.equal(result.rents.status,"fulfilled");
  const empty=await searchArea("65613",undefined,async url=>response(String(url).endsWith(".json")?{}:{features:[]}));
  assert.deepEqual(empty.properties.value,{rows:[],more:false});
});

test("Free listing links respect ZIP and city scope with a statewide fallback",async()=>{
  const {listingSources}=await import("../pages/sources.mjs");
  const general=area=>listingSources(area)[0][1].map(([,url])=>url);
  assert.equal(general("Springfield, MO")[0],"https://www.zillow.com/springfield-mo/");
  assert.equal(general("Springfield, MO")[1],"https://www.realtor.com/realestateandhomes-search/springfield_MO");
  assert.equal(general("65802")[2],"https://www.redfin.com/zipcode/65802");
  assert.equal(general("Southwest Missouri")[0],"https://www.zillow.com/mo/");
});
