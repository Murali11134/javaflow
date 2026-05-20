# Changelog

All notable changes to JavaFlow will be documented in this file.

## [Unreleased]

### Added

- Basic test runner for parser and mind map generation behavior.
- Local-first privacy policy.
- Product roadmap for publishing, parsing, Spring Boot support, community growth, and future monetization.
- Contributing guide for open-source contributors.
- Security policy with webview and dependency safety principles.

### Changed

- Clarified that JavaFlow is an early-stage prototype and needs stronger parsing, webview hardening, and documentation before production release.

## [0.1.0] - Initial Prototype

### Added

- VS Code command for generating a mind map from a single Java file.
- VS Code command for generating a folder-level Java mind map.
- Regex-based Java source parser for packages, imports, classes, fields, methods, and simple call references.
- Template-based summaries for classes, fields, and methods.
- Markmap-powered webview for interactive visualization.
- Toolbar actions for expanding, collapsing, fitting, searching, and exporting the mind map.
- Extension settings for call depth, private member visibility, and summary generation.

### Known Limitations

- Java parsing is regex-based and may miss complex Java syntax.
- Constructors, annotations, records, lambdas, complex generics, and nested declarations need stronger support.
- The listed `java-parser` dependency is not yet integrated into the implementation.
- Webview assets are currently loaded from a CDN.
- Webview Content Security Policy should be improved before wider production usage.
