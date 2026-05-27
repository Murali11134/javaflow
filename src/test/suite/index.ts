/**
 * JavaFlow — Mocha Test Suite Bootstrap
 *
 * Called by VS Code's test runner. Finds all *.test.js files under this
 * directory and hands them to Mocha to execute.
 */

import * as path from 'path';
import { glob } from 'glob';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Mocha = require('mocha');

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 10_000 });

  const testsRoot = path.resolve(__dirname, '.');
  const files = await glob('**/*.test.js', { cwd: testsRoot });
  files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

  return new Promise((resolve, reject) => {
    mocha.run((failures: number) => {
      if (failures > 0) {
        reject(new Error(`${failures} test(s) failed.`));
      } else {
        resolve();
      }
    });
  });
}
