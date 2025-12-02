// background service worker (Manifest V3)
// Uses Firebase REST API for service worker compatibility

// ============================================================================
// CONFIGURATION
// ============================================================================
// Replace these with your actual Firebase project details
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDANGxPRuIKzLnKYAdjjAXdiJCXFIyn-_w',
  projectId: 'ktp-extension-project',
  databaseURL: 'https://console.firebase.google.com/u/0/project/ktp-extension-project/firestore/databases/-default-/data/~2Fshows~2Fktp-comments-https%253A%252F%252Fwww.netflix.com%252Fwatch%252F80058399%253FtrackId%253D14170287%2526tctx%253D2%25252C0%25252Ce190dacf-0e37-4eda-8daf-1baa3317dfb9-218045432%25252CNES_ECEF4952FD23FFE291C644E5094F78-994911DC4F528C-426C8C4152_p_1764605234975%25252C%25252C%25252C%25252C%25252C%25252CVideo%25253A80058399%25252CdetailsPagePlayButton~2Ftimestamps.json'
};

const POLLING_INTERVAL = 30000; // Poll every 30 seconds

// ============================================================================
// STATE
// ============================================================================
let currentFirebaseUid = null;
let authToken = null;
let pollingInterval = null;
let lastNotificationTime = {}; // Track notifications to avoid duplicates

// ============================================================================
// SERVICE WORKER LIFECYCLE
// ============================================================================
self.addEventListener('install', (event) => {
  console.log('[background] Service worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[background] Service worker activated');
  event.waitUntil(clients.claim());
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
function formatTime(sec) {
  if (!isFinite(sec)) return '00:00';
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function generateNotificationId(showId, userId, timestamp) {
  return `${showId}_${userId}_${timestamp}`;
}

function shouldShowNotification(notificationId) {
  const now = Date.now();
  const lastTime = lastNotificationTime[notificationId];
  
  // Don't show the same notification more than once per hour
  if (lastTime && (now - lastTime) < 3600000) {
    return false;
  }
  
  lastNotificationTime[notificationId] = now;
  return true;
}

// ============================================================================
// FIREBASE REST API
// ============================================================================
async function saveTimestampToFirebase(showId, userId, timestamp, note) {
  if (!authToken) {
    console.warn('[background] No auth token available');
    throw new Error('Not authenticated');
  }

  const path = `timestamps/${showId}/${userId}`;
  const url = `${FIREBASE_CONFIG.databaseURL}/${path}.json?auth=${authToken}`;
  
  const data = {
    timestamp,
    note: note || '',
    createdAt: Date.now(),
    userId
  };

  console.log('[background] Saving to Firebase:', { showId, userId, timestamp, note });

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[background] Firebase save failed:', errorText);
    throw new Error(`Failed to save: ${response.statusText}`);
  }

  const result = await response.json();
  console.log('[background] Firebase save successful:', result);
  return result;
}

async function fetchFriendTimestamps(friendIds, sinceTimestamp) {
  if (friendIds.length === 0) {
    return [];
  }

  console.log('[background] Fetching timestamps for friends:', friendIds, 'since:', new Date(sinceTimestamp));

  const url = `${FIREBASE_CONFIG.databaseURL}/timestamps.json`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn('[background] Failed to fetch timestamps:', response.statusText);
      return [];
    }

    const allTimestamps = await response.json();
    
    if (!allTimestamps) {
      console.log('[background] No timestamps found');
      return [];
    }

    // Parse the structure: timestamps -> showId -> userId -> {timestamp, note, createdAt}
    const newTimestamps = [];
    
    Object.entries(allTimestamps).forEach(([showId, users]) => {
      if (!users || typeof users !== 'object') return;
      
      Object.entries(users).forEach(([userId, data]) => {
        // Check if this is from a friend and is new
        if (friendIds.includes(userId) && 
            data.createdAt && 
            data.createdAt > sinceTimestamp) {
          newTimestamps.push({
            showId,
            userId,
            timestamp: data.timestamp,
            note: data.note || '',
            createdAt: data.createdAt
          });
        }
      });
    });

    console.log('[background] Found', newTimestamps.length, 'new timestamps');
    return newTimestamps;
    
  } catch (e) {
    console.error('[background] Error fetching timestamps:', e.message);
    return [];
  }
}

// ============================================================================
// NOTIFICATION SYSTEM
// ============================================================================
function createNotification(event) {
  const notificationId = generateNotificationId(event.showId, event.userId, event.timestamp);
  
  if (!shouldShowNotification(notificationId)) {
    console.log('[background] Skipping duplicate notification:', notificationId);
    return;
  }

  const title = `${event.userId} left a timestamp`;
  const message = `At ${formatTime(event.timestamp)}: ${event.note || 'Check it out!'}`;
  
  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: title,
    message: message,
    priority: 1
  }, (id) => {
    if (chrome.runtime.lastError) {
      console.warn('[background] Notification error:', chrome.runtime.lastError.message);
    } else {
      console.log('[background] Notification created:', id);
    }
  });
}

