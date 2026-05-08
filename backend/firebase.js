const admin = require('firebase-admin');

let firestore = null;

function normalizePrivateKey(value) {
  return value ? value.replace(/\\n/g, '\n') : '';
}

function initFirebase() {
  if (firestore || process.env.FIRESTORE_CACHE_ENABLED !== 'true') return firestore;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) return null;

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey })
    });
  }

  firestore = admin.firestore();
  return firestore;
}

async function getCache(key) {
  const db = initFirebase();
  if (!db) return null;
  const doc = await db.collection('graduation_cache').doc(key).get();
  return doc.exists ? doc.data() : null;
}

async function setCache(key, data) {
  const db = initFirebase();
  if (!db) return null;
  await db.collection('graduation_cache').doc(key).set({
    ...data,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return data;
}

module.exports = { initFirebase, getCache, setCache };
