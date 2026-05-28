# Changelog

All notable changes to JavaFlow will be documented in this file.

## [1.0.0] - 2026-05-28

### Added

- **CST-based Java parser** — replaced the regex parser with `java-parser` (chevrotain CST), correctly handling all standard Java syntax.
- **Record support** — `record` declarations are now parsed and surfaced in the mindmap with their components as `public final` fields.
- **Class-level annotations** — generic annotation extraction including parameterised forms such as `@Table(name="users")`.
- **Enum constants** — declared in source order, shown under a `🔢 Constants` section.
- **Nested and static nested classes** — including builder pattern classes, with correct parent–child links.
- **Generic class declarations** — `Container<T>`, `Repository<T, ID>` etc. parsed correctly.
- **Constructors** — shown as first-class members alongside methods.
- **Method call graph extraction** — CST body walker collects all invoked method names, including chained calls (`findById().orElseThrow()`).
- **Cross-file call resolution** — `WorkspaceIndex` resolves raw call names to owning classes across the workspace.
- **Recursive call chain rendering** — call chains follow up to `javaflow.maxDepth` levels with cycle detection.
- **Multi-panel support** — multiple mindmap panels can be open simultaneously; each unique file or folder gets its own panel.
- **Search with prev/next navigation** — finds matching nodes, shows `X / Y` count, navigates with Prev/Next or Enter/Shift+Enter, highlights the match, and pans the viewport to it.
- **SVG export via Save As dialog** — routes through the extension host (`showSaveDialog` + `workspace.fs.writeFile`) instead of the broken webview download approach.
- **Multi-class file support** — `.java` files with more than one top-level class now render all classes under a shared filename root.
- **esbuild bundling** — all runtime dependencies (including `java-parser`) are bundled into `out/extension.js` so the VSIX is fully self-contained.
- **Offline-first** — Markmap, D3, and all assets are bundled locally; no CDN required.

### Fixed

- Extension commands silently returning "not found" because `node_modules` was excluded from the VSIX and `java-parser` was unavailable at runtime.
- Expand All button not working due to `_initializeData` overwriting fold values; fixed by walking `mm.state.data` directly.
- Interface methods incorrectly showing `package` visibility; now defaulted to `public`.
- KaTeX dependency error from `markmap-lib`; suppressed by passing an empty plugin list to `Transformer`.
- Race condition in markmap readiness check; now waits for `window.markmap.Transformer` specifically.
- SVG export silently doing nothing inside a VS Code webview; fixed by routing through extension host.
- Single-file mode dropping all top-level classes after the first.

### Changed

- Packaging switched from `tsc` to `esbuild` for `vscode:prepublish` — produces a single bundled `out/extension.js`.
- `npm run compile` (tsc) retained for development and test runs.

## [0.1.0] - Initial Prototype

### Added

- VS Code command for generating a mind map from a single Java file.
- VS Code command for generating a folder-level Java mind map.
- Regex-based Java source parser for packages, imports, classes, fields, methods, and simple call references.
- Template-based NLP summaries for classes, fields, and methods from Javadoc or naming patterns.
- Markmap-powered webview for interactive visualization.
- Toolbar actions: Expand All, Collapse All, Fit to Screen, Search, Export SVG.
- Extension settings for call depth, private member visibility, and summary generation.
