// ============================================================================
// BACKGROUND.JS - Service Worker for Movie Journal Extension
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
let currentFirebaseUid = null;
let firebaseInitPromise = null;

// Try to load auth (real or local shim) and get/create a UID
async function initAuth() {
  try {
    console.log('[background] Attempting to initialize Auth...');
    
    let authModule = null;
    
    // Try real Firebase Auth vendor first
    try {
      authModule = await import('./vendor/firebase-auth.js');
      console.log('[background] Using Firebase Auth vendor');
    } catch (e) {
      console.log('[background] Firebase Auth vendor not found, trying local shim...');
      // Fall back to local auth shim
      try {
        authModule = await import('./vendor/firebase-auth-local.js');
        console.log('[background] Using local auth shim');
      } catch (e2) {
        console.warn('[background] No auth module available:', e2?.message);
      }
    }

    if (authModule && typeof authModule.getAuth === 'function' && typeof authModule.signInAnonymously === 'function') {
      try {
        const auth = authModule.getAuth();
        console.log('[background] Got auth instance');
        
        // Attempt anonymous sign-in first
        try {
          const result = await authModule.signInAnonymously(auth);
          if (result && result.user && result.user.uid) {
            currentFirebaseUid = result.user.uid;
            console.log('[background] Auth: anonymous sign-in successful, UID:', result.user.uid);
          } else {
            console.warn('[background] Auth: sign-in result missing user.uid');
          }
        } catch (signInErr) {
          console.warn('[background] Auth: anonymous sign-in failed:', signInErr?.message);
        }
        
        // Also set up listener for future changes
        if (typeof authModule.onAuthStateChanged === 'function') {
          authModule.onAuthStateChanged(auth, (user) => {
            if (user && user.uid) {
              currentFirebaseUid = user.uid;
              console.log('[background] Auth listener: user changed to', user.uid);
            } else {
              console.log('[background] Auth listener: user signed out');
            }
          });
        }
      } catch (e) {
        console.warn('[background] Auth setup failed:', e?.message);
      }
    } else {
      console.warn('[background] Auth module missing required functions (getAuth or signInAnonymously)');
    }

    console.log('[background] Auth initialization complete, current UID:', currentFirebaseUid || 'none yet');
  } catch (e) {
    console.warn('[background] Auth init error:', e?.message);
  }
}

// Initialize auth on startup and store the promise so we can wait for it
firebaseInitPromise = initAuth();

// Small delay to ensure logging is complete before service worker goes idle
setTimeout(() => {
  console.log('[background] startup complete, uid status:', currentFirebaseUid ? 'set to ' + currentFirebaseUid : 'pending');
}, 500);

// ---- Message Handler ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[background] Received message:', message?.action || message?.type);
  
  // Echo handler for testing
  if (message?.type === 'ping') {
    sendResponse({ msg: 'pong from background' });
    return false;
  }
  
  // Handle UID request from popup
  if (message?.action === 'getFirebaseUid') {
    console.log('[background] UID request, current UID:', currentFirebaseUid || 'not available');
    // Wait for initialization to complete before responding
    firebaseInitPromise.then(() => {
      console.log('[background] after init, UID:', currentFirebaseUid || 'still not available');
      sendResponse({ uid: currentFirebaseUid || null });
    });
    return true; // indicate we'll respond asynchronously
  }
  
  return false;
});

console.log('[background] Service worker initialized - Firebase mode (with friends support)');
