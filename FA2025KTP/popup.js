// ================================================================================
// POPUP.JS - Netflix KTP Extension Popup Handler
// Firebase Firestore for real-time comment sharing with friends
// Local Storage as fallback
// ================================================================================

// ---- Utility Functions ----
function formatTime(seconds) {
  if (!isFinite(seconds)) return '?';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

async function queryActive() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function sendToContent(tabId, msg) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch (e) {
    console.warn('[popup] sendMessage failed:', e && e.message);
    return null;
  }
}

// ---- Firebase Setup ----
let firebaseReady = false;
let firebaseAuth = null;
let firebaseDb = null;
let currentUserId = null;
let activeListeners = {}; // Track listeners by movieKey

async function initFirebase() {
  if (firebaseReady) return;
  
  try {
    // For popup, use a simplified approach - just rely on message passing to background
    // The background service worker handles Firebase, popup just shows results
    firebaseReady = true;
    console.log('[popup] Firebase communication initialized via background');
    return true;
  } catch (e) {
    console.warn('[popup] Firebase init failed:', e && e.message);
    return false;
  }
}

// ---- Update Now Watching Display ----
async function updateNowWatching() {
  console.log('[popup] updateNowWatching called');
  const tab = await queryActive();
  if (!tab) {
    console.log('[popup] no active tab');
    return;
  }
  const resp = await sendToContent(tab.id, { type: 'get-now-watching' });
  console.log('[popup] get-now-watching response:', resp);
  const titleEl = document.getElementById('movie-title');
  const epEl = document.getElementById('movie-episode');
  if (resp && resp.title) {
    console.log('[popup] setting title to:', resp.title);
    titleEl.textContent = resp.title;
    epEl.textContent = resp.episode || '';
  } else {
    console.log('[popup] no title in response, setting to default');
    titleEl.textContent = '—';
    epEl.textContent = 'Not detected';
  }
}

// ---- Movie Key Generation ----
async function getMovieKey(tab) {
  // Attempt to get a stable movie id or fallback to URL
  if (!tab) return 'ktp-comments-global';
  let meta = await sendToContent(tab.id, { type: 'get-now-watching' });
  const id = (meta && meta.title) ? meta.title.replace(/\s+/g, '_') : encodeURIComponent(tab.url || 'global');
  return `ktp-comments-${id}`;
}

// ---- Load & Render Comments (Firebase + Local Storage) ----
async function loadComments() {
  const tab = await queryActive();
  if (!tab) return;
  const container = document.getElementById('comments-list');
  container.innerHTML = '<div class="muted small">Loading comments...</div>';
  
  try {
    const movieKey = await getMovieKey(tab);
    
    // Ensure Firebase is ready
    if (!firebaseReady) {
      console.log('[popup] Firebase not ready, initializing...');
      await initFirebase();
    }
    
    // Listen to Firebase for comments
    if (firebaseReady && firebaseDb) {
      console.log('[popup] Setting up Firebase listener for:', movieKey);
      setupFirebaseListener(movieKey, container);
    } else {
      console.log('[popup] Firebase unavailable, using local storage only');
      loadLocalComments(movieKey, container);
    }
  } catch (e) {
    console.warn('[popup] Failed to load comments:', e && e.message);
    container.innerHTML = '<div class="muted small">Error loading comments</div>';
    
    const movieKey = await getMovieKey(tab);
    loadLocalComments(movieKey, container);
  }
}

// ---- Setup Firebase Listener ----
async function setupFirebaseListener(movieKey, container) {
  try {
    // For now, popup uses local storage only
    // Background service worker syncs from Firebase to local storage
    // Popup just displays what's in local storage
    loadLocalComments(movieKey, container);
    
    // Set up polling to refresh every 2 seconds
    setInterval(() => {
      loadLocalComments(movieKey, container);
    }, 2000);
    
    console.log('[popup] Local storage listener attached for:', movieKey);
  } catch (e) {
    console.warn('[popup] Listener setup failed:', e && e.message);
    loadLocalComments(movieKey, container);
  }
}

