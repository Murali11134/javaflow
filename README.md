# JavaFlow

JavaFlow is a Visual Studio Code extension that helps developers understand Java codebases through interactive mind maps. It scans Java files, extracts classes, fields, methods, imports, inheritance details, and simple method call references, then renders the result as a Markmap-powered visualization inside VS Code.

The extension is designed for quick code exploration, onboarding, and high-level understanding of Java projects.

## Features

- Generate a mind map for a single Java file.
- Generate a package-level mind map for a folder.
- Extract Java package names, imports, classes, interfaces, enums, fields, and methods.
- Show simple method call references.
- Generate plain-English summaries from Javadoc or naming patterns.
- Search, expand, collapse, fit, and export the rendered mind map as SVG.
- Configure whether private members and NLP-style summaries are shown.

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
|   `-- webview/
|       `-- mindmapPanel.ts
|-- package.json
|-- package-lock.json
|-- tsconfig.json
|-- .gitignore
`-- .vscodeignore
```

### `src/extension.ts`

This is the main entry point of the VS Code extension. It registers the extension commands, reads selected Java files or folders, collects Java source files, calls the parser, generates the mind map content, and opens the webview panel.

Main responsibilities:

- Register `javaflow.showMindmap`.
- Register `javaflow.showMindmapForFolder`.
- Read extension configuration.
- Collect Java files from folders.
- Display progress and error messages.

### `src/parser/javaParser.ts`

This file contains the Java parsing logic. It uses regular expressions and brace walking to extract useful information from Java source code.

It extracts:

- Package name
- Imports
- Classes, interfaces, and enums
- Fields
- Methods
- Visibility modifiers
- Inheritance and implemented interfaces
- Javadoc comments
- Simple method call references

The parser keeps method calls inside common nested Java structures, including `if` / `else` blocks, loops, `try` / `catch` / `finally`, and lambda bodies. Named inner classes are returned as separate class entries. Anonymous class method bodies are intentionally excluded from the enclosing method's call list so their internal calls are not misattributed.

### `src/nlp/summarizer.ts`

This module generates readable summaries for parsed Java code. It first uses Javadoc if available. If Javadoc is missing, it creates simple template-based summaries from class names, method names, field names, parameters, and return types.

Examples:

- `getUserName()` becomes a summary like "Returns the user name."
- `UserService` becomes a summary like "Service layer handling user business logic."
- `saveOrder()` becomes a summary like "Persists order."

### `src/mindmap/mindmapGenerator.ts`

This module converts parsed Java class data into Markdown formatted for Markmap. The generated Markdown is structured as a tree, with sections for package details, summaries, hierarchy, fields, methods, calls, and dependencies.

It supports:

- Single-class mind maps
- Folder-level mind maps
- Optional private member filtering
- Optional summaries
- Call reference display limits

### `src/webview/mindmapPanel.ts`

This file creates and manages the VS Code webview used to display the interactive mind map. It loads Markmap and D3 in the webview, renders the generated Markdown as an SVG mind map, and provides toolbar actions.

Toolbar actions include:

- Expand all
- Collapse all
- Fit to screen
- Search nodes
- Export as SVG

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

Compile the extension:

```bash
npm run compile
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
| `javaflow.maxDepth` | `3` | Maximum depth of call graph traversal shown in the mind map. |
| `javaflow.showPrivateMembers` | `false` | Include private fields and methods in the mind map. |
| `javaflow.nlpSummaries` | `true` | Generate plain-English summaries for classes and methods. |

## Pros

- Clean and simple project structure.
- Easy to understand and extend.
- Useful for visualizing Java code quickly.
- Supports both file-level and folder-level views.
- Does not require an external AI API.
- Generates summaries locally from Javadoc and naming patterns.
- Provides an interactive UI with search, expand, collapse, fit, and export actions.
- Compiles successfully with TypeScript.

## Cons and Current Limitations

- Java parsing is currently regex-based, so complex Java syntax may not be handled correctly.
- Records, some annotations, constructors, sealed classes, and complex generics may be missed or parsed incorrectly.
- Named inner classes are represented as separate class entries rather than nested children in the output model.
- Anonymous classes are not represented as class entries; their method bodies are skipped when collecting calls for the enclosing method.
- Method call extraction is lexical. It records call names, but does not resolve overloads, receiver types, inherited methods, or cross-file symbols.
- The `java-parser` dependency is listed but is not currently used by the parser implementation.
- The folder scan is capped at 200 Java files.
- The test suite currently covers core parser and mind map generation behavior, but broader edge-case coverage is still needed.
- The webview depends on CDN-loaded libraries, so it may not work offline.
- Webview security should be improved with a stricter Content Security Policy.
- Template-based summaries are helpful, but they are not true semantic code understanding.

## Development Scripts

```bash
npm run compile
```

Compiles the TypeScript source into the `out/` directory.

```bash
npm run watch
```

Runs TypeScript in watch mode during development.

```bash
npm test
```

Compiles the extension and runs the basic test suite from `src/test/runTest.ts`.

## Suggested Improvements

- Replace the regex parser with a real Java AST parser or fully integrate the existing `java-parser` dependency.
- Expand unit tests for parser behavior, summary generation, and mind map generation.
- Add VS Code extension integration tests.
- Bundle Markmap assets locally instead of loading them from a CDN.
- Add a Content Security Policy to the webview.
- Improve folder scanning for large Java projects.
- Add support for constructors, annotations, records, sealed classes, and modern Java syntax.
- Add a project logo, screenshots, and marketplace publishing instructions.

## Project Status

JavaFlow is currently an early-stage prototype. It is suitable for experimenting with Java code visualization and extension development, but it needs stronger parsing, tests, documentation, and webview hardening before production use.
