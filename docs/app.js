// Calendrier Manon & Romain — démarrage de l'appli : connexion, base Firebase, notifications.
// L'interface et la logique du calendrier sont dans calendar.js (chargé après la connexion).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, sendPasswordResetEmail, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs, query, where, limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const APP_VERSION = "20 octobre 2026 (5)"; // affichée dans Paramètres, tout en bas
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} },
};
function show(id) { for (const x of ["setup", "boot", "login", "app"]) $("#" + x).hidden = x !== id; }
function toast(msg) {
  if (window.APP_API) return window.APP_API.toast(msg);
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2200);
}

/* ---------- configuration ---------- */
const CFG = self.APP_CONFIG;
if (!CFG || String(CFG.firebase?.apiKey).startsWith("A_REMPLIR")) {
  show("setup");
  throw new Error("config.js non rempli");
}
const app = initializeApp(CFG.firebase);
const auth = getAuth(app);
const fs = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

let swReg = null;
const swReady = "serviceWorker" in navigator
  ? navigator.serviceWorker.register("./firebase-messaging-sw.js").then((r) => (swReg = r)).catch(() => null)
  : Promise.resolve(null);
const updateOnline = () => { $("#offline").hidden = navigator.onLine; };
addEventListener("online", updateOnline); addEventListener("offline", updateOnline); updateOnline();

/* ---------- base de données : même interface que le prototype ---------- */
const wrapDocs = (qs) => ({ docs: qs.docs.map((d) => ({ id: d.id, data: () => d.data() })) });
const DB = {
  collection(col) {
    return {
      doc(id) {
        const r = doc(fs, col, id);
        return { set: (d) => setDoc(r, d), update: (d) => updateDoc(r, d), delete: () => deleteDoc(r) };
      },
      onSnapshot(next, error) { return onSnapshot(collection(fs, col), (qs) => next(wrapDocs(qs)), error); },
      where(f, op, v) {
        const cons = [where(f, op, v)];
        const q = {
          limit(n) { cons.push(limit(n)); return q; },
          async get() { return wrapDocs(await getDocs(query(collection(fs, col), ...cons))); },
        };
        return q;
      },
    };
  },
  doc(path) {
    const r = doc(fs, path);
    return { onSnapshot(next, error) { return onSnapshot(r, (s) => next({ exists: s.exists(), data: () => s.data() }), error); } };
  },
};
window.claude = { use: async (name) => (name === "db" ? DB : null) };

