import { useEffect, useMemo, useRef, useState } from "react";
import { getPreviewUrl, readPreviewCacheBlob, writePreviewCacheBlob } from "./previewCache";

const FALLBACK_TREE = [
  {
    id: "1",
    title: "Bookmarks Bar",
    children: [
      {
        id: "11",
        title: "Functional",
        children: [
          {
            id: "111",
            title: "Tools / Resources",
            children: [
              { id: "1111", title: "Chrome Extensions", url: "https://developer.chrome.com/docs/extensions/" },
              { id: "1112", title: "MDN Web Docs", url: "https://developer.mozilla.org/" },
            ],
          },
          {
            id: "112",
            title: "Inspiration",
            children: [
              { id: "1121", title: "Material 3", url: "https://m3.material.io/" },
              { id: "1122", title: "Google Design", url: "https://design.google/" },
            ],
          },
          {
            id: "113",
            title: "References",
            children: [
              { id: "1131", title: "Bookmarks API", url: "https://developer.chrome.com/docs/extensions/reference/api/bookmarks" },
            ],
          },
        ],
      },
      {
        id: "12",
        title: "Reading List",
        children: [
          { id: "121", title: "OpenAI", url: "https://openai.com/" },
          { id: "122", title: "YouTube", url: "https://youtube.com/" },
        ],
      },
    ],
  },
  {
    id: "2",
    title: "Other Bookmarks",
    children: [{ id: "21", title: "Shopping list", url: "https://shopping.google.com/" }],
  },
];

function isFolder(node) {
  return !node.url;
}

function isSyntheticRoot(node) {
  return isFolder(node) && !node.title && !node.url;
}

function getVisibleRootFolders(nodes) {
  if (nodes.length === 1 && isSyntheticRoot(nodes[0])) {
    return (nodes[0].children ?? []).filter(isFolder);
  }

  return nodes.filter(isFolder);
}

function findNodeById(nodes, targetId) {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node;
    }

    if (node.children?.length) {
      const match = findNodeById(node.children, targetId);
      if (match) {
        return match;
      }
    }
  }

  return null;
}

function findParentId(nodes, targetId, parentId = null) {
  for (const node of nodes) {
    if (node.id === targetId) {
      return parentId;
    }

    if (node.children?.length) {
      const nested = findParentId(node.children, targetId, node.id);
      if (nested !== null) {
        return nested;
      }
    }
  }

  return null;
}

function folderContainsId(node, targetId) {
  if (!node || !isFolder(node)) {
    return false;
  }

  for (const child of node.children ?? []) {
    if (child.id === targetId) {
      return true;
    }

    if (folderContainsId(child, targetId)) {
      return true;
    }
  }

  return false;
}

function buildPath(nodes, targetId, trail = []) {
  for (const node of nodes) {
    const nextTrail = isFolder(node) ? trail.concat([{ id: node.id, title: node.title || "Untitled" }]) : trail;

    if (node.id === targetId) {
      return nextTrail;
    }

    if (node.children?.length) {
      const nested = buildPath(node.children, targetId, nextTrail);
      if (nested.length) {
        return nested;
      }
    }
  }

  return [];
}

function getPathIds(nodes, targetId) {
  return buildPath(nodes, targetId).map((item) => item.id);
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getFaviconUrl(url) {
  return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`;
}

function getDomainTheme(hostname) {
  let hash = 0;
  for (const char of hostname) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }

  return `hsl(${hash} 48% 52%)`;
}

function truncateDomain(hostname, maxLength = 20) {
  if (hostname.length <= maxLength) {
    return hostname;
  }

  const segments = hostname.split(".");
  const tld = segments.pop() ?? "";
  const prefixLength = Math.max(6, maxLength - tld.length - 2);
  return `${hostname.slice(0, prefixLength)}…${tld}`;
}

function isValidBookmarkUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeBookmarkUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
    return trimmed;
  }

  return `http://${trimmed}`;
}

function getInitialSelectedFolderId() {
  if (typeof window === "undefined") {
    return "1";
  }

  const folderId = new URLSearchParams(window.location.search).get("folder");
  if (folderId) {
    return folderId;
  }

  return window.localStorage.getItem("gridmarks-selected-folder-id") || "1";
}

function getInitialTargetBookmarkId() {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("bookmark") || "";
}

function getDeletionToastLabel(node) {
  const fallbackLabel = isFolder(node) ? "Folder" : "Bookmark";
  return `"${node?.title || fallbackLabel}" deleted`;
}

function isLikelyBlockedPreviewImage(image) {
  const sampleSize = 24;
  const canvas = document.createElement("canvas");
  canvas.width = sampleSize;
  canvas.height = sampleSize;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return false;
  }

  try {
    context.drawImage(image, 0, 0, sampleSize, sampleSize);
    const { data } = context.getImageData(0, 0, sampleSize, sampleSize);
    let brightPixels = 0;
    let mutedPixels = 0;
    let darkPixels = 0;
    let edgeBrightPixels = 0;
    let edgePixels = 0;

    for (let y = 0; y < sampleSize; y += 1) {
      for (let x = 0; x < sampleSize; x += 1) {
        const index = (y * sampleSize + x) * 4;
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];

        if (alpha < 16) {
          continue;
        }

        const maxChannel = Math.max(red, green, blue);
        const minChannel = Math.min(red, green, blue);
        const luminance = (red + green + blue) / 3;
        const saturation = maxChannel - minChannel;
        const isEdgePixel = x === 0 || y === 0 || x === sampleSize - 1 || y === sampleSize - 1;

        if (luminance >= 242) {
          brightPixels += 1;
          if (isEdgePixel) {
            edgeBrightPixels += 1;
          }
        }

        if (saturation <= 18) {
          mutedPixels += 1;
        }

        if (luminance <= 130) {
          darkPixels += 1;
        }

        if (isEdgePixel) {
          edgePixels += 1;
        }
      }
    }

    const totalPixels = sampleSize * sampleSize;
    const brightRatio = brightPixels / totalPixels;
    const mutedRatio = mutedPixels / totalPixels;
    const darkRatio = darkPixels / totalPixels;
    const edgeBrightRatio = edgePixels ? edgeBrightPixels / edgePixels : 0;

    return brightRatio >= 0.82 && mutedRatio >= 0.88 && darkRatio >= 0.01 && darkRatio <= 0.18 && edgeBrightRatio >= 0.94;
  } catch {
    return false;
  }
}

function createMultiDragPreview(sourceElement, count, rect) {
  const preview = document.createElement("div");
  const isListRowPreview = Boolean(sourceElement.closest(".content-grid.is-list"));
  const listPreviewWidth = 240;
  const previewWidth = isListRowPreview ? listPreviewWidth : rect.width;
  const stackOffsetX = count > 1 ? 8 : 0;
  const stackOffsetY = count > 1 ? (isListRowPreview ? 2 : 8) : 0;
  preview.style.position = "fixed";
  preview.style.top = "-1000px";
  preview.style.left = "-1000px";
  preview.style.width = `${previewWidth + stackOffsetX}px`;
  preview.style.height = `${rect.height + (isListRowPreview ? 0 : stackOffsetY)}px`;
  preview.style.pointerEvents = "none";
  preview.style.zIndex = "2147483647";
  preview.style.overflow = "visible";

  const createListRowPreview = () => {
    const row = document.createElement("div");
    row.style.position = "absolute";
    row.style.inset = "0 auto auto 0";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "12px";
    row.style.width = `${previewWidth}px`;
    row.style.height = `${rect.height}px`;
    row.style.padding = "8px 14px";
    row.style.border = "1px solid #e0e0e0";
    row.style.borderRadius = "999px";
    row.style.background = "#ffffff";
    row.style.boxShadow = "0 0px 2px #3c404329";
    row.style.boxSizing = "border-box";
    row.style.pointerEvents = "none";
    row.style.color = "#32404d";
    row.style.fontFamily = "system-ui, Inter, sans-serif";

    const sourceIcon = sourceElement.querySelector(".bookmark-favicon, .folder-glyph svg");
    if (sourceIcon) {
      let iconNode;

      if (sourceIcon.tagName.toLowerCase() === "img") {
        iconNode = document.createElement("img");
        iconNode.src = sourceIcon.currentSrc || sourceIcon.src;
        iconNode.alt = "";
        iconNode.style.width = "18px";
        iconNode.style.height = "18px";
        iconNode.style.flex = "0 0 18px";
        iconNode.style.borderRadius = "4px";
      } else {
        iconNode = sourceIcon.cloneNode(true);
        iconNode.style.width = "18px";
        iconNode.style.height = "18px";
        iconNode.style.flex = "0 0 18px";
        iconNode.style.fill = "#5f6368";
      }

      row.appendChild(iconNode);
    }

    const titleSource = sourceElement.querySelector("strong");
    const title = document.createElement("span");
    title.textContent = titleSource?.textContent?.trim() || "";
    title.style.minWidth = "0";
    title.style.overflow = "hidden";
    title.style.textOverflow = "ellipsis";
    title.style.whiteSpace = "nowrap";
    title.style.fontSize = "13px";
    title.style.fontWeight = "500";
    title.style.lineHeight = "1.2";
    row.appendChild(title);

    return row;
  };

  const createClone = () => {
    if (isListRowPreview) {
      return createListRowPreview();
    }

    const clone = sourceElement.cloneNode(true);
    clone.style.position = "absolute";
    clone.style.inset = "0 auto auto 0";
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.margin = "0";
    clone.style.pointerEvents = "none";
    clone.style.boxSizing = "border-box";
    clone.classList.add("is-drag-preview");
    return clone;
  };

  if (count > 1) {
    const stackedClone = createClone();
    stackedClone.style.transform = `translate(${stackOffsetX}px, ${stackOffsetY}px)`;
    stackedClone.style.opacity = "0.92";
    preview.appendChild(stackedClone);
  }

  const primaryClone = createClone();
  preview.appendChild(primaryClone);

  const badge = document.createElement("div");
  badge.style.position = "absolute";
  badge.style.top = "8px";
  badge.style.right = "8px";
  badge.style.display = "flex";
  badge.style.alignItems = "center";
  badge.style.justifyContent = "center";
  badge.style.width = "16px";
  badge.style.height = "16px";
  badge.style.borderRadius = "999px";
  badge.style.background = "#1a73e8";
  badge.style.color = "#ffffff";
  badge.style.fontFamily = "system-ui, Inter, sans-serif";
  badge.style.fontSize = "10px";
  badge.style.fontWeight = "600";
  badge.style.lineHeight = "1";
  badge.style.boxShadow = "0 1px 2px rgba(60, 64, 67, 0.3)";
  badge.textContent = String(count);
  preview.appendChild(badge);

  return preview;
}

function getFolderIconPath(variant) {
  if (variant === "outlined") {
    return "M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2m0 12H4V8h16z";
  }

  return "M19.5 6.5H11.7l-1.4-1.4A2 2 0 0 0 8.9 4.5H5a2 2 0 0 0-2 2v10.5a2 2 0 0 0 2 2h14.5a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2Z";
}

function FolderIcon({ variant }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={getFolderIconPath(variant)} />
    </svg>
  );
}

function updateNodeById(nodes, targetId, updater) {
  return nodes.map((node) => {
    if (node.id === targetId) {
      return updater(node);
    }

    if (node.children?.length) {
      return {
        ...node,
        children: updateNodeById(node.children, targetId, updater),
      };
    }

    return node;
  });
}

function removeNodeById(nodes, targetId) {
  return nodes
    .filter((node) => node.id !== targetId)
    .map((node) => {
      if (!node.children?.length) {
        return node;
      }

      return {
        ...node,
        children: removeNodeById(node.children, targetId),
      };
    });
}

function insertNodeIntoFolder(nodes, folderId, bookmark) {
  return nodes.map((node) => {
    if (node.id === folderId) {
      return {
        ...node,
        children: [...(node.children ?? []), bookmark],
      };
    }

    if (node.children?.length) {
      return {
        ...node,
        children: insertNodeIntoFolder(node.children, folderId, bookmark),
      };
    }

    return node;
  });
}

function moveNodeRelative(nodes, nodeId, targetId, position) {
  let movingNode = null;

  const removeNode = (items) =>
    items
      .filter((node) => {
        if (node.id === nodeId) {
          movingNode = node;
          return false;
        }
        return true;
      })
      .map((node) => {
        if (!node.children?.length) {
          return node;
        }

        return {
          ...node,
          children: removeNode(node.children),
        };
      });

  const insertRelative = (items) => {
    if (!movingNode) {
      return items;
    }

    const result = [];

    for (const node of items) {
      if (node.id === targetId && position === "before") {
        result.push(movingNode);
      }

      if (node.children?.length) {
        result.push({
          ...node,
          children: insertRelative(node.children),
        });
      } else {
        result.push(node);
      }

      if (node.id === targetId && position === "after") {
        result.push(movingNode);
      }
    }

    return result;
  };

  const withoutNode = removeNode(nodes);
  return insertRelative(withoutNode);
}

