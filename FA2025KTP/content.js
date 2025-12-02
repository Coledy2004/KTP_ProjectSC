// Netflix-optimized content script for title detection
console.log('[content-KTP] Script started on', location.href);

// ========== REGISTER MESSAGE LISTENER IMMEDIATELY ==========
// This is the FIRST thing we do, before anything else
console.log('[content-KTP] Registering message listener...');

try {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log('[content-KTP] Message received:', msg?.type);
    
    try {
      if (msg?.type === 'get-now-watching') {
        const title = getTitleNow();
        const episode = getEpisodeNow();
        console.log('[content-KTP] Responding with title:', title);
        sendResponse({ title, episode });
      } 
      else if (msg?.type === 'query-current-time') {
        const video = getVideoElement();
        sendResponse({ currentTime: video ? video.currentTime : null });
      } 
      else if (msg?.type === 'debug-title-candidates') {
        const candidates = [];
        try {
          // meta tags
          const metaKeys = ['og:title', 'twitter:title', 'title'];
          metaKeys.forEach(k => {
            const m = document.querySelector(`meta[property="${k}"]`) || document.querySelector(`meta[name="${k}"]`);
            if (m && m.content) candidates.push({ source: 'meta', key: k, selector: m.outerHTML, text: m.content });
          });

          // document.title
          if (document.title) candidates.push({ source: 'document.title', selector: 'document.title', text: document.title });

          // explicit netflix selectors
          const explicit = [
            'h1[data-uia="video-title"]',
            '[data-uia="video-title-container"] h1',
            '.player-title-card h1',
            '.player-title',
            '.previewModal--player-title',
            '.title-name',
            '.previewModalTitle',
          ];
          explicit.forEach(sel => {
            const el = document.querySelector(sel);
            if (el && el.innerText) candidates.push({ source: 'explicit', selector: sel, text: el.innerText.trim() });
          });

          // fuzzy search for visible short text nodes
          const fuzzy = Array.from(document.querySelectorAll('h1,h2,h3,span,div'))
            .filter(n => n && n.innerText && n.innerText.trim().length > 3 && n.innerText.trim().length < 120)
            .slice(0, 80);
          fuzzy.forEach((n, i) => {
            candidates.push({ source: 'fuzzy', index: i, selector: n.tagName.toLowerCase(), text: n.innerText.trim().slice(0, 200) });
          });

          // player area scan
          const player = document.querySelector('.nf-player-container') || document.querySelector('#appMountPoint') || document.querySelector('[data-uia="video-canvas"]');
          if (player) {
            const near = Array.from(player.querySelectorAll('h1,h2,h3,span,div'))
              .filter(n => n && n.innerText && n.innerText.trim().length > 3 && n.innerText.trim().length < 120)
              .slice(0, 40);
            near.forEach((n, i) => candidates.push({ source: 'player-area', index: i, selector: n.tagName.toLowerCase(), text: n.innerText.trim().slice(0,200) }));
          }

          // URL fallback
          if (location && location.pathname) candidates.push({ source: 'url', selector: 'location.pathname', text: location.pathname });
        } catch (err) {
          candidates.push({ source: 'error', text: String(err) });
        }
        sendResponse({ candidates });
      } 
      else if (msg?.type === 'play') {
        const video = getVideoElement();
        if (video) {
          video.play().catch(e => console.warn('[content-KTP] play() error:', e?.message));
        }
        sendResponse({ ok: !!video });
      } 
      else if (msg?.type === 'pause') {
        const video = getVideoElement();
        if (video) video.pause();
        sendResponse({ ok: !!video });
      } 
      else if (msg?.type === 'sub-toggle') {
        sendResponse({ ok: toggleSubs() });
      }
      else {
        console.log('[content-KTP] Unknown message type:', msg?.type);
        sendResponse({ error: 'unknown type' });
      }
    } catch (err) {
      console.error('[content-KTP] Handler error:', err?.message);
      sendResponse({ error: err?.message });
    }
  });
  console.log('[content-KTP] Message listener registered successfully ');
} catch (err) {
  console.error('[content-KTP] Failed to register listener:', err?.message);
}

