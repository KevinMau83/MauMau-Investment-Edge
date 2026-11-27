export const money = new Intl.NumberFormat("en-US", {style:"currency",currency:"USD", maximumFractionDigits:0});
const percent = new Intl.NumberFormat("en-US", {style:"percent", maximumFractionDigits:1});
export const format = (value, type = "money") => value == null ? "—" :
  type === "pct" ? percent.format(value) : type === "ratio" ? value.toFixed(2)+"×" : type === "count" ? String(value) : money.format(value);

export const groups = [
  ["Property and purchase", [
    ["property","Property address or label","text"],["price","Purchase price","money"],
    ["closing","Purchase closing costs","money",0],["rehab","Rehab estimate","money"],
    ["contingency","Rehab contingency","pct",10],["arv","Expected resale / stabilized value","money"],
    ["asIs","As-is value","money"],
  ]],
  ["Rental and operating assumptions", [
    ["rent","Expected monthly rent","money"],["tax","Monthly property tax","money",0],
    ["insurance","Monthly insurance","money",0],["utilities","Monthly owner-paid utilities","money",0],
    ["hoa","Monthly HOA","money",0],["other","Other monthly operating expenses","money",0],
    ["loan","Rental loan principal","money",0],["rate","Rental interest rate","pct",7],
    ["term","Rental term in months","count",360],["vacancy","Vacancy allowance","pct",5],
    ["management","Property management allowance","pct",8],["maintenance","Maintenance allowance","pct",5],
    ["capex","Capital expenditure reserve","pct",5],
  ]],
  ["Flip and acquisition financing", [
    ["months","Hold period in months","count",6],["flipLoan","Acquisition loan principal","money",0],
    ["flipRate","Acquisition loan rate","pct",10],["fees","Loan origination fees","money",0],
    ["heloc","HELOC principal","money",0],["helocRate","HELOC rate","pct",9],
    ["holding","Additional monthly holding costs","money",0],["selling","Variable selling costs","pct",7],
    ["disposition","Fixed disposition costs","money",0],["targetProfit","Target flip profit","money",25000],
  ]],
  ["BRRRR refinance", [
    ["ltv","Refinance loan-to-value","pct",70],["refiRate","Refinance interest rate","pct",7.5],
    ["refiTerm","Refinance term in months","count",360],["refiFees","Refinance costs","money",0],
    ["seasoning","Seasoning in months","count",6],
  ]],
];

export function payment(principal, rate, term) {
  const monthly = rate / 12;
  return monthly ? principal * monthly / -Math.expm1(-term * Math.log1p(monthly)) : principal / term;
}
const ratio = (a,b) => b > 0 ? a/b : null;
const metric = (label, value, type) => ({label, value, type});

export function analyze(i) {
  if (i.price == null || i.rehab == null) throw new Error("Enter the purchase price and rehabilitation estimate.");
  if (i.rent == null && !(i.arv > 0)) throw new Error("Enter expected rent or a positive resale value to compare a strategy.");
  if (i.selling >= 1 || i.management+i.maintenance+i.capex >= 1) throw new Error("Selling costs and combined management, maintenance and reserves must be below 100%.");
  const cost = i.price+i.closing+i.rehab*(1+i.contingency);
  const fixed = i.tax+i.insurance+i.utilities+i.hoa+i.other;
  const carry = fixed+i.holding+(i.flipLoan*i.flipRate+i.heloc*i.helocRate)/12;
  const borrowed = i.flipLoan+i.heloc;
  const holdCost = months => cost+i.fees+months*carry;
  const cards = [];

  function rentModel(loan, rate, term, cash, basis, equity) {
    const effective = i.rent*(1-i.vacancy);
    const noi = effective*(1-i.management-i.maintenance)-fixed;
    const debt = payment(loan,rate,term);
    const flow = noi-effective*i.capex-debt;
    const rentStress = flow-effective*.10*(1-i.management-i.maintenance-i.capex);
    return [
      metric("Monthly cash flow",flow),metric("Annual cash flow",flow*12),metric("Monthly NOI",noi),
      metric("Monthly debt service",debt),metric("Cash-on-cash return",ratio(flow*12,cash),"pct"),
      metric("Cap rate",ratio(noi*12,basis),"pct"),metric("DSCR",ratio(noi,debt),"ratio"),
      metric("Equity",equity),metric("Monthly cash flow with rent down 10%",rentStress),
    ];
  }

  if (i.rent != null && i.loan <= cost) {
    const cash = cost-i.loan;
    cards.push({name:"Buy and Hold",rows:[
      ...rentModel(i.loan,i.rate,i.term,cash,cost,i.asIs == null ? null : i.asIs-i.loan),
      metric("Initial cash invested",cash),
    ]});
  } else {
    cards.push({name:"Buy and Hold",note:i.rent == null ? "Enter an expected rent." : "Rental loan principal exceeds the modeled cost."});
  }

  if (i.arv > 0 && borrowed <= cost) {
    const saleNet = i.arv*(1-i.selling)-i.disposition;
    const project = holdCost(i.months);
    const profit = saleNet-project;
    const total = project+i.arv*i.selling+i.disposition;
    const maximum = Math.max(0,saleNet-(project-i.price)-i.targetProfit);
    cards.push({name:"Fix and Flip",rows:[
      metric("Net profit before income tax",profit),metric("Total cost including sale",total),
      metric("Return on total cost",ratio(profit,total),"pct"),metric("Return on invested cash",ratio(profit,project-borrowed),"pct"),
      metric("Break-even sale price",(project+i.disposition)/(1-i.selling)),
      metric("Maximum offer at target profit",maximum),metric("Opening offer at 5% below maximum",maximum*.95),
      metric("Profit with resale down 10%",profit-i.arv*.10*(1-i.selling)),
      ...[3,6,9,12].map(months => metric("Profit after "+months+" months",saleNet-holdCost(months))),
    ]});
  } else {
    cards.push({name:"Fix and Flip",note:i.arv > 0 ? "Acquisition loan and HELOC exceed the modeled cost." : "Enter a positive expected resale value."});
  }

  if (i.rent != null && i.arv > 0 && borrowed <= cost) {
    const total = holdCost(Math.max(i.months,i.seasoning));
    const principal = i.arv*i.ltv;
    const recovered = principal-borrowed-i.refiFees;
    const remaining = total-borrowed-recovered;
    cards.push({name:"BRRRR",note:"Refinance terms and approval are assumptions.",rows:[
      metric("Capital remaining after refinance",remaining),metric("Initial cash requirement",total-borrowed),
      metric("Refinance proceeds",principal),metric("Existing debt payoff",borrowed),metric("Capital recovered",recovered),
      metric("Capital remaining at 10% lower appraisal",remaining+principal*.10),
      ...rentModel(principal,i.refiRate,i.refiTerm,remaining,total,i.arv-principal),
    ]});
  } else {
    cards.push({name:"BRRRR",note:i.rent == null || !(i.arv > 0) ? "Enter expected rent and a positive stabilized value." : "Acquisition loan and HELOC exceed the modeled cost."});
  }
  return cards;
}
