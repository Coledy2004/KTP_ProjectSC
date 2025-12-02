# Debug Guide — Netflix Integration Issues

## What Was Fixed

1. **Content script timing** — Changed from `run_at: document_idle` to `run_at: document_start`
   - This ensures the content script loads BEFORE Netflix's single-page app initializes
   - The message listener is now registered immediately when the script loads

2. **Message listener registration** — Moved to the top of content.js (line 6)
   - Previously duplicated at the bottom of the file
   - Now registers once, immediately, before any async operations

3. **Helper functions** — Added to content.js before the message listener
   - `formatTime()`, `findVideo()`, `readNowWatching()`, `toggleSubtitles()`, `nextSubtitle()`, `inspectFrames()`, `createSeekOverlay()`
   - These are all called from the message listener

4. **Popup error handling** — Added better logging in sendToContent()
   - Now shows debug info about message type, URL checks
   - Better error messages if content script doesn't respond

## Testing Steps

### Step 1: Reload Extension
1. Go to `chrome://extensions`
2. Click the **reload** icon on the Movie Journal extension
3. Check that no red errors appear

### Step 2: Check Console Logs

**On Netflix page:**
1. Open Netflix and start a show
2. Right-click → **Inspect** → **Console** tab
3. Look for:
   - ✅ `Netflix KTP content script loaded on https://www.netflix.com/...`
   - ✅ `[content] message listener registered`
   - When you click the extension:
     - ✅ `[content] message received: {type: "get-now-watching"}`
     - ✅ `[content] get-now-watching result: {title: "Show Name", episode: "..."}`

**In popup console:**
1. Right-click on extension icon
2. Select **"Inspect popup"**
3. Look for:
   - ✅ `[popup] initializing journal popup...`
   - ✅ `[popup] sending message to tab X : get-now-watching`
   - ✅ `[popup] got response: {title: "Show Name", episode: "..."}`

### Step 3: Test Netflix Detection

1. **Go to Netflix browsing page** (not watching)
   - Extension should show: "— / Not on Netflix"
   - This is correct ✅

2. **Click on a show (start playing it)**
   - Extension should show the title: "Stranger Things" (or whatever show)
   - Should say "(episode info not detected)" or the episode name
   - If still shows "—", proceed to Step 4

3. **Click "+ Add to Journal"**
   - Should work and add the show
   - If shows alert "Could not detect the show title. Are you on Netflix?", the title wasn't detected

### Step 4: Troubleshooting

If title still isn't detected:

1. **Open Netflix page, play a show**
2. **Right-click → Inspect → Console**
3. **Paste this and press Enter:**
   ```javascript
   document.querySelector('meta[property="og:title"]')?.content
   ```
   - Should return something like: `"Stranger Things | Netflix"`
   - If returns `null` or blank, Netflix's page structure may have changed

4. **Try the second method:**
   ```javascript
   document.title
   ```
   - Should show the show title
   - If it's just "Netflix", the page may not be fully loaded

5. **Try the third method (look for h1 elements):**
   ```javascript
   document.querySelector('h1[data-uia="video-title"]')?.innerText
   ```

6. **Check if video element exists:**
   ```javascript
   document.querySelector('video')
   ```
   - Should return a `<video>` element, not null

### Step 5: Manual Testing

After fixing content script detection:

1. **Add show to journal** ✅
2. **Type review, click "Save Review"** ✅
3. **Click "Current Time"** 
   - Should show something like "00:42 (42.3s)"
   - If shows "No response from Netflix" or blank, content script didn't respond
4. **Type annotation, click "Add Annotation"** ✅
5. **Go back to journal, click show again** ✅
6. **Verify review and annotation still there** ✅

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Extension shows "—" | Content script not running | Reload extension, check console for errors |
| "Could not detect..." alert | Netflix page not fully loaded | Wait a moment, try again |
| "Current Time" shows "No response" | Content script not responding | Check Netflix console for errors, reload |
| Buttons don't respond | popup.js module import failed | Check browser console for import errors |
| "Not on Netflix" when on Netflix | URL doesn't contain netflix.com | Check active tab URL in popup console |

## Manual Debug Commands

**In Netflix page console:**

```javascript
// Check if content script loaded
window.__ktpLoaded  // (not currently flagged, but script logs it)

// Check current time
document.querySelector('video').currentTime

// Check if video exists
document.querySelector('video')

// Try reading title manually
document.querySelector('meta[property="og:title"]').content

// Check all registered messages
// (Chrome doesn't expose this, but you can trigger a test message)
```

## Next Steps if Issues Persist

1. **Check extension ID** — Note the full ID from `chrome://extensions`
   - Permissions are keyed to specific extension IDs

2. **Verify manifest.json** — Ensure:
   ```json
   "content_scripts": [{
     "matches": ["https://www.netflix.com/*"],
     "js": ["content.js"],
     "run_at": "document_start"  // ← This must say "document_start"
   }]
   ```

3. **Hard reload extension** — Remove and re-add to Chrome:
   - `chrome://extensions` → Remove extension
   - Click "Load unpacked" again → Select FA2025KTP folder
   - Check console for any new errors

4. **Check for CSP errors** — In Netflix page console, look for red errors about:
   - `Refused to load...` 
   - `Refused to execute...`
   - If any, extension has permission issues

## Debugging One-Liner

Run this in Netflix page console to test message passing:

```javascript
chrome.runtime.sendMessage({type: 'get-now-watching'}, (response) => { console.log('Response:', response); });
```

Should see response in console showing title.
