/**
 * show-journal.js - Personal movie/show journal storage
 * Manages watched shows, reviews, and timestamp-based annotations
 * Uses chrome.storage.local as the backend (local-only, no cloud sync)
 */

const STORAGE_KEY = 'ktp_shows_journal';
const FRIENDS_NICKNAMES_KEY = 'ktp_friend_nicknames';
const GLOBAL_FRIENDS_KEY = 'ktp_global_friends';

/**
 * Initialize device ID if it doesn't exist
 * @returns {Promise<string>} The device ID
 */
export async function ensureDeviceId() {
  const stored = await chrome.storage.local.get('ktp_device_id');
  if (stored.ktp_device_id) {
    return stored.ktp_device_id;
  }
  
  // Generate new device ID
  const newDeviceId = 'device_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
  await chrome.storage.local.set({ ktp_device_id: newDeviceId });
  return newDeviceId;
}

/**
 * Get or create a show entry
 * @param {string} showTitle - Title of the show/movie
 * @returns {Promise<Object>} Show object with id, title, review, annotations[], addedDate, lastModified
 */
export async function getOrCreateShow(showTitle) {
  if (!showTitle || showTitle.trim().length === 0) {
    throw new Error('Show title cannot be empty');
  }

  const journal = await getJournal();
  
  // Try to find existing show (case-insensitive)
  let show = journal.find(s => s.title.toLowerCase() === showTitle.toLowerCase());
  
  if (!show) {
    // Create new show entry
    show = {
      id: generateId(),
      title: showTitle.trim(),
      rating: 0,
      review: '',
      annotations: [],
      friends: [],
      addedDate: Date.now(),
      lastModified: Date.now()
    };
    journal.push(show);
    await saveJournal(journal);
  }
  
  return show;
}

/**
 * Get all shows in the journal
 * @returns {Promise<Array>} Array of show objects
 */
export async function getJournal() {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEY]);
    let journal = data[STORAGE_KEY] || [];
    
    // Migrate old annotations to add deviceId if missing
    const migrated = await migrateAnnotations(journal);
    if (migrated) {
      journal = migrated;
    }
    
    return journal;
  } catch (e) {
    console.error('[show-journal] Failed to read journal:', e?.message);
    return [];
  }
}

/**
 * Migrate old annotations to add deviceId field if missing
 * @private
 */
async function migrateAnnotations(journal) {
  if (!Array.isArray(journal)) return null;
  
  // Ensure we have a device ID first
  const currentDeviceId = await ensureDeviceId();
  let needsSave = false;
  
  journal.forEach(show => {
    if (show.annotations && Array.isArray(show.annotations)) {
      show.annotations.forEach(ann => {
        if (!ann.deviceId) {
          ann.deviceId = currentDeviceId;
          needsSave = true;
        }
      });
    }
  });
  
  if (needsSave) {
    try {
      await saveJournal(journal);
    } catch (e) {
      console.error('[show-journal] Failed to save migrated journal:', e?.message);
    }
    return journal;
  }
  
  return null;
}

/**
 * Save journal to storage
 * @param {Array} journal - Journal array
 */
async function saveJournal(journal) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: journal });
  } catch (e) {
    console.error('[show-journal] Failed to save journal:', e?.message);
    throw e;
  }
}

/**
 * Update a show's review and rating
 * @param {string} showId - Show ID
 * @param {string} reviewText - New review text
 * @param {number} rating - Rating 0-5
 * @returns {Promise<Object>} Updated show object
 */
export async function updateShowReview(showId, reviewText, rating = 0) {
  const journal = await getJournal();
  const show = journal.find(s => s.id === showId);
  
  if (!show) {
    throw new Error(`Show with id ${showId} not found`);
  }
  
  show.review = reviewText.trim();
  show.rating = Math.max(0, Math.min(5, parseInt(rating) || 0));
  show.lastModified = Date.now();
  await saveJournal(journal);
  
  return show;
}

/**
 * Add a timestamp annotation to a show
 * @param {string} showId - Show ID
 * @param {number} timestampSeconds - Playback timestamp in seconds
 * @param {string} annotationText - User's note
 * @returns {Promise<Object>} Updated show object
 */
export async function addAnnotation(showId, timestampSeconds, annotationText) {
  if (!isFinite(timestampSeconds) || timestampSeconds < 0) {
    throw new Error('Invalid timestamp');
  }
  
  if (!annotationText || annotationText.trim().length === 0) {
    throw new Error('Annotation text cannot be empty');
  }

  // Get current device ID
  const stored = await chrome.storage.local.get('ktp_device_id');
  const deviceId = stored.ktp_device_id || 'unknown';
  
  const journal = await getJournal();
  const show = journal.find(s => s.id === showId);
  
  if (!show) {
    throw new Error(`Show with id ${showId} not found`);
  }
  
  const annotation = {
    id: generateId(),
    timestamp: Math.round(timestampSeconds),
    text: annotationText.trim(),
    createdDate: Date.now(),
    deviceId: deviceId
  };
  
  show.annotations.push(annotation);
  // Keep annotations sorted by timestamp
  show.annotations.sort((a, b) => a.timestamp - b.timestamp);
  show.lastModified = Date.now();
  
  await saveJournal(journal);
  
  return show;
}

