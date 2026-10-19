// Calcul des rappels à envoyer — même logique que la ligne « Rappels » de l'appli (docs/calendar.js).
// Utilisé par send-reminders.mjs ; vérifié par test-reminders.mjs.

const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d || 1); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();
const atTime = (d, time) => { const [hh, mm] = (time || "09:00").split(":").map(Number); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm); };
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/* ---------- catégories ---------- */
const BUILTIN = [
  { id: "manon", who: "manon" }, { id: "romain", who: "romain" },
  { id: "commun", who: "tous" }, { id: "anniv", who: "tous" },
];
export function catsOf(who, categories) {
  const all = [...BUILTIN, ...categories.map((c) => ({ id: c.id, who: c.who || "tous" }))];
  return all.filter((c) => c.who === who || c.who === "tous").map((c) => c.id);
}

/* ---------- anniversaires « pour » une personne ---------- */
const isBday = (e) => !!e.isBirthday || e.cat === "anniv";
const bdOwner = (e) => (e.bdFor === "manon" || e.bdFor === "romain" ? e.bdFor : "commun");
const bdVisibleTo = (who) => (e) => !isBday(e) || bdOwner(e) === "commun" || bdOwner(e) === who;

/* ---------- récurrences, dates retirées (skips) et déplacées (skips avec to) ---------- */
const skipOf = (x, k) => (x.skips || []).find((s) => s.d === k);
const movedTo = (x, k) => (x.skips || []).find((s) => s.to === k);
const repeatOf = (e) => e.repeat || (e.cat === "anniv" ? "yearly" : "none");
function occursBase(e, d) {
  if (!e.date) return false;
  const s = parse(e.date); if (d < s) return false;
  const r = repeatOf(e);
  if (r === "none") return ymd(d) === e.date;
  if (e.months?.length && !e.months.includes(d.getMonth() + 1)) return false;
  if (r === "weekly") return d.getDay() === s.getDay();
  if (r === "monthly") return d.getDate() === s.getDate();
  if (r === "yearly") return d.getDate() === s.getDate() && d.getMonth() === s.getMonth();
  return false;
}
function nextOccurrence(e, now) {
  const [hh, mm] = (e.time || "09:00").split(":").map(Number);
  if (repeatOf(e) === "none") { const s = parse(e.date); const at = new Date(s.getFullYear(), s.getMonth(), s.getDate(), hh, mm); return at > now ? at : null; }
  const start = startOfDay(now);
  for (let i = 0; i <= 400; i++) {
    const d = addDays(start, i);
    if ((occursBase(e, d) && !skipOf(e, ymd(d))) || movedTo(e, ymd(d))) { const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm); if (at > now) return at; }
  }
  return null;
}

/* ---------- tâches ---------- */
const taskRecur = (t) => t.recur || "once";
const taskCat = (t) => t.cat || (t.who === "manon" || t.who === "romain" ? t.who : t.who ? "commun" : "");
const taskSched = (t) => t.sched || "month";
const isoDow = (d) => (d.getDay() + 6) % 7 + 1;
function taskOnDay(t, d) {
  const s = taskSched(t), k = ymd(d);
  if (s === "weekdays" && movedTo(t, k)) return true;
  if (s === "weekdays") return (t.days || []).includes(isoDow(d)) && (!t.from || k >= t.from) && (!t.until || k <= t.until) && !skipOf(t, k);
  if (s === "dates") return !!t.date && k >= t.date && k <= (t.endDate && t.endDate > t.date ? t.endDate : t.date);
  return false;
}
function taskDaysIn(t, ymStr) {
  const [y, m] = ymStr.split("-").map(Number), out = [];
  for (let d = 1; d <= lastDay(y, m - 1); d++) { const x = new Date(y, m - 1, d); if (taskOnDay(t, x)) out.push(x); }
  return out;
}
function taskIn(t, ymStr) {
  if (taskSched(t) !== "month") return taskDaysIn(t, ymStr).length > 0;
  const r = taskRecur(t), m = Number(ymStr.slice(5));
  if (r === "once") return t.month === ymStr;
  if (t.startMonth && ymStr < t.startMonth) return false;
  if (r === "monthly") return true;
  if (r === "months") return (t.months || []).includes(m);
  return false;
}
function taskDone(t, ymStr) {
  const s = taskSched(t);
  if (s === "dates") return !!t.done;
  if (s === "weekdays") { const days = taskDaysIn(t, ymStr); return days.length > 0 && days.every((x) => (t.doneIn || []).includes(ymd(x))); }
  return taskRecur(t) === "once" ? !!(t.done || (t.doneIn || []).includes(ymStr)) : (t.doneIn || []).includes(ymStr);
}
const taskDoneOn = (t, d) => (taskSched(t) === "weekdays" ? (t.doneIn || []).includes(ymd(d)) : taskSched(t) === "dates" ? !!t.done : taskDone(t, ym(d)));

