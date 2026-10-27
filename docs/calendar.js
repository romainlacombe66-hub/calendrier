// Interface et logique du calendrier (générées à partir du prototype validé).
// Chargé par app.js une fois la connexion faite ; la base est fournie par window.claude.use("db").
(() => {
/* ---------- constantes ---------- */
const BUILTIN = [
  {id:"manon",  label:"Manon",        hex:"#8a4fb8", who:"manon",  builtin:true},
  {id:"romain", label:"Romain",       hex:"#1f8a7a", who:"romain", builtin:true},
  {id:"commun", label:"Commun",       hex:"#c27a12", who:"tous",   builtin:true},
  {id:"anniv",  label:"Anniversaire", hex:"#a8657a", who:"tous",   builtin:true},
];
const PALETTE = [
  {name:"bleu",hex:"#2f6fd0"},{name:"vert",hex:"#3f8a2e"},{name:"rouge",hex:"#c2412d"},{name:"violet",hex:"#8a4fb8"},{name:"sarcelle",hex:"#1f8a7a"},
  {name:"orange",hex:"#c27a12"},{name:"rose",hex:"#d0456b"},{name:"ardoise",hex:"#56657a"},{name:"olive",hex:"#7f7a14"},{name:"brun",hex:"#8a5a3a"}];
const LEGACY = {bleu:"#2f6fd0",vert:"#3f8a2e",rouge:"#c2412d",ardoise:"#56657a",olive:"#7f7a14",brun:"#8a5a3a"};
const hexOf = c => /^#[0-9a-f]{6}$/i.test(c || "") ? c.toLowerCase() : (LEGACY[c] || "#56657a");
const WHO = {tous:"Les deux", manon:"Manon", romain:"Romain"};
const SOURCES = {manuel:"Saisi dans l'appli", bullet:"Bullet reMarkable", crohn:"Journal Crohn reMarkable"};
const KINDS = {travaux:"Travaux", vacances:"Vacances", autre:"Autre"};
const REPEAT = {none:"Une seule fois", daily:"Tous les jours", weekly:"Toutes les semaines", monthly:"Tous les mois", yearly:"Tous les ans"};
// Périodicité : tous les N jours / semaines / mois / ans (every, 1 par défaut)
const EVERY_UNIT = {daily:["jour","jours"], weekly:["semaine","semaines"], monthly:["mois","mois"], yearly:["an","ans"]};
const everyOf = x => Math.max(1, Math.min(99, Math.round(Number(x.every) || 1)));
const everyText = (r, n) => n <= 1 ? ({daily:"Chaque jour", weekly:"Chaque semaine", monthly:"Chaque mois", yearly:"Chaque année"})[r] : `${r === "weekly" ? "Toutes les" : "Tous les"} ${n} ${EVERY_UNIT[r][1]}`;
const dayNum = d => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
const monthNum = d => d.getFullYear() * 12 + d.getMonth();
// Numéro de semaine (lundi = début) depuis une date de référence
const weekNum = d => Math.floor((dayNum(d) - ((d.getDay() + 6) % 7)) / 7);
const MONTHS = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const OTHER = {romain:"manon", manon:"romain"};
const BELL = `<svg class="bell" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const pad = n => String(n).padStart(2,"0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const ym = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
const parse = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y,m-1,d||1); };
const fmtMonth = d => d.toLocaleDateString("fr-FR",{month:"long",year:"numeric"});
const fmtDay = d => d.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
// Délai de rappel stocké en heures ; affiché dans l'unité la plus naturelle
const REM_UNITS = {weeks:{h:168, one:"semaine", many:"semaines"}, days:{h:24, one:"jour", many:"jours"}, hours:{h:1, one:"heure", many:"heures"}};
function splitRem(h){
  if (!(h > 0)) return {n:1, unit:"days"};
  if (h % 168 === 0) return {n:h/168, unit:"weeks"};
  if (h % 24 === 0) return {n:h/24, unit:"days"};
  return {n:h, unit:"hours"};
}
const remLabel = h => { const {n, unit} = splitRem(Number(h)), u = REM_UNITS[unit]; return `${n} ${n > 1 ? u.many : u.one} avant`; };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5); // b − a, en jours (dates AAAA-MM-JJ)
const hasRem = x => x.remindH > 0 || !!x.remindAt;
const leadText = days => days === 0 ? "le jour même" : days === 1 ? "la veille" : `${days} jours avant`;
// Texte court d'un rappel : « 3 jours avant » ou « la veille à 18:00 »
const remText = x => (x.remindAt ? `${leadText(x.remindAt.days || 0)} à ${x.remindAt.time || "09:00"}` : x.remindH > 0 ? remLabel(x.remindH) : "") + (x.push === false && hasRem(x) ? " · appli seulement" : "");
// Où arrive le rappel de cette activité : appli + téléphone (par défaut) ou appli seulement
const pushField = (id, v) => `<div class="field"><label for="${id}">Où ?</label><select id="${id}"><option value="1">Dans l'appli et sur le téléphone</option><option value="0" ${v === false ? "selected" : ""}>Dans l'appli seulement</option></select>
  <span class="note">Le téléphone ne reçoit le rappel que si « Mes rappels » l'inclut dans Paramètres.</span></div>`;
const readPush = (sh, id) => sh.querySelector("#" + id)?.value !== "0";
// Rappel : soit un délai avant (semaines, jours, heures), soit une date et une heure précises
function reminderField(x, note, base){
  const at = x?.remindAt, on = !!at || x?.remindH > 0, {n, unit} = splitRem(x?.remindH || 0), mode = x?.remindH > 0 ? "before" : "at";
  const days = at ? at.days || 0 : 0, b = base ? parse(base) : today;
  return `<div class="field"><span class="lbl">Rappel</span>
    <label class="switch" for="remOn"><input type="checkbox" id="remOn" ${on ? "checked" : ""}>Me le rappeler</label>
    <div class="stack" id="remBox" style="gap:8px" ${on ? "" : "hidden"} data-days="${days}">
      <select id="remMode" aria-label="Type de rappel"><option value="at" ${mode === "at" ? "selected" : ""}>À une date et une heure</option><option value="before" ${mode === "before" ? "selected" : ""}>Un délai avant (semaines, jours, heures)</option></select>
      <div class="row" id="remAtBox" style="flex-wrap:nowrap" ${mode === "at" ? "" : "hidden"}>
        <div class="field" style="flex:2;min-width:0"><label for="remDate">Le</label><input type="date" id="remDate" value="${ymd(addDays(b, -days))}"></div>
        <div class="field" style="flex:1;min-width:0"><label for="remTime">À</label><input type="time" id="remTime" value="${esc(at?.time || "09:00")}"></div>
      </div>
      <div class="row" id="remBeforeBox" style="flex-wrap:nowrap" ${mode === "before" ? "" : "hidden"}>
        <input type="number" id="remN" min="1" max="999" step="1" value="${n}" style="width:88px;flex:none" aria-label="Combien de temps avant">
        <select id="remUnit" style="flex:1;min-width:0">${Object.entries(REM_UNITS).map(([k,u]) => `<option value="${k}" ${k === unit ? "selected" : ""}>${u.many} avant</option>`).join("")}</select>
      </div>
      <span class="note" id="remHint"></span>
      ${pushField("remPush", x?.push)}
    </div>
    <span class="note">${note}</span></div>`;
}
// getBase() : date (AAAA-MM-JJ) de l'élément dans le formulaire ; repeats() : l'élément se répète-t-il ?
function wireReminder(sh, getBase, repeats){
  const on = sh.querySelector("#remOn"), box = sh.querySelector("#remBox"), mode = sh.querySelector("#remMode"), date = sh.querySelector("#remDate");
  const hint = () => {
    const h = sh.querySelector("#remHint");
    if (mode.value !== "at") { h.textContent = ""; return; }
    const d = getBase() && date.value ? daysBetween(date.value, getBase()) : 0;
    h.textContent = d < 0 ? "Le rappel tombe après la date : choisissez un jour avant ou le jour même." : "Soit " + leadText(d) + (repeats?.() ? ", pour chaque date de la répétition." : ".");
  };
  on.addEventListener("change", () => { box.hidden = !on.checked; hint(); });
  mode.addEventListener("change", () => { sh.querySelector("#remAtBox").hidden = mode.value !== "at"; sh.querySelector("#remBeforeBox").hidden = mode.value !== "before"; hint(); });
  date.addEventListener("change", () => { if (getBase() && date.value) box.dataset.days = daysBetween(date.value, getBase()); hint(); });
  // si la date de l'élément change, le rappel garde le même écart
  sh.__remRebase = () => { const b = getBase(); if (b) date.value = ymd(addDays(parse(b), -(Number(box.dataset.days) || 0))); hint(); };
  hint();
}
// Renvoie {remindH, remindAt}, ou null si la saisie est invalide
function readReminder(sh, base){
  if (!sh.querySelector("#remOn").checked) return {remindH: 0, remindAt: null, push: true};
  const push = readPush(sh, "remPush");
  if (sh.querySelector("#remMode").value === "at") {
    const d = sh.querySelector("#remDate").value, time = sh.querySelector("#remTime").value || "09:00";
    if (!d) { toast("Choisissez la date du rappel."); return null; }
    const days = daysBetween(d, base);
    if (days < 0) { toast("Le rappel doit tomber avant la date ou le jour même."); return null; }
    if (days > 366) { toast("Le rappel ne peut pas être plus d'un an avant."); return null; }
    return {remindH: 0, remindAt: {days, time}, push};
  }
  const n = Math.round(Number(sh.querySelector("#remN").value)), u = REM_UNITS[sh.querySelector("#remUnit").value];
  if (!(n >= 1 && n <= 999)) { sh.querySelector("#remN").focus(); toast("Indiquez un nombre entre 1 et 999 pour le rappel."); return null; }
  return {remindH: n * u.h, remindAt: null, push};
}
const monthsLabel = ms => (ms||[]).slice().sort((a,b)=>a-b).map(m => MONTHS[m-1]).join(", ");
const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
// Texte affiché dans le calendrier : l'acronyme, sinon le début du titre
const shortLabel = x => (x.acr || "").trim() || String(x.title || "").replace(/\s+/g, " ").trim().slice(0, 5);
const acrField = v => `<div class="field"><label for="fAcr">Acronyme <span style="font-weight:400">(affiché dans le calendrier, 6 caractères max)</span></label><input type="text" id="fAcr" maxlength="6" value="${esc(v || "")}" placeholder="Ex. KINÉ" autocapitalize="characters"></div>`;
const readAcr = sh => sh.querySelector("#fAcr")?.value.trim() || "";
const acrTag = x => x.acr ? `<span class="acr">${esc(x.acr)}</span>` : "";
const CAKE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 21h16v-8H4z"/><path d="M4 16c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5"/><path d="M12 13V9"/><path d="M12 6.5c-.7-.9 0-2 0-2.8.7.8 1.1 1.9 0 2.8z"/></svg>`;
// Bibliothèque d'icônes (tâches et événements du quotidien), chacune avec sa couleur d'origine
const ICONS = {
  poubelle:{label:"Poubelles", color:"#5b7a3a", d:'<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>'},
  courses:{label:"Courses", color:"#2f6fd0", d:'<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2l2.5 11h11l2-8H6.5"/>'},
  menage:{label:"Ménage", color:"#8a5a3a", d:'<path d="M14 3l-4 9"/><path d="M6 13h8l2 8H4z"/><path d="M8 17v4M12 17v4"/>'},
  proprete:{label:"Nettoyage", color:"#3a8fb7", d:'<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="M19 15l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z"/>'},
  lessive:{label:"Lessive", color:"#3a7fb0", d:'<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6h.01M11 6h.01"/>'},
  repassage:{label:"Repassage", color:"#7a5ab8", d:'<path d="M3 18h18l-1-5a6 6 0 0 0-6-5H7"/><path d="M7 8v3"/>'},
  draps:{label:"Draps / lit", color:"#6a7ab8", d:'<path d="M3 18V8"/><path d="M3 14h18v4"/><path d="M21 14v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11" r="2"/>'},
  vaisselle:{label:"Vaisselle", color:"#4a90a0", d:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>'},
  cuisine:{label:"Repas / cuisine", color:"#d0702a", d:'<path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M2 10h2M20 10h2"/><path d="M9 6c0-1 1-1 1-2M14 6c0-1 1-1 1-2"/>'},
  plantes:{label:"Plantes", color:"#3f8a2e", d:'<path d="M12 21v-8"/><path d="M12 13c0-4-3-6-7-6 0 4 3 6 7 6z"/><path d="M12 13c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M8 21h8"/>'},
  eau:{label:"Arrosage / eau", color:"#2f8fd0", d:'<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>'},
  jardin:{label:"Jardin", color:"#5b8a2e", d:'<path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15z"/><path d="M5 19l8-8"/>'},
  animal:{label:"Animal", color:"#b07a3a", d:'<circle cx="7" cy="9" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="17" cy="9" r="2"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5-2 3-4 3-4 0-4-3z"/>'},
  voiture:{label:"Voiture", color:"#56657a", d:'<path d="M3 16v-4l2-5h14l2 5v4z"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="1.5"/><path d="M3 12h18"/>'},
  bricolage:{label:"Bricolage", color:"#8a5a3a", d:'<path d="M14 6l4 4"/><path d="M11 5l3-2 5 5-2 3z"/><path d="M13 9l-9 9 2 2 9-9"/>'},
  maison:{label:"Maison", color:"#c27a12", d:'<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'},
  cles:{label:"Clés", color:"#b08a2a", d:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>'},
  energie:{label:"Électricité / énergie", color:"#c9a12a", d:'<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>'},
  facture:{label:"Factures", color:"#c2412d", d:'<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>'},
  argent:{label:"Argent / banque", color:"#c27a12", d:'<circle cx="12" cy="12" r="9"/><path d="M15 8.5a4 4 0 1 0 0 7"/><path d="M7 11h6M7 13h6"/>'},
  papiers:{label:"Papiers / administratif", color:"#56657a", d:'<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 13h8M9 17h6"/>'},
  courrier:{label:"Courrier", color:"#3a6fb0", d:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'},
  telephone:{label:"Appel", color:"#1f8a7a", d:'<path d="M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>'},
  ordinateur:{label:"Ordinateur / en ligne", color:"#56657a", d:'<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20h8M12 16v4"/>'},
  medicament:{label:"Médicament", color:"#d0456b", d:'<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"/><path d="M9 9l6 6"/>'},
  sante:{label:"Santé", color:"#e05a7a", d:'<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>'},
  sport:{label:"Sport", color:"#1f8a7a", d:'<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>'},
  rdv:{label:"Rendez-vous", color:"#2f4a6d", d:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M9 15l2 2 4-4"/>'},
  personne:{label:"Enfant / personne", color:"#8a4fb8", d:'<circle cx="12" cy="7" r="3"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/>'},
  ecole:{label:"École / devoirs", color:"#7a5ab8", d:'<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>'},
  coiffeur:{label:"Coiffeur", color:"#8a4fb8", d:'<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="M8.5 8.5L20 20M8.5 15.5L20 4"/>'},
  cadeau:{label:"Cadeau", color:"#d0456b", d:'<rect x="3" y="8" width="18" height="4"/><path d="M5 12v9h14v-9"/><path d="M12 8v13"/><path d="M12 8c-2-4-6-4-6-1s4 1 6 1c2 0 6 2 6-1s-4-3-6 1z"/>'},
};
const iconSvg = (k, size) => ICONS[k] ? `<svg ${size ? `width="${size}" height="${size}" ` : ""}viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k].d}</svg>` : "";
const iconHex = x => x.iconColor || ICONS[x.icon]?.color || "#56657a";
const iconTag = x => ICONS[x.icon] ? `<span class="ico-i cx" style="--x:${iconHex(x)}" title="${esc(ICONS[x.icon].label)}">${iconSvg(x.icon)}</span>` : "";
function iconField(icon, color){
  return `<div class="field"><span class="lbl">Icône <span style="font-weight:400">(facultatif : affichage discret et non bloquant dans le calendrier)</span></span>
    <div class="pick icons" data-name="icon" data-multi="false" role="group" aria-label="Icône">
      <button type="button" class="neutral" data-v="" aria-pressed="${!icon}">Aucune</button>
      ${Object.entries(ICONS).map(([k, ic]) => `<button type="button" class="cx" style="--x:${ic.color}" data-v="${k}" aria-pressed="${icon === k}" title="${esc(ic.label)}" aria-label="${esc(ic.label)}">${iconSvg(k)}</button>`).join("")}
    </div>
    <span class="note" id="iconName">${icon && ICONS[icon] ? "Icône : " + ICONS[icon].label + ". Dans le calendrier, la journée reste libre." : "Sans icône : affichage normal, avec une bande de couleur."}</span>
    <label class="switch" for="icCustom"><input type="checkbox" id="icCustom" ${color ? "checked" : ""}>Changer la couleur de l'icône</label>
    <label class="custom-color" id="icColorBox" ${color ? "" : "hidden"}><input type="color" id="icColor" value="${color || (ICONS[icon]?.color || "#2f6fd0")}" aria-label="Couleur de l'icône">Couleur de l'icône (sinon, couleur d'origine)</label>
  </div>`;
}
function wireIcon(sh){
  const c = sh.querySelector("#icCustom"), box = sh.querySelector("#icColorBox"), inp = sh.querySelector("#icColor");
  c.addEventListener("change", () => { box.hidden = !c.checked; });
  onPick.icon = (v, sheet) => {
    if (sheet !== sh) return;
    sh.querySelector("#iconName").textContent = v && ICONS[v] ? "Icône : " + ICONS[v].label + ". Dans le calendrier, la journée reste libre." : "Sans icône : affichage normal, avec une bande de couleur.";
    if (v && ICONS[v] && !c.checked) inp.value = ICONS[v].color;
  };
}
const readIcon = sh => { const icon = getPick(sh, "icon") || ""; return {icon, iconColor: icon && sh.querySelector("#icCustom").checked ? sh.querySelector("#icColor").value : ""}; };
const fmtShort = s => parse(s).toLocaleDateString("fr-FR", {day:"numeric", month:"short"});
const periodText = e => e.endDate && e.date && e.endDate > e.date ? `du ${fmtShort(e.date)} au ${fmtShort(e.endDate)}` : "";
// Option « Afficher dans le calendrier partagé » (oui par défaut). Décochée : visible seulement dans « Mon planning » ; rappels inchangés.
const sharedField = v => `<div class="field"><label class="switch" for="fShared"><input type="checkbox" id="fShared" ${v === false ? "" : "checked"}>Afficher dans le calendrier partagé</label>
  <span class="note">Décoché : visible seulement dans « Mon planning » des personnes concernées, pas dans « Tout » ni dans le planning de l'autre. Les rappels restent actifs.</span></div>`;
const readShared = sh => !!sh.querySelector("#fShared")?.checked;
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const store = {get(k){ try { return localStorage.getItem(k); } catch { return null; } }, set(k,v){ try { localStorage.setItem(k,v); } catch {} }};

const today = new Date(); today.setHours(0,0,0,0);
const state = {
  evMonth:null,
  tab:"cal", sub:"events", setSub:"prefs", remsOpen: store.get("cc-rems-open") === "1", evMonth:null, auditType:"all", allType:"all", allQuery:"", bdQuery:"", evSort:"date", hidePast:true, view:new Date(today.getFullYear(), today.getMonth(), 1), sel:ymd(today),
  taskMonth:new Date(today.getFullYear(), today.getMonth(), 1),
  me:null, mode:"tout", settings:{}, categories:[],
  events:[], tasks:[], projects:[], sync:{}, log:[], shoplists:[], shopitems:[], products:[], dishes:[], shopCur:null
};
{ const hp = store.get("cc-hidepast"); if (hp !== null) state.hidePast = hp === "1"; const so = store.get("cc-evsort"); if (so) state.evSort = so; }
{ const m = store.get("cc-me"); if (m === "romain" || m === "manon") { state.me = m; state.mode = store.get("cc-start") || "moi"; } }
let startModeApplied = false; // le planning par défaut du profil s'applique une fois, à l'ouverture
function applyStartMode(){
  if (startModeApplied || !state.me || !state.settings[state.me]) return;
  startModeApplied = true;
  const sm = state.settings[state.me].startMode;
  if (sm && sm !== state.mode && !modeTouched) { state.mode = sm; store.set("cc-start", sm); }
}
let modeTouched = false;
// Les anniversaires « pour Manon » ou « pour Romain » n'existent que pour ce profil
{ let raw = [], memo = null, memoMe = null;
  Object.defineProperty(state, "events", {configurable:true, enumerable:true,
    get(){ if (memo === null || memoMe !== state.me) { memo = raw.filter(bdVisibleToMe); memoMe = state.me; } return memo; },
    set(v){ raw = v || []; memo = null; } }); }
let dismissed = {}; try { dismissed = JSON.parse(store.get("cc-rem-vus")) || {}; } catch {}

/* ---------- catégories ---------- */
function allCats(){
  const ov = state.settings.colors || {};
  const builtin = BUILTIN.map(c => ({...c, hex: hexOf(ov[c.id] || c.hex)}));
  const custom = state.categories.slice().sort((a,b)=>(a.label||"").localeCompare(b.label||""))
    .map(c => ({id:c.id, label:c.label, hex:hexOf(c.color), who:c.who || "tous"}));
  return [...builtin, ...custom].map(c => ({...c, cls:"cx k-" + c.id}));
}
function catInfo(id){
  if (!id) return {id:"", label:"À classer", cls:"cx k-none", hex:"#56657a", who:"tous"};
  return allCats().find(c => c.id === id) || {id, label:"Sans catégorie", cls:"cx k-none", hex:"#56657a", who:"tous"};
}
// Éléments sans catégorie (arrivés par la synchro sans catégorie précisée)
const unassignedEvents = () => state.events.filter(e => !e.cat && !isBday(e));
const unassignedTasks = () => state.tasks.filter(t => !t.cat && !t.who);
// Une règle CSS par catégorie : .k-<id>{--x:<couleur>}
const catStyle = document.createElement("style"); document.head.append(catStyle);
function updateCatStyles(){
  catStyle.textContent = allCats().filter(c => /^[\w-]+$/.test(c.id)).map(c => `.k-${c.id}{--x:${c.hex}}`).join("") + ".k-none{--x:#56657a}";
}
// Catégories d'une personne : les siennes + celles qui concernent les deux.
const catsOf = who => allCats().filter(c => c.who === who || c.who === "tous").map(c => c.id);
function visible(catId){
  const c = catInfo(catId);
  if (!state.me || state.mode === "tout") return true;
  const who = state.mode === "autre" ? OTHER[state.me] : state.me;
  return c.who === who || c.who === "tous";
}

/* ---------- récurrence ---------- */
const repeatOf = e => e.repeat || (e.cat === "anniv" ? "yearly" : "none");
function occursBase(e, d){
  if (!e.date) return false;
  const s = parse(e.date); if (d < s) return false;
  const r = repeatOf(e);
  if (r === "none") return ymd(d) === e.date;
  if (e.months?.length && !e.months.includes(d.getMonth()+1)) return false;
  const n = everyOf(e);
  if (r === "daily") return (dayNum(d) - dayNum(s)) % n === 0;
  if (r === "weekly") return d.getDay() === s.getDay() && ((dayNum(d) - dayNum(s)) / 7) % n === 0;
  if (r === "monthly") return d.getDate() === s.getDate() && (monthNum(d) - monthNum(s)) % n === 0;
  if (r === "yearly") return d.getDate() === s.getDate() && d.getMonth() === s.getMonth() && (d.getFullYear() - s.getFullYear()) % n === 0;
  return false;
}
// Durée d'une période en jours (0 = un seul jour)
const spanDays = e => (e.endDate && e.date && e.endDate > e.date) ? Math.min(366, Math.round((parse(e.endDate) - parse(e.date))/864e5)) : 0;
// Le jour d appartient-il à une occurrence (période comprise) ?
// Dates retirées d'une récurrence : skips = [{d:"AAAA-MM-JJ", note, by}] ; avec to:"AAAA-MM-JJ", la date est déplacée à ce jour
const skipOf = (x, k) => (x.skips || []).find(s => s.d === k);
const movedTo = (x, k) => (x.skips || []).find(s => s.to === k);
const isRecurring = (x, col) => col === "tasks" ? taskSched(x) === "weekdays" || taskRep(x) !== "none" : repeatOf(x) !== "none";
// Tâche « à une date » qui se répète (tous les N jours / semaines / mois / ans)
const taskRep = t => t.sched === "dates" && t.repeat && t.repeat !== "none" ? t.repeat : "none";
const perDay = t => taskSched(t) === "weekdays" || taskRep(t) !== "none"; // cochée jour par jour
function occursOn(e, d){
  const key = ymd(d);
  if (movedTo(e, key)) return true;
  if (skipOf(e, key)) return false;
  const n = spanDays(e);
  for (let k = 0; k <= n; k++) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - k), xk = ymd(x);
    if (movedTo(e, xk) || (occursBase(e, x) && !skipOf(e, xk)?.to)) return true; }
  return false;
}
// Numéro du jour dans la période (1 = premier jour)
function dayInPeriod(e, d){
  const n = spanDays(e); if (!n) return 0;
  for (let k = 0; k <= n; k++) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - k), xk = ymd(x);
    if (movedTo(e, xk) || (occursBase(e, x) && !skipOf(e, xk)?.to)) return k + 1; }
  return 0;
}
function nextOccurrence(e, now){
  const [hh,mm] = (e.time || "09:00").split(":").map(Number);
  if (repeatOf(e) === "none") { const s = parse(e.date); const at = new Date(s.getFullYear(), s.getMonth(), s.getDate(), hh, mm); return at > now ? at : null; }
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i <= 400; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if ((occursBase(e, d) && !skipOf(e, ymd(d))) || movedTo(e, ymd(d))) { const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm); if (at > now) return at; }
  }
  return null;
}
function repeatText(e){
  const r = repeatOf(e); if (r === "none") return "";
  return everyText(r, everyOf(e)) + (e.months?.length ? " (" + monthsLabel(e.months) + ")" : "");
}

