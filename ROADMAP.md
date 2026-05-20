# JavaFlow Roadmap

JavaFlow is an open-source VS Code extension for visualizing Java and Spring Boot codebases as interactive mind maps.

## Phase 1: Publishable MVP

Goal: make JavaFlow safe, understandable, and easy to try.

- [ ] Add extension icon
- [ ] Add screenshots and demo GIF to README
- [ ] Add `CHANGELOG.md`
- [ ] Add `CONTRIBUTING.md`
- [ ] Add `SECURITY.md`
- [ ] Bundle Markmap/D3 assets locally instead of loading from CDN
- [ ] Add a strict Content Security Policy to the webview
- [ ] Improve error handling for empty folders and invalid Java files
- [ ] Add sample Java project for demo/testing
- [ ] Package extension using `vsce package`
- [ ] Publish first free version to VS Code Marketplace

## Phase 2: Better Java parsing

Goal: make parsing reliable enough for real Java projects.

- [ ] Replace regex-only parsing with AST-based parsing
- [ ] Properly support constructors
- [ ] Support annotations
- [ ] Support records
- [ ] Support nested classes
- [ ] Support enums with methods/fields
- [ ] Improve generic type parsing
- [ ] Improve lambda and stream handling
- [ ] Add more parser unit tests

## Phase 3: Spring Boot visualization

Goal: make JavaFlow genuinely useful for modern backend projects.

- [ ] Detect `@RestController` and `@Controller`
- [ ] Detect `@Service`
- [ ] Detect `@Repository`
- [ ] Detect `@Entity`
- [ ] Show Controller → Service → Repository flow
- [ ] Show API endpoint mappings from `@GetMapping`, `@PostMapping`, etc.
- [ ] Show DTO/entity relationships where possible
- [ ] Add Spring Boot sample project

## Phase 4: Community and growth

Goal: get real feedback from Java developers.

- [ ] Publish launch article on DEV.to
- [ ] Share demo on LinkedIn
- [ ] Share feedback post on Reddit r/vscode
- [ ] Share Java-focused post on Reddit r/java or r/SpringBoot
- [ ] Add GitHub topics: `java`, `spring-boot`, `vscode-extension`, `mindmap`, `code-visualization`
- [ ] Add GitHub Sponsors or donation link only after useful adoption

## Phase 5: Optional monetization later

JavaFlow Community should remain open source and local-first. Monetization can be explored later through:

- GitHub Sponsors
- Paid support
- Custom feature development
- Company-specific onboarding/report generation
- Optional Pro features, only after community validation
