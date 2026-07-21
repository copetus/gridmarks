chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "open-gridmarks") {
    return undefined;
  }

  chrome.tabs
    .create({
      url: (() => {
        const url = new URL(chrome.runtime.getURL("index.html"));
        if (message.folderId) {
          url.searchParams.set("folder", message.folderId);
        }
        if (message.bookmarkId) {
          url.searchParams.set("bookmark", message.bookmarkId);
        }
        return url.toString();
      })(),
    })
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));

  return true;
});