/* ---------- stockage ---------- */
let db = null;
const mem = {events:new Map(), tasks:new Map(), projects:new Map(), categories:new Map(), settings:new Map(), log:new Map(), shoplists:new Map(), shopitems:new Map(), products:new Map(), dishes:new Map()};
async function rawSave(col, id, data){
  if (db) await db.collection(col).doc(id).set(data);
  else { mem[col].set(id, {...data, id}); refreshMem(); }
}
async function rawPatch(col, id, data){
  if (db) await db.collection(col).doc(id).update(data);
  else { mem[col].set(id, {...mem[col].get(id), ...data}); refreshMem(); }
}
async function rawRemove(col, id){
  if (db) await db.collection(col).doc(id).delete();
  else { mem[col].delete(id); refreshMem(); }
}
// Retour en arrière : on garde l'état précédent des 5 dernières modifications (sur cet appareil)
// Retour en arrière / annulation du retour : propres à chaque profil (et à ce téléphone), 5 au plus.
// Chaque entrée garde l'état avant (prev) et après (next) de SON changement : si l'autre profil a modifié
// l'élément entre-temps, le retour en arrière est refusé, pour ne jamais défaire le travail de l'autre.
const UNDO_MAX = 5, stacks = {};
const S = () => (stacks[state.me || ""] ||= {undo: [], redo: []});
function prevOf(col, id){
  const src = col === "settings" ? state.settings[id] : (state[col] || []).find(x => x.id === id);
  if (!src) return null;
  const {id: _drop, ...rest} = src;
  return JSON.parse(JSON.stringify(rest));
}
// Comparaison de deux états (ordre des champs et champs vides ignorés)
const canon = v => JSON.stringify(v, (k, x) => x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).filter(([, y]) => y !== undefined).sort(([a], [b]) => a.localeCompare(b))) : x);
const sameState = (a, b) => canon(a ?? null) === canon(b ?? null);
function pushUndo(entry, keepRedo){
  const st = S(); st.undo.push(entry);
  while (st.undo.length > UNDO_MAX) st.undo.shift();
  if (!keepRedo) st.redo = []; // une nouvelle action efface les « annuler le retour » en attente
  renderUndo();
}
function record(col, id, verb, title, next){
  pushUndo({col, id, verb, title, prev: prevOf(col, id), next: next ? JSON.parse(JSON.stringify(next)) : null, label: `${verb}${title ? " de « " + title + " »" : ""}`});
}
const titleOf = (col, id, data) => data?.title || data?.label || data?.name || prevOf(col, id)?.name || prevOf(col, id)?.title || prevOf(col, id)?.label || (col === "settings" ? "un réglage" : "");
// Journal partagé : qui a ajouté, modifié ou supprimé quoi (pour l'onglet Nouveautés de l'autre personne)
function kindOf(col, id, data){
  if (col === "events") { const e = data || (state.events.find(x => x.id === id)); return e && (e.isBirthday || e.cat === "anniv") ? "anniversaire" : "événement"; }
  return {tasks:"tâche", projects:"projet", categories:"catégorie"}[col] || "";
}
function logChange(col, id, verb, title, data, note){
  if (["settings","log","shoplists","shopitems","products","dishes"].includes(col)) return; // les courses ne remplissent pas les Nouveautés
  const onlyFor = col === "events" && data && isBday(data) && bdOwner(data) !== "commun" ? bdOwner(data) : "";
  rawSave("log", "l" + newId(), {by: state.me || "", verb, col, itemId: id, title: title || "", kind: kindOf(col, id, data), at: new Date().toISOString(), note: note || "", ...(onlyFor ? {onlyFor} : {})}).catch(() => {});
}
async function save(col, id, data){ const had = !!prevOf(col, id), verb = had ? "modification" : "ajout", title = titleOf(col, id, data);
  record(col, id, verb, title, data); await rawSave(col, id, data); logChange(col, id, verb, title, data); }
async function patch(col, id, data){ const title = titleOf(col, id, data), full = {...(prevOf(col, id) || {}), ...data};
  record(col, id, "modification", title, full); await rawPatch(col, id, data); logChange(col, id, "modification", title, full); }
async function remove(col, id){ const title = titleOf(col, id), before = prevOf(col, id);
  record(col, id, "suppression", title, null); await rawRemove(col, id); logChange(col, id, "suppression", title, before); }
function renderUndo(){
  const st = S(), b = $("#undoBtn"), c = $("#undoCount"), last = st.undo[st.undo.length - 1];
  b.disabled = !last; c.hidden = !last; c.textContent = st.undo.length;
  b.title = last ? `Retour en arrière : ${last.label}` : "Rien à annuler";
  b.setAttribute("aria-label", b.title);
  const r = $("#redoBtn"), rc = $("#redoCount"), lastR = st.redo[st.redo.length - 1];
  r.hidden = !lastR; rc.hidden = !lastR; rc.textContent = st.redo.length;
  r.title = lastR ? `Annuler le retour en arrière : ${lastR.label}` : "";
  r.setAttribute("aria-label", r.title || "Annuler le retour en arrière");
  $("#topBtns").classList.toggle("three", !!lastR);
}
const otherName = () => WHO[OTHER[state.me]] || "l'autre profil";
// Écrit un état complet (ou supprime si null) et le note dans le journal
async function applyState(u, target, verb, note){
  if (target) await rawSave(u.col, u.id, target); else await rawRemove(u.col, u.id);
  logChange(u.col, u.id, verb, u.title, target || u.prev || u.next, note);
}
async function undo(){
  const st = S(), u = st.undo.pop(); renderUndo(); if (!u) return;
  try {
    if (u.custom) await u.custom();
    else {
      if (!sameState(prevOf(u.col, u.id), u.next)) {
        toast(`« ${u.title || "Cet élément"} » a été changé depuis (par ${otherName()} ?) : ce retour en arrière n'est plus possible.`);
        return;
      }
      const verb = u.verb === "suppression" ? "ajout" : u.verb === "ajout" ? "suppression" : "annulation";
      await applyState(u, u.prev, verb, "retour en arrière");
    }
    st.redo.push(u); while (st.redo.length > UNDO_MAX) st.redo.shift(); renderUndo();
    toast(`Annulé : ${u.label}${st.undo.length ? ` · encore ${st.undo.length} possible${st.undo.length > 1 ? "s" : ""}` : ""}`);
  } catch (err) { toast("Retour en arrière impossible : " + (err?.code || "erreur")); }
}
// Annule le dernier retour en arrière (refait l'action), qui redevient annulable
async function redo(){
  const st = S(), u = st.redo.pop(); renderUndo(); if (!u) return;
  try {
    if (u.custom) { if (u.redo) await u.redo(); }
    else {
      if (!sameState(prevOf(u.col, u.id), u.prev)) {
        toast(`« ${u.title || "Cet élément"} » a été changé depuis (par ${otherName()} ?) : impossible de rétablir.`);
        return;
      }
      await applyState(u, u.next, u.verb, "retour en arrière annulé");
    }
    pushUndo(u, true);
    toast(`Rétabli : ${u.label}${st.redo.length ? ` · encore ${st.redo.length} à rétablir` : ""}`);
  } catch (err) { toast("Impossible de rétablir : " + (err?.code || "erreur")); }
}
function refreshMem(){
  for (const k of ["events","tasks","projects","categories","log","shoplists","shopitems","products","dishes"]) state[k] = [...mem[k].values()];
  state.settings = Object.fromEntries(mem.settings);
  applyStartMode(); render();
}
const guard = p => p.catch(err => toast("Enregistrement impossible : " + (err?.code || "erreur")));
function toast(msg){ const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2000); }

/* ---------- sélecteurs (catégories, mois, etc.) ---------- */
// pick(nom, options, sélection, multiple?, classe en plus) : groupe de boutons à cocher
function pick(name, opts, cur, multi = false, extra = ""){
  const sel = multi ? (cur || []) : [cur];
  return `<div class="pick ${extra}" data-name="${name}" data-multi="${multi}" role="group">${opts.map(o =>
    `<button type="button" class="${o.cls || "neutral"}"${o.style ? ` style="${o.style}"` : ""} data-v="${esc(o.v)}" aria-pressed="${sel.map(String).includes(String(o.v))}"${o.title ? ` aria-label="${esc(o.title)}" title="${esc(o.title)}"` : ""}>${o.dot === false ? "" : '<span class="dot"></span>'}${o.label ?? ""}</button>`).join("")}</div>`;
}
const getPick = (root, name) => root.querySelector(`.pick[data-name="${name}"] [aria-pressed="true"]`)?.dataset.v ?? null;
const getPicks = (root, name) => [...root.querySelectorAll(`.pick[data-name="${name}"] [aria-pressed="true"]`)].map(b => b.dataset.v);
const catOptions = () => allCats().map(c => ({v:c.id, label:esc(c.label), cls:c.cls}));
const catOptionsNoBd = () => catOptions().filter(o => o.v !== "anniv");
// Anniversaires : couleur = « Anniversaire » ou une catégorie créée (Famille, Amis…), jamais une personne
const bdCatOptions = () => allCats().filter(c => c.id === "anniv" || !c.builtin).map(c => ({v:c.id, label:esc(c.label), cls:c.cls}));
// Anniversaire « pour » une personne : visible seulement dans son profil
const bdOwner = e => (e.bdFor === "manon" || e.bdFor === "romain") ? e.bdFor : "commun";
const bdVisibleToMe = e => !isBday(e) || bdOwner(e) === "commun" || bdOwner(e) === state.me;
const monthOptions = () => MONTHS.map((m,i) => ({v:i+1, label:m, dot:false}));
const onPick = {}; // réactions immédiates par nom de groupe
function colorField(cur){
  const known = PALETTE.find(p => p.hex === hexOf(cur || ""));
  return `${pick("color", PALETTE.map(p => ({v:p.hex, cls:"cx", style:`--x:${p.hex}`, title:p.name})), known ? known.hex : null, false, "swatches")}
    <label class="custom-color"><input type="color" class="colorCustom" value="${hexOf(cur || "#2f6fd0")}" aria-label="Couleur personnalisée">Couleur personnalisée</label>`;
}
const readColor = root => getPick(root, "color") || root.querySelector(".colorCustom")?.value || "#2f6fd0";
onPick.color = (v, sheet, form) => { const i = (form || sheet)?.querySelector(".colorCustom"); if (i) i.value = v; };

/* ---------- rappels ---------- */
// Rappels de tâches (jour du mois) et de projets (date)
const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();
const atTime = (d, time) => { const [hh, mm] = (time || "09:00").split(":").map(Number); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm); };
function taskRemOn(t, d){
  if (taskSched(t) !== "month") return taskOnDay(t, d);
  if (!(t.remindDay > 0) || !taskIn(t, ym(d))) return false;
  return d.getDate() === Math.min(t.remindDay, lastDay(d.getFullYear(), d.getMonth()));
}
function projRemOn(p, d){
  if (!p.remindDate) return false;
  const s = parse(p.remindDate);
  if (p.yearly) return d >= s && d.getMonth() === s.getMonth() && d.getDate() === s.getDate();
  return ymd(d) === p.remindDate;
}
const today0 = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
function dueReminders(){
  if (!state.me) return [];
  const now = new Date(), mine = catsOf(state.me), out = [];
  for (const e of state.events) {
    if (!hasRem(e) || !e.date || !mine.includes(e.cat)) continue;
    const at = nextOccurrence(e, now); if (!at) continue;
    const fire = e.remindAt ? atTime(addDays(at, -(e.remindAt.days || 0)), e.remindAt.time) : new Date(at.getTime() - e.remindH*3600e3);
    if (fire <= now)
      out.push({key: e.id + "@" + ymd(at), cat: e.cat, title: e.title, at, sort: at,
        label: `${until(at)} · ${at.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})}${e.time ? " à " + esc(e.time) : ""}`});
  }
  const m = ym(now);
  for (const t of state.tasks) {
    if (taskSched(t) !== "month") {
      if (!t.remindOn || !mine.includes(taskCat(t))) continue;
      const lead = Math.max(0, Number(t.remindDays) || 0);
      for (let k = 0; k <= lead; k++) {
        const D = addDays(today0(), k);
        if (!taskOnDay(t, D) || taskDoneOn(t, D)) continue;
        const at = atTime(addDays(D, -lead), t.remindTime);
        if (at <= now) out.push({key: "t" + t.id + "@" + ymd(D), cat: taskCat(t), title: t.title, at, sort: atTime(D, t.remindTime),
          label: k === 0 ? "Tâche du jour · à faire" : "Tâche · " + D.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})});
      }
      continue;
    }
    if (!(t.remindDay > 0) || !mine.includes(taskCat(t)) || !taskIn(t, m) || taskDone(t, m)) continue;
    const at = atTime(new Date(now.getFullYear(), now.getMonth(), Math.min(t.remindDay, lastDay(now.getFullYear(), now.getMonth()))), t.remindTime);
    if (at <= now) out.push({key: "t" + t.id + "@" + m, cat: taskCat(t), title: t.title, at, sort: at, label: "Tâche du mois · à faire"});
  }
  for (const p of state.projects) {
    if (!p.remindDate || !mine.includes(p.cat || "commun")) continue;
    const s = parse(p.remindDate);
    let d = p.yearly ? new Date(now.getFullYear(), s.getMonth(), s.getDate()) : s;
    if (p.yearly && d < s) continue;
    const at = atTime(d, p.remindTime);
    if (at <= now && now - at < 7*864e5) out.push({key: "p" + p.id + "@" + ymd(at), cat: p.cat || "commun", title: p.title, at, sort: at,
      label: `Projet · ${at.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})}${p.remindTime ? " à " + esc(p.remindTime) : ""}`});
  }
  return out.filter(r => !dismissed[r.key]).sort((a,b) => a.sort - b.sort);
}
function until(at){
  const now = new Date(), h = (at - now)/3600e3;
  if (h < 1) return "dans moins d'une heure";
  if (h < 24) return `dans ${Math.round(h)} h`;
  const d = Math.round((new Date(at.getFullYear(), at.getMonth(), at.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate()))/864e5);
  return d === 1 ? "demain" : `dans ${d} jours`;
}
// Projets prévus pour un mois donné (mois cochés + bonne année, ou chaque année), pas encore terminés
function projectsOfMonth(d){
  const m = d.getMonth() + 1, y = d.getFullYear();
  return state.projects.filter(p => (p.months || []).includes(m) && (p.yearly || !p.year || Number(p.year) === y)
    && !((p.items || []).length && p.items.every(i => i.done)));
}
function renderReminders(){
  const box = $("#rems");
  if (!state.me || remsOff()) { box.hidden = true; box.innerHTML = ""; applyLayout(); return; }
  const list = dueReminders(), now = new Date(), m = ym(now), mine = catsOf(state.me);
  const remKeys = new Set(list.map(r => r.key));
  // tâches du mois (sans jour) non faites + tâches prévues aujourd'hui (jour fixe / date) non faites
  const tasks = state.tasks.filter(t => mine.includes(taskCat(t)) && (
      taskSched(t) === "month" ? (taskIn(t, m) && !taskDone(t, m) && !remKeys.has("t" + t.id + "@" + m))
      : (taskOnDay(t, now) && !taskDoneOn(t, now) && !remKeys.has("t" + t.id + "@" + ymd(now)))))
    .sort((a,b) => (taskSched(b) !== "month") - (taskSched(a) !== "month") || (a.title||"").localeCompare(b.title||""));
  const projs = projectsOfMonth(now).filter(p => mine.includes(p.cat || "commun")).sort((a,b) => (a.title||"").localeCompare(b.title||""));
  const n = list.length + tasks.length + projs.length;
  box.hidden = false;
  const open = state.remsOpen && n > 0;
  const mn = now.toLocaleDateString("fr-FR", {month:"long"}), deMonth = (/^[aeiouy]/i.test(mn) ? "d'" : "de ") + mn;
  const MAX = 4;
  let body = list.map(r => `
    <div class="rem ${catInfo(r.cat).cls}"><span class="dot"></span>
      <span class="txt"><b>${esc(r.title)}</b><br><span class="m">${r.label}</span></span>
      <button data-vu="${esc(r.key)}">Vu</button></div>`).join("");
  if (tasks.length) body += `<div class="rem-sub">Tâches · ${tasks.length} à faire</div>` + tasks.slice(0, MAX).map(t => { const day = taskSched(t) !== "month"; return `
    <div class="rem ${catInfo(taskCat(t)).cls}"><span class="dot"></span>
      <button class="txt linklike" data-edtk="${esc(t.id)}"><b>${iconTag(t)}${esc(t.title)}</b><br><span class="m">${day ? "aujourd'hui" : "ce mois-ci" + (t.remindDay > 0 ? " · rappel le " + t.remindDay : "")}</span></button>
      <button data-qdone="${esc(t.id)}" ${taskSched(t) === "weekdays" ? `data-qday="${ymd(now)}"` : ""} aria-label="Marquer « ${esc(t.title)} » comme faite">Faite</button></div>`; }).join("")
    + (tasks.length > MAX ? `<button class="more-link" data-tab="tasks">Voir les ${tasks.length} tâches ›</button>` : "");
  if (projs.length) body += `<div class="rem-sub">Projets ${deMonth}</div>` + projs.slice(0, MAX).map(p => {
    const items = p.items || [], d = items.filter(i => i.done).length;
    return `<div class="rem ${catInfo(p.cat || "commun").cls}"><span class="dot"></span>
      <button class="txt linklike" data-edpj="${esc(p.id)}"><b>${esc(p.title)}</b><br><span class="m">${KINDS[p.kind] || "Projet"}${items.length ? ` · ${d}/${items.length} étapes` : ""}</span></button></div>`;
  }).join("") + (projs.length > MAX ? `<button class="more-link" data-tab="proj">Voir les ${projs.length} projets ›</button>` : "");
  box.innerHTML = `<button class="rems-head" id="remsToggle" aria-expanded="${open}" ${n ? "" : "disabled"}>${BELL}<span>Rappels</span>${n ? `<span class="rcount">${n}</span>` : `<span class="none">aucun pour l'instant</span>`}${n ? '<span class="chev"></span>' : ""}</button>`
    + (open ? `<div class="rems-body">${body}</div>` : "");
  applyLayout();
}
setInterval(renderReminders, 60000);