// ============================================================================
// POLLING SYSTEM
// ============================================================================
async function pollFriendTimestamps() {
  try {
    const data = await chrome.storage.local.get(['friends', 'lastChecked']);
    const friendIds = data.friends || [];
    const lastChecked = data.lastChecked || (Date.now() - 3600000); // Default: 1 hour ago

    if (friendIds.length === 0) {
      console.log('[background] No friends to monitor');
      return;
    }

    const newTimestamps = await fetchFriendTimestamps(friendIds, lastChecked);
    
    // Create notifications for new timestamps
    newTimestamps.forEach(event => {
      createNotification(event);
    });
    
    // Update last checked time
    await chrome.storage.local.set({ lastChecked: Date.now() });
    
  } catch (e) {
    console.error('[background] Polling error:', e.message);
  }
}

function startPolling() {
  console.log('[background] Starting friend timestamp polling');
  
  // Do initial poll
  pollFriendTimestamps();
  
  // Set up interval
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
  
  pollingInterval = setInterval(pollFriendTimestamps, POLLING_INTERVAL);
}

function stopPolling() {
  console.log('[background] Stopping polling');
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// Start polling on service worker activation
startPolling();

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[background] Received message:', message);

  // Ping/pong for connection testing
  if (message?.type === 'ping') {
    sendResponse({ msg: 'pong from background' });
    return false;
  }
  
  // Get current Firebase UID or persistent extension user id
  if (message?.action === 'getFirebaseUid') {
    (async () => {
      try {
        if (currentFirebaseUid) {
          sendResponse({ uid: currentFirebaseUid });
          return;
        }
        const data = await chrome.storage.local.get(['ktp_userId']);
        let uid = data.ktp_userId;
        if (!uid) {
          uid = 'user_' + Math.floor(Math.random() * 1000000).toString(36);
          await chrome.storage.local.set({ ktp_userId: uid });
          console.log('[background] Generated new extension user id:', uid);
        }
        sendResponse({ uid });
      } catch (e) {
        console.warn('[background] getFirebaseUid handler error:', e && e.message);
        sendResponse({ uid: null, error: e?.message });
      }
    })();
    return true; // we'll call sendResponse asynchronously
  }
  
  // Set auth token (sent from popup after user signs in)
  if (message?.action === 'setAuthToken') {
    authToken = message.token;
    currentFirebaseUid = message.uid;
    console.log('[background] Auth token updated for user:', currentFirebaseUid);
    sendResponse({ success: true });
    return false;
  }
  
  // Update friends list and restart polling
  if (message?.action === 'updateFriends') {
    console.log('[background] Friends list updated, restarting polling');
    stopPolling();
    startPolling();
    sendResponse({ success: true });
    return false;
  }
  
  // Save comment to Firebase
  if (message?.action === 'saveCommentToFirebase') {
    console.log('[background] Saving comment:', {
      showId: message.showId,
      userId: message.userId,
      timestamp: message.timestamp,
      note: message.note
    });
    
    (async () => {
      try {
        await saveTimestampToFirebase(
          message.showId,
          message.userId,
          message.timestamp,
          message.note
        );
        console.log('[background] Comment successfully saved to Firebase');
        sendResponse({ success: true });
      } catch (e) {
        console.error('[background] Failed to save comment:', e.message);
        sendResponse({ success: false, error: e.message });
      }
    })();
    
    return true; // Indicates we'll call sendResponse asynchronously
  }
  
  // Clear auth (sign out)
  if (message?.action === 'clearAuth') {
    authToken = null;
    currentFirebaseUid = null;
    console.log('[background] Auth cleared');
    sendResponse({ success: true });
    return false;
  }
  
  return false;
});

// ============================================================================
// NOTIFICATION CLICK HANDLER
// ============================================================================
chrome.notifications.onClicked.addListener((notificationId) => {
  console.log('[background] Notification clicked:', notificationId);
  
  // Parse the notification ID to get showId
  const parts = notificationId.split('_');
  if (parts.length >= 1) {
    const showId = parts[0];
    // You can open a specific URL or page based on the showId
    // For example: chrome.tabs.create({ url: `https://yoursite.com/show/${showId}` });
  }
  
  // Clear the notification
  chrome.notifications.clear(notificationId);
});

// ============================================================================
// KEEP-ALIVE (OPTIONAL)
// ============================================================================
// Service workers can be terminated by the browser. This keeps it alive longer.
let keepAliveInterval = null;

function startKeepAlive() {
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {
      // Just accessing chrome API keeps service worker alive
    });
  }, 20000); // Every 20 seconds
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// Start keep-alive
startKeepAlive();

// ============================================================================
// ALARM-BASED POLLING (ALTERNATIVE TO INTERVALS)
// ============================================================================
// Chrome alarms work better than setInterval for service workers
// Uncomment this section to use alarms instead of intervals

/*
chrome.alarms.create('pollFriendTimestamps', {
  periodInMinutes: 0.5 // Every 30 seconds
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pollFriendTimestamps') {
    pollFriendTimestamps();
  }
});
*/

console.log('[background] Background service worker initialized');