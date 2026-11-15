/* ===========================================================
   Teknokent Koleji - Haftanın Öğretmeni
   Öğretmen listesi, oylar ve şampiyon bilgisi Firebase Firestore'da
   (herkese ortak, canlı) tutulur. Sadece "bu cihaz bu hafta oy verdi mi"
   bilgisi tarayıcıda (localStorage) tutulur.
   =========================================================== */

const DEFAULT_AVATAR = "assets/default-avatar.svg";
const DEFAULT_ADMIN_PASSWORD = "teknokent2026";

/* ---------- Firebase başlat ---------- */
firebase.initializeApp(window.firebaseConfig);
const db = firebase.firestore();

/* ---------- Yardımcılar ---------- */
function uid() {
  return "t_" + Math.random().toString(36).slice(2, 10);
}

/* ISO hafta anahtarı: "2026-W46" */
function getWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Pazartesi=0
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const weekNum =
    1 +
    Math.round(
      ((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
    );
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function getDayInfo() {
  const now = new Date();
  const dow = now.getDay(); // 0 Pazar ... 6 Cumartesi
  const weekKey = getWeekKey(now);
  let phase; // "open" (Pzt-Cuma), "closed" (Cmt), "reveal" (Pazar)
  if (dow >= 1 && dow <= 5) phase = "open";
  else if (dow === 6) phase = "closed";
  else phase = "reveal";
  return { now, dow, weekKey, phase };
}

/* ---------- Öğretmenler (Firestore: teachers) ---------- */
async function getTeachers() {
  const snap = await db.collection("teachers").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function addTeacher({ name, branch, photo }) {
  await db.collection("teachers").doc(uid()).set({ name, branch: branch || "", photo: photo || "" });
}
async function updateTeacher(id, data) {
  await db.collection("teachers").doc(id).update(data);
}
async function deleteTeacher(id) {
  await db.collection("teachers").doc(id).delete();
}

/* ---------- Oylar (Firestore: votes_<weekKey>) ---------- */
async function getVotes(weekKey) {
  const snap = await db.collection("votes_" + weekKey).get();
  const votes = {};
  snap.docs.forEach((d) => (votes[d.id] = d.data().count || 0));
  return votes;
}
function getMyVote(weekKey) {
  return localStorage.getItem("tko_myvote_" + weekKey) || null;
}
async function setMyVote(weekKey, teacherId) {
  const prev = getMyVote(weekKey);
  const batch = db.batch();
  if (prev && prev !== teacherId) {
    const prevRef = db.collection("votes_" + weekKey).doc(prev);
    batch.set(prevRef, { count: firebase.firestore.FieldValue.increment(-1) }, { merge: true });
  }
  if (prev !== teacherId) {
    const newRef = db.collection("votes_" + weekKey).doc(teacherId);
    batch.set(newRef, { count: firebase.firestore.FieldValue.increment(1) }, { merge: true });
    await batch.commit();
    localStorage.setItem("tko_myvote_" + weekKey, teacherId);
  }
}

/* ---------- Şampiyon (Firestore: meta/champion) ---------- */
async function getChampion() {
  const doc = await db.collection("meta").doc("champion").get();
  return doc.exists ? doc.data() : null;
}
async function computeAndMaybeSetChampion(weekKey) {
  const champion = await getChampion();
  if (champion && champion.weekKey === weekKey) return champion;
  const votes = await getVotes(weekKey);
  let bestId = null, bestCount = -1;
  Object.entries(votes).forEach(([id, count]) => {
    if (count > bestCount) { bestCount = count; bestId = id; }
  });
  if (!bestId || bestCount <= 0) return champion;
  const newChampion = { weekKey, teacherId: bestId, votes: bestCount };
  await db.collection("meta").doc("champion").set(newChampion);
  return newChampion;
}

/* ---------- Admin şifresi (Firestore: meta/settings) ---------- */
async function getAdminPassword() {
  const doc = await db.collection("meta").doc("settings").get();
  return doc.exists && doc.data().password ? doc.data().password : DEFAULT_ADMIN_PASSWORD;
}
async function setAdminPassword(pass) {
  await db.collection("meta").doc("settings").set({ password: pass }, { merge: true });
}
