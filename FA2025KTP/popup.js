// ================================================================================
// POPUP.JS - Personal Movie/Show Journal
// Local-only storage, no cloud sync, no friends sharing
// ================================================================================

import * as Journal from './show-journal.js';

// State
let currentShow = null; // Currently selected show for viewing/editing
let nowWatchingTitle = null; // Currently detected show on Netflix

// ---- Utility Functions ----

async function queryActive() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

// Ensure the content script is present in a tab by injecting it if needed
async function ensureContentScript(tabId) {
  try {
    console.log('[popup] injecting content script into tab', tabId);
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    console.log('[popup] injection complete');
    return true;
  } catch (err) {
    console.warn('[popup] injection failed:', err && err.message);
    return false;
  }
}
async function sendToContent(tabId, msg) {
  return new Promise((resolve) => {
    try {
      console.log('[popup] sending message to tab', tabId, ':', msg.type);
      chrome.tabs.sendMessage(tabId, msg, (response) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || '';
          console.warn('[popup] sendMessage runtime error:', errMsg);

          // If receiving end does not exist, try to inject the content script and retry once
          if (errMsg.includes('Receiving end does not exist') || errMsg.includes('Could not establish connection')) {
            console.log('[popup] detected missing content script, attempting injection...');
            ensureContentScript(tabId).then((ok) => {
              if (!ok) {
                console.warn('[popup] injection failed, cannot contact content script');
                resolve(null);
                return;
              }

              // Small delay to allow the injected script to register its listener
              setTimeout(() => {
                chrome.tabs.sendMessage(tabId, msg, (response2) => {
                  if (chrome.runtime.lastError) {
                    console.warn('[popup] retry sendMessage failed:', chrome.runtime.lastError.message);
                    resolve(null);
                  } else {
                    console.log('[popup] got response (retry):', response2);
                    resolve(response2);
                  }
                });
              }, 250);
            });
            return;
          }

          resolve(null);
        } else {
          console.log('[popup] got response:', response);
          resolve(response);
        }
      });
    } catch (e) {
      console.warn('[popup] sendMessage exception:', e && e.message);
      resolve(null);
    }
  });
}

// ---- Update Now Watching Display ----

async function updateNowWatching() {
  console.log('[popup] updateNowWatching called');
  const tab = await queryActive();
  if (!tab) {
    console.log('[popup] no active tab');
    return;
  }
  
  console.log('[popup] active tab URL:', tab.url);
  
  // Only try to get title if on Netflix
  if (!tab.url || !tab.url.includes('netflix.com')) {
    console.log('[popup] not on netflix.com');
    document.getElementById('movie-title').textContent = '—';
    document.getElementById('movie-episode').textContent = 'Not on Netflix';
    return;
  }
  
  const resp = await sendToContent(tab.id, { type: 'get-now-watching' });
  console.log('[popup] get-now-watching response:', resp);
  
  const titleEl = document.getElementById('movie-title');
  const epEl = document.getElementById('movie-episode');
  
  if (resp && resp.title) {
    console.log('[popup] setting title to:', resp.title);
    nowWatchingTitle = resp.title;
    titleEl.textContent = resp.title;
    epEl.textContent = resp.episode || '(episode info not detected)';
  } else {
    console.log('[popup] no title in response, setting to default');
    nowWatchingTitle = null;
    titleEl.textContent = '—';
    epEl.textContent = resp ? 'Not playing' : 'Content script not loaded';
  }
}

// ---- UI State Management ----

function showJournalList() {
  currentShow = null;
  document.getElementById('journal-list-card').style.display = 'block';
  document.getElementById('journal-entry-card').style.display = 'none';
  loadShowsList();
}

function showJournalEntry(show) {
  currentShow = show;
  document.getElementById('journal-list-card').style.display = 'none';
  document.getElementById('journal-entry-card').style.display = 'block';
  
  // Update UI with show data
  document.getElementById('journal-show-title').textContent = show.title;
  document.getElementById('review').value = show.review || '';
  document.getElementById('annotation-input').value = '';
  
  loadAnnotations();
  
  // Switch to info tab
  switchTab('info');
}

function switchTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  
  // Show selected tab
  document.getElementById(`tab-${tabName}`).style.display = 'block';
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
}

// ---- Load & Render Shows List ----

