# KTP Netflix Extension - Firebase Setup Guide

## Summary of Fixes

All critical errors have been fixed:
- ✅ Fixed seek variable reassignment bug (content.js)
- ✅ Fixed manifest host_permissions for international Netflix
- ✅ Added missing comment click handler (popup.js)
- ✅ Re-enabled Firebase with real-time friend sharing
- ✅ Updated background service worker for friend notifications
- ✅ Enhanced settings page with friend IDs management

## Firebase Setup Steps

### 1. Create Firebase Project
1. Go to https://console.firebase.google.com
2. Click "Add project" and create a new project (name it "ktp-extension-project")
3. Enable Google Analytics (optional)

### 2. Enable Firestore Database
1. In Firebase Console, go to **Build** → **Firestore Database**
2. Click **Create database**
3. Choose **Production mode** (we'll set rules below)
4. Select your region (closest to you)
5. Click **Create**

### 3. Enable Authentication
1. Go to **Build** → **Authentication**
2. Click **Get started**
3. Enable **Anonymous** authentication
4. (Optional) Enable **Google** for email sign-in later

### 4. Copy Firebase Config
1. In Firebase Console, go **Project Settings** (gear icon) → **General**
2. Scroll to "Your apps" section
3. If no web app, click "Add app" → select web
4. Copy the config object that looks like:
```javascript
{
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
}
```
5. Open `firebase-config.js` in the extension folder
6. Replace the existing config (lines 19-26) with your config values

### 5. Set Firestore Security Rules
1. Go to **Firestore Database** → **Rules** tab
2. Replace the default rules with:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Allow anyone to read timestamps
    match /shows/{showId}/timestamps/{doc=**} {
      allow read: if true;
      
      // Allow authenticated users to create timestamps
      allow create: if request.auth != null
        && request.resource.data.keys().hasAll(['userId', 'timestamp', 'showId'])
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.timestamp is number
        && request.resource.data.note is string;
      
      // Allow users to delete/update their own timestamps
      allow update, delete: if request.auth != null
        && resource.data.userId == request.auth.uid;
    }
  }
}
```
3. Click **Publish**

### 6. Test the Setup
1. Reload the extension in Chrome (chrome://extensions)
2. Open Netflix and play a video
3. Open the extension popup
4. Create a timestamped comment (click "Save at timestamp")
5. Check DevTools Console (F12) for Firebase initialization logs

### 7. Add Friends
1. Open the extension settings (click "Open Settings" in popup)
2. Get your Firebase UID:
   - Open DevTools Console on the extension popup
   - Run: `window.currentAuth && window.currentAuth.uid`
   - Copy this UID and share it with friends
3. Paste your friends' UIDs in the "Friend IDs" field (comma-separated)
4. Click "Save Settings"

## How It Works

### Local Comments
- Comments saved locally in `chrome.storage.local`
- Always available even if Firebase is down
- Visible only to this user/device

### Remote Comments (Firebase)
- Comments posted to Firestore collection: `shows/{showId}/timestamps/`
- Real-time synced across devices and friends
- Friends' comments appear in your popup automatically
- Background service worker creates notifications for friend timestamps

### Friend Sharing
1. You save a timestamped comment at 2:30 in "Stranger Things"
2. Comment is posted to Firebase with your UID
3. Your friend has your UID in their settings
4. Friend opens same show; comments list loads your comment in real-time
5. Friend clicks "Go" to jump to 2:30 in the video

## Troubleshooting

### "Firebase initialized, uid=..." not in console
- Check that Anonymous auth is enabled in Firebase Console
- Verify firebase-config.js has correct values
- Check DevTools Console for error messages

### Comments not syncing
- Ensure Firestore Database is created
- Verify security rules allow reads (they should by default)
- Check browser console for snapshot errors
- Reload extension and try again

### Friend comments not appearing
- Make sure friend's UID is exactly copied (no spaces)
- Friend must have posted a comment first
- Reload the popup to refresh the listener
- Check that friend's show ID matches yours (movie title)

### Notifications not appearing
- Ensure "notifications" permission is in manifest.json (it is)
- Check that background service worker is running (chrome://extensions → Details)
- Verify security rules allow reading timestamps

## Data Structure

### Firestore Collection: `shows/{showId}/timestamps`

Each comment document has:
```javascript
{
  userId: "firebase_uid_here",
  timestamp: 150,              // seconds
  note: "Great scene!",
  showId: "Stranger_Things",   // derived from movie title
  createdAt: Timestamp(...)    // server timestamp
}
```

## Security Notes

- Only authenticated users can post (anonymous auth enabled)
- Users can only delete/update their own timestamps
- Comments are public by default (anyone can read)
- To make private: modify security rules or use a different collection structure

## Next Steps

1. Test with a friend on the same Firebase project
2. Adjust Firestore security rules based on your privacy needs
3. (Optional) Enable Google sign-in for named authors instead of anonymous
4. (Optional) Add moderation/reporting features
5. (Optional) Sync friend list to Firebase for easier management

## Support

If issues persist:
1. Check all console logs (popup DevTools + background service worker logs)
2. Verify all Firebase config values are correct
3. Test with anonymous auth first, then upgrade to named auth
4. Review Firestore rules for any typos or logic errors
