// -------------------- Local storage for comments (Firebase disabled) --------------------
let firestore = null;
let unsubscribeComments = null;

// Note: Remote Firebase functionality is disabled due to CSP restrictions in Manifest V3
// All comments are stored locally using chrome.storage.local

// Helper to format seconds to mm:ss
function formatTime(sec) {
  if (!isFinite(sec)) return '00:00';
  const s = Math.floor(sec % 60).toString().padStart(2,'0');
  const m = Math.floor(sec/60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

const queryActive = async () => {
  const tabs = await chrome.tabs.query({active: true, currentWindow: true});
  return tabs && tabs[0];
};

async function sendToContent(tabId, message) {
  try {
    const resp = await chrome.tabs.sendMessage(tabId, message);
    return resp;
  } catch (err) {
    // sendMessage throws if no content script is listening
    return null;
  }
}

async function updateNowWatching() {
  console.log('[popup] updateNowWatching called');
  const tab = await queryActive();
  console.log('[popup] active tab:', tab);
  if (!tab) {
    console.log('[popup] no active tab');
    return;
  }
  const resp = await sendToContent(tab.id, {type: 'get-now-watching'});
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

// Don't attach event listeners here - wait for DOM ready
// All listeners will be attached in initializePopup()

async function getMovieKey(tab) {
  // Attempt to get a stable movie id or fallback to URL
  if (!tab) return 'ktp-comments-global';
  let meta = await sendToContent(tab.id, {type: 'get-now-watching'});
  const id = (meta && meta.title) ? meta.title.replace(/\s+/g,'_') : encodeURIComponent(tab.url||'global');
  return `ktp-comments-${id}`;
}

async function loadComments() {
  const tab = await queryActive();
  if (!tab) return;
  const container = document.getElementById('comments-list');
  container.innerHTML = '';
  
  // Use local storage only
  const movieKey = await getMovieKey(tab);
  const data = await chrome.storage.local.get([movieKey]);
  const list = data[movieKey] || [];
  
  if (!list.length) {
    container.innerHTML = '<div class="muted small">No comments yet (local storage only)</div>';
    return;
  }
  
  list.forEach((c, idx) => {
    const el = document.createElement('div');
    el.style.padding = '8px';
    el.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><strong>${formatTime(c.time)}</strong> <span class="muted small">${new Date(c.ts).toLocaleString()}</span></div>
      <div style="display:flex;gap:6px">
        <button class="btn" data-idx="${idx}" data-action="jump">Go</button>
        <button class="secondary" data-idx="${idx}" data-action="del">Del</button>
      </div>
    </div>
    <div class="muted small" style="margin-top:6px">${(c.text||'').replace(/</g,'&lt;')}</div>`;
    container.appendChild(el);
  });
}

async function saveTimestampedComment(timeSec, text) {
  const tab = await queryActive();
  if (!tab) return;
  const movieKey = await getMovieKey(tab);
  
  // Use local storage only
  const data = await chrome.storage.local.get([movieKey]);
  const list = data[movieKey] || [];
  list.push({time: Math.round(timeSec), text: text || '', ts: Date.now()});
  const obj = {};
  obj[movieKey] = list;
  await chrome.storage.local.set(obj);
  await loadComments();
}

// Initialize popup when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePopup);
} else {
  initializePopup();
}

function initializePopup() {
  // initial population
  updateNowWatching();
  loadComments();
  
  // attach play/pause listeners
  const playBtn = document.getElementById('btn-play');
  if (playBtn) {
    playBtn.addEventListener('click', async () => {
      const tab = await queryActive();
      if (!tab) return;
      const resp = await sendToContent(tab.id, {type: 'play'});
      console.log('play response:', resp);
    });
  }
  
  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', async () => {
      const tab = await queryActive();
      if (!tab) return;
      const resp = await sendToContent(tab.id, {type: 'pause'});
      console.log('pause response:', resp);
    });
  }
  
  // attach subtitle listeners
  const subToggleBtn = document.getElementById('btn-sub-toggle');
  if (subToggleBtn) {
    subToggleBtn.addEventListener('click', async () => {
      const tab = await queryActive();
      if (!tab) return;
      await sendToContent(tab.id, {type: 'sub-toggle'});
    });
  }
  
  const subNextBtn = document.getElementById('btn-sub-next');
  if (subNextBtn) {
    subNextBtn.addEventListener('click', async () => {
      const tab = await queryActive();
      if (!tab) return;
      await sendToContent(tab.id, {type: 'sub-next'});
    });
  }
  
  // attach note save listener
  const saveNoteBtn = document.getElementById('save-note');
  if (saveNoteBtn) {
    saveNoteBtn.addEventListener('click', async () => {
      const note = document.getElementById('note').value || '';
      const tab = await queryActive();
      if (!tab) return alert('No active tab');
      const key = 'notes-' + tab.id;
      const storageObj = {};
      storageObj[key] = (note && note.length) ? {text: note, ts: Date.now()} : '';
      await chrome.storage.local.set(storageObj);
      alert('Note saved');
    });
  }
  
  // attach timestamp save listener
  const saveTimestampBtn = document.getElementById('save-timestamp');
  if (saveTimestampBtn) {
    saveTimestampBtn.addEventListener('click', async () => {
      const tab = await queryActive();
      if (!tab) return alert('No active tab');
      const resp = await sendToContent(tab.id, {type: 'query-current-time'});
      if (!resp || typeof resp.currentTime !== 'number') return alert('Could not read current time');
      const text = document.getElementById('note').value || '';
      await saveTimestampedComment(resp.currentTime, text);
      alert('Timestamped comment saved at ' + formatTime(resp.currentTime));
    });
  }
  
  // attach inspect frames listener
  const inspectBtn = document.getElementById('inspect-frames');
  if (inspectBtn) {
    inspectBtn.addEventListener('click', async () => {
      const tab = await queryActive();
      if (!tab) return;
      await sendToContent(tab.id, {type: 'inspect-frames'});
    });
  }

  // attach settings listener
  const settingsBtn = document.getElementById('open-settings');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      chrome.tabs.create({url: 'options.html'});
    });
  }
  
  // refresh when popup is opened again
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      updateNowWatching();
      loadComments();
    }
  });
}

// listen for content script responses
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'now-watching-updated') {
    updateNowWatching();
  }
});
