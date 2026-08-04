function normalizePreviewUrlInput(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";

    if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
      parsed.port = "";
    }

    if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }

    return parsed.toString();
  } catch {
    return url.trim();
  }
}

export function getPreviewUrl(url) {
  return `https://image.thum.io/get/width/1200/crop/720/noanimate/${normalizePreviewUrlInput(url)}`;
}

function getBookmarkPreviewCacheKey(bookmarkId) {
  return bookmarkId ? `bookmark:${bookmarkId}` : "";
}

function getPagePreviewCacheKey(url) {
  const normalizedUrl = normalizePreviewUrlInput(url);
  return normalizedUrl ? `page:${normalizedUrl}` : "";
}

function getLegacyPreviewCacheKey(url) {
  return url ? getPreviewUrl(url) : "";
}

function getLegacyPreviewCacheKeys(url) {
  if (!url) {
    return [];
  }

  const trimmedUrl = url.trim();
  const rawLegacyCacheKey = trimmedUrl
    ? `https://image.thum.io/get/width/1200/crop/720/noanimate/${trimmedUrl}`
    : "";
  const normalizedLegacyCacheKey = getLegacyPreviewCacheKey(url);

  return [...new Set([normalizedLegacyCacheKey, rawLegacyCacheKey].filter(Boolean))];
}

function getPersistentPreviewStorageKey(cacheKey) {
  return cacheKey ? `gridmarks-preview-cache:${cacheKey}` : "";
}

const PREVIEW_CACHE_DB_NAME = "gridmarks-preview-cache";
const PREVIEW_CACHE_STORE_NAME = "preview-images";

function getChromeLocalStorage() {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return null;
  }

  return chrome.storage.local;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to serialize preview image."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to serialize preview image."));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  if (!dataUrl) {
    return null;
  }

  try {
    const match = dataUrl.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/s);
    if (!match) {
      return null;
    }

    const mimeType = match[1] || "application/octet-stream";
    const isBase64 = Boolean(match[2]);
    const payload = match[3] || "";

    if (isBase64) {
      const normalizedPayload = payload.replace(/\s+/g, "");
      const binary = atob(normalizedPayload);
      const bytes = new Uint8Array(binary.length);

      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      return new Blob([bytes], { type: mimeType });
    }

    return new Blob([decodeURIComponent(payload)], { type: mimeType });
  } catch {
    return null;
  }
}

async function readPreviewCacheDataUrlFromStorage(cacheKey) {
  const storage = getChromeLocalStorage();
  const storageKey = getPersistentPreviewStorageKey(cacheKey);
  if (!storage || !storageKey) {
    return null;
  }

  try {
    const result = await storage.get(storageKey);
    const dataUrl = result?.[storageKey];
    return typeof dataUrl === "string" && dataUrl.startsWith("data:image/") ? dataUrl : null;
  } catch {
    return null;
  }
}

async function readPreviewCacheBlobFromStorage(cacheKey) {
  return dataUrlToBlob(await readPreviewCacheDataUrlFromStorage(cacheKey));
}

async function writePreviewCacheBlobToStorage(cacheKey, blob) {
  const storage = getChromeLocalStorage();
  const storageKey = getPersistentPreviewStorageKey(cacheKey);
  if (!storage || !storageKey) {
    return false;
  }

  try {
    const dataUrl = await blobToDataUrl(blob);
    await storage.set({
      [storageKey]: dataUrl,
    });
    return true;
  } catch {
    return false;
  }
}

function openPreviewCacheDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PREVIEW_CACHE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PREVIEW_CACHE_STORE_NAME)) {
        database.createObjectStore(PREVIEW_CACHE_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readPreviewCacheBlob(cacheKey) {
  const persistedBlob = await readPreviewCacheBlobFromStorage(cacheKey);
  if (persistedBlob) {
    return persistedBlob;
  }

  const database = await openPreviewCacheDatabase();
  if (!database) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PREVIEW_CACHE_STORE_NAME, "readonly");
    const store = transaction.objectStore(PREVIEW_CACHE_STORE_NAME);
    const request = store.get(cacheKey);

    request.onsuccess = async () => {
      const blob = request.result instanceof Blob ? request.result : null;
      if (blob) {
        await writePreviewCacheBlobToStorage(cacheKey, blob).catch(() => {});
      }
      resolve(blob);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function writePreviewCacheBlob(cacheKey, blob) {
  const persistentWriteSucceeded = await writePreviewCacheBlobToStorage(cacheKey, blob);
  const database = await openPreviewCacheDatabase();
  if (!database) {
    if (persistentWriteSucceeded) {
      return;
    }

    throw new Error("Preview cache storage is unavailable.");
  }

  await new Promise((resolve, reject) => {
    const transaction = database.transaction(PREVIEW_CACHE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PREVIEW_CACHE_STORE_NAME);
    const request = store.put(blob, cacheKey);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function writePreviewBlobForBookmark(bookmarkId, url, blob) {
  if (!(blob instanceof Blob) || !blob.size || !blob.type.startsWith("image/")) {
    return false;
  }

  const cacheKeys = [getBookmarkPreviewCacheKey(bookmarkId), getPagePreviewCacheKey(url), ...getLegacyPreviewCacheKeys(url)].filter(
    Boolean,
  );
  if (!cacheKeys.length) {
    return false;
  }

  await Promise.all(cacheKeys.map((cacheKey) => writePreviewCacheBlob(cacheKey, blob)));
  return true;
}

export async function readCachedPreviewForBookmark(bookmarkId, url) {
  const previewRecord = await readCachedPreviewRecordForBookmark(bookmarkId, url);
  return previewRecord?.blob ?? null;
}

export async function readCachedPreviewRecordForBookmark(bookmarkId, url) {
  const bookmarkCacheKey = getBookmarkPreviewCacheKey(bookmarkId);
  const pageCacheKey = getPagePreviewCacheKey(url);
  const legacyCacheKeys = getLegacyPreviewCacheKeys(url);
  const migrationKeys = [bookmarkCacheKey, pageCacheKey, ...legacyCacheKeys].filter(Boolean);

  if (bookmarkCacheKey) {
    const bookmarkBlob = await readPreviewCacheBlob(bookmarkCacheKey);
    if (bookmarkBlob) {
      await Promise.all(migrationKeys.map((cacheKey) => writePreviewCacheBlob(cacheKey, bookmarkBlob).catch(() => {})));

      return {
        blob: bookmarkBlob,
        source: "bookmark",
      };
    }
  }

  if (pageCacheKey) {
    const pageBlob = await readPreviewCacheBlob(pageCacheKey);
    if (pageBlob) {
      await Promise.all(migrationKeys.map((cacheKey) => writePreviewCacheBlob(cacheKey, pageBlob).catch(() => {})));

      return {
        blob: pageBlob,
        source: "page",
      };
    }
  }

  for (const legacyCacheKey of legacyCacheKeys) {
    const legacyBlob = await readPreviewCacheBlob(legacyCacheKey);
    if (!legacyBlob) {
      continue;
    }

    await Promise.all(migrationKeys.map((cacheKey) => writePreviewCacheBlob(cacheKey, legacyBlob).catch(() => {})));

    return {
      blob: legacyBlob,
      source: "legacy",
    };
  }

  return null;
}

export async function readCachedPreviewSourceForBookmark(bookmarkId, url) {
  const bookmarkCacheKey = getBookmarkPreviewCacheKey(bookmarkId);
  const pageCacheKey = getPagePreviewCacheKey(url);
  const legacyCacheKeys = getLegacyPreviewCacheKeys(url);
  const migrationKeys = [bookmarkCacheKey, pageCacheKey, ...legacyCacheKeys].filter(Boolean);

  if (bookmarkCacheKey) {
    const bookmarkDataUrl = await readPreviewCacheDataUrlFromStorage(bookmarkCacheKey);
    if (bookmarkDataUrl) {
      await Promise.all(
        migrationKeys.map((cacheKey) =>
          getChromeLocalStorage()?.set({
            [getPersistentPreviewStorageKey(cacheKey)]: bookmarkDataUrl,
          }).catch(() => {}),
        ),
      );

      return {
        source: "bookmark",
        url: bookmarkDataUrl,
      };
    }
  }

  if (pageCacheKey) {
    const pageDataUrl = await readPreviewCacheDataUrlFromStorage(pageCacheKey);
    if (pageDataUrl) {
      await Promise.all(
        migrationKeys.map((cacheKey) =>
          getChromeLocalStorage()?.set({
            [getPersistentPreviewStorageKey(cacheKey)]: pageDataUrl,
          }).catch(() => {}),
        ),
      );

      return {
        source: "page",
        url: pageDataUrl,
      };
    }
  }

  for (const legacyCacheKey of legacyCacheKeys) {
    const legacyDataUrl = await readPreviewCacheDataUrlFromStorage(legacyCacheKey);
    if (legacyDataUrl) {
      await Promise.all(
        migrationKeys.map((cacheKey) =>
          getChromeLocalStorage()?.set({
            [getPersistentPreviewStorageKey(cacheKey)]: legacyDataUrl,
          }).catch(() => {}),
        ),
      );

      return {
        source: "legacy",
        url: legacyDataUrl,
      };
    }
  }

  const previewRecord = await readCachedPreviewRecordForBookmark(bookmarkId, url);
  if (!previewRecord?.blob) {
    return null;
  }

  try {
    return {
      source: previewRecord.source,
      url: await blobToDataUrl(previewRecord.blob),
    };
  } catch {
    return null;
  }
}

export async function readCachedPreviewSourcesForBookmarks(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return {};
  }

  const storage = getChromeLocalStorage();
  const bookmarkEntries = entries.map((entry) => {
    const bookmarkCacheKey = getBookmarkPreviewCacheKey(entry.bookmarkId);
    const pageCacheKey = getPagePreviewCacheKey(entry.url);
    const legacyCacheKeys = getLegacyPreviewCacheKeys(entry.url);
    const candidates = [
      bookmarkCacheKey ? { cacheKey: bookmarkCacheKey, source: "bookmark" } : null,
      pageCacheKey ? { cacheKey: pageCacheKey, source: "page" } : null,
      ...legacyCacheKeys.map((cacheKey) => ({ cacheKey, source: "legacy" })),
    ].filter(Boolean);

    return {
      cacheKey: entry.cacheKey,
      candidates,
      migrationKeys: [...new Set(candidates.map((candidate) => candidate.cacheKey))],
    };
  });

  if (!storage) {
    const fallbackResults = await Promise.all(
      entries.map(async (entry) => {
        const result = await readCachedPreviewSourceForBookmark(entry.bookmarkId, entry.url);
        return [entry.cacheKey, result];
      }),
    );

    return Object.fromEntries(fallbackResults.filter(([, value]) => value));
  }

  const storageKeys = [...new Set(
    bookmarkEntries.flatMap((entry) =>
      entry.candidates.map((candidate) => getPersistentPreviewStorageKey(candidate.cacheKey)).filter(Boolean),
    ),
  )];

  let storageResult = {};
  try {
    storageResult = storageKeys.length ? await storage.get(storageKeys) : {};
  } catch {
    storageResult = {};
  }

  const results = {};
  const missingEntries = [];

  for (const entry of bookmarkEntries) {
    let matchedResult = null;

    for (const candidate of entry.candidates) {
      const storageKey = getPersistentPreviewStorageKey(candidate.cacheKey);
      const dataUrl = storageKey ? storageResult?.[storageKey] : null;
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
        continue;
      }

      matchedResult = {
        source: candidate.source,
        url: dataUrl,
      };

      const missingMigrationKeys = entry.migrationKeys.filter((cacheKey) => {
        const currentStorageKey = getPersistentPreviewStorageKey(cacheKey);
        return currentStorageKey && typeof storageResult?.[currentStorageKey] !== "string";
      });

      if (missingMigrationKeys.length) {
        await Promise.all(
          missingMigrationKeys.map((cacheKey) =>
            storage
              .set({
                [getPersistentPreviewStorageKey(cacheKey)]: dataUrl,
              })
              .catch(() => {}),
          ),
        );
      }

      break;
    }

    if (matchedResult) {
      results[entry.cacheKey] = matchedResult;
    } else {
      missingEntries.push(entry);
    }
  }

  if (!missingEntries.length) {
    return results;
  }

  const fallbackResults = await Promise.all(
    missingEntries.map(async (entry) => {
      const originalEntry = entries.find((candidate) => candidate.cacheKey === entry.cacheKey);
      if (!originalEntry) {
        return [entry.cacheKey, null];
      }

      const result = await readCachedPreviewSourceForBookmark(originalEntry.bookmarkId, originalEntry.url);
      return [entry.cacheKey, result];
    }),
  );

  for (const [cacheKey, result] of fallbackResults) {
    if (result) {
      results[cacheKey] = result;
    }
  }

  return results;
}

export async function cacheCapturedPreview(bookmarkId, url, dataUrl) {
  if (!dataUrl || (!bookmarkId && !url)) {
    return false;
  }

  const blob = await dataUrlToBlob(dataUrl);
  if (!blob) {
    return false;
  }

  return writePreviewBlobForBookmark(bookmarkId, url, blob);
}

export async function cacheCapturedPreviewBlob(bookmarkId, url, blob) {
  if (!bookmarkId && !url) {
    return false;
  }

  return writePreviewBlobForBookmark(bookmarkId, url, blob);
}
