/**
 * JavaFlow — Webview Panel
 *
 * Creates and manages the VS Code WebviewPanel that renders the mindmap.
 * Uses Markmap (bundled locally) to render a Markdown tree as an interactive SVG.
 * Scripts are loaded via webview.asWebviewUri() — no CDN required.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';

export class MindmapPanel {
  // One panel per source key (file path or folder path) — allows multiple
  // panels open simultaneously for side-by-side class comparison.
  private static readonly _openPanels = new Map<string, MindmapPanel>();
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    markdownContent: string,
    title: string,
    key: string
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    const existing = MindmapPanel._openPanels.get(key);
    if (existing) {
      existing._panel.reveal(column);
      existing._update(markdownContent, title);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'javaflowMindmap',
      title,
      column,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        retainContextWhenHidden: true
      }
    );

    MindmapPanel._openPanels.set(key, new MindmapPanel(panel, extensionUri, markdownContent, title, key));
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
    markdownContent: string,
    title: string,
    private readonly _key: string
  ) {
    this._panel = panel;
    this._update(markdownContent, title);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'exportSvg': {
            const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
            const uri = await vscode.window.showSaveDialog({
              defaultUri: workspaceUri
                ? vscode.Uri.joinPath(workspaceUri, 'javaflow-mindmap.svg')
                : undefined,
              filters: { 'SVG Image': ['svg'] }
            });
            if (uri) {
              await vscode.workspace.fs.writeFile(uri, Buffer.from(message.svg, 'utf-8'));
              vscode.window.showInformationMessage(`Mindmap saved to ${uri.fsPath}`);
            }
            break;
          }
        }
      },
      null,
      this._disposables
    );
  }

  public dispose(): void {
    MindmapPanel._openPanels.delete(this._key);
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) { d.dispose(); }
    }
  }

  private _update(markdownContent: string, title: string): void {
    this._panel.title = `☕ ${title} — JavaFlow`;
    this._panel.webview.html = this._getHtmlContent(markdownContent, title);
  }

  private _mediaUri(filename: string): vscode.Uri {
    return this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', filename)
    );
  }

  private _getHtmlContent(markdownContent: string, title: string): string {
    const escapedTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escaped = markdownContent
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$')
      .replace(/<\//g, '<\\/');   // prevent </script> from closing the script block

    // Local script URIs (offline-safe)
    const d3Uri          = this._mediaUri('d3.min.js');
    const markmapViewUri = this._mediaUri('markmap-view.js');
    const markmapLibUri  = this._mediaUri('markmap-lib.js');

    // Webview nonce for CSP
    const nonce = getNonce();

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 script-src 'nonce-${nonce}';
                 style-src 'unsafe-inline';
                 img-src ${this._panel.webview.cspSource};" />
  <title>JavaFlow Mindmap</title>

  <script nonce="${nonce}" src="${d3Uri}"></script>
  <script nonce="${nonce}" src="${markmapViewUri}"></script>
  <script nonce="${nonce}" src="${markmapLibUri}"></script>

  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #1e1e2e;
      color: #cdd6f4;
      font-family: 'Segoe UI', system-ui, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ── Toolbar ── */
    #toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #181825;
      border-bottom: 1px solid #313244;
      flex-shrink: 0;
      flex-wrap: wrap;
    }
    #toolbar h2 {
      font-size: 13px;
      font-weight: 600;
      color: #89b4fa;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .btn {
      padding: 4px 10px;
      border: 1px solid #45475a;
      border-radius: 4px;
      background: #313244;
      color: #cdd6f4;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.15s;
      white-space: nowrap;
    }
    .btn:hover { background: #45475a; }
    .btn.active { background: #89b4fa; color: #1e1e2e; border-color: #89b4fa; }

    /* ── Legend ── */
    #legend {
      display: flex;
      gap: 12px;
      padding: 4px 12px;
      background: #181825;
      border-bottom: 1px solid #313244;
      flex-shrink: 0;
      font-size: 11px;
      flex-wrap: wrap;
    }
    .legend-item { display: flex; align-items: center; gap: 4px; color: #a6adc8; }

    /* ── Mindmap container ── */
    #mindmap-container {
      flex: 1;
      position: relative;
      overflow: hidden;
    }
    #mindmap-container svg { width: 100%; height: 100%; }

    /* ── Loading spinner ── */
    #loading {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #1e1e2e;
      z-index: 10;
    }
    .spinner {
      width: 40px; height: 40px;
      border: 3px solid #313244;
      border-top-color: #89b4fa;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 12px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #loading p { color: #89b4fa; font-size: 13px; }

    /* ── Search overlay ── */
    #search-bar {
      display: none;
      position: absolute;
      top: 10px; right: 10px;
      background: #313244;
      border: 1px solid #45475a;
      border-radius: 6px;
      padding: 6px 10px;
      z-index: 100;
      gap: 6px;
      align-items: center;
    }
    #search-bar.visible { display: flex; }
    #search-input {
      background: transparent;
      border: none;
      outline: none;
      color: #cdd6f4;
      font-size: 13px;
      width: 200px;
    }
    #search-count { color: #a6adc8; font-size: 11px; }
  </style>
