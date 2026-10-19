# Calendrier Manon & Romain

Appli web installable (PWA) pour deux téléphones Android : calendrier commun (événements, tâches, projets, anniversaires), rappels et notifications. Version 1 : saisie à la main (la synchro reMarkable viendra en version 2).

- **`docs/`** — l'appli, servie par GitHub Pages.
  - `index.html`, `style.css`, `calendar.js` : interface et logique du calendrier.
  - `app.js` : connexion (Firebase Authentication), base de données (Firestore, avec cache hors connexion), inscription du téléphone aux notifications (Firebase Cloud Messaging).
  - `config.js` : les informations de **votre** projet Firebase (étape 3 du guide). Ne pas écraser lors d'une mise à jour.
  - `firebase-messaging-sw.js` : fonctionnement hors connexion et affichage des notifications.
- **`scripts/send-reminders.mjs`** — envoie les notifications dues. Lancé toutes les 15 minutes par **`.github/workflows/rappels.yml`** (rien entre 22 h et 7 h).
- **`scripts/reminders.mjs`** — calcul des rappels, identique à la ligne « Rappels » de l'appli. Tests : `npm test`.
- **`firestore.rules`** — seules les deux adresses e-mail listées accèdent aux données.

Installation : voir **[GUIDE.md](GUIDE.md)**.

## Données (Firestore)

| Collection | Contenu |
|---|---|
| `events` | événements et anniversaires : `title`, `acr`, `date`, `endDate`, `time`, `cat`, `repeat`, `months`, `skips` (dates retirées ou déplacées : `{d, to?, note, by}`), `remindH` (délai en heures) ou `remindAt` (`{days, time}`), `icon`, `shared` ; anniversaires : `isBirthday`, `bdFor` (`commun`/`manon`/`romain`), `gift`, `noYear` |
| `tasks` | `title`, `cat`, `sched` (`month` · `weekdays` · `dates`), récurrence et dates, `done`/`doneIn`, rappel (`remindDay`, `remindOn`, `remindDays`, `remindTime`), `skips` |
| `projects` | `title`, `kind`, mois/année, `items` (étapes), `remindDate`, `remindTime`, `yearly` |
| `categories` | catégories créées : `label`, `color`, `who` |
| `settings/{romain\|manon}` | réglages de chaque profil : `notify`, `hide`, `layout`, `startMode`, `theme` ; `settings/seen` pour les Nouveautés |
| `log` | historique des changements (Nouveautés, Historique) |
| `devices/{jeton}` | téléphones inscrits aux notifications : `who` |
| `notifs` | rappels déjà envoyés (anti-doublon), écrit par le programme d'envoi |
| `meta/sync` | réservé à la synchro reMarkable (version 2) |
