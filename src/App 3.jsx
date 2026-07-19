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

function flattenFolders(nodes, depth = 0, parentId = null) {
  return nodes.flatMap((node) => {
    if (!isFolder(node)) {
      return [];
    }

    const current = [{ id: node.id, title: node.title || "Untitled", depth, parentId, childCount: node.children?.length ?? 0 }];
    return current.concat(flattenFolders(node.children ?? [], depth + 1, node.id));
  });
}

function collectFolderIds(nodes) {
  return nodes.flatMap((node) => {
    if (!isFolder(node)) {
      return [];
    }

    return [node.id].concat(collectFolderIds(node.children ?? []));
  });
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

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
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

function TreeNode({ depth, expandedFolders, node, onSelect, onToggle, selectedFolderId }) {
  const folderChildren = (node.children ?? []).filter(isFolder);
  const hasFolderChildren = folderChildren.length > 0;
  const isExpanded = expandedFolders.has(node.id);

  return (
    <>
      <div className={`tree-node depth-${depth}`}>
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
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className={isExpanded ? "is-expanded" : ""}
            >
              <path d="M9.29 6.71 13.58 11l-4.29 4.29 1.42 1.42L16.42 11l-5.71-5.71-1.42 1.42Z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className={`tree-row ${selectedFolderId === node.id ? "is-active" : ""}`}
          onClick={() => onSelect(node.id)}
        >
          <span className="tree-row-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 4 12 6h8a2 2 0 0 1 2 2v8.5A3.5 3.5 0 0 1 18.5 20h-13A3.5 3.5 0 0 1 2 16.5v-9A3.5 3.5 0 0 1 5.5 4H10Zm0.8 2H5.5A1.5 1.5 0 0 0 4 7.5v9A1.5 1.5 0 0 0 5.5 18h13a1.5 1.5 0 0 0 1.5-1.5V8a.5.5 0 0 0-.5-.5h-7.8L9.7 6Z" />
            </svg>
          </span>
          <span className="tree-row-title">{node.title || "Untitled"}</span>
          <span className="tree-row-meta">{node.children?.length ?? 0}</span>
        </button>
      </div>

      {hasFolderChildren && isExpanded && (
        <div className="tree-children">
          {folderChildren.map((child) => (
            <TreeNode
              key={child.id}
              depth={depth + 1}
              expandedFolders={expandedFolders}
              node={child}
              onSelect={onSelect}
              onToggle={onToggle}
              selectedFolderId={selectedFolderId}
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
  const [expandedFolders, setExpandedFolders] = useState(() => new Set(["1", "11"]));
  const [query, setQuery] = useState("");
  const [loadingState, setLoadingState] = useState("loading");

  useEffect(() => {
    async function loadBookmarks() {
      if (!globalThis.chrome?.bookmarks?.getTree) {
        setLoadingState("demo");
        return;
      }

      try {
        const nodes = await chrome.bookmarks.getTree();
        setTree(nodes);
        setSelectedFolderId(nodes[0]?.id ?? "1");
        setExpandedFolders(new Set(collectFolderIds(nodes)));
        setLoadingState("ready");
      } catch {
        setLoadingState("error");
      }
    }

    loadBookmarks();
  }, []);

  const folders = useMemo(() => flattenFolders(tree), [tree]);
  const selectedFolder = useMemo(() => findNodeById(tree, selectedFolderId) ?? findNodeById(tree, folders[0]?.id), [folders, selectedFolderId, tree]);
  const rootFolders = useMemo(() => tree.filter(isFolder), [tree]);
  const childFolders = (selectedFolder?.children ?? []).filter(isFolder);
  const childBookmarks = (selectedFolder?.children ?? []).filter((node) => !isFolder(node));
  const normalizedQuery = query.trim().toLowerCase();
  const toggleFolder = (folderId) => {
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

  const visibleFolders = childFolders.filter((node) => {
    if (!normalizedQuery) {
      return true;
    }

    return node.title?.toLowerCase().includes(normalizedQuery);
  });

  const visibleBookmarks = childBookmarks.filter((node) => {
    if (!normalizedQuery) {
      return true;
    }

    return (
      node.title?.toLowerCase().includes(normalizedQuery) ||
      node.url?.toLowerCase().includes(normalizedQuery)
    );
  });

  const breadcrumbs = buildPath(tree, selectedFolder?.id ?? "");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <p className="eyebrow">Bookmark Surface</p>
            <h1>Gridmarks</h1>
          </div>
          <span className={`status-pill is-${loadingState}`}>
            {loadingState === "ready" && "Live"}
            {loadingState === "demo" && "Demo"}
            {loadingState === "loading" && "Loading"}
            {loadingState === "error" && "Retry"}
          </span>
        </div>

        <label className="search-field">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0-2a8 8 0 1 0 4.9 14.3l4.4 4.4 1.4-1.4-4.4-4.4A8 8 0 0 0 10 2Z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter current folder"
          />
        </label>

        <nav className="folder-tree" aria-label="Bookmark folders">
          {rootFolders.map((folder) => (
            <TreeNode
              key={folder.id}
              depth={0}
              expandedFolders={expandedFolders}
              node={folder}
              onSelect={setSelectedFolderId}
              onToggle={toggleFolder}
              selectedFolderId={selectedFolder?.id}
            />
          ))}
        </nav>
      </aside>

      <main className="content-pane">
        <header className="content-header">
          <div>
            <div className="breadcrumbs" aria-label="Folder path">
              {breadcrumbs.map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedFolderId(item.id)}>
                  {item.title}
                </button>
              ))}
            </div>
            <h2>{selectedFolder?.title || "Bookmarks"}</h2>
            <p className="content-copy">
              Google-like chrome, Opera-like density. Folder tiles stay native in tone and spacing.
            </p>
          </div>
          <div className="header-stats">
            <div>
              <strong>{visibleFolders.length}</strong>
              <span>Folders</span>
            </div>
            <div>
              <strong>{visibleBookmarks.length}</strong>
              <span>Links</span>
            </div>
          </div>
        </header>

        {visibleFolders.length > 0 && (
          <section className="section-block">
            <div className="section-header">
              <h3>Folders</h3>
            </div>
            <div className="folder-grid">
              {visibleFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className="folder-card"
                  onClick={() => setSelectedFolderId(folder.id)}
                >
                  <span className="folder-card-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M10 4 12 6h8a2 2 0 0 1 2 2v8.5A3.5 3.5 0 0 1 18.5 20h-13A3.5 3.5 0 0 1 2 16.5v-9A3.5 3.5 0 0 1 5.5 4H10Zm0.8 2H5.5A1.5 1.5 0 0 0 4 7.5v9A1.5 1.5 0 0 0 5.5 18h13a1.5 1.5 0 0 0 1.5-1.5V8a.5.5 0 0 0-.5-.5h-7.8L9.7 6Z" />
                    </svg>
                  </span>
                  <span className="folder-card-copy">
                    <strong>{folder.title || "Untitled"}</strong>
                    <small>{folder.children?.length ?? 0} items</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="section-block">
          <div className="section-header">
            <h3>Bookmarks</h3>
          </div>

          {visibleBookmarks.length > 0 ? (
            <div className="bookmark-grid">
              {visibleBookmarks.map((bookmark) => (
                <a
                  key={bookmark.id}
                  className="bookmark-card"
                  href={bookmark.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="bookmark-card-top">
                    <span className="bookmark-avatar">{getInitials(bookmark.title || getHostname(bookmark.url || ""))}</span>
                    <img
                      className="bookmark-favicon"
                      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(bookmark.url || "")}&sz=64`}
                      alt=""
                      loading="lazy"
                    />
                  </span>
                  <strong>{bookmark.title || "Untitled bookmark"}</strong>
                  <span className="bookmark-domain">{getHostname(bookmark.url || "")}</span>
                </a>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No matching bookmarks</h3>
              <p>Change folders or clear the current filter.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
