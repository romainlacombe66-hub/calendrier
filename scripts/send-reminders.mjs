// Envoi des notifications de rappel aux téléphones.
// Lancé automatiquement toutes les 15 minutes par GitHub Actions (.github/workflows/rappels.yml).
// Variables d'environnement :
//   FIREBASE_SERVICE_ACCOUNT  contenu JSON de la clé du compte de service Firebase (secret GitHub)
//   TZ=Europe/Paris           pour lire les heures à l'heure de Paris
import admin from "firebase-admin";
import { dueReminders, reminderMessage, inQuiet } from "./reminders.mjs";

const PEOPLE = ["romain", "manon"];

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error("Secret FIREBASE_SERVICE_ACCOUNT manquant (étape 6d du guide)."); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();
const now = new Date();

// Qui peut recevoir maintenant ? (« Mes rappels » avec téléphone, et hors de son créneau sans notification)
const settings = Object.fromEntries((await db.collection("settings").get()).docs.map((d) => [d.id, d.data()]));
const ready = PEOPLE.filter((who) => settings[who]?.notify && !inQuiet(settings[who].quiet, now));
if (!ready.length) {
  for (const who of PEOPLE) console.log(`${who} : notifications téléphone ${settings[who]?.notify ? "oui (dans son créneau sans notification)" : "non (Paramètres › Mes rappels)"}`);
  console.log(`${now.toLocaleString("fr-FR")} : personne à notifier en ce moment.`);
  process.exit(0);
}

// On ne lit que les éléments qui ont un rappel : la lecture reste dans le quota gratuit.
async function read(col, ...queries) {
  const byId = new Map();
  for (const q of queries) for (const d of (await q(db.collection(col)).get()).docs) byId.set(d.id, { ...d.data(), id: d.id });
  return [...byId.values()];
}
const data = {
  events: await read("events", (c) => c.where("remindH", ">", 0), (c) => c.where("remindAt", "!=", null)),
  tasks: await read("tasks", (c) => c.where("remindOn", "==", true), (c) => c.where("remindDay", ">", 0)),
  projects: await read("projects", (c) => c.where("remindDate", ">", "")),
  categories: await read("categories", (c) => c),
};
const devices = (await db.collection("devices").get()).docs;
let sent = 0;

// Résumé lisible dans l'onglet Actions de GitHub (utile en cas de souci)
for (const who of PEOPLE) {
  const st = settings[who] || {};
  const n = devices.filter((d) => d.data().who === who).length;
  console.log(`${who} : notifications téléphone ${st.notify ? "oui" : "non"} · ${n} téléphone(s) inscrit(s)${st.notify && !ready.includes(who) ? " · dans son créneau sans notification" : ""}`);
}

for (const who of ready) {
  let tokens = devices.filter((d) => d.data().who === who).map((d) => d.id);
  const all = dueReminders(who, data, now), due = all.filter((r) => r.push);
  console.log(`${who} : ${due.length} rappel(s) dû(s) en ce moment${all.length > due.length ? ` (+ ${all.length - due.length} « dans l'appli seulement »)` : ""}`);
  if (!tokens.length) { if (due.length) console.log(`  aucun téléphone inscrit pour ${who} : rien n'est envoyé (Paramètres › Mes rappels sur le téléphone).`); continue; }

  for (const r of due) {
    // Chaque rappel n'est envoyé qu'une fois par personne ; il n'est noté comme envoyé que s'il est bien parti.
    const mark = db.collection("notifs").doc(`${r.key}_${who}`.replace(/\//g, "-"));
    if ((await mark.get()).exists) continue;
    const msg = reminderMessage(r, now);
    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      data: { title: msg.title, body: msg.body, tag: r.key },
      webpush: { headers: { Urgency: "high", TTL: "86400" } },
    });
    sent += res.successCount;
    console.log(`→ ${who} : ${msg.title} — ${msg.body} (${res.successCount}/${tokens.length} téléphone(s))`);
    res.responses.forEach((x, i) => { if (!x.success) console.log(`  échec vers un téléphone : ${x.error?.code} ${x.error?.message || ""}`); });
    if (res.successCount > 0) await mark.set({ sentAt: now.toISOString(), at: r.at.toISOString(), who });

    // Jetons périmés (appli désinstallée, notifications coupées) : on les oublie.
    const dead = res.responses
      .map((x, i) => (!x.success && ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(x.error?.code) ? tokens[i] : null))
      .filter(Boolean);
    for (const t of dead) await db.collection("devices").doc(t).delete();
    if (dead.length) console.log(`  ${dead.length} téléphone(s) désinscrit(s) retiré(s).`);
    tokens = tokens.filter((t) => !dead.includes(t));
    if (!tokens.length) break;
  }
}

// Ménage : on oublie les rappels envoyés il y a plus de 30 jours.
const old = await db.collection("notifs").where("at", "<", new Date(now - 30 * 864e5).toISOString()).limit(400).get();
if (!old.empty) { const b = db.batch(); old.docs.forEach((d) => b.delete(d.ref)); await b.commit(); }
console.log(`${now.toLocaleString("fr-FR")} : ${sent} notification(s) envoyée(s).`);
