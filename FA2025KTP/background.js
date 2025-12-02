// background service worker (Manifest V3)
import { listenForAllFriendTimestamps, sendTimestampEvent } from './firebase-config.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// Ensure service worker stays live when possible: log lifecycle events
self.addEventListener('install', (event) => {
  console.log('[background] Service worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[background] Service worker activated');
});

// simple time formatter for notifications
function formatTime(sec) {
  if (!isFinite(sec)) return '00:00';
  const s = Math.floor(sec % 60).toString().padStart(2,'0');
  const m = Math.floor(sec/60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

let unsubAll = null;

// Track current user UID
let currentFirebaseUid = null;

// Initialize Firebase Auth and sign in anonymously if needed
const auth = getAuth();
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentFirebaseUid = user.uid;
    console.log('[background] Firebase UID:', user.uid);
  } else {
    currentFirebaseUid = null;
    // Try to sign in anonymously
    signInAnonymously(auth)
      .then((result) => {
        if (result.user) {
          currentFirebaseUid = result.user.uid;
          console.log('[background] Signed in anonymously, UID:', result.user.uid);
        }
      })
      .catch((error) => {
        console.warn('[background] Anonymous sign-in failed:', error?.message);
      });
  }
});

async function startBackgroundListeners() {
  // Load friend list from storage. If missing, listen to all timestamps.
  const data = await chrome.storage.local.get(['friends']);
  const friendIds = data.friends || [];

  console.log('[background] Starting friend timestamp listener with friends:', friendIds);

  // Start a collectionGroup listener to receive timestamps across all shows from friends
  try {
    unsubAll = listenForAllFriendTimestamps(friendIds, (event) => {
      console.log('[background] New friend timestamp event', event);
      
      if (!event || !event.showId) {
        console.warn('[background] Invalid event structure:', event);
        return;
      }
      
      const title = `${event.userId} left a timestamp at ${formatTime(event.timestamp)}`;
      const message = event.note || 'Check it out!';
      
      // Create a notification
      chrome.notifications.create('', {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: title,
        message: message,
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
  if (message && message.type === 'ping') {
    sendResponse({msg: 'pong from background'});
  }
  // Handle UID request from popup
  if (message && message.action === 'getFirebaseUid') {
    sendResponse({uid: currentFirebaseUid || null});
    return true;
  }
  
  // Handle comment saves from popup via Firebase
  if (message && message.action === 'saveCommentToFirebase') {
    console.log('[background] Received saveCommentToFirebase message:', message);
    
    // Try to send to Firebase
    sendTimestampEvent(
      message.showId,
      message.userId,
      message.timestamp,
      message.note
    ).then(() => {
      console.log('[background] Comment successfully saved to Firebase');
      sendResponse({success: true});
    }).catch((e) => {
      console.warn('[background] Failed to save comment to Firebase:', e?.message);
      sendResponse({success: false, error: e?.message});
    });
    
    return true; // Indicate we'll call sendResponse asynchronously
  }
  
  return false;
});
