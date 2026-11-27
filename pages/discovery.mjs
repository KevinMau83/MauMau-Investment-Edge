import {listingSources} from "./sources.mjs";

export const HUD_LAYER = "https://services.arcgis.com/VTyQ9soqVukalItT/ArcGIS/rest/services/SF_REO/FeatureServer/0";
export const HUD_HOME = "https://www.hudhomestore.gov/";
export const USDA = "https://properties.sc.egov.usda.gov/resales/public/searchSFH";
export const RENT_SOURCE = "https://www.huduser.gov/portal/datasets/fmr/fmr2027/FY27_safmrs.xlsx";
const MARKET_CITIES = ["Pleasant Hope","Springfield","Bolivar","Buffalo","Fair Grove","Brighton","Morrisville","Willard","Ash Grove","Walnut Grove","Strafford","Republic","Marshfield","Humansville"];
const FIELDS = "CASE_NUM,CITY,STATE_CODE,DISPLAY_ZIP_CODE,DATE_ACQUIRED,ADDRESS";

export function areaQuery(input) {
  const area = input.trim().replace(/\s+/g," ").replace(/,? (?:missouri|mo)$/i,"").toUpperCase();
  if (/^\d{5}$/.test(area)) return "STATE_CODE = 'MO' AND DISPLAY_ZIP_CODE = "+area;
  if (["MISSOURI","MO"].includes(area)) return "STATE_CODE = 'MO'";
  if (["SOUTHWEST","SOUTHWEST MISSOURI","SW","SW MISSOURI"].includes(area)) {
    return "STATE_CODE = 'MO' AND CITY IN ("+MARKET_CITIES.map(city=>"'"+city.toUpperCase()+"'").join(",")+")";
  }
  if (!/^[A-Z][A-Z .'-]{0,59}$/.test(area)) throw new Error("Enter a Missouri city, a five-digit ZIP, or Southwest Missouri.");
  return "STATE_CODE = 'MO' AND CITY = '"+area.replaceAll("'","''")+"'";
}

export function listingRows(payload) {
  if (payload.error || !Array.isArray(payload.features)) throw new Error("The HUD property data source could not answer this search.");
  const seen = new Set();
  const rows = [];
  for (const {attributes: a} of payload.features) {
    if (!a?.ADDRESS?.trim() || !a.CASE_NUM?.trim() || seen.has(a.CASE_NUM)) continue;
    seen.add(a.CASE_NUM);
    rows.push({address:a.ADDRESS.trim(), city:a.CITY?.trim(), zip:a.DISPLAY_ZIP_CODE == null ? "" : String(a.DISPLAY_ZIP_CODE).padStart(5,"0"),
      caseNumber:a.CASE_NUM.trim(), acquired:a.DATE_ACQUIRED == null ? null : new Date(a.DATE_ACQUIRED).toISOString().slice(0,10)});
  }
  return rows;
}

export async function searchArea(area, signal, request = fetch) {
  const query = new URLSearchParams({f:"json",where:areaQuery(area)+" AND DATE_CLOSED IS NULL",outFields:FIELDS,
    returnGeometry:"false",resultRecordCount:"40",orderByFields:"DATE_ACQUIRED DESC,OBJECTID ASC"});
  const [properties, rents] = await Promise.allSettled([
    request(HUD_LAYER+"/query?"+query,{signal}).then(response=>{
      if (!response.ok) throw new Error("HUD property search returned HTTP "+response.status);
      return response.json();
    }).then(payload=>({rows:listingRows(payload),more:payload.exceededTransferLimit === true})),
    request(new URL("./missouri-rents.json",import.meta.url),{signal}).then(response=>{
      if (!response.ok) throw new Error("HUD rent data could not be loaded.");
      return response.json();
    }),
  ]);
  return {properties,rents};
}

const form = typeof document === "undefined" ? null : document.querySelector("#discovery");
if (form) {
  const status = document.querySelector("#search-status");
  const results = document.querySelector("#search-results");
  const input = form.elements.area;
  let current;
  function element(tag,text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }
  function source(text, url) {
    const anchor = element("a",text);
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    return anchor;
  }
  function displaySources(area) {
    const target = document.querySelector("#source-links");
    target.replaceChildren(...listingSources(area).map(([label,links])=>{
      const group = element("div");
      const list = element("ul");
      for (const [text,url] of links) {
        const item = element("li");
        item.append(source(text,url));
        list.append(item);
      }
      group.append(element("h3",label),list);
      return group;
    }));
  }
  displaySources("");
  function benchmark(zip,data) {
    const section = element("div");
    for (const [market,rents] of data[zip] ?? []) {
      section.append(element("p",market+" · "+zip+" · FY 2027 HUD gross rent benchmark"));
      const dl = element("dl");
      dl.className = "metrics";
      rents.forEach((rent,beds)=>dl.append(element("dt",beds===0 ? "Studio" : beds+" bedrooms"),
        element("dd",new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(rent))));
      section.append(dl);
    }
    return section;
  }
  function card(row, rents) {
    const article = element("article");
    article.className = "card";
    article.append(element("h3",row.address),element("p",[row.city,"MO",row.zip].filter(Boolean).join(" ")),
      element("p","HUD case "+row.caseNumber+(row.acquired ? " · acquired "+row.acquired : "")),
      element("p","Historical lead · Current availability and asking price unverified."),
      element("p","Buy and Hold, BRRRR, and Fix and Flip need a confirmed price, condition and comparable evidence."));
    const bench = benchmark(row.zip,rents);
    if (bench.childElementCount) {
      const note = element("details");
      note.append(element("summary","Area rent benchmarks"),bench);
      article.append(note);
    }
    const links = element("p");
    links.className = "entry";
    links.append(source("Check HUD Home Store",HUD_HOME)," · ",source("HUD source",HUD_LAYER));
    article.append(links);
    const share = element("button","Share lead");
    share.type = "button";
    share.addEventListener("click",async ()=>{
      const title = "MauMau Investment Edge · HUD research lead";
      const text = [row.address,[row.city,"MO",row.zip].join(" "),"HUD case "+row.caseNumber,
        "Historical snapshot covering December 2025. Current availability and price are unverified.",
        "Check HUD Home Store: "+HUD_HOME,"Source: "+HUD_LAYER].join("\n");
      try {
        if (navigator.share) await navigator.share({title,text});
        else location.href = "mailto:?subject="+encodeURIComponent(title)+"&body="+encodeURIComponent(text);
      } catch (error) {
        if (error.name!=="AbortError") status.textContent = "Sharing couldn’t open. Try again from Safari.";
      }
    });
    article.append(share);
    return article;
  }
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    current?.abort();
    const controller = new AbortController();
    current = controller;
    const area = input.value.trim();
    displaySources(area);
    results.replaceChildren();
    const button = form.querySelector("button");
    button.disabled = true;
    status.textContent = "Searching HUD for "+area+"…";
    try {
      const {properties,rents} = await searchArea(area,controller.signal);
      if (controller.signal.aborted) return;
      const data = rents.status==="fulfilled" ? rents.value : {};
      if (/^\d{5}$/.test(area) && data[area]) {
        const areaCard = benchmark(area,data);
        areaCard.className = "card section";
        areaCard.append(source("HUD rent source",RENT_SOURCE));
        results.append(areaCard);
      }
      if (properties.status==="rejected") {
        status.textContent = "HUD’s property feed is unavailable. Try again or use the official sources below.";
        return;
      }
      const {rows,more} = properties.value;
      const grid = element("div");
      grid.className = "grid section";
      grid.append(...rows.map(row=>card(row,data)));
      if (rows.length) results.append(grid);
      status.textContent = (rows.length ? (more ? "First "+rows.length : rows.length)+" HUD snapshot leads. Check current availability before relying on any result."
        : "No records in the HUD snapshot for this area. Active listings and other sellers are outside this feed.")+
        (rents.status==="rejected" ? " ZIP rent benchmarks could not be loaded." : "");
    } catch (error) {
      if (!controller.signal.aborted) status.textContent = error.message;
    } finally {
      if (current===controller) button.disabled = false;
    }
  });
  window.addEventListener("pageshow",event=>{
    if (event.persisted) {
      current?.abort();
      form.reset();
      displaySources("");
      results.replaceChildren();
      status.textContent = "";
    }
  });
}