/**
 * Remove an annotation from a show
 * @param {string} showId - Show ID
 * @param {string} annotationId - Annotation ID
 * @returns {Promise<Object>} Updated show object
 */
export async function removeAnnotation(showId, annotationId) {
  const journal = await getJournal();
  const show = journal.find(s => s.id === showId);
  
  if (!show) {
    throw new Error(`Show with id ${showId} not found`);
  }
  
  const idx = show.annotations.findIndex(a => a.id === annotationId);
  if (idx === -1) {
    throw new Error(`Annotation ${annotationId} not found`);
  }
  
  show.annotations.splice(idx, 1);
  show.lastModified = Date.now();
  
  await saveJournal(journal);
  
  return show;
}

/**
 * Delete an entire show from the journal
 * @param {string} showId - Show ID
 * @returns {Promise<void>}
 */
export async function deleteShow(showId) {
  const journal = await getJournal();
  const idx = journal.findIndex(s => s.id === showId);
  
  if (idx === -1) {
    throw new Error(`Show with id ${showId} not found`);
  }
  
  journal.splice(idx, 1);
  await saveJournal(journal);
}

/**
 * Get a specific show by title (case-insensitive)
 * @param {string} showTitle - Show title
 * @returns {Promise<Object|null>} Show object or null
 */
export async function getShowByTitle(showTitle) {
  const journal = await getJournal();
  return journal.find(s => s.title.toLowerCase() === showTitle.toLowerCase()) || null;
}

/**
 * Add a friend device ID to a show
 * @param {string} showId - Show ID
 * @param {string} deviceId - Friend's device ID
 * @returns {Promise<Object>} Updated show object
 */
export async function addFriend(showId, deviceId) {
  if (!deviceId || deviceId.trim().length === 0) {
    throw new Error('Device ID cannot be empty');
  }

  const journal = await getJournal();
  const show = journal.find(s => s.id === showId);
  
  if (!show) {
    throw new Error(`Show with id ${showId} not found`);
  }

  if (!show.friends) {
    show.friends = [];
  }

  const cleanId = deviceId.trim();

  // Ensure friend is stored globally as well
  await addGlobalFriend(cleanId).catch(() => {});

  if (!show.friends.includes(cleanId)) {
    show.friends.push(cleanId);
    show.lastModified = Date.now();
    await saveJournal(journal);
  }

  return show;
}

/**
 * Remove a friend from a show
 * @param {string} showId - Show ID
 * @param {string} deviceId - Friend's device ID
 * @returns {Promise<Object>} Updated show object
 */
export async function removeFriend(showId, deviceId) {
  const journal = await getJournal();
  const show = journal.find(s => s.id === showId);
  
  if (!show) {
    throw new Error(`Show with id ${showId} not found`);
  }

  if (show.friends) {
    show.friends = show.friends.filter(id => id !== deviceId);
    show.lastModified = Date.now();
    await saveJournal(journal);
  }

  return show;
}

/**
 * Get all friends for a show
 * @param {string} showId - Show ID
 * @returns {Promise<Array>} Array of friend device IDs
 */
export async function getFriends(showId) {
  const journal = await getJournal();
  const show = journal.find(s => s.id === showId);
  
  if (!show) {
    throw new Error(`Show with id ${showId} not found`);
  }

  return show.friends || [];
}

/**
 * Get global friends list
 * @returns {Promise<Array>} Array of device IDs
 */
export async function getGlobalFriends() {
  const data = await chrome.storage.local.get(GLOBAL_FRIENDS_KEY);
  return data[GLOBAL_FRIENDS_KEY] || [];
}

/**
 * Add a device ID to the global friends list
 * @param {string} deviceId
 */
export async function addGlobalFriend(deviceId) {
  if (!deviceId || deviceId.trim().length === 0) return;
  const data = await chrome.storage.local.get(GLOBAL_FRIENDS_KEY);
  const list = data[GLOBAL_FRIENDS_KEY] || [];
  const clean = deviceId.trim();
  if (!list.includes(clean)) {
    list.push(clean);
    await chrome.storage.local.set({ [GLOBAL_FRIENDS_KEY]: list });
  }
}

/**
 * Remove a device ID from the global friends list and from all shows
 * @param {string} deviceId
 */
export async function removeGlobalFriend(deviceId) {
  if (!deviceId) return;
  const data = await chrome.storage.local.get(GLOBAL_FRIENDS_KEY);
  let list = data[GLOBAL_FRIENDS_KEY] || [];
  list = list.filter(id => id !== deviceId);
  await chrome.storage.local.set({ [GLOBAL_FRIENDS_KEY]: list });

  // Remove from all shows as well
  const journal = await getJournal();
  let changed = false;
  journal.forEach(show => {
    if (show.friends && show.friends.includes(deviceId)) {
      show.friends = show.friends.filter(id => id !== deviceId);
      changed = true;
    }
  });
  if (changed) await saveJournal(journal);
}

