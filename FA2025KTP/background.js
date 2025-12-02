// background service worker (Manifest V3) - SDK-backed implementation
import { listenForAllFriendTimestamps, sendTimestampEvent } from './firebase-config.js';

// NOTE: We avoid statically importing the minified auth vendor bundle because
// it may reference remote CDN modules and cause SW registration to fail.
// Instead we attempt a dynamic import at runtime and fall back to a local
// extension-generated id if the Firebase auth module isn't available.

// Ensure service worker stays live when possible: log lifecycle events
self.addEventListener('install', (event) => {
  console.log('[background] Service worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[background] Service worker activated');
  event.waitUntil(clients.claim());
});

// simple time formatter for notifications
function formatTime(sec) {
  if (!isFinite(sec)) return '00:00';
  const s = Math.floor(sec % 60).toString().padStart(2,'0');
  const m = Math.floor(sec/60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

let unsubAll = null;
let currentFirebaseUid = null;

// Initialize Firebase Auth dynamically (if available). If the local vendor
// auth bundle is missing or references remote modules this dynamic import
// may fail; in that case we fall back to a local extension-generated id so
// the extension still operates locally.
(async function initAuth() {
  try {
    // Prefer the local shim which avoids remote CDN imports and still
    // provides the minimal auth surface the background expects.
    const authModule = await import('./vendor/firebase-auth-local.js');
    if (authModule && authModule.getAuth) {
      const auth = authModule.getAuth();
      authModule.onAuthStateChanged(auth, (user) => {
        if (user) {
          currentFirebaseUid = user.uid;
          console.log('[background] Firebase UID:', user.uid);
        } else {
          currentFirebaseUid = null;
          authModule.signInAnonymously(auth).then((result) => {
            if (result && result.user) {
              currentFirebaseUid = result.user.uid;
              console.log('[background] Signed in anonymously, UID:', result.user.uid);
            }
          }).catch((e) => {
            console.warn('[background] Anonymous sign-in failed:', e?.message);
          });
        }
      });
      return;
    }
  } catch (e) {
    console.warn('[background] Firebase Auth dynamic import failed:', e && e.message);
  }

  // Fallback: persist and use a local extension id
  try {
    const data = await chrome.storage.local.get(['ktp_userId']);
    let uid = data.ktp_userId;
    if (!uid) {
      uid = 'user_' + Math.floor(Math.random() * 1000000).toString(36);
      await chrome.storage.local.set({ ktp_userId: uid });
      console.log('[background] Generated new extension user id (fallback):', uid);
    }
    currentFirebaseUid = uid;
  } catch (err) {
    console.warn('[background] Failed to read/create fallback uid:', err && err.message);
  }
})();

async function startBackgroundListeners() {
  const data = await chrome.storage.local.get(['friends']);
  const friendIds = data.friends || [];
  console.log('[background] Starting friend timestamp listener with friends:', friendIds);

  try {
    unsubAll = listenForAllFriendTimestamps(friendIds, (event) => {
      console.log('[background] New friend timestamp event', event);
      if (!event || !event.showId) return;

      const title = `${event.userId} left a timestamp at ${formatTime(event.timestamp)}`;
      const message = event.note || 'Check it out!';

      chrome.notifications.create('', {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title,
        message,
      }, (id) => {
        if (chrome.runtime.lastError) {
          console.warn('[background] Notification error:', chrome.runtime.lastError.message);
        } else {
          console.log('[background] Notification created:', id);
        }
      });
    });

    console.log('[background] Friend timestamp listener started successfully');
  } catch (e) {
    console.warn('[background] Failed to start friend timestamps listener', e && e.message);
  }
}

startBackgroundListeners();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[background] Received message:', message);

  if (message?.type === 'ping') {
    sendResponse({ msg: 'pong from background' });
    return false;
  }

  if (message?.action === 'getFirebaseUid') {
    // return firebase uid if available, else persistent extension id
    (async () => {
      try {
        if (currentFirebaseUid) {
          sendResponse({ uid: currentFirebaseUid });
          return;
        }
        const data = await chrome.storage.local.get(['ktp_userId']);
        let uid = data.ktp_userId;
        if (!uid) {
          uid = 'user_' + Math.floor(Math.random() * 1000000).toString(36);
          await chrome.storage.local.set({ ktp_userId: uid });
          console.log('[background] Generated new extension user id:', uid);
        }
        sendResponse({ uid });
      } catch (e) {
        console.warn('[background] getFirebaseUid handler error:', e && e.message);
        sendResponse({ uid: null, error: e?.message });
      }
    })();
    return true; // we'll respond asynchronously
  }

  if (message?.action === 'updateFriends') {
    console.log('[background] Friends list updated, restarting listener');
    if (typeof unsubAll === 'function') unsubAll();
    startBackgroundListeners();
    sendResponse({ success: true });
    return false;
  }

  if (message?.action === 'saveCommentToFirebase') {
    console.log('[background] Received saveCommentToFirebase message:', message);
    (async () => {
      try {
        await sendTimestampEvent(message.showId, message.userId, message.timestamp, message.note);
        console.log('[background] Comment successfully saved to Firebase');
        sendResponse({ success: true });
      } catch (e) {
        console.warn('[background] Failed to save comment to Firebase:', e?.message);
        sendResponse({ success: false, error: e?.message });
      }
    })();
    return true; // async
  }

  return false;
});

console.log('[background] Background service worker initialized');