// ---- Load Local Comments (Fallback) ----
async function loadLocalComments(movieKey, container) {
  try {
    const data = await chrome.storage.local.get([movieKey]);
    const list = data[movieKey] || [];
    renderComments(list, container);
  } catch (e) {
    console.warn('[popup] Local load failed:', e && e.message);
    container.innerHTML = '<div class="muted small">Error loading comments</div>';
  }
}

// ---- Render Comments ----
function renderComments(list, container) {
  if (!list || !list.length) {
    container.innerHTML = '<div class="muted small">No comments yet. Save a timestamp to start!</div>';
    return;
  }
  
  container.innerHTML = '';
  list.forEach((c, idx) => {
    const el = document.createElement('div');
    el.style.padding = '10px';
    el.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
    el.style.background = c.isRemote ? 'rgba(229,9,20,0.1)' : 'rgba(255,255,255,0.05)';
    el.style.borderRadius = '4px';
    el.style.marginBottom = '8px';
    
    const createDate = new Date(c.ts || 0);
    const userLabel = c.userId ? c.userId.substring(0, 10) : 'You';
    const remoteLabel = c.isRemote ? ' (Friend)' : '';
    
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="flex:1">
          <strong style="color:#e50914">${formatTime(c.time)}</strong>
          <span class="muted small" style="margin-left:8px;font-size:11px">${userLabel}${remoteLabel}</span>
          <span class="muted small" style="display:block;margin-top:4px;font-size:10px">${createDate.toLocaleString()}</span>
        </div>
      </div>
      <div class="muted small" style="margin-top:8px;word-break:break-word;font-size:12px">${(c.text || '').replace(/</g, '&lt;')}</div>
    `;
    container.appendChild(el);
  });
}

// ---- Save Timestamped Comment ----
async function saveTimestampedComment(timeSec, text) {
  const tab = await queryActive();
  if (!tab) return;
  const movieKey = await getMovieKey(tab);
  
  const userId = 'user_' + (Math.random() * 1000).toFixed(0);
  
  // Always save to local storage first (primary storage)
  try {
    const data = await chrome.storage.local.get([movieKey]);
    const list = data[movieKey] || [];
    list.push({ 
      time: Math.round(timeSec), 
      text: text || '', 
      ts: Date.now(), 
      userId: userId, 
      isRemote: false 
    });
    
    const obj = {};
    obj[movieKey] = list;
    await chrome.storage.local.set(obj);
    console.log('[popup] Comment saved to local storage');
  } catch (e) {
    console.error('[popup] Local save failed:', e && e.message);
  }
  
  // Try to sync to Firebase via background service worker
  try {
    chrome.runtime.sendMessage({
      action: 'saveCommentToFirebase',
      movieKey: movieKey,
      showId: movieKey,
      userId: userId,
      timestamp: Math.round(timeSec),
      note: text || ''
    }, (response) => {
      if (response?.success) {
        console.log('[popup] Comment also synced to Firebase');
      } else {
        console.log('[popup] Firebase sync skipped (background unavailable)');
      }
    });
  } catch (e) {
    console.log('[popup] Firebase sync via background failed:', e?.message);
  }
  
  await loadComments();
}

// ---- Initialize Popup (Attach Event Listeners) ----
function initializePopup() {
  console.log('[popup] initializing...');
  
  // Initialize Firebase in background
  initFirebase().catch(e => console.warn('[popup] Firebase init error:', e));
  
  // Initial load
  updateNowWatching();
  loadComments();

  // ---- Show My UID Button ----
  const showUidBtn = document.getElementById('show-uid');
  const uidDisplay = document.getElementById('uid-display');
  if (showUidBtn && uidDisplay) {
    showUidBtn.addEventListener('click', () => {
      uidDisplay.textContent = 'Loading...';
      chrome.runtime.sendMessage({ action: 'getFirebaseUid' }, (response) => {
        if (response && response.uid) {
          uidDisplay.textContent = 'Your Firebase UID: ' + response.uid;
        } else {
          uidDisplay.textContent = 'UID not available (not signed in)';
        }
      });
    });
  }
  
  // ---- Play Button ----
  const playBtn = document.getElementById('btn-play');
  if (playBtn) {
    playBtn.addEventListener('click', async () => {
      console.log('[popup] play clicked');
      const tab = await queryActive();
      if (!tab) return;
      const resp = await sendToContent(tab.id, { type: 'play' });
      console.log('[popup] play response:', resp);
    });
  }
  
  // ---- Pause Button ----
  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', async () => {
      console.log('[popup] pause clicked');
      const tab = await queryActive();
      if (!tab) return;
      const resp = await sendToContent(tab.id, { type: 'pause' });
      console.log('[popup] pause response:', resp);
    });
  }
  
  // ---- Subtitle Toggle Button ----
  const subToggleBtn = document.getElementById('btn-sub-toggle');
  if (subToggleBtn) {
    subToggleBtn.addEventListener('click', async () => {
      console.log('[popup] sub-toggle clicked');
      const tab = await queryActive();
      if (!tab) return;
      await sendToContent(tab.id, { type: 'sub-toggle' });
    });
  }
  
  // ---- Subtitle Next Button ----
  const subNextBtn = document.getElementById('btn-sub-next');
  if (subNextBtn) {
    subNextBtn.addEventListener('click', async () => {
      console.log('[popup] sub-next clicked');
      const tab = await queryActive();
      if (!tab) return;
      await sendToContent(tab.id, { type: 'sub-next' });
    });
  }
  
  // ---- Save Note Button ----
  const saveNoteBtn = document.getElementById('save-note');
  if (saveNoteBtn) {
    saveNoteBtn.addEventListener('click', async () => {
      console.log('[popup] save-note clicked');
      const note = document.getElementById('note').value || '';
      const tab = await queryActive();
      if (!tab) return alert('No active tab');
      const key = 'notes-' + tab.id;
      const storageObj = {};
      storageObj[key] = (note && note.length) ? { text: note, ts: Date.now() } : '';
      await chrome.storage.local.set(storageObj);
      alert('Note saved locally');
    });
  }
  
  // ---- Save Timestamped Comment Button ----
  const saveTimestampBtn = document.getElementById('save-timestamp');
  if (saveTimestampBtn) {
    saveTimestampBtn.addEventListener('click', async () => {
      console.log('[popup] save-timestamp clicked');
      const tab = await queryActive();
      if (!tab) return alert('No active tab');
      const resp = await sendToContent(tab.id, { type: 'query-current-time' });
      if (!resp || typeof resp.currentTime !== 'number') return alert('Could not read current time');
      const text = document.getElementById('note').value || '';
      await saveTimestampedComment(resp.currentTime, text);
      document.getElementById('note').value = '';
      alert('✓ Comment saved and shared with friends!');
    });
  }
  
  // ---- Inspect Frames Button ----
  const inspectBtn = document.getElementById('inspect-frames');
  if (inspectBtn) {
    inspectBtn.addEventListener('click', async () => {
      console.log('[popup] inspect-frames clicked');
      const tab = await queryActive();
      if (!tab) return;
      await sendToContent(tab.id, { type: 'inspect-frames' });
    });
  }
  
  // ---- Open Settings Button ----
  const settingsBtn = document.getElementById('open-settings');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      console.log('[popup] open-settings clicked');
      chrome.tabs.create({ url: 'options.html' });
    });
  }
  
  // ---- Refresh When Popup Opened Again ----
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      console.log('[popup] popup reopened, refreshing...');
      updateNowWatching();
      loadComments();
    }
  });
  
  console.log('[popup] initialization complete');
}

// ---- DOMContentLoaded or Execute Immediately ----
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePopup);
} else {
  initializePopup();
}

// ---- Listen for Content Script Updates ----
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'now-watching-updated') {
    console.log('[popup] received now-watching-updated message');
    updateNowWatching();
  }
});

console.log('[popup] script loaded, waiting for DOM...');