</head>
<body>

<!-- Toolbar -->
<div id="toolbar">
  <h2 id="title-text">☕ ${escapedTitle}</h2>
  <button class="btn" id="btn-expand-all" title="Expand all nodes">Expand All</button>
  <button class="btn" id="btn-collapse-all" title="Collapse all nodes">Collapse All</button>
  <button class="btn" id="btn-fit" title="Fit to screen">⊞ Fit</button>
  <button class="btn" id="btn-search" title="Search nodes">🔍 Search</button>
  <button class="btn" id="btn-export" title="Export as SVG" disabled>↓ SVG</button>
</div>

<!-- Legend -->
<div id="legend">
  <span class="legend-item">🏛 Class</span>
  <span class="legend-item">📐 Interface</span>
  <span class="legend-item">🔢 Enum</span>
  <span class="legend-item">📝 Annotation</span>
  <span class="legend-item">🔓 Public</span>
  <span class="legend-item">🔒 Private/Protected</span>
  <span class="legend-item">💡 NLP Summary</span>
  <span class="legend-item">📞 Call Graph</span>
</div>

<!-- Search bar -->
<div id="search-bar">
  <input id="search-input" type="text" placeholder="Search nodes…" />
  <span id="search-count"></span>
  <button class="btn" id="btn-prev" title="Previous match">‹</button>
  <button class="btn" id="btn-next" title="Next match">›</button>
  <button class="btn" id="btn-search-close" title="Close">✕</button>
</div>

<!-- Map container -->
<div id="mindmap-container">
  <div id="loading">
    <div class="spinner"></div>
    <p>Generating mindmap…</p>
  </div>
  <svg id="mindmap"></svg>
</div>

