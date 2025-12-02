# Movie Journal Extension

A personal movie and TV show journal extension for Chrome. Track shows you watch, write reviews, and make timestamp-based annotations (like marginalia in a book).

## Features

- **Add shows to your journal**: Click "+ Add to Journal" to log a Netflix show or movie
- **Write reviews**: Add detailed reviews for each show/movie
- **Timestamp annotations**: Pause at a specific moment and save a note tagged with the exact timestamp
- **Personal library**: Browse all your watched shows with their reviews and annotations
- **Local storage**: All data is stored locally in your browser—no cloud sync, no sharing

## How to Use

1. **Open Netflix** and start watching a show or movie
2. **Click the extension icon** in your toolbar to open the popup
3. **Add the show to your journal**: Click "+ Add to Journal"
4. **Write a review** (optional): Switch to the "Info & Review" tab and add your thoughts
5. **Add annotations**:
   - Pause the video at a moment you want to remember
   - Switch to "Info & Review" tab
   - Click "Current Time" to capture the playback timestamp
   - Write your note about that scene
   - Click "Add Annotation"
6. **View all annotations**: Switch to the "Annotations" tab to see all your timestamped notes
7. **Browse your library**: Click "← Back to Journal" to see all your shows and reviews

## Architecture

- **show-journal.js**: Core journal storage and management API
  - `getOrCreateShow(title)`: Create or fetch a show entry
  - `addAnnotation(showId, timestamp, text)`: Add a timestamped note
  - `updateShowReview(showId, reviewText)`: Save a review
  - `getJournal()`: Get all shows
  - `removeAnnotation(showId, annotationId)`: Delete a note

- **popup.js**: User interface for the journal
  - Shows currently watching title from Netflix
  - Manages show list view and individual show view
  - Handles review and annotation input

- **content.js**: Netflix page integration
  - Extracts show/movie titles from Netflix page
  - Captures current playback time
  - Handles playback controls (play, pause, subtitles)

- **background.js**: Service worker (minimal)
  - Handles Chrome extension lifecycle
  - Simple message routing if needed in future

- **manifest.json**: Extension permissions and configuration
  - Storage access (for chrome.storage.local)
  - Netflix host permissions
  - Content scripts for Netflix

## Storage

All data is stored in **chrome.storage.local** under the key `ktp_shows_journal`.

Each show entry includes:
- `id`: Unique identifier
- `title`: Show/movie title
- `review`: User's written review
- `annotations`: Array of timestamped notes
- `addedDate`: When added to journal
- `lastModified`: Last update time

## Data Export (Future)

The show-journal.js module includes:
- `exportJournal()`: Export entire journal as JSON
- `importJournal(jsonStr)`: Import from JSON

## Troubleshooting

**"Not detected" error when clicking "Add to Journal"**
- Ensure you're on Netflix (not browsing)
- The extension title detection works best during active playback

**Annotations not appearing in list**
- They're sorted by timestamp; check the annotations tab
- Refresh the popup to reload the list

**Lost all data**
- Data is stored in chrome.storage.local
- Uninstalling the extension may delete your data
- Use "Export Journal" to back up your data before uninstalling

## Privacy

All data is stored locally on your device. The extension does not:
- Send data to remote servers
- Track your viewing habits
- Share data with others
- Require any accounts or login

Your movie journal is entirely yours.

---

Made with ❤️ for Netflix lovers and note-takers.
