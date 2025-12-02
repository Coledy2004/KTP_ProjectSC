/**
 * show-journal.js - Personal movie/show journal storage
 * Manages watched shows, reviews, and timestamp-based annotations
 * Uses chrome.storage.local as the backend (local-only, no cloud sync)
 */

const STORAGE_KEY = 'ktp_shows_journal';

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
      review: '',
      annotations: [],
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
    return data[STORAGE_KEY] || [];
  } catch (e) {
    console.error('[show-journal] Failed to read journal:', e?.message);
    return [];
  }
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
 * Update a show's review
 * @param {string} showId - Show ID
 * @param {string} reviewText - New review text
 * @returns {Promise<Object>} Updated show object
 */
export async function updateShowReview(showId, reviewText) {
  const journal = await getJournal();
  const show = journal.find(s => s.id === showId);
  
  if (!show) {
    throw new Error(`Show with id ${showId} not found`);
  }
  
  show.review = reviewText.trim();
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
  
  const journal = await getJournal();
  const show = journal.find(s => s.id === showId);
  
  if (!show) {
    throw new Error(`Show with id ${showId} not found`);
  }
  
  const annotation = {
    id: generateId(),
    timestamp: Math.round(timestampSeconds),
    text: annotationText.trim(),
    createdDate: Date.now()
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
  getOrCreateShow,
  getJournal,
  updateShowReview,
  addAnnotation,
  removeAnnotation,
  deleteShow,
  getShowByTitle,
  exportJournal,
  importJournal,
  clearJournal,
  formatTime,
  formatDate
};