/* ---------- rendu : calendrier ---------- */
const THEMES = {
  auto:{label:"Auto", hint:"comme le téléphone"},
  clair:{label:"Clair", hint:"gris bleuté", bg:"#eef1f4", ac:"#2f4a6d"},
  sombre:{label:"Sombre", hint:"ardoise", bg:"#131820", ac:"#8fb2e0"},
  sable:{label:"Sable", hint:"clair et chaud", bg:"#f4eee5", ac:"#8a5a3a"},
  ocean:{label:"Océan", hint:"clair et bleu", bg:"#e9f1f7", ac:"#1f6a9a"},
  nuit:{label:"Nuit", hint:"sombre bleu nuit", bg:"#0d1322", ac:"#86b3ff"},
  foret:{label:"Forêt", hint:"sombre vert", bg:"#0f1913", ac:"#7fd1a0"},
};
// Thème du profil (enregistré dans ses réglages), sinon le dernier utilisé sur ce téléphone
function applyTheme(){
  let th = (state.me && state.settings[state.me]?.theme) || store.get("cc-theme") || "auto";
  if (!THEMES[th]) th = "auto";
  if (th === "auto") delete document.documentElement.dataset.ct; else document.documentElement.dataset.ct = th;
  store.set("cc-theme", th);
  return th;
}
const remsOff = () => ((state.me && state.settings[state.me]?.hide) || []).includes("rems");
const visItem = (cat, x) => visible(cat) && (x.shared !== false || state.mode === "moi");
function eventsOn(dateStr){
  const d = parse(dateStr);
  return state.events.filter(e => visItem(e.cat, e) && occursOn(e, d)).sort((a,b) => (a.time||"99").localeCompare(b.time||"99"));
}
// Tout ce qui apparaît un jour donné : événements + rappels de tâches et de projets
function itemsOn(dateStr){
  const d = parse(dateStr);
  const all = eventsOn(dateStr);
  const ev = all.filter(e => !isBday(e)).map(e => ({kind: ICONS[e.icon] ? "evi" : "ev", id:e.id, cat:e.cat, time:e.time || "", ref:e}));
  const bd = all.filter(isBday).map(e => ({kind:"bd", id:e.id, cat:e.cat, time:"", ref:e}));
  const tk = state.tasks.filter(t => visItem(taskCat(t), t) && taskRemOn(t, d)).map(t => ({kind: ICONS[t.icon] ? "tki" : "tk", id:t.id, cat:taskCat(t), time: taskSched(t) === "month" ? (t.remindTime || "09:00") : (t.remindOn ? t.remindTime || "09:00" : ""), ref:t}));
  const pj = state.projects.filter(p => visItem(p.cat || "commun", p) && projRemOn(p, d)).map(p => ({kind:"pj", id:p.id, cat:p.cat || "commun", time:p.remindTime || "09:00", ref:p}));
  return [...ev.sort((a,b) => (a.time||"99").localeCompare(b.time||"99")), ...[...tk, ...pj].sort((a,b) => (a.time||"99").localeCompare(b.time||"99")), ...bd];
}
function renderModes(){
  const me = state.me;
  const opts = me ? [["moi","Mon planning"],["autre","Planning de " + WHO[OTHER[me]]],["tout","Tout"]] : [["tout","Tout"]];
  if (!opts.some(([k]) => k === state.mode)) state.mode = opts[0][0];
  $("#modes").innerHTML = opts.map(([k,l]) => `<button data-mode="${k}" aria-pressed="${state.mode===k}">${l}</button>`).join("");
  $("#legend").innerHTML = allCats().filter(c => visible(c.id)).map(c => `<span class="${c.cls}"><span class="dot"></span>${esc(c.label)}</span>`).join("");
  $("#profileBtn").textContent = me ? `Profil : ${WHO[me]} ›` : "Choisir mon profil ›";
}
function renderCal(){
  const v = state.view;
  $("#monthLabel").textContent = fmtMonth(v);
  const first = new Date(v.getFullYear(), v.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay()+6)%7));
  let h = ["L","M","M","J","V","S","D"].map(x => `<div class="dow">${x}</div>`).join("");

  for (let i = 0; i < 42; i++){
    const d = new Date(start); d.setDate(start.getDate()+i);
    const LIGHT = ["bd", "evi", "tki"];
    const s = ymd(d), items = itemsOn(s), evs = items.filter(it => !LIGHT.includes(it.kind)), bds = items.filter(it => it.kind === "bd"), lights = items.filter(it => LIGHT.includes(it.kind));
    const cls = ["day", d.getMonth()!==v.getMonth()?"out":"", s===ymd(today)?"today":"", s===state.sel?"sel":"", evs.length ? "has" : ""].join(" ");
    // Case découpée en une bande par élément (3 au plus, sinon « +N »), à la couleur de sa catégorie, avec l'acronyme
    const shown = evs.length > 3 ? evs.slice(0, 2) : evs, extra = evs.length - shown.length;
    const chips = shown.map(it => `<span class="band ${catInfo(it.cat).cls}">${esc(shortLabel(it.ref))}</span>`).join("")
      + (extra > 0 ? `<span class="band more">+${extra}</span>` : "");
    // Anniversaires : petite icône gâteau dans le coin, la journée reste libre
    // Éléments non bloquants (anniversaires, tâches et événements avec icône) : petites icônes dans le coin
    const mk = it => it.kind === "bd" ? `<span class="mk ${catInfo(it.cat).cls}">${CAKE}</span>` : `<span class="mk cx" style="--x:${iconHex(it.ref)}">${iconSvg(it.ref.icon)}</span>`;
    // toutes les icônes (4 au plus) ; fitMarks() retire ensuite celles qui n'ont pas la place et affiche « +X »
    const shownL = lights.slice(0, 4);
    const cake = lights.length ? `<span class="marks" data-n="${lights.length}">${shownL.map(mk).join("")}${lights.length > shownL.length ? `<span class="mkn">+${lights.length - shownL.length}</span>` : ""}</span>` : "";
    const label = [...evs.map(it => it.ref.title), ...lights.map(it => (it.kind === "bd" ? "anniversaire de " : "") + it.ref.title)];
    h += `<button class="${cls}" data-d="${s}" aria-label="${fmtDay(d)}, ${label.length} élément(s)${label.length ? " : " + esc(label.join(", ")) : ""}"><span class="dtop"><span class="n">${d.getDate()}</span>${cake}</span>${chips}</button>`;
    if (i === 34 && d.getMonth() !== v.getMonth()) break;
  }
  $("#grid").innerHTML = h;
  fitMarks();
  $("#dayLabel").textContent = fmtDay(parse(state.sel)).replace(/^./, c => c.toUpperCase());
  const selD = parse(state.sel);
  const evs = itemsOn(state.sel);
  $("#dayList").innerHTML = evs.length ? evs.map(it => {
    const c = catInfo(it.cat);
    if (it.kind === "tki" || it.kind === "tk") return taskRow(it.ref, ym(selD), selD, "dtk");
    if (it.kind === "tki" || it.kind === "evi") { const x = it.ref, isT = it.kind === "tki"; return `
    <button class="ev bdlight ${c.cls}" ${isT ? `data-edtk="${esc(x.id)}"` : `data-ev="${esc(x.id)}"`}><span class="bar"></span>
      <span style="min-width:0"><span class="t">${iconTag(x)}${esc(x.title)}</span><br><span class="m">${[x.time || (isT ? x.remindTime : "") ? esc(x.time || x.remindTime) : "", isT ? "Tâche du mois" : repeatText(x), isT && taskDone(x, ym(selD)) ? "faite" : "", "ne bloque pas la journée"].filter(Boolean).join(" · ")}</span></span>
      <span class="tag">${esc(c.label)}</span></button>`; }
    if (it.kind === "tk") { const t = it.ref, done = taskDone(t, ym(selD)); return `
    <button class="ev ${c.cls}" data-edtk="${esc(t.id)}"><span class="bar"></span>
      <span style="min-width:0"><span class="t">${acrTag(t)}${esc(t.title)}</span><br><span class="m">${[esc(it.time), "Tâche du mois", BELL + " rappel", done ? "faite" : ""].filter(Boolean).join(" · ")}</span></span>
      <span class="tag">${esc(c.label)}</span></button>`; }
    if (it.kind === "pj") { const p = it.ref; return `
    <button class="ev ${c.cls}" data-edpj="${esc(p.id)}"><span class="bar"></span>
      <span style="min-width:0"><span class="t">${acrTag(p)}${esc(p.title)}</span><br><span class="m">${[esc(it.time), "Projet", BELL + " rappel"].join(" · ")}</span></span>
      <span class="tag">${esc(c.label)}</span></button>`; }
    if (it.kind === "bd") { const e = it.ref, by = birthYear(e), age = by ? selD.getFullYear() - by : null; return `
    <button class="ev bdlight ${c.cls}" data-bd="${esc(e.id)}"><span class="bar"></span>
      <span style="min-width:0"><span class="t"><span class="cake-i">${CAKE.replace("<svg", '<svg width="15" height="15"')}</span>Anniversaire de ${esc(e.title)}</span><br><span class="m">${[age ? age + " ans" : "", e.gift ? "idée cadeau : " + esc(e.gift) : ""].filter(Boolean).join(" · ") || "Ne bloque pas la journée"}</span></span>
      <span class="tag">${esc(c.label)}</span></button>`; }
    const e = it.ref, rt = repeatText(e), pi = dayInPeriod(e, selD), pn = spanDays(e) + 1; return `
    <button class="ev ${c.cls}" data-ev="${esc(e.id)}" data-occ="${state.sel}">
      <span class="bar"></span>
      <span style="min-width:0"><span class="t">${acrTag(e)}${esc(e.title)}</span><br><span class="m">${[movedTo(e, state.sel) ? "déplacé du " + parse(movedTo(e, state.sel).d).toLocaleDateString("fr-FR", {weekday:"short", day:"numeric", month:"short"}) : "", pi ? `jour ${pi} sur ${pn} (${periodText(e)})` : "", e.time ? esc(e.time) : "", rt, SOURCES[e.source] && e.source !== "manuel" ? SOURCES[e.source] : "", hasRem(e) ? BELL + " " + remText(e) : "", e.example ? "exemple" : ""].filter(Boolean).join(" · ")}</span></span>
      <span class="tag">${esc(c.label)}</span>
    </button>`; }).join("")
    : `<div class="empty">Rien de prévu ce jour-là. Touchez « + Activité » pour en ajouter une.</div>`;
  const skipped = [
    ...state.events.filter(e => visItem(e.cat, e) && skipOf(e, state.sel)).map(e => ({col:"events", x:e, cat:e.cat})),
    ...state.tasks.filter(t => visItem(taskCat(t), t) && skipOf(t, state.sel)).map(t => ({col:"tasks", x:t, cat:taskCat(t)}))];
  if (skipped.length) $("#dayList").insertAdjacentHTML("beforeend", `<div class="group-title">Retiré ou déplacé ce jour</div>` + skipped.map(({col, x, cat}) => {
    const sk = skipOf(x, state.sel), c = catInfo(cat);
    return `<div class="ev skipped ${c.cls}"><span class="bar"></span>
      <span style="min-width:0"><span class="t">${iconTag(x)}${esc(x.title)}</span><br><span class="m">${[sk.to ? "déplacé au " + esc(parse(sk.to).toLocaleDateString("fr-FR", {weekday:"long", day:"numeric", month:"long"})) : "", sk.note ? "« " + esc(sk.note) + " »" : sk.to ? "" : "sans commentaire", sk.by ? "par " + esc(WHO[sk.by] || "") : ""].filter(Boolean).join(" · ")}</span></span>
      <button class="edit" data-unskip="${col}" data-id="${esc(x.id)}" data-day="${state.sel}">Rétablir</button></div>`; }).join(""));
  renderMonthPart();
}
// Icônes d'une case : on retire celles qui ne tiennent pas à droite du numéro et on affiche « +X »
// Taille des icônes : 10 px au minimum, au plus la taille du numéro du jour, selon la place dans la case
const MK_MIN = 10;
function fitMarks(){
  document.querySelectorAll("#grid .marks").forEach(m => {
    const total = Number(m.dataset.n) || 0;
    const num = m.parentElement.querySelector(".n");
    const max = Math.max(MK_MIN, Math.round((num ? parseFloat(getComputedStyle(num).fontSize) : 13) * 1.15));
    const icons0 = m.querySelectorAll(".mk").length, extra = m.querySelector(".mkn") ? m.querySelector(".mkn").getBoundingClientRect().width : 0;
    const gap = parseFloat(getComputedStyle(m).columnGap) || 0;
    const room = m.clientWidth - extra - gap * Math.max(0, icons0 - 1 + (extra ? 1 : 0));
    const size = Math.max(MK_MIN, Math.min(max, Math.floor(room / Math.max(1, icons0))));
    m.style.setProperty("--mk", size + "px");
    let guard = 6;
    const need = () => [...m.children].reduce((w, x) => w + x.getBoundingClientRect().width, 0) + gap * Math.max(0, m.children.length - 1);
    let first = null;
    while (need() > m.clientWidth + 0.5 && guard-- > 0) {
      const icons = m.querySelectorAll(".mk");
      if (!icons.length) break;
      first = icons[0];
      icons[icons.length - 1].remove();
      let plus = m.querySelector(".mkn");
      if (!plus) { plus = document.createElement("span"); plus.className = "mkn"; m.append(plus); }
      plus.textContent = "+" + (total - m.querySelectorAll(".mk").length);
    }
    // après retrait, les icônes restantes grandissent si la place le permet (sans dépasser la taille du numéro)
    const left = m.querySelectorAll(".mk").length;
    if (left && first) {
      const plusW = m.querySelector(".mkn")?.getBoundingClientRect().width || 0;
      const s2 = Math.min(max, Math.floor((m.clientWidth - plusW - gap * (m.children.length - 1)) / left));
      if (s2 > size) { m.style.setProperty("--mk", s2 + "px"); if (need() > m.clientWidth + 0.5) m.style.setProperty("--mk", size + "px"); }
    }
    // pas assez de place pour « icône + +X » : on garde une icône, avec le « +X » en exposant dessus
    if (!m.querySelector(".mk") && first) {
      const plus = m.querySelector(".mkn");
      first.classList.add("with-n"); m.prepend(first); m.classList.add("tight");
      if (plus) { plus.classList.add("sup"); plus.textContent = "+" + (total - 1); first.append(plus); }
    }
  });
}
addEventListener("resize", () => { clearTimeout(fitMarks.t); fitMarks.t = setTimeout(() => renderCal(), 150); });
// Partie « le mois » : tâches, projets et anniversaires du mois affiché
function renderMonthPart(){
  const v = state.view, m = ym(v);
  $("#monthPartLabel").textContent = "Le mois · " + fmtMonth(v);
  const tasks = state.tasks.filter(t => visItem(taskCat(t), t) && taskIn(t, m)).sort((a,b) => (taskDone(a,m) - taskDone(b,m)) || (a.title||"").localeCompare(b.title||""));
  const projs = projectsOfMonth(v).filter(p => visItem(p.cat || "commun", p)).sort((a,b) => (a.title||"").localeCompare(b.title||""));
  const bds = state.events.filter(e => isBday(e) && e.date && parse(e.date).getMonth() === v.getMonth() && visItem(e.cat, e)).sort((a,b) => parse(a.date).getDate() - parse(b.date).getDate());
  let html = "";
  if (tasks.length) {
    const done = tasks.filter(t => taskDone(t, m)).length;
    html += `<div class="group-title">Tâches · ${done} sur ${tasks.length} faites</div>` + tasks.map(t => taskRow(t, m, null, "mtk")).join("");
  }
  if (projs.length) html += `<div class="group-title">Projets</div>` + projs.map(p => { const c = catInfo(p.cat || "commun"), items = p.items || [], d = items.filter(i => i.done).length; return `
      <button class="ev ${c.cls}" data-edpj="${esc(p.id)}"><span class="bar"></span>
        <span style="min-width:0"><span class="t">${acrTag(p)}${esc(p.title)}</span><br><span class="m">${[KINDS[p.kind] || "Projet", items.length ? `${d}/${items.length} étapes` : ""].filter(Boolean).join(" · ")}</span></span>
        <span class="tag">${esc(c.label)}</span></button>`; }).join("");
  if (bds.length) html += `<div class="group-title">Anniversaires</div>` + bds.map(e => { const c = catInfo(e.cat), s = parse(e.date), by = birthYear(e); return `
      <button class="ev bdlight ${c.cls}" data-bd="${esc(e.id)}"><span class="bar"></span>
        <span style="min-width:0"><span class="t"><span class="cake-i">${CAKE.replace("<svg", '<svg width="15" height="15"')}</span>${s.getDate()} ${MONTHS[s.getMonth()]} · ${esc(e.title)}</span><br><span class="m">${[by ? (v.getFullYear() - by) + " ans" : "", e.gift ? "idée cadeau : " + esc(e.gift) : ""].filter(Boolean).join(" · ")}</span></span>
        <span class="tag">${esc(c.label)}</span></button>`; }).join("");
  $("#monthPart").innerHTML = html || `<div class="empty">Aucune tâche, aucun projet ni anniversaire ce mois-ci.</div>`;
}
// Ordre et affichage des parties de l'onglet Calendrier, propres à chaque profil
const PARTS = {grid:"Calendrier", day:"Le jour sélectionné", month:"Le mois : tâches, projets, anniversaires"};
function getLayout(){
  const st = (state.me && state.settings[state.me]) || {};
  const order = (st.layout || []).filter(k => PARTS[k]);
  Object.keys(PARTS).forEach(k => { if (!order.includes(k)) order.push(k); });
  return {order, hide: (st.hide || []).filter(k => PARTS[k])};
}
function saveLayout(order, hide, extra = {}){
  if (!state.me) return;
  const next = {...(state.settings[state.me] || {}), layout: order, hide, ...extra};
  guard(rawSave("settings", state.me, next)); state.settings[state.me] = next;
  applyLayout(); renderSettings();
}
function applyLayout(){
  const {order, hide} = getLayout();
  document.querySelectorAll("#tab-cal > .part").forEach(el => {
    const k = el.dataset.part;
    // le choix du planning puis la ligne Rappels restent toujours en haut
    if (k === "modes") { el.style.order = -2; el.hidden = false; return; }
    if (k === "rems") { el.style.order = -1; el.hidden = $("#rems").hidden; return; }
    el.style.order = order.indexOf(k);
    el.hidden = hide.includes(k);
  });
}

/* ---------- rendu : tâches ---------- */
const taskRecur = t => t.recur || "once";
const taskCat = t => t.cat || (t.who === "manon" || t.who === "romain" ? t.who : t.who ? "commun" : "");
const taskSched = t => t.sched || "month";
const isoDow = d => (d.getDay() + 6) % 7 + 1;
const DAYS_LONG = ["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"];
const DAYS_SHORT = ["L","M","M","J","V","S","D"];
function taskOnDay(t, d){
  const s = taskSched(t), k = ymd(d);
  if (s === "weekdays" && everyOf(t) > 1 && !movedTo(t, k) && ((weekNum(d) - weekNum(parse(t.from || k))) % everyOf(t) + everyOf(t)) % everyOf(t) !== 0) return false;
  if (s === "weekdays" && movedTo(t, k)) return true;
  if (s === "weekdays") return (t.days || []).includes(isoDow(d)) && (!t.from || k >= t.from) && (!t.until || k <= t.until) && !skipOf(t, k);
  if (s === "dates" && taskRep(t) !== "none") {
    if (!t.date) return false;
    if (movedTo(t, k)) return true;
    if (skipOf(t, k) || (t.until && k > t.until)) return false;
    return occursBase({date: t.date, repeat: t.repeat, every: t.every}, d);
  }
  if (s === "dates") return !!t.date && k >= t.date && k <= (t.endDate && t.endDate > t.date ? t.endDate : t.date);
  return false;
}
function taskDaysIn(t, ymStr){
  const [y, m] = ymStr.split("-").map(Number), out = [];
  for (let d = 1; d <= lastDay(y, m - 1); d++) { const x = new Date(y, m - 1, d); if (taskOnDay(t, x)) out.push(x); }
  return out;
}
const taskDoneOn = (t, d) => perDay(t) ? (t.doneIn || []).includes(ymd(d)) : taskSched(t) === "dates" ? !!t.done : taskDone(t, ym(d));
function taskIn(t, ymStr){
  if (taskSched(t) !== "month") return taskDaysIn(t, ymStr).length > 0;
  const r = taskRecur(t), m = Number(ymStr.slice(5));
  if (r === "once") return t.month === ymStr;
  if (t.startMonth && ymStr < t.startMonth) return false;
  if (r === "monthly") { const n = everyOf(t), ref = t.startMonth || t.month; return n <= 1 || !ref || (monthNum(parse(ymStr + "-01")) - monthNum(parse(ref + "-01"))) % n === 0; }
  if (r === "months") return (t.months || []).includes(m);
  return false;
}
function taskDone(t, ymStr){
  const s = taskSched(t);
  if (perDay(t)) { const days = taskDaysIn(t, ymStr); return days.length > 0 && days.every(x => (t.doneIn || []).includes(ymd(x))); }
  if (s === "dates") return !!t.done;
  if (s === "weekdays") { const days = taskDaysIn(t, ymStr); return days.length > 0 && days.every(x => (t.doneIn || []).includes(ymd(x))); }
  return taskRecur(t) === "once" ? !!(t.done || (t.doneIn||[]).includes(ymStr)) : (t.doneIn||[]).includes(ymStr);
}
function taskRecurText(t){
  const s = taskSched(t);
  if (s === "weekdays") {
    const ds = (t.days || []).slice().sort().map(n => DAYS_LONG[n - 1]);
    const base = (everyOf(t) > 1 ? `Toutes les ${everyOf(t)} semaines : ` : "") + (ds.length ? (everyOf(t) > 1 ? "" : "Chaque ") + (ds.length > 1 ? ds.slice(0, -1).join(", ") + " et " + ds[ds.length - 1] : ds[0]) : "Jours à choisir");
    return [base, t.from && t.from > ymd(today) ? "à partir du " + fmtShort(t.from) : "", t.until ? "jusqu'au " + fmtShort(t.until) : "", t.remindOn ? "rappel " + leadText(Number(t.remindDays) || 0) + " à " + (t.remindTime || "09:00") + (t.push === false ? " (appli seulement)" : "") : ""].filter(Boolean).join(" · ");
  }
  if (s === "dates" && taskRep(t) !== "none") return [everyText(taskRep(t), everyOf(t)) + (t.date ? " depuis le " + fmtShort(t.date) : ""), t.until ? "jusqu'au " + fmtShort(t.until) : "", t.remindOn ? "rappel " + leadText(Number(t.remindDays) || 0) + " à " + (t.remindTime || "09:00") + (t.push === false ? " (appli seulement)" : "") : ""].filter(Boolean).join(" · ");
  if (s === "dates") return [t.endDate && t.endDate > t.date ? `du ${fmtShort(t.date)} au ${fmtShort(t.endDate)}` : t.date ? "le " + fmtShort(t.date) : "", t.remindOn ? "rappel " + leadText(Number(t.remindDays) || 0) + " à " + (t.remindTime || "09:00") + (t.push === false ? " (appli seulement)" : "") : ""].filter(Boolean).join(" · ");
  const r = taskRecur(t);
  const base = r === "monthly" ? everyText("monthly", everyOf(t)) : r === "months" ? "Chaque année en " + monthsLabel(t.months) : "";
  return [base, t.remindDay > 0 ? "rappel le " + t.remindDay + " à " + (t.remindTime || "09:00") + (t.push === false ? " (appli seulement)" : "") : ""].filter(Boolean).join(" · ");
}
function taskRow(t, m, d, prefix){
  const c = catInfo(taskCat(t)), s = taskSched(t), id = esc(t.id), mvd = d && movedTo(t, ymd(d));
  const rt = [mvd ? "déplacée du " + parse(mvd.d).toLocaleDateString("fr-FR", {weekday:"short", day:"numeric", month:"short"}) : "", taskRecurText(t)].filter(Boolean).join(" · ");
  let box, done;
  if (perDay(t) && !d) {
    const days = taskDaysIn(t, m), n = days.filter(x => (t.doneIn || []).includes(ymd(x))).length;
    done = days.length > 0 && n === days.length;
    box = `<span class="cnt" title="Faites ce mois-ci">${n}/${days.length}</span>`;
  } else {
    done = d ? taskDoneOn(t, d) : taskDone(t, m);
    box = `<input type="checkbox" id="${prefix}-${id}" data-tk="${id}" ${perDay(t) ? `data-tday="${ymd(d)}"` : `data-m="${m}"`} ${done ? "checked" : ""} aria-label="Faite">`;
  }
  return `<div class="task ${done ? "done" : ""} ${ICONS[t.icon] ? "light" : ""}">${box}
    <button class="t linklike" data-edtk="${id}" ${d ? `data-occ="${ymd(d)}"` : ""} aria-label="Modifier la tâche ${esc(t.title)}"><b>${iconTag(t)}${acrTag(t)}${esc(t.title)}</b>${rt || t.example ? `<br><span class="m">${[rt, t.example ? "exemple" : ""].filter(Boolean).join(" · ")}</span>` : ""}</button>
    <span class="tag ${c.cls}">${esc(c.label)}</span></div>`;
}
function renderTasks(){
  const m = ym(state.taskMonth);
  $("#taskMonth").textContent = fmtMonth(state.taskMonth);
  const mine = state.me ? catsOf(state.me) : [];
  const list = state.tasks.filter(t => taskIn(t, m)).sort((a,b) =>
    (taskDone(a,m) - taskDone(b,m)) || (mine.includes(taskCat(b)) - mine.includes(taskCat(a))) || (a.title||"").localeCompare(b.title||""));
  const done = list.filter(t => taskDone(t, m)).length;
  $("#taskBar").style.width = list.length ? (done/list.length*100) + "%" : "0";
  $("#taskCount").textContent = list.length ? `${done} sur ${list.length} faites` : "";
  $("#taskList").innerHTML = list.length ? list.map(t => taskRow(t, m, null, "tk")).join("")
    : `<div class="empty">Aucune tâche pour ce mois. Touchez « + Ajouter une tâche » (ménage, factures, courses…).</div>`;
}

/* ---------- rendu : projets ---------- */
function projectWhen(p){
  const parts = [];
  if (p.remindDate) parts.push("rappel le " + parse(p.remindDate).toLocaleDateString("fr-FR",{day:"numeric",month:"short"}));
  if (p.months?.length) parts.push(monthsLabel(p.months) + (p.yearly ? " · chaque année" : p.year ? " " + p.year : ""));
  else if (p.yearly) parts.push("chaque année");
  if (p.when) parts.push(esc(p.when));
  return parts.join(" · ");
}
function renderProjects(){
  const list = [...state.projects].sort((a,b) => (a.title||"").localeCompare(b.title||""));
  $("#projList").innerHTML = list.length ? list.map(p => {
    const items = p.items || [], d = items.filter(i => i.done).length, c = catInfo(p.cat || "commun"), when = projectWhen(p);
    return `<article class="proj">
      <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><span class="kind">${KINDS[p.kind] || "Projet"}${when ? " · " + when : ""}${p.example ? " · exemple" : ""}</span>
        <span class="row" style="flex-wrap:nowrap"><span class="tag ${c.cls}">${esc(c.label)}</span><button class="edit" data-edpj="${esc(p.id)}" aria-label="Modifier le projet ${esc(p.title)}">Modifier</button></span></div>
      <h2>${esc(p.title)}</h2>
      ${items.length ? `<div class="progress"><i style="width:${d/items.length*100}%"></i></div>` : ""}
      <ul>${items.map((it,i) => `<li class="${it.done ? "done" : ""}"><input type="checkbox" id="pj-${esc(p.id)}-${i}" data-pj="${esc(p.id)}" data-i="${i}" ${it.done ? "checked" : ""}><label for="pj-${esc(p.id)}-${i}"><span>${esc(it.t)}</span></label></li>`).join("")}</ul>
      <form class="addline" data-addto="${esc(p.id)}"><input type="text" id="add-${esc(p.id)}" placeholder="Ajouter une étape…" aria-label="Nouvelle étape"><button class="btn ghost">Ajouter</button></form>
    </article>`;
  }).join("") : `<div class="empty">Pas encore de projet. Touchez « + Nouveau projet » pour créer un projet travaux ou vacances.</div>`;
}

/* ---------- rendu : à classer ---------- */
function renderTodo(){
  const evs = unassignedEvents().sort((a,b) => (a.date||"").localeCompare(b.date||"") || (a.time||"").localeCompare(b.time||""));
  const tks = unassignedTasks();
  const chooser = (kind, id) => `<div class="pick" role="group" aria-label="Classer dans">${allCats().filter(c => c.id !== "anniv").map(c =>
    `<button type="button" class="${c.cls}" data-asg="${kind}" data-id="${esc(id)}" data-cat="${esc(c.id)}"><span class="dot"></span>${esc(c.label)}</button>`).join("")}</div>`;
  $("#todoList").innerHTML = [
    ...evs.map(e => { const d = e.date ? parse(e.date) : null; return `<div class="todo">
      <div class="head"><span style="min-width:0"><span class="t">${esc(e.title)}</span><br><span class="m">${[d ? fmtDay(d) : "", e.time ? esc(e.time) : "", SOURCES[e.source] || "", e.example ? "exemple" : ""].filter(Boolean).join(" · ")}</span></span>
        <button class="edit" data-ev="${esc(e.id)}">Ouvrir</button></div>
      ${chooser("events", e.id)}</div>`; }),
    ...tks.map(t => `<div class="todo">
      <div class="head"><span style="min-width:0"><span class="t">${esc(t.title)}</span><br><span class="m">Tâche du mois${t.month ? " · " + fmtMonth(parse(t.month + "-01")) : ""}</span></span>
        <button class="edit" data-edtk="${esc(t.id)}">Ouvrir</button></div>
      ${chooser("tasks", t.id)}</div>`)
  ].join("") || `<div class="empty">Rien à classer.</div>`;
}

/* ---------- rendu : anniversaires ---------- */
const MONTHS_LONG = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const isBday = e => !!e.isBirthday || e.cat === "anniv";
const birthYear = e => e.noYear ? null : Number((e.date || "").slice(0,4)) || null;
function annivInfo(e){
  const now = new Date(), midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const s = parse(e.date), todayIs = s.getMonth() === now.getMonth() && s.getDate() === now.getDate();
  // un anniversaire du jour reste en tête de liste toute la journée
  const next = todayIs ? midnight : nextOccurrence({...e, time:"00:00"}, midnight);
  const days = next ? Math.round((next - midnight)/864e5) : 999;
  const by = birthYear(e), age = by && next ? next.getFullYear() - by : null;
  return {next, days, age, todayIs};
}
function renderAnniv(){
  const all = state.events.filter(e => isBday(e) && e.date).map(e => ({e, ...annivInfo(e)})).sort((a,b) => a.days - b.days);
  const now = new Date(), q = norm(state.bdQuery);
  if (!all.length) { $("#annivList").innerHTML = `<div class="empty">Aucun anniversaire enregistré. Touchez « + Ajouter un anniversaire ».</div>`; return; }
  const list = q ? all.filter(x => norm(x.e.title).includes(q)) : all;
  if (!list.length) { $("#annivList").innerHTML = `<div class="empty">Aucun anniversaire ne correspond à « ${esc(state.bdQuery.trim())} ».</div>`; return; }
  const groups = q ? [[`${list.length} résultat${list.length > 1 ? "s" : ""}`, () => true]]
    : [["Ce mois-ci", x => x.next && x.next.getMonth() === now.getMonth() && x.next.getFullYear() === now.getFullYear()], ["À venir", () => true]];
  const used = new Set(); let html = "";
  for (const [label, test] of groups) {
    const items = list.filter(x => !used.has(x.e.id) && test(x)); if (!items.length) continue;
    items.forEach(x => used.add(x.e.id));
    html += `<div class="group-title">${label}</div>` + items.map(({e, days, age, todayIs}) => {
      const s = parse(e.date), c = catInfo(e.cat);
      const when = todayIs ? "Aujourd'hui" : days === 1 ? "Demain" : `Dans ${days} jours`;
      return `<button class="bday ${c.cls} ${todayIs ? "today-b" : ""}" data-bd="${esc(e.id)}">
        <span class="cal-chip"><b>${s.getDate()}</b><span>${MONTHS[s.getMonth()]}</span></span>
        <span style="min-width:0"><span class="t">${acrTag(e)}${esc(e.title)}</span>${e.cat !== "anniv" ? ` <span class="tag">${esc(c.label)}</span>` : ""}<br><span class="m">${age ? `${age} ans le ${s.getDate()} ${MONTHS_LONG[s.getMonth()]}` : `Le ${s.getDate()} ${MONTHS_LONG[s.getMonth()]}`}${hasRem(e) ? " · " + BELL + " " + remText(e) : ""}${e.example ? " · exemple" : ""}</span>${e.gift ? `<span class="m gift">Idée cadeau : ${esc(e.gift)}</span>` : ""}</span>
        <span class="soon">${when}</span></button>`;
    }).join("");
  }
  $("#annivList").innerHTML = html;
}

