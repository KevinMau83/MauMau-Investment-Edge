import assert from "node:assert/strict";
import test from "node:test";
import {analyze, groups, payment} from "../pages/model.mjs";

const inputs = Object.fromEntries(groups.flatMap(([, fields]) =>
  fields.map(([key,,type,value])=>[key,value == null ? null : type==="pct" ? value/100 : value])));
const example = {...inputs,price:100000,rehab:10000,closing:2000,arv:175000,asIs:125000,rent:1800,
  tax:100,insurance:80,loan:80000,rate:.06,flipLoan:70000,flipRate:.12,heloc:10000,helocRate:.06,
  fees:1000,holding:120,selling:.06,disposition:1000,refiFees:2500,seasoning:9};
const find = (card,label)=>card.rows.find(row=>row.label===label).value;
const close = (actual, expected)=>assert.ok(Math.abs(actual-expected)<.00001,[actual,expected]);

test("Rental, flip and refinance reproduce the documented reference deal",()=>{
  const [rental,flip,brrrr]=analyze(example);
  close(find(rental,"Monthly cash flow"),742.5595799);
  close(find(flip,"Net profit before income tax"),43200);
  close(find(flip,"Maximum offer at target profit"),118200);
  close(find(flip,"Profit after 12 months"),36900);
  close(find(brrrr,"Capital remaining after refinance"),3450);
  close(find(brrrr,"Capital remaining at 10% lower appraisal"),15700);
});

test("Missing rent and excessive rental financing leave flip independent",()=>{
  const [rental,flip,brrrr]=analyze({...example,rent:null,loan:1000000});
  assert.equal(rental.rows,undefined);
  assert.ok(flip.rows);
  assert.equal(brrrr.rows,undefined);
});

test("Zero values and invalid assumptions",()=>{
  assert.equal(payment(12000,0,12),1000);
  const [rental]=analyze({...inputs,price:0,rehab:0,rent:0});
  assert.equal(find(rental,"Monthly cash flow"),0);
  assert.equal(find(rental,"DSCR"),null);
  assert.throws(()=>analyze({...example,rehab:null}));
  assert.throws(()=>analyze({...example,selling:1}));
  assert.throws(()=>analyze({...example,management:.9,maintenance:.1}));
});