<script nonce="${nonce}">
const vscodeApi = acquireVsCodeApi();
(async () => {
  try {
  const markdown = \`${escaped}\`;

  await new Promise((resolve, reject) => {
    if (window.markmap && window.markmap.Transformer) { resolve(); return; }
    let check;
    const t = setTimeout(() => {
      clearInterval(check);
      document.getElementById('loading').innerHTML = '<p style="color:#f38ba8">Mindmap failed to load — please reload the panel.</p>';
      reject(new Error('Markmap init timeout'));
    }, 10000);
    check = setInterval(() => {
      if (window.markmap && window.markmap.Transformer) { clearInterval(check); clearTimeout(t); resolve(); }
    }, 100);
  });

  const { Markmap } = window.markmap;
  const { Transformer } = window.markmap;

  // Empty plugin list disables KaTeX/Prism — neither is used for Java mindmaps
  // and both would be blocked by the webview CSP anyway.
  const transformer = new Transformer([]);
  const { root } = transformer.transform(markdown);

  const svgEl = document.getElementById('mindmap');
  const mm = Markmap.create(svgEl, {
    zoom: true,
    pan: true,
    spacingHorizontal: 60,
    spacingVertical: 5,
    autoFit: true,
    initialExpandLevel: 2,
    color: (node) => {
      const depth = node.depth || 0;
      const palette = ['#89b4fa','#a6e3a1','#fab387','#f5c2e7','#94e2d5','#cba6f7','#f38ba8'];
      return palette[depth % palette.length];
    }
  }, root);

  document.getElementById('loading').style.display = 'none';
  document.getElementById('btn-export').disabled = false;

  document.getElementById('btn-fit').addEventListener('click', () => { try { mm.fit(); } catch (_) {} });

  document.getElementById('btn-expand-all').addEventListener('click', () => {
    if (!mm?.state?.data) { return; }
    // Walk the live tree directly — bypasses setData/_initializeData which would
    // re-apply initialExpandLevel and overwrite the fold values we set here.
    function expandNode(node) {
      if (node.payload) { node.payload.fold = 0; } else { node.payload = { fold: 0 }; }
      if (node.children) { node.children.forEach(expandNode); }
    }
    expandNode(mm.state.data);
    mm.renderData().then(() => { try { mm.fit(); } catch (_) {} }).catch(() => {});
  });

  document.getElementById('btn-collapse-all').addEventListener('click', () => {
    if (!mm?.state?.data) { return; }
    function collapseAll(node) {
      if (node.payload) { node.payload.fold = 1; } else { node.payload = { fold: 1 }; }
      if (node.children) { node.children.forEach(collapseAll); }
    }
    // Collapse root's children but keep root itself visible so the tree isn't blank.
    const root = mm.state.data;
    if (root.children) { root.children.forEach(collapseAll); }
    mm.renderData().then(() => { try { mm.fit(); } catch (_) {} }).catch(() => {});
  });

  const btnExport = document.getElementById('btn-export');
  btnExport.addEventListener('click', () => {
    const svg = document.getElementById('mindmap');
    vscodeApi.postMessage({ command: 'exportSvg', svg: svg.outerHTML });
  });

  const searchBar   = document.getElementById('search-bar');
  const searchInput = document.getElementById('search-input');
  const searchCount = document.getElementById('search-count');

  let matches = [];
  let matchIndex = -1;
  let cachedParentMap = null;

  function collectMatches(q) {
    matches = [];
    cachedParentMap = null;
    if (!mm?.state?.data) { return; }
    const map = new Map();
    function walk(node, parent) {
      const plain = (node.content || '').replace(/<[^>]*>/g, '').toLowerCase();
      if (plain.includes(q)) { matches.push(node); }
      if (parent && node.state?.id != null) { map.set(node.state.id, parent); }
      if (node.children) { node.children.forEach(c => walk(c, node)); }
    }
    walk(mm.state.data, null);
    cachedParentMap = map;
  }

  async function goToMatch(idx) {
    if (!matches.length) { return; }
    matchIndex = ((idx % matches.length) + matches.length) % matches.length;
    const node = matches[matchIndex];

    // Unfold all ancestors so the matched node is visible
    const parentMap = cachedParentMap ?? new Map();
    let ancestor = node.state?.id != null ? parentMap.get(node.state.id) : undefined;
    while (ancestor) {
      if (ancestor.payload) { ancestor.payload.fold = 0; } else { ancestor.payload = { fold: 0 }; }
      ancestor = ancestor.state?.id != null ? parentMap.get(ancestor.state.id) : undefined;
    }

    await mm.renderData();
    try { await mm.setHighlight(node); } catch (_) {}
    try { await mm.ensureVisible(node, { top: 48, bottom: 48, left: 48, right: 48 }); } catch (_) {}
    searchCount.textContent = \`\${matchIndex + 1} / \${matches.length}\`;
  }

  document.getElementById('btn-search').addEventListener('click', () => {
    searchBar.classList.toggle('visible');
    if (searchBar.classList.contains('visible')) { searchInput.focus(); }
  });
  document.getElementById('btn-search-close').addEventListener('click', () => {
    searchBar.classList.remove('visible');
    searchInput.value = '';
    searchCount.textContent = '';
    matches = [];
    matchIndex = -1;
    try { mm.setHighlight(undefined); } catch (_) {}
  });
  document.getElementById('btn-prev').addEventListener('click', () => goToMatch(matchIndex - 1));
  document.getElementById('btn-next').addEventListener('click', () => goToMatch(matchIndex + 1));

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      searchCount.textContent = '';
      matches = [];
      matchIndex = -1;
      try { mm.setHighlight(undefined); } catch (_) {}
      return;
    }
    collectMatches(q);
    if (matches.length) {
      goToMatch(0);
    } else {
      searchCount.textContent = 'No matches';
      try { mm.setHighlight(undefined); } catch (_) {}
    }
  });

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.shiftKey ? goToMatch(matchIndex - 1) : goToMatch(matchIndex + 1); }
    if (e.key === 'Escape') { document.getElementById('btn-search-close').click(); }
  });

  } catch (_) { /* timeout or init error — loading div already shows the message */ }
})();
</script>
</body>
</html>`;
  }
}

function getNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}