// Prochain anniversaire (aujourd'hui compris) pour un jour et un mois
function bdBase(day, month){
  let d = new Date(today.getFullYear(), month - 1, Math.min(day, lastDay(today.getFullYear(), month - 1)));
  if (d < today0()) d = new Date(today.getFullYear() + 1, month - 1, Math.min(day, lastDay(today.getFullYear() + 1, month - 1)));
  return ymd(d);
}
function birthdaySheet(e, day){
  const isNew = !e, s = e ? parse(e.date) : (day ? parse(day) : today), by = e ? birthYear(e) : null;
  const bdCats = bdCatOptions(), bdCat0 = e && bdCats.some(o => o.v === e.cat) ? e.cat : "anniv";
  openSheet(`
    <div class="eyebrow">${isNew ? "Nouvel anniversaire" : "Anniversaire"}</div>
    <form id="bdForm" class="stack">
      <div class="field"><label for="bdName">De qui ?</label><input type="text" id="bdName" value="${esc(e?.title || "")}" placeholder="Ex. Maman, Léa, Mamie Jeanne"></div>
      ${acrField(e?.acr)}
      <div class="row" style="flex-wrap:nowrap">
        <div class="field" style="flex:1;min-width:0"><label for="bdDay">Jour</label><select id="bdDay">${Array.from({length:31}, (_, i) => `<option value="${i+1}" ${i+1 === s.getDate() ? "selected" : ""}>${i+1}</option>`).join("")}</select></div>
        <div class="field" style="flex:2;min-width:0"><label for="bdMonth">Mois</label><select id="bdMonth">${MONTHS_LONG.map((m, i) => `<option value="${i+1}" ${i === s.getMonth() ? "selected" : ""}>${m}</option>`).join("")}</select></div>
      </div>
      <div class="field"><span class="lbl">Pour qui ?</span>${pick("bdfor", [{v:"commun", label:"Commun", cls:catInfo("commun").cls}, {v:"manon", label:"Manon", cls:catInfo("manon").cls}, {v:"romain", label:"Romain", cls:catInfo("romain").cls}], e ? bdOwner(e) : "commun")}
        <span class="note" id="bdForNote"></span></div>
      ${bdCats.length > 1 ? `<div class="field"><span class="lbl">Catégorie <span style="font-weight:400">(donne sa couleur)</span></span>${pick("cat", bdCats, bdCat0)}</div>` : ""}
      <div id="bdShared">${sharedField(e?.shared)}</div>
      <div class="field"><label for="bdYear">Année de naissance <span style="font-weight:400">(facultatif, pour afficher l'âge)</span></label><input type="number" id="bdYear" min="1900" max="${today.getFullYear()}" value="${by || ""}" placeholder="Ex. 1960"></div>
      <div class="field"><label for="bdGift">Idées cadeau</label><textarea id="bdGift" rows="3" placeholder="Ex. livre de cuisine, places de concert, taille M…">${esc(e?.gift || "")}</textarea></div>
      ${reminderField(e, "Un délai avant se compte à partir de 9 h le jour de l'anniversaire.", bdBase(s.getDate(), s.getMonth() + 1))}
      <div class="row" style="justify-content:space-between">
        ${isNew ? "<span></span>" : `<button type="button" class="btn danger" id="bdDel">Supprimer</button>`}
        <div class="row"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn">${isNew ? "Ajouter" : "Enregistrer"}</button></div>
      </div>
    </form>`, sh => {
    const curBase = () => bdBase(Number(sh.querySelector("#bdDay").value), Number(sh.querySelector("#bdMonth").value));
    wireReminder(sh, curBase, () => true);
    ["#bdDay","#bdMonth"].forEach(q => sh.querySelector(q).addEventListener("change", () => sh.__remRebase()));
    const forNote = v => { sh.querySelector("#bdForNote").textContent = v === "commun" ? "Visible par Manon et Romain." : `Visible seulement dans le profil de ${WHO[v]}.`; sh.querySelector("#bdShared").hidden = v !== "commun"; };
    forNote(e ? bdOwner(e) : "commun");
    onPick.bdfor = (v, root) => { if (root === sh) forNote(v); };
    sh.querySelector("#bdForm").addEventListener("submit", ev => {
      ev.preventDefault();
      const rem = readReminder(sh, curBase()); if (rem === null) return;
      const title = sh.querySelector("#bdName").value.trim();
      if (!title) { toast("Indiquez de qui c'est l'anniversaire."); return; }
      const day = Number(sh.querySelector("#bdDay").value), month = Number(sh.querySelector("#bdMonth").value);
      const yRaw = sh.querySelector("#bdYear").value.trim(), y = Number(yRaw);
      if (yRaw && !(y >= 1900 && y <= today.getFullYear())) { toast("L'année de naissance doit être entre 1900 et " + today.getFullYear() + "."); return; }
      if (day > lastDay(yRaw ? y : 2000, month - 1)) { toast("Cette date n'existe pas."); return; }
      const data = {title, acr: readAcr(sh), shared: readShared(sh), gift: sh.querySelector("#bdGift").value.trim(), cat: getPick(sh, "cat") || "anniv", bdFor: getPick(sh, "bdfor") || "commun", isBirthday: true, repeat:"yearly", months:[], time:"", source: e?.source || "manuel",
        date: `${yRaw ? y : 2000}-${pad(month)}-${pad(day)}`, noYear: !yRaw, ...rem};
      guard(isNew ? save("events", newId(), data) : patch("events", e.id, data));
      closeSheet(); toast(isNew ? "Anniversaire ajouté" : "Anniversaire enregistré"); render();
    });
    armDelete(sh.querySelector("#bdDel"), "Confirmer la suppression", () => { guard(remove("events", e.id)); closeSheet(); toast("Anniversaire supprimé"); });
  });
}

/* ---------- rendu : nouveautés ---------- */
const VERBS = {ajout:"a ajouté", modification:"a modifié", suppression:"a supprimé", annulation:"a annulé un changement sur"};
const seenAt = () => (state.settings.seen || {})[state.me] || "";
function unseenNews(){
  if (!state.me) return [];
  const since = seenAt();
  return state.log.filter(l => l.by && l.by !== state.me && (!l.onlyFor || l.onlyFor === state.me) && (l.at || "") > since).sort((a,b) => (b.at || "").localeCompare(a.at || ""));
}
function ago(iso){
  const m = Math.round((Date.now() - new Date(iso).getTime())/60000);
  if (m < 1) return "à l'instant"; if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m/60); if (h < 24) return `il y a ${h} h`;
  return new Date(iso).toLocaleDateString("fr-FR", {weekday:"short", day:"numeric", month:"short"});
}
function renderNews(){
  const list = unseenNews(), other = state.me ? WHO[OTHER[state.me]] : "";
  $("#newsIntro").textContent = list.length ? `${other} a fait ${list.length} changement${list.length > 1 ? "s" : ""} depuis votre dernière visite.` : "";
  $("#newsList").innerHTML = list.map(l => {
    const col = l.col, item = (state[col] || []).find(x => x.id === l.itemId);
    const c = catInfo(item ? (col === "tasks" ? taskCat(item) : item.cat || (col === "projects" ? "commun" : "")) : "");
    const open = item && l.verb !== "suppression" ? (col === "events" ? (isBday(item) ? `data-bd="${esc(item.id)}"` : `data-ev="${esc(item.id)}"`) : col === "tasks" ? `data-edtk="${esc(item.id)}"` : col === "projects" ? `data-edpj="${esc(item.id)}"` : col === "categories" ? `data-edcat="${esc(item.id)}"` : "") : "";
    return `<div class="news ${c.cls}"><span class="bar"></span>
      <span class="t"><b>${esc(WHO[l.by] || "Quelqu'un")}</b> <span class="verb-${esc(l.verb)}">${VERBS[l.verb] || "a changé"}</span> ${({"événement":"l'événement", anniversaire:"l'anniversaire", "tâche":"la tâche", projet:"le projet", "catégorie":"la catégorie"})[l.kind] || ""} « ${esc(l.title)} »<br><span class="m">${ago(l.at)}${l.note ? " · " + esc(l.note) : ""}</span></span>
      ${open ? `<button class="edit" ${open}>Voir</button>` : "<span></span>"}</div>`;
  }).join("");
}
async function markSeen(){
  const me = state.me, prev = JSON.parse(JSON.stringify(state.settings.seen || {})), n = unseenNews().length;
  const next = {...prev, [me]: new Date().toISOString()};
  state.settings.seen = next;
  try { await rawSave("settings", "seen", next); } catch {}
  pushUndo({label: `« Tout marquer comme vu » (${n} nouveauté${n > 1 ? "s" : ""})`, custom: async () => {
    const restored = {...(state.settings.seen || {})};
    if (prev[me]) restored[me] = prev[me]; else delete restored[me];
    state.settings.seen = restored; await rawSave("settings", "seen", restored); render(); },
    redo: async () => { const again = {...(state.settings.seen || {}), [me]: next[me]}; state.settings.seen = again; await rawSave("settings", "seen", again); render(); }});
  goTab("cal");
}

/* ---------- rendu : tout ---------- */
const ALL_TYPES = {all:"Tout", ev:"Événements", tk:"Tâches", pj:"Projets", bd:"Anniversaires"};
function allItems(){
  const dShort = s => s ? parse(s).toLocaleDateString("fr-FR", {day:"numeric", month:"short", year:"numeric"}) : "";
  const evs = state.events.filter(e => !isBday(e)).sort((a,b) => (a.date||"").localeCompare(b.date||"")).map(e => ({type:"ev", ref:e, cat:e.cat, attr:`data-ev="${esc(e.id)}"`,
    meta:[periodText(e) || dShort(e.date), e.time ? esc(e.time) : "", repeatText(e), e.source && e.source !== "manuel" ? SOURCES[e.source] : ""]}));
  const tks = state.tasks.slice().sort((a,b) => (a.title||"").localeCompare(b.title||"")).map(t => ({type:"tk", ref:t, cat:taskCat(t), attr:`data-edtk="${esc(t.id)}"`,
    meta:[taskRecurText(t) || (t.month ? fmtMonth(parse(t.month + "-01")) : "")]}));
  const pjs = state.projects.slice().sort((a,b) => (a.title||"").localeCompare(b.title||"")).map(p => ({type:"pj", ref:p, cat:p.cat || "commun", attr:`data-edpj="${esc(p.id)}"`,
    meta:[KINDS[p.kind] || "Projet", projectWhen(p)]}));
  const bds = state.events.filter(isBday).map(e => ({e, i:annivInfo(e)})).sort((a,b) => a.i.days - b.i.days).map(({e}) => { const s = parse(e.date);
    return {type:"bd", ref:e, cat:e.cat, attr:`data-bd="${esc(e.id)}"`, meta:[`${s.getDate()} ${MONTHS_LONG[s.getMonth()]}`, e.gift ? "idée cadeau notée" : ""]}; });
  return [...evs, ...tks, ...pjs, ...bds];
}
// Recherche dans toutes les activités (titre, acronyme, idée cadeau), filtrable par sous-onglet
function renderAll(){
  const q = norm(state.allQuery), searching = !!q;
  $("#actFilter").hidden = !searching;
  if (!searching) return;
  $("#actFilter").innerHTML = Object.entries(ALL_TYPES).map(([k,l]) => `<button type="button" data-alltype="${k}" aria-pressed="${state.allType === k}">${l}</button>`).join("");
  const order = {ev:0, tk:1, pj:2, bd:3};
  const items = allItems().filter(x => (state.allType === "all" || x.type === state.allType)
      && (norm(x.ref.title).includes(q) || norm(x.ref.acr).includes(q) || norm(x.ref.gift).includes(q)))
    .sort((a,b) => order[a.type] - order[b.type]);
  if (!items.length) { $("#resultsList").innerHTML = `<div class="empty">Rien ne correspond à « ${esc(state.allQuery.trim())} »${state.allType !== "all" ? " dans " + ALL_TYPES[state.allType].toLowerCase() : ""}.</div>`; return; }
  let html = "", last = "";
  for (const x of items) {
    if (x.type !== last) { last = x.type; html += `<div class="group-title">${ALL_TYPES[x.type]} · ${items.filter(i => i.type === x.type).length}</div>`; }
    const c = catInfo(x.cat);
    html += `<button class="ev ${c.cls}" ${x.attr}><span class="bar"></span>
      <span style="min-width:0"><span class="t">${iconTag(x.ref)}${acrTag(x.ref)}${esc(x.ref.title)}</span><br><span class="m">${x.meta.filter(Boolean).join(" · ")}${x.ref.example ? " · exemple" : ""}</span></span>
      <span class="tag">${esc(c.label)}</span></button>`;
  }
  $("#resultsList").innerHTML = html;
}
// Sous-onglet Événements : tous les événements (hors anniversaires), triés, passés masquables
// Sous-onglet Événements : les événements d'un mois donné (hors anniversaires)
function renderEvents(){
  if (!state.evMonth) state.evMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const v = state.evMonth, y = v.getFullYear(), mo = v.getMonth(), n = lastDay(y, mo);
  $("#evMonthLabel").textContent = fmtMonth(v);
  $("#hidePast").checked = state.hidePast; $("#evSort").value = state.evSort;
  const all = [];
  for (const e of state.events) {
    if (isBday(e) || !e.date) continue;
    const days = [];
    for (let d = 1; d <= n; d++) { const x = new Date(y, mo, d); if (occursOn(e, x)) days.push(x); }
    if (!days.length) continue;
    const lastD = days[days.length - 1], end = new Date(lastD.getFullYear(), lastD.getMonth(), lastD.getDate(), ...(e.time ? e.time.split(":").map(Number) : [23, 59]));
    all.push({e, ref: days[0], count: days.length, past: end < new Date()});
  }
  const nPast = all.filter(x => x.past).length;
  const list = all.filter(x => !(state.hidePast && x.past));
  const by = state.evSort;
  list.sort((a,b) => by === "title" ? (a.e.title||"").localeCompare(b.e.title||"")
    : by === "cat" ? catInfo(a.e.cat).label.localeCompare(catInfo(b.e.cat).label) || (a.ref - b.ref)
    : (a.past - b.past) || (a.ref - b.ref) || (a.e.time||"").localeCompare(b.e.time||""));
  if (!list.length) {
    $("#eventsList").innerHTML = `<div class="empty">${all.length ? `Aucun événement à venir en ${fmtMonth(v)}. ${nPast} événement${nPast > 1 ? "s" : ""} passé${nPast > 1 ? "s" : ""} masqué${nPast > 1 ? "s" : ""}.` : `Aucun événement en ${fmtMonth(v)}.`}</div>`;
    return;
  }
  let html = "", last = null;
  for (const {e, ref, count, past} of list) {
    const group = by === "date" ? (past ? "Passés" : "À venir") : by === "cat" ? catInfo(e.cat).label : null;
    if (group !== null && group !== last) { last = group; html += `<div class="group-title">${esc(group)}</div>`; }
    const c = catInfo(e.cat), rt = repeatText(e), pt = periodText(e);
    html += `<button class="ev with-date ${c.cls} ${past ? "past" : ""}" data-ev="${esc(e.id)}"><span class="bar"></span>
      <span class="evdate"><b>${ref.getDate()}</b><span>${MONTHS[ref.getMonth()]}</span></span>
      <span style="min-width:0"><span class="t">${iconTag(e)}${acrTag(e)}${esc(e.title)}</span><br><span class="m">${[
        pt || ref.toLocaleDateString("fr-FR", {weekday:"long"}), e.time ? esc(e.time) : "",
        rt ? rt + (count > 1 && !pt ? ` · ${count} fois ce mois-ci` : "") : "", e.source && e.source !== "manuel" ? SOURCES[e.source] : "",
        hasRem(e) ? BELL + " " + remText(e) : "", e.shared === false ? "non partagé" : "", past ? "passé" : ""].filter(Boolean).join(" · ")}</span></span>
      <span class="tag">${esc(c.label)}</span></button>`;
  }
  if (state.hidePast && nPast) html += `<p class="note" style="text-align:center">${nPast} événement${nPast > 1 ? "s" : ""} passé${nPast > 1 ? "s" : ""} masqué${nPast > 1 ? "s" : ""} ce mois-ci.</p>`;
  $("#eventsList").innerHTML = html;
}
function createSheet(day){
  const T = (k, label, hint) => `<button type="button" data-create="${k}"><span style="display:block">${label}</span><span class="note" style="display:block;font-weight:400;margin-top:4px">${hint}</span></button>`;
  openSheet(`<div class="eyebrow">Nouvelle activité${day ? " · " + esc(parse(day).toLocaleDateString("fr-FR", {weekday:"long", day:"numeric", month:"long"})) : ""}</div><h2>Que voulez-vous ajouter ?</h2>
    <div class="typepick">${T("ev", "Événement", "rendez-vous, sortie, période")}${T("tk", "Tâche", "ménage, poubelles, factures")}
    ${T("pj", "Projet", "travaux, vacances")}${T("bd", "Anniversaire", "date, âge, idée cadeau")}</div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-close>Annuler</button></div>`, sh => {
    sh.addEventListener("click", e => { const b = e.target.closest("[data-create]"); if (!b) return;
      ({ev:() => eventSheet(null), tk:() => taskSheet(null, null, day), pj:() => projectSheet(null, day), bd:() => birthdaySheet(null, day)})[b.dataset.create](); });
  });
}

/* ---------- sélecteur de mois et d'année ---------- */
function monthPicker(cur, onChoose){
  let y = cur.getFullYear();
  openSheet(`<div class="eyebrow">Aller à</div>
    <div class="row" style="justify-content:space-between;flex-wrap:nowrap">
      <button type="button" class="iconbtn" id="mpPrev" aria-label="Année précédente">‹</button><h2 id="mpYear" style="font-variant-numeric:tabular-nums"></h2>
      <button type="button" class="iconbtn" id="mpNext" aria-label="Année suivante">›</button></div>
    <div class="mgrid">${MONTHS_LONG.map((m,i) => `<button type="button" class="mcell" data-mp="${i}">${m}</button>`).join("")}</div>
    <div class="row" style="justify-content:space-between"><button type="button" class="btn ghost" id="mpToday">Aujourd'hui</button><button type="button" class="btn ghost" data-close>Fermer</button></div>`, sh => {
    const draw = () => {
      sh.querySelector("#mpYear").textContent = y;
      sh.querySelectorAll("[data-mp]").forEach(b => {
        b.setAttribute("aria-pressed", y === cur.getFullYear() && +b.dataset.mp === cur.getMonth());
        b.classList.toggle("now", y === today.getFullYear() && +b.dataset.mp === today.getMonth());
      });
    };
    sh.querySelector("#mpPrev").onclick = () => { y--; draw(); };
    sh.querySelector("#mpNext").onclick = () => { y++; draw(); };
    sh.querySelector("#mpToday").onclick = () => { closeSheet(); onChoose(new Date(today.getFullYear(), today.getMonth(), 1)); };
    sh.addEventListener("click", e => { const b = e.target.closest("[data-mp]"); if (b) { closeSheet(); onChoose(new Date(y, +b.dataset.mp, 1)); } });
    draw();
  });
}
function showCalMonth(d){
  state.view = d;
  state.sel = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() ? ymd(today) : ymd(d);
  renderCal();
}

/* ---------- rendu : paramètres ---------- */
const AUDIT_TYPES = {all:"Tout", ajout:"Ajouts", suppression:"Suppressions"};
function renderAudit(){
  $("#setTabs").innerHTML = [["prefs","Réglages"],["audit","Historique"]].map(([k,l]) => `<button data-setsub="${k}" aria-pressed="${state.setSub === k}">${l}</button>`).join("");
  $("#setPrefs").hidden = state.setSub !== "prefs"; $("#setAudit").hidden = state.setSub !== "audit";
  $("#auditFilter").innerHTML = Object.entries(AUDIT_TYPES).map(([k,l]) => `<button type="button" data-audit="${k}" aria-pressed="${state.auditType === k}">${l}</button>`).join("");
  const rows = state.log.filter(l => (!l.onlyFor || l.onlyFor === state.me) && (l.verb === "ajout" || l.verb === "suppression") && ["events","tasks","projects"].includes(l.col)
      && (state.auditType === "all" || l.verb === state.auditType)).sort((a,b) => (b.at || "").localeCompare(a.at || ""));
  if (!rows.length) { $("#auditList").innerHTML = `<div class="empty">${({all:"Aucun ajout ni aucune suppression enregistrés", ajout:"Aucun ajout enregistré", suppression:"Aucune suppression enregistrée"})[state.auditType]} pour l'instant.</div>`; return; }
  let html = "", last = "";
  for (const l of rows) {
    const d = new Date(l.at), day = d.toLocaleDateString("fr-FR", {weekday:"long", day:"numeric", month:"long", year:"numeric"});
    if (day !== last) { last = day; html += `<div class="group-title">${esc(day)}</div>`; }
    const add = l.verb === "ajout";
    html += `<div class="audit-row"><span class="when">${d.toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"})}</span>
      <span class="t"><span class="${add ? "chip-add" : "chip-del"}">${add ? "Ajout" : "Suppression"}</span><b>${esc(l.title || "(sans titre)")}</b><br>
      <span class="m">${esc((l.kind || "").replace(/^./, c => c.toUpperCase()))} · par ${esc(WHO[l.by] || "un appareil sans profil")}${l.note ? " · " + esc(l.note) : ""}</span></span></div>`;
  }
  $("#auditList").innerHTML = html;
}
function renderSettings(){
  const me = state.me;
  const notifOn = me ? !!state.settings[me]?.notify : false;
  $("#setProfile").innerHTML = `
    <h3>Mon profil</h3>
    ${pick("me", [{v:"romain", label:"Romain", cls:catInfo("romain").cls}, {v:"manon", label:"Manon", cls:catInfo("manon").cls}], me)}
    <p class="note">Choix enregistré sur ce téléphone. « Mon planning » montre vos catégories et celles qui concernent les deux.</p>
    ${me ? `<div class="field"><label for="startMode">Planning affiché à l'ouverture</label><select id="startMode">${[["moi","Mon planning"],["autre","Planning de " + WHO[OTHER[me]]],["tout","Tout"]].map(([v, l]) => `<option value="${v}" ${(state.settings[me]?.startMode || "moi") === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field"><label for="notifMode">Mes rappels</label><select id="notifMode">${[["both","Sur mon téléphone et dans l'appli"],["app","Seulement dans l'appli"],["phone","Seulement sur mon téléphone"],["off","Désactivés (aucun rappel affiché ni envoyé)"]].map(([v, l]) => `<option value="${v}" ${notifModeOf(me) === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <p class="note">Sur le téléphone : une notification pour chaque rappel, vérifiée toutes les 15 minutes. Dans l'appli : la ligne Rappels en haut du calendrier.</p>
      <p class="note" id="pushState">${window.APP_HOOKS?.pushState?.() || ""}</p>
      ${quietField(me)}` : ""}
    ${me ? `<div class="field"><span class="lbl">Thème de l'appli</span><div class="themes" role="group" aria-label="Thème">${Object.entries(THEMES).map(([k, t]) => `<button type="button" data-themepick="${k}" aria-pressed="${applyTheme() === k}"><span class="sw" style="background:${t.bg || "linear-gradient(135deg,#eef1f4 50%,#131820 50%)"}"><i style="background:${t.ac || "#8fb2e0"}"></i></span><span style="min-width:0">${t.label}<span class="t2">${t.hint}</span></span></button>`).join("")}</div>
      <span class="note">Propre à votre profil : chacun peut avoir le sien.</span></div>` : ""}
    ${window.APP_HOOKS?.account?.() || ""}`;
  const lay = getLayout();
  $("#setLayout").innerHTML = me ? `
    <h3>Organisation de l'onglet Calendrier</h3>
    <p class="note">Propre à votre profil. Le choix du planning et la ligne Rappels restent en haut ; changez l'ordre des parties suivantes avec les flèches et affichez-les ou masquez-les avec la case.</p>
    <div>${lay.order.map((k, i) => `<div class="layrow"><span class="t">${PARTS[k]}</span>
      <button type="button" class="mv" data-partmv="${k}" data-dir="-1" ${i === 0 ? "disabled" : ""} aria-label="Monter « ${PARTS[k]} »">↑</button>
      <button type="button" class="mv" data-partmv="${k}" data-dir="1" ${i === lay.order.length - 1 ? "disabled" : ""} aria-label="Descendre « ${PARTS[k]} »">↓</button>
      <input type="checkbox" data-partshow="${k}" ${lay.hide.includes(k) ? "" : "checked"} aria-label="Afficher « ${PARTS[k]} »" style="width:22px;height:22px;accent-color:var(--accent)"></div>`).join("")}</div>
    <button type="button" class="btn ghost" id="layoutReset">Ordre par défaut</button>` : `<h3>Organisation de l'onglet Calendrier</h3><p class="note">Choisissez d'abord votre profil.</p>`;
  const cats = allCats();
  $("#setCats").innerHTML = `
    <h3>Catégories</h3>
    <div>${cats.map(c => `<div class="catrow ${c.cls}"><span class="dot"></span><span class="t"><b>${esc(c.label)}</b><br><span class="m">Concerne : ${WHO[c.who] || "Les deux"}${c.builtin ? " · par défaut" : ""}</span></span>
      <button class="edit" data-edcat="${esc(c.id)}" aria-label="Modifier la catégorie ${esc(c.label)}">Modifier</button></div>`).join("")}</div>
    <form id="catForm" class="stack" style="gap:10px">
      <div class="field"><label for="catName">Nouvelle catégorie</label><input type="text" id="catName" maxlength="24" placeholder="Ex. Travail, Sport, Enfants…"></div>
      <div class="field"><span class="lbl">Couleur</span>${colorField("#2f6fd0")}</div>
      <div class="field"><span class="lbl">Concerne</span>${whoPick("tous")}</div>
      <button class="btn">Ajouter la catégorie</button>
    </form>`;
  const s = state.sync;
  $("#setSync").innerHTML = `
    <h3>Synchronisations</h3>
    <div class="sync">
      <div class="src ${catInfo("manon").cls}"><span class="who">Manon</span><b>Bullet reMarkable</b><span>Prévue en version 2 · désactivée</span></div>
      <div class="src ${catInfo("romain").cls}"><span class="who">Romain</span><b>Journal Crohn reMarkable</b><span>Prévue en version 2 · désactivée</span></div>
    </div>
    <p class="note">Pas encore activée : pour l'instant, l'agenda se remplit à la main. En version 2, une fois par jour, les événements de chaque carnet arriveront dans le calendrier ; avec une catégorie précisée, ils la garderont, sinon ils iront dans l'onglet « À classer ».</p>`;
}

