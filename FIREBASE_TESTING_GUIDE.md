# Firebase Real-Time Comment Sharing - Testing Guide

## What Changed

The extension now uses **Firebase Firestore** to share timestamped comments in real-time with friends watching the same movie/show.

## How It Works

1. **You save a comment** at a specific timestamp in Netflix
2. **The comment is uploaded to Firebase** (with your unique user ID)
3. **Friends' extensions listen to Firebase** for new comments on that show
4. **Comments appear in real-time** on your friends' popups (even if they're at a different timestamp)

## Testing Single User (Yourself)

### Step 1: Reload the Extension
1. Go to `chrome://extensions`
2. Toggle the KTP extension **OFF** then **ON**

### Step 2: Save a Comment
1. Go to Netflix and play a movie/show
2. Click the KTP extension icon
3. Type a note (e.g., "This scene is funny!")
4. Click **"Save at timestamp"**
5. Alert shows: **"✓ Comment saved and shared with friends!"**

### Step 3: Check Comments Appear
1. In the popup, look at the **Comments** section
2. You should see your comment appear with:
   - **Time** (e.g., `1:23`)
   - **Your ID** (truncated UUID)
   - **Your note text**
   - **Date/time saved**

### Step 4: Check DevTools Console (Optional)
1. Click the extension icon → Right-click → **Inspect**
2. Go to **Console** tab
3. Look for messages like:
   - `[popup] Firebase initialized successfully`
   - `[popup] Firebase authenticated as: xxxxx`
   - `[popup] Comment posted to Firebase`
   - `[popup] Firebase snapshot received, docs: 1`

If you see these, Firebase is working! ✓

## Testing With Friends (Two Users)

To test real-time syncing, you need **two devices/profiles** watching the same show:

### Setup
1. **Device A**: You with your user ID (auto-generated)
2. **Device B**: Friend with their user ID (auto-generated)
3. **Both** have the KTP extension installed and Firebase enabled

### Testing
1. **Device A**: Open Netflix to a movie (e.g., "The Hangover")
2. **Device B**: Open Netflix to the **SAME movie**
3. **Device A**: Save a comment at 5:00 timestamp
4. **Device B**: Look at the Comments section

**Expected result:** 
✓ Comment appears on Device B in real-time (within 1-2 seconds)
✓ Shows as "(Friend)" label
✓ Shows Device A's truncated user ID
✓ Shows correct timestamp and text

## What If Comments Don't Appear?

### Check Firebase is Working
1. On Device A (comment sender), right-click popup → **Inspect**
2. Console tab, look for:
   - ❌ `Firebase init failed:` - Firebase not loading
   - ✅ `Firebase initialized successfully` - Good!
   - ✅ `Firebase authenticated as:` - Good!
   - ✅ `Comment posted to Firebase` - Comment sent!

### Check Firestore Rules
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `ktp-extension-project`
3. Go to **Firestore Database**
4. Click **Rules** tab
5. Make sure rules allow reading/writing

### Default Should Be:
```
allow read, write: if true;
```

(This is open during testing - make it more secure before production!)

### Check Network
- Make sure both devices can access `firebaseapp.com`
- Check there are no network errors in DevTools

## Current Limitations

1. **User ID**: Generated automatically as anonymous Firebase user
   - Each person gets a unique ID
   - No way to identify friends by name yet
   - Next step: Manual friend ID sharing

2. **Comments sync to all users**:
   - There's no "friends list" yet
   - Any comment on a show goes to ALL users watching that show
   - Next step: Implement friend ID filtering

3. **No message notifications**:
   - Comments appear in real-time but no notifications yet
   - Next step: Add Chrome notifications for new friend comments

## Next Steps (After Testing This Works)

1. **Add Friend ID Sharing**: Manually enter friend IDs to see only their comments
2. **Add Notifications**: Get alerts when friends post comments
3. **Add Settings UI**: Configure which friends to follow
4. **Firebase Security Rules**: Restrict writes to prevent abuse

## Success Criteria

- [ ] Single user can save comments
- [ ] Comments appear in popup's Comments section
- [ ] Comments show timestamp, user ID, and text
- [ ] (Optional) Two users see each other's comments in real-time

Once you confirm these work, we can move to friend filtering!