async function loadShowsList() {
  const container = document.getElementById('shows-list');
  try {
    const journal = await Journal.getJournal();
    
    if (!journal || journal.length === 0) {
      container.innerHTML = '<div class="no-data">No shows yet. Add one above!</div>';
      return;
    }
    
    // Sort by last modified (most recent first)
    journal.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
    
    container.innerHTML = '';
    journal.forEach(show => {
      const el = document.createElement('div');
      el.style.padding = '10px';
      el.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
      el.style.cursor = 'pointer';
      el.style.background = 'rgba(255,255,255,0.03)';
      el.style.borderRadius = '4px';
      el.style.marginBottom = '6px';
      el.style.transition = 'background 0.2s';
      
      const reviewPreview = show.review ? show.review.substring(0, 50) + '...' : '(no review)';
      const annCount = (show.annotations || []).length;
      
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="flex:1">
            <strong>${show.title}</strong>
            <div class="muted small" style="margin-top:4px">${reviewPreview}</div>
            <div class="muted small" style="margin-top:4px">📝 ${annCount} annotation${annCount !== 1 ? 's' : ''}</div>
          </div>
        </div>
      `;
      
      el.addEventListener('click', () => {
        showJournalEntry(show);
      });
      
      el.addEventListener('mouseenter', () => {
        el.style.background = 'rgba(255,255,255,0.1)';
      });
      
      el.addEventListener('mouseleave', () => {
        el.style.background = 'rgba(255,255,255,0.03)';
      });
      
      container.appendChild(el);
    });
  } catch (e) {
    console.error('[popup] Failed to load shows:', e?.message);
    container.innerHTML = '<div class="no-data">Error loading shows</div>';
  }
}

// ---- Load & Render Annotations ----

async function loadAnnotations() {
  if (!currentShow) return;
  
  const container = document.getElementById('annotations-list');
  try {
    const annotations = currentShow.annotations || [];
    
    if (annotations.length === 0) {
      container.innerHTML = '<div class="no-data">No annotations yet. Add one below!</div>';
      return;
    }
    
    container.innerHTML = '';
    annotations.forEach((ann, idx) => {
      const el = document.createElement('div');
      el.className = 'annotation-item';
      
      const createdDate = Journal.formatDate(ann.createdDate);
      
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="flex:1">
            <div class="annotation-time">${Journal.formatTime(ann.timestamp)}</div>
            <div class="annotation-text">${ann.text.replace(/</g, '&lt;')}</div>
            <div class="annotation-date">${createdDate}</div>
          </div>
          <button class="secondary annotation-delete-btn" data-idx="${idx}" style="padding:4px 6px;font-size:11px">✕</button>
        </div>
      `;
      
      el.querySelector('.annotation-delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Delete this annotation?')) {
          try {
            const updated = await Journal.removeAnnotation(currentShow.id, ann.id);
            currentShow = updated;
            loadAnnotations();
          } catch (err) {
            alert('Error deleting annotation: ' + err.message);
          }
        }
      });
      
      container.appendChild(el);
    });
  } catch (e) {
    console.error('[popup] Failed to load annotations:', e?.message);
    container.innerHTML = '<div class="no-data">Error loading annotations</div>';
  }
}

// ---- Initialize Popup (Attach Event Listeners) ----