/* ---------- rappels dus pour une personne ---------- */
// data = {events, tasks, projects, categories} (listes de documents avec id) ; renvoie [{key, kind, title, at, occ}]
export function dueReminders(who, data, now = new Date()) {
  const mine = catsOf(who, data.categories || []), out = [];
  for (const e of (data.events || []).filter(bdVisibleTo(who))) {
    if (!(e.remindH > 0 || e.remindAt) || !e.date || !mine.includes(e.cat)) continue;
    const at = nextOccurrence(e, now); if (!at) continue;
    const fire = e.remindAt ? atTime(addDays(at, -(e.remindAt.days || 0)), e.remindAt.time) : new Date(at.getTime() - e.remindH * 3600e3);
    if (fire <= now) out.push({ key: e.id + "@" + ymd(at), kind: isBday(e) ? "anniv" : "event", title: e.title, at, hasTime: !!e.time });
  }
  const m = ym(now);
  for (const t of data.tasks || []) {
    if (taskSched(t) !== "month") {
      if (!t.remindOn || !mine.includes(taskCat(t))) continue;
      const lead = Math.max(0, Number(t.remindDays) || 0);
      for (let k = 0; k <= lead; k++) {
        const D = addDays(startOfDay(now), k);
        if (!taskOnDay(t, D) || taskDoneOn(t, D)) continue;
        const at = atTime(addDays(D, -lead), t.remindTime);
        if (at <= now) out.push({ key: "t" + t.id + "@" + ymd(D), kind: "task-day", title: t.title, at: D });
      }
      continue;
    }
    if (!(t.remindDay > 0) || !mine.includes(taskCat(t)) || !taskIn(t, m) || taskDone(t, m)) continue;
    const at = atTime(new Date(now.getFullYear(), now.getMonth(), Math.min(t.remindDay, lastDay(now.getFullYear(), now.getMonth()))), t.remindTime);
    if (at <= now) out.push({ key: "t" + t.id + "@" + m, kind: "task-month", title: t.title, at });
  }
  for (const p of data.projects || []) {
    if (!p.remindDate || !mine.includes(p.cat || "commun")) continue;
    const s = parse(p.remindDate);
    const d = p.yearly ? new Date(now.getFullYear(), s.getMonth(), s.getDate()) : s;
    if (p.yearly && d < s) continue;
    const at = atTime(d, p.remindTime);
    if (at <= now && now - at < 7 * 864e5) out.push({ key: "p" + p.id + "@" + ymd(at), kind: "project", title: p.title, at });
  }
  return out;
}

/* ---------- texte de la notification ---------- */
function whenText(at, now, withTime) {
  const days = Math.round((startOfDay(at) - startOfDay(now)) / 864e5);
  const day = days === 0 ? "aujourd'hui" : days === 1 ? "demain" : at.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return withTime ? `${day} à ${pad(at.getHours())}:${pad(at.getMinutes())}` : day;
}
export function reminderMessage(r, now = new Date()) {
  if (r.kind === "task-month") return { title: "Tâche du mois", body: r.title };
  if (r.kind === "task-day") return { title: ymd(r.at) === ymd(now) ? "Tâche du jour" : "Tâche " + whenText(r.at, now, false), body: r.title };
  if (r.kind === "project") return { title: "Projet", body: r.title };
  if (r.kind === "anniv") return { title: "Anniversaire " + whenText(r.at, now, false), body: r.title };
  return { title: "Rappel · " + whenText(r.at, now, r.hasTime), body: r.title };
}
