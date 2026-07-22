import { useEffect, useMemo, useRef, useState } from "react";
import { cacheCapturedPreview, cacheCapturedPreviewBlob } from "./previewCache";

const LAST_FOLDER_STORAGE_KEY = "gridmarks-last-save-folder-id";

function getFolderIconPath(variant) {
  if (variant === "outlined") {
    return "M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2m0 12H4V8h16z";
  }

  return "M19.5 6.5H11.7l-1.4-1.4A2 2 0 0 0 8.9 4.5H5a2 2 0 0 0-2 2v10.5a2 2 0 0 0 2 2h14.5a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2Z";
}

function FolderIcon({ variant = "outlined" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={getFolderIconPath(variant)} />
    </svg>
  );
}

function DeleteOutlinedIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z" />
    </svg>
  );
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function isBookmarkableUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeComparableUrl(url) {
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

function findBookmarkByUrl(nodes, targetUrl) {
  const normalizedTargetUrl = normalizeComparableUrl(targetUrl);

  for (const node of nodes) {
    if (Array.isArray(node.children)) {
      const nested = findBookmarkByUrl(node.children, targetUrl);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (node.url && normalizeComparableUrl(node.url) === normalizedTargetUrl) {
      return node;
    }
  }

  return null;
}

function extractFolderTree(nodes) {
  return nodes
    .filter((node) => Array.isArray(node.children))
    .flatMap((node) => {
      if (node.id === "0") {
        return extractFolderTree(node.children ?? []);
      }

      return [
        {
          id: node.id,
          title: node.title || "Untitled folder",
          children: extractFolderTree(node.children ?? []),
        },
      ];
    });
}

function flattenFolders(nodes, depth = 0) {
  return nodes.flatMap((node) => [
    {
      id: node.id,
      title: node.title,
      depth,
    },
    ...flattenFolders(node.children ?? [], depth + 1),
  ]);
}

function findFolderPath(nodes, targetId, trail = []) {
  for (const node of nodes) {
    const nextTrail = [...trail, node.id];
    if (node.id === targetId) {
      return nextTrail;
    }

    const nested = findFolderPath(node.children ?? [], targetId, nextTrail);
    if (nested.length) {
      return nested;
    }
  }

  return [];
}

function getFolderTrailIds(nodes, targetId) {
  return findFolderPath(nodes, targetId);
}

function getDefaultFolderId(folders, lastFolderId) {
  if (lastFolderId && folders.some((folder) => folder.id === lastFolderId)) {
    return lastFolderId;
  }

  const bookmarksBar = folders.find((folder) => folder.id === "1");
  return bookmarksBar?.id || folders[0]?.id || null;
}

function getInitialFolderIdForBookmark(folders, bookmark, lastFolderId) {
  if (bookmark?.parentId && folders.some((folder) => folder.id === bookmark.parentId)) {
    return bookmark.parentId;
  }

  return getDefaultFolderId(folders, lastFolderId);
}

function FolderOption({
  depth,
  expandedFolderIds,
  node,
  onSelect,
  onToggle,
  selectedFolderId,
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedFolderIds.has(node.id);

  return (
    <>
      <button
        type="button"
        className={`save-popup-folder-option ${selectedFolderId === node.id ? "is-selected" : ""}`}
        style={{ "--folder-depth": depth }}
        onClick={() => onSelect(node.id)}
      >
        <span
          className={`save-popup-folder-caret ${hasChildren ? "" : "is-placeholder"} ${isExpanded ? "is-expanded" : ""}`}
          onClick={(event) => {
            if (!hasChildren) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            onToggle(node.id);
          }}
          aria-hidden="true"
        >
          {hasChildren ? (
            <svg viewBox="0 0 24 24">
              <path d="M8 5v14l8-7-8-7Z" />
            </svg>
          ) : null}
        </span>
        <span className="save-popup-folder-icon">
          <FolderIcon variant="outlined" />
        </span>
        <span className="save-popup-folder-title">{node.title}</span>
      </button>
      {hasChildren && isExpanded ? (
        <div className="save-popup-folder-children">
          {node.children.map((child) => (
            <FolderOption
              key={child.id}
              depth={depth + 1}
              expandedFolderIds={expandedFolderIds}
              node={child}
              onSelect={onSelect}
              onToggle={onToggle}
              selectedFolderId={selectedFolderId}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getPreviewGeometry(containerRect, imageSize, scale) {
  if (!containerRect || !imageSize.width || !imageSize.height) {
    return null;
  }

  const containerWidth = containerRect.width;
  const containerHeight = containerRect.height;
  const imageRatio = imageSize.width / imageSize.height;
  const containerRatio = containerWidth / containerHeight;

  let baseWidth = containerWidth;
  let baseHeight = containerHeight;

  if (imageRatio > containerRatio) {
    baseHeight = containerHeight;
    baseWidth = baseHeight * imageRatio;
  } else {
    baseWidth = containerWidth;
    baseHeight = baseWidth / imageRatio;
  }

  const renderedWidth = baseWidth * scale;
  const renderedHeight = baseHeight * scale;

  return {
    containerWidth,
    containerHeight,
    baseWidth,
    baseHeight,
    renderedWidth,
    renderedHeight,
    maxOffsetX: Math.max(0, (renderedWidth - containerWidth) / 2),
    maxOffsetY: Math.max(0, (renderedHeight - containerHeight) / 2),
  };
}

export default function SavePopup() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookmarkId, setBookmarkId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [folders, setFolders] = useState([]);
  const [folderTree, setFolderTree] = useState([]);
  const [expandedFolderIds, setExpandedFolderIds] = useState(() => new Set());
  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false);
  const [folderMenuPosition, setFolderMenuPosition] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewScale, setPreviewScale] = useState(1);
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 });
  const [previewImageSize, setPreviewImageSize] = useState({ width: 0, height: 0 });
  const [previewFrameSize, setPreviewFrameSize] = useState({ width: 0, height: 0 });
  const [isPreviewDragging, setIsPreviewDragging] = useState(false);
  const [tabInfo, setTabInfo] = useState(null);
  const [status, setStatus] = useState("");
  const [deleted, setDeleted] = useState(false);
  const folderMenuRef = useRef(null);
  const folderTriggerRef = useRef(null);
  const popupCardRef = useRef(null);
  const previewFrameRef = useRef(null);
  const previewImageRef = useRef(null);
  const dragStateRef = useRef(null);
  const previewSaveTimeoutRef = useRef(null);

  useEffect(() => {
    if (!isFolderMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!folderMenuRef.current?.contains(event.target)) {
        setIsFolderMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isFolderMenuOpen]);

  useEffect(
    () => () => {
      if (previewSaveTimeoutRef.current) {
        clearTimeout(previewSaveTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!previewFrameRef.current || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      setPreviewFrameSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(previewFrameRef.current);
    return () => observer.disconnect();
  }, [previewUrl]);

  useEffect(() => {
    const frame = previewFrameRef.current;
    if (!frame) {
      return undefined;
    }

    const handleWheelEvent = (event) => {
      handlePreviewWheel(event);
    };

    frame.addEventListener("wheel", handleWheelEvent, { passive: false });
    return () => {
      frame.removeEventListener("wheel", handleWheelEvent);
    };
  }, [previewImageSize, previewFrameSize, previewScale, previewOffset, tabInfo]);

  useEffect(() => {
    if (!isFolderMenuOpen) {
      return undefined;
    }

    const updateFolderMenuPosition = () => {
      const triggerRect = folderTriggerRef.current?.getBoundingClientRect();
      const cardRect = popupCardRef.current?.getBoundingClientRect();
      if (!triggerRect) {
        return;
      }
      if (!cardRect) {
        return;
      }

      const menuTop = 8;
      const controlTop = triggerRect.top - cardRect.top;
      const menuHeight = Math.max(0, controlTop - menuTop);

      setFolderMenuPosition({
        top: menuTop,
        left: triggerRect.left - cardRect.left,
        width: triggerRect.width,
        height: menuHeight,
      });
    };

    updateFolderMenuPosition();
    window.addEventListener("resize", updateFolderMenuPosition);

    return () => {
      window.removeEventListener("resize", updateFolderMenuPosition);
    };
  }, [isFolderMenuOpen]);

  useEffect(() => {
    let cancelled = false;

    const initializePopup = async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });

        if (!tab?.url || !isBookmarkableUrl(tab.url)) {
          throw new Error("The current tab cannot be bookmarked from this popup.");
        }

        const [tree, storedFolderId] = await Promise.all([
          chrome.bookmarks.getTree(),
          chrome.storage.local.get(LAST_FOLDER_STORAGE_KEY).then((result) => result[LAST_FOLDER_STORAGE_KEY] || ""),
        ]);
        const nextFolderTree = extractFolderTree(tree);
        const nextFolders = flattenFolders(nextFolderTree);
        const existingBookmark = findBookmarkByUrl(tree, tab.url);
        const initialFolderId = getInitialFolderIdForBookmark(nextFolders, existingBookmark, storedFolderId);

        if (!initialFolderId) {
          throw new Error("No bookmark folders are available.");
        }

        const activeBookmark =
          existingBookmark ??
          (await chrome.bookmarks.create({
            parentId: initialFolderId,
            title: tab.title || getHostname(tab.url),
            url: tab.url,
          }));

        const capturedPreviewUrl = await chrome.tabs
          .captureVisibleTab(tab.windowId, {
            format: "jpeg",
            quality: 80,
          })
          .catch(() => "");

        if (capturedPreviewUrl) {
          try {
            await cacheCapturedPreview(activeBookmark.id, activeBookmark.url || tab.url, capturedPreviewUrl);
          } catch {
            // Ignore preview cache failures and keep the in-popup preview only.
          }
        }

        if (cancelled) {
          return;
        }

        setTabInfo({
          title: activeBookmark.title || tab.title || getHostname(tab.url),
          incognito: Boolean(tab.incognito),
          url: activeBookmark.url || tab.url,
          faviconUrl: tab.favIconUrl || "",
        });
        setFolders(nextFolders);
        setFolderTree(nextFolderTree);
        setFolderId(initialFolderId);
        setBookmarkId(activeBookmark.id);
        setPreviewUrl(capturedPreviewUrl);
        setExpandedFolderIds(new Set(findFolderPath(nextFolderTree, initialFolderId)));
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Unable to save bookmark.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void initializePopup();

    return () => {
      cancelled = true;
    };
  }, []);

  const currentFolder = useMemo(
    () => folders.find((folder) => folder.id === folderId) ?? null,
    [folderId, folders],
  );

  const previewGeometry = useMemo(
    () =>
      getPreviewGeometry(
        previewFrameSize.width && previewFrameSize.height
          ? { width: previewFrameSize.width, height: previewFrameSize.height }
          : null,
        previewImageSize,
        previewScale,
      ),
    [previewFrameSize, previewImageSize, previewScale],
  );

  const persistAdjustedPreview = async (nextScale = previewScale, nextOffset = previewOffset) => {
    if (!tabInfo?.url || !previewImageRef.current || !previewImageSize.width || !previewFrameRef.current) {
      return;
    }

    const geometry = getPreviewGeometry(previewFrameSize.width && previewFrameSize.height ? previewFrameSize : null, previewImageSize, nextScale);
    if (!geometry) {
      return;
    }

    const outputWidth = 1200;
    const outputHeight = Math.round(outputWidth * (geometry.containerHeight / geometry.containerWidth));
    const scaleFactor = outputWidth / geometry.containerWidth;
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, outputWidth, outputHeight);

    const drawWidth = geometry.renderedWidth * scaleFactor;
    const drawHeight = geometry.renderedHeight * scaleFactor;
    const drawX = ((geometry.containerWidth - geometry.renderedWidth) / 2 + nextOffset.x) * scaleFactor;
    const drawY = ((geometry.containerHeight - geometry.renderedHeight) / 2 + nextOffset.y) * scaleFactor;
    context.drawImage(previewImageRef.current, drawX, drawY, drawWidth, drawHeight);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.9);
    });

    if (blob) {
      await cacheCapturedPreviewBlob(bookmarkId, tabInfo.url, blob);
    }
  };

  const scheduleAdjustedPreviewPersist = (nextScale, nextOffset) => {
    if (previewSaveTimeoutRef.current) {
      clearTimeout(previewSaveTimeoutRef.current);
    }

    previewSaveTimeoutRef.current = window.setTimeout(() => {
      void persistAdjustedPreview(nextScale, nextOffset);
    }, 160);
  };

  const clampPreviewOffset = (nextOffset, scale = previewScale) => {
    const geometry = getPreviewGeometry(previewFrameSize.width && previewFrameSize.height ? previewFrameSize : null, previewImageSize, scale);
    if (!geometry) {
      return nextOffset;
    }

    return {
      x: clamp(nextOffset.x, -geometry.maxOffsetX, geometry.maxOffsetX),
      y: clamp(nextOffset.y, -geometry.maxOffsetY, geometry.maxOffsetY),
    };
  };

  const handlePreviewWheel = (event) => {
    if (!previewImageSize.width || !previewFrameRef.current) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }
    const frameRect = previewFrameRef.current.getBoundingClientRect();
    const pointerX = event.clientX - frameRect.left;
    const pointerY = event.clientY - frameRect.top;
    const relativeX = pointerX - frameRect.width / 2;
    const relativeY = pointerY - frameRect.height / 2;
    const scaleDelta = event.deltaY < 0 ? 0.12 : -0.12;
    const nextScale = clamp(Number((previewScale + scaleDelta).toFixed(3)), 1, 3);

    if (nextScale === previewScale) {
      return;
    }

    const pointX = (relativeX - previewOffset.x) / previewScale;
    const pointY = (relativeY - previewOffset.y) / previewScale;
    const nextOffset = clampPreviewOffset(
      {
        x: relativeX - pointX * nextScale,
        y: relativeY - pointY * nextScale,
      },
      nextScale,
    );

    setPreviewScale(nextScale);
    setPreviewOffset(nextOffset);
    scheduleAdjustedPreviewPersist(nextScale, nextOffset);
  };

  const handlePreviewPointerDown = (event) => {
    if (!previewImageSize.width) {
      return;
    }

    setIsPreviewDragging(true);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originOffset: previewOffset,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePreviewPointerMove = (event) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const nextOffset = clampPreviewOffset({
      x: dragState.originOffset.x + (event.clientX - dragState.startX),
      y: dragState.originOffset.y + (event.clientY - dragState.startY),
    });
    setPreviewOffset(nextOffset);
  };

  const handlePreviewPointerUp = (event) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = null;
    setIsPreviewDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    scheduleAdjustedPreviewPersist(previewScale, previewOffset);
  };

  const moveBookmarkToFolder = async (nextFolderId) => {
    if (!bookmarkId || !nextFolderId || nextFolderId === folderId) {
      return;
    }

    try {
      await chrome.bookmarks.move(bookmarkId, {
        parentId: nextFolderId,
      });
      await chrome.storage.local.set({
        [LAST_FOLDER_STORAGE_KEY]: nextFolderId,
      });
      setFolderId(nextFolderId);
      setExpandedFolderIds((current) => {
        const next = new Set(current);
        for (const id of findFolderPath(folderTree, nextFolderId)) {
          next.add(id);
        }
        return next;
      });
      setIsFolderMenuOpen(false);
    } catch (nextError) {
      setStatus(nextError instanceof Error ? nextError.message : "Unable to move bookmark.");
    }
  };

  const handleFolderToggle = (targetId) => {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(targetId)) {
        next.delete(targetId);
      } else {
        next.add(targetId);
      }
      return next;
    });
  };

  const handleDelete = async () => {
    if (!bookmarkId) {
      return;
    }

    try {
      await chrome.bookmarks.remove(bookmarkId);
      setDeleted(true);
      setStatus("Bookmark deleted");
      window.close();
    } catch (nextError) {
      setStatus(nextError instanceof Error ? nextError.message : "Unable to delete bookmark.");
    }
  };

  const handleOpenGridmarks = async () => {
    try {
      await chrome.runtime.sendMessage({
        type: "open-gridmarks",
        folderId,
        bookmarkId,
        incognito: Boolean(tabInfo?.incognito),
      });
      window.close();
    } catch (nextError) {
      setStatus(nextError instanceof Error ? nextError.message : "Unable to open Gridmarks.");
    }
  };

  if (loading) {
    return (
      <main className="save-popup-shell is-loading">
        <p>Saving current page…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="save-popup-shell">
      <section className="save-popup-card" ref={popupCardRef}>
          <p className="save-popup-error">{error}</p>
          <button type="button" className="save-popup-primary-button" onClick={handleOpenGridmarks}>
            Open Gridmarks
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="save-popup-shell">
      <section className="save-popup-card" ref={popupCardRef}>
        <div className="save-popup-preview-frame">
          {previewUrl ? (
            <div
              ref={previewFrameRef}
              className={`save-popup-preview-interactive ${isPreviewDragging ? "is-dragging" : ""}`}
              onPointerDown={handlePreviewPointerDown}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerUp}
              onPointerCancel={handlePreviewPointerUp}
            >
              <img
                ref={previewImageRef}
                className="save-popup-preview-image"
                src={previewUrl}
                alt=""
                draggable="false"
                onLoad={(event) => {
                  setPreviewImageSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  });
                  const frameRect = previewFrameRef.current?.getBoundingClientRect();
                  if (frameRect) {
                    setPreviewFrameSize({
                      width: frameRect.width,
                      height: frameRect.height,
                    });
                  }
                }}
                style={{
                  width: previewGeometry ? `${previewGeometry.baseWidth}px` : "100%",
                  height: previewGeometry ? `${previewGeometry.baseHeight}px` : "100%",
                  left: "50%",
                  top: "50%",
                  transform: `translate(calc(-50% + ${previewOffset.x}px), calc(-50% + ${previewOffset.y}px)) scale(${previewScale})`,
                }}
              />
            </div>
          ) : (
            <div className="save-popup-preview-fallback">
              <span>{getHostname(tabInfo?.url || "")}</span>
            </div>
          )}
        </div>

        <div className="save-popup-title-row">
          {tabInfo?.faviconUrl ? <img className="save-popup-favicon" src={tabInfo.faviconUrl} alt="" /> : null}
          <strong className="save-popup-title">{tabInfo?.title || "Untitled bookmark"}</strong>
        </div>

        <label className="save-popup-field">
          <span className="save-popup-field-label">Folder</span>
          <div className="save-popup-folder-picker" ref={folderMenuRef}>
            <button
              type="button"
              className="save-popup-select"
              ref={folderTriggerRef}
              onClick={() => setIsFolderMenuOpen((current) => !current)}
              disabled={deleted}
              aria-expanded={isFolderMenuOpen}
            >
              <span className="save-popup-select-value">
                <span className="save-popup-folder-icon">
                  <FolderIcon variant="outlined" />
                </span>
                <span className="save-popup-select-label">{currentFolder?.title || "Select folder"}</span>
              </span>
            </button>
            {isFolderMenuOpen && folderMenuPosition ? (
              <div
                className="save-popup-folder-menu"
                style={{
                  top: `${folderMenuPosition.top}px`,
                  left: `${folderMenuPosition.left}px`,
                  width: `${folderMenuPosition.width}px`,
                  height: `${folderMenuPosition.height}px`,
                }}
              >
                {folderTree.map((node) => (
                  <FolderOption
                    key={node.id}
                    depth={0}
                    expandedFolderIds={expandedFolderIds}
                    node={node}
                    onSelect={moveBookmarkToFolder}
                    onToggle={handleFolderToggle}
                    selectedFolderId={folderId}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </label>

        <div className="save-popup-actions">
          <button
            type="button"
            className="save-popup-icon-button"
            onClick={handleDelete}
            disabled={deleted}
            aria-label="Delete bookmark"
            title="Delete bookmark"
          >
            <DeleteOutlinedIcon />
          </button>
          <button type="button" className="save-popup-primary-button" onClick={handleOpenGridmarks}>
            View in Bookmarks
          </button>
        </div>

      </section>
    </main>
  );
}
