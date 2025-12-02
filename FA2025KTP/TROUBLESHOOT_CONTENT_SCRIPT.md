# Quick Troubleshooting — Content Script Not Loading

## What You're Seeing
```
[popup] sendMessage runtime error: Could not establish connection. Receiving end does not exist.
```

## What This Means
The content script isn't listening yet when the popup tries to send a message.

## What Was Fixed
1. **Cleaned content.js** — Removed 700 lines of corrupted old code
2. **Changed timing** — From `document_start` → `document_end` 
3. **Better logging** — All logs now have `[content-KTP]` prefix

## How to Test

### Step 1: Reload Extension
1. Go to `chrome://extensions`
2. Click reload icon on "Movie Journal"
3. Wait 2-3 seconds for reload

### Step 2: Check Netflix Console
1. Go to netflix.com
2. Start watching any show  
3. Right-click page → **Inspect** → **Console** tab
4. Look for messages starting with `[content-KTP]`:
   - ✅ `[content-KTP] Script started on https://www.netflix.com/watch/...`
   - ✅ `[content-KTP] Message listener registered successfully ✓`
   - ✅ `[content-KTP] Initialization complete, ready for messages`

   **If you DON'T see these, see "If Still Not Working" below**

### Step 3: Click Extension Icon
1. Click extension icon
2. Right-click it → **"Inspect popup"** → **Console** tab
3. You should see:
   ```
   [popup] active tab URL: https://www.netflix.com/watch/...
   [popup] sending message to tab 972968411 : get-now-watching
   [popup] got response: {title: "Stranger Things", episode: ""}
   ```

### Step 4: Try Buttons
- Click "+ Add to Journal" → should work
- Click "Check Current Time" → should show time like "00:42 (42.3s)"
- Type review, click "Save Review" → should work

---

## If Still Not Working

### Problem 1: No `[content-KTP]` logs in Netflix console
**Reason:** Content script didn't load

**Fix:**
1. Hard reload extension:
   - Go to `chrome://extensions`
   - **Remove** Movie Journal
   - Click "Load unpacked"
   - Select `FA2025KTP` folder
   - Reload Netflix page

2. Check manifest.json has correct `run_at`:
   ```json
   "run_at": "document_end"
   ```

3. Check content.js is only 95 lines (not 700+):
   ```powershell
   (Get-Content content.js).count
   ```

### Problem 2: Console shows error messages
Copy the error and check:
- `Could not establish connection` = content script loaded but popup sent message too soon
- `"Receiving end does not exist"` = content script not loaded
- Any red errors about CSP or permissions

### Problem 3: Got response but title still shows "—"
Means message listener is working, but title extraction failed.

**Check:** Do this in Netflix page console:
```javascript
document.querySelector('meta[property="og:title"]')?.content
```

Should return something like `"Stranger Things | Netflix"`

If it returns `null`, Netflix's page structure may have changed.

---

## Debug One-Liners

**In Netflix page console:**

```javascript
// Check if content script is loaded
typeof chrome === 'object' && typeof chrome.runtime !== 'undefined'

// Check if title meta tag exists
document.querySelector('meta[property="og:title"]')?.content

// Check if video element exists  
document.querySelector('video')?.currentTime

// Test message passing directly
chrome.runtime.sendMessage({type: 'get-now-watching'}, (r) => console.log('Response:', r));
```

---

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| No content script logs | Content script didn't load | Reload extension, check manifest |
| "Receiving end does not exist" | Too much delay before message | Already fixed (document_end) |
| Response: `{title: null}` | Title extraction failed | Check if Netflix changed DOM |
| Response timeout | Message listener not registered | Check content.js file size |
| "Could not establish connection" | Content script loaded late | This is normal, happens once |

---

## File Verification

**Check content.js file size:**
```powershell
(Get-Content "c:\Users\coled\OneDrive\Desktop\KTP_ProjectSC\FA2025KTP\content.js").count
```
Should be around 95 lines (not 700+)

**Check manifest.json:**
```powershell
Get-Content "c:\Users\coled\OneDrive\Desktop\KTP_ProjectSC\FA2025KTP\manifest.json" | Select-String run_at
```
Should show: `"run_at": "document_end"`

---

Ready to test! Let me know what you see in the console.
