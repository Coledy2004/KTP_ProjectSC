// ================================================================================
// POPUP.JS - FlixLog Personal Show Tracker
// Local-only storage, no cloud sync, no friends sharing
// ================================================================================

import * as Journal from './show-journal.js';

// State
let currentShow = null; // Currently selected show for viewing/editing
let nowWatchingTitle = null; // Currently detected show on Netflix
let currentRating = 0; // Current star rating for the show being edited

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
    // Give the script time to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  } catch (err) {
    console.warn('[popup] injection failed:', err && err.message);
    return false;
  }
}

async function sendToContent(tabId, msg, retries = 5) {
  // send a message to the content script; if the receiving end does not exist,
  // try injecting the content script once and then retry a few times.
  return new Promise((resolve) => {
    const attemptSend = (attempt = 0, triedInject = false) => {
      try {
        console.log('[popup] sending message to tab', tabId, ':', msg.type, `(attempt ${attempt + 1})`);
        chrome.tabs.sendMessage(tabId, msg, (response) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message || '';
            console.warn('[popup] sendMessage runtime error:', errMsg);

            const missingReceiver = errMsg.includes('Receiving end does not exist') || errMsg.includes('Could not establish connection');

            // If there is no receiving end, try injecting once immediately (if we haven't yet)
            if (missingReceiver && !triedInject) {
              console.log('[popup] no receiver detected, attempting to inject content script...');
              ensureContentScript(tabId).then((ok) => {
                if (!ok) {
                  console.warn('[popup] injection failed');
                }
                // give the injected script more time to register and Netflix to load
                setTimeout(() => attemptSend(attempt + 1, true), 800);
              }).catch(() => {
                setTimeout(() => attemptSend(attempt + 1, true), 800);
              });
              return;
            }

            // If we've tried injection or it wasn't the missing-receiver case, retry a few times with backoff
            if (attempt < retries) {
              const delayMs = 500 + attempt * 400;
              console.log('[popup] will retry sendMessage after', delayMs, 'ms');
              setTimeout(() => attemptSend(attempt + 1, triedInject), delayMs);
              return;
            }

            console.warn('[popup] sendMessage failed after retries, giving up');
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
    };
    attemptSend(0, false);
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
  
  // Show loading state
  const titleEl = document.getElementById('movie-title');
  const epEl = document.getElementById('movie-episode');
  titleEl.textContent = 'Detecting...';
  epEl.textContent = 'Please wait';
  
  // Try multiple times with increasing delays to handle Netflix's dynamic loading
  let resp = null;
  const maxAttempts = 3;
  
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) {
      console.log(`[popup] attempt ${i + 1} of ${maxAttempts}`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between attempts
    }
    
    resp = await sendToContent(tab.id, { type: 'get-now-watching' });
    console.log('[popup] get-now-watching response:', resp);
    
    // If we got a valid title, break out of the loop
    if (resp && resp.title && resp.title !== 'Netflix') {
      break;
    }
  }
  
  if (resp && resp.title && resp.title !== 'Netflix') {
    console.log('[popup] setting title to:', resp.title);
    nowWatchingTitle = resp.title;
    titleEl.textContent = resp.title;
    epEl.textContent = resp.episode || '';
  } else {
    console.log('[popup] no valid title found after all attempts');
    nowWatchingTitle = null;
    titleEl.textContent = '—';
    
    if (!resp) {
      epEl.textContent = 'Content script not loaded';
    } else if (resp.title === 'Netflix') {
      epEl.textContent = 'No show playing - start playback';
    } else {
      epEl.textContent = 'Not playing or unable to detect';
    }
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
  
  // Set rating stars
  const rating = show.rating || 0;
  updateRatingDisplay(rating);
  
  loadAnnotations();
  loadFriends();
  
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

// ---- Star Rating Functions ----

function updateRatingDisplay(rating) {
  currentRating = rating;
  const stars = document.querySelectorAll('.star');
  const ratingText = document.getElementById('rating-text');
  
  stars.forEach((star, idx) => {
    if (idx + 1 <= rating) {
      star.classList.add('selected');
    } else {
      star.classList.remove('selected');
    }
  });
  
  if (rating > 0) {
    ratingText.textContent = `${rating} star${rating !== 1 ? 's' : ''}`;
  } else {
    ratingText.textContent = '';
  }
}

function initializeRatingStars() {
  const stars = document.querySelectorAll('.star');
  stars.forEach(star => {
    star.addEventListener('click', () => {
      const rating = parseInt(star.getAttribute('data-rating'));
      updateRatingDisplay(rating);
    });
    
    star.addEventListener('mouseenter', () => {
      const hoverRating = parseInt(star.getAttribute('data-rating'));
      stars.forEach((s, idx) => {
        if (idx + 1 <= hoverRating) {
          s.classList.add('hovered');
        } else {
          s.classList.remove('hovered');
        }
      });
    });
  });
  
  document.getElementById('star-rating').addEventListener('mouseleave', () => {
    stars.forEach(s => s.classList.remove('hovered'));
  });
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
          <div style="margin-left:8px;display:flex;flex-direction:column;align-items:flex-end">
            <button class="danger show-delete-btn" data-id="${show.id}" title="Remove show" style="padding:6px 8px;font-size:12px">✕</button>
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

      // Delete button handling
      const delBtn = el.querySelector('.show-delete-btn');
      if (delBtn) {
        delBtn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          if (!confirm(`Delete "${show.title}" from your journal?`)) return;
          try {
            await Journal.deleteShow(show.id);
            // If the deleted show was open in the entry view, go back to list
            if (currentShow && currentShow.id === show.id) {
              currentShow = null;
            }
            loadShowsList();
          } catch (err) {
            console.error('[popup] delete show failed:', err && err.message);
            alert('Error deleting show: ' + (err && err.message ? err.message : 'unknown'));
          }
        });
      }
      
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
    
    // Get current device ID to highlight own annotations
    const stored = await chrome.storage.local.get('ktp_device_id');
    const currentDeviceId = stored.ktp_device_id || '';
    
    // Get all friend nicknames
    const nicknames = await Journal.getAllFriendNicknames();
    
    container.innerHTML = '';
    annotations.forEach((ann, idx) => {
      const el = document.createElement('div');
      el.className = 'annotation-item';
      
      const createdDate = Journal.formatDate(ann.createdDate);
      const deviceId = ann.deviceId || 'unknown';
      const isOwnAnnotation = deviceId === currentDeviceId;
      let displayName = '📍 You';
      
      if (!isOwnAnnotation) {
        if (deviceId === 'unknown') {
          displayName = '👤 Unknown';
        } else {
          const nickname = nicknames[deviceId];
          if (nickname) {
            displayName = `👤 ${nickname}`;
          } else {
            displayName = `👤 ${deviceId.substring(0, 12)}...`;
          }
        }
      }
      
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="flex:1">
            <div class="annotation-time">${Journal.formatTime(ann.timestamp)} <span style="color:var(--muted);font-size:11px">${displayName}</span></div>
            <div class="annotation-text">${ann.text.replace(/</g, '&lt;')}</div>
            <div class="annotation-date">${createdDate}</div>
          </div>
          ${isOwnAnnotation ? `<button class="secondary annotation-delete-btn" data-idx="${idx}" style="padding:4px 6px;font-size:11px">✕</button>` : ''}
        </div>
      `;
      
      if (isOwnAnnotation) {
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
      }
      
      container.appendChild(el);
    });
  } catch (e) {
    console.error('[popup] Failed to load annotations:', e?.message);
    container.innerHTML = '<div class="no-data">Error loading annotations</div>';
  }
}

// ---- Load & Render Friends ----

async function loadFriends() {
  if (!currentShow) return;
  
  const container = document.getElementById('friends-list');
  try {
    const friends = currentShow.friends || [];
    
    if (friends.length === 0) {
      container.innerHTML = '<div class="no-data">No friends added yet</div>';
      return;
    }

    // Get all friend nicknames
    const nicknames = await Journal.getAllFriendNicknames();
    
    container.innerHTML = '';
    friends.forEach(friendId => {
      const el = document.createElement('div');
      el.style.padding = '10px';
      el.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
      el.style.background = 'rgba(255,255,255,0.03)';
      el.style.borderRadius = '4px';
      el.style.marginBottom = '6px';
      el.style.display = 'flex';
      el.style.justifyContent = 'space-between';
      el.style.alignItems = 'center';
      el.style.flexWrap = 'wrap';
      el.style.gap = '8px';
      
      const nickname = nicknames[friendId];
      const displayText = nickname ? `${nickname} (${friendId.substring(0, 8)}...)` : friendId;
      
      el.innerHTML = `
        <div style="word-break:break-all;font-family:${nickname ? 'inherit' : 'monospace'};font-size:12px;flex:1">👤 ${displayText}</div>
        <div style="display:flex;gap:4px">
          <button class="secondary friend-rename-btn" data-friend="${friendId}" style="padding:4px 8px;font-size:11px">✏️ Rename</button>
          <button class="secondary friend-remove-btn" data-friend="${friendId}" style="padding:4px 8px;font-size:11px">✕ Remove</button>
        </div>
      `;
      
      el.querySelector('.friend-rename-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const currentNickname = nicknames[friendId] || '';
        const newNickname = prompt(`Rename "${currentNickname || 'Friend'}" to:`, currentNickname);
        
        if (newNickname !== null) {
          try {
            await Journal.setFriendNickname(friendId, newNickname);
            loadFriends();
            loadAnnotations();
          } catch (err) {
            alert('Error renaming friend: ' + err.message);
          }
        }
      });
      
      el.querySelector('.friend-remove-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const displayName = nickname || friendId;
        if (confirm(`Remove ${displayName}?`)) {
          try {
            await Journal.removeFriend(currentShow.id, friendId);
            currentShow = await Journal.getJournal().then(j => j.find(s => s.id === currentShow.id));
            loadFriends();
          } catch (err) {
            alert('Error removing friend: ' + err.message);
          }
        }
      });
      
      container.appendChild(el);
    });
  } catch (e) {
    console.error('[popup] Failed to load friends:', e?.message);
    container.innerHTML = '<div class="no-data">Error loading friends</div>';
  }
}

// ---- Initialize Popup (Attach Event Listeners) ----

function initializePopup() {
  console.log('[popup] initializing journal popup...');
  
  // Ensure device ID exists (creates one if missing)
  Journal.ensureDeviceId().then(deviceId => {
    console.log('[popup] device ID ready:', deviceId);
  });
  
  // Initial load - delay slightly to let popup fully render
  setTimeout(() => {
    updateNowWatching();
    showJournalList();
  }, 100);

  // ---- Tab buttons ----
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

  // ---- Initialize Rating Stars ----
  initializeRatingStars();

  // ---- Add to Journal Button ----
  const addBtn = document.getElementById('btn-add-to-journal');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      addBtn.textContent = 'Adding...';
      
      try {
        // Use the title already displayed in "Now watching" section
        if (!nowWatchingTitle) {
          alert('No show currently playing. Please start playing a show on Netflix first.');
          return;
        }

        // Persist using the title from "Now watching"
        const show = await Journal.getOrCreateShow(nowWatchingTitle);
        showJournalEntry(show);
        alert(`✓ Added "${show.title}" to your journal!`);
      } catch (e) {
        console.error('[popup] add-to-journal error:', e);
        alert('Error: ' + (e && e.message ? e.message : 'unknown'));
      } finally {
        addBtn.disabled = false;
        addBtn.textContent = '+ Add to Journal';
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

  // ---- Refresh Title Button ----
  const refreshBtn = document.getElementById('btn-refresh-title');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.textContent = '⏳';
      refreshBtn.disabled = true;
      try {
        await updateNowWatching();
      } catch (e) {
        console.error('[popup] refresh-title error:', e);
      } finally {
        refreshBtn.textContent = '🔄';
        refreshBtn.disabled = false;
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
        const rating = currentRating || 0;
        const updated = await Journal.updateShowReview(currentShow.id, reviewText, rating);
        currentShow = updated;
        alert('✓ Review and rating saved!');
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

  // ---- Quick Emoji Annotation Buttons ----
  const emojiButtons = [
    { id: 'btn-emoji-laugh', emoji: '😂', label: 'Funny' },
    { id: 'btn-emoji-shock', emoji: '😲', label: 'Shocking' },
    { id: 'btn-emoji-love', emoji: '😍', label: 'Love it' },
    { id: 'btn-emoji-cry', emoji: '😢', label: 'Sad' },
    { id: 'btn-emoji-fire', emoji: '🔥', label: 'Fire' },
    { id: 'btn-emoji-mind', emoji: '🤯', label: 'Mind blown' },
    { id: 'btn-emoji-clap', emoji: '👏', label: 'Clap' },
    { id: 'btn-emoji-thumbs', emoji: '👍', label: 'Thumbs up' }
  ];

  emojiButtons.forEach(({ id, emoji, label }) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', async () => {
        if (!currentShow) {
          alert('No show selected');
          return;
        }
        
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
        
        try {
          const updated = await Journal.addAnnotation(currentShow.id, resp.currentTime, emoji);
          currentShow = updated;
          loadAnnotations();
          // Silent feedback - no alert, just a brief visual change
          btn.style.opacity = '0.5';
          setTimeout(() => { btn.style.opacity = '1'; }, 200);
        } catch (e) {
          alert('Error: ' + e.message);
        }
      });
    }
  });

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

  // ---- Settings Button ----
  const settingsBtn = document.getElementById('btn-settings');
  const settingsCard = document.getElementById('settings-card');
  const backFromSettingsBtn = document.getElementById('btn-back-from-settings');
  const showUserIdBtn = document.getElementById('btn-show-user-id');
  const copyUserIdBtn = document.getElementById('btn-copy-user-id');
  const userIdDisplay = document.getElementById('user-id-display');

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      document.getElementById('journal-list-card').style.display = 'none';
      document.getElementById('journal-entry-card').style.display = 'none';
      settingsCard.style.display = 'block';
      userIdDisplay.textContent = '—';
    });
  }

  if (backFromSettingsBtn) {
    backFromSettingsBtn.addEventListener('click', () => {
      settingsCard.style.display = 'none';
      showJournalList();
    });
  }

  if (showUserIdBtn) {
    showUserIdBtn.addEventListener('click', async () => {
      try {
        const journal = await Journal.getJournal();
        let userId = null;

        // Look for a stored user ID in local storage
        const stored = await chrome.storage.local.get('ktp_device_id');
        if (stored.ktp_device_id) {
          userId = stored.ktp_device_id;
        } else {
          // Generate a new device ID if one doesn't exist
          userId = 'device_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
          await chrome.storage.local.set({ ktp_device_id: userId });
        }

        userIdDisplay.textContent = userId;
      } catch (e) {
        userIdDisplay.textContent = 'Error: ' + (e && e.message ? e.message : 'unknown');
      }
    });
  }

  if (copyUserIdBtn) {
    copyUserIdBtn.addEventListener('click', async () => {
      const text = userIdDisplay.textContent;
      if (text === '—') {
        alert('Please click "Show User ID" first');
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        copyUserIdBtn.textContent = '✓ Copied!';
        setTimeout(() => {
          copyUserIdBtn.textContent = '📋 Copy ID';
        }, 2000);
      } catch (e) {
        alert('Error copying to clipboard: ' + (e && e.message ? e.message : 'unknown'));
      }
    });
  }

  // ---- Add Friend Button ----
  const addFriendBtn = document.getElementById('btn-add-friend');
  const friendIdInput = document.getElementById('friend-id-input');
  
  if (addFriendBtn) {
    addFriendBtn.addEventListener('click', async () => {
      if (!currentShow) {
        alert('No show selected');
        return;
      }

      const friendId = friendIdInput.value.trim();
      if (!friendId) {
        alert('Please enter a device ID');
        return;
      }

      // Get current device ID
      const stored = await chrome.storage.local.get('ktp_device_id');
      const currentDeviceId = stored.ktp_device_id || '';
      
      if (friendId === currentDeviceId) {
        alert('You cannot add yourself as a friend');
        return;
      }

      try {
        const updated = await Journal.addFriend(currentShow.id, friendId);
        currentShow = updated;
        friendIdInput.value = '';
        loadFriends();
        alert(`✓ Added friend!`);
      } catch (e) {
        alert('Error: ' + (e && e.message ? e.message : 'unknown'));
      }
    });

    // Also allow Enter key to add friend
    if (friendIdInput) {
      friendIdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          addFriendBtn.click();
        }
      });
    }
  }

  // ---- Export Show Button ----
  const exportShowBtn = document.getElementById('btn-export-show');
  if (exportShowBtn) {
    exportShowBtn.addEventListener('click', async () => {
      if (!currentShow) {
        alert('No show selected');
        return;
      }

      try {
        const jsonData = await Journal.exportShow(currentShow.id);
        
        // Copy to clipboard
        await navigator.clipboard.writeText(jsonData);
        
        exportShowBtn.textContent = '✓ Copied to clipboard!';
        setTimeout(() => {
          exportShowBtn.textContent = '📤 Export My Reactions';
        }, 2000);

        alert('✓ Your reactions exported and copied!\n\nShare this with your friends so they can see your reactions.');
      } catch (e) {
        alert('Error: ' + (e && e.message ? e.message : 'unknown'));
      }
    });
  }

  // ---- Import Show Button ----
  const importShowBtn = document.getElementById('btn-import-show');
  if (importShowBtn) {
    importShowBtn.addEventListener('click', async () => {
      if (!currentShow) {
        alert('No show selected');
        return;
      }

      const jsonData = prompt('Paste your friend\'s exported reaction data here:');
      if (!jsonData || !jsonData.trim()) {
        return;
      }

      try {
        const result = await Journal.importShowAnnotations(currentShow.id, jsonData);
        currentShow = result.show;
        loadAnnotations();
        alert(`✓ Imported ${result.addedCount} reaction${result.addedCount !== 1 ? 's' : ''} from your friend!`);
      } catch (e) {
        alert('Error: ' + (e && e.message ? e.message : 'unknown'));
      }
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