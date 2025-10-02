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
  const tab = await queryActive();
  if (!tab) return;
  const resp = await sendToContent(tab.id, {type: 'get-now-watching'});
  const titleEl = document.getElementById('movie-title');
  const epEl = document.getElementById('movie-episode');
  if (resp && resp.title) {
    titleEl.textContent = resp.title;
    epEl.textContent = resp.episode || '';
  } else {
    titleEl.textContent = '—';
    epEl.textContent = 'Not detected';
  }
}

// -------------------- Firebase integration --------------------
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';

let firestore = null;
let unsubscribeComments = null;
let firebaseUser = null;

async function initFirebase() {
  try {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    await signInAnonymously(auth);
    firebaseUser = auth.currentUser;
    firestore = getFirestore(app);
    console.log('Firebase initialized, uid=', firebaseUser && firebaseUser.uid);
  } catch (e) {
    console.warn('Firebase init failed:', e && e.message);
    firestore = null;
  }
}

async function subscribeRemoteComments(movieId, onUpdate) {
  if (!firestore) return;
  if (unsubscribeComments) unsubscribeComments();
  const q = query(collection(firestore, 'comments'), where('movieId','==', movieId), orderBy('time'));
  unsubscribeComments = onSnapshot(q, snapshot => {
    const comments = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
    onUpdate(comments);
  }, err => {
    console.warn('Comments snapshot error', err);
  });
}

async function postRemoteComment(movieId, time, text) {
  if (!firestore) throw new Error('no-firestore');
  const auth = getAuth();
  const uid = auth.currentUser && auth.currentUser.uid;
  const doc = await addDoc(collection(firestore,'comments'), {
    movieId, time: Math.round(time), text: text||'', authorId: uid||'anon', authorName: 'Anon', ts: serverTimestamp()
  });
  return doc.id;
}

async function deleteRemoteComment(docId) {
  if (!firestore) throw new Error('no-firestore');
  await deleteDoc(doc(firestore, 'comments', docId));
}

// Initialize Firebase immediately (best-effort)
initFirebase();
// -------------------- end Firebase integration --------------------

document.getElementById('btn-play').addEventListener('click', async () => {
  const tab = await queryActive();
  if (!tab) return;
  await sendToContent(tab.id, {type: 'play'});
});

document.getElementById('btn-pause').addEventListener('click', async () => {
  const tab = await queryActive();
  if (!tab) return;
  await sendToContent(tab.id, {type: 'pause'});
});

document.getElementById('btn-sub-toggle').addEventListener('click', async () => {
  const tab = await queryActive();
  if (!tab) return;
  await sendToContent(tab.id, {type: 'sub-toggle'});
});

document.getElementById('btn-sub-next').addEventListener('click', async () => {
  const tab = await queryActive();
  if (!tab) return;
  await sendToContent(tab.id, {type: 'sub-next'});
});

document.getElementById('save-note').addEventListener('click', async () => {
  const note = document.getElementById('note').value || '';
  const tab = await queryActive();
  const key = 'notes-' + (tab && tab.id ? tab.id : 'global');
  const storageObj = {};
  storageObj[key] = (note && note.length) ? {text: note, ts: Date.now()} : '';
  await chrome.storage.local.set(storageObj);
  alert('Note saved');
});

