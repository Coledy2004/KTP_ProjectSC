// Netflix-optimized content script for title detection
console.log('Netflix KTP content script loaded on', location.href);

let previousTitle = null;
let titleCheckInterval = null;
let currentMovieId = null;

// Netflix-specific title extraction methods
function getNetflixTitle() {
  try {
    // Method 1: Check og:title meta tag (most reliable)
    const metaTitle = document.querySelector('meta[property="og:title"]');
    if (metaTitle && metaTitle.content && metaTitle.content !== 'Netflix') {
      return metaTitle.content.replace(' | Netflix', '').replace(' - Netflix', '').trim();
    }

    // Method 2: Check document title as fallback
    const docTitle = document.title;
    if (docTitle && docTitle !== 'Netflix' && !docTitle.includes('Browse')) {
      const cleanTitle = docTitle.replace(' - Netflix', '').replace('Netflix', '').trim();
      if (cleanTitle && cleanTitle.length > 0) {
        return cleanTitle;
      }
    }

    // Method 3: Look for video player overlay elements with improved selectors
    const playerOverlaySelectors = [
      'h1[data-uia="video-title"]',
      'span[data-uia="video-title"]',
      '[data-uia="video-title-container"] h1',
      '[data-uia="video-title-container"] span',
      '.player-title-card h1',
      '.player-title-card span',
      'h3[data-uia="episode-title"]',
      'span[data-uia="episode-title"]'
    ];

    for (const selector of playerOverlaySelectors) {
      const element = document.querySelector(selector);
      if (element) {
        let title = element.innerText || element.textContent;
        if (title && title.trim() && title.trim().length > 0) {
          return title.trim();
        }
      }
    }

    // Method 4: Extract from URL pattern and update movie ID
    const urlMatch = location.href.match(/\/watch\/(\d+)/);
    if (urlMatch) {
      const movieId = urlMatch[1];
      if (movieId !== currentMovieId) {
        currentMovieId = movieId;
      }
    }

    // Method 5: Look for any visible title text in video area
    const videoContainer = document.querySelector('[data-uia="video-canvas"]') || 
                          document.querySelector('.NFPlayer') ||
                          document.querySelector('.watch-video');
    
    if (videoContainer) {
      const titleElements = videoContainer.querySelectorAll('h1, h2, h3');
      for (const el of titleElements) {
        const text = el.innerText || el.textContent;
        if (text && text.trim() && text.length > 2 && text.length < 200 && !text.includes('Netflix')) {
          return text.trim();
        }
      }
    }

    // Method 6: Fallback to any prominent heading on the page
    const headings = document.querySelectorAll('h1, h2');
    for (const heading of headings) {
      const text = heading.innerText || heading.textContent;
      if (text && text.trim() && 
          !text.includes('Netflix') && 
          !text.includes('Browse') &&
          text.length > 2 && text.length < 200) {
        return text.trim();
      }
    }

    return null;
  } catch (error) {
    console.error('Error extracting Netflix title:', error);
    return null;
  }
}

// Enhanced title checking with Netflix-specific logic
function checkTitle() {
  try {
    // Only run on Netflix watch pages
    if (!location.href.includes('netflix.com/watch')) {
      return null;
    }

    const title = getNetflixTitle();
    
    if (title && title !== previousTitle) {
      console.log("Netflix - Now watching:", title);
      previousTitle = title;
      return title;
    }
    
    return previousTitle;
  } catch (error) {
    console.error('Error in checkTitle:', error);
    return null;
  }
}

// Start monitoring function
function startNetflixMonitoring(intervalMs = 2000) {
  if (titleCheckInterval) {
    clearInterval(titleCheckInterval);
  }
  
  console.log('Starting Netflix title monitoring...');
  // Check immediately
  checkTitle();
  titleCheckInterval = setInterval(checkTitle, intervalMs);
}

// Stop monitoring
function stopMonitoring() {
  if (titleCheckInterval) {
    clearInterval(titleCheckInterval);
    titleCheckInterval = null;
    console.log('Netflix monitoring stopped');
  }
}

