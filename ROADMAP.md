# JavaFlow Roadmap

JavaFlow is focused on local, visual Java code exploration inside VS Code. The goal is to help developers onboard into unfamiliar Java projects quickly without sending source code to external services.

## v1 Release Checklist

### Must Have

- [x] Valid `package.json` metadata.
- [x] Clear README positioning.
- [x] Local/offline webview assets.
- [x] Single-file mind map generation.
- [x] Folder-level mind map generation.
- [x] CST-based Java parser.
- [x] Local plain-English summaries.
- [x] Search, expand, collapse, fit, refresh, and SVG export.
- [ ] CI passing on GitHub Actions.
- [ ] Marketplace icon and banner assets.
- [ ] Marketplace screenshots.
- [ ] Sample Java project for demos and testing.
- [ ] Basic parser test coverage for common Java patterns.

### Should Have

- [ ] Configurable folder scan limit instead of fixed 200-file cap.
- [ ] Better warning when folder results are incomplete.
- [ ] More tests for records, enums, annotations, constructors, nested classes, and generics.
- [ ] Tests for Spring-style annotations and common enterprise Java patterns.
- [ ] Clear marketplace disclaimer that method call references are best-effort.
- [ ] Changelog maintained per release.

### Nice to Have

- [ ] Export as PNG.
- [ ] Export mind map as Markdown.
- [ ] Open source file from mind map node click.
- [ ] Filter by package/class/member visibility.
- [ ] Minimap or overview panel for very large maps.
- [ ] Compare two classes or packages more explicitly.

## Technical Roadmap

### Parser Improvements

- Handle more Java 17+ syntax edge cases.
- Improve record component and record method rendering.
- Surface sealed classes and permitted subclasses.
- Improve annotation member extraction.
- Handle anonymous inner classes and lambdas more clearly.
- Expand tests around generics, bounded types, arrays, varargs, and overloaded methods.

### Call Reference Improvements

Current call references are name-based and best-effort. Future work should move toward type-aware resolution.

Potential improvements:

- Track local variable declarations and their types.
- Resolve calls through fields and constructor-injected dependencies.
- Use imports and package context to resolve class names.
- Distinguish self-calls, collaborator calls, static calls, and constructor calls.
- Handle overloaded methods using parameter count/type hints.
- Mark unresolved calls clearly instead of making them look authoritative.

### Large Project Support

- Make folder scan limit configurable.
- Add cancellation-safe parsing improvements.
- Cache parsed file results.
- Re-parse only changed files.
- Add package-level summaries before class-level expansion.
- Consider lazy-loading large maps.

### UX Improvements

- Add marketplace-quality screenshots and demo GIF.
- Add first-run help view.
- Improve empty/error states.
- Add node click actions to open files in VS Code.
- Add better visual grouping for Spring controllers, services, repositories, DTOs, and configs.

## Product Direction

JavaFlow should be positioned as:

> Private, offline Java code visualization for onboarding, code review, and quick architecture exploration.

It should not be positioned as a full AI code-understanding system or compiler-grade static-analysis engine until deeper type resolution exists.
