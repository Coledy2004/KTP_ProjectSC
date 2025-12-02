// ============================================================================
// BACKGROUND.JS - Service Worker for Movie Journal Extension
// Simplified: local-only, no Firebase, no friends sharing
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

// Minimal message handler (keep for future if needed)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[background] Received message:', message);
  
  // Echo handler for testing
  if (message?.type === 'ping') {
    sendResponse({ msg: 'pong from background' });
    return false;
  }
  
  return false;
});

console.log('[background] Service worker initialized - movie journal mode (local-only)');