const whoPick = cur => pick("who", [{v:"tous", label:"Les deux"}, {v:"manon", label:"Manon", cls:catInfo("manon").cls}, {v:"romain", label:"Romain", cls:catInfo("romain").cls}], cur);
function categorySheet(c){
  openSheet(`
    <div class="eyebrow">Catégorie${c.builtin ? " par défaut" : ""}</div>
    <form id="catEdit" class="stack">
      <div class="field"><label for="ceName">Nom</label><input type="text" id="ceName" maxlength="24" value="${esc(c.label)}" ${c.builtin ? "readonly" : ""}></div>
      <div class="field"><span class="lbl">Couleur</span>${colorField(c.hex)}</div>
      ${c.builtin ? `<p class="note">Le nom et la personne concernée des catégories par défaut ne changent pas ; seule leur couleur se personnalise.</p>` : `<div class="field"><span class="lbl">Concerne</span>${whoPick(c.who)}</div>`}
      <div class="row" style="justify-content:space-between">
        ${c.builtin ? `<button type="button" class="btn ghost" id="ceReset">Couleur d'origine</button>` : `<button type="button" class="btn danger" id="ceDel">Supprimer</button>`}
        <div class="row"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn">Enregistrer</button></div>
      </div>
    </form>`, sh => {
    const saveColors = colors => { guard(save("settings", "colors", colors)); state.settings.colors = colors; render(); renderSettings(); };
    sh.querySelector("#catEdit").addEventListener("submit", e => {
      e.preventDefault();
      const color = readColor(sh);
      if (c.builtin) { saveColors({...(state.settings.colors || {}), [c.id]: color}); }
      else {
        const label = sh.querySelector("#ceName").value.trim();
        if (!label) { toast("Donnez un nom à la catégorie."); return; }
        if (allCats().some(x => x.id !== c.id && x.label.toLowerCase() === label.toLowerCase())) { toast("Cette catégorie existe déjà."); return; }
        guard(patch("categories", c.id, {label, color, who: getPick(sh, "who") || "tous"}));
      }
      closeSheet(); toast("Catégorie enregistrée");
    });
    sh.querySelector("#ceReset")?.addEventListener("click", () => {
      const colors = {...(state.settings.colors || {})}; delete colors[c.id]; saveColors(colors); closeSheet(); toast("Couleur d'origine rétablie");
    });
    const del = sh.querySelector("#ceDel");
    if (del) { let armed = false; del.addEventListener("click", () => {
      if (!armed) { armed = true; del.textContent = "Confirmer la suppression"; return; }
      guard(remove("categories", c.id)); closeSheet(); toast("Catégorie supprimée · ses éléments passent en « Sans catégorie »");
    }); }
  });
}

const TITLES = {todo:"À classer", news:"Nouveautés", cal:"Calendrier commun", act:"Activités", shop:"Courses", set:"Paramètres"};
const SUBS = {events:"Événements", tasks:"Tâches", proj:"Projets", anniv:"Anniversaires"};
function renderTabs(){
  const nTodo = unassignedEvents().length + unassignedTasks().length;
  document.querySelector('nav [data-tab="todo"]').hidden = !nTodo;
  $("#todoBadge").textContent = nTodo;
  if (state.tab === "todo" && !nTodo) { state.tab = "cal"; if (renderTabs.had) toast("Tout est classé"); }
  renderTabs.had = nTodo > 0;
  const nNews = unseenNews().length;
  document.querySelector('nav [data-tab="news"]').hidden = !nNews;
  $("#newsBadge").textContent = nNews;
  if (state.tab === "news" && !nNews) state.tab = "cal";
  document.querySelector("nav.tabs .in").classList.toggle("many", [...document.querySelectorAll("nav [data-tab]")].filter(b => !b.hidden).length > 5);
  document.querySelectorAll("nav [data-tab]").forEach(b => b.dataset.tab === state.tab ? b.setAttribute("aria-current","page") : b.removeAttribute("aria-current"));
  ["todo","news","cal","act","shop","set"].forEach(k => { $("#tab-"+k).hidden = k !== state.tab; });
  const searching = !!norm(state.allQuery);
  Object.keys(SUBS).forEach(k => { $("#tab-"+k).hidden = !(state.tab === "act" && state.sub === k && !searching); });
  $("#tab-results").hidden = !(state.tab === "act" && searching);
  $("#subtabs").hidden = searching;
  $("#subtabs").innerHTML = Object.entries(SUBS).map(([k,l]) => `<button data-sub="${k}" aria-pressed="${state.sub === k}">${l}</button>`).join("");
  $("#pageTitle").textContent = TITLES[state.tab];
  $("#todayBtn").hidden = state.tab !== "cal";
}
function render(){
  applyTheme(); updateCatStyles(); renderTabs(); renderModes(); renderReminders(); renderCal(); applyLayout(); renderTasks(); renderProjects(); renderAnniv(); renderTodo(); renderAll(); renderEvents(); renderNews(); renderAudit(); renderShop(); renderUndo();
  if (state.tab === "set" && !document.activeElement?.closest?.("#tab-set")) renderSettings();
  else if (state.tab !== "set") renderSettings();
}

/* ---------- courses ---------- */
// Rayons dans l'ordre d'un parcours de magasin habituel (l'ordre se change dans l'onglet Courses, commun aux deux profils)
const RAYONS = [
  ["fruits", "Fruits et légumes"], ["boulangerie", "Boulangerie"], ["cremerie", "Crèmerie et œufs"], ["fromage", "Fromages"],
  ["viande", "Boucherie et volaille"], ["poisson", "Poissonnerie"], ["traiteur", "Charcuterie et traiteur"], ["surgeles", "Surgelés"],
  ["epicerie", "Épicerie salée"], ["conserves", "Conserves et sauces"], ["sucre", "Épicerie sucrée"], ["petitdej", "Petit-déjeuner"],
  ["boissons", "Boissons"], ["hygiene", "Hygiène et beauté"], ["maison", "Entretien et maison"], ["bebe", "Bébé"], ["animaux", "Animaux"], ["autre", "Autre"],
];
const RAYON = Object.fromEntries(RAYONS);
// Unités : celles « au poids / au volume » ne se mettent pas au pluriel
const UNITS = ["", "g", "kg", "ml", "cl", "l", "pièce", "paquet", "boîte", "bouteille", "pot", "sachet", "tranche", "botte", "barquette", "rouleau", "brique", "filet"];
const UNIT_FIXED = ["g", "kg", "ml", "cl", "l"];
const plural = w => /[sxz]$/.test(w) ? w : w + "s";
function qtyText(q, u){
  const n = Number(q) || 0, v = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace(".", ",");
  if (!u) return n ? "× " + v : "";
  return `${v} ${UNIT_FIXED.includes(u) || n <= 1 ? u : plural(u)}`;
}
// Catalogue de départ : « nom|rayon|unité|quantité par défaut »
const CATALOG = `Pommes|fruits|kg|1;Bananes|fruits||6;Oranges|fruits|kg|1;Citrons|fruits||3;Clémentines|fruits|kg|1;Poires|fruits|kg|1;Raisin|fruits|g|500;Fraises|fruits|barquette|1;Kiwis|fruits||4;Avocats|fruits||2;
Tomates|fruits|kg|1;Tomates cerises|fruits|barquette|1;Salade|fruits||1;Concombre|fruits||1;Courgettes|fruits||3;Carottes|fruits|kg|1;Pommes de terre|fruits|kg|2;Oignons|fruits|filet|1;Échalotes|fruits|filet|1;Ail|fruits||1;
Poivrons|fruits||2;Brocoli|fruits||1;Champignons|fruits|barquette|1;Haricots verts|fruits|g|500;Épinards|fruits|g|500;Poireaux|fruits||3;Aubergines|fruits||2;Persil|fruits|botte|1;Basilic|fruits|pot|1;Gingembre|fruits|g|100;
Pain|boulangerie||1;Baguette|boulangerie||1;Pain de mie|boulangerie|paquet|1;Croissants|boulangerie||4;Pain complet|boulangerie||1;
Lait|cremerie|brique|6;Beurre|cremerie|g|250;Œufs|cremerie||12;Yaourts nature|cremerie|paquet|1;Yaourts aux fruits|cremerie|paquet|1;Crème fraîche|cremerie|pot|1;Crème liquide|cremerie|brique|1;Fromage blanc|cremerie|pot|1;Desserts lactés|cremerie|paquet|1;Pâte brisée|cremerie||1;Pâte feuilletée|cremerie||1;
Emmental râpé|fromage|sachet|1;Comté|fromage|g|250;Camembert|fromage||1;Mozzarella|fromage||2;Parmesan|fromage|g|100;Chèvre|fromage||1;Raclette|fromage|g|800;Feta|fromage||1;
Poulet (filets)|viande|g|500;Poulet entier|viande||1;Steaks hachés|viande|paquet|1;Viande hachée|viande|g|500;Rôti de porc|viande|kg|1;Côtes de porc|viande||4;Bœuf bourguignon|viande|kg|1;Escalopes de dinde|viande||4;Saucisses|viande|paquet|1;Merguez|viande|paquet|1;
Saumon|poisson|g|400;Cabillaud|poisson|g|400;Crevettes|poisson|g|300;Moules|poisson|kg|1;
Jambon|traiteur|tranche|4;Lardons|traiteur|barquette|1;Chorizo|traiteur||1;Saucisson|traiteur||1;Blanc de poulet|traiteur|tranche|4;Surimi|traiteur|paquet|1;Taboulé|traiteur|barquette|1;
Légumes surgelés|surgeles|sachet|1;Frites surgelées|surgeles|sachet|1;Poisson pané|surgeles|boîte|1;Pizza surgelée|surgeles||1;Glace|surgeles|boîte|1;Épinards surgelés|surgeles|sachet|1;
Pâtes|epicerie|paquet|1;Spaghetti|epicerie|paquet|1;Riz|epicerie|kg|1;Semoule|epicerie|paquet|1;Lentilles|epicerie|paquet|1;Farine|epicerie|kg|1;Huile d'olive|epicerie|bouteille|1;Huile de tournesol|epicerie|bouteille|1;Vinaigre|epicerie|bouteille|1;Sel|epicerie|paquet|1;Poivre|epicerie||1;Bouillon cube|epicerie|boîte|1;Chips|epicerie|paquet|1;Gâteaux apéritif|epicerie|paquet|1;Herbes de Provence|epicerie|pot|1;Curry|epicerie|pot|1;
Tomates pelées|conserves|boîte|2;Concentré de tomate|conserves|boîte|1;Sauce tomate|conserves|pot|1;Thon|conserves|boîte|2;Maïs|conserves|boîte|1;Haricots rouges|conserves|boîte|1;Pois chiches|conserves|boîte|1;Lait de coco|conserves|boîte|1;Moutarde|conserves|pot|1;Mayonnaise|conserves|pot|1;Ketchup|conserves|bouteille|1;Cornichons|conserves|pot|1;Olives|conserves|pot|1;
Sucre|sucre|kg|1;Chocolat noir|sucre||2;Chocolat au lait|sucre||2;Biscuits|sucre|paquet|1;Compote|sucre|paquet|1;Levure chimique|sucre|sachet|2;Sucre vanillé|sucre|sachet|2;Bonbons|sucre|paquet|1;Miel|sucre|pot|1;Confiture|sucre|pot|1;Pâte à tartiner|sucre|pot|1;
Céréales|petitdej|paquet|1;Café|petitdej|paquet|1;Café en dosettes|petitdej|boîte|1;Thé|petitdej|boîte|1;Chocolat en poudre|petitdej|boîte|1;Biscottes|petitdej|paquet|1;Jus d'orange|petitdej|brique|1;
Eau plate|boissons|bouteille|6;Eau gazeuse|boissons|bouteille|6;Soda|boissons|bouteille|1;Sirop|boissons|bouteille|1;Bière|boissons|pack|1;Vin rouge|boissons|bouteille|1;Vin blanc|boissons|bouteille|1;
Papier toilette|hygiene|paquet|1;Mouchoirs|hygiene|boîte|1;Dentifrice|hygiene||1;Brosses à dents|hygiene||2;Gel douche|hygiene||1;Shampoing|hygiene||1;Déodorant|hygiene||1;Coton|hygiene|paquet|1;Rasoirs|hygiene|paquet|1;
Liquide vaisselle|maison|bouteille|1;Tablettes lave-vaisselle|maison|boîte|1;Lessive|maison||1;Adoucissant|maison|bouteille|1;Éponges|maison|paquet|1;Essuie-tout|maison|paquet|1;Sacs poubelle|maison|rouleau|1;Papier aluminium|maison|rouleau|1;Film alimentaire|maison|rouleau|1;Nettoyant multi-usage|maison|bouteille|1;Piles|maison|paquet|1;Ampoules|maison||1;
Couches|bebe|paquet|1;Lingettes|bebe|paquet|1;Petits pots|bebe||4;
Croquettes|animaux|sachet|1;Pâtée|animaux|boîte|4;Litière|animaux|sachet|1`
  .split(";").map(l => l.trim()).filter(Boolean).map(l => { const [name, rayon, unit, qty] = l.split("|"); return {name, rayon, unit: unit === "pack" ? "paquet" : unit, qty: Number(qty) || 1}; });
// Plats d'exemple (proposés une fois, modifiables ensuite) : « ingrédient:quantité:unité:rayon »
const SAMPLE_DISHES = [
  ["Pâtes bolognaise", 4, "Spaghetti:500:g:epicerie,Viande hachée:400:g:viande,Tomates pelées:2:boîte:conserves,Oignons:1::fruits,Carottes:2::fruits,Ail:1::fruits,Parmesan:60:g:fromage,Huile d'olive:1:bouteille:epicerie"],
  ["Quiche lorraine", 4, "Pâte brisée:1::cremerie,Lardons:200:g:traiteur,Œufs:3::cremerie,Crème fraîche:20:cl:cremerie,Lait:20:cl:cremerie,Emmental râpé:100:g:fromage"],
  ["Crêpes", 4, "Farine:250:g:epicerie,Œufs:4::cremerie,Lait:50:cl:cremerie,Beurre:50:g:cremerie,Sucre vanillé:1:sachet:sucre"],
  ["Poulet rôti et pommes de terre", 4, "Poulet entier:1::viande,Pommes de terre:1:kg:fruits,Ail:1::fruits,Herbes de Provence:1:pot:epicerie,Beurre:30:g:cremerie"],
  ["Salade niçoise", 4, "Salade:1::fruits,Tomates:4::fruits,Œufs:4::cremerie,Thon:2:boîte:conserves,Haricots verts:300:g:fruits,Olives:1:pot:conserves,Poivrons:1::fruits"],
  ["Hachis parmentier", 4, "Pommes de terre:1:kg:fruits,Viande hachée:500:g:viande,Oignons:2::fruits,Lait:20:cl:cremerie,Beurre:50:g:cremerie,Emmental râpé:80:g:fromage"],
  ["Curry de poulet", 4, "Poulet (filets):600:g:viande,Lait de coco:1:boîte:conserves,Oignons:1::fruits,Curry:1:pot:epicerie,Riz:300:g:epicerie,Gingembre:20:g:fruits"],
  ["Gratin dauphinois", 4, "Pommes de terre:1:kg:fruits,Crème liquide:40:cl:cremerie,Lait:30:cl:cremerie,Ail:1::fruits,Beurre:20:g:cremerie"],
].map(([name, parts, ing]) => ({name, parts, ingredients: ing.split(",").map(s => { const [n, q, u, r] = s.split(":"); return {name: n, qty: Number(q) || 1, unit: u || "", rayon: r}; })}));

const shopOrder = () => { const o = state.settings.shop?.order || []; return [...o.filter(k => RAYON[k]), ...RAYONS.map(r => r[0]).filter(k => !o.includes(k))]; };
// Ordre des plats : alphabétique (par défaut) ou personnalisé (commun aux deux profils)
const dishSortMode = () => state.settings.shop?.dishSort === "custom" ? "custom" : "alpha";
function sortedDishes(){
  const alpha = state.dishes.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr"));
  if (dishSortMode() !== "custom") return alpha;
  const o = state.settings.shop?.dishOrder || [];
  const pos = id => { const i = o.indexOf(id); return i < 0 ? 1e6 : i; };
  return alpha.sort((a, b) => pos(a.id) - pos(b.id)); // les nouveaux plats vont à la fin, par ordre alphabétique
}
function saveShopSettings(patch){ const next = {...(state.settings.shop || {}), ...patch}; state.settings.shop = next; guard(rawSave("settings", "shop", next)); }
const shopKey = (name, unit) => norm(name) + "|" + (unit || "");
// Articles connus : catalogue + articles créés (les créés priment)
// products : articles créés, ou retouches du catalogue (base = nom d'origine ; hidden = article retiré)
function knownProducts(){
  const m = new Map(CATALOG.map(p => [norm(p.name), {...p, builtin: true}]));
  for (const p of state.products) if (p.base) m.delete(norm(p.base));
  for (const p of state.products) {
    if (p.hidden) { m.delete(norm(p.name)); continue; }
    m.set(norm(p.name), {name: p.name, rayon: RAYON[p.rayon] ? p.rayon : "autre", unit: p.unit || "", qty: Number(p.qty) || 1, id: p.id, base: p.base || "", builtin: !!p.base});
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
const guessProduct = name => knownProducts().find(p => norm(p.name) === norm(name)) || knownProducts().find(p => norm(name).length > 2 && norm(p.name).startsWith(norm(name)));
const rayonOptions = cur => shopOrder().map(k => `<option value="${k}" ${k === cur ? "selected" : ""}>${RAYON[k]}</option>`).join("");
const unitOptions = cur => UNITS.map(u => `<option value="${u}" ${u === (cur || "") ? "selected" : ""}>${u || "nombre"}</option>`).join("");
const activeLists = () => state.shoplists.filter(l => !l.archived).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
function currentList(){
  const id = state.shopCur || store.get("cc-shoplist");
  return state.shoplists.find(l => l.id === id) || activeLists()[0] || null;
}
const itemsOf = listId => state.shopitems.filter(i => i.listId === listId);

function renderShop(){
  const host = $("#shopBody"); if (!host) return;
  const L = currentList();
  const lists = activeLists(), old = state.shoplists.filter(l => l.archived).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  if (!L) {
    host.innerHTML = `<div class="empty">Aucune liste de courses pour l'instant.</div>
      <button class="btn wide" id="shopNew">+ Créer une liste de courses</button>
      <button class="btn ghost wide" id="shopDishes">Mes plats (${state.dishes.length})</button>
      <button class="btn ghost wide" id="shopProducts">Mes articles (${knownProducts().length})</button>`;
    return;
  }
  const items = itemsOf(L.id), inCart = items.filter(i => i.checked).length, hide = store.get("cc-shop-hide") === "1";
  const order = shopOrder();
  const groups = order.map(k => [k, items.filter(i => (RAYON[i.rayon] ? i.rayon : "autre") === k)]).filter(([, g]) => g.length);
  host.innerHTML = `
    <div class="row" style="flex-wrap:nowrap">
      <select id="shopListSel" aria-label="Liste de courses" style="flex:1;min-width:0">
        ${lists.map(l => `<option value="${esc(l.id)}" ${l.id === L.id ? "selected" : ""}>${esc(l.title || "Liste")}</option>`).join("")}
        ${old.length ? `<optgroup label="Listes terminées">${old.map(l => `<option value="${esc(l.id)}" ${l.id === L.id ? "selected" : ""}>${esc(l.title || "Liste")}</option>`).join("")}</optgroup>` : ""}
      </select>
      <button class="btn ghost add" id="shopNew" aria-label="Nouvelle liste">+ Liste</button>
    </div>
    ${L.archived ? `<p class="note">Liste terminée. <button class="linklike" id="shopReopen">La rouvrir</button></p>` : ""}
    <button class="btn wide" id="shopAdd">+ Ajouter des articles ou des plats</button>
    <form id="shopQuick" class="row" style="flex-wrap:nowrap" autocomplete="off">
      <input type="text" id="shopQuickName" placeholder="Ajout rapide (ex. lait)" aria-label="Ajout rapide d'un article" list="shopKnown" style="flex:1;min-width:0">
      <datalist id="shopKnown">${knownProducts().map(p => `<option value="${esc(p.name)}">`).join("")}</datalist>
      <button class="btn add">Ajouter</button>
    </form>
    ${items.length ? `<div class="shop-sum"><span><b>${inCart}</b> / ${items.length} dans le caddie</span>
      <label class="switch small"><input type="checkbox" id="shopHide" ${hide ? "checked" : ""}>Masquer le caddie</label></div>
    <div class="progress" aria-hidden="true"><i style="width:${items.length ? Math.round(inCart / items.length * 100) : 0}%"></i></div>` : `<div class="empty">Liste vide. Touchez « + Ajouter des articles ou des plats ».</div>`}
    <div class="stack" style="gap:12px">${groups.map(([k, g]) => {
      const sorted = g.slice().sort((a, b) => (a.checked - b.checked) || (a.name || "").localeCompare(b.name || ""));
      const shown = hide ? sorted.filter(i => !i.checked) : sorted, left = g.filter(i => !i.checked).length;
      if (!shown.length) return "";
      return `<div class="shop-group"><div class="group-title shop-ray"><span>${esc(RAYON[k])}</span><span>${left ? left + " à prendre" : "tout est pris"}</span></div>
        ${shown.map(i => `<div class="shop-item ${i.checked ? "in" : ""}">
          <button class="shop-chk" data-shopchk="${esc(i.id)}" aria-pressed="${!!i.checked}" aria-label="${i.checked ? "Retirer du caddie" : "Mettre dans le caddie"} : ${esc(i.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
          <button class="shop-name linklike" data-shopitem="${esc(i.id)}"><b>${esc(i.name)}</b>${i.dishes?.length ? `<span class="m">pour ${esc(i.dishes.join(", "))}</span>` : ""}${i.note ? `<span class="m">${esc(i.note)}</span>` : ""}</button>
          <span class="shop-qty">${esc(qtyText(i.qty, i.unit))}</span></div>`).join("")}</div>`; }).join("")}</div>
    ${hide && inCart ? `<p class="note">${inCart} article${inCart > 1 ? "s" : ""} déjà dans le caddie (masqué${inCart > 1 ? "s" : ""}).</p>` : ""}
    <div class="shop-actions">
      ${inCart ? `<button class="btn ghost" id="shopUncheck">Tout décocher</button><button class="btn ghost" id="shopClearCart">Retirer ce qui est dans le caddie</button>` : ""}
      <button class="btn ghost" id="shopDishes">Mes plats (${state.dishes.length})</button>
      <button class="btn ghost" id="shopProducts">Mes articles (${knownProducts().length})</button>
      <button class="btn ghost" id="shopOrder">Ordre des rayons</button>
      <button class="btn ghost" id="shopListEdit">Renommer / terminer la liste</button>
    </div>`;
}
function setShopCur(id){ state.shopCur = id; store.set("cc-shoplist", id); renderShop(); }

/* ---------- courses : écritures groupées (un seul retour en arrière) ---------- */
async function shopBulk(label, writes){
  // writes = [{col, id, next}] (next null = suppression) ; on garde l'état d'avant pour le retour en arrière
  const ops = writes.map(w => ({...w, prev: prevOf(w.col, w.id)}));
  const apply = async which => { for (const o of ops) { const v = o[which]; if (v) await rawSave(o.col, o.id, v); else await rawRemove(o.col, o.id); } };
  await apply("next");
  pushUndo({label, custom: () => apply("prev"), redo: () => apply("next")});
}
function newList(title){
  const id = "L" + newId(), d = new Date();
  const data = {title: title || "Courses du " + d.toLocaleDateString("fr-FR", {weekday: "long", day: "numeric", month: "long"}), createdAt: d.toISOString(), by: state.me || "", archived: false};
  guard(save("shoplists", id, data)); setShopCur(id); return id;
}
// Ajoute des articles à une liste : même nom et même unité → quantités additionnées
function addToList(listId, entries, label){
  const existing = itemsOf(listId).filter(i => !i.checked), writes = [], pending = new Map();
  for (const e of entries) {
    const k = shopKey(e.name, e.unit), ex = pending.get(k) || existing.find(i => shopKey(i.name, i.unit) === k);
    if (ex) {
      const next = {...(ex.next || prevOf("shopitems", ex.id)), qty: Math.round(((Number((ex.next || ex).qty) || 0) + (Number(e.qty) || 0)) * 100) / 100};
      next.dishes = [...new Set([...(next.dishes || []), ...(e.dishes || [])])];
      const w = {col: "shopitems", id: ex.id, next}; pending.set(k, w);
      const i = writes.findIndex(x => x.id === ex.id); if (i >= 0) writes[i] = w; else writes.push(w);
    } else {
      const id = "i" + newId() + writes.length;
      const w = {col: "shopitems", id, next: {listId, name: e.name.trim(), qty: Number(e.qty) || 1, unit: e.unit || "", rayon: RAYON[e.rayon] ? e.rayon : "autre", checked: false, dishes: e.dishes || [], by: state.me || "", at: new Date().toISOString()}};
      pending.set(k, w); writes.push(w);
    }
  }
  if (!writes.length) return;
  guard(shopBulk(label || `ajout de ${entries.length} article${entries.length > 1 ? "s" : ""}`, writes));
}

/* ---------- courses : choix des articles et des plats ---------- */
const shopPick = {tab: "items", q: "", sel: new Map(), dishes: new Map()};
function pickerCount(){
  let n = shopPick.sel.size;
  for (const d of shopPick.dishes.values()) n += d.ings.filter(x => x.on).length;
  return n;
}
function shopPicker(){
  openSheet(`<div class="eyebrow">Ajouter à la liste</div>
    <div class="seg" role="group" aria-label="Ajouter"><button data-ptab="items" aria-pressed="${shopPick.tab === "items"}">Articles</button><button data-ptab="dishes" aria-pressed="${shopPick.tab === "dishes"}">Plats</button></div>
    <div id="pickBody" class="stack" style="gap:10px"></div>
    <div class="pick-foot"><button type="button" class="btn ghost" data-close>Fermer</button><button type="button" class="btn" id="pickAdd"></button></div>`, sh => {
    const body = sh.querySelector("#pickBody");
    const foot = () => { const n = pickerCount(), b = sh.querySelector("#pickAdd"); b.textContent = n ? `Ajouter à la liste (${n})` : "Ajouter à la liste"; b.disabled = !n; };
    const draw = () => {
      sh.querySelectorAll("[data-ptab]").forEach(b => b.setAttribute("aria-pressed", b.dataset.ptab === shopPick.tab));
      if (shopPick.tab === "items") drawItems(); else drawDishes();
      foot();
    };
    const drawItems = () => {
      const q = norm(shopPick.q), all = knownProducts();
      const found = q ? all.filter(p => norm(p.name).includes(q)) : all;
      const exact = q && all.some(p => norm(p.name) === q);
      const order = shopOrder();
      const selected = [...shopPick.sel.values()];
      body.innerHTML = `<input type="search" id="pickQ" placeholder="Chercher ou créer un article" value="${esc(shopPick.q)}" aria-label="Chercher un article" autocomplete="off">
        ${selected.length ? `<div class="group-title">Choisis (${selected.length})</div>${selected.map(rowSel).join("")}` : ""}
        ${q && !exact ? `<div class="pick-new"><b>Nouvel article : « ${esc(shopPick.q.trim())} »</b>
          <div class="row" style="flex-wrap:nowrap"><select id="pickNewRay" aria-label="Rayon" style="flex:1;min-width:0">${rayonOptions("autre")}</select><button type="button" class="btn add" id="pickNewAdd">Ajouter</button></div>
          <span class="note">Il sera retenu pour les prochaines listes.</span></div>` : ""}
        ${order.map(k => { const g = found.filter(p => p.rayon === k && !shopPick.sel.has(shopKey(p.name, p.unit))); return g.length ? `<div class="group-title">${RAYON[k]}</div><div class="pick-grid">${g.map(p => `<button type="button" class="pick-prod" data-prod="${esc(p.name)}">${esc(p.name)}</button>`).join("")}</div>` : ""; }).join("")}
        ${!found.length && !q ? `<div class="empty">Aucun article.</div>` : ""}
        <button type="button" class="btn ghost wide" id="pickManage">Modifier la liste des articles</button>`;
      const qi = body.querySelector("#pickQ");
      qi.addEventListener("input", () => { shopPick.q = qi.value; const pos = qi.selectionStart; drawItems(); foot(); const n = body.querySelector("#pickQ"); n.focus(); n.setSelectionRange(pos, pos); });
      body.querySelector("#pickNewAdd")?.addEventListener("click", () => {
        const name = shopPick.q.trim(), rayon = body.querySelector("#pickNewRay").value;
        guard(rawSave("products", "p" + newId(), {name, rayon, unit: "", qty: 1}));
        shopPick.sel.set(shopKey(name, ""), {name, rayon, unit: "", qty: 1}); shopPick.q = ""; drawItems(); foot();
      });
    };
    const rowSel = e => `<div class="pick-row sel" data-selkey="${esc(shopKey(e.name, e.unit))}">
      <div class="top"><span class="t"><b>${esc(e.name)}</b><span class="m">${esc(RAYON[e.rayon] || "Autre")}</span></span><button type="button" class="mv" data-unsel aria-label="Retirer ${esc(e.name)}">×</button></div>
      <div class="qty"><button type="button" class="mv" data-qd="-1" aria-label="Moins">−</button><input type="number" class="qin" min="0" step="any" value="${e.qty}" aria-label="Quantité de ${esc(e.name)}"><button type="button" class="mv" data-qd="1" aria-label="Plus">+</button>
      <select class="uin" aria-label="Unité">${unitOptions(e.unit)}</select></div></div>`;
    const drawDishes = () => {
      const ds = sortedDishes(), custom = dishSortMode() === "custom";
      body.innerHTML = `${ds.length > 1 ? `<div class="row" style="flex-wrap:nowrap;justify-content:space-between"><span class="note">Ordre des plats</span>
        <div class="seg" role="group" aria-label="Ordre des plats" style="flex:none;width:210px"><button type="button" data-dsort="alpha" aria-pressed="${!custom}">A → Z</button><button type="button" data-dsort="custom" aria-pressed="${custom}">Personnalisé</button></div></div>` : ""}
        ${ds.length ? "" : `<div class="empty">Aucun plat enregistré.</div><button type="button" class="btn ghost wide" id="pickSamples">Ajouter ${SAMPLE_DISHES.length} plats d'exemple (modifiables)</button>`}
        ${ds.map(d => { const s = shopPick.dishes.get(d.id); return `<div class="dish ${s ? "on" : ""}">
          <div class="dish-head"><button type="button" class="dish-pick" data-dish="${esc(d.id)}" aria-pressed="${!!s}"><b>${esc(d.name)}</b><span class="m">${(d.ingredients || []).length} ingrédient${(d.ingredients || []).length > 1 ? "s" : ""} · pour ${d.parts || 4}</span></button>
          ${custom ? `<button type="button" class="mv" data-dmv="${esc(d.id)}" data-dir="-1" aria-label="Monter ${esc(d.name)}" ${ds[0] === d ? "disabled" : ""}>↑</button><button type="button" class="mv" data-dmv="${esc(d.id)}" data-dir="1" aria-label="Descendre ${esc(d.name)}" ${ds[ds.length - 1] === d ? "disabled" : ""}>↓</button>` : ""}
          <button type="button" class="edit" data-dishedit="${esc(d.id)}">Modifier</button></div>
          ${s ? `<div class="dish-parts"><span>Pour</span><button type="button" class="mv" data-pd="-1" data-d="${esc(d.id)}">−</button><b>${s.parts}</b><button type="button" class="mv" data-pd="1" data-d="${esc(d.id)}">+</button><span>personne${s.parts > 1 ? "s" : ""}</span></div>
            <p class="note">Décochez ce que vous avez déjà ; les quantités se modifient.</p>
            ${s.ings.map((x, k) => `<div class="pick-row ing ${x.on ? "" : "off"}" data-d="${esc(d.id)}" data-k="${k}"><input type="checkbox" class="ion" ${x.on ? "checked" : ""} aria-label="Prendre ${esc(x.name)}"><span class="t"><b>${esc(x.name)}</b><span class="m">${esc(RAYON[x.rayon] || "Autre")}</span></span>
              <input type="number" class="qin" min="0" step="any" value="${x.qty}" aria-label="Quantité de ${esc(x.name)}"><select class="uin" aria-label="Unité">${unitOptions(x.unit)}</select></div>`).join("")}` : ""}
        </div>`; }).join("")}
        <button type="button" class="btn ghost wide" id="pickNewDish">+ Nouveau plat</button>`;
      body.querySelector("#pickSamples")?.addEventListener("click", () => { guard(shopBulk(`ajout de ${SAMPLE_DISHES.length} plats d'exemple`, SAMPLE_DISHES.map(d => ({col: "dishes", id: "d" + newId() + d.name.length, next: d})))); setTimeout(draw, 80); });
    };
    // Quantités pour le nombre de personnes : les choses qui se comptent sont arrondies au-dessus (pas de demi-œuf)
    const scale = (d, parts) => (d.ingredients || []).map(x => { const raw = (Number(x.qty) || 0) * parts / (d.parts || 4);
      const qty = UNIT_FIXED.includes(x.unit) ? (["g", "ml"].includes(x.unit) ? Math.ceil(raw / 10) * 10 : Math.round(raw * 100) / 100) : Math.ceil(raw - 1e-9);
      return {...x, on: true, qty}; });
    body.addEventListener("click", e => {
      const t = e.target;
      const p = t.closest("[data-prod]"); if (p) { const prod = knownProducts().find(x => x.name === p.dataset.prod); if (prod) shopPick.sel.set(shopKey(prod.name, prod.unit), {...prod}); drawItems(); foot(); return; }
      const row = t.closest(".pick-row");
      const dp = t.closest("[data-dish]"); if (dp) { const d = state.dishes.find(x => x.id === dp.dataset.dish); if (!d) return;
        if (shopPick.dishes.has(d.id)) shopPick.dishes.delete(d.id); else shopPick.dishes.set(d.id, {parts: d.parts || 4, ings: scale(d, d.parts || 4)}); drawDishes(); foot(); return; }
      const pd = t.closest("[data-pd]"); if (pd) { const d = state.dishes.find(x => x.id === pd.dataset.d), s = shopPick.dishes.get(pd.dataset.d); if (!d || !s) return;
        s.parts = Math.max(1, s.parts + Number(pd.dataset.pd)); const fresh = scale(d, s.parts); s.ings = fresh.map((x, k) => ({...x, on: s.ings[k]?.on !== false})); drawDishes(); foot(); return; }
      const ds2 = t.closest("[data-dsort]"); if (ds2) {
        const mode = ds2.dataset.dsort, cur = sortedDishes().map(x => x.id);
        saveShopSettings(mode === "custom" ? {dishSort: "custom", dishOrder: state.settings.shop?.dishOrder?.length ? state.settings.shop.dishOrder : cur} : {dishSort: "alpha"});
        drawDishes(); return; }
      const mvb = t.closest("[data-dmv]"); if (mvb) {
        const ids = sortedDishes().map(x => x.id), i = ids.indexOf(mvb.dataset.dmv), j = i + Number(mvb.dataset.dir);
        if (i < 0 || j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]]; saveShopSettings({dishSort: "custom", dishOrder: ids}); drawDishes(); return; }
      const de = t.closest("[data-dishedit]"); if (de) { dishSheet(state.dishes.find(x => x.id === de.dataset.dishedit)); return; }
      if (t.closest("#pickNewDish")) { dishSheet(null); return; }
      if (t.closest("#pickManage")) { productsSheet(true); return; }
      if (row && row.dataset.selkey) {
        const e2 = shopPick.sel.get(row.dataset.selkey); if (!e2) return;
        if (t.closest("[data-unsel]")) { shopPick.sel.delete(row.dataset.selkey); drawItems(); foot(); return; }
        const qd = t.closest("[data-qd]"); if (qd) { const step = UNIT_FIXED.includes(e2.unit) ? (e2.unit === "g" || e2.unit === "ml" ? 100 : e2.unit === "cl" ? 10 : 0.5) : 1;
          e2.qty = Math.max(0, Math.round(((Number(e2.qty) || 0) + step * Number(qd.dataset.qd)) * 100) / 100); row.querySelector(".qin").value = e2.qty; }
      }
    });
    body.addEventListener("change", e => {
      const row = e.target.closest(".pick-row"); if (!row) return;
      const target = row.dataset.selkey ? shopPick.sel.get(row.dataset.selkey) : shopPick.dishes.get(row.dataset.d)?.ings[Number(row.dataset.k)];
      if (!target) return;
      if (e.target.classList.contains("qin")) target.qty = Math.max(0, Number(e.target.value) || 0);
      if (e.target.classList.contains("uin")) target.unit = e.target.value;
      if (e.target.classList.contains("ion")) { target.on = e.target.checked; row.classList.toggle("off", !target.on); foot(); }
    });
    sh.querySelectorAll("[data-ptab]").forEach(b => b.addEventListener("click", () => { shopPick.tab = b.dataset.ptab; draw(); }));
    sh.querySelector("#pickAdd").addEventListener("click", () => {
      const entries = [...shopPick.sel.values()].filter(x => Number(x.qty) > 0).map(x => ({...x}));
      for (const [id, s] of shopPick.dishes) { const d = state.dishes.find(x => x.id === id); if (!d) continue;
        for (const x of s.ings) if (x.on && Number(x.qty) > 0) entries.push({name: x.name, qty: x.qty, unit: x.unit, rayon: x.rayon, dishes: [d.name]}); }
      if (!entries.length) return;
      const L = currentList() || {id: newList()};
      addToList(L.id, entries, `ajout de ${entries.length} article${entries.length > 1 ? "s" : ""} à la liste`);
      const nd = shopPick.dishes.size;
      shopPick.sel.clear(); shopPick.dishes.clear(); shopPick.q = "";
      closeSheet(); toast(`${entries.length} article${entries.length > 1 ? "s" : ""} ajouté${entries.length > 1 ? "s" : ""}${nd ? ` (dont ${nd} plat${nd > 1 ? "s" : ""})` : ""}`);
    });
    draw();
  });
}