function reorderChildrenInFolder(nodes, folderId, orderedIds) {
  return nodes.map((node) => {
    if (node.id === folderId) {
      const currentChildren = node.children ?? [];
      const byId = new Map(currentChildren.map((child) => [child.id, child]));
      const nextChildren = orderedIds.map((id) => byId.get(id)).filter(Boolean);
      return {
        ...node,
        children: nextChildren,
      };
    }

    if (!node.children?.length) {
      return node;
    }

    return {
      ...node,
      children: reorderChildrenInFolder(node.children, folderId, orderedIds),
    };
  });
}

function makeLocalBookmarkId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneBookmarkNode(node) {
  return {
    ...node,
    id: makeLocalBookmarkId(),
    children: node.children?.map(cloneBookmarkNode),
  };
}

function collectBookmarkUrls(node) {
  if (!node) {
    return [];
  }

  if (!isFolder(node)) {
    return node.url ? [node.url] : [];
  }

  return (node.children ?? []).flatMap(collectBookmarkUrls);
}

function getInitials(title) {
  const clean = title.trim();
  if (!clean) {
    return "?";
  }

  return clean
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function remapNodeIds(nodes, idMap) {
  return nodes.map((node) => ({
    ...node,
    id: idMap.get(node.id) ?? node.id,
    children: node.children ? remapNodeIds(node.children, idMap) : undefined,
  }));
}

function remapClipboard(clipboard, idMap) {
  const nodes = clipboard?.nodes ?? (clipboard?.node ? [clipboard.node] : []);

  if (!nodes.length) {
    return clipboard;
  }

  return {
    ...clipboard,
    nodes: remapNodeIds(nodes, idMap),
  };
}

function remapSnapshot(snapshot, idMap) {
  return {
    ...snapshot,
    tree: remapNodeIds(snapshot.tree, idMap),
    selectedFolderId: idMap.get(snapshot.selectedFolderId) ?? snapshot.selectedFolderId,
    expandedFolderIds: snapshot.expandedFolderIds.map((id) => idMap.get(id) ?? id),
    bookmarkClipboard: remapClipboard(snapshot.bookmarkClipboard, idMap),
  };
}

function remapHistoryEntry(entry, idMap) {
  return {
    before: remapSnapshot(entry.before, idMap),
    after: remapSnapshot(entry.after, idMap),
  };
}

function TreeNode({
  cutItemIds,
  depth,
  draggingNodeIds,
  dropPlacement,
  dropTargetFolderId,
  expandedFolders,
  folderIconVariant,
  node,
  onDragEnd,
  onDragStart,
  onTreeRowDrop,
  onTreeRowDragOver,
  onTreeRowDragLeave,
  onOpenContextMenu,
  onSelect,
  onToggle,
  renderFolderMenu,
  selectedFolderId,
  sidebarContextMenu,
}) {
  const folderChildren = (node.children ?? []).filter(isFolder);
  const hasFolderChildren = folderChildren.length > 0;
  const isExpanded = expandedFolders.has(node.id);

  return (
    <>
      <div className="tree-node" style={{ "--depth": depth }}>
        <button
          type="button"
          className={`tree-row ${selectedFolderId === node.id ? "is-active" : ""} ${dropTargetFolderId === node.id ? "is-drop-target" : ""} ${draggingNodeIds.includes(node.id) ? "is-dragging" : ""} ${cutItemIds.has(node.id) ? "is-cut" : ""} ${dropPlacement?.targetId === node.id ? `is-drop-${dropPlacement.mode}` : ""}`}
          onClick={() => onSelect(node.id)}
          onDoubleClick={(event) => {
            if (!hasFolderChildren) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            onToggle(node.id);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenContextMenu(node, event.clientX, event.clientY);
          }}
          draggable
          onDragStart={(event) => onDragStart(event, node)}
          onDragEnd={onDragEnd}
          onDragOver={(event) => onTreeRowDragOver(event, node)}
          onDragLeave={() => onTreeRowDragLeave(node.id)}
          onDrop={(event) => onTreeRowDrop(event, node)}
        >
          <span
            className={`tree-caret ${hasFolderChildren ? "" : "is-placeholder"} ${isExpanded ? "is-expanded" : ""}`}
            onClick={(event) => {
              if (!hasFolderChildren) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              onToggle(node.id);
            }}
            aria-hidden="true"
          >
            {hasFolderChildren && (
              <svg viewBox="0 0 24 24">
                <path d="M8 5v14l8-7-8-7Z" />
              </svg>
            )}
          </span>
          <span className="tree-row-icon">
            <FolderIcon variant={folderIconVariant} />
          </span>
          <span className="tree-row-title">{node.title || "Untitled"}</span>
        </button>
        {sidebarContextMenu?.id === node.id &&
          renderFolderMenu(node, {
            className: "bookmark-menu is-context-menu",
            style: {
              left: `${sidebarContextMenu.x}px`,
              top: `${sidebarContextMenu.y}px`,
            },
          })}
      </div>

      {hasFolderChildren && isExpanded && (
        <div className="tree-children">
          {folderChildren.map((child) => (
            <TreeNode
              key={child.id}
              cutItemIds={cutItemIds}
              depth={depth + 1}
              draggingNodeIds={draggingNodeIds}
              dropPlacement={dropPlacement}
              dropTargetFolderId={dropTargetFolderId}
              expandedFolders={expandedFolders}
              folderIconVariant={folderIconVariant}
              node={child}
              onDragEnd={onDragEnd}
              onDragStart={onDragStart}
              onTreeRowDrop={onTreeRowDrop}
              onTreeRowDragOver={onTreeRowDragOver}
              onTreeRowDragLeave={onTreeRowDragLeave}
              onOpenContextMenu={onOpenContextMenu}
              onSelect={onSelect}
              onToggle={onToggle}
              renderFolderMenu={renderFolderMenu}
              selectedFolderId={selectedFolderId}
              sidebarContextMenu={sidebarContextMenu}
            />
          ))}
        </div>
      )}
    </>
  );
}

function App() {
  const initialTargetBookmarkId = getInitialTargetBookmarkId();
  const [tree, setTree] = useState(FALLBACK_TREE);
  const [selectedFolderId, setSelectedFolderId] = useState(getInitialSelectedFolderId);
  const [expandedFolders, setExpandedFolders] = useState(() => new Set(["1"]));
  const [folderSortModes, setFolderSortModes] = useState({});
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [loadingState, setLoadingState] = useState("loading");
  const [failedPreviewUrls, setFailedPreviewUrls] = useState({});
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [sidebarContextMenu, setSidebarContextMenu] = useState(null);
  const [cardMenuPosition, setCardMenuPosition] = useState(null);
  const [createContextMenu, setCreateContextMenu] = useState(null);
  const [bookmarkClipboard, setBookmarkClipboard] = useState(null);
  const [draggingNodeIds, setDraggingNodeIds] = useState([]);
  const [dropTargetFolderId, setDropTargetFolderId] = useState(null);
  const [dropPlacement, setDropPlacement] = useState(null);
  const [editingNode, setEditingNode] = useState(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [createDialog, setCreateDialog] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: "", url: "" });
  const [createDialogErrors, setCreateDialogErrors] = useState({});
  const [folderIconVariant, setFolderIconVariant] = useState(() => {
    if (typeof window === "undefined") {
      return "filled";
    }

    return window.localStorage.getItem("gridmarks-folder-icon-variant") || "filled";
  });
  const [settingsDraft, setSettingsDraft] = useState(() => ({
    folderIconVariant:
      typeof window === "undefined"
        ? "filled"
        : window.localStorage.getItem("gridmarks-folder-icon-variant") || "filled",
  }));
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [toastState, setToastState] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [dragSelection, setDragSelection] = useState(null);
  const [dragItemMetrics, setDragItemMetrics] = useState(null);
  const [isHeaderElevated, setIsHeaderElevated] = useState(false);
  const [cachedPreviewUrls, setCachedPreviewUrls] = useState({});
  const [isCompactSidebar, setIsCompactSidebar] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(max-width: 700px)").matches,
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCompactSearchOpen, setIsCompactSearchOpen] = useState(false);

  const treeRef = useRef(tree);
  const selectedFolderIdRef = useRef(selectedFolderId);
  const expandedFoldersRef = useRef(expandedFolders);
  const bookmarkClipboardRef = useRef(bookmarkClipboard);
  const undoStackRef = useRef(undoStack);
  const redoStackRef = useRef(redoStack);
  const searchInputRef = useRef(null);
  const contentPaneRef = useRef(null);
  const contentGridRef = useRef(null);
  const contentItemRefs = useRef(new Map());
  const previewObjectUrlsRef = useRef(new Map());
  const previewCacheLookupRef = useRef(new Set());
  const previewCacheWriteRef = useRef(new Set());
  const initialBookmarkHandledRef = useRef(false);

  treeRef.current = tree;
  selectedFolderIdRef.current = selectedFolderId;
  expandedFoldersRef.current = expandedFolders;
  bookmarkClipboardRef.current = bookmarkClipboard;
  undoStackRef.current = undoStack;
  redoStackRef.current = redoStack;

  const getFirstFolderId = (nodes) => getVisibleRootFolders(nodes)[0]?.id ?? "";

  const normalizeSelectedFolderId = (nodes, folderId) => {
    const match = folderId ? findNodeById(nodes, folderId) : null;
    if (match && isFolder(match)) {
      return match.id;
    }

    return getFirstFolderId(nodes);
  };

  const normalizeExpandedFolderIds = (nodes, expandedIds, folderId) => {
    const next = new Set(
      (expandedIds ?? []).filter((id) => {
        const node = findNodeById(nodes, id);
        return node && isFolder(node);
      }),
    );

    for (const id of getPathIds(nodes, folderId)) {
      next.add(id);
    }

    return [...next];
  };

  const captureSnapshot = ({
    tree: snapshotTree = treeRef.current,
    selectedFolderId: snapshotFolderId = selectedFolderIdRef.current,
    expandedFolderIds = Array.from(expandedFoldersRef.current),
    bookmarkClipboard: snapshotClipboard = bookmarkClipboardRef.current,
  } = {}) => {
    const nextSelectedFolderId = normalizeSelectedFolderId(snapshotTree, snapshotFolderId);

    return {
      tree: cloneData(snapshotTree),
      selectedFolderId: nextSelectedFolderId,
      expandedFolderIds: normalizeExpandedFolderIds(snapshotTree, expandedFolderIds, nextSelectedFolderId),
      bookmarkClipboard: snapshotClipboard ? cloneData(snapshotClipboard) : null,
    };
  };

  const applySnapshotState = (snapshot) => {
    const nextTree = cloneData(snapshot.tree);
    const nextSelectedFolderId = normalizeSelectedFolderId(nextTree, snapshot.selectedFolderId);
    const nextExpandedFolderIds = normalizeExpandedFolderIds(nextTree, snapshot.expandedFolderIds, nextSelectedFolderId);

    setTree(nextTree);
    setSelectedFolderId(nextSelectedFolderId);
    setExpandedFolders(new Set(nextExpandedFolderIds));
    setBookmarkClipboard(snapshot.bookmarkClipboard ? cloneData(snapshot.bookmarkClipboard) : null);
    setActiveMenuId(null);
    setSidebarContextMenu(null);
    setEditingNode(null);
    setSelectedItemIds([]);
    setSelectionAnchorId(null);

    return {
      tree: nextTree,
      selectedFolderId: nextSelectedFolderId,
      expandedFolderIds: nextExpandedFolderIds,
      bookmarkClipboard: snapshot.bookmarkClipboard ? cloneData(snapshot.bookmarkClipboard) : null,
    };
  };

  const commitTreeChange = (nextTree, options = {}) => {
    const nextSelectedFolderId = normalizeSelectedFolderId(
      nextTree,
      options.selectedFolderId ?? selectedFolderIdRef.current,
    );
    const nextExpandedFolderIds = normalizeExpandedFolderIds(
      nextTree,
      options.expandedFolderIds ?? Array.from(expandedFoldersRef.current),
      nextSelectedFolderId,
    );
    const nextClipboard =
      options.bookmarkClipboard !== undefined ? options.bookmarkClipboard : bookmarkClipboardRef.current;

    setTree(nextTree);
    setSelectedFolderId(nextSelectedFolderId);
    setExpandedFolders(new Set(nextExpandedFolderIds));
    if (options.bookmarkClipboard !== undefined) {
      setBookmarkClipboard(nextClipboard);
    }

    return {
      tree: cloneData(nextTree),
      selectedFolderId: nextSelectedFolderId,
      expandedFolderIds: nextExpandedFolderIds,
      bookmarkClipboard: nextClipboard ? cloneData(nextClipboard) : null,
    };
  };

  const pushHistoryEntry = (before, after) => {
    if (JSON.stringify(before.tree) === JSON.stringify(after.tree)) {
      return;
    }

    setUndoStack((current) => [...current, { before, after }]);
    setRedoStack([]);
  };

  const fetchBookmarksTree = async () => {
    if (!globalThis.chrome?.bookmarks?.getTree) {
      return treeRef.current;
    }

    return chrome.bookmarks.getTree();
  };

  const createBookmarkSubtree = async (node, parentId, index, idMap) => {
    const created = await chrome.bookmarks.create({
      parentId,
      index,
      title: node.title,
      ...(isFolder(node) ? {} : { url: node.url }),
    });

    if (node.id !== created.id) {
      idMap.set(node.id, created.id);
    }

    if (isFolder(node)) {
      for (const [childIndex, child] of (node.children ?? []).entries()) {
        await createBookmarkSubtree(child, created.id, childIndex, idMap);
      }
    }
  };

  const syncFolderChildrenToSnapshot = async (currentChildren, targetChildren, parentId, idMap) => {
    const currentById = new Map(currentChildren.map((child) => [child.id, child]));
    const keptIds = new Set();

    for (const [index, targetChild] of targetChildren.entries()) {
      const currentChild = currentById.get(targetChild.id);

      if (!currentChild) {
        await createBookmarkSubtree(targetChild, parentId, index, idMap);
        const createdId = idMap.get(targetChild.id) ?? targetChild.id;
        keptIds.add(createdId);
        continue;
      }

      keptIds.add(currentChild.id);

      if (currentChild.title !== targetChild.title || (!isFolder(targetChild) && currentChild.url !== targetChild.url)) {
        await chrome.bookmarks.update(currentChild.id, {
          title: targetChild.title,
          ...(isFolder(targetChild) ? {} : { url: targetChild.url }),
        });
      }

      if (currentChild.parentId !== parentId || currentChild.index !== index) {
        await chrome.bookmarks.move(currentChild.id, {
          parentId,
          index,
        });
      }

      if (isFolder(targetChild)) {
        await syncFolderChildrenToSnapshot(currentChild.children ?? [], targetChild.children ?? [], currentChild.id, idMap);
      }
    }

    for (const child of currentChildren) {
      if (keptIds.has(child.id)) {
        continue;
      }

      if (isFolder(child) && chrome.bookmarks.removeTree) {
        await chrome.bookmarks.removeTree(child.id);
      } else {
        await chrome.bookmarks.remove(child.id);
      }
    }
  };

  const restoreSnapshot = async (snapshot) => {
    let appliedSnapshot = snapshot;
    let idMap = new Map();

    if (globalThis.chrome?.bookmarks?.getTree && globalThis.chrome?.bookmarks?.move) {
      const currentTree = treeRef.current;

      for (const targetRoot of snapshot.tree) {
        const currentRoot = findNodeById(currentTree, targetRoot.id);

        if (!currentRoot || !isFolder(targetRoot)) {
          continue;
        }

        await syncFolderChildrenToSnapshot(currentRoot.children ?? [], targetRoot.children ?? [], currentRoot.id, idMap);
      }

      const nextTree = await fetchBookmarksTree();
      if (idMap.size > 0) {
        appliedSnapshot = remapSnapshot(snapshot, idMap);
      }

      applySnapshotState({
        ...appliedSnapshot,
        tree: nextTree,
      });
    } else {
      applySnapshotState(snapshot);
    }

    return {
      appliedSnapshot,
      idMap,
    };
  };

  const handleUndo = async () => {
    const currentUndo = undoStackRef.current;
    if (!currentUndo.length) {
      return;
    }

    const entry = currentUndo[currentUndo.length - 1];
    const { idMap } = await restoreSnapshot(entry.before);
    const remapEntry = (historyEntry) => (idMap.size ? remapHistoryEntry(historyEntry, idMap) : historyEntry);
    const nextUndo = currentUndo.slice(0, -1).map(remapEntry);
    const nextRedo = [...redoStackRef.current.map(remapEntry), remapEntry(entry)];

    setUndoStack(nextUndo);
    setRedoStack(nextRedo);
    setStatusMessage("Undid last change");
  };

  const handleRedo = async () => {
    const currentRedo = redoStackRef.current;
    if (!currentRedo.length) {
      return;
    }

    const entry = currentRedo[currentRedo.length - 1];
    const { idMap } = await restoreSnapshot(entry.after);
    const remapEntry = (historyEntry) => (idMap.size ? remapHistoryEntry(historyEntry, idMap) : historyEntry);
    const nextRedo = currentRedo.slice(0, -1).map(remapEntry);
    const nextUndo = [...undoStackRef.current.map(remapEntry), remapEntry(entry)];

    setRedoStack(nextRedo);
    setUndoStack(nextUndo);
    setStatusMessage("Redid last change");
  };

  useEffect(() => {
    async function loadBookmarks() {
      if (!globalThis.chrome?.bookmarks?.getTree) {
        setLoadingState("demo");
        return;
      }

      try {
        const nodes = await fetchBookmarksTree();
        const visibleNodes = getVisibleRootFolders(nodes);
        const requestedFolderId = getInitialSelectedFolderId();
        const requestedBookmarkId = getInitialTargetBookmarkId();
        const targetParentId = requestedBookmarkId ? findParentId(visibleNodes, requestedBookmarkId) : "";
        const initialId = normalizeSelectedFolderId(nodes, targetParentId || requestedFolderId) || "1";
        setTree(nodes);
        setSelectedFolderId(initialId);
        setExpandedFolders(new Set(getPathIds(nodes, initialId)));
        setUndoStack([]);
        setRedoStack([]);
        setLoadingState("ready");
      } catch {
        setLoadingState("error");
      }
    }

    loadBookmarks();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 700px)");
    const updateSidebarMode = (event) => {
      const matches = typeof event === "boolean" ? event : event.matches;
      setIsCompactSidebar(matches);
      if (!matches) {
        setIsSidebarOpen(false);
        setIsCompactSearchOpen(false);
      }
    };

    updateSidebarMode(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateSidebarMode);
      return () => mediaQuery.removeEventListener("change", updateSidebarMode);
    }

    mediaQuery.addListener(updateSidebarMode);
    return () => mediaQuery.removeListener(updateSidebarMode);
  }, []);

  useEffect(() => {
    if (!activeMenuId && !sidebarContextMenu && !createContextMenu) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const target = event.target;

      if (
        target instanceof Element &&
        target.closest(".bookmark-menu, .card-menu, .tree-row, .dialog-backdrop, .edit-dialog")
      ) {
        return;
      }

      setActiveMenuId(null);
      setSidebarContextMenu(null);
      setCardMenuPosition(null);
      setCreateContextMenu(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [activeMenuId, createContextMenu, sidebarContextMenu]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target;

      if (
        searchInputRef.current &&
        target instanceof Element &&
        !target.closest(".search-field")
      ) {
        searchInputRef.current.blur();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!isCompactSidebar || !isCompactSearchOpen) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isCompactSearchOpen, isCompactSidebar]);

  useEffect(() => {
    const pane = contentPaneRef.current;
    if (!pane) {
      return undefined;
    }

    const updateHeaderState = () => {
      setIsHeaderElevated(pane.scrollTop > 0);
    };

    updateHeaderState();
    pane.addEventListener("scroll", updateHeaderState, { passive: true });
    return () => pane.removeEventListener("scroll", updateHeaderState);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("gridmarks-folder-icon-variant", folderIconVariant);
  }, [folderIconVariant]);

  useEffect(() => {
    if (!selectedFolderId) {
      return;
    }

    window.localStorage.setItem("gridmarks-selected-folder-id", selectedFolderId);
  }, [selectedFolderId]);

  useEffect(() => {
    if (!toastState) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setToastState(null);
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [toastState]);

  const rootFolders = useMemo(() => getVisibleRootFolders(tree), [tree]);
  const selectedFolder = useMemo(() => findNodeById(rootFolders, selectedFolderId) ?? rootFolders[0] ?? null, [rootFolders, selectedFolderId]);
  const selectedFolderSortMode = selectedFolder ? folderSortModes[selectedFolder.id] ?? "manual" : "manual";
  const childItems = useMemo(() => {
    const items = selectedFolder?.children ?? [];
    if (selectedFolderSortMode !== "name") {
      return items;
    }

    return [...items].sort((left, right) =>
      (left.title || "").localeCompare(right.title || "", undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  }, [selectedFolder, selectedFolderSortMode]);
  const normalizedQuery = query.trim().toLowerCase();
  const visiblePreviewCacheKeys = useMemo(
    () =>
      childItems
        .filter((node) => node.url)
        .map((node) => getPreviewUrl(node.url))
        .filter((cacheKey, index, values) => values.indexOf(cacheKey) === index),
    [childItems],
  );
  const breadcrumbs = buildPath(rootFolders, selectedFolder?.id ?? "");
  const protectedFolderIds = useMemo(
    () =>
      new Set(
        rootFolders
          .filter((node) => node.title === "Bookmarks Bar" || node.title === "Other Bookmarks")
          .map((node) => node.id),
      ),
    [rootFolders],
  );
  const cutItemIds = useMemo(
    () =>
      bookmarkClipboard?.mode === "cut"
        ? new Set((bookmarkClipboard.nodes ?? (bookmarkClipboard.node ? [bookmarkClipboard.node] : [])).map((node) => node.id))
        : new Set(),
    [bookmarkClipboard],
  );

  useEffect(() => {
    setSelectedItemIds([]);
    setSelectionAnchorId(null);
  }, [selectedFolderId]);

  useEffect(() => {
    if (!initialTargetBookmarkId || initialBookmarkHandledRef.current) {
      return;
    }

    const targetBookmark = findNodeById(rootFolders, initialTargetBookmarkId);
    if (!targetBookmark || isFolder(targetBookmark)) {
      return;
    }

    const parentId = findParentId(rootFolders, initialTargetBookmarkId);
    if (!parentId) {
      initialBookmarkHandledRef.current = true;
      return;
    }

    initialBookmarkHandledRef.current = true;
    setSelectedFolderId(parentId);
    setSelectedItemIds([initialTargetBookmarkId]);
    setSelectionAnchorId(initialTargetBookmarkId);
    setExpandedFolders((current) => new Set([...current, ...getPathIds(rootFolders, parentId)]));
  }, [initialTargetBookmarkId, rootFolders]);

  useEffect(() => {
    let cancelled = false;

    const loadCachedPreviews = async () => {
      for (const cacheKey of visiblePreviewCacheKeys) {
        if (cachedPreviewUrls[cacheKey] || previewCacheLookupRef.current.has(cacheKey)) {
          continue;
        }

        previewCacheLookupRef.current.add(cacheKey);

        try {
          const blob = await readPreviewCacheBlob(cacheKey);
          if (!cancelled && blob) {
            setCachedPreviewBlob(cacheKey, blob);
          }
        } catch {
          // Ignore preview cache read failures and fall back to the live thumbnail service.
        }
      }
    };

    void loadCachedPreviews();

    return () => {
      cancelled = true;
    };
  }, [cachedPreviewUrls, visiblePreviewCacheKeys]);

  useEffect(
    () => () => {
      for (const objectUrl of previewObjectUrlsRef.current.values()) {
        URL.revokeObjectURL(objectUrl);
      }
      previewObjectUrlsRef.current.clear();
    },
    [],
  );

  const markPreviewFailed = (bookmarkId) => {
    setFailedPreviewUrls((current) => {
      if (current[bookmarkId]) {
        return current;
      }

      return {
        ...current,
        [bookmarkId]: true,
      };
    });
  };

  const setCachedPreviewBlob = (cacheKey, blob) => {
    const existingObjectUrl = previewObjectUrlsRef.current.get(cacheKey);
    if (existingObjectUrl) {
      URL.revokeObjectURL(existingObjectUrl);
    }

    const nextObjectUrl = URL.createObjectURL(blob);
    previewObjectUrlsRef.current.set(cacheKey, nextObjectUrl);
    setCachedPreviewUrls((current) => {
      if (current[cacheKey] === nextObjectUrl) {
        return current;
      }

      return {
        ...current,
        [cacheKey]: nextObjectUrl,
      };
    });
  };

  const cachePreviewImage = async (cacheKey) => {
    if (cachedPreviewUrls[cacheKey] || previewCacheWriteRef.current.has(cacheKey)) {
      return;
    }

    previewCacheWriteRef.current.add(cacheKey);

    try {
      const response = await fetch(cacheKey, {
        cache: "force-cache",
        mode: "cors",
      });

      if (!response.ok) {
        return;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        return;
      }

      const blob = await response.blob();
      if (!blob.size) {
        return;
      }

      await writePreviewCacheBlob(cacheKey, blob);
      setCachedPreviewBlob(cacheKey, blob);
    } catch {
      // Ignore preview cache write failures and continue showing the live thumbnail.
    } finally {
      previewCacheWriteRef.current.delete(cacheKey);
    }
  };

  const handlePreviewImageLoad = (bookmarkId, image, cacheKey, isCachedPreview) => {
    if (!isCachedPreview && isLikelyBlockedPreviewImage(image)) {
      markPreviewFailed(bookmarkId);
      return;
    }

    if (!isCachedPreview) {
      void cachePreviewImage(cacheKey);
    }
  };

  const clearDragState = () => {
    setDraggingNodeIds([]);
    setDropTargetFolderId(null);
    setDropPlacement(null);
    setDragItemMetrics(null);
  };

  const clearSelection = () => {
    setSelectedItemIds([]);
    setSelectionAnchorId(null);
    setDragSelection(null);
  };

  const orderIdsWithinCurrentFolder = (ids) => {
    const idSet = new Set(ids);
    return childItems.filter((node) => idSet.has(node.id)).map((node) => node.id);
  };

  const orderDraggedIds = (ids) => {
    const orderedVisibleIds = orderIdsWithinCurrentFolder(ids);
    if (orderedVisibleIds.length === ids.length) {
      return orderedVisibleIds;
    }

    const orderedVisibleIdSet = new Set(orderedVisibleIds);
    const missingIds = ids.filter((id) => !orderedVisibleIdSet.has(id));
    return [...orderedVisibleIds, ...missingIds];
  };

  const getClipboardNodes = (clipboard = bookmarkClipboard) => clipboard?.nodes ?? (clipboard?.node ? [clipboard.node] : []);

  const copySelectedItems = (mode) => {
    const selectedNodes = orderIdsWithinCurrentFolder(selectedItemIds)
      .map((id) => findNodeById(treeRef.current, id))
      .filter(Boolean)
      .filter((node) => mode !== "cut" || !(isFolder(node) && protectedFolderIds.has(node.id)));

    if (!selectedNodes.length) {
      return;
    }

    setBookmarkClipboard({
      mode,
      nodes: JSON.parse(JSON.stringify(selectedNodes)),
    });
    setActiveMenuId(null);
    setSidebarContextMenu(null);
    setStatusMessage(
      mode === "cut"
        ? `${selectedNodes.length} item${selectedNodes.length > 1 ? "s" : ""} cut`
        : `${selectedNodes.length} item${selectedNodes.length > 1 ? "s" : ""} copied`,
    );
  };

  const moveFolderToFolder = async (sourceId, targetFolderId) => {
    const beforeSnapshot = captureSnapshot();
    const sourceNode = findNodeById(tree, sourceId);
    const targetFolder = findNodeById(tree, targetFolderId);

    if (
      !sourceNode ||
      !targetFolder ||
      !isFolder(sourceNode) ||
      !isFolder(targetFolder) ||
      sourceId === targetFolderId ||
      protectedFolderIds.has(sourceId)
    ) {
      clearDragState();
      return;
    }

    if (folderContainsId(sourceNode, targetFolderId)) {
      clearDragState();
      return;
    }

    if (globalThis.chrome?.bookmarks?.move) {
      const currentParentId = findParentId(tree, sourceId);
      if (currentParentId !== targetFolderId) {
        await chrome.bookmarks.move(sourceId, {
          parentId: targetFolderId,
          index: targetFolder.children?.length ?? 0,
        });
      }
      const nextTree = await fetchBookmarksTree();
      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    } else {
      const removed = removeNodeById(treeRef.current, sourceId);
      const nextTree = insertNodeIntoFolder(removed, targetFolderId, sourceNode);
      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    }

    clearDragState();
  };

  const moveFolderRelativeToSibling = async (sourceId, targetId, position) => {
    const beforeSnapshot = captureSnapshot();
    const sourceNode = findNodeById(tree, sourceId);
    const targetNode = findNodeById(tree, targetId);

    if (
      !sourceNode ||
      !targetNode ||
      !isFolder(sourceNode) ||
      !isFolder(targetNode) ||
      sourceId === targetId ||
      protectedFolderIds.has(sourceId) ||
      protectedFolderIds.has(targetId)
    ) {
      clearDragState();
      return;
    }

    if (folderContainsId(sourceNode, targetId)) {
      clearDragState();
      return;
    }

    const targetParentId = findParentId(tree, targetId);
    const currentParentId = findParentId(tree, sourceId);
    const targetParent = targetParentId ? findNodeById(tree, targetParentId) : null;
    const siblingItems = targetParent ? (targetParent.children ?? []).filter(isFolder) : rootFolders;
    const remainingIds = siblingItems.map((node) => node.id).filter((id) => id !== sourceId);
    const targetIndex = remainingIds.findIndex((id) => id === targetId);

    if (targetIndex === -1) {
      clearDragState();
      return;
    }

    const nextIndex = position === "before" ? targetIndex : targetIndex + 1;
    const orderedIds = [
      ...remainingIds.slice(0, nextIndex),
      sourceId,
      ...remainingIds.slice(nextIndex),
    ];

    if (globalThis.chrome?.bookmarks?.move) {
      for (const [index, id] of orderedIds.entries()) {
        await chrome.bookmarks.move(id, {
          parentId: targetParentId ?? undefined,
          index,
        });
      }
      const nextTree = await fetchBookmarksTree();
      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    } else if (targetParentId) {
      const nextTree = reorderChildrenInFolder(treeRef.current, targetParentId, orderedIds);
      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    } else {
      const nextTree = orderedIds.map((id) => findNodeById(treeRef.current, id)).filter(Boolean);
      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    }

    if (currentParentId !== targetParentId) {
      setExpandedFolders((current) => new Set([...current, targetParentId].filter(Boolean)));
    }

    clearDragState();
  };

  const moveNodesToFolder = async (sourceIds, targetFolderId) => {
    const beforeSnapshot = captureSnapshot();
    const orderedSourceIds = orderDraggedIds(sourceIds);
    const targetFolder = findNodeById(tree, targetFolderId);

    if (!orderedSourceIds.length || !targetFolder || !isFolder(targetFolder)) {
      clearDragState();
      return;
    }

    for (const sourceId of orderedSourceIds) {
      const sourceNode = findNodeById(tree, sourceId);

      if (!sourceNode || sourceNode.id === targetFolderId) {
        clearDragState();
        return;
      }

      if (isFolder(sourceNode) && folderContainsId(sourceNode, targetFolderId)) {
        setStatusMessage("Cannot move a folder into itself");
        clearDragState();
        return;
      }
    }

    if (globalThis.chrome?.bookmarks?.move) {
      let nextIndex = targetFolder.children?.length ?? 0;

      for (const sourceId of orderedSourceIds) {
        const currentParentId = findParentId(tree, sourceId);
        if (currentParentId === targetFolderId) {
          continue;
        }

        await chrome.bookmarks.move(sourceId, {
          parentId: targetFolderId,
          index: nextIndex,
        });
        nextIndex += 1;
      }
      const nextTree = await fetchBookmarksTree();
      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    } else {
      let nextTree = treeRef.current;

      for (const sourceId of orderedSourceIds) {
        const liveNode = findNodeById(nextTree, sourceId);
        if (!liveNode) {
          continue;
        }

        const removed = removeNodeById(nextTree, sourceId);
        nextTree = insertNodeIntoFolder(removed, targetFolderId, liveNode);
      }

      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    }

    const movedKinds = orderedSourceIds.map((id) => findNodeById(tree, id)).filter(Boolean);
    const allBookmarks = movedKinds.every((node) => !isFolder(node));
    setStatusMessage(allBookmarks && movedKinds.length > 1 ? `${movedKinds.length} bookmarks moved` : `${allBookmarks ? "Bookmark" : "Item"} moved`);
    clearDragState();
    clearSelection();
  };

  const moveNodesRelativeToSibling = async (sourceIds, targetId, position) => {
    const beforeSnapshot = captureSnapshot();
    const orderedSourceIds = orderIdsWithinCurrentFolder(sourceIds);
    const targetNode = findNodeById(tree, targetId);

    if (!orderedSourceIds.length || !targetNode || orderedSourceIds.includes(targetId)) {
      clearDragState();
      return;
    }

    const targetParentId = findParentId(tree, targetId);
    if (targetParentId !== selectedFolder?.id) {
      clearDragState();
      return;
    }

    const remainingIds = childItems
      .map((node) => node.id)
      .filter((id) => !orderedSourceIds.includes(id));
    const targetIndex = remainingIds.findIndex((id) => id === targetId);

    if (targetIndex === -1) {
      clearDragState();
      return;
    }

    const nextIndex = position === "before" ? targetIndex : targetIndex + 1;
    const nextOrder = [
      ...remainingIds.slice(0, nextIndex),
      ...orderedSourceIds,
      ...remainingIds.slice(nextIndex),
    ];

    if (globalThis.chrome?.bookmarks?.move) {
      for (const [index, id] of nextOrder.entries()) {
        await chrome.bookmarks.move(id, {
          parentId: selectedFolder.id,
          index,
        });
      }
      const nextTree = await fetchBookmarksTree();
      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    } else {
      const nextTree = reorderChildrenInFolder(treeRef.current, selectedFolder.id, nextOrder);
      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    }

    setFolderSortModes((current) => ({
      ...current,
      [selectedFolder.id]: "manual",
    }));
    setStatusMessage(orderedSourceIds.length > 1 ? `${orderedSourceIds.length} bookmarks reordered` : "Bookmark reordered");
    clearDragState();
  };

  const handleDragStart = (event, node) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const draggedIds =
      selectedItemIds.includes(node.id) && selectedItemIds.length > 0
        ? orderIdsWithinCurrentFolder(selectedItemIds)
        : [node.id];
    const isMultiDrag = draggedIds.length > 1;
    event.dataTransfer.effectAllowed = isMultiDrag ? "copyMove" : "move";
    event.dataTransfer.setData("text/plain", draggedIds.join(","));
    setActiveMenuId(null);
    setSidebarContextMenu(null);
    setDraggingNodeIds(draggedIds);
    setDragItemMetrics({
      width: rect.width,
      height: rect.height,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    });

    if (isMultiDrag) {
      const preview = createMultiDragPreview(event.currentTarget, draggedIds.length, rect);
      document.body.appendChild(preview);
      event.dataTransfer.setDragImage(preview, event.clientX - rect.left, event.clientY - rect.top);
      requestAnimationFrame(() => preview.remove());
    }
  };

  const handleDragEnd = () => {
    clearDragState();
  };

  const handleDropOnFolder = async (event, folderId) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceIds = (event.dataTransfer.getData("text/plain") || draggingNodeIds.join(","))
      .split(",")
      .filter(Boolean);
    if (!sourceIds.length) {
      clearDragState();
      return;
    }

    await moveNodesToFolder(sourceIds, folderId);
  };

  const handleTreeRowDragOver = (event, node) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = draggingNodeIds.length > 1 ? "copy" : "move";

    if (!draggingNodeIds.length || draggingNodeIds.includes(node.id)) {
      return;
    }

    const sourceId = draggingNodeIds[0];
    const sourceNodes = draggingNodeIds
      .map((id) => findNodeById(tree, id))
      .filter(Boolean);
    const canReorderFolders =
      draggingNodeIds.length === 1 &&
      sourceNodes.length === 1 &&
      isFolder(sourceNodes[0]) &&
      !protectedFolderIds.has(sourceId);

    if (!sourceNodes.length) {
      return;
    }

    let nextPlacement;

    if (canReorderFolders) {
      const rect = event.currentTarget.getBoundingClientRect();
      const startThreshold = rect.top + rect.height * 0.28;
      const endThreshold = rect.bottom - rect.height * 0.28;

      if (event.clientY < startThreshold) {
        nextPlacement = { targetId: node.id, mode: "before" };
      } else if (event.clientY > endThreshold) {
        nextPlacement = { targetId: node.id, mode: "after" };
      } else {
        nextPlacement = { targetId: node.id, mode: "inside" };
      }
    } else {
      nextPlacement = { targetId: node.id, mode: "inside" };
    }

    if (nextPlacement.mode === "inside") {
      if (dropTargetFolderId !== node.id) {
        setDropTargetFolderId(node.id);
      }
    }

    if (nextPlacement.mode !== "inside" && dropTargetFolderId) {
      setDropTargetFolderId(null);
    }

    setDropPlacement((current) =>
      current?.targetId === nextPlacement.targetId && current?.mode === nextPlacement.mode
        ? current
        : nextPlacement,
    );
  };

  const handleTreeRowDragLeave = (nodeId) => {
    setDropPlacement((current) => (current?.targetId === nodeId ? null : current));
    if (dropTargetFolderId === nodeId) {
      setDropTargetFolderId(null);
    }
  };

  const handleTreeRowDrop = async (event, node) => {
    event.preventDefault();
    event.stopPropagation();

    const sourceIds = (event.dataTransfer.getData("text/plain") || draggingNodeIds.join(","))
      .split(",")
      .filter(Boolean);
    const sourceId = sourceIds[0];

    if (!sourceId || sourceId === node.id) {
      clearDragState();
      return;
    }

    const sourceNodes = sourceIds
      .map((id) => findNodeById(tree, id))
      .filter(Boolean);
    const canReorderFolders =
      sourceIds.length === 1 &&
      sourceNodes.length === 1 &&
      isFolder(sourceNodes[0]);

    if (canReorderFolders && dropPlacement?.targetId === node.id && dropPlacement.mode !== "inside") {
      await moveFolderRelativeToSibling(sourceId, node.id, dropPlacement.mode);
      return;
    }

    if (canReorderFolders && sourceNodes[0].id === sourceId) {
      await moveFolderToFolder(sourceId, node.id);
      return;
    }

    await moveNodesToFolder(sourceIds, node.id);
  };

  const handleFolderDragOver = (event, folderId) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = draggingNodeIds.length > 1 ? "copy" : "move";
    if (dropTargetFolderId !== folderId) {
      setDropTargetFolderId(folderId);
    }
  };

  const handleFolderDragLeave = (folderId) => {
    if (dropTargetFolderId === folderId) {
      setDropTargetFolderId(null);
    }
  };

  const handleItemDragOver = (event, item) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = draggingNodeIds.length > 1 ? "copy" : "move";

    if (!draggingNodeIds.length || draggingNodeIds.includes(item.id)) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const midpointY = rect.top + rect.height / 2;
    const midpointX = rect.left + rect.width / 2;
    const isFolderItem = item.kind === "folder";
    const isGridView = viewMode === "grid";
    let nextPlacement;

    if (isFolderItem) {
      const startThreshold = isGridView ? rect.left + rect.width * 0.28 : rect.top + rect.height * 0.28;
      const endThreshold = isGridView ? rect.right - rect.width * 0.28 : rect.bottom - rect.height * 0.28;
      const pointerAxis = isGridView ? event.clientX : event.clientY;

      if (pointerAxis < startThreshold) {
        nextPlacement = { targetId: item.id, mode: "before" };
      } else if (pointerAxis > endThreshold) {
        nextPlacement = { targetId: item.id, mode: "after" };
      } else {
        nextPlacement = { targetId: item.id, mode: "inside" };
        if (dropTargetFolderId !== item.id) {
          setDropTargetFolderId(item.id);
        }
      }
    } else {
      const dragCenterX =
        isGridView && dragItemMetrics
          ? event.clientX - dragItemMetrics.offsetX + dragItemMetrics.width / 2
          : event.clientX;
      const dragCenterY =
        !isGridView && dragItemMetrics
          ? event.clientY - dragItemMetrics.offsetY + dragItemMetrics.height / 2
          : event.clientY;

      nextPlacement = {
        targetId: item.id,
        mode: isGridView ? (dragCenterX < midpointX ? "before" : "after") : dragCenterY < midpointY ? "before" : "after",
      };
    }

    if (nextPlacement.mode !== "inside" && dropTargetFolderId) {
      setDropTargetFolderId(null);
    }

    setDropPlacement((current) =>
      current?.targetId === nextPlacement.targetId && current?.mode === nextPlacement.mode
        ? current
        : nextPlacement,
    );
  };

  const handleItemDragLeave = (itemId) => {
    setDropPlacement((current) => (current?.targetId === itemId ? null : current));
    if (dropTargetFolderId === itemId) {
      setDropTargetFolderId(null);
    }
  };

  const handleItemDrop = async (event, item) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceIds = (event.dataTransfer.getData("text/plain") || draggingNodeIds.join(","))
      .split(",")
      .filter(Boolean);

    if (!sourceIds.length || sourceIds.includes(item.id)) {
      clearDragState();
      return;
    }

    if (dropPlacement?.targetId === item.id && dropPlacement.mode !== "inside") {
      await moveNodesRelativeToSibling(sourceIds, item.id, dropPlacement.mode);
      return;
    }

    if (item.kind === "folder") {
      await moveNodesToFolder(sourceIds, item.id);
      return;
    }

    clearDragState();
  };

  const openCreateDialog = (kind) => {
    setCreateDialog({ kind });
    setEditDraft({
      title: "",
      url: "",
    });
    setCreateDialogErrors({});
    setCreateContextMenu(null);
    setActiveMenuId(null);
    setSidebarContextMenu(null);
    setCardMenuPosition(null);
  };

  const validateCreateDialog = () => {
    if (!createDialog) {
      return {};
    }

    const errors = {};

    if (createDialog.kind === "bookmark") {
      if (!editDraft.title.trim()) {
        errors.title = "Enter a title";
      }

      const normalizedUrl = normalizeBookmarkUrl(editDraft.url);

      if (!normalizedUrl) {
        errors.url = "Enter a URL";
      } else if (!isValidBookmarkUrl(normalizedUrl)) {
        errors.url = "Enter a valid URL";
      }
    }

    return errors;
  };

  const createNodeInCurrentFolder = async () => {
    if (!createDialog || !selectedFolder?.id) {
      return;
    }

    const errors = validateCreateDialog();
    if (Object.keys(errors).length > 0) {
      setCreateDialogErrors(errors);
      return;
    }

    const beforeSnapshot = captureSnapshot();
    const nextTitle = editDraft.title.trim() || (createDialog.kind === "folder" ? "Untitled folder" : "Untitled bookmark");
    const nextUrl = createDialog.kind === "bookmark" ? normalizeBookmarkUrl(editDraft.url) : editDraft.url.trim();

    if (globalThis.chrome?.bookmarks?.create) {
      await chrome.bookmarks.create({
        parentId: selectedFolder.id,
        title: nextTitle,
        ...(createDialog.kind === "folder" ? {} : { url: nextUrl }),
      });
      const nextTree = await fetchBookmarksTree();
      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    } else {
      const nextTree = insertNodeIntoFolder(treeRef.current, selectedFolder.id, {
        id: makeLocalBookmarkId(),
        title: nextTitle,
        ...(createDialog.kind === "folder" ? { children: [] } : { url: nextUrl }),
      });
      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    }

    setCreateDialog(null);
    setCreateDialogErrors({});
    setStatusMessage(createDialog.kind === "folder" ? "Folder created" : "Bookmark created");
  };

  const openEditDialog = (node) => {
    setEditingNode(node);
    setEditDraft({
      title: node.title || "",
      url: node.url || "",
    });
    setActiveMenuId(null);
    setSidebarContextMenu(null);
    setCardMenuPosition(null);
    setCreateContextMenu(null);
  };

  const saveEditedNode = async () => {
    if (!editingNode) {
      return;
    }

    const beforeSnapshot = captureSnapshot();
    const nextTitle = editDraft.title.trim() || "Untitled bookmark";
    const nextUrl = editDraft.url.trim();

    if (globalThis.chrome?.bookmarks?.update) {
      await chrome.bookmarks.update(editingNode.id, {
        title: nextTitle,
        ...(isFolder(editingNode) ? {} : { url: nextUrl }),
      });
      const nextTree = await fetchBookmarksTree();
      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    } else {
      const nextTree = updateNodeById(treeRef.current, editingNode.id, (node) => ({
        ...node,
        title: nextTitle,
        ...(isFolder(node) ? {} : { url: nextUrl }),
      }));
      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    }

    setEditingNode(null);
    setStatusMessage(isFolder(editingNode) ? "Folder renamed" : "Bookmark updated");
  };

  const deleteNode = async (node) => {
    if (isFolder(node) && protectedFolderIds.has(node.id)) {
      return;
    }

    const beforeSnapshot = captureSnapshot();
    const clipboardNodeIds = new Set(getClipboardNodes().map((clipboardNode) => clipboardNode.id));
    const nextClipboard = clipboardNodeIds.has(node.id) ? null : bookmarkClipboard;

    if (globalThis.chrome?.bookmarks?.remove) {
      if (isFolder(node) && chrome.bookmarks.removeTree) {
        await chrome.bookmarks.removeTree(node.id);
      } else {
        await chrome.bookmarks.remove(node.id);
      }
      const nextTree = await fetchBookmarksTree();
      const afterSnapshot = commitTreeChange(nextTree, {
        bookmarkClipboard: nextClipboard,
      });
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    } else {
      const nextTree = removeNodeById(treeRef.current, node.id);
      const afterSnapshot = commitTreeChange(nextTree, {
        bookmarkClipboard: nextClipboard,
      });
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    }

    setActiveMenuId(null);
    setSidebarContextMenu(null);
    setStatusMessage(isFolder(node) ? "Folder deleted" : "Bookmark deleted");
    showToastMessage(getDeletionToastLabel(node), {
      type: "history",
    });
  };

  const deleteSelectedItems = async () => {
    const selectedNodes = orderIdsWithinCurrentFolder(selectedItemIds)
      .map((id) => findNodeById(treeRef.current, id))
      .filter((node) => node && !(isFolder(node) && protectedFolderIds.has(node.id)));

    if (!selectedNodes.length) {
      return;
    }

    const beforeSnapshot = captureSnapshot();
    const selectedIdSet = new Set(selectedNodes.map((node) => node.id));
    const clipboardNodes = getClipboardNodes();
    const nextClipboard =
      clipboardNodes.length && clipboardNodes.some((clipboardNode) => selectedIdSet.has(clipboardNode.id))
        ? null
        : bookmarkClipboard;

    if (globalThis.chrome?.bookmarks?.remove) {
      for (const node of selectedNodes) {
        if (isFolder(node) && chrome.bookmarks.removeTree) {
          await chrome.bookmarks.removeTree(node.id);
        } else {
          await chrome.bookmarks.remove(node.id);
        }
      }

      const nextTree = await fetchBookmarksTree();
      const afterSnapshot = commitTreeChange(nextTree, {
        bookmarkClipboard: nextClipboard,
      });
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    } else {
      let nextTree = treeRef.current;
      for (const node of selectedNodes) {
        nextTree = removeNodeById(nextTree, node.id);
      }

      const afterSnapshot = commitTreeChange(nextTree, {
        bookmarkClipboard: nextClipboard,
      });
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    }

    clearSelection();
    setActiveMenuId(null);
    setSidebarContextMenu(null);
    setStatusMessage(`${selectedNodes.length} items deleted`);
    showToastMessage(
      selectedNodes.length === 1
        ? getDeletionToastLabel(selectedNodes[0])
        : `${selectedNodes.length} items deleted`,
      {
        type: "history",
      },
    );
  };

  const copyNode = (node, mode) => {
    if (mode === "cut" && isFolder(node) && protectedFolderIds.has(node.id)) {
      return;
    }

    setBookmarkClipboard({
      mode,
      nodes: [JSON.parse(JSON.stringify(node))],
    });
    setActiveMenuId(null);
    setSidebarContextMenu(null);
    setStatusMessage(mode === "cut" ? `${isFolder(node) ? "Folder" : "Bookmark"} cut` : `${isFolder(node) ? "Folder" : "Bookmark"} copied`);
  };

  const duplicateSelectedItems = async () => {
    if (!selectedFolder?.id) {
      return;
    }

    const selectedNodes = orderIdsWithinCurrentFolder(selectedItemIds)
      .map((id) => findNodeById(treeRef.current, id))
      .filter(Boolean);

    if (!selectedNodes.length) {
      return;
    }

    const beforeSnapshot = captureSnapshot();

    if (globalThis.chrome?.bookmarks?.create) {
      const createRecursively = async (node, parentId) => {
        const created = await chrome.bookmarks.create({
          parentId,
          title: node.title,
          ...(isFolder(node) ? {} : { url: node.url }),
        });

        if (isFolder(node)) {
          for (const child of node.children ?? []) {
            await createRecursively(child, created.id);
          }
        }
      };

      for (const node of selectedNodes) {
        await createRecursively(node, selectedFolder.id);
      }

      const nextTree = await fetchBookmarksTree();
      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    } else {
      let nextTree = treeRef.current;

      for (const node of selectedNodes) {
        nextTree = insertNodeIntoFolder(nextTree, selectedFolder.id, cloneBookmarkNode(node));
      }

      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
    }

    setActiveMenuId(null);
    setSidebarContextMenu(null);
    setCreateContextMenu(null);
    setCardMenuPosition(null);
    setStatusMessage(`${selectedNodes.length} item${selectedNodes.length > 1 ? "s" : ""} duplicated`);
  };

  const pasteNode = async () => {
    const clipboardNodes = getClipboardNodes();

    if (!clipboardNodes.length || !selectedFolder?.id) {
      return;
    }

    const beforeSnapshot = captureSnapshot();

    if (bookmarkClipboard.mode === "cut") {
      if (globalThis.chrome?.bookmarks?.move) {
        for (const [index, node] of clipboardNodes.entries()) {
          await chrome.bookmarks.move(node.id, {
            parentId: selectedFolder.id,
            index,
          });
        }
        const nextTree = await fetchBookmarksTree();
        const afterSnapshot = commitTreeChange(nextTree, {
          bookmarkClipboard: null,
        });
        pushHistoryEntry(beforeSnapshot, afterSnapshot);
      } else {
        let nextTree = treeRef.current;

        for (const clipboardNode of clipboardNodes) {
          const bookmarkNode = findNodeById(nextTree, clipboardNode.id);
          if (!bookmarkNode) {
            continue;
          }

          const removed = removeNodeById(nextTree, bookmarkNode.id);
          nextTree = insertNodeIntoFolder(removed, selectedFolder.id, bookmarkNode);
        }

        if (nextTree !== treeRef.current) {
          const afterSnapshot = commitTreeChange(nextTree, {
            bookmarkClipboard: null,
          });
          pushHistoryEntry(beforeSnapshot, afterSnapshot);
        }
      }
      setStatusMessage(`${clipboardNodes.length} item${clipboardNodes.length > 1 ? "s" : ""} moved`);
    } else if (globalThis.chrome?.bookmarks?.create) {
      const createRecursively = async (node, parentId) => {
        const created = await chrome.bookmarks.create({
          parentId,
          title: node.title,
          ...(isFolder(node) ? {} : { url: node.url }),
        });

        if (isFolder(node)) {
          for (const child of node.children ?? []) {
            await createRecursively(child, created.id);
          }
        }
      };

      for (const node of clipboardNodes) {
        await createRecursively(node, selectedFolder.id);
      }
      const nextTree = await fetchBookmarksTree();
      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
      setStatusMessage(`${clipboardNodes.length} item${clipboardNodes.length > 1 ? "s" : ""} pasted`);
    } else {
      let nextTree = treeRef.current;
      for (const node of clipboardNodes) {
        nextTree = insertNodeIntoFolder(nextTree, selectedFolder.id, {
          ...cloneBookmarkNode(node),
        });
      }
      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
      setStatusMessage(`${clipboardNodes.length} item${clipboardNodes.length > 1 ? "s" : ""} pasted`);
    }

    if (bookmarkClipboard.mode === "cut") {
      setBookmarkClipboard(null);
    }

    setActiveMenuId(null);
    setSidebarContextMenu(null);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isTypingTarget =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT");

      if (event.key === "Escape") {
        if (isCompactSidebar && isSidebarOpen) {
          setIsSidebarOpen(false);
          return;
        }

        if (isCompactSidebar && isCompactSearchOpen && !query) {
          setIsCompactSearchOpen(false);
          return;
        }

        if (editingNode) {
          setEditingNode(null);
          return;
        }

        if (createDialog) {
          setCreateDialog(null);
          return;
        }

        if (settingsDialogOpen) {
          setSettingsDialogOpen(false);
          return;
        }

        if (createContextMenu) {
          setCreateContextMenu(null);
          return;
        }

        if (activeMenuId || sidebarContextMenu) {
          setActiveMenuId(null);
          setSidebarContextMenu(null);
          setCardMenuPosition(null);
          return;
        }

        if (bookmarkClipboard?.mode === "cut") {
          setBookmarkClipboard(null);
          return;
        }

        const activeElement = document.activeElement;
        if (
          activeElement instanceof HTMLElement &&
          activeElement !== document.body &&
          !isTypingTarget
        ) {
          activeElement.blur();
          return;
        }

        if (selectedItemIds.length) {
          clearSelection();
        }
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedItemIds.length) {
        if (isTypingTarget) {
          return;
        }

        event.preventDefault();
        void deleteSelectedItems();
        return;
      }

      if (event.altKey && !event.metaKey && !event.ctrlKey && !isTypingTarget && event.key.toLowerCase() === "l") {
        event.preventDefault();
        setExpandedFolders(new Set());
        return;
      }

      const isModifierShortcut = (event.metaKey || event.ctrlKey) && !event.altKey;
      if (isModifierShortcut && !isTypingTarget) {
        const key = event.key.toLowerCase();

        if (key === "c" && selectedItemIds.length) {
          event.preventDefault();
          copySelectedItems("copy");
          return;
        }

        if (key === "x" && selectedItemIds.length) {
          event.preventDefault();
          copySelectedItems("cut");
          return;
        }

        if (key === "d" && selectedItemIds.length) {
          event.preventDefault();
          void duplicateSelectedItems();
          return;
        }

        if (key === "v" && getClipboardNodes().length && selectedFolder?.id) {
          event.preventDefault();
          void pasteNode();
          return;
        }
      }

      const isUndoShortcut = isModifierShortcut && event.key.toLowerCase() === "z";
      if (!isUndoShortcut) {
        return;
      }

      if (isTypingTarget) {
        return;
      }

      event.preventDefault();

      if (event.shiftKey) {
        void handleRedo();
      } else {
        void handleUndo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeMenuId, bookmarkClipboard, clearSelection, copySelectedItems, createContextMenu, createDialog, deleteSelectedItems, duplicateSelectedItems, editingNode, handleRedo, handleUndo, isCompactSearchOpen, isCompactSidebar, isSidebarOpen, pasteNode, query, selectedFolder?.id, selectedItemIds.length, settingsDialogOpen, sidebarContextMenu]);

  const openBookmarkInNewTab = async (url) => {
    if (globalThis.chrome?.tabs?.create) {
      await chrome.tabs.create({ url });
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    setActiveMenuId(null);
    setSidebarContextMenu(null);
  };

  const openUrlsInNewTabs = async (urls) => {
    if (!urls.length) {
      setStatusMessage("No bookmarks to open");
      setActiveMenuId(null);
      return;
    }

    if (globalThis.chrome?.tabs?.create) {
      for (const [index, url] of urls.entries()) {
        await chrome.tabs.create({
          url,
          active: index === 0,
        });
      }
    } else {
      urls.forEach((url) => window.open(url, "_blank", "noopener,noreferrer"));
    }

    setActiveMenuId(null);
    setSidebarContextMenu(null);
  };

  const openBookmarkInNewWindow = async (url, incognito = false) => {
    try {
      if (globalThis.chrome?.windows?.create) {
        await chrome.windows.create({ url, incognito });
        setStatusMessage(incognito ? "Opened in incognito window" : "Opened in new window");
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      setStatusMessage("Incognito access must be enabled for this extension");
    }
    setActiveMenuId(null);
    setSidebarContextMenu(null);
  };

  const openBookmarkInNewTabGroup = async (bookmark) => {
    if (!globalThis.chrome?.tabs?.create || !globalThis.chrome?.tabs?.group || !globalThis.chrome?.tabGroups?.update) {
      setStatusMessage("Tab groups are unavailable here");
      setActiveMenuId(null);
      return;
    }

    const tab = await chrome.tabs.create({
      url: bookmark.url,
      active: true,
    });

    const groupId = await chrome.tabs.group({
      tabIds: [tab.id],
    });

    await chrome.tabGroups.update(groupId, {
      title: bookmark.title?.slice(0, 40) || getHostname(bookmark.url || ""),
      color: "blue",
    });

    setActiveMenuId(null);
    setSidebarContextMenu(null);
    setStatusMessage("Opened in new tab group");
  };

  const openFolderInNewWindow = async (folder, incognito = false) => {
    const urls = collectBookmarkUrls(folder);

    if (!urls.length) {
      setStatusMessage("No bookmarks to open");
      setActiveMenuId(null);
      return;
    }

    try {
      if (globalThis.chrome?.windows?.create) {
        await chrome.windows.create({
          url: urls,
          incognito,
        });
        setStatusMessage(incognito ? `Opened all (${urls.length}) in incognito window` : `Opened all (${urls.length}) in new window`);
      } else {
        urls.forEach((url) => window.open(url, "_blank", "noopener,noreferrer"));
      }
    } catch {
      setStatusMessage("Incognito access must be enabled for this extension");
    }

    setActiveMenuId(null);
    setSidebarContextMenu(null);
  };

  const openFolderInNewTabGroup = async (folder) => {
    const urls = collectBookmarkUrls(folder);

    if (!urls.length) {
      setStatusMessage("No bookmarks to open");
      setActiveMenuId(null);
      return;
    }

    if (!globalThis.chrome?.tabs?.create || !globalThis.chrome?.tabs?.group || !globalThis.chrome?.tabGroups?.update) {
      setStatusMessage("Tab groups are unavailable here");
      setActiveMenuId(null);
      return;
    }

    const createdTabIds = [];
    for (const [index, url] of urls.entries()) {
      const tab = await chrome.tabs.create({
        url,
        active: index === 0,
      });
      createdTabIds.push(tab.id);
    }

    const groupId = await chrome.tabs.group({
      tabIds: createdTabIds,
    });

    await chrome.tabGroups.update(groupId, {
      title: folder.title?.slice(0, 40) || "Bookmarks",
      color: "blue",
    });

    setActiveMenuId(null);
    setSidebarContextMenu(null);
    setStatusMessage(`Opened all (${urls.length}) in new tab group`);
  };

  const handleSelectFolder = (folderId) => {
    setSelectedFolderId(folderId);
    setExpandedFolders((current) => {
      const next = new Set(current);
      for (const id of getPathIds(tree, folderId).slice(0, -1)) {
        next.add(id);
      }
      return next;
    });
    if (isCompactSidebar) {
      setIsSidebarOpen(false);
    }
  };

  const handleToggleFolder = (folderId) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const openSidebarContextMenu = (node, x, y) => {
    setActiveMenuId(null);
    setCardMenuPosition(null);
    setCreateContextMenu(null);
    setSidebarContextMenu({
      id: node.id,
      x,
      y,
    });
  };

  const openCreateContextMenu = (event) => {
    const target = event.target;

    if (
      target instanceof Element &&
      target.closest(".bookmark-menu, .edit-dialog, .dialog-backdrop")
    ) {
      return;
    }

    event.preventDefault();
    setActiveMenuId(null);
    setSidebarContextMenu(null);
    setCardMenuPosition(null);
    const menuWidth = 240;
    const estimatedMenuHeight = 220;
    const viewportPadding = 16;
    const x = Math.max(
      viewportPadding,
      Math.min(event.clientX, window.innerWidth - menuWidth - viewportPadding),
    );
    const y = Math.max(
      viewportPadding,
      Math.min(event.clientY, window.innerHeight - estimatedMenuHeight - viewportPadding),
    );
    setCreateContextMenu({
      includeSortOptions: false,
      x,
      y,
    });
  };

  const openCreateMenuAtPosition = (x, y) => {
    setActiveMenuId(null);
    setSidebarContextMenu(null);
    setCardMenuPosition(null);
    const menuWidth = 240;
    const estimatedMenuHeight = 320;
    const viewportPadding = 16;
    const clampedX = Math.max(
      viewportPadding,
      Math.min(x, window.innerWidth - menuWidth - viewportPadding),
    );
    const clampedY = Math.max(
      viewportPadding,
      Math.min(y, window.innerHeight - estimatedMenuHeight - viewportPadding),
    );
    setCreateContextMenu({ includeSortOptions: true, x: clampedX, y: clampedY });
  };

  const showToastMessage = (message, undo = null) => {
    setToastState({ message, undo });
  };

  const handleToastUndo = async () => {
    if (!toastState?.undo) {
      return;
    }

    if (toastState.undo.type === "history") {
      await handleUndo();
    } else if (toastState.undo.type === "settings") {
      setFolderIconVariant(toastState.undo.folderIconVariant);
    }

    setToastState(null);
  };

  const openSettingsDialog = () => {
    setCreateContextMenu(null);
    setSettingsDraft({ folderIconVariant });
    setSettingsDialogOpen(true);
  };

  const closeSettingsDialog = () => {
    setSettingsDialogOpen(false);
    setSettingsDraft({ folderIconVariant });
  };

  const saveSettings = () => {
    const previousVariant = folderIconVariant;
    setFolderIconVariant(settingsDraft.folderIconVariant);
    setSettingsDialogOpen(false);
    showToastMessage("Settings updated", {
      type: "settings",
      folderIconVariant: previousVariant,
    });
  };

  const setSelectedFolderSortMode = (mode) => {
    if (!selectedFolder?.id) {
      return;
    }

    setFolderSortModes((current) => ({
      ...current,
      [selectedFolder.id]: mode,
    }));
    setCreateContextMenu(null);
  };

  const visibleItems = useMemo(
    () =>
      childItems
        .filter((node) => {
          if (!normalizedQuery) {
            return true;
          }

          if (isFolder(node)) {
            return node.title?.toLowerCase().includes(normalizedQuery);
          }

          return (
            node.title?.toLowerCase().includes(normalizedQuery) ||
            node.url?.toLowerCase().includes(normalizedQuery)
          );
        })
        .map((node) => ({
          ...node,
          kind: isFolder(node) ? "folder" : "bookmark",
        })),
    [childItems, normalizedQuery],
  );
  const visibleItemIds = useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);

  const selectSingleItem = (itemId) => {
    setSelectedItemIds([itemId]);
    setSelectionAnchorId(itemId);
  };

  const handleItemSelection = (event, itemId) => {
    const isToggleSelection = event.metaKey || event.ctrlKey;

    if (!event.shiftKey && !isToggleSelection) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.shiftKey) {
      const fallbackAnchorId =
        selectionAnchorId && visibleItemIds.includes(selectionAnchorId)
          ? selectionAnchorId
          : selectedItemIds.find((id) => visibleItemIds.includes(id)) ?? itemId;
      const anchorIndex = visibleItemIds.indexOf(fallbackAnchorId);
      const targetIndex = visibleItemIds.indexOf(itemId);

      if (anchorIndex === -1 || targetIndex === -1) {
        setSelectedItemIds([itemId]);
        setSelectionAnchorId(itemId);
        return true;
      }

      const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
      setSelectedItemIds(visibleItemIds.slice(start, end + 1));
      setSelectionAnchorId(fallbackAnchorId);
      return true;
    }

    if (isToggleSelection) {
      setSelectedItemIds((current) =>
        current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId],
      );
      return true;
    }
  };

  const setContentItemRef = (itemId, element) => {
    if (element) {
      contentItemRefs.current.set(itemId, element);
    } else {
      contentItemRefs.current.delete(itemId);
    }
  };

  const getDragSelectionBounds = () => {
    if (!dragSelection) {
      return null;
    }

    const left = Math.min(dragSelection.originX, dragSelection.currentX);
    const top = Math.min(dragSelection.originY, dragSelection.currentY);
    const width = Math.abs(dragSelection.currentX - dragSelection.originX);
    const height = Math.abs(dragSelection.currentY - dragSelection.originY);

    return { left, top, width, height };
  };

  useEffect(() => {
    if (!dragSelection) {
      return undefined;
    }

    const updateSelection = (nextSelection) => {
      const bounds = {
        left: Math.min(nextSelection.originX, nextSelection.currentX),
        right: Math.max(nextSelection.originX, nextSelection.currentX),
        top: Math.min(nextSelection.originY, nextSelection.currentY),
        bottom: Math.max(nextSelection.originY, nextSelection.currentY),
      };

      const selectedIds = visibleItems
        .filter((item) => {
          const element = contentItemRefs.current.get(item.id);
          if (!element) {
            return false;
          }

          const rect = element.getBoundingClientRect();
          return !(
            rect.right < bounds.left ||
            rect.left > bounds.right ||
            rect.bottom < bounds.top ||
            rect.top > bounds.bottom
          );
        })
        .map((item) => item.id);

      setSelectedItemIds(selectedIds);
      setSelectionAnchorId(selectedIds[0] ?? null);
    };

    const handlePointerMove = (event) => {
      setDragSelection((current) => {
        if (!current) {
          return current;
        }

        const nextSelection = {
          ...current,
          currentX: event.clientX,
          currentY: event.clientY,
        };
        updateSelection(nextSelection);
        return nextSelection;
      });
    };

    const handlePointerUp = () => {
      setDragSelection(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    updateSelection(dragSelection);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragSelection, visibleItems]);

  const handleContentPanePointerDown = (event) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        ".content-card, .card-menu, .bookmark-menu, .search-field, .view-toggle, .breadcrumb-item button, .selection-toolbar, .status-pill",
      )
    ) {
      return;
    }

    event.preventDefault();
    setActiveMenuId(null);
    setSidebarContextMenu(null);
    setCardMenuPosition(null);
    setSelectedItemIds([]);
    setSelectionAnchorId(null);
    setDragSelection({
      originX: event.clientX,
      originY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
    });
  };

  const openCardMenu = (itemId, event) => {
    const menuWidth = 270;
    const viewportPadding = 16;
    const cursorOffsetX = 12;
    const cursorOffsetY = 12;
    const preferredLeft = event.clientX + cursorOffsetX;
    const preferredTop = event.clientY + cursorOffsetY;
    const openUpward = preferredTop + 360 > window.innerHeight - viewportPadding;
    const left = Math.max(
      viewportPadding,
      Math.min(preferredLeft, window.innerWidth - menuWidth - viewportPadding),
    );

    setSidebarContextMenu(null);
    setActiveMenuId((current) => {
      const shouldClose = current === itemId;
      setCardMenuPosition(
        shouldClose
          ? null
          : {
              left,
              top: openUpward ? event.clientY - cursorOffsetY : preferredTop,
              openUpward,
            },
      );
      return shouldClose ? null : itemId;
    });
  };

  const renderFolderMenu = (item, options = {}) => {
    const bookmarkCount = collectBookmarkUrls(item).length;
    const { className = "bookmark-menu", style } = options;
    const isProtectedFolder = protectedFolderIds.has(item.id);
    const renderMenuLabel = (label, shortcut) => (
      <>
        <span>{label}</span>
        {shortcut ? <span className="bookmark-menu-shortcut">{shortcut}</span> : null}
      </>
    );

    return (
      <div
        className={className}
        style={style}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <button type="button" className="bookmark-menu-item" onClick={() => openEditDialog(item)} disabled={isProtectedFolder}>
          {renderMenuLabel("Rename")}
        </button>
        <button type="button" className="bookmark-menu-item" onClick={() => deleteNode(item)} disabled={isProtectedFolder}>
          {renderMenuLabel("Delete", "⌫")}
        </button>
        <div className="bookmark-menu-divider" />
        <button type="button" className="bookmark-menu-item" onClick={() => copyNode(item, "cut")} disabled={isProtectedFolder}>
          {renderMenuLabel("Cut", "⌘X")}
        </button>
        <button type="button" className="bookmark-menu-item" onClick={() => copyNode(item, "copy")}>
          {renderMenuLabel("Copy", "⌘C")}
        </button>
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={pasteNode}
          disabled={!bookmarkClipboard}
        >
          {renderMenuLabel("Paste", "⌘V")}
        </button>
        <div className="bookmark-menu-divider" />
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={() => openFolderInNewWindow(item, true)}
        >
          {renderMenuLabel(`Open all (${bookmarkCount}) in Incognito window`)}
        </button>
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={() => openFolderInNewTabGroup(item)}
        >
          {renderMenuLabel(`Open all (${bookmarkCount}) in new tab group`)}
        </button>
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={() => openUrlsInNewTabs(collectBookmarkUrls(item))}
        >
          {renderMenuLabel(`Open all (${bookmarkCount})`)}
        </button>
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={() => openFolderInNewWindow(item)}
        >
          {renderMenuLabel(`Open all (${bookmarkCount}) in new window`)}
        </button>
        <button type="button" className="bookmark-menu-item" disabled>
          {renderMenuLabel("Open in split view")}
        </button>
      </div>
    );
  };

  const renderBookmarkMenu = (item, options = {}) => {
    const { className = "bookmark-menu", style } = options;
    const renderMenuLabel = (label, shortcut) => (
      <>
        <span>{label}</span>
        {shortcut ? <span className="bookmark-menu-shortcut">{shortcut}</span> : null}
      </>
    );

    return (
      <div
        className={className}
        style={style}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <button type="button" className="bookmark-menu-item" onClick={() => openEditDialog(item)}>
          {renderMenuLabel("Edit")}
        </button>
        <button type="button" className="bookmark-menu-item" onClick={() => deleteNode(item)}>
          {renderMenuLabel("Delete", "⌫")}
        </button>
        <div className="bookmark-menu-divider" />
        <button type="button" className="bookmark-menu-item" onClick={() => copyNode(item, "cut")}>
          {renderMenuLabel("Cut", "⌘X")}
        </button>
        <button type="button" className="bookmark-menu-item" onClick={() => copyNode(item, "copy")}>
          {renderMenuLabel("Copy", "⌘C")}
        </button>
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={pasteNode}
          disabled={!bookmarkClipboard}
        >
          {renderMenuLabel("Paste", "⌘V")}
        </button>
        <div className="bookmark-menu-divider" />
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={() => openBookmarkInNewWindow(item.url || "", true)}
        >
          {renderMenuLabel("Open in Incognito window")}
        </button>
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={() => openBookmarkInNewTabGroup(item)}
        >
          {renderMenuLabel("Open in new tab group")}
        </button>
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={() => openBookmarkInNewTab(item.url || "")}
        >
          {renderMenuLabel("Open in new tab")}
        </button>
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={() => openBookmarkInNewWindow(item.url || "")}
        >
          {renderMenuLabel("Open in new window")}
        </button>
        <button type="button" className="bookmark-menu-item" disabled>
          {renderMenuLabel("Open in split view")}
        </button>
      </div>
    );
  };

  return (
    <div
      className={`app-shell ${isCompactSidebar ? "is-sidebar-collapsed" : ""} ${isSidebarOpen ? "is-sidebar-open" : ""}`}
      onContextMenu={openCreateContextMenu}
    >
      {isCompactSidebar && isSidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close sidebar"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      <aside
        id="bookmark-sidebar"
        className={`sidebar ${isCompactSidebar ? "is-overlay" : ""} ${isSidebarOpen ? "is-open" : ""}`}
      >
        <nav className="folder-tree" aria-label="Bookmark folders">
          {rootFolders.map((folder) => (
            <TreeNode
              key={folder.id}
              cutItemIds={cutItemIds}
              depth={0}
              draggingNodeIds={draggingNodeIds}
              dropPlacement={dropPlacement}
              dropTargetFolderId={dropTargetFolderId}
              expandedFolders={expandedFolders}
              folderIconVariant={folderIconVariant}
              node={folder}
              onDragEnd={handleDragEnd}
              onDragStart={handleDragStart}
              onTreeRowDrop={handleTreeRowDrop}
              onTreeRowDragOver={handleTreeRowDragOver}
              onTreeRowDragLeave={handleTreeRowDragLeave}
              onOpenContextMenu={openSidebarContextMenu}
              onSelect={handleSelectFolder}
              onToggle={handleToggleFolder}
              renderFolderMenu={renderFolderMenu}
              selectedFolderId={selectedFolder?.id}
              sidebarContextMenu={sidebarContextMenu}
            />
          ))}
        </nav>
      </aside>

      <main ref={contentPaneRef} className="content-pane" onPointerDown={handleContentPanePointerDown}>
        {selectedItemIds.length > 1 && (
          <div className="selection-toolbar" role="toolbar" aria-label="Selection actions">
            <div className="selection-toolbar-main">
              <div className="selection-toolbar-inner">
                <button type="button" className="selection-toolbar-close" onClick={clearSelection} aria-label="Dismiss selection">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m18.3 5.71-1.41-1.41L12 9.17 7.11 4.3 5.7 5.71 10.59 10.6 5.7 15.49l1.41 1.41L12 12.01l4.89 4.89 1.41-1.41-4.89-4.89 4.89-4.89Z" />
                  </svg>
                </button>
                <span className="selection-toolbar-count">{selectedItemIds.length} selected</span>
                <button type="button" className="selection-toolbar-delete" onClick={() => void deleteSelectedItems()}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
        <div className={`content-header-shell ${isHeaderElevated ? "is-elevated" : ""}`}>
          {isCompactSidebar && (
            <button
              type="button"
              className="sidebar-toggle-button"
              aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
              aria-expanded={isSidebarOpen}
              aria-controls="bookmark-sidebar"
              onClick={() => setIsSidebarOpen((current) => !current)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3z" />
              </svg>
            </button>
          )}
          <div className="content-header-main">
            <header className="toolbar">
              <div className="toolbar-center">
                {isCompactSidebar && (
                  <button
                    type="button"
                    className={`search-toggle-button ${isCompactSearchOpen || query ? "is-hidden" : ""}`}
                    aria-label="Open search"
                    onClick={() => setIsCompactSearchOpen(true)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0-2a8 8 0 1 0 4.9 14.3l4.4 4.4 1.4-1.4-4.4-4.4A8 8 0 0 0 10 2Z" />
                    </svg>
                  </button>
                )}
                <label className={`search-field ${isCompactSidebar ? "is-compact" : ""} ${isCompactSearchOpen || query ? "is-open" : ""}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0-2a8 8 0 1 0 4.9 14.3l4.4 4.4 1.4-1.4-4.4-4.4A8 8 0 0 0 10 2Z" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onBlur={() => {
                      if (isCompactSidebar && !query) {
                        setIsCompactSearchOpen(false);
                      }
                    }}
                    placeholder="Search bookmarks"
                  />
                  {query && (
                    <button
                      type="button"
                      className="search-clear"
                      aria-label="Clear search"
                      onClick={(event) => {
                        event.preventDefault();
                        setQuery("");
                        searchInputRef.current?.focus();
                      }}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm3.59 13.17L14.17 15.59 12 13.41l-2.17 2.18-1.42-1.42L10.59 12 8.41 9.83l1.42-1.42L12 10.59l2.17-2.18 1.42 1.42L13.41 12l2.18 2.17Z" />
                      </svg>
                    </button>
                  )}
                </label>

                <div className="view-toggle" aria-label="View options">
                  <button
                    type="button"
                    className={viewMode === "grid" ? "is-active" : ""}
                    onClick={() => setViewMode("grid")}
                    aria-label="Grid view"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={viewMode === "list" ? "is-active" : ""}
                    onClick={() => setViewMode("list")}
                    aria-label="List view"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h16v2H4v-2Z" />
                    </svg>
                  </button>
                </div>
              </div>
            </header>
          </div>
          <button
            type="button"
            className="header-menu-button"
            aria-label="More actions"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              openCreateMenuAtPosition(rect.right - 270, rect.bottom + 8);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
            </svg>
          </button>
        </div>

        <section className="content-head">
          {breadcrumbs.length > 1 && (
            <div className="breadcrumbs" aria-label="Folder path">
              {breadcrumbs.slice(0, -1).map((item, index) => (
                <span key={item.id} className="breadcrumb-item">
                  <button type="button" onClick={() => handleSelectFolder(item.id)}>
                    {item.title}
                  </button>
                  {index < breadcrumbs.length - 2 && <span>/</span>}
                </span>
              ))}
            </div>
          )}
          <div className="title-row">
            <h1>{selectedFolder?.title || "Bookmarks"}</h1>
          </div>
        </section>

        {visibleItems.length > 0 ? (
          <section
            ref={contentGridRef}
            className={`content-grid is-${viewMode} ${dragSelection ? "is-selecting" : ""}`}
          >
            {visibleItems.map((item) =>
              item.kind === "folder" ? (
                <div
                  key={item.id}
                  ref={(element) => setContentItemRef(item.id, element)}
                  className={`content-card folder-card ${dropTargetFolderId === item.id ? "is-drop-target" : ""} ${draggingNodeIds.includes(item.id) ? "is-dragging" : ""} ${cutItemIds.has(item.id) ? "is-cut" : ""} ${selectedItemIds.includes(item.id) ? "is-selected" : ""} ${dropPlacement?.targetId === item.id ? `is-drop-${dropPlacement.mode}` : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    if (handleItemSelection(event, item.id)) {
                      return;
                    }
                    selectSingleItem(item.id);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    selectSingleItem(item.id);
                    openCardMenu(item.id, event);
                  }}
                  onDoubleClick={() => handleSelectFolder(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleSelectFolder(item.id);
                    }
                  }}
                  draggable
                  onDragStart={(event) => handleDragStart(event, item)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(event) => handleItemDragOver(event, item)}
                  onDragLeave={() => handleItemDragLeave(item.id)}
                  onDrop={(event) => handleItemDrop(event, item)}
                >
                  <button
                    type="button"
                    className="card-menu"
                    aria-label={`Actions for ${item.title || "folder"}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openCardMenu(item.id, event);
                    }}
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
                    </svg>
                  </button>
                  <div className="folder-card-body">
                    <span className="folder-glyph">
                      <FolderIcon variant={folderIconVariant} />
                    </span>
                    <strong>{item.title || "Untitled"}</strong>
                  </div>
                  {activeMenuId === item.id &&
                    cardMenuPosition &&
                    renderFolderMenu(item, {
                      className: "bookmark-menu is-context-menu",
                      style: {
                        left: `${cardMenuPosition.left}px`,
                        top: `${cardMenuPosition.top}px`,
                        transform: cardMenuPosition.openUpward ? "translateY(-100%)" : undefined,
                      },
                    })}
                </div>
              ) : (
                <div
                  key={item.id}
                  ref={(element) => setContentItemRef(item.id, element)}
                  className={`content-card bookmark-card ${draggingNodeIds.includes(item.id) ? "is-dragging" : ""} ${cutItemIds.has(item.id) ? "is-cut" : ""} ${selectedItemIds.includes(item.id) ? "is-selected" : ""} ${dropPlacement?.targetId === item.id ? `is-drop-${dropPlacement.mode}` : ""}`}
                  role="link"
                  tabIndex={0}
                  draggable
                  onClick={(event) => {
                    if (handleItemSelection(event, item.id)) {
                      return;
                    }
                    selectSingleItem(item.id);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    selectSingleItem(item.id);
                    openCardMenu(item.id, event);
                  }}
                  onDoubleClick={() => openBookmarkInNewTab(item.url || "")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void openBookmarkInNewTab(item.url || "");
                    }
                  }}
                  onDragStart={(event) => handleDragStart(event, item)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(event) => handleItemDragOver(event, item)}
                  onDragLeave={() => handleItemDragLeave(item.id)}
                  onDrop={(event) => handleItemDrop(event, item)}
                >
                  {(() => {
                    const hostname = getHostname(item.url || "");
                    const previewFailed = failedPreviewUrls[item.id];
                    const fallbackDomain = truncateDomain(hostname);
                    const themeColor = getDomainTheme(hostname);
                    const previewCacheKey = getPreviewUrl(item.url || "");
                    const previewSource = cachedPreviewUrls[previewCacheKey] || previewCacheKey;
                    const isCachedPreview = Boolean(cachedPreviewUrls[previewCacheKey]);

                    return (
                      <div className="bookmark-preview" style={{ "--preview-accent": themeColor }}>
                        {!previewFailed && (
                          <img
                            className="bookmark-preview-image"
                            src={previewSource}
                            alt=""
                            loading="lazy"
                            crossOrigin="anonymous"
                            onLoad={(event) => handlePreviewImageLoad(item.id, event.currentTarget, previewCacheKey, isCachedPreview)}
                            onError={() => markPreviewFailed(item.id)}
                          />
                        )}
                        <div className={`bookmark-preview-fallback ${previewFailed ? "is-visible" : ""}`}>
                          <span>{fallbackDomain}</span>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="bookmark-meta">
                    <strong>{item.title || "Untitled bookmark"}</strong>
                    <div className="bookmark-domain-row">
                      <img
                        className="bookmark-favicon"
                        src={getFaviconUrl(item.url || "")}
                        alt=""
                        loading="lazy"
                      />
                      <span className="bookmark-domain">{truncateDomain(getHostname(item.url || ""), 26)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="card-menu"
                    aria-label={`Actions for ${item.title || "bookmark"}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openCardMenu(item.id, event);
                    }}
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
                    </svg>
                  </button>
                  {activeMenuId === item.id &&
                    cardMenuPosition &&
                    renderBookmarkMenu(item, {
                      className: "bookmark-menu is-context-menu",
                      style: {
                        left: `${cardMenuPosition.left}px`,
                        top: `${cardMenuPosition.top}px`,
                        transform: cardMenuPosition.openUpward ? "translateY(-100%)" : undefined,
                      },
                    })}
                </div>
              ),
            )}
          </section>
        ) : (
          <section className="empty-state">
            {normalizedQuery ? "No search results found" : "There's nothing here right now"}
          </section>
        )}
        {dragSelection && (() => {
          const bounds = getDragSelectionBounds();
          const paneRect = contentPaneRef.current?.getBoundingClientRect();

          if (!bounds || !paneRect) {
            return null;
          }

          return (
            <div
              className="selection-marquee"
              style={{
                left: `${bounds.left - paneRect.left + contentPaneRef.current.scrollLeft}px`,
                top: `${bounds.top - paneRect.top + contentPaneRef.current.scrollTop}px`,
                width: `${bounds.width}px`,
                height: `${bounds.height}px`,
              }}
            />
          );
        })()}
        <span className={`status-pill is-${loadingState}`}>
          {loadingState === "ready" && "Live"}
          {loadingState === "demo" && "Demo"}
          {loadingState === "loading" && "Loading"}
          {loadingState === "error" && "Retry"}
        </span>
        {toastState && (
          <div className="toast-message">
            <span className="toast-message-text">{toastState.message}</span>
            <button type="button" className="toast-message-action" onClick={() => void handleToastUndo()}>
              Undo
            </button>
          </div>
        )}
      </main>
      {createContextMenu && (
        <div
          className="bookmark-menu is-context-menu create-context-menu"
          style={{
            left: `${createContextMenu.x}px`,
            top: `${createContextMenu.y}px`,
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <button type="button" className="bookmark-menu-item" onClick={() => openCreateDialog("bookmark")}>
            Add new bookmark
          </button>
          <button type="button" className="bookmark-menu-item" onClick={() => openCreateDialog("folder")}>
            Add new folder
          </button>
          {createContextMenu.includeSortOptions && (
            <>
              <div className="bookmark-menu-divider" />
              <button
                type="button"
                className="bookmark-menu-item"
                onClick={() => setSelectedFolderSortMode("name")}
              >
                <span>Sort by name</span>
                {selectedFolderSortMode === "name" ? <span className="bookmark-menu-shortcut">Current</span> : null}
              </button>
              <button
                type="button"
                className="bookmark-menu-item"
                onClick={() => setSelectedFolderSortMode("manual")}
              >
                <span>Sort manually</span>
                {selectedFolderSortMode === "manual" ? <span className="bookmark-menu-shortcut">Current</span> : null}
              </button>
              <div className="bookmark-menu-divider" />
              <button
                type="button"
                className="bookmark-menu-item"
                onClick={openSettingsDialog}
              >
                <span>Settings</span>
              </button>
            </>
          )}
        </div>
      )}
      {settingsDialogOpen && (
        <div
          className="dialog-backdrop"
          onClick={closeSettingsDialog}
        >
          <div
            className="edit-dialog settings-dialog"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <h2>Settings</h2>
            <div className="settings-section">
              <h3>Directory icon</h3>
              <p>Select the icon to represent folders.</p>
              <div className="settings-options">
                <button
                  type="button"
                  className={`settings-tile ${settingsDraft.folderIconVariant === "outlined" ? "is-active" : ""}`}
                  onClick={() => setSettingsDraft((current) => ({ ...current, folderIconVariant: "outlined" }))}
                >
                  <span className="settings-tile-icon">
                    <FolderIcon variant="outlined" />
                  </span>
                  <span className="settings-tile-label">Outlined</span>
                </button>
                <button
                  type="button"
                  className={`settings-tile ${settingsDraft.folderIconVariant === "filled" ? "is-active" : ""}`}
                  onClick={() => setSettingsDraft((current) => ({ ...current, folderIconVariant: "filled" }))}
                >
                  <span className="settings-tile-icon">
                    <FolderIcon variant="filled" />
                  </span>
                  <span className="settings-tile-label">Filled</span>
                </button>
              </div>
            </div>
            <div className="dialog-actions">
              <button type="button" className="dialog-button is-secondary" onClick={closeSettingsDialog}>
                Cancel
              </button>
              <button type="button" className="dialog-button is-primary" onClick={saveSettings}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      {editingNode && (
        <div
          className="dialog-backdrop"
          onClick={() => {
            setEditingNode(null);
          }}
        >
          <div
            className="edit-dialog"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <h2>{isFolder(editingNode) ? "Rename folder" : "Edit bookmark"}</h2>
            <label className="dialog-field">
              <span>Title</span>
              <input
                type="text"
                value={editDraft.title}
                onChange={(event) =>
                  setEditDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            {!isFolder(editingNode) && (
              <label className="dialog-field">
                <span>URL</span>
                <input
                  type="url"
                  value={editDraft.url}
                  onChange={(event) =>
                    setEditDraft((current) => ({
                      ...current,
                      url: event.target.value,
                    }))
                  }
                />
              </label>
            )}
            <div className="dialog-actions">
              <button type="button" className="dialog-button is-secondary" onClick={() => setEditingNode(null)}>
                Cancel
              </button>
              <button type="button" className="dialog-button is-primary" onClick={saveEditedNode}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {createDialog && (
        <div
          className="dialog-backdrop"
          onClick={() => {
            setCreateDialog(null);
          }}
        >
          <div
            className="edit-dialog"
            onClick={(event) => {
              event.stopPropagation();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void createNodeInCurrentFolder();
              }
            }}
          >
            <h2>{createDialog.kind === "folder" ? "Add new folder" : "Add new bookmark"}</h2>
            <label className="dialog-field">
              <span>{createDialog.kind === "folder" ? "Folder name" : "Title"}</span>
              <input
                type="text"
                value={editDraft.title}
                onChange={(event) =>
                  {
                    setEditDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }));
                    setCreateDialogErrors((current) => ({ ...current, title: "" }));
                  }
                }
              />
              {createDialog.kind === "bookmark" && createDialogErrors.title && (
                <span className="dialog-field-error">{createDialogErrors.title}</span>
              )}
            </label>
            {createDialog.kind === "bookmark" && (
              <label className="dialog-field">
                <span>URL</span>
                <input
                  type="url"
                  placeholder="https://"
                  value={editDraft.url}
                  onChange={(event) =>
                    {
                      setEditDraft((current) => ({
                        ...current,
                        url: event.target.value,
                      }));
                      setCreateDialogErrors((current) => ({ ...current, url: "" }));
                    }
                  }
                />
                {createDialogErrors.url && (
                  <span className="dialog-field-error">{createDialogErrors.url}</span>
                )}
              </label>
            )}
            <div className="dialog-actions">
              <button type="button" className="dialog-button is-secondary" onClick={() => setCreateDialog(null)}>
                Cancel
              </button>
              <button type="button" className="dialog-button is-primary" onClick={createNodeInCurrentFolder}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
