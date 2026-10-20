// Tests de la logique des rappels :  npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dueReminders, reminderMessage, inQuiet } from "./reminders.mjs";

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

// Périodicités : Piscine 1 semaine sur 2 depuis le 6 oct. (20 oct. oui, 27 non) ; Médoc tous les 3 jours depuis le 14 (20 oui, 21 non)
assert.ok(keys("romain", at("2026-10-19T20:05:00")).includes("i1@2026-10-20"));
assert.ok(!keys("romain", at("2026-10-26T20:05:00")).includes("i1@2026-10-27"));
assert.ok(keys("romain", at("2026-10-20T08:05:00")).includes("i2@2026-10-20"));
assert.ok(!keys("romain", at("2026-10-21T08:05:00")).some((k) => k.startsWith("i2@")));
// Encombrants jeudi 1 semaine sur 2 depuis le 1er oct. : 15 oui, 22 non
assert.ok(keys("romain", at("2026-10-14T18:05:00")).includes("ti3@2026-10-15"));
assert.ok(!keys("romain", at("2026-10-21T18:05:00")).includes("ti3@2026-10-22"));
// Filtre tous les 2 mois depuis septembre : novembre oui, octobre non
assert.ok(!romain.includes("ti4@2026-10"));
assert.ok(keys("romain", at("2026-11-02T10:00:00")).includes("ti4@2026-11"));

// Tâches à une date qui se répètent : Arroser tous les 3 jours depuis le 14 (20 oui, 21 non ; 17 coché)
assert.ok(keys("romain", at("2026-10-20T08:05:00")).includes("tr1@2026-10-20"));
assert.ok(!keys("romain", at("2026-10-21T08:05:00")).some((k) => k.startsWith("tr1@")));
assert.ok(!keys("romain", at("2026-10-17T08:05:00")).includes("tr1@2026-10-17"));
// Filtre piscine le 20, un mois sur deux depuis août, la veille à 9 h ; 20 déc. déplacé au 21
assert.ok(keys("romain", at("2026-10-19T09:05:00")).includes("tr2@2026-10-20"));
assert.ok(!keys("romain", at("2026-11-19T09:05:00")).includes("tr2@2026-11-20"));
assert.ok(!keys("romain", at("2026-12-19T09:05:00")).includes("tr2@2026-12-20"));
assert.ok(keys("romain", at("2026-12-20T09:05:00")).includes("tr2@2026-12-21"));

// Rappel « dans l'appli seulement » : calculé, mais marqué sans notification
const q = dueReminders("romain", data, now).find((r) => r.key === "q1@2026-10-24");
assert.ok(q && q.push === false);
assert.ok(dueReminders("romain", data, now).find((r) => r.key === "a@2026-10-24").push === true);

// Créneau sans notification
assert.ok(inQuiet(undefined, at("2026-10-19T23:30:00")) && !inQuiet(undefined, at("2026-10-19T07:00:00")));
assert.ok(inQuiet({ on: true, start: "00:00", end: "05:00" }, at("2026-10-19T04:59:00")));
assert.ok(!inQuiet({ on: true, start: "00:00", end: "05:00" }, at("2026-10-19T23:30:00")));
assert.ok(!inQuiet({ on: false, start: "22:00", end: "07:00" }, at("2026-10-19T23:30:00")));
assert.ok(inQuiet({ on: true, start: "13:00", end: "14:00" }, at("2026-10-19T13:15:00")));

const m = reminderMessage(dueReminders("romain", data, now).find((r) => r.key === "a@2026-10-24"), now);
assert.equal(m.body, "Dîner chez Claire");
console.log("Exemple :", m.title, "—", m.body);
console.log("Tous les tests passent.");
