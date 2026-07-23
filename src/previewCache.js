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

function getLegacyPreviewCacheKey(url) {
  return url ? getPreviewUrl(url) : "";
}

const PREVIEW_CACHE_DB_NAME = "gridmarks-preview-cache";
const PREVIEW_CACHE_STORE_NAME = "preview-images";

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
  const database = await openPreviewCacheDatabase();
  if (!database) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PREVIEW_CACHE_STORE_NAME, "readonly");
    const store = transaction.objectStore(PREVIEW_CACHE_STORE_NAME);
    const request = store.get(cacheKey);

    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => reject(request.error);
  });
}

export async function writePreviewCacheBlob(cacheKey, blob) {
  const database = await openPreviewCacheDatabase();
  if (!database) {
    return;
  }

  return new Promise((resolve, reject) => {
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

  const cacheKeys = [getBookmarkPreviewCacheKey(bookmarkId), getLegacyPreviewCacheKey(url)].filter(Boolean);
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
  if (bookmarkCacheKey) {
    const bookmarkBlob = await readPreviewCacheBlob(bookmarkCacheKey);
    if (bookmarkBlob) {
      return {
        blob: bookmarkBlob,
        source: "bookmark",
      };
    }
  }

  const legacyCacheKey = getLegacyPreviewCacheKey(url);
  if (!legacyCacheKey) {
    return null;
  }

  const legacyBlob = await readPreviewCacheBlob(legacyCacheKey);
  if (legacyBlob && bookmarkCacheKey) {
    await writePreviewCacheBlob(bookmarkCacheKey, legacyBlob).catch(() => {});
  }

  if (!legacyBlob) {
    return null;
  }

  return {
    blob: legacyBlob,
    source: "legacy",
  };
}

export async function cacheCapturedPreview(bookmarkId, url, dataUrl) {
  if (!dataUrl || (!bookmarkId && !url)) {
    return false;
  }

  const response = await fetch(dataUrl);
  const blob = await response.blob();

  return writePreviewBlobForBookmark(bookmarkId, url, blob);
}

export async function cacheCapturedPreviewBlob(bookmarkId, url, blob) {
  if (!bookmarkId && !url) {
    return false;
  }

  return writePreviewBlobForBookmark(bookmarkId, url, blob);
}
