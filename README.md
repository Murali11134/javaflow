# JavaFlow

![JavaFlow Demo](media/demo.gif)

**JavaFlow helps developers understand Java code visually — without sending code anywhere.**

JavaFlow is a Visual Studio Code extension for local Java codebase exploration. It scans Java files, extracts classes, fields, methods, constructors, imports, inheritance details, annotations, nested types, enum constants, and best-effort method call references, then renders the result as an interactive Markmap mind map inside VS Code.

The extension is designed for onboarding, code review, quick architecture exploration, and understanding unfamiliar Java projects.

## Why JavaFlow?

- **Local-first:** no external AI API, no remote upload, and no CDN dependency.
- **Visual:** convert Java files and folders into interactive mind maps.
- **Fast onboarding:** quickly see classes, methods, fields, hierarchy, annotations, and dependencies.
- **Offline-friendly:** Markmap and D3 assets are bundled with the extension.
- **Practical:** works from the editor, explorer context menu, and keyboard shortcuts.

## Features

- Generate a mind map for a single Java file or an entire folder.
- Extract classes, interfaces, enums, records, annotations, fields, methods, and constructors.
- Extract class-level annotations generically, including parameterised forms such as `@Table(name="users")`.
- Extract enum constants in declaration order.
- Detect nested and static nested classes, including common builder-pattern classes.
- Parse generic class declarations such as `Container<T>` and `Repository<T, ID>`.
- Show inheritance (`extends`) and implemented interface details.
- Generate local plain-English summaries from Javadoc or naming patterns.
- Show best-effort method call references and limited recursive call chains.
- Search with prev/next navigation, node highlighting, and automatic ancestor unfolding.
- Expand all, collapse all, fit to screen, refresh, and export the mind map as SVG.
- Open multiple mind map panels simultaneously to compare files or folders side by side.
- Configure whether private members and summaries are shown.

## Current Status

JavaFlow is an early functional VS Code extension. It is useful for small-to-medium Java projects and quick code exploration, but it is not yet a fully type-aware Java analysis engine.

The current parser is CST-based and handles many common Java structures. Method call references are best-effort hints, not a complete compiler-grade call graph. Large enterprise projects, complex dependency injection, overload resolution, inheritance dispatch, and external library calls require deeper analysis work.

## Folder Structure