/* ---------- courses : plats ---------- */
function dishSheet(d){
  const isNew = !d, ings = (d?.ingredients || []).map(x => ({...x}));
  if (!ings.length) ings.push({name: "", qty: 1, unit: "", rayon: "autre"});
  openSheet(`<div class="eyebrow">${isNew ? "Nouveau plat" : "Modifier le plat"}</div>
    <form id="dishForm" class="stack" autocomplete="off">
      <div class="field"><label for="dishName">Nom du plat</label><input type="text" id="dishName" value="${esc(d?.name || "")}" placeholder="Ex. Lasagnes"></div>
      <div class="field"><label for="dishParts">Pour combien de personnes ?</label><input type="number" id="dishParts" min="1" max="50" value="${d?.parts || 4}"></div>
      <div class="field"><span class="lbl">Ingrédients <span style="font-weight:400">(pour ce nombre de personnes)</span></span><div id="ingRows" class="stack" style="gap:8px"></div>
        <datalist id="ingKnown">${knownProducts().map(p => `<option value="${esc(p.name)}">`).join("")}</datalist>
        <button type="button" class="btn ghost" id="ingAdd">+ Ingrédient</button></div>
      <div class="row" style="justify-content:space-between">
        ${isNew ? "<span></span>" : `<button type="button" class="btn danger" id="dishDel">Supprimer</button>`}
        <div class="row"><button type="button" class="btn ghost" id="dishBack">Retour</button><button class="btn">${isNew ? "Créer" : "Enregistrer"}</button></div>
      </div>
    </form>`, sh => {
    const box = sh.querySelector("#ingRows");
    const draw = () => { box.innerHTML = ings.map((x, k) => `<div class="ing-edit" data-k="${k}">
      <input type="text" class="in-name" list="ingKnown" value="${esc(x.name)}" placeholder="Ingrédient" aria-label="Ingrédient ${k + 1}">
      <div class="row" style="flex-wrap:nowrap"><input type="number" class="in-qty" min="0" step="any" value="${x.qty}" aria-label="Quantité" style="width:80px;flex:none">
        <select class="in-unit" aria-label="Unité" style="flex:1;min-width:0">${unitOptions(x.unit)}</select>
        <select class="in-ray" aria-label="Rayon" style="flex:1.4;min-width:0">${rayonOptions(x.rayon)}</select>
        <button type="button" class="mv" data-ingdel="${k}" aria-label="Retirer l'ingrédient">×</button></div></div>`).join(""); };
    draw();
    box.addEventListener("change", e => {
      const r = e.target.closest(".ing-edit"); if (!r) return; const x = ings[Number(r.dataset.k)];
      if (e.target.classList.contains("in-name")) { x.name = e.target.value; const g = guessProduct(x.name);
        if (g) { x.rayon = g.rayon; if (!x.unit && g.unit) x.unit = g.unit; r.querySelector(".in-ray").value = x.rayon; r.querySelector(".in-unit").value = x.unit; } }
      if (e.target.classList.contains("in-qty")) x.qty = Number(e.target.value) || 0;
      if (e.target.classList.contains("in-unit")) x.unit = e.target.value;
      if (e.target.classList.contains("in-ray")) x.rayon = e.target.value;
    });
    box.addEventListener("click", e => { const b = e.target.closest("[data-ingdel]"); if (b) { ings.splice(Number(b.dataset.ingdel), 1); draw(); } });
    sh.querySelector("#ingAdd").addEventListener("click", () => { ings.push({name: "", qty: 1, unit: "", rayon: "autre"}); draw(); box.querySelector(".ing-edit:last-child .in-name").focus(); });
    sh.querySelector("#dishBack").addEventListener("click", () => shopPicker());
    sh.querySelector("#dishForm").addEventListener("submit", e => {
      e.preventDefault();
      box.querySelectorAll(".ing-edit").forEach(r => { const x = ings[Number(r.dataset.k)]; x.name = r.querySelector(".in-name").value; x.qty = Number(r.querySelector(".in-qty").value) || 0; });
      const name = sh.querySelector("#dishName").value.trim(), parts = Math.max(1, Math.round(Number(sh.querySelector("#dishParts").value) || 4));
      const ingredients = ings.filter(x => x.name.trim()).map(x => ({name: x.name.trim(), qty: x.qty, unit: x.unit || "", rayon: RAYON[x.rayon] ? x.rayon : "autre"}));
      if (!name) { toast("Indiquez le nom du plat."); return; }
      if (!ingredients.length) { toast("Ajoutez au moins un ingrédient."); return; }
      guard(isNew ? save("dishes", "d" + newId(), {name, parts, ingredients}) : save("dishes", d.id, {name, parts, ingredients}));
      shopPick.tab = "dishes"; if (d) shopPick.dishes.delete(d.id);
      toast(isNew ? "Plat créé" : "Plat enregistré"); setTimeout(shopPicker, 60);
    });
    armDelete(sh.querySelector("#dishDel"), "Confirmer la suppression", () => { guard(remove("dishes", d.id)); shopPick.dishes.delete(d.id); toast("Plat supprimé"); setTimeout(shopPicker, 60); });
  });
}

/* ---------- courses : la liste des articles (catalogue) ---------- */
let productsQ = "", productsFromPicker = false;
function productsSheet(fromPicker){
  if (fromPicker !== undefined) productsFromPicker = !!fromPicker;
  const retouched = state.products.filter(p => p.base).length;
  openSheet(`<div class="eyebrow">Mes articles</div>
    <p class="note">Les articles proposés quand vous ajoutez à une liste. Touchez-en un pour le modifier ou le supprimer. Liste commune aux deux profils.</p>
    <div class="row" style="flex-wrap:nowrap"><input type="search" id="prodQ" placeholder="Chercher un article" value="${esc(productsQ)}" aria-label="Chercher un article" autocomplete="off" style="flex:1;min-width:0"><button type="button" class="btn add" id="prodNew">+ Nouvel article</button></div>
    <div id="prodList" class="stack" style="gap:10px"></div>
    ${retouched ? `<button type="button" class="btn ghost wide" id="prodReset">Remettre le catalogue d'origine (${retouched} retouche${retouched > 1 ? "s" : ""})</button>` : ""}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="prodClose">${productsFromPicker ? "Retour" : "Fermer"}</button></div>`, sh => {
    const list = sh.querySelector("#prodList");
    const draw = () => {
      const q = norm(productsQ), all = knownProducts().filter(p => !q || norm(p.name).includes(q));
      list.innerHTML = shopOrder().map(k => { const g = all.filter(p => p.rayon === k); return g.length ? `<div class="group-title">${RAYON[k]} (${g.length})</div><div class="pick-grid">${g.map(p => `<button type="button" class="pick-prod" data-editprod="${esc(p.name)}" title="${esc(qtyText(p.qty, p.unit))}">${esc(p.name)}</button>`).join("")}</div>` : ""; }).join("")
        || `<div class="empty">Aucun article ne correspond.</div>`;
    };
    draw();
    const qi = sh.querySelector("#prodQ");
    qi.addEventListener("input", () => { productsQ = qi.value; draw(); });
    list.addEventListener("click", e => { const b = e.target.closest("[data-editprod]"); if (b) productSheet(knownProducts().find(p => p.name === b.dataset.editprod)); });
    sh.querySelector("#prodNew").addEventListener("click", () => productSheet(null, productsQ.trim()));
    sh.querySelector("#prodClose").addEventListener("click", () => { if (productsFromPicker) shopPicker(); else closeSheet(); });
    sh.querySelector("#prodReset")?.addEventListener("click", e => {
      const b = e.currentTarget; if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Confirmer : annuler toutes les retouches du catalogue"; return; }
      guard(shopBulk("retour au catalogue d'origine", state.products.filter(p => p.base).map(p => ({col: "products", id: p.id, next: null}))));
      toast("Catalogue d'origine rétabli"); setTimeout(() => productsSheet(), 60);
    });
  });
}
function productSheet(p, newName){
  const isNew = !p;
  openSheet(`<div class="eyebrow">${isNew ? "Nouvel article" : "Modifier l'article"}</div>
    <form id="prodForm" class="stack" autocomplete="off">
      <div class="field"><label for="prName">Nom</label><input type="text" id="prName" value="${esc(p?.name || newName || "")}" placeholder="Ex. Lait d'avoine"></div>
      <div class="field"><label for="prRay">Rayon</label><select id="prRay">${rayonOptions(p?.rayon || "autre")}</select></div>
      <div class="row" style="flex-wrap:nowrap">
        <div class="field" style="flex:1;min-width:0"><label for="prQty">Quantité proposée</label><input type="number" id="prQty" min="0" step="any" value="${p?.qty || 1}"></div>
        <div class="field" style="flex:1.3;min-width:0"><label for="prUnit">Unité</label><select id="prUnit">${unitOptions(p?.unit || "")}</select></div>
      </div>
      ${p?.builtin ? `<p class="note">Article du catalogue de départ${p.base && p.base !== p.name ? ` (à l'origine « ${esc(p.base)} »)` : ""}.</p>` : ""}
      <div class="row" style="justify-content:space-between">
        ${isNew ? "<span></span>" : `<button type="button" class="btn danger" id="prDel">Supprimer</button>`}
        <div class="row"><button type="button" class="btn ghost" id="prBack">Retour</button><button class="btn">${isNew ? "Ajouter" : "Enregistrer"}</button></div>
      </div>
    </form>`, sh => {
    sh.querySelector("#prBack").addEventListener("click", () => productsSheet());
    sh.querySelector("#prodForm").addEventListener("submit", e => {
      e.preventDefault();
      const name = sh.querySelector("#prName").value.trim();
      if (!name) { toast("Indiquez le nom de l'article."); return; }
      const clash = knownProducts().find(x => norm(x.name) === norm(name) && (!p || norm(p.name) !== norm(name)));
      if (clash) { toast(`« ${clash.name} » existe déjà.`); return; }
      const data = {name, rayon: sh.querySelector("#prRay").value, unit: sh.querySelector("#prUnit").value, qty: Math.max(0, Number(sh.querySelector("#prQty").value) || 1)};
      if (isNew) guard(save("products", "p" + newId(), data));
      else if (p.id) guard(save("products", p.id, {...data, ...(p.base ? {base: p.base} : {})}));
      else guard(save("products", "p" + newId(), {...data, base: p.name})); // retouche d'un article du catalogue de départ
      toast(isNew ? "Article ajouté" : "Article enregistré"); setTimeout(() => productsSheet(), 60);
    });
    armDelete(sh.querySelector("#prDel"), "Confirmer la suppression", () => {
      if (p.builtin) guard(p.id ? save("products", p.id, {name: p.name, base: p.base || p.name, hidden: true}) : save("products", "p" + newId(), {name: p.name, base: p.name, hidden: true}));
      else guard(remove("products", p.id));
      toast(`« ${p.name} » supprimé de la liste des articles`); setTimeout(() => productsSheet(), 60);
    });
  });
}

/* ---------- courses : un article de la liste ---------- */
function shopItemSheet(i){
  openSheet(`<div class="eyebrow">Article de la liste</div>
    <form id="siForm" class="stack" autocomplete="off">
      <div class="field"><label for="siName">Article</label><input type="text" id="siName" value="${esc(i.name)}"></div>
      <div class="row" style="flex-wrap:nowrap">
        <div class="field" style="flex:1;min-width:0"><label for="siQty">Quantité</label><input type="number" id="siQty" min="0" step="any" value="${i.qty}"></div>
        <div class="field" style="flex:1.3;min-width:0"><label for="siUnit">Unité</label><select id="siUnit">${unitOptions(i.unit)}</select></div>
      </div>
      <div class="field"><label for="siRay">Rayon</label><select id="siRay">${rayonOptions(RAYON[i.rayon] ? i.rayon : "autre")}</select></div>
      <div class="field"><label for="siNote">Précision <span style="font-weight:400">(facultatif)</span></label><input type="text" id="siNote" value="${esc(i.note || "")}" placeholder="Ex. bio, marque, en promo"></div>
      ${i.dishes?.length ? `<p class="note">Pour : ${esc(i.dishes.join(", "))}</p>` : ""}
      <div class="row" style="justify-content:space-between">
        <button type="button" class="btn danger" id="siDel">Retirer de la liste</button>
        <div class="row"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn">Enregistrer</button></div>
      </div>
    </form>`, sh => {
    sh.querySelector("#siForm").addEventListener("submit", e => {
      e.preventDefault();
      const name = sh.querySelector("#siName").value.trim(); if (!name) { toast("Indiquez l'article."); return; }
      const rayon = sh.querySelector("#siRay").value;
      guard(patch("shopitems", i.id, {name, qty: Math.max(0, Number(sh.querySelector("#siQty").value) || 0), unit: sh.querySelector("#siUnit").value, rayon, note: sh.querySelector("#siNote").value.trim()}));
      // le rayon choisi est retenu pour cet article
      const known = state.products.find(p => norm(p.name) === norm(name)), cat = CATALOG.find(p => norm(p.name) === norm(name));
      if (known && known.rayon !== rayon) guard(rawPatch("products", known.id, {rayon}));
      else if (!known && (!cat || cat.rayon !== rayon)) guard(rawSave("products", "p" + newId(), {name: cat ? cat.name : name, rayon, unit: cat ? cat.unit : sh.querySelector("#siUnit").value, qty: cat ? cat.qty : 1, ...(cat ? {base: cat.name} : {})}));
      closeSheet(); toast("Article enregistré");
    });
    sh.querySelector("#siDel").addEventListener("click", () => { guard(remove("shopitems", i.id)); closeSheet(); toast("Retiré de la liste"); });
  });
}
function shopListSheet(L){
  openSheet(`<div class="eyebrow">Liste de courses</div>
    <form id="slForm" class="stack" autocomplete="off">
      <div class="field"><label for="slTitle">Nom de la liste</label><input type="text" id="slTitle" value="${esc(L.title || "")}"></div>
      <button type="button" class="btn ghost wide" id="slDone">${L.archived ? "Rouvrir la liste" : "Courses terminées : archiver la liste"}</button>
      <div class="row" style="justify-content:space-between">
        <button type="button" class="btn danger" id="slDel">Supprimer la liste</button>
        <div class="row"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn">Enregistrer</button></div>
      </div>
    </form>`, sh => {
    sh.querySelector("#slForm").addEventListener("submit", e => { e.preventDefault(); guard(patch("shoplists", L.id, {title: sh.querySelector("#slTitle").value.trim() || L.title})); closeSheet(); });
    sh.querySelector("#slDone").addEventListener("click", () => { guard(patch("shoplists", L.id, {archived: !L.archived})); closeSheet();
      if (!L.archived) { const next = activeLists().find(x => x.id !== L.id); state.shopCur = next?.id || null; store.set("cc-shoplist", state.shopCur || ""); toast("Liste archivée"); } else toast("Liste rouverte"); });
    armDelete(sh.querySelector("#slDel"), "Confirmer : supprimer la liste et ses articles", () => {
      guard(shopBulk(`suppression de la liste « ${L.title} »`, [...itemsOf(L.id).map(i => ({col: "shopitems", id: i.id, next: null})), {col: "shoplists", id: L.id, next: null}]));
      state.shopCur = null; store.set("cc-shoplist", ""); closeSheet(); toast("Liste supprimée");
    });
  });
}
function shopOrderSheet(){
  let order = shopOrder();
  openSheet(`<div class="eyebrow">Ordre des rayons</div><p class="note">Rangez les rayons dans l'ordre où vous les parcourez dans votre magasin : la liste suivra cet ordre. Réglage commun aux deux profils.</p>
    <div id="rayRows"></div><div class="row" style="justify-content:space-between"><button type="button" class="btn ghost" id="rayReset">Ordre par défaut</button><button type="button" class="btn" data-close>Fermer</button></div>`, sh => {
    const draw = () => { sh.querySelector("#rayRows").innerHTML = order.map((k, i) => `<div class="layrow" style="grid-template-columns:1fr auto auto"><span class="t">${RAYON[k]}</span>
      <button type="button" class="mv" data-rmv="${i}" data-dir="-1" ${i === 0 ? "disabled" : ""} aria-label="Monter ${RAYON[k]}">↑</button><button type="button" class="mv" data-rmv="${i}" data-dir="1" ${i === order.length - 1 ? "disabled" : ""} aria-label="Descendre ${RAYON[k]}">↓</button></div>`).join(""); };
    const saveOrder = () => { const next = {...(state.settings.shop || {}), order}; state.settings.shop = next; guard(rawSave("settings", "shop", next)); renderShop(); };
    draw();
    sh.querySelector("#rayRows").addEventListener("click", e => { const b = e.target.closest("[data-rmv]"); if (!b) return; const i = Number(b.dataset.rmv), j = i + Number(b.dataset.dir);
      [order[i], order[j]] = [order[j], order[i]]; draw(); saveOrder(); });
    sh.querySelector("#rayReset").addEventListener("click", () => { order = RAYONS.map(r => r[0]); draw(); saveOrder(); });
  });
}
document.addEventListener("click", e => {
  if (!e.target.closest("#tab-shop")) return;
  const t = e.target;
  const chk = t.closest("[data-shopchk]"); if (chk) { const i = state.shopitems.find(x => x.id === chk.dataset.shopchk); if (i) guard(rawPatch("shopitems", i.id, {checked: !i.checked})); return; }
  const it = t.closest("[data-shopitem]"); if (it) { const i = state.shopitems.find(x => x.id === it.dataset.shopitem); i && shopItemSheet(i); return; }
  if (t.closest("#shopNew")) { newList(); toast("Nouvelle liste créée"); return; }
  if (t.closest("#shopAdd")) { shopPicker(); return; }
  if (t.closest("#shopDishes")) { shopPick.tab = "dishes"; shopPicker(); return; }
  if (t.closest("#shopOrder")) { shopOrderSheet(); return; }
  if (t.closest("#shopProducts")) { productsSheet(); return; }
  if (t.closest("#shopListEdit")) { const L = currentList(); L && shopListSheet(L); return; }
  if (t.closest("#shopReopen")) { const L = currentList(); L && guard(patch("shoplists", L.id, {archived: false})); return; }
  if (t.closest("#shopUncheck")) { const L = currentList(); if (!L) return; const its = itemsOf(L.id).filter(i => i.checked);
    guard(shopBulk(`décocher ${its.length} article${its.length > 1 ? "s" : ""}`, its.map(i => ({col: "shopitems", id: i.id, next: {...prevOf("shopitems", i.id), checked: false}})))); return; }
  if (t.closest("#shopClearCart")) { const L = currentList(); if (!L) return; const its = itemsOf(L.id).filter(i => i.checked);
    guard(shopBulk(`retrait de ${its.length} article${its.length > 1 ? "s" : ""} du caddie`, its.map(i => ({col: "shopitems", id: i.id, next: null})))); toast(`${its.length} article${its.length > 1 ? "s" : ""} retiré${its.length > 1 ? "s" : ""}`); return; }
});
document.addEventListener("change", e => {
  if (e.target.id === "shopListSel") setShopCur(e.target.value);
  if (e.target.id === "shopHide") { store.set("cc-shop-hide", e.target.checked ? "1" : "0"); renderShop(); }
});
document.addEventListener("submit", e => {
  if (e.target.id !== "shopQuick") return;
  e.preventDefault();
  const inp = $("#shopQuickName"), name = inp.value.trim(); if (!name) return;
  const g = knownProducts().find(p => norm(p.name) === norm(name));
  const L = currentList() || {id: newList()};
  addToList(L.id, [{name: g ? g.name : name, qty: g ? g.qty : 1, unit: g ? g.unit : "", rayon: g ? g.rayon : "autre"}], `ajout de « ${g ? g.name : name} »`);
  if (!g) guard(rawSave("products", "p" + newId(), {name, rayon: "autre", unit: "", qty: 1}));
  inp.value = ""; inp.focus();
  toast(g ? `« ${g.name} » ajouté (${RAYON[g.rayon]})` : `« ${name} » ajouté dans « Autre » : touchez-le pour choisir son rayon`);
});

