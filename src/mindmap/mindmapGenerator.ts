/**
 * JavaFlow — Mindmap Generator
 *
 * Converts parsed JavaClass data into a Markmap-compatible Markdown tree.
 * Markmap renders this Markdown as an interactive SVG mindmap in the webview.
 *
 * Output structure per class:
 *   # ClassName
 *   ## Summary
 *   ## Fields
 *   ### fieldName : type
 *   ## Methods
 *   ### methodName(params) : returnType
 *   #### Summary
 *   #### Calls
 *   ## Dependencies
 *   ### importedPackage
 */

import { JavaClass } from '../parser/javaParser';
import { buildClassSummary } from '../nlp/summarizer';

export interface MindmapOptions {
  showPrivateMembers: boolean;
  nlpSummaries: boolean;
  maxDepth: number;
}

// ─────────────────────────────────────────────────────────────────
// Single-class mindmap
// ─────────────────────────────────────────────────────────────────

export function generateClassMindmap(cls: JavaClass, opts: MindmapOptions): string {
  const summary = opts.nlpSummaries ? buildClassSummary(cls) : null;
  const lines: string[] = [];

  // Root node
  const kindEmoji = { class: '🏛', interface: '📐', enum: '🔢', annotation: '🏷' };
  const emoji = kindEmoji[cls.kind] || '🏛';
  lines.push(`# ${emoji} ${cls.name}`);

  // Package
  if (cls.packageName) {
    lines.push(`## 📦 Package`);
    lines.push(`### ${cls.packageName}`);
  }

  // NLP Summary
  if (summary) {
    lines.push(`## 💡 Summary`);
    lines.push(`### ${summary.classSummary}`);
  }

  // Hierarchy
  if (cls.superClass || cls.interfaces.length > 0) {
    lines.push(`## 🔗 Hierarchy`);
    if (cls.superClass) {
      lines.push(`### extends ${cls.superClass}`);
    }
    for (const iface of cls.interfaces) {
      lines.push(`### implements ${iface}`);
    }
  }

  // Fields
  const visibleFields = cls.fields.filter(f =>
    opts.showPrivateMembers || f.visibility !== 'private'
  );
  if (visibleFields.length > 0) {
    lines.push(`## 🗃 Fields`);
    for (const field of visibleFields) {
      const mods = [
        field.isStatic ? 'static' : '',
        field.isFinal ? 'final' : '',
      ].filter(Boolean).join(' ');
      const label = `${field.name} : ${field.type}${mods ? ` *(${mods})*` : ''}`;
      lines.push(`### ${field.visibility === 'public' ? '🔓' : '🔒'} ${label}`);
      if (summary && opts.nlpSummaries) {
        const desc = summary.fieldSummaries.get(field.name);
        if (desc) { lines.push(`#### ${desc}`); }
      }
    }
  }

  // Methods
  const visibleMethods = cls.methods.filter(m =>
    opts.showPrivateMembers || m.visibility !== 'private'
  );
  if (visibleMethods.length > 0) {
    lines.push(`## ⚙️ Methods`);
    for (const method of visibleMethods) {
      const params = method.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
      const sig = `${method.name}(${params}) : ${method.returnType}`;
      lines.push(`### ${method.visibility === 'public' ? '🔓' : '🔒'} ${sig}`);

      if (summary && opts.nlpSummaries) {
        const desc = summary.methodSummaries.get(method.name);
        if (desc) { lines.push(`#### 💬 ${desc}`); }
      }

      if (method.callsTo.length > 0 && opts.maxDepth > 1) {
        lines.push(`#### 📞 Calls`);
        for (const call of method.callsTo.slice(0, 8)) {
          lines.push(`##### ${call}()`);
        }
        if (method.callsTo.length > 8) {
          lines.push(`##### …and ${method.callsTo.length - 8} more`);
        }
      }
    }
  }

  // Dependencies
  if (cls.imports.length > 0) {
    lines.push(`## 📥 Dependencies`);
    // Group by top-level package
    const groups = new Map<string, string[]>();
    for (const imp of cls.imports) {
      const top = imp.split('.').slice(0, 2).join('.');
      if (!groups.has(top)) { groups.set(top, []); }
      groups.get(top)!.push(imp);
    }
    for (const [group, imps] of groups) {
      lines.push(`### ${group}`);
      for (const imp of imps.slice(0, 5)) {
        lines.push(`#### ${imp.split('.').pop()}`);
      }
      if (imps.length > 5) {
        lines.push(`#### …+${imps.length - 5} more`);
      }
    }
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────
// Multi-class (folder) mindmap
// ─────────────────────────────────────────────────────────────────

export function generateFolderMindmap(classes: JavaClass[], opts: MindmapOptions, rootLabel: string): string {
  const lines: string[] = [];
  lines.push(`# 🗂 ${rootLabel}`);

  // Group by package
  const packages = new Map<string, JavaClass[]>();
  for (const cls of classes) {
    const pkg = cls.packageName || '(default)';
    if (!packages.has(pkg)) { packages.set(pkg, []); }
    packages.get(pkg)!.push(cls);
  }

  for (const [pkg, pkgClasses] of packages) {
    lines.push(`## 📦 ${pkg}`);

    for (const cls of pkgClasses) {
      const summary = opts.nlpSummaries ? buildClassSummary(cls) : null;
      const kindEmoji = { class: '🏛', interface: '📐', enum: '🔢', annotation: '🏷' };
      const emoji = (kindEmoji as Record<string, string>)[cls.kind] || '🏛';

      lines.push(`### ${emoji} ${cls.name}`);

      if (summary) {
        lines.push(`#### 💡 ${summary.classSummary}`);
      }

      if (cls.superClass) {
        lines.push(`#### extends ${cls.superClass}`);
      }

      // Public methods only in folder view
      const pubMethods = cls.methods.filter(m => m.visibility === 'public');
      if (pubMethods.length > 0) {
        lines.push(`#### ⚙️ Methods (${pubMethods.length})`);
        for (const m of pubMethods.slice(0, 6)) {
          const params = m.parameters.map(p => p.type).join(', ');
          lines.push(`##### ${m.name}(${params})`);
          if (summary && opts.nlpSummaries) {
            const desc = summary.methodSummaries.get(m.name);
            if (desc) { lines.push(`###### ${desc}`); }
          }
        }
        if (pubMethods.length > 6) {
          lines.push(`##### …+${pubMethods.length - 6} more`);
        }
      }
    }
  }

  return lines.join('\n');
}
