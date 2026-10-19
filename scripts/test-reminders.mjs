// Tests de la logique des rappels :  npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dueReminders, reminderMessage } from "./reminders.mjs";

const data = JSON.parse(readFileSync(new URL("./fixture.json", import.meta.url)));
const keys = (who, now) => dueReminders(who, data, now).map((r) => r.key).sort();
const at = (s) => new Date(s); // heure locale (TZ=Europe/Paris)

const now = at("2026-10-19T17:00:00");
const romain = keys("romain", now), manon = keys("manon", now);
console.log("romain", romain); console.log("manon", manon);

// Événement commun : 7 jours avant le 24 → dû
assert.ok(romain.includes("a@2026-10-24") && manon.includes("a@2026-10-24"));
// Gastro à 17:00 : rappel 3 h avant, mais l'occurrence est passée (17:00 pile) → plus dû
assert.ok(!romain.includes("c@2026-10-19"));
// Yoga déplacé du 21 au 22, rappel le jour même à 8 h → pas encore dû le 19 ; dû le 22 à 8 h
assert.ok(!manon.some((k) => k.startsWith("b@")));
assert.ok(keys("manon", at("2026-10-22T08:05:00")).includes("b@2026-10-22"));
assert.ok(!keys("manon", at("2026-10-21T08:05:00")).includes("b@2026-10-21"));
// Anniversaire de Maman, 7 jours avant à 9 h → dû pour les deux
assert.ok(romain.includes("d@2026-10-25") && manon.includes("d@2026-10-25"));
// Anniversaire « pour Manon » : jamais pour Romain
assert.ok(manon.includes("d2@2026-10-20") && !romain.some((k) => k.startsWith("d2@")));
// Anniversaire « pour Romain » (catégorie Famille), 2 jours avant à 10 h → dû pour Romain seulement
assert.ok(romain.includes("d3@2026-10-21") && !manon.some((k) => k.startsWith("d3@")));
// Catégorie Sport (Manon) : la veille à 12 h
assert.ok(manon.includes("f@2026-10-20") && !romain.includes("f@2026-10-20"));
// Réunion : 19 et 26 retirés → prochaine le 2 nov., rappel le 1er à 14 h
assert.ok(!romain.some((k) => k.startsWith("g@")));
assert.ok(keys("romain", at("2026-11-01T14:00:00")).includes("g@2026-11-02"));
// Sans catégorie : pas de rappel
assert.ok(!romain.some((k) => k.startsWith("h@")));
// Tâches du mois
assert.ok(romain.includes("tt1@2026-10") && !manon.includes("tt1@2026-10"));
assert.ok(romain.includes("tt2@2026-10"));
assert.ok(!romain.includes("tt6@2026-10")); // déjà faite
// Poubelles mar./jeu., la veille à 19 h ; jeudi 22 déplacé au vendredi 23
assert.ok(!romain.some((k) => k.startsWith("tt3@")));
assert.ok(keys("romain", at("2026-10-19T19:00:00")).includes("tt3@2026-10-20"));
assert.ok(!keys("romain", at("2026-10-21T19:30:00")).includes("tt3@2026-10-22"));
assert.ok(keys("romain", at("2026-10-22T19:30:00")).includes("tt3@2026-10-23"));
// Clés le 21, rappel 2 jours avant à 10 h → dû pour Manon
assert.ok(manon.includes("tt4@2026-10-21") && !romain.includes("tt4@2026-10-21"));
// Arrosage du lundi déjà coché
assert.ok(!romain.includes("tt5@2026-10-19"));
// Projets : rappel de moins de 7 jours ; annuel ; trop ancien
assert.ok(romain.includes("pp1@2026-10-17") && manon.includes("pp1@2026-10-17"));
assert.ok(manon.includes("pp2@2026-10-18") && !romain.includes("pp2@2026-10-18"));
assert.ok(!romain.includes("pp3@2026-10-01"));

const m = reminderMessage(dueReminders("romain", data, now).find((r) => r.key === "a@2026-10-24"), now);
assert.equal(m.body, "Dîner chez Claire");
console.log("Exemple :", m.title, "—", m.body);
console.log("Tous les tests passent.");
