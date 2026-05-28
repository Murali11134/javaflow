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

import { JavaClass, JavaMethod } from '../parser/javaParser';

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

  constructor(classes: JavaClass[]) {
    // First pass: register every class by FQN and populate methodOwners.
    for (const cls of classes) {
      const fqn = cls.packageName ? `${cls.packageName}.${cls.name}` : cls.name;
      this.classMap.set(fqn, cls);
      for (const method of cls.methods) {
        const owners = this.methodOwners.get(method.name) ?? [];
        owners.push(cls.name);
        this.methodOwners.set(method.name, owners);
      }
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
   *   1. The caller's own class (self-call)
   *   2. Its parent class (call to outer class method)
   *   3. First indexed class found
   *   4. '?' if completely unknown
   */
  resolveCallsTo(callsTo: string[], callerClassName: string): MethodRef[] {
    const callerCls = this.classMap.get(callerClassName);
    return callsTo.map(name => {
      const owners = this.resolveMethod(name);
      if (owners.length === 0) { return { className: '?', methodName: name }; }

      // Single owner — unambiguous
      if (owners.length === 1) { return { className: owners[0], methodName: name }; }

      // Multiple owners: prefer parent class, then first non-self class, then self.
      // Deprioritising self avoids false recursive loops where the caller happens
      // to share a method name with a callee (e.g. OrderService.findById()
      // calling orderRepository.findById() — both classes have findById).
      if (callerCls?.parentClass && owners.includes(callerCls.parentClass)
          && this.classMap.has(callerCls.parentClass)) {
        return { className: callerCls.parentClass, methodName: name };
      }
      const nonSelf = owners.find(o => o !== callerClassName);
      return { className: nonSelf ?? callerClassName, methodName: name };
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

    const method: JavaMethod | undefined = cls.methods.find(m => m.name === methodName);
    if (!method || method.callsTo.length === 0) { return []; }

    const resolved = this.resolveCallsTo(method.callsTo, className);
    return resolved.map(ref => ({
      label:      `${ref.className !== '?' ? ref.className + '.' : ''}${ref.methodName}()`,
      className:  ref.className,
      methodName: ref.methodName,
      children:   ref.className !== '?'
        ? this.getCallChain(ref.className, ref.methodName, maxDepth - 1, new Set(visited))
        : []
    }));
  }

  // ── Utility ──────────────────────────────────────────────────────

  /** All top-level classes (no parent) in the index. */
  topLevelClasses(): JavaClass[] {
    return Array.from(this.classMap.values()).filter(c => c.parentClass === null);
  }

  /** All direct children of a given class name. */
  nestedClassesOf(className: string): JavaClass[] {
    return (this.classMap.get(className)?.nestedClasses ?? [])
      .map(n => this.classMap.get(n))
      .filter((c): c is JavaClass => c !== undefined);
  }
}