// ========== HELPER FUNCTIONS ==========

function getTitleNow() {
  // Strategy 1: meta tags (og:title, twitter:title, name=title)
  const metaKeys = [
    'meta[property="og:title"]',
    'meta[name="title"]',
    'meta[name="twitter:title"]',
    'meta[property="og:video:title"]'
  ];
  for (const sel of metaKeys) {
    const m = document.querySelector(sel);
    if (m && m.content && m.content !== 'Netflix') {
      return cleanupTitle(m.content);
    }
  }

  // Strategy 2: document.title (strip suffixes)
  if (document.title && !/Netflix/i.test(document.title)) {
    return cleanupTitle(document.title);
  }

  // Strategy 3: explicit known selectors
  const selectors = [
    'h1[data-uia="video-title"]',
    '[data-uia="video-title-container"] h1',
    '.player-title-card h1',
    '.player-title',
    '.previewModal--player-title',
    '.title-name',
    '.previewModalTitle',
    'h1', 'h2'
  ];
  for (const s of selectors) {
    const el = document.querySelector(s);
    if (el) {
      const txt = (el.innerText || el.textContent || '').trim();
      if (isValidTitle(txt)) return cleanupTitle(txt);
    }
  }

  // Strategy 4: search for any element with "title" in class or id
  const fuzzy = Array.from(document.querySelectorAll('[class*="title"],[id*="title"]'));
  for (const el of fuzzy) {
    const txt = (el.innerText || el.textContent || '').trim();
    if (isValidTitle(txt)) return cleanupTitle(txt);
  }

  // Strategy 5: scan the player area for visible headings
  const playerAreas = ['[data-uia="video-canvas"]', '.NFPlayer', '.watch-video', '#appMountPoint'];
  for (const pa of playerAreas) {
    const container = document.querySelector(pa);
    if (!container) continue;
    const candidates = container.querySelectorAll('h1,h2,h3,span,div');
    for (const c of candidates) {
      const txt = (c.innerText || c.textContent || '').trim();
      if (isValidTitle(txt)) return cleanupTitle(txt);
    }
  }

  // Strategy 6: fallback to URL reading (watch/<id>)
  const m = location.href.match(/\/watch\/(\d+)/);
  if (m && m[1]) return 'Video ' + m[1];

  return null;
}

function cleanupTitle(raw) {
  return raw.replace(/\s*\|\s*Netflix$/i, '').replace(/\s*-\s*Netflix$/i, '').trim();
}

// Returns true if element is likely visible to the user
function isVisible(el) {
  if (!el || !(el instanceof Element)) return false;
  const style = window.getComputedStyle(el);
  if (style && (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0)) return false;
  const rect = el.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return false;
  return true;
}

// Filter out common overlay/consent texts that are not titles
function isBlockedText(t) {
  if (!t) return true;
  const s = t.toString().trim().toLowerCase();
  const blocked = [
    'privacy', 'preference', 'preferences', 'cookie', 'consent', 'manage cookies', 'privacy preference center', 'accept cookies', 'cookie settings', 'gdpr'
  ];
  for (const b of blocked) if (s.includes(b)) return true;
  return false;
}

function isValidTitle(t) {
  if (!t) return false;
  const clean = t.trim();
  if (clean.length < 3 || clean.length > 200) return false;
  if (/Netflix|Browse|My List/i.test(clean)) return false;
  if (isBlockedText(clean)) return false;
  return true;
}

function getEpisodeNow() {
  const h3 = document.querySelector('h3[data-uia="episode-title"]');
  if (h3?.innerText) return h3.innerText.trim();
  return null;
}

function getVideoElement() {
  return document.querySelector('video');
}

function toggleSubs() {
  const video = getVideoElement();
  if (!video?.textTracks) return false;
  
  for (let i = 0; i < video.textTracks.length; i++) {
    const mode = video.textTracks[i].mode;
    video.textTracks[i].mode = mode === 'showing' ? 'hidden' : 'showing';
  }
  return true;
}

// ========== INITIALIZATION COMPLETE ==========
console.log('[content-KTP] Initialization complete, ready for messages');
