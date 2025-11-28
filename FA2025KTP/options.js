// Options page for KTP extension settings

// Helper function to get elements by ID
const $ = id => document.getElementById(id);

// Load saved settings when page opens
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['autoMonitor', 'pollInterval', 'friends'], (res) => {
    if (res.autoMonitor !== undefined) {
      $('autoMonitor').value = String(res.autoMonitor);
    }
    if (res.pollInterval) {
      $('pollInterval').value = res.pollInterval;
    }
    if (res.friends && Array.isArray(res.friends)) {
      $('friends').value = res.friends.join(', ');
    }
  });
});

// Save settings on button click
$('save').addEventListener('click', () => {
  const friendsText = $('friends').value || '';
  const friendIds = friendsText
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0);
  
  const obj = {
    autoMonitor: $('autoMonitor').value === 'true',
    pollInterval: Math.max(500, Number($('pollInterval').value || 2000)),
    friends: friendIds
  };
  
  chrome.storage.local.set(obj, () => {
    alert('Settings saved. Friends list: ' + (friendIds.length ? friendIds.join(', ') : 'none (all public)'));
  });
});

// Reset to defaults
$('reset').addEventListener('click', () => {
  if (confirm('Reset all settings to defaults?')) {
    chrome.storage.local.set({
      autoMonitor: true,
      pollInterval: 2000,
      friends: []
    }, () => {
      $('friends').value = '';
      $('autoMonitor').value = 'true';
      $('pollInterval').value = '2000';
      alert('Settings reset to defaults');
    });
  }
});
