function getGridmarksUrl(folderId = "", bookmarkId = "") {
  const url = new URL(chrome.runtime.getURL("index.html"));
  if (folderId) {
    url.searchParams.set("folder", folderId);
  }
  if (bookmarkId) {
    url.searchParams.set("bookmark", bookmarkId);
  }
  return url.toString();
}

async function findGridmarksTab(preferIncognito = false) {
  const tabs = await chrome.tabs.query({
    url: chrome.runtime.getURL("index.html*"),
  });

  return (
    tabs.find((tab) => Boolean(tab.incognito) === preferIncognito) ??
    (!preferIncognito ? tabs.find((tab) => !tab.incognito) : undefined) ??
    null
  );
}

async function focusGridmarksTab(tab, nextUrl = "") {
  if (!tab?.id) {
    return null;
  }

  if (tab.windowId !== undefined) {
    await chrome.windows.update(tab.windowId, {
      focused: true,
    });
  }

  await chrome.tabs.update(tab.id, {
    ...(nextUrl ? { url: nextUrl } : {}),
    active: true,
  });

  return tab;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "open-gridmarks") {
    return undefined;
  }

  const preferIncognito = Boolean(message.incognito);
  const nextUrl = getGridmarksUrl(message.folderId, message.bookmarkId);

  findGridmarksTab(preferIncognito)
    .then(async (existingTab) => {
      if (existingTab?.id) {
        await focusGridmarksTab(existingTab, nextUrl);
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

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "collapse_all_folders") {
    return;
  }

  const activeTab = await findGridmarksTab(false);
  if (!activeTab?.id) {
    return;
  }

  await focusGridmarksTab(activeTab);
  await chrome.tabs.sendMessage(activeTab.id, {
    type: "collapse-all-folders",
  });
});
