// ================================================================================
// CONTENT.JS - Netflix Title Detection (Optimized)
// Runs on Netflix pages to extract show/movie titles
// ================================================================================

console.log('='.repeat(80));
console.log('[content] *** CONTENT SCRIPT IS LOADING ***');
console.log('[content] Location:', location.href);
console.log('[content] Timestamp:', new Date().toISOString());
console.log('[content] Document ready state:', document.readyState);
console.log('='.repeat(80));

// ========== REGISTER MESSAGE LISTENER IMMEDIATELY ==========
// This is the FIRST thing we do, before anything else
console.log('[content] Registering message listener...');

try {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[content] Message received:', message?.type);
    
    (async () => {
      try {
        if (message?.type === 'ping') {
          console.log('[content] Responding to ping');
          sendResponse({ pong: true, timestamp: Date.now() });
        }
        else if (message?.type === 'get-now-watching') {
          const info = await getCurrentWatching();
          console.log('[content] Responding with watching info:', info);
          sendResponse(info);
        }
        else if (message?.type === 'debug-title-candidates') {
          const debug = debugTitleCandidates();
          console.log('[content] Responding with debug candidates:', debug.candidates.length);
          sendResponse(debug);
        }
        else if (message?.type === 'query-current-time') {
          const video = getVideoElement();
          console.log('[content] Responding with currentTime:', video?.currentTime);
          sendResponse({ 
            currentTime: video ? video.currentTime : null,
            duration: video ? video.duration : null
          });
        }
        else if (message?.type === 'play') {
          const video = getVideoElement();
          if (video) {
            video.play().catch(e => console.warn('[content] play() error:', e?.message));
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'No video element' });
          }
        }
        else if (message?.type === 'pause') {
          const video = getVideoElement();
          if (video) {
            video.pause();
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'No video element' });
          }
        }
        else {
          console.log('[content] Unknown message type:', message?.type);
          sendResponse({ error: 'Unknown message type' });
        }
      } catch (err) {
        console.error('[content] Handler error:', err?.message);
        sendResponse({ error: err?.message });
      }
    })();
    
    // Return true to indicate we'll send response asynchronously
    return true;
  });
  
  console.log('[content] Message listener registered successfully');
} catch (err) {
  console.error('[content] Failed to register listener:', err?.message);
}

// ========== HELPER FUNCTIONS ==========

/**
 * Extract clean title from Netflix page
 * Uses multiple strategies in priority order
 */
function extractTitle() {
  console.log('[content] extractTitle called');
  console.log('[content] Document ready state:', document.readyState);
  console.log('[content] Body innerHTML length:', document.body?.innerHTML?.length || 0);
  
  // STRATEGY 1: Structured metadata (most reliable)
  try {
    const metaSelectors = [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'meta[name="title"]'
    ];
    
    for (const selector of metaSelectors) {
      const meta = document.querySelector(selector);
      console.log(`[content] Checking ${selector}:`, meta?.content || 'not found');
      if (meta && meta.content && isValidTitle(meta.content)) {
        const cleaned = cleanupTitle(meta.content);
        console.log('[content] ✓ Found title in meta tag:', cleaned);
        return cleaned;
      }
    }
  } catch (e) {
    console.warn('[content] Meta tag check error:', e?.message);
  }
  
  // STRATEGY 2: High priority explicit Netflix selectors
  const highPrioritySelectors = [
    'h1[data-uia="video-title"]',
    '[data-uia="video-title-container"] h1',
    '.player-title-card h1',
    '.player-title',
    '.previewModal--player-title',
    '.previewModalTitle',
    '.title-name'
  ];
  
  console.log('[content] Trying high-priority selectors...');
  for (const selector of highPrioritySelectors) {
    try {
      const el = document.querySelector(selector);
      const text = el ? (el.innerText || el.textContent || '').trim() : null;
      console.log(`[content] ${selector}:`, text || 'not found', el ? `(visible: ${isVisible(el)})` : '');
      
      if (el && isVisible(el) && text && isValidTitle(text)) {
        const cleaned = cleanupTitle(text);
        console.log('[content] ✓ Found title with high-priority selector:', cleaned);
        return cleaned;
      }
    } catch (err) {
      console.warn(`[content] Error with selector ${selector}:`, err?.message);
    }
  }
  
  // STRATEGY 3: Player-area scan (search within player containers)
  const playerContainers = [
    '[data-uia="video-canvas"]',
    '.nf-player-container',
    '.NFPlayer',
    '.watch-video'
  ];
  
  console.log('[content] Scanning player areas...');
  for (const containerSelector of playerContainers) {
    try {
      const container = document.querySelector(containerSelector);
      if (!container) {
        console.log(`[content] Container ${containerSelector}: not found`);
        continue;
      }
      
      console.log(`[content] Scanning inside ${containerSelector}...`);
      
      // Look for divs and spans that might contain the title
      // Netflix often uses plain divs for the title display
      const candidates = Array.from(container.querySelectorAll('div, span'))
        .filter(el => {
          const text = (el.innerText || el.textContent || '').trim();
          // Look for text that contains a timestamp followed by text
          // or just text without timestamp
          return text.length > 3 && text.length < 200 && isVisible(el);
        });
      
      console.log(`[content] Found ${candidates.length} candidate elements in ${containerSelector}`);
      
      // Try to find elements with timestamp + title pattern
      for (const el of candidates) {
        const text = (el.innerText || el.textContent || '').trim();
        
        // Check if it matches timestamp pattern
        if (/^\d{1,2}:\d{2}(?::\d{2})?\s+\S/.test(text)) {
          const cleaned = cleanupTitle(text);
          console.log(`[content] Found timestamp+title pattern: "${text}" -> cleaned: "${cleaned}"`);
          
          if (isValidTitle(cleaned) && cleaned.length > 2) {
            console.log('[content] ✓ Found title in player area (with timestamp):', cleaned);
            return cleaned;
          }
        }
      }
      
      // Also try regular headings
      const headings = Array.from(container.querySelectorAll('h1, h2, h3'))
        .filter(el => isVisible(el));
      
      for (const heading of headings) {
        const text = (heading.innerText || heading.textContent || '').trim();
        const cleaned = cleanupTitle(text);
        console.log(`[content] Checking heading: "${text}" -> cleaned: "${cleaned}"`);
        
        if (isValidTitle(cleaned)) {
          console.log('[content] ✓ Found title in player area heading:', cleaned);
          return cleaned;
        }
      }
    } catch (err) {
      console.warn(`[content] Error scanning ${containerSelector}:`, err?.message);
    }
  }
  
  // STRATEGY 4: Document title fallback
  try {
    if (document.title && isValidTitle(document.title)) {
      const cleaned = cleanupTitle(document.title);
      console.log('[content] Using document.title as fallback:', cleaned);
      return cleaned;
    }
  } catch (e) {
    console.warn('[content] Document title check error:', e?.message);
  }
  
  // STRATEGY 5: URL fallback (last resort)
  const urlMatch = location.href.match(/\/watch\/(\d+)/);
  if (urlMatch && urlMatch[1]) {
    console.log('[content] Using URL ID as last resort');
    return 'Video ' + urlMatch[1];
  }
  
  console.log('[content] No title found with any strategy');
  return null;
}

