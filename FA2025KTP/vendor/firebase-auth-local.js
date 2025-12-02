/**
 * DEPRECATED: Firebase auth shim removed.
 * This file is kept for reference but Firebase has been removed from the extension.
 */

function _notify(user) {
  // call listeners asynchronously
  setTimeout(() => {
    for (const cb of Array.from(listeners)) {
      try { cb(user); } catch (e) { console.error('[auth-shim] listener error', e); }
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
      console.log('[auth-shim] onAuthStateChanged initial check, uid:', uid || 'none');
      if (uid) callback({ uid });
      else callback(null);
    });
  } catch (e) {
    // chrome.storage may not be available in some contexts; fall back to null
    console.warn('[auth-shim] storage error in onAuthStateChanged:', e?.message);
    setTimeout(() => callback(null), 0);
  }

  // return an unsubscribe function
  return () => listeners.delete(callback);
}

export function signInAnonymously(auth) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(['ktp_firebase_anonymous_uid'], (data) => {
        if (chrome.runtime.lastError) {
          console.warn('[auth-shim] storage error:', chrome.runtime.lastError.message);
          reject(chrome.runtime.lastError);
          return;
        }
        
        let uid = data && data.ktp_firebase_anonymous_uid;
        if (!uid) {
          uid = 'anon_' + Math.floor(Math.random() * 1e12).toString(36);
          console.log('[auth-shim] generating new uid:', uid);
          chrome.storage.local.set({ ktp_firebase_anonymous_uid: uid }, () => {
            if (chrome.runtime.lastError) {
              console.warn('[auth-shim] storage set error:', chrome.runtime.lastError.message);
              reject(chrome.runtime.lastError);
              return;
            }
            console.log('[auth-shim] stored new uid');
            _notify({ uid });
            resolve({ user: { uid } });
          });
        } else {
          console.log('[auth-shim] using existing uid:', uid);
          _notify({ uid });
          resolve({ user: { uid } });
        }
      });
    } catch (e) {
      console.error('[auth-shim] signInAnonymously error:', e?.message);
      reject(e);
    }
  });
}

export const initializeAuth = () => {};
