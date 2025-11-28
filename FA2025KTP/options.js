// Helper function to get elements by ID
const $ = id => document.getElementById(id);

// Load saved settings
chrome.storage.local.get(['autoMonitor','pollInterval'], (res)=>{
  if(res.autoMonitor!==undefined) $('autoMonitor').value = String(res.autoMonitor);
  if(res.pollInterval) $('pollInterval').value = res.pollInterval;
});

// Save settings on button click
$('save').addEventListener('click', ()=>{
  const obj = {
    autoMonitor: $('autoMonitor').value==='true',
    pollInterval: Number($('pollInterval').value||3000)
  };
  chrome.storage.local.set(obj, ()=>{
    alert('Settings saved');
  });
});