/* ---------- feuilles ---------- */
let sheetLocked = false;
function openSheet(html, onMount, locked){
  const host = $("#sheetHost"); sheetLocked = !!locked;
  host.innerHTML = `<div class="scrim"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  const scrim = host.firstChild;
  scrim.addEventListener("click", e => { if ((e.target === scrim && !sheetLocked) || e.target.closest("[data-close]")) closeSheet(); });
  onMount && onMount(scrim.querySelector(".sheet"));
}
function closeSheet(){ $("#sheetHost").innerHTML = ""; sheetLocked = false; }
function setMe(k){
  state.me = k; state.mode = state.settings[k]?.startMode || "moi"; store.set("cc-me", k); store.set("cc-mode", state.mode); store.set("cc-start", state.settings[k]?.startMode || ""); render(); renderSettings();
  window.APP_HOOKS?.profile?.(k);
}
// Créneau sans notification (par profil) : par défaut de 22:00 à 07:00
const quietOf = me => ({on: true, start: "22:00", end: "07:00", ...(state.settings[me]?.quiet || {})});
function quietField(me){
  const q = quietOf(me), m = notifModeOf(me);
  return `<div class="field" id="quietBox"><span class="lbl">Créneau sans notification</span>
    <label class="switch" for="quietOn"><input type="checkbox" id="quietOn" ${q.on ? "checked" : ""}>Pas de notification pendant un créneau</label>
    <div class="row" id="quietTimes" style="flex-wrap:nowrap" ${q.on ? "" : "hidden"}>
      <div class="field" style="flex:1;min-width:0"><label for="quietStart">De</label><input type="time" id="quietStart" value="${esc(q.start)}"></div>
      <div class="field" style="flex:1;min-width:0"><label for="quietEnd">À</label><input type="time" id="quietEnd" value="${esc(q.end)}"></div>
    </div>
    <span class="note">${q.on ? `Rien n'arrive sur le téléphone de ${esc(q.start)} à ${esc(q.end)} ; les rappels de ce créneau arrivent à ${esc(q.end)}.` : "Les notifications peuvent arriver à toute heure."}${m === "both" || m === "phone" ? "" : " (S'applique quand « Mes rappels » inclut le téléphone.)"}</span></div>`;
}
function saveQuiet(){
  if (!state.me) return;
  const on = $("#quietOn").checked, start = $("#quietStart").value || "22:00", end = $("#quietEnd").value || "07:00";
  if (on && start === end) { toast("Le début et la fin du créneau doivent être différents."); return; }
  const next = {...(state.settings[state.me] || {}), quiet: {on, start, end}};
  guard(rawSave("settings", state.me, next)); state.settings[state.me] = next; renderSettings();
  toast(on ? `Pas de notification de ${start} à ${end}` : "Notifications à toute heure");
}
// Mes rappels : téléphone + appli / appli / téléphone / désactivés
function notifModeOf(me){
  const st = state.settings[me] || {}, notify = !!st.notify, shown = !(st.hide || []).includes("rems");
  return notify ? (shown ? "both" : "phone") : (shown ? "app" : "off");
}
function setNotifMode(v){
  if (!state.me) return;
  const {order} = getLayout(), hide = (state.settings[state.me]?.hide || []);
  const showApp = v === "both" || v === "app";
  const h = showApp ? hide.filter(k => k !== "rems") : [...new Set([...hide, "rems"])];
  saveLayout(order, h, {notify: v === "both" || v === "phone"}); renderReminders();
  window.APP_HOOKS?.notifMode?.(v);
  toast({both:"Rappels sur le téléphone et dans l'appli", app:"Rappels seulement dans l'appli", phone:"Rappels seulement sur le téléphone", off:"Rappels désactivés"}[v]);
}
function setStartMode(v){
  if (!state.me) return;
  const next = {...(state.settings[state.me] || {}), startMode: v};
  guard(rawSave("settings", state.me, next)); state.settings[state.me] = next; store.set("cc-start", v);
  toast("À l'ouverture : " + ({moi:"Mon planning", autre:"Planning de " + WHO[OTHER[state.me]], tout:"Tout"})[v]);
}
function welcomeSheet(){
  openSheet(`<div class="eyebrow">Bienvenue</div><h2>Qui utilise ce téléphone ?</h2>
    ${pick("welcome", [{v:"romain", label:"Romain", cls:catInfo("romain").cls}, {v:"manon", label:"Manon", cls:catInfo("manon").cls}], null)}
    <p class="note">Vous pourrez changer ce choix et régler les notifications dans l'onglet Paramètres.</p>`, null, true);
}

const repeatSelect = (cur) => `<select id="fRep">${Object.entries(REPEAT).map(([k,l]) => `<option value="${k}" ${k===cur?"selected":""}>${l}</option>`).join("")}</select>`;
// « Tous les [N] semaines » : la périodicité d'une répétition
const everyField = (id, n, unit, hidden) => `<div class="field" id="${id}Box" ${hidden ? "hidden" : ""}><label for="${id}">Périodicité</label>
  <div class="row" style="flex-wrap:nowrap;align-items:center;gap:10px"><span style="flex:none" id="${id}Pre">Tous les</span><input type="number" id="${id}" min="1" max="99" step="1" value="${n}" style="width:80px;flex:none" aria-label="Combien"><span id="${id}Unit" style="min-width:0">${unit}</span></div></div>`;
const readEvery = (sh, id) => { const n = Math.round(Number(sh.querySelector("#" + id)?.value)); return n >= 1 && n <= 99 ? n : null; };
function wireEvery(sh, id, unitOf){
  const inp = sh.querySelector("#" + id);
  const upd = () => { const n = Number(inp.value) || 1, [one, many, fem] = unitOf();
    sh.querySelector("#" + id + "Unit").textContent = n > 1 ? many : one;
    sh.querySelector("#" + id + "Pre").textContent = n > 1 ? (fem ? "Toutes les" : "Tous les") : (fem ? "Chaque" : "Chaque"); };
  inp.addEventListener("input", upd); upd(); return upd;
}

function eventSheet(ev, occ){
  const isNew = !ev, imported = ev && ev.source && ev.source !== "manuel";
  const cat0 = ev ? ev.cat : (state.me && state.mode === "moi" ? state.me : "commun");
  const rep0 = ev ? repeatOf(ev) : "none";
  openSheet(`
    <div class="eyebrow">${isNew ? "Nouvel événement" : (imported ? "Importé · " + SOURCES[ev.source] : "Événement")}</div>
    <form id="evForm" class="stack">
      <div class="field"><label for="evTitle">Titre</label><input type="text" id="evTitle" value="${esc(ev?.title||"")}" ${imported?"readonly":""}></div>
      ${acrField(ev?.acr)}
      ${iconField(ev?.icon, ev?.iconColor)}
      <div class="row" style="flex-wrap:nowrap">
        <div class="field" style="flex:2;min-width:0"><label for="evDate">${rep0 === "none" ? "Date (ou début)" : "Première date"}</label><input type="date" id="evDate" value="${esc(ev?.date||state.sel)}" ${imported?"readonly":""}></div>
        <div class="field" style="flex:1;min-width:0"><label for="evTime">Heure</label><input type="time" id="evTime" value="${esc(ev?.time||"")}" ${imported?"readonly":""}></div>
      </div>
      <div class="field"><label for="evEnd">Jusqu'au <span style="font-weight:400">(facultatif, pour un événement sur plusieurs jours)</span></label><input type="date" id="evEnd" value="${esc(ev?.endDate||"")}" ${imported?"readonly":""}></div>
      <div class="field"><span class="lbl">Personne / catégorie</span>${pick("cat", catOptionsNoBd(), cat0)}</div>
      ${sharedField(typeof ev !== "undefined" ? ev?.shared : t?.shared)}
      ${imported ? "" : `<div class="field"><label for="fRep">Récurrence</label>${repeatSelect(rep0)}</div>
      ${everyField("evEvery", ev ? everyOf(ev) : 1, "", rep0 === "none")}
      <div class="field" id="evMonthsBox" ${rep0 === "none" ? "hidden" : ""}><span class="lbl">Mois concernés <span style="font-weight:400">(aucun coché = tous les mois)</span></span>${pick("months", monthOptions(), ev?.months || [], true, "months")}</div>`}
      ${reminderField(ev, "Délai avant : par exemple 2 semaines, 3 jours ou 5 heures. Sans heure précise, l'événement compte à 9 h.", ev?.date || state.sel)}
      ${occBlock(ev, "events", occ)}
      ${imported ? `<p class="note">Cet événement vient de la synchro quotidienne. Vous pouvez changer sa catégorie et son rappel ; le titre et la date restent ceux de la source.</p>` : ""}
      <div class="row" style="justify-content:space-between">
        ${isNew ? "<span></span>" : `<button type="button" class="btn danger" id="evDel">Supprimer</button>`}
        <div class="row"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn">${isNew?"Ajouter":"Enregistrer"}</button></div>
      </div>
    </form>`, sh => {
    wireIcon(sh); if (ev) wireOcc(sh, ev, "events");
    const rep = sh.querySelector("#fRep"), box = sh.querySelector("#evMonthsBox");
    const updEvery = rep ? wireEvery(sh, "evEvery", () => { const u = EVERY_UNIT[rep.value] || ["semaine","semaines"]; return [u[0], u[1], rep.value === "weekly"]; }) : null;
    rep?.addEventListener("change", () => {
      box.hidden = rep.value === "none"; sh.querySelector("#evEveryBox").hidden = rep.value === "none"; updEvery();
      sh.querySelector('label[for="evDate"]').textContent = rep.value === "none" ? "Date (ou début)" : "Première date";
    });
    onPick.cat = (v, root) => { if (isNew && v === "anniv" && rep && rep.value === "none" && root === sh) { rep.value = "yearly"; rep.dispatchEvent(new Event("change")); } };
    wireReminder(sh, () => sh.querySelector("#evDate").value, () => rep && rep.value !== "none");
    sh.querySelector("#evDate").addEventListener("change", () => sh.__remRebase());
    rep?.addEventListener("change", () => sh.__remRebase());
    sh.querySelector("#evForm").addEventListener("submit", e => {
      e.preventDefault();
      const cat = getPick(sh, "cat") || (ev ? ev.cat || "" : "commun");
      const rem = readReminder(sh, sh.querySelector("#evDate").value); if (rem === null) return;
      if (imported) { guard(patch("events", ev.id, {cat, ...rem, acr: readAcr(sh), shared: readShared(sh), ...readIcon(sh)})); closeSheet(); toast("Événement enregistré"); return; }
      const data = {
        acr: readAcr(sh), shared: readShared(sh), ...readIcon(sh), endDate: sh.querySelector("#evEnd").value || "", title: sh.querySelector("#evTitle").value.trim(), date: sh.querySelector("#evDate").value,
        time: sh.querySelector("#evTime").value, cat, source: ev?.source || "manuel", ...rem,
        repeat: rep.value, months: rep.value === "none" ? [] : getPicks(sh, "months").map(Number), every: 1
      };
      if (rep.value !== "none") { const n = readEvery(sh, "evEvery"); if (n === null) { toast("La périodicité doit être un nombre entre 1 et 99."); return; } data.every = n; }
      if (!data.title || !data.date) { toast("Indiquez au moins un titre et une date."); return; }
      if (data.endDate && data.endDate < data.date) { toast("La date de fin doit être après la date de début."); return; }
      if (data.endDate === data.date) data.endDate = "";
      guard(isNew ? save("events", newId(), data) : patch("events", ev.id, data));
      state.sel = data.date; const d = parse(data.date); state.view = new Date(d.getFullYear(), d.getMonth(), 1);
      closeSheet(); toast(isNew ? "Événement ajouté" : "Événement enregistré"); render();
    });
    const del = sh.querySelector("#evDel");
    if (del) { let armed = false; del.addEventListener("click", () => {
      if (!armed) { armed = true; del.textContent = ev && repeatOf(ev) !== "none" ? "Supprimer toutes les dates" : "Confirmer la suppression"; return; }
      guard(remove("events", ev.id)); closeSheet(); toast("Événement supprimé");
    }); }
  });
}

