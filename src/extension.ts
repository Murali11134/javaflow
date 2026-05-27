/**
 * JavaFlow — VS Code Extension Entry Point (v2)
 *
 * Registers:
 *   • javaflow.showMindmap          — single Java file → detailed mindmap
 *   • javaflow.showMindmapForFolder — folder → package overview mindmap
 *
 * v2 changes:
 *   - Passes all classes in the file (not just the first) so nested class
 *     relationships and cross-method call resolution work in single-file view.
 *   - Builds a WorkspaceIndex over all parsed classes for folder view.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseJavaFile } from './parser/javaParser';
import { generateClassMindmap, generateFolderMindmap, MindmapOptions } from './mindmap/mindmapGenerator';
import { MindmapPanel } from './webview/mindmapPanel';
import { WorkspaceIndex } from './analysis/workspaceIndex';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function getOptions(): MindmapOptions {
  const cfg = vscode.workspace.getConfiguration('javaflow');
  return {
    showPrivateMembers: cfg.get<boolean>('showPrivateMembers', false),
    nlpSummaries:       cfg.get<boolean>('nlpSummaries', true),
    maxDepth:           cfg.get<number>('maxDepth', 3)
  };
}

function collectJavaFiles(dirPath: string, max = 200): string[] {
  const files: string[] = [];
  function walk(p: string) {
    if (files.length >= max) { return; }
    try {
      const entries = fs.readdirSync(p, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'target') { continue; }
        const full = path.join(p, e.name);
        if (e.isDirectory()) { walk(full); }
        else if (e.isFile() && e.name.endsWith('.java')) { files.push(full); }
      }
    } catch { /* skip unreadable dirs */ }
  }
  walk(dirPath);
  return files;
}

// ─────────────────────────────────────────────────────────────────
// Activate
// ─────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  console.log('JavaFlow extension activated');

  // ── Command: Show Mindmap for a single Java file ──────────────
  const singleFileCmd = vscode.commands.registerCommand(
    'javaflow.showMindmap',
    async (uri?: vscode.Uri) => {
      let fileUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!fileUri || !fileUri.fsPath.endsWith('.java')) {
        vscode.window.showWarningMessage('JavaFlow: Please open or select a .java file first.');
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'JavaFlow: Generating mindmap…', cancellable: false },
        async () => {
          try {
            const source  = fs.readFileSync(fileUri!.fsPath, 'utf-8');
            const classes = parseJavaFile(source, fileUri!.fsPath);

            if (classes.length === 0) {
              vscode.window.showWarningMessage('JavaFlow: No classes found. Make sure the file is valid Java.');
              return;
            }

            const opts  = getOptions();
            // Build index over all classes in this file (enables nested class links + call resolution)
            const index = new WorkspaceIndex(classes);
            // Primary class = first top-level class (parentClass === null), or first class found
            const primary = classes.find(c => c.parentClass === null) ?? classes[0];
            const markdown = generateClassMindmap(primary, opts, classes, index);
            const title    = path.basename(fileUri!.fsPath, '.java');

            MindmapPanel.createOrShow(context.extensionUri, markdown, title);
          } catch (err) {
            vscode.window.showErrorMessage(`JavaFlow error: ${(err as Error).message}`);
          }
        }
      );
    }
  );

  // ── Command: Show Mindmap for a folder ────────────────────────
  const folderCmd = vscode.commands.registerCommand(
    'javaflow.showMindmapForFolder',
    async (uri?: vscode.Uri) => {
      let folderPath: string | undefined = uri?.fsPath;
      if (!folderPath) {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
          vscode.window.showWarningMessage('JavaFlow: No folder selected and no workspace open.');
          return;
        }
        folderPath = folders[0].uri.fsPath;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'JavaFlow: Scanning Java files…', cancellable: false },
        async (progress) => {
          try {
            progress.report({ message: 'Finding .java files…' });
            const javaFiles = collectJavaFiles(folderPath!);

            if (javaFiles.length === 0) {
              vscode.window.showWarningMessage('JavaFlow: No .java files found in this folder.');
              return;
            }

            progress.report({ message: `Parsing ${javaFiles.length} files…` });
            const allClasses = [];
            for (const fp of javaFiles) {
              try {
                const source = fs.readFileSync(fp, 'utf-8');
                allClasses.push(...parseJavaFile(source, fp));
              } catch { /* skip unparseable files */ }
            }

            if (allClasses.length === 0) {
              vscode.window.showWarningMessage('JavaFlow: Could not parse any Java classes.');
              return;
            }

            progress.report({ message: 'Building workspace index…' });
            const index = new WorkspaceIndex(allClasses);

            progress.report({ message: 'Generating mindmap…' });
            const opts       = getOptions();
            const folderName = path.basename(folderPath!);
            const markdown   = generateFolderMindmap(allClasses, opts, folderName, index);

            MindmapPanel.createOrShow(
              context.extensionUri,
              markdown,
              `${folderName} (${allClasses.length} classes)`
            );
          } catch (err) {
            vscode.window.showErrorMessage(`JavaFlow error: ${(err as Error).message}`);
          }
        }
      );
    }
  );

  context.subscriptions.push(singleFileCmd, folderCmd);
}

export function deactivate(): void {}
