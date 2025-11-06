// background service worker (Manifest V3)
import { listenForAllFriendTimestamps } from './firebase-config.js';

// Ensure service worker stays live when possible: log lifecycle events
self.addEventListener('install', (event) => {
  console.log('Service worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service worker activated');
});

// simple time formatter for notifications
function formatTime(sec) {
  if (!isFinite(sec)) return '00:00';
  const s = Math.floor(sec % 60).toString().padStart(2,'0');
  const m = Math.floor(sec/60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

let unsubAll = null;

async function startBackgroundListeners() {
  // load friend list from storage (expect array of userIds). If missing, listen to all.
  const data = await chrome.storage.local.get(['friends']);
  const friendIds = data.friends || [];

  // Start a collectionGroup listener to receive timestamps across all shows
  try {
    unsubAll = listenForAllFriendTimestamps(friendIds, (event) => {
      console.log('New friend timestamp event', event);
      const title = `${event.userId} left a timestamp`;
      const message = (event.timestamp !== undefined && event.timestamp !== null) ? `At ${formatTime(event.timestamp)} — ${event.note||''}` : (event.note||'');
      // create a notification
      chrome.notifications.create('', {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title,
        message: message || 'Tapped timestamp',
      }, (id) => {
        // optional callback
      });
    });
  } catch (e) {
    console.warn('Failed to start friend timestamps listener', e && e.message);
  }
}

startBackgroundListeners();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'ping') {
    sendResponse({msg: 'pong from background'});
  }
  // Return true if you'll call sendResponse asynchronously.
  return false;
});
