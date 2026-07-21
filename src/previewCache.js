export function getPreviewUrl(url) {
  return `https://image.thum.io/get/width/1200/crop/720/noanimate/${url}`;
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

export async function cacheCapturedPreview(url, dataUrl) {
  if (!url || !dataUrl) {
    return false;
  }

  const response = await fetch(dataUrl);
  const blob = await response.blob();

  if (!blob.size || !blob.type.startsWith("image/")) {
    return false;
  }

  await writePreviewCacheBlob(getPreviewUrl(url), blob);
  return true;
}

export async function cacheCapturedPreviewBlob(url, blob) {
  if (!url || !(blob instanceof Blob) || !blob.size || !blob.type.startsWith("image/")) {
    return false;
  }

  await writePreviewCacheBlob(getPreviewUrl(url), blob);
  return true;
}