/**
 * Set a nickname for a friend device ID (global, used across all shows)
 * @param {string} deviceId - Friend's device ID
 * @param {string} nickname - Display name for the friend
 * @returns {Promise<void>}
 */
export async function setFriendNickname(deviceId, nickname) {
  if (!deviceId || deviceId.trim().length === 0) {
    throw new Error('Device ID cannot be empty');
  }

  const data = await chrome.storage.local.get(FRIENDS_NICKNAMES_KEY);
  const nicknames = data[FRIENDS_NICKNAMES_KEY] || {};
  
  if (nickname && nickname.trim().length > 0) {
    nicknames[deviceId] = nickname.trim();
  } else {
    delete nicknames[deviceId];
  }

  await chrome.storage.local.set({ [FRIENDS_NICKNAMES_KEY]: nicknames });
}

/**
 * Get a nickname for a friend device ID
 * @param {string} deviceId - Friend's device ID
 * @returns {Promise<string>} Nickname if set, otherwise device ID
 */
export async function getFriendNickname(deviceId) {
  const data = await chrome.storage.local.get(FRIENDS_NICKNAMES_KEY);
  const nicknames = data[FRIENDS_NICKNAMES_KEY] || {};
  return nicknames[deviceId] || deviceId;
}

/**
 * Get all friend nicknames
 * @returns {Promise<Object>} Map of deviceId -> nickname
 */
export async function getAllFriendNicknames() {
  const data = await chrome.storage.local.get(FRIENDS_NICKNAMES_KEY);
  return data[FRIENDS_NICKNAMES_KEY] || {};
}

/**
 * Export a single show's data (for sharing with friends)
 * @param {string} showId - Show ID
 * @returns {Promise<string>} JSON string with show and its annotations
 */
export async function exportShow(showId) {
  const journal = await getJournal();
  const show = journal.find(s => s.id === showId);
  
  if (!show) {
    throw new Error(`Show with id ${showId} not found`);
  }

  // Return show data with annotations only (not friends list)
  const exportData = {
    title: show.title,
    annotations: show.annotations || [],
    exportedAt: Date.now()
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Merge annotations from imported show data
 * @param {string} showId - Local show ID
 * @param {string} jsonStr - JSON string from exported show
 * @returns {Promise<Object>} Updated show object
 */
export async function importShowAnnotations(showId, jsonStr) {
  const journal = await getJournal();
  const show = journal.find(s => s.id === showId);
  
  if (!show) {
    throw new Error(`Show with id ${showId} not found`);
  }

  let importedData;
  try {
    importedData = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('Invalid JSON format');
  }

  if (!Array.isArray(importedData.annotations)) {
    throw new Error('Invalid annotations data');
  }

  // Merge annotations - avoid duplicates by checking ID
  const existingIds = new Set(show.annotations.map(a => a.id));
  let addedCount = 0;

  importedData.annotations.forEach(ann => {
    if (!existingIds.has(ann.id)) {
      show.annotations.push(ann);
      addedCount++;
    }
  });

  // Re-sort by timestamp
  show.annotations.sort((a, b) => a.timestamp - b.timestamp);
  show.lastModified = Date.now();
  
  await saveJournal(journal);

  return { show, addedCount };
}

/**
 * Export entire journal as JSON
 * @returns {Promise<string>} JSON string
 */
export async function exportJournal() {
  const journal = await getJournal();
  return JSON.stringify(journal, null, 2);
}

/**
 * Import journal from JSON (replaces existing data)
 * @param {string} jsonStr - JSON string
 * @returns {Promise<Array>} Imported journal
 */
export async function importJournal(jsonStr) {
  const journal = JSON.parse(jsonStr);
  if (!Array.isArray(journal)) {
    throw new Error('Invalid journal format');
  }
  await saveJournal(journal);
  return journal;
}

/**
 * Clear entire journal
 * @returns {Promise<void>}
 */
export async function clearJournal() {
  await chrome.storage.local.remove([STORAGE_KEY]);
}

/**
 * Generate a unique ID
 * @private
 */
function generateId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Format seconds to mm:ss
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  if (!isFinite(seconds)) return '00:00';
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Format date to readable string
 * @param {number} timestamp - Milliseconds
 * @returns {string}
 */
export function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString();
}

export default {
  ensureDeviceId,
  getOrCreateShow,
  getJournal,
  updateShowReview,
  addAnnotation,
  removeAnnotation,
  deleteShow,
  getShowByTitle,
  addFriend,
  removeFriend,
  getFriends,
  getGlobalFriends,
  addGlobalFriend,
  removeGlobalFriend,
  setFriendNickname,
  getFriendNickname,
  getAllFriendNicknames,
  exportShow,
  importShowAnnotations,
  exportJournal,
  importJournal,
  clearJournal,
  formatTime,
  formatDate
};
