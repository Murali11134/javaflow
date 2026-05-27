/**
 * JavaFlow — Test Runner Entry Point
 *
 * Downloads (or reuses) a VS Code instance and runs the extension test suite
 * inside it. Compiled to out/test/runTest.js and invoked by `npm test`.
 */

import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    // The folder containing the extension's package.json
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to the test suite entry point (compiled suite/index.js)
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    await runTests({ extensionDevelopmentPath, extensionTestsPath });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
