/*
 * Firebase auth shim removed; archived copy is at
 * `../../archived_firebase/firebase-auth-local.js`.
 *
 * This lightweight stub exists to avoid runtime import errors
 * if other legacy code attempts to dynamically import the module.
 */

export function getAuth() { return { _isLocalAuthShim: true }; }
export function onAuthStateChanged() { return () => {}; }
export function signInAnonymously() { return Promise.resolve({ user: { uid: null } }); }
export const initializeAuth = () => {};