```text
javaflow/
|-- src/
|   |-- extension.ts
|   |-- parser/
|   |   `-- javaParser.ts
|   |-- nlp/
|   |   `-- summarizer.ts
|   |-- mindmap/
|   |   `-- mindmapGenerator.ts
|   |-- analysis/
|   |   `-- workspaceIndex.ts
|   `-- webview/
|       `-- mindmapPanel.ts
|-- media/
|   |-- d3.min.js
|   |-- markmap-lib.js
|   |-- markmap-view.js
|   `-- demo.gif
|-- scripts/
|   `-- bundle-media.js
|-- package.json
|-- tsconfig.json
`-- .vscodeignore
```

## Architecture Overview

### `src/extension.ts`

Main VS Code extension entry point.

Responsibilities:

- Register `javaflow.showMindmap`.
- Register `javaflow.showMindmapForFolder`.
- Read extension configuration.
- Collect Java files from selected folders.
- Parse selected files or folders.
- Generate mind map Markdown.
- Open or refresh the webview panel.
- Display progress, warnings, and errors.

### `src/parser/javaParser.ts`

CST-based Java parser using `java-parser`, built on Chevrotain.

It extracts:

- Package name and imports.
- Classes, interfaces, enums, annotations, and records.
- Generic class declarations.
- Class-level annotations.
- Enum constants.
- Constructors, fields, and methods with visibility modifiers.
- Nested and static nested classes.
- Inheritance and implemented interfaces.
- Javadoc comments.
- Best-effort method calls from method and constructor bodies.

### `src/nlp/summarizer.ts`

Local template-based summarizer.

Strategy:

1. Prefer Javadoc when available.
2. Fall back to naming-pattern summaries for classes, methods, fields, parameters, and return types.

Examples:

- `getUserName()` -> `Returns the user name.`
- `UserService` -> `Service layer handling user business logic.`
- `saveOrder()` -> `Persists order.`

This is intentionally local and deterministic. It is not semantic AI code understanding.

### `src/analysis/workspaceIndex.ts`

Builds lookup structures over parsed Java classes.

It supports:

- Class lookup by fully qualified name.
- Simple-name aliases when unambiguous.
- Method-owner lookup.
- Best-effort call reference resolution.
- Recursive call-chain traversal with cycle protection.
- Nested-class lookup.

### `src/mindmap/mindmapGenerator.ts`

Converts parsed Java class data into Markdown formatted for Markmap.

It supports:

- Single-class mind maps.
- Folder-level mind maps.
- Optional private member filtering.
- Optional local summaries.
- Method call reference display limits.
- Nested class rendering.
- Import/dependency grouping.

### `src/webview/mindmapPanel.ts`

Creates and manages the VS Code webview panel.

Toolbar actions include:

- Expand all.
- Collapse all.
- Fit to screen.
- Refresh.
- Search.
- Export as SVG.

The webview uses local Markmap and D3 assets and supports multiple open mind map panels.

## Requirements

- Node.js
- npm
- Visual Studio Code 1.85.0 or newer

## Installation for Development

Clone the repository:

```bash
git clone https://github.com/Murali11134/javaflow.git
cd javaflow
```

Install dependencies:

```bash
npm install
```

Compile TypeScript:

```bash
npm run compile
```

Bundle the extension:

```bash
npm run esbuild-prod
```

Open the project in VS Code:

```bash
code .
```

Press `F5` in VS Code to launch an Extension Development Host.

## Usage

### Generate a Mind Map for One Java File

1. Open a `.java` file in VS Code.
2. Right-click inside the editor or use the editor title action.
3. Select `JavaFlow: Show Mindmap`.
4. JavaFlow opens an interactive mind map beside the editor.

### Generate a Mind Map for a Folder

1. Right-click a folder in the VS Code Explorer.
2. Select `JavaFlow: Show Mindmap for Folder`.
3. JavaFlow scans Java files in that folder and creates a package-level mind map.

## Extension Commands

| Command | Description |
| --- | --- |
| `javaflow.showMindmap` | Generates a mind map for the selected or active Java file. |
| `javaflow.showMindmapForFolder` | Generates a mind map for Java files inside a selected folder. |

## Configuration

JavaFlow contributes the following VS Code settings:

| Setting | Default | Description |
| --- | ---: | --- |
| `javaflow.maxDepth` | `3` | Maximum depth of best-effort method call references to show. |
| `javaflow.showPrivateMembers` | `false` | Include private fields and methods in the mind map. |
| `javaflow.nlpSummaries` | `true` | Generate local plain-English summaries for classes and methods. |

## Development Scripts

```bash
npm run compile
```

Compiles TypeScript into `out/`.

```bash
npm run esbuild-prod
```

Bundles the extension and dependencies into `out/extension.js`.

```bash
npm run watch
```

Runs TypeScript in watch mode during development.

```bash
npm test
```

Compiles the extension and runs the VS Code extension test suite.

## Known Limitations

- Folder scanning is currently capped at 200 Java files.
- Method call references are best-effort and name-based; they are not compiler-grade call graphs.
- Overloaded methods, dependency injection, inherited dispatch, and external library calls are not fully resolved.
- Template-based summaries are useful hints, not true semantic code understanding.
- More parser, webview, and integration tests are needed before a polished marketplace release.

## Roadmap

See [ROADMAP.md](ROADMAP.md).

## Contributing

Contributions are welcome. Good first areas:

- Parser edge-case tests.
- Spring Boot sample project tests.
- Configurable folder scan limit.
- Marketplace packaging improvements.
- Better call reference resolution.
- UI polish for large mind maps.

## License

MIT License. See [LICENSE](LICENSE).
