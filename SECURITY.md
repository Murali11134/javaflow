# Security Policy

## Supported versions

JavaFlow is currently an early-stage open-source project. Security fixes will target the latest version on the `main` branch until formal releases are created.

## Reporting a vulnerability

Please report security concerns by opening a GitHub issue with the `security` label, unless the issue contains sensitive exploit details.

Repository:

https://github.com/Murali11134/javaflow

## Security principles

JavaFlow should follow these principles:

- Run analysis locally inside VS Code
- Avoid uploading source code
- Avoid unnecessary network access
- Use the least VS Code webview permissions possible
- Add a strict Content Security Policy for webviews
- Sanitize data shown inside webviews
- Avoid executing user project code

## Webview security

JavaFlow renders a mind map in a VS Code webview. The webview should:

- Load bundled local assets where possible
- Avoid remote CDN scripts in production builds
- Use a strict Content Security Policy
- Avoid injecting unsanitized file contents into HTML

## Dependency security

Before publishing releases, maintainers should run:

```bash
npm audit
npm test
npm run compile
```

Any high-severity dependency issue should be reviewed before publishing a new extension build.
