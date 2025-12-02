/**
 * DEPRECATED: Firebase support has been removed from this extension.
 * This file is kept for reference only and should not be imported.
 * All Firebase code has been removed from the active codebase.
 */

export const firebaseConfig = {
  // REMOVED - Firebase config kept for reference only
};

// All Firebase functionality has been removed.
// These stubs throw errors if accidentally called.

export async function sendTimestampEvent(showId, userId, timestamp, note = "") {
  throw new Error('Firebase has been removed from this extension. sendTimestampEvent() is not available.');
}

export function listenForFriendTimestamps(showId, friendIds, onAdded, opts = {}) {
  throw new Error('Firebase has been removed from this extension. listenForFriendTimestamps() is not available.');
}

export function listenForAllFriendTimestamps(friendIds, onAdded, opts = {}) {
  throw new Error('Firebase has been removed from this extension. listenForAllFriendTimestamps() is not available.');
}

export { db };
