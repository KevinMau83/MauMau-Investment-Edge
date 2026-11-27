import {analyze, format, groups} from "./model.mjs";

const form = document.querySelector("#deal");
const report = document.querySelector("#report");
const status = document.querySelector("#status");
const labels = groups.flatMap(([,fields]) => fields);
let sharedText = "";

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function buildFields() {
  const target = document.querySelector("#fields");
  for (const [index,[title,fields]] of groups.entries()) {
    const block = element("details",null,"edit section");
    block.open = index < 2;
    const list = element("div",null,"fields");
    block.append(element("summary",title),list);
    for (const [key,title,type,value] of fields) {
      const label = element("label",title+(type==="pct" ? " (%)" : ""), "field");
      const input = element("input");
      input.type = type === "text" ? "text" : "number";
      input.name = key;
      input.autocomplete = "off";
      input.defaultValue = value ?? "";
      if (type === "text") {
        input.maxLength = 160;
      } else {
        input.min = ["term","refiTerm","months"].includes(key) ? 1 : 0;
        input.max = type === "pct" ? 100 : type === "count" ? 1200 : 1e9;
        input.step = type === "count" ? 1 : "any";
        input.inputMode = type === "count" ? "numeric" : "decimal";
      }
      label.append(input);
      list.append(label);
    }
    target.append(block);
  }
  form.querySelector('[type="submit"]').disabled = false;
}

function inputs() {
  const data = new FormData(form);
  return Object.fromEntries(labels.map(([key,,type,fallback]) => {
    const value = data.get(key);
    if (type === "text") return [key,value.trim()];
    const parsed = value === "" ? fallback ?? null : Number(value);
    return [key,parsed != null && type === "pct" ? parsed/100 : parsed];
  }));
}

function addMetric(target, label, value) {
  target.append(element("dt",label),element("dd",value));
}

function display(data, cards) {
  const title = data.property || "Property analysis";
  const results = document.querySelector("#results");
  const assumptions = document.querySelector("#assumptions");
  document.querySelector("#property").textContent = title;
  results.replaceChildren();
  assumptions.replaceChildren();
  const lines = ["MauMau Investment Edge",title];
  for (const card of cards) {
    const article = element("article",null,"card");
    const list = element("dl",null,"metrics");
    article.append(element("h3",card.name));
    lines.push("",card.name);
    for (const row of card.rows ?? []) {
      const value = format(row.value,row.type);
      addMetric(list,row.label,value);
      lines.push(row.label+": "+value);
    }
    if (card.rows) article.append(list);
    if (card.note) {
      article.append(element("p",card.note,"result-note"));
      lines.push(card.note);
    }
    results.append(article);
  }
  lines.push("","Assumptions used");
  for (const [key,label,type] of labels.filter(([key])=>key!=="property")) {
    const value = format(data[key],type);
    addMetric(assumptions,label,value);
    lines.push(label+": "+value);
  }
  lines.push("","Illustrative underwriting based on your entries. Verify costs, values and lending terms.");
  sharedText = lines.join("\n");
  report.hidden = false;
  document.querySelector("#report-title").focus();
}

function clearReport() {
  report.hidden = true;
  sharedText = "";
  status.textContent = "";
  document.querySelector("#results").replaceChildren();
  document.querySelector("#assumptions").replaceChildren();
  document.querySelector("#property").textContent = "";
}

function email() {
  location.href = "mailto:?subject="+encodeURIComponent("MauMau Investment Edge analysis")+"&body="+encodeURIComponent(sharedText);
}

buildFields();
form.addEventListener("submit",event=>{
  event.preventDefault();
  clearReport();
  try {
    const data = inputs();
    display(data,analyze(data));
  } catch (error) {
    status.textContent = error.message;
  }
});
form.addEventListener("input",clearReport);
form.addEventListener("reset",clearReport);
window.addEventListener("pageshow",event=>{ if (event.persisted) form.reset(); });
document.querySelector("#share").addEventListener("click",async ()=>{
  if (!sharedText) return;
  if (!navigator.share) {
    email();
    return;
  }
  try {
    await navigator.share({title:"MauMau Investment Edge analysis",text:sharedText});
  } catch(error) {
    if (error.name !== "AbortError") status.textContent = "Sharing is unavailable. Try Email or Download text.";
  }
});
document.querySelector("#email").addEventListener("click",()=>{if (sharedText) email();});
document.querySelector("#print").addEventListener("click",()=>{if (sharedText) window.print();});
document.querySelector("#download").addEventListener("click",()=>{
  if (!sharedText) return;
  const url = URL.createObjectURL(new Blob([sharedText],{type:"text/plain;charset=utf-8"}));
  const link = element("a");
  link.href = url;
  link.download = "investment-edge-analysis.txt";
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