// Netflix SPA navigation listener
let currentPath = location.pathname;
function handleNavigationChange() {
  if (location.pathname !== currentPath) {
    currentPath = location.pathname;
    console.log('Netflix navigation change detected:', location.href);
    
    // Reset state on navigation
    previousTitle = null;
    currentMovieId = null;
    
    // Start monitoring if on watch page
    if (location.pathname.includes('/watch/')) {
      setTimeout(() => startNetflixMonitoring(), 2000);
    } else {
      stopMonitoring();
    }
  }
}

// Monitor for Netflix SPA navigation
setInterval(handleNavigationChange, 1000);

// Enhanced observer for Netflix's dynamic content
function createNetflixObserver() {
  const observer = new MutationObserver((mutations) => {
    let shouldCheckTitle = false;
    
    mutations.forEach((mutation) => {
      // Look for changes in video player area or title elements
      if (mutation.type === 'childList' || mutation.type === 'characterData') {
        const target = mutation.target;
        
        // Check if the change affects video player or title areas
        if (target.matches && (
          target.matches('[data-uia*="video"]') ||
          target.matches('[data-uia*="title"]') ||
          target.matches('.watch-video') ||
          target.matches('.NFPlayer') ||
          target.classList.contains('video-title')
        )) {
          shouldCheckTitle = true;
        }
        
        // Also check if any added nodes contain title information
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE && (
            node.querySelector('[data-uia*="title"]') ||
            node.querySelector('h1, h2, h3') ||
            node.matches('h1, h2, h3')
          )) {
            shouldCheckTitle = true;
          }
        });
      }
    });
    
    if (shouldCheckTitle) {
      setTimeout(checkTitle, 500);
    }
  });
  
  observer.observe(document, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  return observer;
}

