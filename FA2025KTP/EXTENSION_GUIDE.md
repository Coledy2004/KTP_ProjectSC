# KTP Movie Journal Extension - Complete Guide

## Overview

The KTP Movie Journal Extension is a Chrome browser extension that allows you to track movies and TV shows you watch on Netflix, write reviews, annotate specific moments with timestamp-based notes, and maintain a personal journal of your viewing experience.

## Core Features

### 1. **Netflix Title Detection**
When you open the extension popup while watching Netflix, it automatically detects the title of the current show or movie you're watching. The extension uses multiple strategies to find the title:

- **Meta Tags**: Searches for Open Graph and Twitter meta tags that Netflix includes in the page
- **Document Title**: Falls back to the page's title if meta tags aren't available
- **Explicit Selectors**: Looks for known Netflix DOM elements that contain title information
- **Fuzzy Search**: Scans elements with "title" in their class or ID attributes
- **Player Area Scan**: Searches within the Netflix video player container for headings and text elements
- **URL Parsing**: As a last resort, extracts show ID from the Netflix URL

The detected title is automatically cleaned of:
- Netflix branding suffixes ("| Netflix", "- Netflix")
- Leading timestamps (like "00:45:32 Show Name" becomes "Show Name")

### 2. **Movie/Show Journal**
Your entire viewing history is stored locally in your browser using Chrome's local storage system. The journal includes:

- **Show Entries**: Each show/movie in your journal has a unique ID, title, review, annotations, creation date, and last modified date
- **Persistent Storage**: All data is saved in `chrome.storage.local`, meaning it persists even after closing the browser
- **Local-Only**: No cloud sync or external servers—your data stays entirely on your device

Each journal entry stores:
- Show title
- Your personal review (text up to several thousand characters)
- Timestamp-based annotations (notes attached to specific moments in the show)
- Metadata (when you added it, when you last modified it)

### 3. **Adding Shows to Your Journal**
When you click "Add to Journal" in the popup:

1. The extension queries the Netflix tab for the currently playing title
2. If a title is detected, it's added to your journal (or retrieved if it already exists)
3. You're taken to the journal entry view where you can write a review or add annotations
4. If no title is detected, you can manually enter one via a prompt

### 4. **Reviews**
For each show in your journal, you can write and save a personal review:

- Open any show entry in your journal
- Click the "Info & Review" tab
- Type your review in the text area
- Click "Save Review" to persist your thoughts
- Reviews are displayed as a preview in the journal list (first 50 characters)

### 5. **Timestamp Annotations**
One of the extension's most powerful features is the ability to annotate specific moments as you watch:

**How it works:**
1. Navigate to the "Info & Review" tab of any journal entry
2. While the show is playing on Netflix, click "Current Time" to capture the exact playback timestamp
3. Type your note about that moment in the text area
4. Click "Add Annotation" to save it

**Annotations include:**
- The exact timestamp (formatted as MM:SS)
- Your note text
- The date and time you created the annotation

**Viewing annotations:**
- Click the "Annotations" tab in any journal entry to see all your notes for that show
- Annotations are sorted by timestamp
- Each annotation has a delete button (✕) if you want to remove it

### 6. **Journal Management**
Your journal displays all shows you've added with:

- Show title
- Preview of your review (truncated to 50 characters)
- Count of annotations for that show
- Most recently modified shows appear at the top

**Actions:**
- **Click a show**: Opens the full entry view where you can edit reviews and annotations
- **Delete button (✕)**: Removes the show entirely from your journal (with confirmation)
- **"View All" button**: Takes you back to the full journal list

### 7. **Playback Controls**
The extension provides quick access to Netflix playback controls from the popup:

- **Play Button (▶)**: Resumes playback (styled in Netflix red)
- **Pause Button (⏸)**: Pauses the video

These buttons are full-width and easily accessible without scrolling, allowing you to control Netflix without interacting directly with the page.

### 8. **Title Refresh**
Next to the currently watching title, there's a refresh button (🔄) that:

- Re-queries Netflix for the current title
- Updates the display immediately
- Useful if the title detection initially fails or if you want to verify the correct title

## Technical Architecture

### Extension Structure

The extension consists of four main components:

#### **Content Script (content.js)**
Runs directly on Netflix pages and handles:
- Title extraction using multiple detection strategies
- Playback control (play, pause)
- Communication with the popup via Chrome's messaging API
- Immediate listener registration for rapid response

#### **Popup Interface (popup.html & popup.js)**
The user-facing interface that displays:
- Currently watching title and episode info
- Journal list
- Journal entry editor with review and annotation tabs
- Playback controls
- Refresh button for title detection

