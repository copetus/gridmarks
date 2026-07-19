import { useEffect, useMemo, useState } from "react";

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
          className={`tree-toggle ${hasFolderChildren ? "" : "is-placeholder"}`}
          onClick={() => {
            if (hasFolderChildren) {
              onToggle(node.id);
            }
          }}
          aria-label={hasFolderChildren ? `${isExpanded ? "Collapse" : "Expand"} ${node.title || "Untitled"}` : undefined}
          aria-hidden={!hasFolderChildren}
        >
          {hasFolderChildren && (
            <svg viewBox="0 0 24 24" aria-hidden="true" className={isExpanded ? "is-expanded" : ""}>
              <path d="M9.29 6.71 13.58 11l-4.29 4.29 1.42 1.42L16.42 11l-5.71-5.71-1.42 1.42Z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className={`tree-row ${selectedFolderId === node.id ? "is-active" : ""} ${dropTargetFolderId === node.id ? "is-drop-target" : ""} ${draggingNodeIds.includes(node.id) ? "is-dragging" : ""}`}
          onClick={() => onSelect(node.id)}
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
          <span className="tree-row-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 4 12 6h8a2 2 0 0 1 2 2v8.5A3.5 3.5 0 0 1 18.5 20h-13A3.5 3.5 0 0 1 2 16.5v-9A3.5 3.5 0 0 1 5.5 4H10Zm0.8 2H5.5A1.5 1.5 0 0 0 4 7.5v9A1.5 1.5 0 0 0 5.5 18h13a1.5 1.5 0 0 0 1.5-1.5V8a.5.5 0 0 0-.5-.5h-7.8L9.7 6Z" />
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
  const [bookmarkClipboard, setBookmarkClipboard] = useState(null);
  const [draggingNodeIds, setDraggingNodeIds] = useState([]);
  const [dropTargetFolderId, setDropTargetFolderId] = useState(null);
  const [dropPlacement, setDropPlacement] = useState(null);
  const [editingNode, setEditingNode] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: "", url: "" });
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    async function loadBookmarks() {
      if (!globalThis.chrome?.bookmarks?.getTree) {
        setLoadingState("demo");
        return;
      }

      try {
        const nodes = await chrome.bookmarks.getTree();
        const initialId = nodes[0]?.id ?? "1";
        setTree(nodes);
        setSelectedFolderId(initialId);
        setExpandedFolders(new Set(getPathIds(nodes, initialId)));
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

    const handlePointerDown = () => {
      setActiveMenuId(null);
      setSidebarContextMenu(null);
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
    setSelectedBookmarkIds([]);
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

  const refreshBookmarks = async () => {
    if (!globalThis.chrome?.bookmarks?.getTree) {
      return;
    }

    const nodes = await chrome.bookmarks.getTree();
    setTree(nodes);
  };

  const clearDragState = () => {
    setDraggingNodeIds([]);
    setDropTargetFolderId(null);
    setDropPlacement(null);
  };

  const orderIdsWithinCurrentFolder = (ids) => {
    const idSet = new Set(ids);
    return childItems.filter((node) => idSet.has(node.id)).map((node) => node.id);
  };

  const moveNodesToFolder = async (sourceIds, targetFolderId) => {
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

      await refreshBookmarks();
    } else {
      setTree((current) => {
        let nextTree = current;

        for (const sourceId of orderedSourceIds) {
          const liveNode = findNodeById(nextTree, sourceId);
          if (!liveNode) {
            continue;
          }

          const removed = removeNodeById(nextTree, sourceId);
          nextTree = insertNodeIntoFolder(removed, targetFolderId, liveNode);
        }

        return nextTree;
      });
    }

    const movedKinds = orderedSourceIds.map((id) => findNodeById(tree, id)).filter(Boolean);
    const allBookmarks = movedKinds.every((node) => !isFolder(node));
    setStatusMessage(allBookmarks && movedKinds.length > 1 ? `${movedKinds.length} bookmarks moved` : `${allBookmarks ? "Bookmark" : "Item"} moved`);
    clearDragState();
    setSelectedBookmarkIds([]);
    setSelectionAnchorId(null);
  };

  const moveNodesRelativeToSibling = async (sourceIds, targetId, position) => {
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
      await refreshBookmarks();
    } else {
      setTree((current) => reorderChildrenInFolder(current, selectedFolder.id, nextOrder));
    }

    setStatusMessage(orderedSourceIds.length > 1 ? `${orderedSourceIds.length} bookmarks reordered` : "Bookmark reordered");
    clearDragState();
  };

  const handleDragStart = (event, node) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    const draggedIds =
      !isFolder(node) && selectedBookmarkIds.includes(node.id) && selectedBookmarkIds.length > 0
        ? orderIdsWithinCurrentFolder(selectedBookmarkIds)
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

    const nextTitle = editDraft.title.trim() || "Untitled bookmark";
    const nextUrl = editDraft.url.trim();

    if (globalThis.chrome?.bookmarks?.update) {
      await chrome.bookmarks.update(editingNode.id, {
        title: nextTitle,
        ...(isFolder(editingNode) ? {} : { url: nextUrl }),
      });
      await refreshBookmarks();
    } else {
      setTree((current) =>
        updateNodeById(current, editingNode.id, (node) => ({
          ...node,
          title: nextTitle,
          ...(isFolder(node) ? {} : { url: nextUrl }),
        })),
      );
    }

    setEditingNode(null);
    setStatusMessage(isFolder(editingNode) ? "Folder renamed" : "Bookmark updated");
  };

  const deleteNode = async (node) => {
    if (globalThis.chrome?.bookmarks?.remove) {
      if (isFolder(node) && chrome.bookmarks.removeTree) {
        await chrome.bookmarks.removeTree(node.id);
      } else {
        await chrome.bookmarks.remove(node.id);
      }
      await refreshBookmarks();
    } else {
      setTree((current) => removeNodeById(current, node.id));
    }

    if (bookmarkClipboard?.node.id === node.id) {
      setBookmarkClipboard(null);
    }

    setActiveMenuId(null);
    setSidebarContextMenu(null);
    setStatusMessage(isFolder(node) ? "Folder deleted" : "Bookmark deleted");
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

    if (bookmarkClipboard.mode === "cut") {
      if (globalThis.chrome?.bookmarks?.move) {
        await chrome.bookmarks.move(bookmarkClipboard.node.id, {
          parentId: selectedFolder.id,
        });
        await refreshBookmarks();
      } else {
        const bookmarkNode = findNodeById(tree, bookmarkClipboard.node.id);
        if (bookmarkNode) {
          setTree((current) => {
            const removed = removeNodeById(current, bookmarkNode.id);
            return insertNodeIntoFolder(removed, selectedFolder.id, bookmarkNode);
          });
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
      await refreshBookmarks();
      setStatusMessage(`${isFolder(bookmarkClipboard.node) ? "Folder" : "Bookmark"} pasted`);
    } else {
      setTree((current) =>
        insertNodeIntoFolder(current, selectedFolder.id, {
          ...cloneBookmarkNode(bookmarkClipboard.node),
        }),
      );
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
  const visibleBookmarkIds = useMemo(
    () => visibleItems.filter((item) => item.kind === "bookmark").map((item) => item.id),
    [visibleItems],
  );

  const handleBookmarkSelection = (event, bookmarkId) => {
    if (!event.shiftKey) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();

    const anchorId = selectionAnchorId && visibleBookmarkIds.includes(selectionAnchorId) ? selectionAnchorId : bookmarkId;
    const anchorIndex = visibleBookmarkIds.indexOf(anchorId);
    const targetIndex = visibleBookmarkIds.indexOf(bookmarkId);

    if (anchorIndex === -1 || targetIndex === -1) {
      setSelectedBookmarkIds([bookmarkId]);
      setSelectionAnchorId(bookmarkId);
      return true;
    }

    const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
    setSelectedBookmarkIds(visibleBookmarkIds.slice(start, end + 1));
    setSelectionAnchorId(anchorId);
    return true;
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

      <main className="content-pane">
        {statusMessage && <div className="status-toast">{statusMessage}</div>}
        <header className="toolbar">
          <label className="search-field">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0-2a8 8 0 1 0 4.9 14.3l4.4 4.4 1.4-1.4-4.4-4.4A8 8 0 0 0 10 2Z" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search bookmarks"
            />
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
          <div className="breadcrumbs" aria-label="Folder path">
            {breadcrumbs.map((item, index) => (
              <span key={item.id} className="breadcrumb-item">
                <button type="button" onClick={() => handleSelectFolder(item.id)}>
                  {item.title}
                </button>
                {index < breadcrumbs.length - 1 && <span>/</span>}
              </span>
            ))}
          </div>
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
          <section className={`content-grid is-${viewMode}`}>
            {visibleItems.map((item) =>
              item.kind === "folder" ? (
                <div
                  key={item.id}
                  className={`content-card folder-card ${dropTargetFolderId === item.id ? "is-drop-target" : ""} ${draggingNodeIds.includes(item.id) ? "is-dragging" : ""} ${dropPlacement?.targetId === item.id ? `is-drop-${dropPlacement.mode}` : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectFolder(item.id)}
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
                      setActiveMenuId((current) => (current === item.id ? null : item.id));
                    }}
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
                    </svg>
                  </button>
                  <div className="folder-card-body">
                    <span className="folder-glyph">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M10 4 12 6h8a2 2 0 0 1 2 2v8.5A3.5 3.5 0 0 1 18.5 20h-13A3.5 3.5 0 0 1 2 16.5v-9A3.5 3.5 0 0 1 5.5 4H10Zm0.8 2H5.5A1.5 1.5 0 0 0 4 7.5v9A1.5 1.5 0 0 0 5.5 18h13a1.5 1.5 0 0 0 1.5-1.5V8a.5.5 0 0 0-.5-.5h-7.8L9.7 6Z" />
                      </svg>
                    </span>
                    <strong>{item.title || "Untitled"}</strong>
                  </div>
                  {activeMenuId === item.id && renderFolderMenu(item)}
                </div>
              ) : (
                <a
                  key={item.id}
                  className={`content-card bookmark-card ${draggingNodeIds.includes(item.id) ? "is-dragging" : ""} ${selectedBookmarkIds.includes(item.id) ? "is-selected" : ""} ${dropPlacement?.targetId === item.id ? `is-drop-${dropPlacement.mode}` : ""}`}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  draggable
                  onClick={(event) => {
                    if (handleBookmarkSelection(event, item.id)) {
                      return;
                    }
                    setSelectedBookmarkIds([]);
                    setSelectionAnchorId(null);
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
                      <span className="bookmark-domain-pill">{getInitials(getHostname(item.url || ""))}</span>
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
                      setActiveMenuId((current) => (current === item.id ? null : item.id));
                    }}
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
                    </svg>
                  </button>
                  {activeMenuId === item.id && (
                    <div
                      className="bookmark-menu"
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
                  )}
                </a>
              ),
            )}
          </section>
        ) : (
          <section className="empty-state">
            <h2>No results in this folder</h2>
            <p>Clear the search or choose another folder from the sidebar.</p>
          </section>
        )}
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
