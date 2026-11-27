"use strict";

const main = document.querySelector("#main");
const strategies = {hold:"Buy and Hold", brrrr:"BRRRR", flip:"Fix and Flip", wholesale:"Wholesale or Assignment"};
const pages = {dashboard:"Overview", properties:"Properties", boards:"Opportunity boards", watchlist:"Watchlist", calculator:"Underwriting", planner:"Income planner", reports:"Reports", settings:"Criteria", property:"Property analysis", edit:"Property editor"};
const reportTitle = "MAUMAU PROPERTIES<br>INVESTMENT EDGE<br>REAL ESTATE ACQUISITION INTELLIGENCE";
const money = new Intl.NumberFormat("en-US", {style:"currency", currency:"USD", maximumFractionDigits:0});
const fmt = (value, type = "money") => value == null ? "—" : type === "pct" ? new Intl.NumberFormat("en-US", {style:"percent", maximumFractionDigits:1}).format(value) : type === "ratio" ? value.toFixed(2) + "×" : type === "number" ? String(value) : money.format(value);
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const link = (url, title) => url ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(title)}</a>` : "";
const human = key => key.replaceAll("_", " ").replace(/^./, c => c.toUpperCase()).replace(/\bcoc\b/i,"cash-on-cash return").replace(/\bdscr\b/i,"DSCR");
let state, calculator = {}, planner = {}, filter = {}, displayedPage = "", noticeTimer;

async function api(url, method = "GET", data) {
  const response = await fetch(url, {method, ...(data === undefined ? {} : {
    headers: {"Content-Type":"application/json"}, body:JSON.stringify(data)
  })});
  if (!response.ok) {
    let message = "The request could not be completed.";
    if (response.headers.get("Content-Type")?.includes("application/json")) message = (await response.json()).error || message;
    throw new Error(message);
  }
  return response.json();
}
function notify(message) {
  const notice = document.querySelector("#notice");
  notice.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.textContent = "", 5500);
}
function heading(title, subtitle = "") {
  return `<header><h1>${escape(title)}</h1>${subtitle ? `<p>${escape(subtitle)}</p>` : ""}</header>`;
}
function tile(label, value) {
  return `<div class="tile"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`;
}
function empty(message) { return `<p class="empty">${escape(message)}</p>`; }
function numeric(key, label, value, percent = false, extra = "") {
  return `<label class="field">${escape(label)}<input type="number" name="${escape(key)}" step="any" value="${escape(value == null ? "" : percent ? +(value * 100).toFixed(8) : value)}" ${extra}></label>`;
}
function textField(key, label, value, type = "text", extra = "") {
  return `<label class="field">${escape(label)}<input name="${escape(key)}" type="${type}" value="${escape(value)}" ${extra}></label>`;
}
function select(key, label, values, current) {
  return `<label class="field">${escape(label)}<select name="${escape(key)}">${values.map(value => `<option ${value === current ? "selected" : ""} value="${escape(value)}">${escape(value || "Any")}</option>`).join("")}</select></label>`;
}
function details(title, body, open = false) {
  return `<details class="edit" ${open ? "open" : ""}><summary>${escape(title)}</summary>${body}</details>`;
}
function check(key, label, value) {
  return `<label><input type="checkbox" name="${escape(key)}" ${value ? "checked" : ""}> ${escape(label)}</label>`;
}
function metrics(rows) {
  return `<dl class="metrics">${rows.map(([label, value, type]) => `<dt>${escape(label)}</dt><dd>${escape(fmt(value,type))}</dd>`).join("")}</dl>`;
}
function live() { return state.properties.filter(item => !item.demo); }
function propertyLink(item) { return `<a href="#property/${item.id}">${escape(item.address)}</a>`; }
function classification(score) {
  return score >= 90 ? "Exceptional" : score >= 80 ? "High priority" : score >= 70 ? "Worth pursuing" : score >= 60 ? "Monitor or negotiate" : "Generally pass";
}
function ranked(key) {
  return live().filter(item => item.scores[key] != null && item.source_url && item.verified && item.gates.valuation)
    .sort((a,b) => Number(!b.analysis.qualification[key].length) - Number(!a.analysis.qualification[key].length) || b.scores[key] - a.scores[key])
    .slice(0,10);
}
function propertyCard(item, strategy) {
  const label = strategy ? (item.analysis.qualification[strategy].length ? "Research" : "Gates cleared") : item.analysis.recommended ? strategies[item.analysis.recommended] : "Research";
  return `<article class="card">
    ${item.photo ? `<img loading="lazy" src="${escape(item.photo)}" alt="Owner-authorized image for ${escape(item.address)}">` : ""}
    <h3>${propertyLink(item)}</h3><p class="small">${escape([item.city,item.county,item.zip].filter(Boolean).join(" · "))}</p>
    ${metrics([["Asking price",item.ask],["Monthly rental cash flow",item.analysis.hold?.cash_flow]])}
    <span class="tag">${escape(item.demo ? "Illustrative demo" : label)}</span>
    <p class="small entry">${escape(item.confidence)} ${item.verified ? "· " + escape(item.verified) : ""} ${link(item.source_url,item.source || "Source")}</p>
    ${strategy ? `<p class="small">${item.scores[strategy]}/100 · ${classification(item.scores[strategy])}<br>${escape(item.analysis.qualification[strategy][0] || "Owner review and acquisition decision")}</p>` : ""}
  </article>`;
}
function map() {
  const points = live().filter(item => item.latitude != null && item.longitude != null);
  if (!points.length) return empty("Add coordinates to a property to display it on the market map.");
  const center = {latitude:37.466,longitude:-93.272};
  const bounds = [...points,center];
  const minLat=Math.min(...bounds.map(p=>p.latitude)), maxLat=Math.max(...bounds.map(p=>p.latitude));
  const minLon=Math.min(...bounds.map(p=>p.longitude)), maxLon=Math.max(...bounds.map(p=>p.longitude));
  const x = p => 27 + (p.longitude - minLon + .02) / (maxLon - minLon + .04) * 345;
  const y = p => 196 - (p.latitude - minLat + .02) / (maxLat - minLat + .04) * 166;
  return `<svg class="map" viewBox="0 0 400 220" aria-label="Coordinate map referenced to Pleasant Hope">
    ${[70,130,190,250,310].map(v=>`<line x1="${v}" y1="15" x2="${v}" y2="205"/>`).join("")}
    ${[50,90,130,170].map(v=>`<line x1="15" y1="${v}" x2="385" y2="${v}"/>`).join("")}
    <text x="18" y="29">N ↑</text><text x="18" y="207">Reference · Pleasant Hope, MO</text>
    ${points.map(p=>`<a href="#property/${p.id}" aria-label="${escape(p.address)}"><circle cx="${x(p)}" cy="${y(p)}" r="5"><title>${escape(p.address)}</title></circle></a>`).join("")}
  </svg>`;
}
function dashboard() {
  const entries = live(), watch = entries.filter(item=>item.watch);
  const ready = entries.filter(item=>item.analysis.recommended);
  const alerts = state.changes.filter(item=>item.alert);
  return `<section class="hero"><span class="eyebrow">MauMau Properties · Southwest Missouri</span>
    <h1>Investment Edge</h1><p>Research acquisitions, compare strategies and build lasting rental income.</p>
    <div class="actions"><a class="button" href="#boards">Review opportunities</a></div></section>
    <div class="tiles">${tile("Tracked properties",entries.length)}${tile("Watchlist",watch.length)}
    ${tile("Gates cleared",ready.length)}${tile("Price and status alerts",alerts.length)}</div>
    <div class="cols section">
      <section class="card"><div class="section-head"><h2>Rental opportunities</h2><a href="#boards">All boards</a></div>
      ${ranked("hold").slice(0,4).map(item=>`<div class="row">${propertyLink(item)}<strong>${fmt(item.analysis.hold.cash_flow)}/mo</strong></div>`).join("") || empty("Rental candidates appear here once a dated source and valuation evidence are recorded.")}</section>
      <section class="card"><h2>Market map</h2>${map()}<p class="small">Pleasant Hope, Missouri · ${state.settings.drive_minutes}-minute target</p></section>
    </div>
    <div class="grid section">
      <section class="card"><h2>Recent intelligence</h2>${activity(state.changes.slice(0,6))}</section>
      <section class="card"><h2>Owner review</h2>
      ${entries.filter(item=>!item.analysis.recommended).slice(0,5).map(item=>`<div class="row">${propertyLink(item)}<span class="tag">Research</span></div>`).join("") || empty("No properties awaiting review.")}
      </section>
    </div>
    <div class="grid section">
      ${["brrrr","flip"].map(key=>`<section class="card"><h2>${strategies[key]} opportunities</h2>
        ${ranked(key).slice(0,4).map(item=>`<div class="row">${propertyLink(item)}<strong>${key==="brrrr" ? fmt(item.analysis.brrrr.cash_flow)+"/mo" : fmt(item.analysis.flip.profit)+" profit"}</strong></div>`).join("") || empty("No evidence-qualified candidates.")}
      </section>`).join("")}
      <section class="card"><h2>Significant price reductions</h2>${activity(alerts.filter(item=>item.label.startsWith("Price reduced")).slice(0,5))}</section>
      <section class="card"><h2>Exceptional opportunities</h2>
        ${ready.filter(item=>item.scores[item.analysis.recommended]>=90).slice(0,5).map(item=>`<div class="row">${propertyLink(item)}<strong>${item.scores[item.analysis.recommended]}/100</strong></div>`).join("") || empty("No exceptional opportunities with gates cleared.")}
      </section>
    </div>`;
}
function activity(items) {
  return items.map(item=>`<div class="row"><div><a href="#property/${item.id}">${escape(item.address)}</a><br><small>${escape(item.label)}</small></div><small>${escape(item.at.slice(0,10))}</small></div>`).join("") || empty("No recorded developments.");
}
function propertyList(watch) {
  const available = state.properties.filter(p=>!watch || p.watch);
  const showDemo = filter.dataset === "Illustrative";
  const records = available.filter(p => p.demo === showDemo
    && (!filter.query || [p.address,p.city,p.parcel,p.notes].some(v=>v?.toLowerCase().includes(filter.query.toLowerCase())))
    && (!filter.city || p.city === filter.city) && (!filter.county || p.county === filter.county)
    && (!filter.zip || p.zip === filter.zip)
    && (!filter.drive || (p.drive != null && p.drive <= Number(filter.drive)))
    && (!filter.distance || (p.distance != null && p.distance <= Number(filter.distance))));
  const sort = {"Highest rent cash flow":(a,b)=>(b.analysis.hold?.cash_flow ?? -Infinity)-(a.analysis.hold?.cash_flow ?? -Infinity),
    "Lowest asking price":(a,b)=>(a.ask ?? Infinity)-(b.ask ?? Infinity)}[filter.sort];
  if (sort) records.sort(sort);
  return heading(watch ? "Watchlist" : "Properties",showDemo ? "Illustrative records are excluded from live boards, alerts and exports." : "Track property history, evidence and underwriting in one place.")
    + `<form id="filter" class="card fields filters no-print">
      ${textField("query","Search",filter.query,"search")}
      ${select("city","City",["", ...new Set([...state.markets,...available.map(p=>p.city)])],filter.city)}
      ${select("county","County",["","Polk","Greene","Dallas","Webster",...new Set(available.map(p=>p.county).filter(c=>c && !["Polk","Greene","Dallas","Webster"].includes(c)))],filter.county)}
      ${textField("zip","ZIP code",filter.zip)}${numeric("drive","Max drive minutes",filter.drive,false,`min="0" placeholder="${state.settings.drive_minutes}"`)}
      ${numeric("distance","Max miles",filter.distance,false,'min="0"')}
      ${select("sort","Sort",["Newest","Highest rent cash flow","Lowest asking price"],filter.sort)}
      ${select("dataset","Dataset",["Live research","Illustrative"],filter.dataset)}
      <div class="actions wide"><button class="primary">Apply filters</button><button type="button" data-action="reset">Reset</button></div></form>
      <div class="grid">${records.map(item=>propertyCard(item)).join("") || empty("No matching properties. Add a record or adjust the filters.")}</div>`;
}
function boards() {
  const emerging = live().filter(p=>p.source_url && p.verified && (p.motivation_score > 0 || p.deadline || state.changes.some(c=>c.id===p.id && c.alert)))
    .sort((a,b)=>b.motivation_score-a.motivation_score).slice(0,10);
  return heading("Opportunity boards","Rankings require dated source evidence. Check each candidate’s unresolved qualification gates.")
    + [["hold",ranked("hold")],["brrrr",ranked("brrrr")],["flip",ranked("flip")],["emerging",emerging]].map(([key,items])=>
      `<section class="section"><h2>${strategies[key] || "Emerging opportunities"}</h2><div class="grid">${items.map(item=>propertyCard(item,key==="emerging" ? null : key)).join("") || empty("No candidates currently meet the board’s evidence requirements.")}</div></section>`).join("");
}
const inputGroups = [
  ["Acquisition and renovation",["price","closing","rehab","contingency","as_is","arv"]],
  ["Rental operations and financing",["rent","tax","insurance","utilities","hoa","other","loan","rate","term"]],
  ["Flip financing and disposition",["months","flip_loan","flip_rate","fees","heloc","heloc_rate","holding","selling","disposition"]],
  ["Refinance assumptions",["refi_ltv","refi_rate","refi_term","refi_fees","seasoning"]],
  ["Assignment assumptions",["assignment","assignment_cost"]],
];
function inputControls(inputs) {
  return inputGroups.map(([title,keys],idx)=>details(title,`<div class="fields">${keys.map(key=>{
    const [label, fallback] = state.schema.inputs[key];
    return numeric("i_"+key,label,Object.hasOwn(inputs,key) ? inputs[key] : fallback,state.schema.rates.includes(key),'min="0"');
  }).join("")}</div>`,idx===0)).join("");
}
function evidenceEntry(kind, row = {}) {
  const field = (key,label,type="text",extra="")=>textField(key,label,row[key],type,extra);
  const num = (key,label)=>numeric(key,label,row[key],false,'min="0"');
  const controls = kind === "rehab" ?
    select("system","Component",state.schema.rehab,row.system) +
    select("basis","Evidence basis",["Visible","Suspected","Assumed","Inspection required"],row.basis) +
    num("low","Low") + num("expected","Expected") + num("high","High") + field("note","Observation") :
    field("address","Comparable address") +
    select("kind","Evidence type",["Verified closed sale","Asking sale","Assessed value","Automated estimate","Unverified sale","Verified rent","Asking rent"],row.kind) +
    field("date","Evidence date","date") + num("amount","Price or monthly rent") + num("sqft","Square feet") +
    field("condition","Condition") + field("differences","Location and differences") + field("url","Source URL","url");
  return `<div class="card fields entry" data-kind="${kind}">${controls}<div class="actions wide"><button type="button" data-action="remove-entry">Remove item</button></div></div>`;
}
function editor(item) {
  const p = item || {};
  const location = ["address","city","county","zip","parcel"];
  const listing = ["status","type","occupancy","agent","contact","acquisition","deadline"];
  const figures = {ask:"Current asking price",original:"Original asking price",dom:"Days on market",reductions_count:"Price reductions",beds:"Bedrooms",baths:"Bathrooms",
    sqft:"Square feet",lot:"Lot size (sq ft)",year:"Year built",latitude:"Latitude",longitude:"Longitude",drive:"Drive minutes from Pleasant Hope",distance:"Miles from Pleasant Hope",existing_rent:"Existing monthly rent"};
  return heading(item ? "Edit property" : "Add a property", "Record the source and keep listing facts separate from underwriting assumptions.")
    + `<form id="property-form">
      <div class="card fields">${location.map(k=>textField(k,human(k),p[k],"text",["address","city"].includes(k) ? "required" : "")).join("")}
      ${select("confidence","Evidence status",["unverified","user-entered","estimated","verified","illustrative"],p.confidence)}
      <div class="checks wide">${check("watch","Add to watchlist",p.watch)}${check("demo","Illustrative demonstration record",p.demo)}</div></div>
      ${details("Listing facts and source",`<div class="fields">${listing.map(k=>textField(k,human(k),p[k],k==="deadline"?"date":"text")).join("")}
      ${Object.entries(figures).map(([k,label])=>numeric(k,label,p[k])).join("")}
      ${textField("source","Source name",p.source)}${textField("source_url","Source URL",p.source_url,"url")}
      ${textField("verified","Verified or retrieved date",p.verified,"date")}${textField("photo","Authorized photo URL",p.photo,"url")}
      <label class="field wide">Listing description<textarea name="description" rows="3">${escape(p.description)}</textarea></label>
      <label class="field wide">Owner notes<textarea name="notes" rows="3">${escape(p.notes)}</textarea></label></div>`,true)}
      ${inputControls(p.inputs || {})}
      ${details("Valuation evidence",`<p class="small">Missouri is a nondisclosure state. Preserve the evidence type for every comparable.</p><div class="fields">
      ${numeric("low_arv","Conservative ARV",p.low_arv)}${numeric("high_arv","Optimistic ARV",p.high_arv)}
      ${numeric("low_rent","Conservative monthly rent",p.low_rent)}${numeric("high_rent","Optimistic monthly rent",p.high_rent)}</div>
      <div id="comps-entries">${(p.comps || []).map(row=>evidenceEntry("comps",row)).join("")}</div><button type="button" data-action="add-comps">Add comparable</button>`)}
      ${details("Rehabilitation evidence",`<p class="small">Use inspection findings and observed conditions to support ranges. An image is insufficient for an inspection.</p>
      <div id="rehab-entries">${(p.rehab || []).map(row=>evidenceEntry("rehab",row)).join("")}</div><button type="button" data-action="add-rehab">Add rehab item</button>`)}
      ${details("Seller motivation evidence",`<div class="checks">${Object.entries(state.schema.motivation).map(([k,w])=>check("m_"+k,human(k)+" ("+w+")",p.motivation?.[k])).join("")}</div>`)}
      ${details("Owner qualification review",`<div class="checks">${Object.entries(state.schema.gates).map(([k,label])=>check("g_"+k,label,p.gates?.[k])).join("")}</div>`)}
      <div class="actions"><button class="primary">Save property</button><a class="button" href="${item ? "#property/"+item.id : "#properties"}">Cancel</a></div>
    </form>`;
}
const rentalRows = [
  ["Gross monthly rent","gross"],["Effective monthly rent","effective"],["Monthly operating expenses","expenses"],
  ["Monthly NOI","noi"],["Monthly capital reserves","reserve"],["Monthly debt service","debt"],["Monthly cash flow","cash_flow"],
  ["Annual cash flow","annual"],["Cash-on-cash return","coc","pct"],["Capitalization rate","cap","pct"],["DSCR","dscr","ratio"],
  ["Break-even occupancy","break_even","pct"],["Equity","equity"],["First-year principal reduction","principal"],["Gross rental yield","yield_","pct"],
];
const strategyRows = {
  hold:[...rentalRows,["Cash invested","cash"]],
  brrrr:[["Total initial project cost","total"],["Initial cash required","initial_cash"],["Appraised value assumption","value"],
    ["Refinance proceeds","proceeds"],["Existing debt payoff","payoff"],["Refinancing costs","fees"],["Capital recovered","recovered"],
    ["Capital remaining","remaining"],["Capital recycling efficiency","efficiency","pct"],["Capital remaining at 10% lower appraisal","lower_appraisal_remaining"],...rentalRows],
  flip:[["Cash and financed project outlay","project"],["Total project cost including sale","total_cost"],["Gross profit","gross"],
    ["Net profit before income taxes","profit"],["Return on total project cost","roi","pct"],["Return on invested cash","cash_return","pct"],
    ["Annualized return","annualized","pct"],["Break-even resale","break_even"],["Opening offer","opening"],
    ["Maximum allowable offer","max_offer"],["70% rule comparison","rule70"],["Profit at 10% lower resale","resale_down"],
    ["Profit with 20% rehab overrun","rehab_overrun"]],
  wholesale:[["Net assignment proceeds","profit"]]
};
function comparisons(result, scores = {}, sandbox = false) {
  return `<div class="grid section">${Object.keys(strategies).map(key=>{
    const model = result[key], failures = result.qualification[key];
    const sensitivity = model?.stress || (model?.holding && Object.fromEntries(Object.entries(model.holding).map(([m,v])=>[m+" months",v])));
    return `<article class="card"><h2>${strategies[key]}</h2>
    ${scores[key] !== undefined ? `<p class="tag">${scores[key]}/100 · ${classification(scores[key])}</p>` : ""}
    ${model ? metrics(strategyRows[key].map(([label,field,type])=>[label,model[field],type])) : empty("Underwriting inputs or applicability are incomplete.")}
    ${sensitivity ? details(key === "flip" ? "Holding-period sensitivity" : "Rental stress tests", `<div>${Object.entries(sensitivity).map(([label,value])=>`<div class="chart-row"><span>${escape(label)}</span><meter class="bar" min="0" max="${Math.max(1,...Object.values(sensitivity).map(Math.abs))}" value="${Math.abs(value)}" aria-label="${escape(label)} absolute magnitude"></meter><strong class="${value<0?"warning":""}">${fmt(value)}</strong></div>`).join("")}</div>`) : ""}
    ${!sandbox ? details("Qualification",failures.length ? `<ul>${failures.map(f=>`<li>${escape(f)}</li>`).join("")}</ul>` : "<p>All recorded gates cleared. Final decision remains with the owner.</p>") : ""}
    </article>`;
  }).join("")}</div>`;
}
function propertyDetail(p) {
  const recommended = p.analysis.recommended;
  const recommendation = {hold:"The property clears the rental gates and supports recurring cash flow.",
    brrrr:"The modeled refinance clears post-refinance rental gates and provides a path to capital recovery.",
    flip:"The resale case clears the target profit and recorded risk gates.",
    wholesale:"Recorded permissions and estimated assignment proceeds clear the underwriting gates."};
  const rehabRanges = p.rehab.length ? ["low","expected","high"].map(k=>[human(k),p.rehab.reduce((sum,row)=>sum+row[k],0)*(1+(p.inputs.contingency??.10))]) : [];
  return heading(p.address,[p.city,p.county,p.zip,p.status].filter(Boolean).join(" · "))
    + `<div class="actions no-print"><a class="button primary" href="#edit/${p.id}">Edit property</a>
    <button data-action="watch" data-id="${p.id}">${p.watch ? "Remove from watchlist" : "Add to watchlist"}</button></div>
    <div class="tiles section">${tile("Asking price",fmt(p.ask))}${tile("Monthly rental cash flow",fmt(p.analysis.hold?.cash_flow))}
    ${tile("Seller motivation",p.motivation_score+"/100")}${tile("Evidence",p.demo ? "Illustrative" : p.confidence)}</div>
    <section class="card section"><h2>${recommended ? strategies[recommended] : "Research stage"}</h2>
    <p>${recommended ? recommendation[recommended] : "Review source evidence, underwriting assumptions and qualification gates before making an acquisition decision."}</p>
    ${p.photo ? `<img class="photo" src="${escape(p.photo)}" alt="Owner-authorized property photograph">` : ""}
    <div class="links">${link(p.source_url,p.source || "Listing source")} ${p.verified ? "· "+escape(p.verified) : ""}</div>
    ${p.description ? `<p class="entry">${escape(p.description)}</p>` : ""}${p.notes ? `<p class="entry"><strong>Owner notes</strong><br>${escape(p.notes)}</p>` : ""}</section>
    ${comparisons(p.analysis,p.scores)}
    <div class="grid section">
    <section class="card"><h2>Valuation evidence</h2>${metrics([["As-is value",p.inputs.as_is],["Conservative ARV",p.low_arv],["Expected ARV",p.inputs.arv],["Optimistic ARV",p.high_arv],
    ["Conservative monthly rent",p.low_rent],["Expected monthly rent",p.inputs.rent],["Optimistic monthly rent",p.high_rent]])}
    ${p.comps.map(c=>`<div class="row"><div>${link(c.url,c.address)}<br><small>${escape(c.kind)} · ${escape(c.date)} · ${escape(c.sqft)} sq ft<br>${escape(c.condition)} ${escape(c.differences)}</small></div><strong>${fmt(c.amount)}</strong></div>`).join("") || empty("No comparable records entered.")}</section>
    <section class="card"><h2>Rehabilitation scope</h2>${rehabRanges.length ? metrics(rehabRanges) : empty("No component estimates recorded.")}
    ${p.rehab.map(r=>`<div class="row"><div><strong>${escape(r.system)}</strong><br><small>${escape(r.basis)} · ${escape(r.note)}</small></div>${fmt(r.expected)}</div>`).join("")}
    <p class="small">Scope totals include contingency. An explicit underwriting rehab estimate overrides the component total.</p></section></div>
    ${negotiation(p)}
    ${details("Underwriting assumptions",`<div class="fields">${Object.entries(state.schema.inputs).map(([k,[label,fallback]])=>{
      const value=p.inputs[k]??(k==="rehab" && p.rehab.length ? p.rehab.reduce((sum,row)=>sum+row.expected,0) : fallback);
      return `<div><small>${escape(label)}</small><br>${escape(fmt(value,state.schema.rates.includes(k)?"pct":["term","months","refi_term","seasoning"].includes(k)?"number":"money"))}</div>`;
    }).join("")}</div>`)}
    ${details("Property history",`<button type="button" data-action="history" data-id="${p.id}">Load history</button><div id="history"></div>`)}
  `;
}
function negotiation(p) {
  const flip = p.analysis.flip;
  const draft = `Hello, I’m researching ${p.address}. Could you confirm current availability, occupancy and known condition issues? Please share any disclosures, inspection records and offer deadlines available for review. Thank you, MauMau Properties.`;
  return `<section class="card section"><h2>Negotiation center</h2>
    ${flip ? metrics([["Modeled opening offer",flip.opening],["Modeled maximum offer",flip.max_offer]]) : empty("Enter a complete flip analysis to calculate offer limits.")}
    <p class="small">Offer limits depend on the stated exit value, costs and target profit. Verify comps, financing and title before discussing terms.</p>
    ${details("Due diligence and acquisition timeline","<ol><li>Confirm availability, ownership, title and contract restrictions.</li><li>Inspect structure, roof, mechanical systems and moisture. Obtain written rehab bids.</li><li>Verify leased income, comparable sales and rents, insurance, financing terms and cash reserves.</li><li>Review contingencies, deadlines and closing funds with the appropriate professionals.</li></ol>")}
    <label class="field entry">Owner-editable outreach draft<textarea id="draft" rows="4">${escape(draft)}</textarea></label>
    <button type="button" data-action="copy">Copy draft</button></section>`;
}
function settingsPage() {
  const setting = (key,label) => {
    const percent = state.schema.criteria_rates.includes(key) || key.endsWith("_coc");
    return numeric(key,label+(percent ? " (%)" : ""),state.settings[key],percent,'min="0" required');
  };
  const general = Object.keys(state.settings).filter(k=>!k.includes("_weight_"));
  const headings = {general:"Flip and assignment score weights",rental:"Rental and BRRRR score weights"};
  return heading("Investment criteria","Adjust underwriting targets, risk allowances and the default research territory.")
    + `<form id="settings-form"><div class="card fields">${general.map(k=>setting(k,human(k))).join("")}</div>
    ${Object.entries(state.schema.score_models).map(([model,weights])=>details(headings[model],
    `<p class="small">Weights must total 100 points. Demand currently uses evidence confidence as a proxy.</p>
    <div class="fields">${Object.keys(weights).map(factor=>setting(model+"_weight_"+factor,human(factor))).join("")}</div>`)).join("")}
    <div class="actions"><button class="primary">Save criteria</button></div></form>`;
}
function calculatorPage() {
  return heading("Underwriting calculator","Evaluate a deal before creating a property record. Estimates use the current investment criteria.")
    + `<form id="calculator-form">${inputControls(calculator)}<div class="actions"><button class="primary">Calculate</button></div></form><div id="calculator-results"></div>`;
}
const plannerFields = {goal:["Monthly passive income goal",5000], cash_flow:["Average monthly cash flow per additional property",400],
  existing:["Existing monthly net rental cash flow",0], capital:["Available acquisition capital",0],
  retained:["Average cash remaining invested per property",25000], contributions:["Annual reinvestment contributions",0],
  frequency:["Target acquisitions per year",2]};
function plannerPage() {
  return heading("Passive income planner","Model growth using editable cash flow, capital and acquisition assumptions.")
    + `<form id="planner-form" class="card fields">${Object.entries(plannerFields).map(([k,[label,value]])=>
      numeric(k,label,planner[k]??value,false,`min="${["cash_flow","retained","frequency"].includes(k)?"0.01":"0"}" max="1000000000" required`)).join("")}
      <div class="actions wide"><button class="primary">Calculate scenarios</button></div></form><div id="planner-results"></div>`;
}
function plannerResults() {
  const p = planner;
  const progress = p.goal > 0 ? Math.min(1,p.existing/p.goal) : 1;
  return `<section class="card section"><h2>Goal progress</h2><progress class="bar" value="${progress}" aria-label="Passive income goal progress"></progress>
    <p>${fmt(p.existing)} of ${fmt(p.goal)} per month</p></section>
    <div class="tiles section">${[["Conservative",.8,1.2],["Expected",1,1],["Optimistic",1.2,.8]].map(([label,income,cost])=>{
      const count = Math.ceil(Math.max(0,p.goal-p.existing)/(p.cash_flow*income));
      const retained = count*p.retained*cost;
      const annual = (p.existing+count*p.cash_flow*income)*12;
      const years = Math.max(count/p.frequency,p.contributions ? Math.max(0,retained-p.capital)/p.contributions : 0);
      return `<article class="card"><h3>${label}</h3>${metrics([["Additional rentals",count,"number"],["Retained capital",retained],["Projected annual cash flow",annual],["Years at planned pace",!p.contributions && retained>p.capital ? null : +years.toFixed(1),"number"]])}</article>`;
    }).join("")}</div><p class="small entry">These scenarios use fixed assumptions and omit appreciation, taxes and changing financing costs.</p>`;
}
function reports() {
  const entries = live();
  const compact = records => records.map(p=>`<div class="row"><div>${propertyLink(p)} · ${escape(p.confidence)}<br><small>${link(p.source_url,p.source || "Source")} ${escape(p.verified)}</small></div><strong>${fmt(p.ask)}</strong></div>`).join("") || empty("No records in this section.");
  const emerging = entries.filter(p=>p.source_url && p.verified && (p.deadline || p.motivation_score || state.changes.some(c=>c.id===p.id && c.alert))).slice(0,10);
  const sections = [
    ["Executive Investment Intelligence",`<p>${entries.length} research records · ${entries.filter(p=>p.analysis.recommended).length} properties with gates cleared.</p>`],
    ...["hold","brrrr","flip"].map(k=>["Top "+strategies[k]+" Opportunities",ranked(k).map(p=>propertyCard(p,k)).join("") || empty("No evidence-qualified candidates.")]),
    ["Emerging Opportunities",compact(emerging)],
    ["Significant Price Reductions",activity(state.changes.filter(c=>c.alert && c.label.startsWith("Price reduced")))],
    ["Detailed Financial Analysis",entries.map(p=>`<article class="card"><h3>${propertyLink(p)}</h3>${metrics([["Monthly cash flow",p.analysis.hold?.cash_flow],["DSCR",p.analysis.hold?.dscr,"ratio"],["Flip profit",p.analysis.flip?.profit],["BRRRR capital remaining",p.analysis.brrrr?.remaining]])}</article>`).join("") || empty("No completed underwriting records.")],
    ["Rental Market Intelligence",compact(entries.filter(p=>p.comps.some(c=>c.kind.endsWith("rent"))))],
    ["Property Watchlist",compact(entries.filter(p=>p.watch))],
    ["Recommended Actions",`<p>Review valuation evidence and unresolved gates for watchlist properties. Confirm availability, property condition and financing before committing capital.</p>`],
    ["Research Sources and Limitations",`<p>Records are entered manually. Live listing feeds and scheduled discovery are not connected. Missouri sale-price evidence is classified by source type.</p>${compact(entries.filter(p=>p.source_url))}`],
  ];
  return `<h1>${reportTitle}</h1><div class="actions no-print"><button class="primary" data-action="print">Print or save PDF</button><a class="button" href="/api/export">Download CSV</a></div>
    ${sections.map(([title,body])=>`<section class="section"><h2>${title}</h2>${body}</section>`).join("")}`;
}
function route() {
  if (!state) return;
  const [requested,id] = location.hash.slice(1).split("/");
  const page = pages[requested] ? requested : "dashboard";
  const item = state.properties.find(p=>p.id===Number(id));
  document.querySelector("#crumb").textContent = pages[page];
  document.querySelectorAll("nav a").forEach(a=>a.hash === "#"+page ? a.setAttribute("aria-current","page") : a.removeAttribute("aria-current"));
  const views = {dashboard, properties:()=>propertyList(false), watchlist:()=>propertyList(true), boards,
    property:()=>item ? propertyDetail(item) : heading("Property unavailable"), edit:()=>id && !item ? heading("Property unavailable") : editor(item),
    settings:settingsPage, calculator:calculatorPage, planner:plannerPage, reports};
  main.innerHTML = views[page]();
  if (displayedPage !== location.hash) {
    main.focus({preventScroll:true});
    window.scrollTo(0,0);
    displayedPage = location.hash;
  }
}
function rawInputs(data) {
  return Object.fromEntries(Object.keys(state.schema.inputs).map(k=>{
    const value = data.get("i_"+k);
    const fallback = state.schema.inputs[k][1];
    return [k,value === "" || value == null ? fallback : Number(value)/(state.schema.rates.includes(k)?100:1)];
  }));
}
function recordFromForm(form) {
  const data = new FormData(form), prev = state.properties.find(p=>p.id===Number(location.hash.split("/")[1]));
  const raw = {};
  for (const field of form.elements) {
    const {name:key, value} = field;
    if (!key || field.closest("[data-kind]")) continue;
    if (key.startsWith("i_") || key.startsWith("g_") || key.startsWith("m_")) continue;
    raw[key] = field.type === "number" ? value === "" ? null : Number(value) : value;
  }
  raw.inputs = rawInputs(data);
  raw.demo = data.has("demo");
  raw.watch = data.has("watch");
  raw.gates = Object.fromEntries(Object.keys(state.schema.gates).map(k=>[k,data.has("g_"+k)]));
  raw.motivation = Object.fromEntries(Object.keys(state.schema.motivation).map(k=>[k,data.has("m_"+k)]));
  for (const kind of ["rehab","comps"]) {
    raw[kind] = [...form.querySelectorAll(`[data-kind="${kind}"]`)].map(entry=>Object.fromEntries(
      [...entry.querySelectorAll("input,select")].map(field=>[field.name,field.type==="number" ? field.value==="" ? (field.name==="sqft" ? 0 : null) : Number(field.value) : field.value])
    ));
  }
  return {...raw,version:prev?.version};
}
async function refresh() { state = await api("/api/state"); route(); }
main.addEventListener("submit",async event=>{
  const form=event.target;
  event.preventDefault();
  const data=new FormData(form);
  const submit=event.submitter;
  if (submit) submit.disabled=true;
  try {
    if (form.id==="property-form") {
      const id=location.hash.split("/")[1];
      const result=await api(id ? "/api/properties/"+id : "/api/properties",id ? "PUT" : "POST",recordFromForm(form));
      state=await api("/api/state");
      location.hash="#property/"+result.id;
      notify("Property saved.");
    } else if (form.id==="settings-form") {
      await api("/api/settings","PUT",Object.fromEntries([...data].map(([k,v])=>[k,Number(v)/(state.schema.criteria_rates.includes(k)||k.endsWith("_coc")?100:1)])));
      await refresh();
      notify("Investment criteria saved.");
    } else if (form.id==="filter") {
      filter=Object.fromEntries(data);
      route();
    } else if (form.id==="calculator-form") {
      calculator=rawInputs(data);
      const result=await api("/api/analyze","POST",calculator);
      if (form.isConnected) document.querySelector("#calculator-results").innerHTML=comparisons(result,{},true);
    } else if (form.id==="planner-form") {
      planner=Object.fromEntries([...data].map(([k,v])=>[k,Number(v)]));
      document.querySelector("#planner-results").innerHTML=plannerResults();
    }
  } catch (error) { notify(error.message); }
  finally { if (submit) submit.disabled=false; }
});
main.addEventListener("click",async event=>{
  const button=event.target.closest("button[data-action]");
  if(!button)return;
  const {action,id}=button.dataset;
  try {
    if(action==="reset"){filter={};route();}
    else if(action==="print")window.print();
    else if(action==="add-comps"||action==="add-rehab"){
      const kind=action.slice(4);
      const container=document.querySelector("#"+kind+"-entries");
      container.insertAdjacentHTML("beforeend",evidenceEntry(kind));
      container.lastElementChild.querySelector("input,select").focus();
    } else if(action==="remove-entry")button.closest("[data-kind]").remove();
    else if(action==="copy"){
      await navigator.clipboard.writeText(document.querySelector("#draft").value);
      notify("Draft copied.");
    } else if(action==="watch"){
      const p=state.properties.find(record=>record.id===Number(id));
      button.disabled=true;
      try {
        await api("/api/properties/"+id,"PUT",{...p,watch:!p.watch});
        await refresh();
        notify(p.watch?"Removed from watchlist.":"Added to watchlist.");
      } finally { button.disabled=false; }
    } else if(action==="history"){
      const versions=await api("/api/properties/"+id+"/history");
      const target=document.querySelector("#history");
      if(target && button.isConnected)target.innerHTML=versions.map(v=>`<div class="row"><div>Version ${v.version} · ${escape(v.at)} UTC<br><small>${escape(v.record.status || "Status unspecified")} · ${escape(v.record.confidence)}</small></div><strong>${fmt(v.record.ask)}</strong></div>`).join("");
    }
  } catch(error){notify(error.message);}
});
document.querySelector("#new-property").addEventListener("click",()=>location.hash="#edit");
const theme = document.querySelector("#theme");
function applyTheme(value) {
  document.documentElement.dataset.theme=value;
  theme.setAttribute("aria-pressed",String(value==="dark"));
}
applyTheme(localStorage.getItem("theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
theme.addEventListener("click",()=>{
  const value=document.documentElement.dataset.theme==="dark"?"light":"dark";
  localStorage.setItem("theme",value);
  applyTheme(value);
});
window.addEventListener("hashchange",route);
refresh().catch(error=>main.textContent=error.message);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{});
