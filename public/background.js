chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "open-gridmarks") {
    return undefined;
  }

  chrome.tabs
    .create({
      url: message.folderId
        ? `${chrome.runtime.getURL("index.html")}?folder=${encodeURIComponent(message.folderId)}`
        : chrome.runtime.getURL("index.html"),
    })
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));

  return true;
});
