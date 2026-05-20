# Contributing to JavaFlow

Thank you for considering a contribution to JavaFlow.

JavaFlow is an open-source VS Code extension that helps developers understand Java and Spring Boot codebases through local, interactive mind maps.

## Project goals

JavaFlow should be:

- Local-first
- Easy to install
- Safe for source-code privacy
- Useful for Java/Spring Boot onboarding
- Simple enough for new contributors to understand

## Development setup

```bash
git clone https://github.com/Murali11134/javaflow.git
cd javaflow
npm install
npm run compile
```

Open the project in VS Code and press `F5` to launch an Extension Development Host.

## Running tests

```bash
npm test
```

## Good first contribution areas

- Parser test cases
- README improvements
- Screenshots and demo GIFs
- Spring Boot sample projects
- Webview UI improvements
- Documentation fixes
- Bug reports with small reproducible Java examples

## Coding guidelines

- Keep the extension local-first.
- Do not add network calls unless the feature is clearly documented and opt-in.
- Add tests for parser changes where possible.
- Prefer small pull requests over large rewrites.
- Keep user-facing messages simple and helpful.

## Reporting bugs

When reporting a parser or visualization bug, include:

1. JavaFlow version
2. VS Code version
3. Minimal Java code example
4. Expected output
5. Actual output
6. Screenshot if relevant

## Feature requests

Feature requests are welcome, especially around:

- Spring Boot flow visualization
- Java AST parsing
- Call graph accuracy
- Export formats
- Large project performance

## Privacy expectations

JavaFlow should not upload source code by default. Any future feature that sends data outside the user's machine must be optional and clearly documented.