function initializePopup() {
  console.log('[popup] initializing journal popup...');
  
  // Initial load
  updateNowWatching();
  showJournalList();

  // ---- Tab buttons ----
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

  // ---- Add to Journal Button ----
  const addBtn = document.getElementById('btn-add-to-journal');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      // Try to ensure we have the latest title from the content script (retry if needed)
      try {
        const tab = await queryActive();
        if (!tab) {
          alert('No active tab');
          return;
        }

        // Ask content script for the current title (sendToContent will auto-inject if missing)
        const resp = await sendToContent(tab.id, { type: 'get-now-watching' });
        const title = resp && resp.title ? resp.title : null;

        if (!title) {
          // Offer manual entry as a fallback
          const manual = prompt('Could not detect the show title. Enter the title manually:');
          if (!manual || !manual.trim()) {
            alert('No title provided');
            return;
          }
          title = manual.trim();
        }

        // Persist using the detected or manually entered title
        const show = await Journal.getOrCreateShow(title);
        showJournalEntry(show);
        alert(`✓ Added "${show.title}" to your journal!`);
      } catch (e) {
        console.error('[popup] add-to-journal error:', e);
        alert('Error: ' + (e && e.message ? e.message : 'unknown'));
      }
    });
  }

  // ---- Debug Title Button (shows candidate elements for selector discovery) ----
  const debugBtn = document.getElementById('btn-debug-title');
  const debugPre = document.getElementById('debug-results');
  if (debugBtn && debugPre) {
    debugBtn.addEventListener('click', async () => {
      debugPre.style.display = 'block';
      debugPre.textContent = 'Querying page for title candidates...';

      const tab = await queryActive();
      if (!tab) {
        debugPre.textContent = 'No active tab';
        return;
      }

      const resp = await sendToContent(tab.id, { type: 'debug-title-candidates' });
      console.log('[popup] debug-title-candidates response:', resp);
      if (!resp || !resp.candidates) {
        debugPre.textContent = 'No response from content script (it may not be loaded). Try opening Netflix and then use the Add to Journal button to auto-inject.';
        return;
      }

      try {
        const out = resp.candidates.map((c, i) => `${i+1}. [${c.source}] ${c.selector ? c.selector : ''}\n   ${c.text ? c.text.replace(/\n/g, ' ') : ''}`).join('\n\n');
        debugPre.textContent = out || 'No candidates found';
      } catch (e) {
        debugPre.textContent = 'Failed to render candidates: ' + (e && e.message);
      }
    });
  }

  // ---- Back to Journal Button ----
  const backBtn = document.getElementById('btn-back-to-journal');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      showJournalList();
    });
  }

  // ---- Save Review Button ----
  const saveReviewBtn = document.getElementById('btn-save-review');
  if (saveReviewBtn) {
    saveReviewBtn.addEventListener('click', async () => {
      if (!currentShow) return;
      try {
        const reviewText = document.getElementById('review').value;
        const updated = await Journal.updateShowReview(currentShow.id, reviewText);
        currentShow = updated;
        alert('✓ Review saved!');
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });
  }

  // ---- Check Current Time Button ----
  const checkTimeBtn = document.getElementById('btn-check-time');
  const timeDisplay = document.getElementById('time-display');
  if (checkTimeBtn && timeDisplay) {
    checkTimeBtn.addEventListener('click', async () => {
      timeDisplay.textContent = 'Querying...';
      const tab = await queryActive();
      if (!tab) {
        timeDisplay.textContent = 'No active tab';
        return;
      }
      const resp = await sendToContent(tab.id, { type: 'query-current-time' });
      console.log('[popup] check-time response:', resp);
      if (!resp) {
        timeDisplay.textContent = 'No response from Netflix';
      } else if (typeof resp.currentTime === 'number') {
        timeDisplay.textContent = `⏱ ${Journal.formatTime(resp.currentTime)} (${resp.currentTime.toFixed(1)}s)`;
      } else {
        timeDisplay.textContent = 'Could not get current time';
      }
    });
  }

  // ---- Add Annotation Button ----
  const addAnnotationBtn = document.getElementById('btn-add-annotation');
  if (addAnnotationBtn) {
    addAnnotationBtn.addEventListener('click', async () => {
      if (!currentShow) return;
      
      const tab = await queryActive();
      if (!tab) {
        alert('No active tab');
        return;
      }
      
      const resp = await sendToContent(tab.id, { type: 'query-current-time' });
      if (!resp || typeof resp.currentTime !== 'number') {
        alert('Could not read current time from Netflix');
        return;
      }
      
      const annotationText = document.getElementById('annotation-input').value;
      if (!annotationText.trim()) {
        alert('Please enter a note');
        return;
      }
      
      try {
        const updated = await Journal.addAnnotation(currentShow.id, resp.currentTime, annotationText);
        currentShow = updated;
        document.getElementById('annotation-input').value = '';
        loadAnnotations();
        alert(`✓ Annotation saved at ${Journal.formatTime(resp.currentTime)}!`);
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });
  }

  // ---- View All Button ----
  const viewAllBtn = document.getElementById('btn-view-all');
  if (viewAllBtn) {
    viewAllBtn.addEventListener('click', () => {
      showJournalList();
    });
  }

  // ---- Playback Control Buttons ----
  const playBtn = document.getElementById('btn-play');
  if (playBtn) {
    playBtn.addEventListener('click', async () => {
      const tab = await queryActive();
      if (!tab) return;
      await sendToContent(tab.id, { type: 'play' });
    });
  }

  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', async () => {
      const tab = await queryActive();
      if (!tab) return;
      await sendToContent(tab.id, { type: 'pause' });
    });
  }

  const subToggleBtn = document.getElementById('btn-sub-toggle');
  if (subToggleBtn) {
    subToggleBtn.addEventListener('click', async () => {
      const tab = await queryActive();
      if (!tab) return;
      await sendToContent(tab.id, { type: 'sub-toggle' });
    });
  }

  // ---- Refresh When Popup Opened Again ----
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      console.log('[popup] popup reopened, refreshing...');
      updateNowWatching();
      if (!currentShow) {
        loadShowsList();
      } else {
        loadAnnotations();
      }
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

console.log('[popup] script loaded, waiting for DOM...');

