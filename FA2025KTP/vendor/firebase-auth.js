// Lightweight wrapper: re-export the local auth shim when the real vendor
// bundle isn't present. This ensures `import { getAuth, onAuthStateChanged, signInAnonymously } from './vendor/firebase-auth.js'`
// resolves in environments where we only ship the local shim.
export * from './firebase-auth-local.js';

// If you later add the real `firebase-auth` vendor bundle, you can replace
// this file with the real bundle or conditionally re-export from it.
