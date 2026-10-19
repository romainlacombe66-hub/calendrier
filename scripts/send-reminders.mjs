// Envoi des notifications de rappel aux téléphones.
// Lancé automatiquement toutes les 15 minutes par GitHub Actions (.github/workflows/rappels.yml).
// Variables d'environnement :
//   FIREBASE_SERVICE_ACCOUNT  contenu JSON de la clé du compte de service Firebase (secret GitHub)
//   TZ=Europe/Paris           pour lire les heures à l'heure de Paris
import admin from "firebase-admin";
import { dueReminders, reminderMessage } from "./reminders.mjs";

const QUIET_START = 22; // pas de notification de 22 h…
const QUIET_END = 7;    // …à 7 h (les rappels de la nuit partent à 7 h)
const PEOPLE = ["romain", "manon"];

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error("Secret FIREBASE_SERVICE_ACCOUNT manquant (étape 6d du guide)."); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();
const now = new Date();

if (now.getHours() >= QUIET_START || now.getHours() < QUIET_END) {
  console.log(`${now.toLocaleString("fr-FR")} : heures calmes, aucun envoi.`);
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
const settings = Object.fromEntries((await db.collection("settings").get()).docs.map((d) => [d.id, d.data()]));
const devices = (await db.collection("devices").get()).docs;
let sent = 0;

for (const who of PEOPLE) {
  if (!settings[who]?.notify) continue; // « Mes rappels » : téléphone non choisi
  const mine = devices.filter((d) => d.data().who === who);
  if (!mine.length) continue;
  let tokens = mine.map((d) => d.id);

  for (const r of dueReminders(who, data, now)) {
    // create() échoue si le document existe : chaque rappel n'est envoyé qu'une fois par personne.
    try {
      await db.collection("notifs").doc(`${r.key}_${who}`.replace(/\//g, "-")).create({ sentAt: now.toISOString(), at: r.at.toISOString(), who });
    } catch (err) {
      if (err.code === 6) continue; // déjà envoyé
      throw err;
    }
    const msg = reminderMessage(r, now);
    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      data: { title: msg.title, body: msg.body, tag: r.key },
      webpush: { headers: { Urgency: "high", TTL: "86400" } },
      android: { priority: "high" },
    });
    sent += res.successCount;
    console.log(`→ ${who} : ${msg.title} — ${msg.body} (${res.successCount}/${tokens.length} téléphone(s))`);

    // Jetons périmés (appli désinstallée, notifications coupées) : on les oublie.
    const dead = res.responses
      .map((x, i) => (!x.success && ["messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"].includes(x.error?.code) ? tokens[i] : null))
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
