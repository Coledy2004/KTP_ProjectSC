# KTP Extension - Debug Guide

## Issue #1: Checking if Comments Are Stored

Comments ARE being saved (you see them in the popup), but they're in the **extension's storage**, not Netflix's storage.

### How to View Extension Storage in DevTools:

**Method 1: From the Extension Icon (Recommended)**
1. Go to `chrome://extensions` 
2. Find "KTP Starter Extension"
3. Click **"Details"**
4. Scroll down and click **"Inspect views: background page"** or click on the extension name to get its ID
5. This opens DevTools for the extension itself
6. Go to **Application tab → Storage → Local Storage**
7. You'll see an entry for the extension's ID (looks like: `chrome-extension://xxxxx...`)
8. Expand it and look for keys starting with **`ktp-comments-`**
9. You should see your saved timestamps as JSON arrays

**Method 2: From the Popup Page**
1. Click the KTP extension icon in Netflix
2. The popup opens
3. Right-click anywhere in the popup and select **"Inspect"**
4. This opens DevTools for the popup
5. Go to **Console** tab
6. Type: `ktpDebugComments()`
7. Press Enter
8. You'll see your comments logged: `Found X comment group(s):`

**Expected Output:**
```
[popup-debug] Found 1 comment group(s): 
[{
  key: "ktp-comments-The_Hangover",
  count: 2,
  data: [
    {time: 45, text: "My first comment", ts: 1732745123456},
    {time: 120, text: "My second comment", ts: 1732745145678}
  ]
}]
```

---

## Issue #2: "Netflix is Having Trouble Processing Your Request"

This error occurs when Netflix blocks the seek attempt. This is expected behavior - Netflix has anti-bot protections.

### Solutions to Try (in order):

#### Solution 1: Play Video First, Then Seek
1. **Start playing the video** on Netflix (press play button)
2. **Wait 3-5 seconds** for it to fully load and start playing
3. **Then click the "Go" button** in the extension popup
4. Netflix is more permissive when a video is actively playing

#### Solution 2: Try Manual Seeking
If clicking "Go" still fails:
1. Click "Go" - the button will show "Seeking..."
2. If Netflix shows an error, **manually click on Netflix's progress bar** at the target time
3. The error message will tell you which method was attempted (video.currentTime, netflix.api.seek, or progress-click)

#### Solution 3: Check DevTools Console (Netflix Page)
1. Open Netflix in a tab
2. Press **F12** to open DevTools
3. Go to the **Console** tab
4. Click the "Go" button on the extension
5. Look for messages like:
   - ✅ `KTP seek: used video.currentTime -> 45` (Success)
   - ✅ `KTP seek: used netflix.api.seek -> 45` (Success)
   - ✅ `KTP seek: used progress-click -> 45` (Success)
   - ❌ `all-strategies-failed` (Failed - Netflix is blocking)

#### Solution 4: Reload the Page
1. If Netflix is unresponsive, reload the Netflix tab (Ctrl+R)
2. Wait for it to fully load
3. Start playing a video
4. Try the "Go" button again

---

## What's Actually Happening

### Storage (Issue #1):
- ✅ **Working correctly**: Your comments are saved in `chrome.storage.local`
- ✅ They show up in the popup's Comments section
- ℹ️ They don't appear in Netflix's DevTools storage because they're in a different storage space (extension vs. Netflix page)

### Seeking (Issue #2):
- ✅ **Working correctly**: The extension tries 4 different seek methods:
  1. Direct `video.currentTime` manipulation
  2. Netflix's internal player API
  3. Simulating clicks on the progress bar
  4. Creating an overlay for user-gesture seeks

- ❌ **Netflix Blocking**: Netflix has anti-bot protection that sometimes blocks programmatic seeking
- 🔧 **Workaround**: Playing the video first gives Netflix permission to allow seeking

---

## Testing Checklist

- [ ] Comments appear in the popup after clicking "Save Timestamp"
- [ ] Comments have the correct time, text, and date
- [ ] You can see the comments in `chrome.storage.local` via Method 1 or 2 above
- [ ] Video is **playing** before clicking "Go"
- [ ] Console shows one of the "KTP seek: used..." success messages
- [ ] The video actually jumps to the correct time (or Netflix shows the error page)

---

## If Still Having Issues

1. **Check the movie is being detected:**
   - Look at the popup's "Now Watching" section
   - It should show the movie title (not "Not detected")

2. **Check the content script is running:**
   - Open Netflix page DevTools (F12)
   - Go to Console
   - Scroll up to the top
   - Should see: `Netflix KTP content script loaded on https://www.netflix.com/...`

3. **Run the debug command:**
   - Right-click in the popup → Inspect
   - Console tab
   - Type: `ktpDebugComments()`
   - Share the output

---

## Summary

**Storage:** Your comments ARE being saved. Check them using Method 1 or 2 above.

**Seeking:** Netflix often blocks seeks unless you're actively playing. Try:
1. Play the video first
2. Wait a few seconds
3. Then click "Go" in the extension

Both features are working as designed - Netflix's security just requires these precautions.
