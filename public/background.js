chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "open-gridmarks") {
    return undefined;
  }

  const preferIncognito = Boolean(message.incognito);
  const nextUrl = (() => {
    const url = new URL(chrome.runtime.getURL("index.html"));
    if (message.folderId) {
      url.searchParams.set("folder", message.folderId);
    }
    if (message.bookmarkId) {
      url.searchParams.set("bookmark", message.bookmarkId);
    }
    return url.toString();
  })();

  chrome.tabs
    .query({
      url: chrome.runtime.getURL("index.html*"),
    })
    .then(async (tabs) => {
      const existingTab =
        tabs.find((tab) => Boolean(tab.incognito) === preferIncognito) ??
        (!preferIncognito ? tabs.find((tab) => !tab.incognito) : undefined);

      if (existingTab?.id) {
        if (existingTab.windowId !== undefined) {
          await chrome.windows.update(existingTab.windowId, {
            focused: true,
          });
        }

        await chrome.tabs.update(existingTab.id, {
          url: nextUrl,
          active: true,
        });
        return;
      }

      if (preferIncognito) {
        await chrome.windows.create({
          url: nextUrl,
          incognito: true,
          focused: true,
        });
        return;
      }

      await chrome.tabs.create({
        url: nextUrl,
      });
    })
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));

  return true;
});
