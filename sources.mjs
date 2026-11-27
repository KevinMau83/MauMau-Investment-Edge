const countySources = [
  ["Greene County tax sales","https://greenecountymo.gov/collector/tax_sale/faq.php"],
  ["Polk County Collector","https://polkcountymo.gov/collectors-office/"],
  ["Webster County government","https://webstercountymo.gov/"],
  ["Dallas County Collector","https://www.dallascountymocollector.com/"],
];
const regional = new Set(["","sw","southwest","sw missouri","southwest missouri","mo","missouri"]);

export function listingSources(area = "") {
  const raw = area.trim().replace(/\s+/g," ").toLowerCase();
  const local = regional.has(raw) ? "" : raw.replace(/,? (?:mo|missouri)$/,"");
  const zip = /^\d{5}$/.test(local);
  const city = !zip && /^[a-z][a-z .'-]{0,59}$/.test(local) ? local : "";
  const zillow = city ? city.replace(/[.']/g,"").replace(/ +/g,"-")+"-mo" : zip ? "homes/"+local+"_rb" : "mo";
  const realtor = city ? city.replace(/[.']/g,"").replace(/ +/g,"-")+"_MO" : zip ? local : "Missouri";
  const scope = city ? city.replace(/\b[a-z]/g,c=>c.toUpperCase())+", MO" : zip ? local : "Missouri";
  return [
    ["General listings",[
      ["Zillow · "+scope,"https://www.zillow.com/"+zillow+"/"],
      ["Realtor.com · "+scope,"https://www.realtor.com/realestateandhomes-search/"+realtor],
      [zip ? "Redfin · "+scope : "Redfin · Missouri",zip ? "https://www.redfin.com/zipcode/"+local : "https://www.redfin.com/state/Missouri"],
      ["ListingArena public search","https://api.listingarena.com/"],
    ]],
    ["Bank-owned homes and public sales",[
      ["HUD Home Store","https://www.hudhomestore.gov/"],
      ["USDA single-family resales","https://properties.sc.egov.usda.gov/resales/public/searchSFH"],
      ["Fannie Mae HomePath","https://homepath.fanniemae.com/property-finder"],
      ["Freddie Mac HomeSteps · "+scope,"https://www.homesteps.com/listing/search?search="+encodeURIComponent(scope)],
      ["VA homes through VRM","https://www.vrmproperties.com/"],
      ["Federal surplus property · GSA","https://www.gsa.gov/real-estate/real-property-disposition"],
      ["Missouri government-owned homes · UX Auctions","https://uxauctions.com/foreclosures/government-homes/mo"],
    ]],
    ["County notices and tax sales",countySources],
  ];
}
