/**
 * JavaFlow — Webview Panel
 *
 * Creates and manages the VS Code WebviewPanel that renders the mindmap.
 * Uses Markmap (CDN) to render a Markdown tree as an interactive SVG.
 */

import * as vscode from 'vscode';
import * as path from 'path';

export class MindmapPanel {
  public static currentPanel: MindmapPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    markdownContent: string,
    title: string
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    // Reuse existing panel if available
    if (MindmapPanel.currentPanel) {
      MindmapPanel.currentPanel._panel.reveal(column);
      MindmapPanel.currentPanel._update(markdownContent, title);
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

    MindmapPanel.currentPanel = new MindmapPanel(panel, extensionUri, markdownContent, title);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
    markdownContent: string,
    title: string
  ) {
    this._panel = panel;
    this._update(markdownContent, title);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'alert':
            vscode.window.showInformationMessage(message.text);
            break;
          case 'openFile':
            vscode.workspace.openTextDocument(message.path).then(doc => {
              vscode.window.showTextDocument(doc);
            });
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public dispose(): void {
    MindmapPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) { d.dispose(); }
    }
  }

  private _update(markdownContent: string, title: string): void {
    this._panel.title = `☕ ${title} — JavaFlow`;
    this._panel.webview.html = this._getHtmlContent(markdownContent);
  }

  private _getHtmlContent(markdownContent: string): string {
    // Escape backtick and backslash for safe embedding in a JS template literal
    const escaped = markdownContent
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>JavaFlow Mindmap</title>

  <!-- Markmap CDN -->
  <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
  <script src="https://cdn.jsdelivr.net/npm/markmap-view@0.17"></script>
  <script src="https://cdn.jsdelivr.net/npm/markmap-lib@0.17"></script>

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
    #mindmap-container svg {
      width: 100%;
      height: 100%;
    }

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
      z-index: 20;
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
  <h2 id="title-text">☕ JavaFlow Mindmap</h2>
  <button class="btn" id="btn-expand-all" title="Expand all nodes">Expand All</button>
  <button class="btn" id="btn-collapse-all" title="Collapse all nodes">Collapse All</button>
  <button class="btn" id="btn-fit" title="Fit to screen">⊞ Fit</button>
  <button class="btn" id="btn-search" title="Search nodes">🔍 Search</button>
  <button class="btn" id="btn-export" title="Export as SVG">↓ SVG</button>
</div>

<!-- Legend -->
<div id="legend">
  <span class="legend-item">🏛 Class</span>
  <span class="legend-item">📐 Interface</span>
  <span class="legend-item">🔢 Enum</span>
  <span class="legend-item">🔓 Public</span>
  <span class="legend-item">🔒 Private/Protected</span>
  <span class="legend-item">💡 NLP Summary</span>
  <span class="legend-item">📞 Call Graph</span>
</div>

<!-- Search bar -->
<div id="search-bar">
  <input id="search-input" type="text" placeholder="Search nodes…" />
  <span id="search-count"></span>
  <button class="btn" id="btn-search-close">✕</button>
</div>

<!-- Map container -->
<div id="mindmap-container">
  <div id="loading">
    <div class="spinner"></div>
    <p>Generating mindmap…</p>
  </div>
  <svg id="mindmap"></svg>
</div>

<script>
(async () => {
  const markdown = \`${escaped}\`;

  // Wait for markmap libs
  await new Promise(r => {
    if (window.markmap) { r(); return; }
    const check = setInterval(() => {
      if (window.markmap) { clearInterval(check); r(); }
    }, 100);
  });

  const { Markmap, loadCSS, loadJS } = window.markmap;
  const { Transformer } = window.markmap;

  const transformer = new Transformer();
  const { root, features } = transformer.transform(markdown);
  const { styles, scripts } = transformer.getUsedAssets(features);

  if (styles) { loadCSS(styles); }
  if (scripts) { await loadJS(scripts, { getMarkmap: () => window.markmap }); }

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

  // ── Toolbar buttons ──────────────────────────────────────────

  document.getElementById('btn-fit').addEventListener('click', () => {
    mm.fit();
  });

  document.getElementById('btn-expand-all').addEventListener('click', () => {
    mm.setData(root);
    setTimeout(() => mm.fit(), 50);
  });

  document.getElementById('btn-collapse-all').addEventListener('click', () => {
    function collapse(node) {
      if (node.children) {
        node.payload = { ...node.payload, fold: 1 };
        node.children.forEach(collapse);
      }
    }
    const collapsed = JSON.parse(JSON.stringify(root));
    if (collapsed.children) { collapsed.children.forEach(collapse); }
    mm.setData(collapsed);
  });

  // ── SVG Export ───────────────────────────────────────────────
  document.getElementById('btn-export').addEventListener('click', () => {
    const svg = document.getElementById('mindmap');
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'javaflow-mindmap.svg';
    a.click();
    URL.revokeObjectURL(url);
  });

  // ── Search ───────────────────────────────────────────────────
  const searchBar = document.getElementById('search-bar');
  const searchInput = document.getElementById('search-input');
  const searchCount = document.getElementById('search-count');

  document.getElementById('btn-search').addEventListener('click', () => {
    searchBar.classList.toggle('visible');
    if (searchBar.classList.contains('visible')) { searchInput.focus(); }
  });
  document.getElementById('btn-search-close').addEventListener('click', () => {
    searchBar.classList.remove('visible');
    searchInput.value = '';
    searchCount.textContent = '';
  });

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) { searchCount.textContent = ''; return; }

    let count = 0;
    function walk(node) {
      const text = (node.content || '').toLowerCase();
      if (text.includes(q)) { count++; }
      if (node.children) { node.children.forEach(walk); }
    }
    walk(root);
    searchCount.textContent = count ? \`\${count} match\${count > 1 ? 'es' : ''}\` : 'No matches';
  });

})();
</script>
</body>
</html>`;
  }
}
