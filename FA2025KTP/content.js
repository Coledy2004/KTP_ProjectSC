// content script example: highlights all paragraphs when asked
console.log('KTP content script loaded on', location.href);


//chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
//  if (msg && msg.action === 'highlight-paragraphs') {
//    document.querySelectorAll('p').forEach(p => p.style.background = 'yellow');
//    sendResponse({status: 'done'});
//  }
//});


function getTitle() {
  const title = document.querySelector('.video-title h4, .ellipsize-text');
  if (title) {
    console.log("Now watching:", title.innerText);
  }else{
    console.log("Title not found");
  }
}

setInterval(getTitle, 5000);