/**
 * Clean up title text by removing Netflix branding and artifacts
 */
function cleanupTitle(raw) {
  if (!raw) return '';
  
  let cleaned = raw.trim();
  
  // Remove Netflix suffix patterns
  cleaned = cleaned.replace(/\s*\|\s*Netflix$/i, '');
  cleaned = cleaned.replace(/\s*-\s*Netflix$/i, '');
  
  // Remove leading time format (HH:MM:SS or H:MM:SS or MM:SS) that Netflix shows
  // This handles formats like "1:35:13 The Martian"
  cleaned = cleaned.replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s+/g, '');
  
  // Also try to extract title if timestamp appears anywhere in the string
  // Match pattern: [timestamp] [title]
  const timeMatch = cleaned.match(/^\d{1,2}:\d{2}(?::\d{2})?\s+(.+)$/);
  if (timeMatch && timeMatch[1]) {
    cleaned = timeMatch[1];
  }
  
  // Remove common prefixes
  cleaned = cleaned.replace(/^Watch\s+/i, '');
  
  return cleaned.trim();
}

/**
 * Check if an element is visible to the user
 */
function isVisible(el) {
  if (!el || !(el instanceof Element)) return false;
  
  const style = window.getComputedStyle(el);
  if (!style) return false;
  
  // Check CSS properties
  if (style.display === 'none' || 
      style.visibility === 'hidden' || 
      parseFloat(style.opacity || '1') === 0) {
    return false;
  }
  
  // Check dimensions
  const rect = el.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) {
    return false;
  }
  
  return true;
}

/**
 * Check if text contains blocked/unwanted content
 */
function isBlockedText(text) {
  if (!text) return true;
  
  const normalized = text.toString().trim().toLowerCase();
  
  const blockedPhrases = [
    'privacy', 'preference', 'preferences', 'cookie', 'consent',
    'manage cookies', 'privacy preference center', 'accept cookies',
    'cookie settings', 'gdpr'
  ];
  
  for (const phrase of blockedPhrases) {
    if (normalized.includes(phrase)) return true;
  }
  
  return false;
}

/**
 * Validate if text looks like a valid title
 */
function isValidTitle(text) {
  if (!text) return false;
  
  const cleaned = text.trim();
  
  // Length checks
  if (cleaned.length < 2 || cleaned.length > 200) return false;
  
  // Skip if it's ONLY a timestamp
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(cleaned)) return false;
  
  // Skip generic Netflix UI text
  if (/^(Netflix|Browse|My List|Home|Search)$/i.test(cleaned)) return false;
  
  // Skip blocked content
  if (isBlockedText(cleaned)) return false;
  
  return true;
}

