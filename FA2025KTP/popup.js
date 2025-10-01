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
