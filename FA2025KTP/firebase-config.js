// Firebase initialization and lightweight helpers for sending/listening to timestamps.
// This file is an ES module and expects to be imported with `type="module"` scripts
// (e.g. `import { sendTimestampEvent, listenForFriendTimestamps } from './firebase-config.js'`).

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  collection,
  collectionGroup,
  addDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Your Firebase config — you provided the apiKey earlier. I've filled likely values
// based on your project id. If any value is incorrect, replace it with the exact
// values from Firebase Console -> Project Settings -> Your apps.
export const firebaseConfig = {
  apiKey: "AIzaSyDANGxPRuIKzLnKYAdjjAXdiJCXFIyn-_w",
  authDomain: "ktp-extension-project.firebaseapp.com",
  projectId: "ktp-extension-project",
  storageBucket: "ktp-extension-project.firebasestorage.app",
  messagingSenderId: "939328835107",
  appId: "1:939328835107:web:6430459705eb0e98b32b96",
  measurementId: "G-YZBHSWWQMM"
};

// Initialize Firebase app and Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * sendTimestampEvent - store a timestamp event for a show
 *
 * @param {string} showId   - unique id for the show/title (e.g. netflix title id)
 * @param {string} userId   - id for the user leaving the timestamp (could be uid/email)
 * @param {number} timestamp - playback time in seconds
 * @param {string} [note]   - optional note text
 * @returns {Promise<DocumentReference>} resolves when written
 */
export async function sendTimestampEvent(showId, userId, timestamp, note = "") {
  if (!showId || !userId || typeof timestamp === "undefined") {
    throw new Error("sendTimestampEvent requires showId, userId and timestamp");
  }

  const colRef = collection(db, "shows", String(showId), "timestamps");
  const payload = {
    showId: String(showId),
    userId: String(userId),
    timestamp: Number(timestamp),
    note: String(note || ""),
    createdAt: serverTimestamp(),
  };

  return addDoc(colRef, payload);
}

/**
 * listenForFriendTimestamps - listen in real-time for timestamps created by friends
 *
 * Firestore has a limit of 10 items for `where(..., 'in', values)`. If `friendIds`
 * is longer than 10 this helper will create multiple queries and merge them.
 *
 * @param {string} showId
 * @param {Array<string>} friendIds - array of friend userIds to listen for
 * @param {(event: object) => void} onAdded - callback invoked for each new timestamp doc
 * @param {object} [opts] - optional { limit }
 * @returns {function} unsubscribe - call to stop listening
 */
export function listenForFriendTimestamps(showId, friendIds, onAdded, opts = {}) {
  if (!showId) throw new Error("listenForFriendTimestamps requires showId");
  if (!Array.isArray(friendIds)) friendIds = [];

  const limit = opts.limit || 50;
  const unsubscribers = [];

  // helper to attach a query for a chunk of friend ids
  const attachForChunk = (idsChunk) => {
    const colRef = collection(db, "shows", String(showId), "timestamps");
    let q;
    if (idsChunk.length === 0) {
      // if no friends specified, listen to all timestamps for the show
      q = query(colRef, orderBy("createdAt", "desc"));
    } else {
      q = query(colRef, where("userId", "in", idsChunk), orderBy("createdAt", "desc"));
    }

    const unsub = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          // Normalize createdAt to JS Date if available
          const createdAt = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : null;
          onAdded && onAdded({ id: change.doc.id, ...data, createdAt });
        }
      });
    });

    unsubscribers.push(unsub);
  };

  // Firestore `in` supports up to 10 values. If more than 10 friends, chunk them.
  if (friendIds.length <= 10) {
    attachForChunk(friendIds);
  } else {
    for (let i = 0; i < friendIds.length; i += 10) {
      attachForChunk(friendIds.slice(i, i + 10));
    }
  }

  // return combined unsubscribe
  return () => unsubscribers.forEach((u) => typeof u === "function" && u());
}

/**
 * listenForAllFriendTimestamps - listen across all shows for timestamps by friends
 * Uses a collectionGroup query on subcollection 'timestamps' so the background
 * service worker can receive events for any show.
 *
 * @param {Array<string>} friendIds
 * @param {(event: object) => void} onAdded
 * @param {object} [opts]
 * @returns {function} unsubscribe
 */
export function listenForAllFriendTimestamps(friendIds, onAdded, opts = {}) {
  if (!Array.isArray(friendIds)) friendIds = [];
  const limit = opts.limit || 50;
  const unsubscribers = [];

  const attachForChunk = (idsChunk) => {
    let q;
    if (idsChunk.length === 0) {
      q = query(collectionGroup(db, "timestamps"), orderBy("createdAt", "desc"));
    } else {
      q = query(collectionGroup(db, "timestamps"), where("userId", "in", idsChunk), orderBy("createdAt", "desc"));
    }

    const unsub = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          const createdAt = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : null;
          onAdded && onAdded({ id: change.doc.id, ...data, createdAt });
        }
      });
    }, (err) => {
      console.warn('collectionGroup snapshot error', err);
    });

    unsubscribers.push(unsub);
  };

  if (friendIds.length <= 10) {
    attachForChunk(friendIds);
  } else {
    for (let i = 0; i < friendIds.length; i += 10) {
      attachForChunk(friendIds.slice(i, i + 10));
    }
  }

  return () => unsubscribers.forEach((u) => typeof u === "function" && u());
}

// Also export db in case you want direct access
export { db };

// End of file — usage example:
// import { sendTimestampEvent, listenForFriendTimestamps } from './firebase-config.js'
// sendTimestampEvent('show123', 'user_abc', 123.45, 'cool scene')
// const stop = listenForFriendTimestamps('show123', ['friend1','friend2'], (e) => console.log('new timestamp', e))
// stop()