/**
 * Extract episode information if available
 */
function extractEpisode() {
  const episodeSelectors = [
    'h3[data-uia="episode-title"]',
    '[data-uia="episode-title"]',
    '.video-title .ellipsize-text',
    '.episode-title'
  ];
  
  for (const selector of episodeSelectors) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        const text = (el.innerText || el.textContent || '').trim();
        if (text && text.length > 0 && text.length < 100) {
          return text;
        }
      }
    } catch (err) {
      console.warn(`[content] Error with episode selector ${selector}:`, err?.message);
    }
  }
  
  return null;
}

/**
 * Get currently playing video element
 */
function getVideoElement() {
  return document.querySelector('video');
}

/**
 * Main function to get current watching info
 * Retries with delays to handle Netflix's dynamic loading
 */
async function getCurrentWatching(retries = 2) {
  console.log('[content] getCurrentWatching called, retries:', retries);
  
  let title = extractTitle();
  
  // If no title found and we have retries left, wait and try again
  if (!title && retries > 0) {
    console.log('[content] No title found, waiting 800ms before retry...');
    await new Promise(resolve => setTimeout(resolve, 800));
    return getCurrentWatching(retries - 1);
  }
  
  const episode = extractEpisode();
  const video = getVideoElement();
  
  return {
    title: title || 'Netflix',
    episode: episode,
    hasVideo: !!video,
    url: window.location.href
  };
}

/**
 * Debug function to show all potential title candidates
 */
function debugTitleCandidates() {
  const candidates = [];
  
  try {
    // Meta tags
    const metaKeys = ['og:title', 'twitter:title', 'title'];
    metaKeys.forEach(key => {
      const meta = document.querySelector(`meta[property="${key}"]`) || 
                    document.querySelector(`meta[name="${key}"]`);
      if (meta && meta.content) {
        candidates.push({
          source: 'meta',
          key: key,
          selector: meta.outerHTML.substring(0, 100),
          text: meta.content
        });
      }
    });
    
    // Document title
    if (document.title) {
      candidates.push({
        source: 'document.title',
        selector: 'document.title',
        text: document.title
      });
    }
    
    // Explicit Netflix selectors
    const explicitSelectors = [
      'h1[data-uia="video-title"]',
      '[data-uia="video-title-container"] h1',
      '.player-title-card h1',
      '.player-title',
      '.previewModal--player-title',
      '.title-name',
      '.previewModalTitle'
    ];
    
    explicitSelectors.forEach(selector => {
      const el = document.querySelector(selector);
      if (el && el.innerText) {
        candidates.push({
          source: 'explicit',
          selector: selector,
          text: el.innerText.trim()
        });
      }
    });
    
    // Fuzzy search for visible text nodes
    const fuzzyElements = Array.from(document.querySelectorAll('h1, h2, h3, span, div'))
      .filter(el => {
        const text = el.innerText?.trim();
        return text && text.length > 3 && text.length < 120;
      })
      .slice(0, 80);
    
    fuzzyElements.forEach((el, idx) => {
      candidates.push({
        source: 'fuzzy',
        index: idx,
        selector: el.tagName.toLowerCase(),
        text: el.innerText.trim().substring(0, 200)
      });
    });
    
    // Player area scan
    const playerContainers = ['.nf-player-container', '#appMountPoint', '[data-uia="video-canvas"]'];
    
    playerContainers.forEach(containerSelector => {
      const container = document.querySelector(containerSelector);
      if (!container) return;
      
      const elements = Array.from(container.querySelectorAll('h1, h2, h3, span, div'))
        .filter(el => {
          const text = el.innerText?.trim();
          return text && text.length > 3 && text.length < 120;
        })
        .slice(0, 40);
      
      elements.forEach((el, idx) => {
        candidates.push({
          source: 'player-area',
          container: containerSelector,
          index: idx,
          selector: el.tagName.toLowerCase(),
          text: el.innerText.trim().substring(0, 200)
        });
      });
    });
    
    // URL fallback
    if (location && location.pathname) {
      candidates.push({
        source: 'url',
        selector: 'location.pathname',
        text: location.pathname
      });
    }
  } catch (err) {
    candidates.push({
      source: 'error',
      text: String(err)
    });
  }
  
  return { candidates };
}

// ========== MUTATION OBSERVER ==========
// Watch for Netflix's dynamic content loading

const observer = new MutationObserver((mutations) => {
  // Netflix loads content dynamically, so we cache the title when we see it
  // This helps with subsequent queries
  const title = extractTitle();
  if (title && title !== 'Netflix') {
    console.log('[content] Observer detected title change:', title);
  }
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true
});

console.log('[content] Mutation observer started');
console.log('[content] Initialization complete, ready for messages');