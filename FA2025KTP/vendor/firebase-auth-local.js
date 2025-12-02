// Minimal local shim for Firebase Auth used when the real vendor bundle
// isn't available locally. This provides getAuth, onAuthStateChanged and
// signInAnonymously so the background can operate in local/fallback mode.

const listeners = new Set();

function _notify(user) {
  // call listeners asynchronously
  setTimeout(() => {
    for (const cb of Array.from(listeners)) {
      try { cb(user); } catch (e) { console.error('auth-shim listener error', e); }
    }
  }, 0);
}

export function getAuth() {
  // return a sentinel object
  return { _isLocalAuthShim: true };
}

export function onAuthStateChanged(auth, callback) {
  listeners.add(callback);
  // immediately notify with current stored uid (if any)
  try {
    chrome.storage.local.get(['ktp_firebase_anonymous_uid'], (data) => {
      const uid = data && data.ktp_firebase_anonymous_uid;
      if (uid) callback({ uid });
      else callback(null);
    });
  } catch (e) {
    // chrome.storage may not be available in some contexts; fall back to null
    setTimeout(() => callback(null), 0);
  }

  // return an unsubscribe function
  return () => listeners.delete(callback);
}

export function signInAnonymously(auth) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(['ktp_firebase_anonymous_uid'], (data) => {
        let uid = data && data.ktp_firebase_anonymous_uid;
        if (!uid) {
          uid = 'anon_' + Math.floor(Math.random() * 1e12).toString(36);
          chrome.storage.local.set({ ktp_firebase_anonymous_uid: uid }, () => {
            _notify({ uid });
            resolve({ user: { uid } });
          });
        } else {
          _notify({ uid });
          resolve({ user: { uid } });
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

// export a no-op initializeAuth in case code expects it
export const initializeAuth = () => {};
