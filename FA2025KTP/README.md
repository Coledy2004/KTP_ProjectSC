KTP Starter Chrome Extension

This repository now contains a minimal Chrome Extension scaffold (Manifest V3).

Files added:
- `manifest.json` - MV3 manifest that wires popup, background service worker, and content script.
- `popup.html` - Simple popup UI.
- `popup.js` - Popup script which sends a ping to the background.
- `background.js` - Background service worker responding to messages.
- `content.js` - Example content script that can highlight paragraphs when sent a message.

How to load locally in Chrome/Edge:
1. Open Chrome and go to chrome://extensions/
2. Enable "Developer mode" (top-right).
3. Click "Load unpacked" and select this repository folder (the folder containing `manifest.json`).

PowerShell quick-check (optional):
```powershell
# Print the folder you should load for the extension
Get-Location
# List files to verify `manifest.json` is present
Get-ChildItem -File -Name
```

Try it (quick):
- Click the extension icon and open the popup. Click "Ping background" to see the background reply.
- To run the content script action from the console (on any open tab):
	- Open DevTools on the tab, then run:
		```javascript
		chrome.runtime.sendMessage({type: 'ping'}).then(r => console.log(r));
		// or to instruct content script on that tab (from extension context):
		// chrome.tabs.query({active: true, currentWindow: true}).then(tabs => chrome.tabs.sendMessage(tabs[0].id, {action: 'highlight-paragraphs'}));
		```

Notes:
- There are placeholder icon paths in `manifest.json` under `icons/`. Add PNG icons at `icons/icon16.png`, `icons/icon48.png`, and `icons/icon128.png` or update the manifest.
- Manifest V3 requires using service workers for background scripts; this scaffold keeps logic minimal.

Next steps you might want:
- Add icons, update extension name/description, and implement the actual extension features for KTP.