const fmtOcc = k => parse(k).toLocaleDateString("fr-FR", {weekday:"long", day:"numeric", month:"long"});
function occBlock(x, col, occ){
  if (!x || !isRecurring(x, col)) return "";
  const skips = (x.skips || []).slice().sort((a, b) => a.d.localeCompare(b.d));
  const mv = occ && movedTo(x, occ), canSkip = occ && !mv && !skipOf(x, occ);
  return `<div class="occ-box">
    <span class="lbl" style="font-size:.8rem;font-weight:700;color:var(--muted)">Une seule date</span>
    ${mv ? `<p class="note">Cette date a été déplacée : prévue à l'origine le ${esc(fmtOcc(mv.d))}${mv.note ? " (« " + esc(mv.note) + " »)" : ""}.</p>
      <button type="button" class="btn ghost" data-unskip="${col}" data-id="${esc(x.id)}" data-day="${mv.d}">Remettre au ${esc(fmtOcc(mv.d))}</button>`
    : canSkip ? `<textarea id="occNote" rows="2" placeholder="Commentaire (facultatif), ex. annulé, férié, décalé…" aria-label="Commentaire"></textarea>
      <div class="row" style="flex-wrap:nowrap;align-items:flex-end">
        <div class="field" style="flex:1;min-width:0"><label for="occTo">Déplacer le ${esc(fmtOcc(occ))} au</label><input type="date" id="occTo" value="${ymd(addDays(parse(occ), 1))}"></div>
        <button type="button" class="btn ghost" id="occMove" data-day="${occ}" style="flex:none">Déplacer</button>
      </div>
      <button type="button" class="btn ghost" id="occSkip" data-day="${occ}">Retirer seulement le ${esc(fmtOcc(occ))}</button>
      <p class="note">Seule cette date change ; les autres restent prévues.</p>`
      : `<p class="note">Pour déplacer ou retirer une seule date, ouvrez l'élément depuis ce jour dans le calendrier.</p>`}
    ${skips.length ? `<div class="stack" style="gap:6px"><span class="note">Dates retirées ou déplacées :</span>${skips.map(sk => `<div class="skiprow"><span class="m">${esc(parse(sk.d).toLocaleDateString("fr-FR", {weekday:"short", day:"numeric", month:"short", year:"numeric"}))}${sk.to ? " → " + esc(parse(sk.to).toLocaleDateString("fr-FR", {weekday:"short", day:"numeric", month:"short"})) : " · retirée"}${sk.note ? " · « " + esc(sk.note) + " »" : ""}</span>
      <button type="button" class="edit" data-unskip="${col}" data-id="${esc(x.id)}" data-day="${sk.d}">Rétablir</button></div>`).join("")}</div>` : ""}
  </div>`;
}
function wireOcc(sh, x, col){
  sh.querySelector("#occSkip")?.addEventListener("click", e => {
    const day = e.currentTarget.dataset.day, note = sh.querySelector("#occNote").value.trim();
    guard(patch(col, x.id, {skips: [...(x.skips || []).filter(s => s.d !== day), {d: day, note, by: state.me || ""}]}));
    closeSheet(); toast("Date retirée · les autres restent prévues");
  });
  sh.querySelector("#occMove")?.addEventListener("click", e => {
    const day = e.currentTarget.dataset.day, to = sh.querySelector("#occTo").value, note = sh.querySelector("#occNote").value.trim();
    if (!to) { toast("Choisissez la nouvelle date."); return; }
    if (to === day) { toast("Choisissez une autre date que le " + fmtOcc(day) + "."); return; }
    const already = col === "tasks" ? taskOnDay(x, parse(to)) : occursOn(x, parse(to));
    if (already) { toast("Déjà prévu le " + fmtOcc(to) + "."); return; }
    guard(patch(col, x.id, {skips: [...(x.skips || []).filter(s => s.d !== day && s.to !== to), {d: day, to, note, by: state.me || ""}]}));
    closeSheet(); state.sel = to; const d = parse(to); state.view = new Date(d.getFullYear(), d.getMonth(), 1);
    render(); toast("Déplacé au " + fmtOcc(to) + " · les autres dates restent prévues");
  });
}
function armDelete(btn, label, onConfirm){
  if (!btn) return; let armed = false;
  btn.addEventListener("click", () => { if (!armed) { armed = true; btn.textContent = label; return; } onConfirm(); });
}

function taskSheet(t, occ, day){
  const isNew = !t;
  let cat0 = t ? taskCat(t) : (state.me && state.mode === "moi" ? state.me : "commun"); if (cat0 === "anniv") cat0 = "commun";
  const rec0 = t ? taskRecur(t) : "once", sch0 = t ? taskSched(t) : "month", tr0 = t ? taskRep(t) : "none";
  openSheet(`
    <div class="eyebrow">${isNew ? "Nouvelle tâche" : "Modifier la tâche"}</div>
    <form id="tkForm" class="stack">
      <div class="field"><label for="tkTitle">Tâche</label><input type="text" id="tkTitle" value="${esc(t?.title || "")}" placeholder="Ex. Nettoyer le frigo"></div>
      ${acrField(t?.acr)}
      ${iconField(t?.icon, t?.iconColor)}
      <div class="field"><span class="lbl">Personne / catégorie</span>${pick("cat", catOptionsNoBd(), cat0)}</div>
      ${sharedField(typeof ev !== "undefined" ? ev?.shared : t?.shared)}
      <div class="field"><label for="tkSched">Quand ?</label>
        <select id="tkSched">${[["month","Dans le mois, sans jour précis"],["weekdays","Certains jours de la semaine (ex. poubelles le jeudi)"],["dates","À une date ou sur une période"]].map(([k,l]) => `<option value="${k}" ${k === sch0 ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field" id="tkWeekBox" ${sch0 !== "weekdays" ? "hidden" : ""}><span class="lbl">Jours</span>${pick("wd", DAYS_SHORT.map((l, i) => ({v:i+1, label:l, dot:false, title:DAYS_LONG[i]})), t?.days?.length ? t.days : [isoDow(day ? parse(day) : today)], true, "wdays")}
        <div class="row" style="flex-wrap:nowrap;margin-top:6px">
          <div class="field" style="flex:1;min-width:0"><label for="tkFrom">À partir du</label><input type="date" id="tkFrom" value="${esc(t?.from || day || ymd(today))}"></div>
          <div class="field" style="flex:1;min-width:0"><label for="tkUntil">Jusqu'au <span style="font-weight:400">(facultatif)</span></label><input type="date" id="tkUntil" value="${esc(t?.until || "")}"></div>
        </div>
        <div style="margin-top:6px">${everyField("tkEveryW", sch0 === "weekdays" && t ? everyOf(t) : 1, "semaine", false)}</div>
        <p class="note">Pour « toutes les 2 semaines » ou plus, la semaine de « À partir du » est la première.</p></div>
      <div class="field" id="tkDateBox" ${sch0 !== "dates" ? "hidden" : ""}>
        <div class="row" style="flex-wrap:nowrap">
          <div class="field" style="flex:1;min-width:0"><label for="tkDate">${tr0 === "none" ? "Le" : "Première date"}</label><input type="date" id="tkDate" value="${esc(t?.date || day || ymd(today))}"></div>
          <div class="field" style="flex:1;min-width:0"><label for="tkEnd">${tr0 === "none" ? "Jusqu'au" : "Fin de la répétition"} <span style="font-weight:400">(facultatif)</span></label><input type="date" id="tkEnd" value="${esc((tr0 === "none" ? t?.endDate : t?.until) || "")}"></div>
        </div>
        <div class="field" style="margin-top:6px"><label for="tkRep">Répétition</label><select id="tkRep">${Object.entries(REPEAT).map(([k, l]) => `<option value="${k}" ${k === tr0 ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div style="margin-top:6px">${everyField("tkEveryD", tr0 !== "none" && t ? everyOf(t) : 1, "", tr0 === "none")}</div></div>
      <div id="tkMonthGroup" class="stack" ${sch0 !== "month" ? "hidden" : ""}>
      <div class="field"><label for="tkWhen">Quels mois ?</label>
        <select id="tkWhen">${[["once","Un seul mois"],["monthly","Tous les mois"],["months","Certains mois, chaque année"]].map(([k,l]) => `<option value="${k}" ${k===rec0?"selected":""}>${l}</option>`).join("")}</select></div>
      ${everyField("tkEveryM", sch0 === "month" && t ? everyOf(t) : 1, "mois", rec0 !== "monthly")}
      <div class="field" id="tkMonthBox" ${rec0 !== "once" ? "hidden" : ""}><label for="tkMonth">Mois</label><input type="month" id="tkMonth" value="${esc(t?.month || ym(state.taskMonth))}"></div>
      <div class="field" id="tkMonthsBox" ${rec0 !== "months" ? "hidden" : ""}><span class="lbl">Mois concernés</span>${pick("months", monthOptions(), t?.months?.length ? t.months : [state.taskMonth.getMonth()+1], true, "months")}</div>
      </div>
      <div class="field"><span class="lbl">Rappel</span>
        <label class="switch" for="tkRemOn"><input type="checkbox" id="tkRemOn" ${t?.remindDay > 0 || t?.remindOn ? "checked" : ""}><span id="tkRemLbl">${sch0 === "month" ? "Me le rappeler chaque mois concerné" : "Me le rappeler"}</span></label>
        <div class="row" id="tkRemBox" style="flex-wrap:nowrap" ${t?.remindDay > 0 || t?.remindOn ? "" : "hidden"}>
          <div class="field" id="tkRemDateBox" style="flex:2;min-width:0" ${sch0 !== "dates" ? "hidden" : ""}><label for="tkRemDate">Le</label><input type="date" id="tkRemDate" value="${ymd(addDays(parse(t?.date || day || ymd(today)), -(Number(t?.remindDays) || 0)))}"></div>
          <div class="field" id="tkRemLeadBox" style="flex:2;min-width:0" ${sch0 !== "weekdays" ? "hidden" : ""}><label for="tkRemLead">Quand</label><select id="tkRemLead">${[0,1,2,3,4,5,6].map(k => `<option value="${k}" ${(Number(t?.remindDays) || 0) === k ? "selected" : ""}>${k === 0 ? "Le jour même" : k === 1 ? "La veille" : k + " jours avant"}</option>`).join("")}</select></div>
          <div class="field" id="tkRemDayBox" style="flex:1;min-width:0" ${sch0 !== "month" ? "hidden" : ""}><label for="tkRemDay">Le (jour du mois)</label><input type="number" id="tkRemDay" min="1" max="31" value="${t?.remindDay || 1}"></div>
          <div class="field" style="flex:1;min-width:0"><label for="tkRemTime">À</label><input type="time" id="tkRemTime" value="${esc(t?.remindTime || "09:00")}"></div>
        </div>
        <div id="tkRemPushBox" ${t?.remindDay > 0 || t?.remindOn ? "" : "hidden"}>${pushField("tkRemPush", t?.push)}</div>
        <span class="note">Le rappel s'affiche dans l'encart Rappels tant que la tâche n'est pas cochée.</span>
      </div>
      ${occBlock(t, "tasks", occ)}
      <div class="row" style="justify-content:space-between">
        ${isNew ? "<span></span>" : `<button type="button" class="btn danger" id="tkDel">Supprimer</button>`}
        <div class="row"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn">${isNew ? "Ajouter" : "Enregistrer"}</button></div>
      </div>
    </form>`, sh => {
    wireIcon(sh); if (t) wireOcc(sh, t, "tasks");
    const when = sh.querySelector("#tkWhen"), remOn = sh.querySelector("#tkRemOn"), sched = sh.querySelector("#tkSched");
    sched.addEventListener("change", () => {
      const v = sched.value;
      sh.querySelector("#tkMonthGroup").hidden = v !== "month";
      sh.querySelector("#tkWeekBox").hidden = v !== "weekdays";
      sh.querySelector("#tkDateBox").hidden = v !== "dates";
      sh.querySelector("#tkRemDayBox").hidden = v !== "month";
      sh.querySelector("#tkRemLbl").textContent = v === "month" ? "Me le rappeler chaque mois concerné" : "Me le rappeler";
      sh.querySelector("#tkRemDateBox").hidden = v !== "dates";
      sh.querySelector("#tkRemLeadBox").hidden = v !== "weekdays";
    });
    remOn.addEventListener("change", () => { sh.querySelector("#tkRemBox").hidden = !remOn.checked; sh.querySelector("#tkRemPushBox").hidden = !remOn.checked; });
    // le rappel garde son écart quand la date de la tâche change
    { const td = sh.querySelector("#tkDate"), rd = sh.querySelector("#tkRemDate"); let lead = Number(t?.remindDays) || 0;
      rd.addEventListener("change", () => { if (td.value && rd.value) lead = daysBetween(rd.value, td.value); });
      td.addEventListener("change", () => { if (td.value) rd.value = ymd(addDays(parse(td.value), -lead)); }); }
    wireEvery(sh, "tkEveryW", () => ["semaine", "semaines", true]);
    const tkRep = sh.querySelector("#tkRep");
    const updD = wireEvery(sh, "tkEveryD", () => { const u = EVERY_UNIT[tkRep.value] || ["jour","jours"]; return [u[0], u[1], tkRep.value === "weekly"]; });
    tkRep.addEventListener("change", () => {
      const r = tkRep.value !== "none";
      sh.querySelector("#tkEveryDBox").hidden = !r; updD();
      sh.querySelector('label[for="tkDate"]').textContent = r ? "Première date" : "Le";
      sh.querySelector('label[for="tkEnd"]').innerHTML = (r ? "Fin de la répétition" : "Jusqu'au") + ' <span style="font-weight:400">(facultatif)</span>';
    });
    wireEvery(sh, "tkEveryM", () => ["mois", "mois", false]);
    when.addEventListener("change", () => {
      sh.querySelector("#tkEveryMBox").hidden = when.value !== "monthly";
      sh.querySelector("#tkMonthBox").hidden = when.value !== "once";
      sh.querySelector("#tkMonthsBox").hidden = when.value !== "months";
    });
    sh.querySelector("#tkForm").addEventListener("submit", e => {
      e.preventDefault();
      const title = sh.querySelector("#tkTitle").value.trim(), recur = when.value, cat = getPick(sh, "cat") || "commun";
      if (!title) { toast("Indiquez la tâche."); return; }
      const sc = sched.value;
      const data = {title, acr: readAcr(sh), shared: readShared(sh), ...readIcon(sh), cat, sched: sc, recur, month: null, months: [], remindDay: 0, remindTime: "", remindOn: false,
        days: [], from: "", until: "", date: "", endDate: "", every: 1, repeat: "none", push: remOn.checked ? readPush(sh, "tkRemPush") : true};
      if (sc === "weekdays") {
        data.days = getPicks(sh, "wd").map(Number).sort();
        data.from = sh.querySelector("#tkFrom").value || ymd(today); data.until = sh.querySelector("#tkUntil").value || "";
        if (!data.days.length) { toast("Cochez au moins un jour de la semaine."); return; }
        data.every = readEvery(sh, "tkEveryW"); if (data.every === null) { toast("La périodicité doit être un nombre entre 1 et 99."); return; }
        if (data.until && data.until < data.from) { toast("La date de fin doit être après la date de début."); return; }
      }
      if (sc === "dates") {
        data.date = sh.querySelector("#tkDate").value; data.endDate = sh.querySelector("#tkEnd").value || "";
        if (!data.date) { toast("Choisissez la date."); return; }
        data.repeat = tkRep.value;
        if (data.repeat !== "none") {
          data.until = data.endDate; data.endDate = "";
          data.every = readEvery(sh, "tkEveryD"); if (data.every === null) { toast("La périodicité doit être un nombre entre 1 et 99."); return; }
          if (data.until && data.until < data.date) { toast("La fin de la répétition doit être après la première date."); return; }
        }
        if (data.endDate && data.endDate < data.date) { toast("La date de fin doit être après la date de début."); return; }
      }
      if (sc !== "month") {
        data.recur = "once"; data.month = null;
        data.remindDays = 0;
        if (remOn.checked) {
          data.remindOn = true; data.remindTime = sh.querySelector("#tkRemTime").value || "09:00";
          if (sc === "weekdays") data.remindDays = Number(sh.querySelector("#tkRemLead").value) || 0;
          if (sc === "dates") {
            const rd = sh.querySelector("#tkRemDate").value; if (!rd) { toast("Choisissez la date du rappel."); return; }
            data.remindDays = daysBetween(rd, data.date);
            if (data.remindDays < 0) { toast("Le rappel doit tomber avant la date ou le jour même."); return; }
          }
        }
      }
      if (sc === "month" && remOn.checked) {
        data.remindDay = Math.round(Number(sh.querySelector("#tkRemDay").value));
        data.remindTime = sh.querySelector("#tkRemTime").value || "09:00";
        if (!(data.remindDay >= 1 && data.remindDay <= 31)) { toast("Indiquez un jour du mois entre 1 et 31."); return; }
      }
      if (sc === "month" && recur === "once") { data.month = sh.querySelector("#tkMonth").value; if (!data.month) { toast("Choisissez le mois."); return; } }
      if (sc === "month" && recur === "monthly") { data.every = readEvery(sh, "tkEveryM"); if (data.every === null) { toast("La périodicité doit être un nombre entre 1 et 99."); return; } }
      if (sc === "month" && recur === "months") { data.months = getPicks(sh, "months").map(Number); if (!data.months.length) { toast("Cochez au moins un mois."); return; } }
      if (isNew) { data.done = false; data.doneIn = []; data.startMonth = ym(state.taskMonth); guard(save("tasks", newId(), data)); }
      else {
        if (recur !== "once" && !t.startMonth) data.startMonth = t.month || ym(state.taskMonth);
        guard(patch("tasks", t.id, data));
      }
      if (sc === "month" && recur === "once") state.taskMonth = parse(data.month + "-01");
      if (sc === "dates") state.taskMonth = new Date(parse(data.date).getFullYear(), parse(data.date).getMonth(), 1);
      closeSheet(); toast(isNew ? "Tâche ajoutée" : "Tâche enregistrée"); render();
    });
    armDelete(sh.querySelector("#tkDel"), "Confirmer la suppression", () => { guard(remove("tasks", t.id)); closeSheet(); toast("Tâche supprimée"); });
  });
}

const stepRow = (it) => `<div class="addline step" data-done="${!!it.done}"><textarea class="stepIn" rows="1" aria-label="Étape">${esc(it.t)}</textarea><button type="button" class="mv" data-mvstep="-1" aria-label="Monter l'étape">↑</button><button type="button" class="mv" data-mvstep="1" aria-label="Descendre l'étape">↓</button><button type="button" class="del" data-rmstep aria-label="Retirer l'étape">×</button></div>`;
function projectSheet(p, day){
  const isNew = !p;
  openSheet(`
    <div class="eyebrow">${isNew ? "Nouveau projet" : "Modifier le projet"}</div>
    <form id="pjForm" class="stack">
      <div class="field"><label for="pjTitle">Nom du projet</label><input type="text" id="pjTitle" value="${esc(p?.title || "")}" placeholder="Ex. Refaire la salle de bain"></div>
      ${acrField(p?.acr)}
      <div class="field"><span class="lbl">Type</span>${pick("kind", Object.entries(KINDS).map(([k,l]) => ({v:k, label:l, dot:false})), p?.kind || "travaux")}</div>
      <div class="field"><span class="lbl">Personne / catégorie</span>${pick("cat", catOptionsNoBd(), p?.cat || "commun")}</div>
      ${sharedField(p?.shared)}
      <div class="field"><span class="lbl">Mois concernés <span style="font-weight:400">(facultatif)</span></span>${pick("months", monthOptions(), p?.months || [], true, "months")}</div>
      <div class="row" style="flex-wrap:nowrap">
        <div class="field" style="flex:1;min-width:0" id="pjYearBox" ${p?.yearly ? "hidden" : ""}><label for="pjYear">Année</label><input type="number" id="pjYear" min="2024" max="2100" value="${p?.year || today.getFullYear()}"></div>
        <label class="switch" for="pjYearly" style="flex:1.4;min-width:0;padding-top:18px"><input type="checkbox" id="pjYearly" ${p?.yearly ? "checked" : ""}>Revient chaque année</label>
      </div>
      <div class="field"><span class="lbl">Rappel</span>
        <label class="switch" for="pjRemOn"><input type="checkbox" id="pjRemOn" ${p?.remindDate ? "checked" : ""}>Me le rappeler</label>
        <div class="row" id="pjRemBox" style="flex-wrap:nowrap" ${p?.remindDate ? "" : "hidden"}>
          <div class="field" style="flex:2;min-width:0"><label for="pjRemDate">Le</label><input type="date" id="pjRemDate" value="${esc(p?.remindDate || day || ymd(today))}"></div>
          <div class="field" style="flex:1;min-width:0"><label for="pjRemTime">À</label><input type="time" id="pjRemTime" value="${esc(p?.remindTime || "09:00")}"></div>
        </div>
        <div id="pjRemPushBox" ${p?.remindDate ? "" : "hidden"}>${pushField("pjRemPush", p?.push)}</div>
        <span class="note">Si le projet revient chaque année, le rappel aussi.</span>
      </div>
      ${p?.when ? `<div class="field"><label for="pjWhen">Précision</label><input type="text" id="pjWhen" value="${esc(p.when)}"></div>` : ""}
      ${isNew ? "" : `<div class="field"><span class="lbl">Étapes</span><div id="pjSteps" class="stack" style="gap:6px">${(p.items || []).map(stepRow).join("")}</div>
        <button type="button" class="btn ghost" id="pjAddStep">+ Ajouter une étape</button></div>`}
      <div class="row" style="justify-content:space-between">
        ${isNew ? "<span></span>" : `<button type="button" class="btn danger" id="pjDel">Supprimer</button>`}
        <div class="row"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn">${isNew ? "Créer" : "Enregistrer"}</button></div>
      </div>
    </form>`, sh => {
    const yearly = sh.querySelector("#pjYearly"), pjRemOn = sh.querySelector("#pjRemOn");
    pjRemOn.addEventListener("change", () => { sh.querySelector("#pjRemBox").hidden = !pjRemOn.checked; sh.querySelector("#pjRemPushBox").hidden = !pjRemOn.checked; });
    yearly.addEventListener("change", () => { sh.querySelector("#pjYearBox").hidden = yearly.checked; });
    const steps = sh.querySelector("#pjSteps");
    sh.querySelector("#pjAddStep")?.addEventListener("click", () => {
      steps.insertAdjacentHTML("beforeend", stepRow({t:"", done:false})); refreshMv(); steps.lastElementChild.querySelector(".stepIn").focus();
    });
    const refreshMv = () => steps?.querySelectorAll(".step").forEach((r, i, all) => {
      r.querySelector('[data-mvstep="-1"]').disabled = i === 0; r.querySelector('[data-mvstep="1"]').disabled = i === all.length - 1; });
    steps?.addEventListener("click", e => {
      const b = e.target.closest("[data-rmstep]"); if (b) { b.closest(".step").remove(); refreshMv(); return; }
      const mv = e.target.closest("[data-mvstep]"); if (!mv) return;
      const row = mv.closest(".step");
      if (mv.dataset.mvstep === "-1" && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
      if (mv.dataset.mvstep === "1" && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
      refreshMv(); mv.focus();
    });
    refreshMv();
    // les étapes longues s'affichent sur plusieurs lignes
    const grow = ta => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; };
    steps?.querySelectorAll(".stepIn").forEach(grow);
    steps?.addEventListener("input", e => { if (e.target.classList.contains("stepIn")) grow(e.target); });
    sh.querySelector("#pjForm").addEventListener("submit", e => {
      e.preventDefault();
      const title = sh.querySelector("#pjTitle").value.trim(); if (!title) { toast("Donnez un nom au projet."); return; }
      const data = {
        title, acr: readAcr(sh), shared: readShared(sh), kind: getPick(sh, "kind") || "autre", cat: getPick(sh, "cat") || "commun",
        months: getPicks(sh, "months").map(Number), yearly: yearly.checked,
        year: yearly.checked ? null : Number(sh.querySelector("#pjYear").value) || today.getFullYear(),
        remindDate: pjRemOn.checked ? sh.querySelector("#pjRemDate").value : "",
        remindTime: pjRemOn.checked ? (sh.querySelector("#pjRemTime").value || "09:00") : "",
        push: pjRemOn.checked ? readPush(sh, "pjRemPush") : true
      };
      if (pjRemOn.checked && !data.remindDate) { toast("Choisissez la date du rappel."); return; }
      const w = sh.querySelector("#pjWhen"); if (w) data.when = w.value.trim();
      if (isNew) { data.items = []; guard(save("projects", newId(), data)); }
      else {
        data.items = [...steps.querySelectorAll(".step")].map(r => ({t: r.querySelector(".stepIn").value.trim(), done: r.dataset.done === "true"})).filter(it => it.t);
        guard(patch("projects", p.id, data));
      }
      closeSheet(); toast(isNew ? "Projet créé" : "Projet enregistré");
    });
    armDelete(sh.querySelector("#pjDel"), "Confirmer la suppression", () => { guard(remove("projects", p.id)); closeSheet(); toast("Projet supprimé"); });
  });
}

/* ---------- interactions ---------- */
document.addEventListener("click", e => {
  const t = e.target;
  const pb = t.closest(".pick [data-v]");
  if (pb) {
    const g = pb.closest(".pick");
    if (g.dataset.multi === "true") pb.setAttribute("aria-pressed", pb.getAttribute("aria-pressed") !== "true");
    else g.querySelectorAll("[data-v]").forEach(x => x.setAttribute("aria-pressed", x === pb));
    const name = g.dataset.name, v = pb.dataset.v;
    if (name === "me") setMe(v);
    if (name === "welcome") { setMe(v); closeSheet(); toast("Bonjour " + WHO[v]); }
    onPick[name]?.(v, pb.closest(".sheet"), pb.closest("form"));
    return;
  }
  const sb = t.closest("[data-sub]"); if (sb) { goTab(sb.dataset.sub); return; }
  const pm = t.closest("[data-partmv]"); if (pm) {
    const {order, hide} = getLayout(), i = order.indexOf(pm.dataset.partmv), j = i + Number(pm.dataset.dir);
    if (j >= 0 && j < order.length) { [order[i], order[j]] = [order[j], order[i]]; saveLayout(order, hide); }
    return; }
  if (t.closest("#layoutReset")) { saveLayout(Object.keys(PARTS), getLayout().hide); toast("Ordre par défaut rétabli"); return; }
  const tp = t.closest("[data-themepick]"); if (tp && state.me) {
    const next = {...(state.settings[state.me] || {}), theme: tp.dataset.themepick};
    guard(rawSave("settings", state.me, next)); state.settings[state.me] = next;
    applyTheme(); renderSettings(); toast("Thème « " + THEMES[tp.dataset.themepick].label + " »"); return; }
  const ss = t.closest("[data-setsub]"); if (ss) { state.setSub = ss.dataset.setsub; renderAudit(); window.scrollTo(0,0); return; }
  const au = t.closest("[data-audit]"); if (au) { state.auditType = au.dataset.audit; renderAudit(); return; }
  const at = t.closest("[data-alltype]"); if (at) { state.allType = at.dataset.alltype; renderAll(); return; }
  const asg = t.closest("[data-asg]"); if (asg) {
    guard(patch(asg.dataset.asg, asg.dataset.id, {cat: asg.dataset.cat}));
    toast("Classé dans « " + catInfo(asg.dataset.cat).label + " »"); return; }
  const qd = t.closest("[data-qdone]"); if (qd) {
    const task = state.tasks.find(x => x.id === qd.dataset.qdone); if (!task) return;
    const m = ym(new Date());
    if (qd.dataset.qday) guard(patch("tasks", task.id, {doneIn: [...new Set([...(task.doneIn || []), qd.dataset.qday])]}));
    else if (taskSched(task) === "dates") guard(patch("tasks", task.id, {done: true}));
    else if (taskRecur(task) === "once") guard(patch("tasks", task.id, {done: true}));
    else guard(patch("tasks", task.id, {doneIn: [...new Set([...(task.doneIn || []), m])]}));
    toast("« " + task.title + " » faite"); return; }
  if (t.closest("#remsToggle")) { state.remsOpen = !state.remsOpen; store.set("cc-rems-open", state.remsOpen ? "1" : "0"); renderReminders(); return; }
  const vu = t.closest("[data-vu]"); if (vu) {
    const key = vu.dataset.vu, title = dueReminders().find(r => r.key === key)?.title || "";
    dismissed[key] = 1; store.set("cc-rem-vus", JSON.stringify(dismissed)); renderReminders();
    pushUndo({label: `« Vu » sur le rappel${title ? " « " + title + " »" : ""}`, custom: () => {
      delete dismissed[key]; store.set("cc-rem-vus", JSON.stringify(dismissed)); renderReminders(); },
      redo: () => { dismissed[key] = 1; store.set("cc-rem-vus", JSON.stringify(dismissed)); renderReminders(); }});
    return; }
  const day = t.closest(".day[data-d]"); if (day) { state.sel = day.dataset.d; const d = parse(state.sel);
    if (d.getMonth() !== state.view.getMonth()) state.view = new Date(d.getFullYear(), d.getMonth(), 1); renderCal(); return; }
  const md = t.closest("[data-mode]"); if (md) { modeTouched = true; state.mode = md.dataset.mode; store.set("cc-mode", state.mode); render(); return; }
  if (t.closest("#profileBtn")) { goTab("set"); return; }
  const bd = t.closest("[data-bd]"); if (bd) { const x = state.events.find(e => e.id === bd.dataset.bd); x && birthdaySheet(x); return; }
  const ev = t.closest("[data-ev]"); if (ev) { const x = state.events.find(e => e.id === ev.dataset.ev); x && (isBday(x) && (x.source || "manuel") === "manuel" ? birthdaySheet(x) : eventSheet(x, ev.dataset.occ)); return; }
  const tab = t.closest("[data-tab]"); if (tab) { goTab(tab.dataset.tab); return; }
  const ec = t.closest("[data-edcat]"); if (ec) { categorySheet(catInfo(ec.dataset.edcat)); return; }
  const et = t.closest("[data-edtk]"); if (et) { const x = state.tasks.find(k => k.id === et.dataset.edtk); x && taskSheet(x, et.dataset.occ); return; }
  const us = t.closest("[data-unskip]"); if (us) {
    const col = us.dataset.unskip, x = (state[col] || []).find(k => k.id === us.dataset.id); if (!x) return;
    guard(patch(col, x.id, {skips: (x.skips || []).filter(s => s.d !== us.dataset.day)}));
    if (us.closest(".sheet")) closeSheet();
    toast("Date rétablie à son jour d'origine"); return; }
  const ep = t.closest("[data-edpj]"); if (ep) { const x = state.projects.find(k => k.id === ep.dataset.edpj); x && projectSheet(x); return; }
});
function goTab(k){
  if (SUBS[k]) { state.sub = k; store.set("cc-sub", k); k = "act"; }
  state.tab = k; store.set("cc-tab", k); render(); renderSettings(); window.scrollTo(0,0);
}
document.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "notifMode") { setNotifMode(t.value); return; }
  if (t.id === "quietOn" || t.id === "quietStart" || t.id === "quietEnd") { saveQuiet(); return; }
  if (t.id === "startMode") { setStartMode(t.value); return; }
  if (t.dataset.tk) {
    const task = state.tasks.find(x => x.id === t.dataset.tk); if (!task) return;
    const m = t.dataset.m || ym(state.taskMonth);
    if (t.dataset.tday) { const set = new Set(task.doneIn || []); t.checked ? set.add(t.dataset.tday) : set.delete(t.dataset.tday); guard(patch("tasks", task.id, {doneIn: [...set]})); }
    else if (taskSched(task) === "dates") guard(patch("tasks", task.id, {done: t.checked}));
    else if (taskRecur(task) === "once") guard(patch("tasks", task.id, {done: t.checked}));
    else { const set = new Set(task.doneIn || []); t.checked ? set.add(m) : set.delete(m); guard(patch("tasks", task.id, {doneIn: [...set]})); }
    setTimeout(renderReminders, 50);
  }
  if (t.dataset.partshow) {
    const {order} = getLayout(), hide = (state.settings[state.me]?.hide || []), k = t.dataset.partshow;
    const h = t.checked ? hide.filter(x => x !== k) : [...new Set([...hide, k])];
    saveLayout(order, h); renderReminders();
  }
  if (t.dataset.pj) { const p = state.projects.find(x => x.id === t.dataset.pj); if (!p) return;
    guard(patch("projects", p.id, {items: (p.items||[]).map((it,i) => i === +t.dataset.i ? {...it, done:t.checked} : it)})); }

});
document.addEventListener("input", e => {
  if (e.target.classList?.contains("colorCustom")) e.target.closest("form")?.querySelectorAll('.pick[data-name="color"] [data-v]').forEach(b => b.setAttribute("aria-pressed", "false"));
});
document.addEventListener("submit", e => {
  if (e.target.id === "catForm") {
    e.preventDefault();
    const f = e.target, label = f.querySelector("#catName").value.trim();
    if (!label) { toast("Donnez un nom à la catégorie."); return; }
    if (allCats().some(c => c.label.toLowerCase() === label.toLowerCase())) { toast("Cette catégorie existe déjà."); return; }
    guard(save("categories", "k" + newId(), {label, color: readColor(f), who: getPick(f, "who") || "tous"}));
    toast("Catégorie « " + label + " » ajoutée"); setTimeout(renderSettings, 50);
    return;
  }
  const f = e.target.closest("[data-addto]"); if (!f) return; e.preventDefault();
  const v = f.querySelector("input").value.trim(); if (!v) return;
  const p = state.projects.find(x => x.id === f.dataset.addto); if (!p) return;
  guard(patch("projects", p.id, {items:[...(p.items||[]), {t:v, done:false}]}));
});
$("#prevM").onclick = () => { state.view = new Date(state.view.getFullYear(), state.view.getMonth()-1, 1); renderCal(); };
$("#nextM").onclick = () => { state.view = new Date(state.view.getFullYear(), state.view.getMonth()+1, 1); renderCal(); };
$("#prevT").onclick = () => { state.taskMonth = new Date(state.taskMonth.getFullYear(), state.taskMonth.getMonth()-1, 1); renderTasks(); };
$("#nextT").onclick = () => { state.taskMonth = new Date(state.taskMonth.getFullYear(), state.taskMonth.getMonth()+1, 1); renderTasks(); };
$("#todayBtn").onclick = () => { state.sel = ymd(today); state.view = new Date(today.getFullYear(), today.getMonth(), 1); state.taskMonth = new Date(state.view); render(); };
$("#addEv").onclick = () => createSheet(state.sel);
$("#addTk").onclick = () => taskSheet(null);
$("#addPj").onclick = () => projectSheet(null);
$("#addBd").onclick = () => birthdaySheet(null);
$("#addEv2").onclick = () => eventSheet(null);
$("#prevE").onclick = () => { state.evMonth = new Date(state.evMonth.getFullYear(), state.evMonth.getMonth() - 1, 1); renderEvents(); };
$("#nextE").onclick = () => { state.evMonth = new Date(state.evMonth.getFullYear(), state.evMonth.getMonth() + 1, 1); renderEvents(); };
$("#evMonthLabel").onclick = () => monthPicker(state.evMonth, d => { state.evMonth = d; renderEvents(); });
$("#hidePast").addEventListener("change", e => { state.hidePast = e.target.checked; store.set("cc-hidepast", state.hidePast ? "1" : "0"); renderEvents(); });
$("#evSort").addEventListener("change", e => { state.evSort = e.target.value; store.set("cc-evsort", state.evSort); renderEvents(); });
$("#newsSeen").onclick = () => markSeen();
$("#undoBtn").onclick = () => undo();
$("#redoBtn").onclick = () => redo();
$("#monthLabel").onclick = () => monthPicker(state.view, showCalMonth);
$("#taskMonth").onclick = () => monthPicker(state.taskMonth, d => { state.taskMonth = d; renderTasks(); });
$("#actSearch").addEventListener("input", e => { state.allQuery = e.target.value; renderTabs(); renderAll(); });
// Balayer le calendrier vers la gauche ou la droite change de mois
{ let x0 = null, y0 = null; const cal = document.querySelector(".cal");
  cal.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, {passive:true});
  cal.addEventListener("touchend", e => {
    if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { state.view = new Date(state.view.getFullYear(), state.view.getMonth() + (dx < 0 ? 1 : -1), 1); renderCal(); }
  }, {passive:true}); }
document.addEventListener("keydown", e => { if (e.key === "Escape" && !sheetLocked) closeSheet(); });

{ const t = store.get("cc-tab"), sb = store.get("cc-sub");
  if (sb && SUBS[sb]) state.sub = sb;
  if (sb === "all") state.sub = "events";
  if (t && SUBS[t]) { state.tab = "act"; state.sub = t; } else if (t && TITLES[t]) state.tab = t; }
render(); renderSettings();
if (!state.me) welcomeSheet();

/* ---------- base partagée ---------- */
(async () => {
  try { db = window.claude?.use ? await window.claude.use("db") : null; } catch { db = null; }
  if (!db) { const b = $("#banner"); b.hidden = false; b.textContent = "Base de données indisponible."; return; }
  const lost = () => { const b = $("#banner"); b.hidden = false; b.textContent = "Accès à la base refusé ou perdu. Vérifiez votre connexion, puis rouvrez l'appli."; };
  for (const col of ["events","tasks","projects","categories","log","shoplists","shopitems","products","dishes"]) {
    db.collection(col).onSnapshot(s => { state[col] = s.docs.map(d => ({...d.data(), id:d.id})); render(); }, lost);
  }
  // Ménage du journal : on oublie les changements de plus de 30 jours
  try {
    const limit = new Date(Date.now() - 30*864e5).toISOString();
    const old = await db.collection("log").where("at", "<", limit).limit(200).get();
    let n = 0;
    for (const d of old.docs) {
      const v = d.data().verb;
      if (v === "ajout" || v === "suppression") continue; // conservés pour l'historique
      await db.collection("log").doc(d.id).delete(); if (++n >= 50) break;
    }
  } catch {}
  db.collection("settings").onSnapshot(s => { state.settings = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); applyStartMode(); render(); renderSettings(); }, () => {});
  window.APP_API = {renderSettings: () => renderSettings(), me: () => state.me, settings: () => state.settings, toast: m => toast(m)};
  db.doc("meta/sync").onSnapshot(s => { state.sync = s.exists ? s.data() : {}; renderSettings(); }, () => {});
})();
})();
