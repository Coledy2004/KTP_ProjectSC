// background service worker (Manifest V3)
self.addEventListener('install', (event) => {
  console.log('Service worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service worker activated');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'ping') {
    sendResponse({msg: 'pong from background'});
  }
  // Return true if you'll call sendResponse asynchronously.
  return false;
});