/* ---------- notifications (Firebase Cloud Messaging) ---------- */
// Chaque téléphone enregistre son jeton dans devices/{jeton} avec le profil choisi (who).
let messaging = null;
const pushSupported = isSupported().catch(() => false);
const myToken = () => store.get("cc-push-token");
function pushStateText() {
  if (!("Notification" in window)) return "Ce navigateur ne peut pas recevoir de notifications.";
  if (Notification.permission === "denied") return "Notifications bloquées pour cette appli : autorisez-les dans les réglages Android (Applis › Chrome ou Calendrier › Notifications).";
  if (myToken()) return "Ce téléphone est inscrit aux notifications.";
  return "Ce téléphone n'est pas encore inscrit aux notifications.";
}
async function enablePush() {
  if (!(await pushSupported)) { toast("Notifications impossibles sur ce navigateur."); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") { toast("Notifications refusées : autorisez-les dans les réglages du téléphone."); return false; }
  messaging = messaging || getMessaging(app);
  const reg = swReg || (await swReady);
  const token = await getToken(messaging, { vapidKey: CFG.vapidKey, serviceWorkerRegistration: reg || undefined });
  if (!token) return false;
  const old = myToken();
  if (old && old !== token) await deleteDoc(doc(fs, "devices", old)).catch(() => {});
  await setDoc(doc(fs, "devices", token), { who: window.APP_API?.me() || store.get("cc-me") || "", uid: auth.currentUser?.uid || "", updatedAt: new Date().toISOString() });
  store.set("cc-push-token", token);
  return true;
}
async function disablePush() {
  const t = myToken(); if (!t) return;
  await deleteDoc(doc(fs, "devices", t)).catch(() => {});
  try { if (messaging) await deleteToken(messaging); } catch {}
  store.set("cc-push-token", null);
}
const refreshSettings = () => window.APP_API?.renderSettings();

window.APP_HOOKS = {
  pushState: pushStateText,
  // Choix « Mes rappels » : inscrit ou désinscrit ce téléphone
  async notifMode(v) {
    try {
      if (v === "both" || v === "phone") { if (await enablePush()) toast("Ce téléphone recevra les notifications"); }
      else await disablePush();
    } catch (e) { toast("Notifications : " + (e?.code || e?.message || "erreur")); }
    refreshSettings();
  },
  // Changement de profil sur ce téléphone : les notifications suivent le profil
  async profile(k) {
    const t = myToken(); if (!t) return;
    const notify = !!window.APP_API?.settings()?.[k]?.notify;
    if (notify) await setDoc(doc(fs, "devices", t), { who: k, uid: auth.currentUser?.uid || "", updatedAt: new Date().toISOString() }).catch(() => {});
    else await disablePush();
    refreshSettings();
  },
  account() {
    const u = auth.currentUser;
    return `<div class="account"><span class="m">Connecté : ${esc(u?.email || "")}<br>Version de l'appli : ${APP_VERSION}</span><button type="button" class="btn ghost" id="logoutBtn">Se déconnecter</button></div>`;
  },
};
document.addEventListener("click", async (e) => {
  if (!e.target.closest("#logoutBtn")) return;
  await disablePush().catch(() => {});
  await signOut(auth);
  location.reload();
});

// Notification reçue appli ouverte : on l'affiche quand même
pushSupported.then((ok) => {
  if (!ok) return;
  messaging = messaging || getMessaging(app);
  onMessage(messaging, (p) => {
    const d = p.data || {};
    if (swReg && Notification.permission === "granted") swReg.showNotification(d.title || "Rappel", { body: d.body || "", icon: "./icon-192.png", tag: d.tag || undefined });
    else toast((d.title || "Rappel") + " · " + (d.body || ""));
  });
});

// Jeton renouvelé en silence à chaque ouverture (les jetons expirent au bout de quelques semaines)
async function refreshPushToken() {
  const me = store.get("cc-me");
  if (!myToken() || !me || !("Notification" in window) || Notification.permission !== "granted") return;
  try { await enablePush(); } catch {}
}

/* ---------- connexion ---------- */
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#loginEmail").value.trim(), pass = $("#loginPass").value, msg = $("#loginMsg");
  if (!email || !pass) { msg.textContent = "Indiquez votre adresse e-mail et votre mot de passe."; return; }
  $("#loginBtn").disabled = true; msg.textContent = "";
  try { await signInWithEmailAndPassword(auth, email, pass); }
  catch (err) {
    msg.textContent = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"].includes(err.code)
      ? "Adresse e-mail ou mot de passe incorrect."
      : err.code === "auth/unauthorized-domain" ? "Cette adresse web n'est pas autorisée dans Firebase (étape 6f du guide)."
      : err.code === "auth/network-request-failed" ? "Pas de connexion internet."
      : "Connexion impossible (" + err.code + ").";
  } finally { $("#loginBtn").disabled = false; }
});
$("#forgotBtn").addEventListener("click", async () => {
  const email = $("#loginEmail").value.trim(), msg = $("#loginMsg");
  if (!email) { msg.textContent = "Saisissez d'abord votre adresse e-mail ci-dessus."; return; }
  try { await sendPasswordResetEmail(auth, email); msg.textContent = "E-mail envoyé : suivez le lien pour choisir un nouveau mot de passe."; }
  catch (err) { msg.textContent = "Envoi impossible (" + err.code + ")."; }
});

let started = false;
onAuthStateChanged(auth, async (user) => {
  if (!user) { show("login"); return; }
  if (started) return;
  // Vérifie que ce compte a bien accès aux données (règles de sécurité)
  try { await getDocs(query(collection(fs, "settings"), limit(1))); }
  catch (err) {
    if (err.code === "permission-denied") {
      show("login");
      $("#loginMsg").textContent = "Ce compte n'a pas accès au calendrier : son adresse doit figurer dans les règles de sécurité (étape 4 du guide).";
      await signOut(auth); return;
    }
    // hors connexion : on continue avec le cache local
  }
  started = true;
  show("app");
  const s = document.createElement("script");
  s.src = "./calendar.js";
  s.onload = () => { refreshPushToken(); };
  document.body.append(s);
});
