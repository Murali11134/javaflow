/**
 * JavaFlow — Mindmap Generator (v2)
 *
 * Changes over v1:
 *  - Accepts an optional WorkspaceIndex for cross-file call resolution
 *  - Single-file view shows nested classes as sub-sections of their parent
 *  - callsTo entries show qualified ClassName.method() labels when resolved
 *  - Recursive call chains rendered up to maxDepth
 */

import { JavaClass } from '../parser/javaParser';
import { buildClassSummary } from '../nlp/summarizer';
import { WorkspaceIndex, CallChainNode } from '../analysis/workspaceIndex';

export interface MindmapOptions {
  showPrivateMembers: boolean;
  nlpSummaries: boolean;
  maxDepth: number;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const KIND_EMOJI: Record<string, string> = {
  class: '🏛', interface: '📐', enum: '🔢', annotation: '🏷', record: '📋'
};

function visEmoji(visibility: string): string {
  return visibility === 'public' ? '🔓' : '🔒';
}

/** Render one class node and its members into `lines`. `headingLevel` sets the # depth. */
function renderClass(
  cls: JavaClass,
  opts: MindmapOptions,
  lines: string[],
  headingLevel: number,
  index: WorkspaceIndex | undefined,
  visited = new Set<string>()
): void {
  if (visited.has(cls.name)) { return; }
  visited.add(cls.name);
  const h  = (n: number) => '#'.repeat(Math.min(n, 6));
  const summary = opts.nlpSummaries ? buildClassSummary(cls) : null;
  const emoji   = KIND_EMOJI[cls.kind] ?? '🏛';

  lines.push(`${h(headingLevel)} ${emoji} ${cls.name}`);

  // Class-level annotations
  if (cls.annotations.length > 0) {
    lines.push(`${h(headingLevel + 1)} 📝 Annotations`);
    for (const ann of cls.annotations) {
      lines.push(`${h(headingLevel + 2)} ${ann}`);
    }
  }

  // Package (only at top level)
  if (headingLevel === 1 && cls.packageName) {
    lines.push(`${h(headingLevel + 1)} 📦 Package`);
    lines.push(`${h(headingLevel + 2)} ${cls.packageName}`);
  }

  // NLP summary
  if (summary) {
    lines.push(`${h(headingLevel + 1)} 💡 Summary`);
    lines.push(`${h(headingLevel + 2)} ${summary.classSummary}`);
  }

  // Hierarchy
  if (cls.superClass || cls.interfaces.length > 0) {
    lines.push(`${h(headingLevel + 1)} 🔗 Hierarchy`);
    if (cls.superClass) {
      lines.push(`${h(headingLevel + 2)} extends ${cls.superClass}`);
    }
    for (const iface of cls.interfaces) {
      lines.push(`${h(headingLevel + 2)} implements ${iface}`);
    }
  }

  // Enum constants
  if (cls.enumConstants.length > 0) {
    lines.push(`${h(headingLevel + 1)} 🔢 Constants`);
    for (const c of cls.enumConstants) {
      lines.push(`${h(headingLevel + 2)} ${c}`);
    }
  }

  // Fields
  const visibleFields = cls.fields.filter(
    f => opts.showPrivateMembers || f.visibility !== 'private'
  );
  if (visibleFields.length > 0) {
    lines.push(`${h(headingLevel + 1)} 🗃 Fields`);
    for (const field of visibleFields) {
      const mods = [field.isStatic ? 'static' : '', field.isFinal ? 'final' : '']
        .filter(Boolean).join(' ');
      const label = `${field.name} : ${field.type}${mods ? ` *(${mods})*` : ''}`;
      lines.push(`${h(headingLevel + 2)} ${visEmoji(field.visibility)} ${label}`);
      if (summary) {
        const desc = summary.fieldSummaries.get(field.name);
        if (desc) { lines.push(`${h(headingLevel + 3)} ${desc}`); }
      }
    }
  }

  // Methods
  const visibleMethods = cls.methods.filter(
    m => opts.showPrivateMembers || m.visibility !== 'private'
  );
  if (visibleMethods.length > 0) {
    lines.push(`${h(headingLevel + 1)} ⚙️ Methods`);
    for (const method of visibleMethods) {
      const params = method.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
      const sig    = method.returnType
        ? `${method.name}(${params}) : ${method.returnType}`
        : `${method.name}(${params})`;
      const annPrefix = method.annotations.length > 0
        ? method.annotations.join(' ') + ' '
        : '';
      lines.push(`${h(headingLevel + 2)} ${visEmoji(method.visibility)} ${annPrefix}${sig}`);

      if (summary) {
        const desc = summary.methodSummaries.get(`${method.name}|${method.parameters.length}`);
        if (desc) { lines.push(`${h(headingLevel + 3)} 💬 ${desc}`); }
      }

      // Call graph — resolved if index available, raw names otherwise
      if (method.callsTo.length > 0 && opts.maxDepth > 0) {
        lines.push(`${h(headingLevel + 3)} 📞 Calls`);
        if (index) {
          const chain = index.getCallChain(cls.name, method.name, opts.maxDepth);
          renderCallChain(chain, lines, headingLevel + 4, 8);
        } else {
          const shown = method.callsTo.slice(0, 8);
          for (const call of shown) { lines.push(`${h(headingLevel + 4)} ${call}()`); }
          if (method.callsTo.length > 8) {
            lines.push(`${h(headingLevel + 4)} …and ${method.callsTo.length - 8} more`);
          }
        }
      }
    }
  }

  // Nested classes — rendered recursively one level deeper
  if (index && cls.nestedClasses.length > 0) {
    const children = index.nestedClassesOf(cls.name);
    if (children.length > 0) {
      lines.push(`${h(headingLevel + 1)} 🔲 Inner Classes`);
      for (const child of children) {
        renderClass(child, opts, lines, headingLevel + 2, index, new Set(visited));
      }
    }
  }

  // Dependencies (imports) — only at top level to avoid repetition
  if (headingLevel === 1 && cls.imports.length > 0) {
    lines.push(`${h(headingLevel + 1)} 📥 Dependencies`);
    const groups = new Map<string, string[]>();
    for (const imp of cls.imports) {
      const top = imp.split('.').slice(0, 2).join('.');
      const g   = groups.get(top) ?? [];
      g.push(imp);
      groups.set(top, g);
    }
    for (const [group, imps] of groups) {
      lines.push(`${h(headingLevel + 2)} ${group}`);
      for (const imp of imps.slice(0, 5)) {
        lines.push(`${h(headingLevel + 3)} ${imp.split('.').pop() ?? imp}`);
      }
      if (imps.length > 5) {
        lines.push(`${h(headingLevel + 3)} …+${imps.length - 5} more`);
      }
    }
  }
}

/** Recursively render a CallChainNode tree, honouring a max-node budget. */
function renderCallChain(
  nodes: CallChainNode[],
  lines: string[],
  headingLevel: number,
  budget: number
): number {
  const h = (n: number) => '#'.repeat(Math.min(n, 6));
  let remaining = budget;
  for (const node of nodes) {
    if (remaining <= 0) { lines.push(`${h(headingLevel)} …`); break; }
    lines.push(`${h(headingLevel)} ${node.label}`);
    remaining--;
    if (node.children.length > 0) {
      remaining = renderCallChain(node.children, lines, headingLevel + 1, remaining);
    }
  }
  return remaining;
}

// ---------------------------------------------------------------------------
// Single-class mindmap (used by javaflow.showMindmap)
// ---------------------------------------------------------------------------

export function generateClassMindmap(
  cls: JavaClass,
  opts: MindmapOptions,
  allClasses?: JavaClass[],
  index?: WorkspaceIndex,
  rootLabel?: string
): string {
  const all = allClasses ?? [cls];
  if (all.length === 0) {
    return `# ☕ ${rootLabel ?? cls.name}\n## *(No classes found)*`;
  }
  const idx = index ?? new WorkspaceIndex(all);
  const topLevel = all.filter(c => c.parentClass === null);
  const lines: string[] = [];

  if (topLevel.length > 1 && rootLabel) {
    const sharedPkg = topLevel[0]?.packageName;
    const pkgSuffix = sharedPkg ? ` · ${sharedPkg}` : '';
    lines.push(`# ☕ ${rootLabel}${pkgSuffix}`);
    for (const topCls of topLevel) {
      renderClass(topCls, opts, lines, 2, idx);
    }
  } else {
    renderClass(topLevel[0] ?? cls, opts, lines, 1, idx);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Multi-class (folder) mindmap (used by javaflow.showMindmapForFolder)
// ---------------------------------------------------------------------------

export function generateFolderMindmap(
  classes: JavaClass[],
  opts: MindmapOptions,
  rootLabel: string,
  index?: WorkspaceIndex
): string {
  const idx = index ?? new WorkspaceIndex(classes);
  const lines: string[] = [];
  lines.push(`# 🗂 ${rootLabel}`);

  // Only render top-level classes — nested ones appear inside their parents
  const topLevel = classes.filter(c => c.parentClass === null);

  // Group by package
  const packages = new Map<string, JavaClass[]>();
  for (const cls of topLevel) {
    const pkg = cls.packageName || '(default)';
    const arr = packages.get(pkg) ?? [];
    arr.push(cls);
    packages.set(pkg, arr);
  }

  for (const [pkg, pkgClasses] of [...packages.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## 📦 ${pkg}`);
    for (const cls of pkgClasses) {
      const summary = opts.nlpSummaries ? buildClassSummary(cls) : null;
      const emoji   = KIND_EMOJI[cls.kind] ?? '🏛';

      lines.push(`### ${emoji} ${cls.name}`);
      if (summary) { lines.push(`#### 💡 ${summary.classSummary}`); }
      if (cls.annotations.length > 0) {
        lines.push(`#### 📝 ${cls.annotations.join(' ')}`);
      }
      if (cls.superClass) { lines.push(`#### extends ${cls.superClass}`); }
      if (cls.enumConstants.length > 0) {
        const shown = cls.enumConstants.slice(0, 6);
        const more  = cls.enumConstants.length > 6 ? ` …+${cls.enumConstants.length - 6}` : '';
        lines.push(`#### 🔢 ${shown.join(', ')}${more}`);
      }

      // Nested classes — render each with kind, annotations, and public methods
      if (cls.nestedClasses.length > 0) {
        lines.push(`#### 🔲 Inner Classes`);
        for (const nestedName of cls.nestedClasses) {
          const nestedCls = idx.getClass(nestedName);
          if (!nestedCls) { lines.push(`##### ${nestedName} *(unresolved)*`); continue; }
          const nestedEmoji = KIND_EMOJI[nestedCls.kind] ?? '🏛';
          lines.push(`##### ${nestedEmoji} ${nestedName}`);
          if (nestedCls.annotations.length > 0) {
            lines.push(`###### 📝 ${nestedCls.annotations.join(' ')}`);
          }
          if (nestedCls.enumConstants.length > 0) {
            const shown = nestedCls.enumConstants.slice(0, 4);
            const more  = nestedCls.enumConstants.length > 4 ? ` …+${nestedCls.enumConstants.length - 4}` : '';
            lines.push(`###### 🔢 ${shown.join(', ')}${more}`);
          }
          const pubNested = nestedCls.methods.filter(m => m.visibility === 'public');
          for (const m of pubNested.slice(0, 4)) {
            lines.push(`###### ${m.name}(${m.parameters.map(p => p.type).join(', ')})`);
          }
          if (pubNested.length > 4) { lines.push(`###### …+${pubNested.length - 4} more`); }
        }
      }

      // Public methods (capped at 6)
      const pubMethods = cls.methods.filter(m => m.visibility === 'public');
      if (pubMethods.length > 0) {
        lines.push(`#### ⚙️ Methods (${pubMethods.length})`);
        for (const m of pubMethods.slice(0, 6)) {
          const paramTypes = m.parameters.map(p => p.type).join(', ');
          lines.push(`##### ${m.name}(${paramTypes})`);
          if (summary) {
            const desc = summary.methodSummaries.get(`${m.name}|${m.parameters.length}`);
            if (desc) { lines.push(`###### ${desc}`); }
          }
          // Resolved call targets (one level, capped at 4)
          if (m.callsTo.length > 0 && opts.maxDepth > 0) {
            const refs = idx.resolveCallsTo(m.callsTo, cls.name).slice(0, 4);
            for (const ref of refs) {
              lines.push(`###### 📞 ${ref.className !== '?' ? ref.className + '.' : ''}${ref.methodName}()`);
            }
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
