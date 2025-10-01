// Netflix-optimized content script for title detection
console.log('Netflix KTP content script loaded on', location.href);

let previousTitle = null;
let titleCheckInterval = null;
let currentMovieId = null;

// Netflix-specific title extraction methods
function getNetflixTitle() {
  try {
    // Method 1: Check document title (most reliable)
    const docTitle = document.title;
    if (docTitle && docTitle !== 'Netflix' && !docTitle.includes('Browse')) {
      const cleanTitle = docTitle.replace(' - Netflix', '').replace('Netflix', '').trim();
      if (cleanTitle && cleanTitle !== previousTitle) {
        return cleanTitle;
      }
    }

    // Method 2: Look for video player overlay elements
    const playerOverlaySelectors = [
      '[data-uia="video-title"]',
      '.video-title',
      '[data-uia="title-card-title"]',
      '.title-card-title',
      'h3[data-uia="episode-title"]',
      'h1[data-uia="video-title"]',
      '.previewModal--player-titleTreatment-logo img[alt]',
      '.watch-video--title-text',
      '.watch-video--episode-title'
    ];

    for (const selector of playerOverlaySelectors) {
      const element = document.querySelector(selector);
      if (element) {
        let title = element.innerText || element.textContent;
        if (element.tagName === 'IMG' && element.alt) {
          title = element.alt;
        }
        if (title && title.trim()) {
          return title.trim();
        }
      }
    }

    // Method 3: Extract from URL pattern
    const urlMatch = location.href.match(/\/watch\/(\d+)/);
    if (urlMatch) {
      const movieId = urlMatch[1];
      if (movieId !== currentMovieId) {
        currentMovieId = movieId;
        // Try to get title from Netflix API or page metadata
        const metaTitle = document.querySelector('meta[property="og:title"]');
        if (metaTitle && metaTitle.content && metaTitle.content !== 'Netflix') {
          return metaTitle.content.replace(' | Netflix', '').trim();
        }
      }
    }

    // Method 4: Look for any visible title text in video area
    const videoContainer = document.querySelector('.watch-video') || 
                          document.querySelector('[data-uia="video-canvas"]') ||
                          document.querySelector('.NFPlayer');
    
    if (videoContainer) {
      if(currentMovieId === "Privacy Preference Center"){
        currentMovieId = previousTitle;
      }
      const titleElements = videoContainer.querySelectorAll('h1, h2, h3, [class*="title"], [data-uia*="title"]');
      for (const el of titleElements) {
        const text = el.innerText || el.textContent;
        if (text && text.trim() && text.length > 2 && text.length < 200) {
          return text.trim();
        }
      }
    }

    // Method 5: Fallback to any prominent heading on the page
    const headings = document.querySelectorAll('h1, h2');
    for (const heading of headings) {
       if(currentMovieId === "Privacy Preference Center"){
        currentMovieId = previousTitle;
      }
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
    if (!location.href.includes('/watch/') && !location.href.includes('netflix.com')) {
      return;
    }

    const title = getNetflixTitle();
    
    if (title && title !== previousTitle) {
      console.log("Netflix - Now watching:", title);
      
      // Send to background script if available
      chrome.runtime.sendMessage({
        action: 'netflix-title-changed',
        title: title,
        url: location.href,
        timestamp: Date.now(),
        movieId: currentMovieId
      }).catch(err => console.log('Background script not available:', err.message));
      
      previousTitle = title;
      return title;
    }
    
    return title;
  } catch (error) {
    console.error('Error in checkTitle:', error);
    return null;
  }
}

// Start monitoring function
function startNetflixMonitoring(intervalMs = 3000) {
  if (titleCheckInterval) {
    clearInterval(titleCheckInterval);
  }
  
  console.log('Starting Netflix title monitoring...');
  titleCheckInterval = setInterval(checkTitle, intervalMs);
  
  // Check immediately
  setTimeout(checkTitle, 1000);
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

// Message listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try {
    if (msg && msg.action === 'get-netflix-title') {
      const title = checkTitle();
      sendResponse({title: title, url: location.href, movieId: currentMovieId});
    } else if (msg && msg.action === 'start-netflix-monitoring') {
      startNetflixMonitoring();
      sendResponse({status: 'Netflix monitoring started'});
    } else if (msg && msg.action === 'stop-netflix-monitoring') {
      stopMonitoring();
      sendResponse({status: 'Netflix monitoring stopped'});
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({error: error.message});
  }
});

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

function readNowWatching() {
  const titleEl = document.querySelector('.video-title h4, .ellipsize-text');
  const episodeEl = document.querySelector('.previewModal--player-titleTreatment-v2 h4, .player-title .ellipsize-text, .episode-title');
  return {
    title: titleEl ? titleEl.innerText.trim() : null,
    episode: episodeEl ? episodeEl.innerText.trim() : null
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'get-now-watching') {
    sendResponse(readNowWatching());
  } else if (msg.type === 'play') {
    const v = findVideo(); if (v) v.play(); sendResponse({ok: !!v});
  } else if (msg.type === 'pause') {
    const v = findVideo(); if (v) v.pause(); sendResponse({ok: !!v});
  } else if (msg.type === 'sub-toggle') {
    const ok = toggleSubtitles(); sendResponse({ok});
  } else if (msg.type === 'sub-next') {
    const ok = nextSubtitle(); sendResponse({ok});
  } else if (msg.type === 'inspect-frames') {
    sendResponse(inspectFrames());
  }
});