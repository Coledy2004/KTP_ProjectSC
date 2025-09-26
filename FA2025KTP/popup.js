document.getElementById('ping').addEventListener('click', async () => {
  const status = document.getElementById('status');
  status.textContent = 'Pinging background...';
  try {
    const result = await chrome.runtime.sendMessage({type: 'ping'});
    status.textContent = 'Background replied: ' + (result && result.msg ? result.msg : JSON.stringify(result));
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
  }
});