The popup maintains state for the currently selected show and handles all UI interactions.

#### **Show Journal Module (show-journal.js)**
A utility module that manages all journal operations:
- `getJournal()`: Retrieves all shows
- `getOrCreateShow()`: Adds or retrieves a show
- `updateShowReview()`: Saves review text
- `addAnnotation()`: Adds timestamp-based notes
- `removeAnnotation()`: Deletes a specific annotation
- `deleteShow()`: Removes an entire show entry
- `exportJournal()`: Converts journal to JSON
- `importJournal()`: Restores journal from JSON backup

#### **Background Service Worker (background.js)**
Minimal background script that:
- Handles extension lifecycle (install, activate)
- Receives and responds to popup messages
- Maintains extension state across page loads

### Communication Flow

1. **Popup opens** → popup.js runs
2. **Popup queries current tab** → gets active Netflix tab ID
3. **Popup sends message to content script** → "get-now-watching" request
4. **Content script receives message** → runs title detection
5. **Content script responds** → sends detected title and episode back to popup
6. **Popup displays title** → user sees what's currently playing

This happens with automatic retry logic and injection fallback if the content script isn't loaded yet.

### Data Storage

All data is stored in `chrome.storage.local`:
- **Key**: `ktp_shows_journal`
- **Value**: Array of show objects with full entry data

Storage is:
- Synchronous for small reads/writes
- Limited to ~10MB per extension (plenty for a journal)
- Completely private to the extension (other websites can't access it)
- Cleared only when you uninstall the extension or manually clear extension data

## User Workflow

### Typical Usage Scenario

1. **Start watching Netflix** → Open the extension popup
2. **See what's playing** → Title auto-detects and displays
3. **Add to journal** → Click "Add to Journal" button
4. **Watch and annotate** → While watching, use "Current Time" and "Add Annotation" to capture key moments
5. **Write review** → After finishing, open the show entry and write your thoughts in the review field
6. **Review journal** → Browse "Your Shows" list to see everything you've logged

### Example: Annotating a Scene

User is watching *Stranger Things* Season 1, Episode 1:

1. Extension shows: "Stranger Things" currently playing
2. At 00:23:45, an important scene happens
3. User clicks "Current Time" → captures 00:23:45
4. User types: "Will goes missing - great cinematography"
5. User clicks "Add Annotation" → saved to journal
6. Later, user can see all moments they noted by clicking the "Annotations" tab

## Features Removed

The extension originally included Firebase-based friend sharing, which has been removed:
- No cloud sync
- No real-time friend comment sharing
- No authentication needed
- Purely local, private journal

This simplification makes the extension faster, more private, and easier to use.

## Permissions Explained

The extension requests minimal permissions:

- **storage**: To save and load your journal and annotations
- **scripting**: To inject and communicate with the content script on Netflix
- **activeTab**: To know which tab to send messages to
- **host_permissions** (netflix.com): To ensure the extension only runs on Netflix

No other permissions are requested, keeping your privacy protected.

## Limitations & Design Choices

1. **Local storage only**: Your journal won't sync across devices or browsers
2. **Manual sync**: You can export your journal as JSON and import it elsewhere
3. **Netflix-only**: The extension only works on Netflix (by design)
4. **Title detection**: May occasionally fail on Netflix UI changes or unusual page layouts
5. **No authentication**: Anyone with access to your computer can see your journal
6. **One journal per browser profile**: Each Chrome profile has its own separate journal

## Tips for Best Results

- **Refresh the title** if it doesn't detect automatically
- **Add shows right away** to avoid losing track
- **Use the Debug button** if title detection fails—it shows all candidate elements found on the page
- **Annotate while watching** rather than trying to remember moments later
- **Export your journal periodically** as a backup

## Troubleshooting

**Title not detecting?**
- Make sure you're on an active Netflix video page (not search/browse)
- Try clicking the refresh button
- Use the Debug button to see what elements the extension found

**Can't add annotations?**
- Make sure you're inside a show's entry (click a show from the list first)
- Click "Current Time" first to capture the timestamp
- Then type your note and click "Add Annotation"

**Journal not saving?**
- Check your browser's local storage isn't disabled
- Try refreshing the page
- Check browser console for errors (press F12)

**Playback controls not working?**
- Make sure Netflix tab is active
- Try clicking the button again (may need retry)
- Check if Netflix itself allows programmatic playback

## File Organization

- `manifest.json`: Extension configuration
- `popup.html`: User interface layout
- `popup.js`: UI logic and interaction handling
- `content.js`: Netflix page interaction and title detection
- `show-journal.js`: Journal data management
- `background.js`: Background service worker
- `icons/`: Extension icons for different sizes
