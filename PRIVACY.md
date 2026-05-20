# JavaFlow Privacy Policy

JavaFlow is designed to run locally inside Visual Studio Code.

## Local-first behavior

JavaFlow analyzes Java source files on the user's own machine and renders the generated mind map inside VS Code.

By default, JavaFlow does **not**:

- Upload source code to any server
- Send file contents to the extension author
- Require login or user accounts
- Require a backend service
- Use external AI APIs
- Store source code outside the user's workspace

## What data JavaFlow reads

JavaFlow reads Java files selected by the user or Java files inside a folder selected by the user. It extracts structural information such as:

- Package names
- Imports
- Classes, interfaces, and enums
- Fields and methods
- Basic inheritance information
- Simple method call references
- Javadoc comments, when available

This information is used only to generate the local mind map view.

## Network access

The goal of JavaFlow Community is to work without sending project code anywhere. If future versions add optional online features, such as AI-assisted summaries or telemetry, they should be opt-in and clearly documented before any data is sent.

## Recommended safe usage

Users should review extension permissions and source code before using JavaFlow on sensitive or proprietary projects. Enterprise users should follow their company's internal software and open-source usage policies.

## Contact

For privacy concerns, open an issue in the JavaFlow GitHub repository:

https://github.com/Murali11134/javaflow/issues