// Helper to format seconds to mm:ss
function formatTime(sec) {
  if (!isFinite(sec)) return '00:00';
  const s = Math.floor(sec % 60).toString().padStart(2,'0');
  const m = Math.floor(sec/60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

async function getMovieKey(tab) {
  // Attempt to get a stable movie id or fallback to URL
  let meta = await sendToContent(tab.id, {type: 'get-now-watching'});
  const id = (meta && meta.title) ? meta.title.replace(/\s+/g,'_') : encodeURIComponent(tab.url||'global');
  return `ktp-comments-${id}`;
}

async function loadComments() {
  const tab = await queryActive();
  if (!tab) return;
  const container = document.getElementById('comments-list');
  container.innerHTML = '';
  // Try remote first
  const movieKey = await getMovieKey(tab);
  if (firestore) {
    // subscribeRemoteComments will call render via callback
    await subscribeRemoteComments(movieKey, (comments) => {
      if (!comments || !comments.length) {
        container.innerHTML = '<div class="muted small">No comments yet</div>';
        return;
      }
      comments.forEach((c, idx) => {
        const el = document.createElement('div');
        el.style.padding = '8px';
        el.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
        el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
          <div><strong>${formatTime(c.time)}</strong> <span class="muted small">${c.authorName||c.authorId||'anon'}</span></div>
          <div style="display:flex;gap:6px">
            <button class="btn" data-id="${c.id}" data-action="jump">Go</button>
            <button class="secondary" data-id="${c.id}" data-action="del">Del</button>
          </div>
        </div>
        <div class="muted small" style="margin-top:6px">${(c.text||'').replace(/</g,'&lt;')}</div>`;
        container.appendChild(el);
      });
    });
    return;
  }

  // fallback to local storage
  const key = await getMovieKey(tab);
  const data = await chrome.storage.local.get([key]);
  const list = data[key] || [];
  if (!list.length) {
    container.innerHTML = '<div class="muted small">No comments yet</div>';
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
  if (firestore) {
    try {
      await postRemoteComment(movieKey, timeSec, text);
      // remote snapshot will trigger loadComments update
      return;
    } catch (e) {
      console.warn('Post remote comment failed', e && e.message);
    }
  }
  // fallback to local
  const key = movieKey;
  const data = await chrome.storage.local.get([key]);
  const list = data[key] || [];
  list.push({time: Math.round(timeSec), text: text || '', ts: Date.now()});
  const obj = {};
  obj[key] = list;
  await chrome.storage.local.set(obj);
  await loadComments();
}

document.getElementById('save-timestamp').addEventListener('click', async () => {
  const tab = await queryActive();
  if (!tab) return alert('No active tab');
  const resp = await sendToContent(tab.id, {type: 'query-current-time'});
  if (!resp || typeof resp.currentTime !== 'number') return alert('Could not read current time');
  const text = document.getElementById('note').value || '';
  await saveTimestampedComment(resp.currentTime, text);
  alert('Timestamped comment saved at ' + formatTime(resp.currentTime));
});

// Delegate click events in comments list (go/delete)
document.getElementById('comments-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const idx = btn.dataset.idx !== undefined ? Number(btn.dataset.idx) : null;
  const action = btn.dataset.action;
  const tab = await queryActive();
  const key = await getMovieKey(tab);
  const data = await chrome.storage.local.get([key]);
  const list = data[key] || [];
  if (btn.dataset.id) {
    // remote comment
    const docId = btn.dataset.id;
    if (action === 'jump') {
      // time is in the DOM: find the strong element sibling
      const s = btn.closest('div').querySelector('strong');
      const timeText = s ? s.textContent : '00:00';
      const [m,sec] = timeText.split(':').map(x=>Number(x));
      const seconds = (isFinite(m)?m:0)*60 + (isFinite(sec)?sec:0);
      const resp = await sendToContent(tab.id, {type: 'seek', time: seconds});
      console.log('seek response', resp);
      if (!resp || !resp.ok) {
        alert('Seek failed: ' + (resp && resp.reason ? resp.reason : 'unknown error'));
      } else {
        alert('Seek successful (method: ' + (resp.method || 'unknown') + ')');
      }
    } else if (action === 'del') {
      // delete remote comment
      try {
        await deleteRemoteComment(docId);
      } catch (e) {
        console.warn('Remote delete failed', e && e.message);
        alert('Delete failed');
      }
    }
  } else {
    // local comment as before
    if (action === 'jump') {
      const item = list[idx];
      if (!item) return;
      const resp = await sendToContent(tab.id, {type: 'seek', time: item.time});
      console.log('seek response', resp);
      if (!resp || !resp.ok) {
        alert('Seek failed: ' + (resp && resp.reason ? resp.reason : 'unknown error'));
      } else {
        alert('Seek successful (method: ' + (resp.method || 'unknown') + ')');
      }
    } else if (action === 'del') {
      list.splice(idx,1);
      const obj = {}; obj[key]=list; await chrome.storage.local.set(obj);
      await loadComments();
    }
  }
});

// Load comments when popup opens
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadComments();
});

// initial load
loadComments();

document.getElementById('inspect-frames').addEventListener('click', async () => {
  const tab = await queryActive();
  if (!tab) return;
  await sendToContent(tab.id, {type: 'inspect-frames'});
});

document.getElementById('open-settings').addEventListener('click', () => {
  // open extension options or a settings page in a new tab (placeholder)
  chrome.tabs.create({url: 'options.html'});
});

// initial population
updateNowWatching();

// refresh when popup is opened again
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) updateNowWatching();
});

// listen for content script responses if needed
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'now-watching-updated') updateNowWatching();
});
