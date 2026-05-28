# Changelog

All notable changes to JavaFlow will be documented in this file.

## [Unreleased]

### Changed

- Polished product positioning around local, offline Java code visualization.
- Clarified that method call references are best-effort hints, not a compiler-grade Java call graph.
- Updated roadmap and release checklist for marketplace readiness.

### Fixed

- Fixed invalid `package.json` JSON syntax.

## [1.1.0] - 2026-05-28

### Added

- CST-based Java parser using `java-parser`.
- Record parsing support with record components surfaced as fields.
- Generic class declaration support.
- Class-level annotation extraction, including parameterised annotations.
- Enum constant extraction in declaration order.
- Constructor extraction as first-class members.
- Nested and static nested class detection.
- Best-effort method call reference extraction.
- Cross-file method owner lookup through `WorkspaceIndex`.
- Recursive call-chain rendering with cycle protection.
- Multi-panel mind map support.
- Search with prev/next navigation, highlighting, and ancestor unfolding.
- Expand all, collapse all, refresh, fit to screen, and SVG export.
- Local bundled Markmap and D3 assets for offline use.

### Known Limitations

- Folder scan is capped at 200 Java files.
- Method call references are name-based and best-effort.
- Overloaded methods, dependency injection, inherited dispatch, and external libraries are not fully resolved.
- More parser and webview tests are needed before a polished marketplace release.
