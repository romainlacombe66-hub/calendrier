# Mettre en ligne le Calendrier Manon & Romain

Ce guide se suit dans l'ordre, depuis un ordinateur, dans un navigateur. Il n'y a **aucune commande à taper**.
Comptez environ 45 minutes la première fois. Tout est gratuit.

> Cette version 1 se remplit à la main. La synchronisation avec les carnets reMarkable arrivera en version 2 (elle apparaît déjà dans Paramètres, désactivée).

À la fin, vous aurez :
- une appli installée sur vos deux téléphones Android, synchronisée en temps réel ;
- des notifications de rappel sur chaque téléphone, que chacun règle dans Paramètres ;
- des données accessibles **uniquement** avec vos deux adresses e-mail.

Vous utiliserez deux services :
- **Firebase** (Google) : la base de données, les comptes et l'envoi des notifications ;
- **GitHub** : l'hébergement de l'appli et le petit programme qui envoie les rappels toutes les 15 minutes.

Gardez ce dossier décompressé à portée de main : vous allez copier certains fichiers.

---

## Étape 1 — Créer le projet Firebase

1. Allez sur **https://console.firebase.google.com** et connectez-vous avec un compte Google (celui de Romain par exemple).
2. Cliquez sur **Créer un projet** (ou « Ajouter un projet »).
3. Nom du projet : `calendrier-manon-romain` (ou ce que vous voulez). Acceptez les conditions.
4. Google Analytics : **désactivez-le**, il ne sert à rien ici. Cliquez sur **Créer le projet**.

Vous restez sur l'offre gratuite **Spark**. Ne passez pas à l'offre « Blaze » : ce n'est pas nécessaire.

## Étape 2 — Base de données et comptes

### 2a. La base de données (Firestore)
1. Dans le menu de gauche : **Créer** (Build) → **Firestore Database** → **Créer une base de données**.
2. Emplacement : choisissez **europe-west9 (Paris)**. Ce choix est définitif ; vos données restent en France.
3. Choisissez **Démarrer en mode production**, puis **Créer**.

