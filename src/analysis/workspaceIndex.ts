/**
 * JavaFlow — Workspace Index
 *
 * Builds a fast lookup structure over a collection of JavaClass objects so
 * that callsTo method names can be resolved to their owning class and call
 * chains can be followed recursively across files.
 *
 * Usage:
 *   const index = new WorkspaceIndex(allClasses);
 *   const owners = index.resolveMethod('save');         // ['UserService']
 *   const chain  = index.getCallChain('UserService', 'save', 3);
 */

import { JavaClass } from '../parser/javaParser';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MethodRef {
  /** Class that owns this method. */
  className: string;
  /** Method name (unqualified). */
  methodName: string;
}

export interface CallChainNode {
  /** Qualified name shown in the mindmap: ClassName.methodName() */
  label: string;
  className: string;
  methodName: string;
  /** Recursive callees (empty when depth is exhausted or cycle detected). */
  children: CallChainNode[];
}

// ---------------------------------------------------------------------------
// WorkspaceIndex
// ---------------------------------------------------------------------------

export class WorkspaceIndex {
  /** className → JavaClass */
  private classMap = new Map<string, JavaClass>();

  /**
   * methodName → list of class names that declare a method with this name.
   * A method name may exist in multiple classes (overloads / same name in different classes).
   */
  private methodOwners = new Map<string, string[]>();

  /** parentFqn → direct nested JavaClass list, for reliable nestedClassesOf lookups. */
  private parentMap = new Map<string, JavaClass[]>();

  constructor(classes: JavaClass[]) {
    // First pass: register every class by FQN and populate methodOwners with Sets (no duplicates).
    const methodOwnerSets = new Map<string, Set<string>>();
    for (const cls of classes) {
      const fqn = cls.packageName ? `${cls.packageName}.${cls.name}` : cls.name;
      this.classMap.set(fqn, cls);
      for (const method of cls.methods) {
        const s = methodOwnerSets.get(method.name);
        if (s) { s.add(fqn); } else { methodOwnerSets.set(method.name, new Set([fqn])); }
      }
    }
    for (const [name, set] of methodOwnerSets) {
      this.methodOwners.set(name, [...set]);
    }

    // Second pass: add a simple-name alias only when globally unambiguous.
    // Two-pass approach makes this deterministic regardless of input order.
    const simpleCount = new Map<string, number>();
    for (const cls of classes) {
      simpleCount.set(cls.name, (simpleCount.get(cls.name) ?? 0) + 1);
    }
    for (const cls of classes) {
      if (simpleCount.get(cls.name) === 1) {
        this.classMap.set(cls.name, cls);
      }
    }

    // Third pass: build parentMap so nestedClassesOf works even when simple-name
    // aliases are absent (e.g. two classes share a name like "Builder").
    for (const cls of classes) {
      if (cls.parentClass === null) { continue; }
      const parentFqn = cls.packageName
        ? `${cls.packageName}.${cls.parentClass}`
        : cls.parentClass;
      const key = this.classMap.has(parentFqn) ? parentFqn : cls.parentClass;
      const children = this.parentMap.get(key) ?? [];
      children.push(cls);
      this.parentMap.set(key, children);
    }
  }

  // ── Lookups ──────────────────────────────────────────────────────

  getClass(name: string): JavaClass | undefined {
    return this.classMap.get(name);
  }

  /**
   * Returns all class names that declare a method called `methodName`.
   * Empty array = method not found in the indexed classes (e.g. it's from the JDK).
   */
  resolveMethod(methodName: string): string[] {
    return this.methodOwners.get(methodName) ?? [];
  }

  /**
   * Given a callsTo list from one method, resolve each entry to its most
   * likely owning class. Preference order:
   *   1. The caller's parent class (outer class method call)
   *   2. Any other indexed class (injected collaborator — far more common than self-recursion)
   *   3. The caller's own class (self-call, last resort)
   *   4. '?' if completely unknown
   */
  resolveCallsTo(callsTo: string[], callerClassName: string): MethodRef[] {
    const callerCls = this.classMap.get(callerClassName);
    // Compute the caller's FQN so self-call detection works whether callerClassName
    // is a simple name or a full FQN.
    const callerFqn = callerCls
      ? (callerCls.packageName ? `${callerCls.packageName}.${callerCls.name}` : callerCls.name)
      : callerClassName;

    return callsTo.map(name => {
      const owners = this.resolveMethod(name); // owners are FQNs
      if (owners.length === 0) { return { className: '?', methodName: name }; }

      // Single owner — unambiguous
      if (owners.length === 1) { return { className: owners[0], methodName: name }; }

      // Multiple owners: prefer parent class, then non-self (injected collaborator is
      // far more common in Java than self-recursion), then self as last resort.
      if (callerCls?.parentClass) {
        const parentFqn = owners.find(
          o => o === callerCls.parentClass || o.endsWith(`.${callerCls.parentClass}`)
        );
        if (parentFqn) { return { className: parentFqn, methodName: name }; }
      }
      const nonSelf = owners.find(o => o !== callerFqn);
      return { className: nonSelf ?? callerFqn, methodName: name };
    });
  }

  /**
   * Recursively follows the call chain from `className.methodName` up to
   * `maxDepth` levels. Cycle detection prevents infinite loops.
   *
   * @param className  - Starting class name
   * @param methodName - Starting method name
   * @param maxDepth   - Maximum recursion depth (mirrors javaflow.maxDepth setting)
   * @param visited    - Internal cycle guard (do not pass externally)
   */
  getCallChain(
    className: string,
    methodName: string,
    maxDepth: number,
    visited = new Set<string>()
  ): CallChainNode[] {
    if (maxDepth <= 0) { return []; }

    const key = `${className}.${methodName}`;
    if (visited.has(key)) { return []; }
    visited.add(key);

    const cls = this.classMap.get(className);
    if (!cls) { return []; }

    const overloads = cls.methods.filter(m => m.name === methodName);
    if (overloads.length === 0) { return []; }
    // Use the overload with the most callsTo as the representative implementation.
    // Merging all overloads would conflate separate code paths, producing a call chain
    // that no single overload actually follows.
    const primary = overloads.reduce((best, m) => m.callsTo.length > best.callsTo.length ? m : best);
    if (primary.callsTo.length === 0) { return []; }

    const resolved = this.resolveCallsTo(primary.callsTo, className);
    return resolved.map(ref => {
      const simpleName = ref.className !== '?' ? (ref.className.split('.').pop() ?? ref.className) : null;
      return {
        label:      `${simpleName ? simpleName + '.' : ''}${ref.methodName}()`,
        className:  ref.className,
        methodName: ref.methodName,
        children:   ref.className !== '?'
          ? this.getCallChain(ref.className, ref.methodName, maxDepth - 1, new Set(visited))
          : []
      };
    });
  }

  // ── Utility ──────────────────────────────────────────────────────

  /** All direct children of a given class name. */
  nestedClassesOf(className: string): JavaClass[] {
    const byParent = this.parentMap.get(className);
    if (byParent) { return byParent; }
    return (this.classMap.get(className)?.nestedClasses ?? [])
      .map(n => this.classMap.get(n))
      .filter((c): c is JavaClass => c !== undefined);
  }
}
