// ============================================================================
// BACKGROUND.JS - Service Worker for FlixLog Extension
// Handles Firebase auth and friend timestamp listeners
// ============================================================================

// Lifecycle events
self.addEventListener('install', (event) => {
  console.log('[background] Service worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[background] Service worker activated');
  event.waitUntil(clients.claim());
});

// ---- Firebase Setup (Guarded) ----
// Firebase has been removed from this build. Background remains minimal.
setTimeout(() => {
  console.log('[background] startup complete - firebase disabled in this build');
}, 200);

// ---- Message Handler ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[background] Received message:', message?.action || message?.type);
  
  // Echo handler for testing
  if (message?.type === 'ping') {
    sendResponse({ msg: 'pong from background' });
    return false;
  }
  
  // No firebase-related messages handled
  
  return false;
});

console.log('[background] Service worker initialized - Firebase mode (with friends support)');