// Helper to format seconds to mm:ss
function formatTime(sec) {
  if (!isFinite(sec)) return '00:00';
  const s = Math.floor(sec % 60).toString().padStart(2,'0');
  const m = Math.floor(sec/60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

// Initialize based on current page
let observer = null;

function initialize() {
  observer = createNetflixObserver();
  
  if (location.pathname.includes('/watch/')) {
    // On watch page - start monitoring
    setTimeout(() => startNetflixMonitoring(), 2000);
  } else {
    // On browse page - just set up navigation watching
    console.log('Netflix extension ready - waiting for video playback...');
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Cleanup
window.addEventListener('beforeunload', () => {
  stopMonitoring();
  if (observer) {
    observer.disconnect();
  }
});
function findVideo() {
  // Netflix uses <video> elements for playback; attempt to find the main one
  const v = document.querySelector('video');
  return v || null;
}

// DEBUG: Log Netflix UI structure for progress bar
function debugNetflixUI() {
  console.log('[content-debug] === Netflix UI Structure ===');
  
  // Find player
  const playerArea = document.querySelector('[data-uia="video-canvas"]') || 
                    document.querySelector('.NFPlayer') ||
                    document.querySelector('.watch-video');
  console.log('[content-debug] Player area:', playerArea ? 'found' : 'not found', playerArea);
  
  // Find all progress-related elements
  const allProgress = document.querySelectorAll('[class*="progress"], [class*="Progress"], [role="slider"]');
  console.log('[content-debug] Progress-related elements found:', allProgress.length);
  allProgress.forEach((el, i) => {
    console.log(`  [${i}]`, {
      tag: el.tagName,
      classes: el.className,
      role: el.getAttribute('role'),
      dataUia: el.getAttribute('data-uia'),
      rect: el.getBoundingClientRect()
    });
  });
  
  // Find slider specifically
  const slider = document.querySelector('[role="slider"]');
  if (slider) {
    console.log('[content-debug] Slider found:', {
      parent: slider.parentElement?.className,
      siblings: Array.from(slider.parentElement?.children || []).map(c => c.className)
    });
  }
}

// Expose for manual testing
window.ktpDebugNetflixUI = debugNetflixUI;

function readNowWatching() {
  // Try multiple selectors for Netflix title
  let title = null;
  let episode = null;
  
  // Method 1: og:title meta tag (most reliable)
  const metaTitle = document.querySelector('meta[property="og:title"]');
  if (metaTitle && metaTitle.content && metaTitle.content !== 'Netflix') {
    title = metaTitle.content.replace(' | Netflix', '').replace(' - Netflix', '').trim();
  }
  
  // Method 2: Try document title
  if (!title) {
    const docTitle = document.title;
    if (docTitle && docTitle !== 'Netflix') {
      title = docTitle.replace(' - Netflix', '').trim();
    }
  }
  
  // Method 3: Look for visible title elements
  if (!title) {
    const titleSelectors = [
      'h1[data-uia="video-title"]',
      'span[data-uia="video-title"]',
      '[data-uia="video-title-container"] h1',
      '.player-title h1',
      'h1.video-title'
    ];
    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.innerText || el.textContent;
        if (text && text.trim()) {
          title = text.trim();
          break;
        }
      }
    }
  }
  
  // Try to find episode info
  const episodeSelectors = [
    'h3[data-uia="episode-title"]',
    'span[data-uia="episode-title"]',
    '.episode-title'
  ];
  for (const sel of episodeSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = el.innerText || el.textContent;
      if (text && text.trim()) {
        episode = text.trim();
        break;
      }
    }
  }
  
  return {
    title: title,
    episode: episode || ''
  };
}

function toggleSubtitles() {
  // naive toggle: toggle track modes
  const v = findVideo();
  if (!v) return false;
  if (v.textTracks && v.textTracks.length) {
    for (let i=0;i<v.textTracks.length;i++) {
      v.textTracks[i].mode = v.textTracks[i].mode === 'showing' ? 'hidden' : 'showing';
    }
    return true;
  }
  return false;
}

function nextSubtitle() {
  const v = findVideo();
  if (!v || !v.textTracks) return false;
  const tracks = v.textTracks;
  let enabled = -1;
  for (let i=0;i<tracks.length;i++) if (tracks[i].mode === 'showing') enabled = i;
  const next = (enabled + 1) % tracks.length;
  for (let i=0;i<tracks.length;i++) tracks[i].mode = 'hidden';
  tracks[next].mode = 'showing';
  return true;
}

function inspectFrames() {
  // show how many iframes on the page
  const frames = document.querySelectorAll('iframe');
  console.log('KTP: found', frames.length, 'iframes');
  return {count: frames.length};
}

// Create a small overlay button that the user can click to perform a seek (user gesture)
function createSeekOverlay(targetTimeSeconds) {
  // Remove existing overlay if any
  const existing = document.getElementById('ktp-seek-overlay');
  if (existing) existing.remove();

  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'ktp-seek-overlay';
  overlay.style.position = 'fixed';
  overlay.style.right = '20px';
  overlay.style.bottom = '100px';
  overlay.style.background = 'rgba(229, 9, 20, 0.98)';
  overlay.style.color = '#fff';
  overlay.style.padding = '16px 20px';
  overlay.style.borderRadius = '8px';
  overlay.style.zIndex = '2147483647';
  overlay.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5)';
  overlay.style.fontFamily = 'Netflix Sans, Arial, sans-serif';
  overlay.style.minWidth = '200px';
  overlay.style.textAlign = 'center';

  // Create text
  const text = document.createElement('div');
  text.style.marginBottom = '12px';
  text.style.fontSize = '14px';
  text.innerHTML = `<strong>Jump to ${formatTime(targetTimeSeconds)}?</strong><br><small>Click below to confirm</small>`;

  // Create button
  const btn = document.createElement('button');
  btn.textContent = '✓ Confirm Seek';
  btn.style.padding = '8px 16px';
  btn.style.background = '#fff';
  btn.style.color = '#e50914';
  btn.style.border = 'none';
  btn.style.borderRadius = '4px';
  btn.style.fontWeight = 'bold';
  btn.style.cursor = 'pointer';
  btn.style.fontSize = '13px';
  btn.style.width = '100%';
  btn.style.marginBottom = '8px';
  btn.addEventListener('click', (ev) => {
    console.log('[content] User confirmed seek overlay click');
    ev.stopPropagation();
    ev.preventDefault();
    
    // This is a real user gesture - Netflix will allow this
    const v = findVideo();
    if (v) {
      try {
        v.currentTime = targetTimeSeconds;
        console.log('[content] User-gesture seek succeeded:', targetTimeSeconds);
        overlay.remove();
      } catch (e) {
        console.error('[content] User-gesture seek failed:', e?.message);
        alert('Seek failed: ' + (e?.message || 'unknown error'));
      }
    } else {
      alert('Video element not found');
    }
  });

  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ Cancel';
  closeBtn.style.padding = '6px 12px';
  closeBtn.style.background = 'rgba(255,255,255,0.2)';
  closeBtn.style.color = '#fff';
  closeBtn.style.border = 'none';
  closeBtn.style.borderRadius = '4px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.fontSize = '12px';
  closeBtn.style.width = '100%';
  closeBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    overlay.remove();
  });

  // Assemble
  overlay.appendChild(text);
  overlay.appendChild(btn);
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);

  // Auto-remove after 30 seconds
  setTimeout(() => {
    const el = document.getElementById('ktp-seek-overlay');
    if (el) el.remove();
  }, 30000);

  console.log('[content] Seek overlay created for time:', targetTimeSeconds);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try {
    console.log('[content] message received:', msg);
    if (!msg || !msg.type) {
      console.warn('[content] Invalid message received', msg);
      return;
    }
    if (msg.type === 'get-now-watching') {
      const result = readNowWatching();
      console.log('[content] get-now-watching result:', result);
      sendResponse(result);
    } else if (msg.type === 'query-current-time') {
      const v = findVideo();
      sendResponse({currentTime: v ? v.currentTime : null});
    } else if (msg.type === 'play') {
      console.log('[content] play message received');
      const v = findVideo();
      if (v) {
        console.log('[content] found video element, calling play()');
        v.play().catch(e => console.error('[content] play() failed:', e));
      } else {
        console.log('[content] no video element found');
      }
      sendResponse({ok: !!v});
    } else if (msg.type === 'pause') {
      console.log('[content] pause message received');
      const v = findVideo();
      if (v) {
        console.log('[content] found video element, calling pause()');
        v.pause();
      } else {
        console.log('[content] no video element found');
      }
      sendResponse({ok: !!v});
    } else if (msg.type === 'seek') {
      try {
        const v = findVideo();
        let time = (typeof msg.time === 'number' && isFinite(msg.time)) ? msg.time : null;
        if (!v || time === null) {
          console.log('[content] seek: no video or invalid time');
          sendResponse({ok:false, reason: 'no-video-or-invalid-time'});
          return;
        }

        console.log('[content] seek request: target time =', time, 'video duration =', v.duration);

        // Clamp to seekable range
        try {
          if (v.seekable && v.seekable.length) {
            const start = v.seekable.start(0);
            const end = v.seekable.end(v.seekable.length - 1);
            console.log('[content] seek: seekable range', start, '-', end);
            if (time < start) time = start;
            if (time > end) time = end;
          }
        } catch (e) {
          console.warn('[content] seekable check threw:', e && e.message);
        }

        // STRATEGY 1: Try Netflix's internal player API
        try {
          console.log('[content] seek: attempting Netflix player API');
          
          // Method 1a: Try the new player structure
          const playerApp = window.netflix?.appContext?.state?.playerApp;
          if (playerApp?.getAPI) {
            const api = playerApp.getAPI();
            if (api?.videoPlayer?.getAllPlayerSessionIds) {
              const sessionIds = api.videoPlayer.getAllPlayerSessionIds();
              if (sessionIds?.length) {
                const vp = api.videoPlayer.getVideoPlayerBySessionId(sessionIds[0]);
                if (vp?.seek) {
                  console.log('[content] found netflix player API, calling seek');
                  vp.seek(time * 1000); // Netflix API expects milliseconds
                  console.log('[content] KTP seek: used netflix.api.seek (ms) ->', time * 1000);
                  sendResponse({ok:true, method:'netflix-api-ms'});
                  return;
                }
              }
            }
          }
          
          // Method 1b: Try alternate API path
          const app = window.netflix?.appContext?.state?.playerApp;
          if (app?.getState?.()) {
            const state = app.getState();
            console.log('[content] player state keys:', Object.keys(state));
          }
        } catch (e) {
          console.warn('[content] Netflix API attempt 1 failed:', e?.message);
        }

        // STRATEGY 2: Use a hybrid approach - set currentTime while video is playing
        // Netflix's error happens on PAUSE after seek, so try to keep video playing
        try {
          console.log('[content] seek: attempting hybrid play+seek');
          const wasPlaying = !v.paused;
          console.log('[content] video was playing:', wasPlaying);
          
          // Ensure video is playing
          if (v.paused) {
            v.play().catch(e => console.warn('[content] play() failed:', e?.message));
            // Small delay for play to register
            setTimeout(() => {}, 50);
          }
          
          // Now set currentTime
          v.currentTime = time;
          console.log('[content] KTP seek: used video.currentTime (while playing) ->', time);
          sendResponse({ok:true, method:'video.currentTime-playing'});
          return;
        } catch (e) {
          console.warn('[content] Hybrid play+seek failed:', e?.message);
        }

        // STRATEGY 3: Try direct currentTime (may trigger error, but worth trying)
        try {
          console.log('[content] seek: attempting direct video.currentTime');
          v.currentTime = time;
          console.log('[content] KTP seek: used video.currentTime ->', time);
          sendResponse({ok:true, method:'video.currentTime'});
          return;
        } catch (e) {
          console.warn('[content] Direct currentTime failed:', e?.message);
        }

        // STRATEGY 4: Try progress bar click (even though Netflix blocks it)
        try {
          const duration = v.duration || 1;
          const pct = Math.max(0, Math.min(1, time / duration));
          console.log('[content] seek: attempting progress bar click at', (pct * 100).toFixed(1), '%');
          
          const progressSelectors = [
            '.player-progress-bar',
            '[data-uia="player-progress-bar"]',
            '.PlayerProgressBar--progressBar',
            '.progress-bar-fill',
            '.progress-bar',
            '[role="slider"]',
            '.slider'
          ];
          
          let progressEl = null;
          for (const s of progressSelectors) {
            const found = document.querySelector(s);
            if (found) { 
              progressEl = found;
              console.log('[content] found progress bar:', s);
              break; 
            }
          }
          
          if (progressEl) {
            const rect = progressEl.getBoundingClientRect();
            const x = rect.left + (pct * rect.width);
            const y = rect.top + rect.height / 2;
            
            console.log('[content] clicking progress bar at', {x, y, pct});
            
            // Try trusted event (if running in trusted context)
            const evt = new MouseEvent('click', {
              clientX: x, 
              clientY: y, 
              bubbles: true, 
              cancelable: false,
              view: window
            });
            progressEl.click?.(); // Try native click first
            progressEl.dispatchEvent(evt);
            
            console.log('[content] KTP seek: progress bar click attempted');
            sendResponse({ok:true, method:'progress-click'});
            return;
          }
        } catch (e) {
          console.warn('[content] Progress click failed:', e?.message);
        }

        // STRATEGY 5: Show overlay for manual user seek
        console.log('[content] all automated strategies failed, showing manual seek overlay');
        try {
          createSeekOverlay(time);
          sendResponse({ok:false, reason:'user-gesture-required', hint:'overlay_shown'});
        } catch (e) {
          console.warn('[content] Failed to create overlay:', e?.message);
          sendResponse({ok:false, reason:'all-strategies-failed'});
        }
        return;
      } catch (err) {
        console.error('[content] seek handler error:', err);
        sendResponse({ok:false, reason: err?.message});
        return;
      }
    } else if (msg.type === 'sub-toggle') {
      console.log('[content] sub-toggle message received');
      const ok = toggleSubtitles();
      console.log('[content] toggleSubtitles result:', ok);
      sendResponse({ok});
    } else if (msg.type === 'sub-next') {
      console.log('[content] sub-next message received');
      const ok = nextSubtitle();
      console.log('[content] nextSubtitle result:', ok);
      sendResponse({ok});
    } else if (msg.type === 'inspect-frames') {
      console.log('[content] inspect-frames message received');
      sendResponse(inspectFrames());
    } else {
      console.log('[content] unknown message type:', msg.type);
      sendResponse({error: 'unknown message type'});
    }
  } catch (error) {
    console.error('[content] Error handling message:', error);
    sendResponse({error: error.message});
  }
});