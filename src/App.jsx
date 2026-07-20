import { useEffect, useMemo, useRef, useState } from "react";

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

function getPreviewUrl(url) {
  return `https://image.thum.io/get/width/1200/crop/720/noanimate/${url}`;
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
  if (!clipboard?.node) {
    return clipboard;
  }

  return {
    ...clipboard,
    node: remapNodeIds([clipboard.node], idMap)[0],
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
  depth,
  draggingNodeIds,
  dropTargetFolderId,
  expandedFolders,
  node,
  onDragEnd,
  onDragStart,
  onDropOnFolder,
  onFolderDragOver,
  onFolderDragLeave,
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
          className={`tree-row ${selectedFolderId === node.id ? "is-active" : ""} ${dropTargetFolderId === node.id ? "is-drop-target" : ""} ${draggingNodeIds.includes(node.id) ? "is-dragging" : ""}`}
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
          onDragOver={(event) => onFolderDragOver(event, node.id)}
          onDragLeave={() => onFolderDragLeave(node.id)}
          onDrop={(event) => onDropOnFolder(event, node.id)}
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
                <path d="M9 6l6 6-6 6" />
              </svg>
            )}
          </span>
          <span className="tree-row-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 4H4c-1.1 0-2 .9-2 2v2h20V8c0-1.1-.9-2-2-2h-8l-2-2Zm10 6H4c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-6c0-1.1-.9-2-2-2Z" />
            </svg>
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
              depth={depth + 1}
              draggingNodeIds={draggingNodeIds}
              dropTargetFolderId={dropTargetFolderId}
              expandedFolders={expandedFolders}
              node={child}
              onDragEnd={onDragEnd}
              onDragStart={onDragStart}
              onDropOnFolder={onDropOnFolder}
              onFolderDragOver={onFolderDragOver}
              onFolderDragLeave={onFolderDragLeave}
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
  const [tree, setTree] = useState(FALLBACK_TREE);
  const [selectedFolderId, setSelectedFolderId] = useState("1");
  const [expandedFolders, setExpandedFolders] = useState(() => new Set(["1"]));
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [loadingState, setLoadingState] = useState("loading");
  const [failedPreviewUrls, setFailedPreviewUrls] = useState({});
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [sidebarContextMenu, setSidebarContextMenu] = useState(null);
  const [cardMenuPosition, setCardMenuPosition] = useState(null);
  const [bookmarkClipboard, setBookmarkClipboard] = useState(null);
  const [draggingNodeIds, setDraggingNodeIds] = useState([]);
  const [dropTargetFolderId, setDropTargetFolderId] = useState(null);
  const [dropPlacement, setDropPlacement] = useState(null);
  const [editingNode, setEditingNode] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: "", url: "" });
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [dragSelection, setDragSelection] = useState(null);

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

  treeRef.current = tree;
  selectedFolderIdRef.current = selectedFolderId;
  expandedFoldersRef.current = expandedFolders;
  bookmarkClipboardRef.current = bookmarkClipboard;
  undoStackRef.current = undoStack;
  redoStackRef.current = redoStack;

  const getFirstFolderId = (nodes) => nodes.find(isFolder)?.id ?? "";

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
    setSelectedBookmarkIds([]);
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
        const initialId = nodes[0]?.id ?? "1";
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
    if (!activeMenuId && !sidebarContextMenu) {
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
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [activeMenuId, sidebarContextMenu]);

  useEffect(() => {
    if (!statusMessage) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setStatusMessage("");
    }, 2400);

    return () => window.clearTimeout(timeoutId);
  }, [statusMessage]);

  const rootFolders = useMemo(() => tree.filter(isFolder), [tree]);
  const selectedFolder = useMemo(() => findNodeById(tree, selectedFolderId) ?? rootFolders[0] ?? null, [rootFolders, selectedFolderId, tree]);
  const childItems = selectedFolder?.children ?? [];
  const normalizedQuery = query.trim().toLowerCase();
  const breadcrumbs = buildPath(tree, selectedFolder?.id ?? "");

  useEffect(() => {
    setSelectedItemIds([]);
    setSelectionAnchorId(null);
  }, [selectedFolderId]);

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

  const clearDragState = () => {
    setDraggingNodeIds([]);
    setDropTargetFolderId(null);
    setDropPlacement(null);
  };

  const clearSelection = () => {
    setSelectedItemIds([]);
    setSelectionAnchorId(null);
    setDragSelection(null);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (editingNode) {
          setEditingNode(null);
          return;
        }

        if (selectedItemIds.length) {
          clearSelection();
        }
        return;
      }

      const isUndoShortcut = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "z";
      if (!isUndoShortcut) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
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
  }, [clearSelection, editingNode, handleRedo, handleUndo, selectedItemIds.length]);

  const orderIdsWithinCurrentFolder = (ids) => {
    const idSet = new Set(ids);
    return childItems.filter((node) => idSet.has(node.id)).map((node) => node.id);
  };

  const moveNodesToFolder = async (sourceIds, targetFolderId) => {
    const beforeSnapshot = captureSnapshot();
    const orderedSourceIds = orderIdsWithinCurrentFolder(sourceIds);
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

    setStatusMessage(orderedSourceIds.length > 1 ? `${orderedSourceIds.length} bookmarks reordered` : "Bookmark reordered");
    clearDragState();
  };

  const handleDragStart = (event, node) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    const draggedIds =
      selectedItemIds.includes(node.id) && selectedItemIds.length > 0
        ? orderIdsWithinCurrentFolder(selectedItemIds)
        : [node.id];
    event.dataTransfer.setData("text/plain", draggedIds.join(","));
    setActiveMenuId(null);
    setSidebarContextMenu(null);
    setDraggingNodeIds(draggedIds);
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

  const handleFolderDragOver = (event, folderId) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
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
    event.dataTransfer.dropEffect = "move";

    if (!draggingNodeIds.length || draggingNodeIds.includes(item.id)) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const midpointY = rect.top + rect.height / 2;
    const isFolderItem = item.kind === "folder";
    let nextPlacement;

    if (isFolderItem) {
      const topThreshold = rect.top + rect.height * 0.28;
      const bottomThreshold = rect.bottom - rect.height * 0.28;

      if (event.clientY < topThreshold) {
        nextPlacement = { targetId: item.id, mode: "before" };
      } else if (event.clientY > bottomThreshold) {
        nextPlacement = { targetId: item.id, mode: "after" };
      } else {
        nextPlacement = { targetId: item.id, mode: "inside" };
        if (dropTargetFolderId !== item.id) {
          setDropTargetFolderId(item.id);
        }
      }
    } else {
      nextPlacement = {
        targetId: item.id,
        mode: event.clientY < midpointY ? "before" : "after",
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

  const openEditDialog = (node) => {
    setEditingNode(node);
    setEditDraft({
      title: node.title || "",
      url: node.url || "",
    });
    setActiveMenuId(null);
    setSidebarContextMenu(null);
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
    const beforeSnapshot = captureSnapshot();
    const nextClipboard = bookmarkClipboard?.node.id === node.id ? null : bookmarkClipboard;

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
  };

  const deleteSelectedItems = async () => {
    const selectedNodes = orderIdsWithinCurrentFolder(selectedItemIds)
      .map((id) => findNodeById(treeRef.current, id))
      .filter(Boolean);

    if (!selectedNodes.length) {
      return;
    }

    const beforeSnapshot = captureSnapshot();
    const selectedIdSet = new Set(selectedNodes.map((node) => node.id));
    const nextClipboard =
      bookmarkClipboard && selectedIdSet.has(bookmarkClipboard.node.id) ? null : bookmarkClipboard;

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
  };

  const copyNode = (node, mode) => {
    setBookmarkClipboard({
      mode,
      node: JSON.parse(JSON.stringify(node)),
    });
    setActiveMenuId(null);
    setSidebarContextMenu(null);
    setStatusMessage(mode === "cut" ? `${isFolder(node) ? "Folder" : "Bookmark"} cut` : `${isFolder(node) ? "Folder" : "Bookmark"} copied`);
  };

  const pasteNode = async () => {
    if (!bookmarkClipboard || !selectedFolder?.id) {
      return;
    }

    const beforeSnapshot = captureSnapshot();

    if (bookmarkClipboard.mode === "cut") {
      if (globalThis.chrome?.bookmarks?.move) {
        await chrome.bookmarks.move(bookmarkClipboard.node.id, {
          parentId: selectedFolder.id,
        });
        const nextTree = await fetchBookmarksTree();
        const afterSnapshot = commitTreeChange(nextTree, {
          bookmarkClipboard: null,
        });
        pushHistoryEntry(beforeSnapshot, afterSnapshot);
      } else {
        const bookmarkNode = findNodeById(tree, bookmarkClipboard.node.id);
        if (bookmarkNode) {
          const removed = removeNodeById(treeRef.current, bookmarkNode.id);
          const nextTree = insertNodeIntoFolder(removed, selectedFolder.id, bookmarkNode);
          const afterSnapshot = commitTreeChange(nextTree, {
            bookmarkClipboard: null,
          });
          pushHistoryEntry(beforeSnapshot, afterSnapshot);
        }
      }
      setStatusMessage(`${isFolder(bookmarkClipboard.node) ? "Folder" : "Bookmark"} moved`);
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

      await createRecursively(bookmarkClipboard.node, selectedFolder.id);
      const nextTree = await fetchBookmarksTree();
      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
      setStatusMessage(`${isFolder(bookmarkClipboard.node) ? "Folder" : "Bookmark"} pasted`);
    } else {
      const nextTree = insertNodeIntoFolder(treeRef.current, selectedFolder.id, {
        ...cloneBookmarkNode(bookmarkClipboard.node),
      });
      const afterSnapshot = commitTreeChange(nextTree);
      pushHistoryEntry(beforeSnapshot, afterSnapshot);
      setStatusMessage(`${isFolder(bookmarkClipboard.node) ? "Folder" : "Bookmark"} pasted`);
    }

    if (bookmarkClipboard.mode === "cut") {
      setBookmarkClipboard(null);
    }

    setActiveMenuId(null);
    setSidebarContextMenu(null);
  };

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
      for (const id of getPathIds(tree, folderId)) {
        next.add(id);
      }
      return next;
    });
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
    setSidebarContextMenu({
      id: node.id,
      x,
      y,
    });
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
        ".content-card, .card-menu, .bookmark-menu, .search-field, .view-toggle, .breadcrumb-item button, .selection-toolbar, .status-toast, .status-pill",
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
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 270;
    const viewportPadding = 16;
    const openUpward = rect.bottom > window.innerHeight * 0.68;
    const left = Math.max(
      viewportPadding,
      Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding),
    );

    setSidebarContextMenu(null);
    setActiveMenuId((current) => {
      const shouldClose = current === itemId;
      setCardMenuPosition(
        shouldClose
          ? null
          : {
              left,
              top: openUpward ? rect.top - 8 : rect.bottom + 8,
              openUpward,
            },
      );
      return shouldClose ? null : itemId;
    });
  };

  const renderFolderMenu = (item, options = {}) => {
    const bookmarkCount = collectBookmarkUrls(item).length;
    const { className = "bookmark-menu", style } = options;

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
          Rename
        </button>
        <button type="button" className="bookmark-menu-item" onClick={() => deleteNode(item)}>
          Delete
        </button>
        <div className="bookmark-menu-divider" />
        <button type="button" className="bookmark-menu-item" onClick={() => copyNode(item, "cut")}>
          Cut
        </button>
        <button type="button" className="bookmark-menu-item" onClick={() => copyNode(item, "copy")}>
          Copy
        </button>
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={pasteNode}
          disabled={!bookmarkClipboard}
        >
          Paste
        </button>
        <div className="bookmark-menu-divider" />
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={() => openFolderInNewWindow(item, true)}
        >
          Open all ({bookmarkCount}) in Incognito window
        </button>
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={() => openFolderInNewTabGroup(item)}
        >
          Open all ({bookmarkCount}) in new tab group
        </button>
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={() => openUrlsInNewTabs(collectBookmarkUrls(item))}
        >
          Open all ({bookmarkCount})
        </button>
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={() => openFolderInNewWindow(item)}
        >
          Open all ({bookmarkCount}) in new window
        </button>
        <button type="button" className="bookmark-menu-item" disabled>
          Open in split view
        </button>
      </div>
    );
  };

  const renderBookmarkMenu = (item, options = {}) => {
    const { className = "bookmark-menu", style } = options;

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
          Edit
        </button>
        <button type="button" className="bookmark-menu-item" onClick={() => deleteNode(item)}>
          Delete
        </button>
        <div className="bookmark-menu-divider" />
        <button type="button" className="bookmark-menu-item" onClick={() => copyNode(item, "cut")}>
          Cut
        </button>
        <button type="button" className="bookmark-menu-item" onClick={() => copyNode(item, "copy")}>
          Copy
        </button>
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={pasteNode}
          disabled={!bookmarkClipboard}
        >
          Paste
        </button>
        <div className="bookmark-menu-divider" />
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={() => openBookmarkInNewWindow(item.url || "", true)}
        >
          Open in Incognito window
        </button>
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={() => openBookmarkInNewTabGroup(item)}
        >
          Open in new tab group
        </button>
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={() => openBookmarkInNewTab(item.url || "")}
        >
          Open in new tab
        </button>
        <button
          type="button"
          className="bookmark-menu-item"
          onClick={() => openBookmarkInNewWindow(item.url || "")}
        >
          Open in new window
        </button>
        <button type="button" className="bookmark-menu-item" disabled>
          Open in split view
        </button>
      </div>
    );
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <nav className="folder-tree" aria-label="Bookmark folders">
          {rootFolders.map((folder) => (
            <TreeNode
              key={folder.id}
              depth={0}
              draggingNodeIds={draggingNodeIds}
              dropTargetFolderId={dropTargetFolderId}
              expandedFolders={expandedFolders}
              node={folder}
              onDragEnd={handleDragEnd}
              onDragStart={handleDragStart}
              onDropOnFolder={handleDropOnFolder}
              onFolderDragOver={handleFolderDragOver}
              onFolderDragLeave={handleFolderDragLeave}
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
        {statusMessage && <div className="status-toast">{statusMessage}</div>}
        {selectedItemIds.length > 1 && (
          <div className="selection-toolbar" role="toolbar" aria-label="Selection actions">
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
        )}
        <header className="toolbar">
          <label className="search-field">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0-2a8 8 0 1 0 4.9 14.3l4.4 4.4 1.4-1.4-4.4-4.4A8 8 0 0 0 10 2Z" />
            </svg>
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
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
        </header>

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
            <span className={`status-pill is-${loadingState}`}>
              {loadingState === "ready" && "Live"}
              {loadingState === "demo" && "Demo"}
              {loadingState === "loading" && "Loading"}
              {loadingState === "error" && "Retry"}
            </span>
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
                  className={`content-card folder-card ${dropTargetFolderId === item.id ? "is-drop-target" : ""} ${draggingNodeIds.includes(item.id) ? "is-dragging" : ""} ${selectedItemIds.includes(item.id) ? "is-selected" : ""} ${dropPlacement?.targetId === item.id ? `is-drop-${dropPlacement.mode}` : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    if (handleItemSelection(event, item.id)) {
                      return;
                    }
                    selectSingleItem(item.id);
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
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M10 4H4c-1.1 0-2 .9-2 2v2h20V8c0-1.1-.9-2-2-2h-8l-2-2Zm10 6H4c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-6c0-1.1-.9-2-2-2Z" />
                      </svg>
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
                  className={`content-card bookmark-card ${draggingNodeIds.includes(item.id) ? "is-dragging" : ""} ${selectedItemIds.includes(item.id) ? "is-selected" : ""} ${dropPlacement?.targetId === item.id ? `is-drop-${dropPlacement.mode}` : ""}`}
                  role="link"
                  tabIndex={0}
                  draggable
                  onClick={(event) => {
                    if (handleItemSelection(event, item.id)) {
                      return;
                    }
                    selectSingleItem(item.id);
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

                    return (
                      <div className="bookmark-preview" style={{ "--preview-accent": themeColor }}>
                        {!previewFailed && (
                          <img
                            className="bookmark-preview-image"
                            src={getPreviewUrl(item.url || "")}
                            alt=""
                            loading="lazy"
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
            No search results found
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
      </main>
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
    </div>
  );
}

export default App;