### 2b. Les comptes de connexion
1. Menu de gauche : **Authentication** → **Commencer**.
2. Onglet **Mode de connexion** → **Adresse e-mail/Mot de passe** → activez le premier interrupteur → **Enregistrer**.
3. Onglet **Utilisateurs** → **Ajouter un utilisateur** : saisissez l'adresse e-mail et un mot de passe pour **Romain**. Recommencez pour **Manon**.
   *(Chacun pourra changer son mot de passe depuis l'appli avec « Mot de passe oublié ? ».)*

## Étape 3 — Relier l'appli à Firebase (`config.js`)

1. Cliquez sur la roue dentée en haut à gauche → **Paramètres du projet**.
2. Onglet **Général**, en bas, section **Vos applications** : cliquez sur l'icône **`</>`** (Web).
3. Nom : `Calendrier`. **Ne cochez pas** « Firebase Hosting ». Cliquez sur **Enregistrer l'application**.
4. Firebase affiche un bloc de code contenant `const firebaseConfig = { apiKey: "...", authDomain: "...", ... }`.
   Ouvrez le fichier **`docs/config.js`** du dossier avec le Bloc-notes et remplacez chaque `A_REMPLIR` par la valeur correspondante (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId). Gardez les guillemets.
5. Toujours dans **Paramètres du projet**, onglet **Cloud Messaging** :
   - si l'« API Firebase Cloud Messaging (V1) » est indiquée comme désactivée, cliquez sur les ⋮ à côté et activez-la ;
   - descendez à **Configuration Web** → **Certificats Web Push** → **Générer une paire de clés**.
   - Copiez la longue clé affichée et collez-la à la place de `A_REMPLIR` sur la ligne `vapidKey` de `docs/config.js`.
6. Enregistrez `config.js`.

> Ces informations ne sont pas secrètes : c'est l'étape suivante qui protège vos données.

## Étape 4 — Protéger les données (règles de sécurité)

1. Ouvrez le fichier **`firestore.rules`** du dossier avec le Bloc-notes.
2. Remplacez `ADRESSE_ROMAIN@exemple.fr` et `ADRESSE_MANON@exemple.fr` par vos deux vraies adresses (exactement celles de l'étape 2b, en minuscules).
3. Dans Firebase : **Firestore Database** → onglet **Règles**. Effacez tout le texte, collez le contenu de votre fichier, puis cliquez sur **Publier**.

Désormais, seules ces deux adresses peuvent lire ou modifier le calendrier.

## Étape 5 — La clé du programme d'envoi des rappels

1. **Paramètres du projet** → onglet **Comptes de service**.
2. Cliquez sur **Générer une nouvelle clé privée** → **Générer la clé**. Un fichier `.json` se télécharge.

> ⚠️ Ce fichier-là **est secret** : il donne un accès complet à votre base. Ne l'envoyez à personne, ne le mettez jamais dans un fichier du dépôt GitHub. Vous allez le coller dans un coffre-fort GitHub à l'étape 6, puis vous pourrez le supprimer de votre ordinateur.

## Étape 6 — Mettre l'appli en ligne sur GitHub

### 6a. Créer le dépôt
1. Créez un compte gratuit sur **https://github.com** (si vous n'en avez pas). Retenez votre nom d'utilisateur, par exemple `romainl`.
2. En haut à droite **+** → **New repository**.
   - Repository name : `calendrier`
   - Cochez **Public** (obligatoire pour l'hébergement gratuit ; le code est visible, mais **aucune donnée personnelle** n'y est : elles sont dans Firebase, protégées).
   - Cliquez sur **Create repository**.

### 6b. Envoyer les fichiers
1. Sur la page du dépôt vide, cliquez sur le lien **uploading an existing file**.
2. Faites glisser dans la fenêtre : le dossier **`docs`** (avec votre `config.js` rempli), le dossier **`scripts`**, et les fichiers **`package.json`**, **`package-lock.json`**, **`firestore.rules`**, **`README.md`**, **`GUIDE.md`**.
   *(Le dossier `docs` contient : `index.html`, `app.js`, `calendar.js`, `style.css`, `config.js`, `firebase-messaging-sw.js`, `manifest.webmanifest` et trois icônes.)*
3. En bas, cliquez sur **Commit changes**.

### 6c. Ajouter le programme des rappels
Le dossier `.github` est caché sur la plupart des ordinateurs, on le crée donc à la main :
1. Dans le dépôt : **Add file** → **Create new file**.
2. Nom du fichier, tapez exactement : `.github/workflows/rappels.yml`
3. Ouvrez le fichier `.github/workflows/rappels.yml` du dossier (avec le Bloc-notes ; si vous ne le voyez pas, il est aussi recopié tout en bas de ce guide), copiez tout son contenu et collez-le.
4. **Commit changes**.

### 6d. Ranger la clé secrète
1. Dans le dépôt : **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Name : `FIREBASE_SERVICE_ACCOUNT`
3. Secret : ouvrez le fichier `.json` de l'étape 5 avec le Bloc-notes, copiez **tout** le contenu et collez-le.
4. **Add secret**. Vous pouvez maintenant supprimer le fichier `.json` de votre ordinateur.

### 6e. Activer la page web
1. **Settings** → **Pages**.
2. Source : **Deploy from a branch**. Branch : **main**, dossier **/docs** → **Save**.
3. GitHub prépare alors le site. Après une à deux minutes, **rechargez la page** (touche F5) : un encadré « Your site is live at… » apparaît en haut, avec l'adresse de l'appli : `https://VOTRE-NOM.github.io/calendrier/` (VOTRE-NOM = votre nom d'utilisateur GitHub, en minuscules).
   Si rien n'apparaît : onglet **Actions** du dépôt → la ligne « pages build and deployment » doit avoir une coche verte (un rond jaune = en cours, patientez). Vous pouvez aussi simplement taper l'adresse dans le navigateur.

### 6f. Autoriser cette adresse dans Firebase
1. Firebase → **Authentication** → onglet **Paramètres** → **Domaines autorisés** → **Ajouter un domaine**.
2. Saisissez `VOTRE-NOM.github.io` (sans `https://` ni `/calendrier`) → **Ajouter**.

## Étape 7 — Installer l'appli sur vos deux téléphones

Sur chaque téléphone Android :
1. Ouvrez **Chrome** à l'adresse `https://VOTRE-NOM.github.io/calendrier/`.
2. Connectez-vous avec votre e-mail et votre mot de passe.
3. À la question « Qui utilise ce téléphone ? », touchez **Romain** ou **Manon**.
4. Menu **⋮** de Chrome → **Ajouter à l'écran d'accueil** (ou **Installer l'application**) → **Installer**.
5. Ouvrez l'appli depuis l'écran d'accueil, puis **Paramètres** (en bas à droite) :
   - **Mes rappels** → choisissez **Sur mon téléphone et dans l'appli** (ou **Seulement sur mon téléphone**), puis touchez **Autoriser** quand le téléphone demande l'accord pour les notifications. La ligne sous le choix doit indiquer « Ce téléphone est inscrit aux notifications ».
   - **Planning affiché à l'ouverture** et **Thème** : à votre goût.

L'appli fonctionne même sans réseau : les modifications partent dès le retour de la connexion.

## Étape 8 — Tester les notifications

1. Dans l'appli, touchez **+ Activité** → **Événement**. Titre « Test », date d'aujourd'hui, heure dans 2 heures, catégorie **Commun**.
2. Rappel : cochez **Me le rappeler**, gardez **À une date et une heure**, date d'aujourd'hui, et une heure **déjà passée de quelques minutes**. Enregistrez.
3. Sur GitHub, ouvrez l'onglet **Actions** → **Rappels** → **Run workflow** → **Run workflow**.
4. Une à deux minutes plus tard, la notification arrive sur chaque téléphone inscrit. Supprimez ensuite l'événement « Test ».

Ensuite, tout se fait tout seul : le programme tourne toutes les 15 minutes. Par défaut, rien n'est envoyé entre 22 h et 7 h (les rappels de la nuit arrivent à 7 h) : chacun peut changer ce créneau ou le couper dans Paramètres, sous « Mes rappels ». Chaque rappel n'est envoyé qu'une fois.
*GitHub peut décaler un passage de quelques minutes aux heures chargées : c'est normal.*

---

## Au quotidien

- **Couper ses notifications** : Paramètres → **Mes rappels** → « Seulement dans l'appli » ou « Désactivés ». Chacun gère les siennes.
- **Voir le planning de l'autre** : boutons « Mon planning / Planning de … / Tout » en haut du calendrier.
- **Mettre à jour l'appli** : sur GitHub, **Add file → Upload files**, glissez les nouveaux fichiers fournis, puis **Commit changes**. **Ne remplacez jamais `docs/config.js`** : c'est le vôtre, rempli à l'étape 3. Les téléphones reçoivent la nouvelle version à la prochaine ouverture de l'appli (fermez-la et rouvrez-la si besoin).
- **Se déconnecter / changer de compte** : Paramètres → tout en bas, **Se déconnecter**.
- **Une fois tous les deux mois** : GitHub met en pause les tâches automatiques d'un dépôt public sans aucune modification depuis 60 jours, et vous prévient par e-mail avant. Il suffit alors d'aller dans **Actions → Rappels → Enable workflow**.

## En cas de souci

| Ce que vous voyez | Que faire |
|---|---|
| « Presque prêt » au lancement | `docs/config.js` n'est pas rempli ou n'a pas été envoyé sur GitHub (étapes 3 et 6b). |
| « Ce compte n'a pas accès… » | L'adresse n'est pas exactement celle des règles (étape 4). |
| Connexion impossible (`auth/unauthorized-domain`) | Ajoutez votre adresse github.io aux domaines autorisés (étape 6f). |
| Pas de notification | Paramètres → **Mes rappels** doit inclure le téléphone, et la ligne dessous doit dire « Ce téléphone est inscrit ». Vérifiez aussi l'autorisation des notifications pour Chrome / l'appli dans les réglages Android, et l'onglet **Actions** de GitHub (un rond rouge = erreur, cliquez dessus pour lire le message). |
| « Notifications bloquées pour cette appli » | Réglages Android → Applis → Chrome (ou Calendrier) → Notifications → autoriser, puis rechoisissez « Sur mon téléphone et dans l'appli ». |
| Un passage « Rappels » en rouge, message « Secret FIREBASE_SERVICE_ACCOUNT manquant » | Refaites l'étape 6d. |

---

## Annexe — contenu de `.github/workflows/rappels.yml`

```yaml
name: Rappels

on:
  schedule:
    # Toutes les 15 minutes. Chacun choisit dans l'appli son créneau sans notification (par défaut de 22 h à 7 h).
    - cron: "*/15 * * * *"
  workflow_dispatch: {} # bouton « Run workflow » pour lancer un envoi à la main

concurrency:
  group: rappels
  cancel-in-progress: false

jobs:
  envoyer:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci --omit=dev || npm install --omit=dev
      - name: Envoyer les rappels dus
        run: node scripts/send-reminders.mjs
        env:
          TZ: Europe/Paris
          FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
```
