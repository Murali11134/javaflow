/**
 * JavaFlow — NLP Summarizer
 *
 * Generates plain-English summaries for Java classes and methods.
 * Strategy (no external API required):
 *   1. Use Javadoc if available (clean it up)
 *   2. If no Javadoc, build a template-based description from the code structure
 */

import { JavaClass, JavaMethod, JavaField } from '../parser/javaParser';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function titleCase(s: string): string {
  if (!s) { return s; }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Convert camelCase / PascalCase to readable words */
function decamelize(name: string): string {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .toLowerCase()
    .trim();
}

/** Strip @param / @return / @throws tags (including multi-line continuations) from Javadoc */
function cleanJavadoc(doc: string): string {
  return doc
    .replace(/\{@\w+\s*([^}]*)\}/g, '$1')   // unwrap inline tags: {@link Foo} → Foo, {@code x} → x
    .replace(/@\w+[\s\S]*?(?=@\w+|$)/g, '') // strip block tags: @param, @return, @throws, etc.
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────
// Method summary
// ─────────────────────────────────────────────────────────────────

export function summarizeMethod(method: JavaMethod): string {
  if (!method.name) { return 'Internal method.'; }

  // 1. Javadoc wins
  const doc = cleanJavadoc(method.javadoc);
  if (doc.length > 10) { return doc; }

  // 2. Template-based
  const parts: string[] = [];
  const readableName = decamelize(method.name);

  // Well-known Object / Comparable overrides
  const objectMethods: Record<string, string> = {
    toString:    'Returns a string representation of this object.',
    equals:      'Checks equality with another object.',
    hashCode:    'Returns the hash code for this object.',
    compareTo:   'Compares this object with another for ordering.',
    clone:       'Creates and returns a copy of this object.',
    finalize:    'Called by the garbage collector before reclamation.',
  };
  // True when the pattern description already implies the return value.
  let skipReturnNote = false;
  if (objectMethods[method.name]) {
    parts.push(objectMethods[method.name]);
    skipReturnNote = true;
  } else if (/^get[A-Z]/.test(method.name)) {
    const prop = decamelize(method.name.slice(3));
    parts.push(`Returns the ${prop}.`);
    skipReturnNote = true;
  } else if (/^set[A-Z]/.test(method.name)) {
    const prop = decamelize(method.name.slice(3));
    parts.push(`Sets the ${prop}.`);
  } else if (/^is[A-Z]|^has[A-Z]|^can[A-Z]/.test(method.name)) {
    const prefixLen = method.name.startsWith('is') ? 2 : 3;
    const prop = decamelize(method.name.slice(prefixLen));
    parts.push(`Checks whether ${prop}.`);
  } else if (/^on[A-Z]/.test(method.name)) {
    const event = decamelize(method.name.slice(2));
    parts.push(`Handles the ${event} event.`);
  } else if (/^create|^build|^make/.test(method.name)) {
    const thing = decamelize(method.name.replace(/^(create|build|make)/, ''));
    parts.push(`Creates ${thing ? 'a ' + thing : 'a new instance'}.`);
  } else if (/^find|^get|^fetch|^load|^read/.test(method.name)) {
    const subject = readableName.replace(/^(find|get|fetch|load|read)\s*/, '');
    parts.push(subject ? `Retrieves ${subject}.` : 'Retrieves the result.');
    skipReturnNote = true;
  } else if (/^save|^persist|^write|^store/.test(method.name)) {
    const subject = readableName.replace(/^(save|persist|write|store)\s*/, '');
    parts.push(subject ? `Persists ${subject}.` : 'Persists the entity.');
  } else if (/^delete|^remove|^clear/.test(method.name)) {
    const subject = readableName.replace(/^(delete|remove|clear)\s*/, '');
    parts.push(subject ? `Removes ${subject}.` : 'Removes the entry.');
  } else if (/^validate|^check|^verify/.test(method.name)) {
    const subject = readableName.replace(/^(validate|check|verify)\s*/, '');
    parts.push(subject ? `Validates ${subject}.` : 'Validates the input.');
  } else if (/^(process|handle|execute|run|perform|call|invoke|dispatch)/.test(method.name)) {
    const subject = readableName.replace(/^(process|handle|execute|run|perform|call|invoke|dispatch)\s*/, '');
    parts.push(subject ? `Executes ${subject}.` : 'Executes the operation.');
  } else if (/^init|^initialize|^setup|^configure/.test(method.name)) {
    const subject = readableName.replace(/^(init|initialize|setup|configure)\s*/, '');
    parts.push(subject ? `Initialises ${subject}.` : 'Initialises the component.');
  } else if (/^send|^publish|^emit|^notify/.test(method.name)) {
    const subject = readableName.replace(/^(send|publish|emit|notify)\s*/, '');
    parts.push(subject ? `Sends ${subject}.` : 'Sends the event.');
  } else if (/^convert|^transform|^map|^parse/.test(method.name)) {
    const subject = readableName.replace(/^(convert|transform|map|parse)\s*/, '');
    parts.push(subject ? `Converts ${subject}.` : 'Converts the value.');
  } else {
    parts.push(`${titleCase(readableName)}.`);
  }

  // Params note
  if (method.parameters.length > 0) {
    const paramNames = method.parameters.map(p => `${p.name} (${p.type})`).join(', ');
    parts.push(`Takes ${paramNames}.`);
  }

  // Return type note — skipped when the pattern description already implies the return.
  if (!skipReturnNote && method.returnType !== 'void' && method.returnType !== '') {
    parts.push(`Returns ${method.returnType}.`);
  }

  // Static note
  if (method.isStatic) {
    parts.push('Static utility method.');
  }

  return parts.join(' ');
}

// ─────────────────────────────────────────────────────────────────
// Field summary
// ─────────────────────────────────────────────────────────────────

export function summarizeField(field: JavaField): string {
  const doc = cleanJavadoc(field.javadoc);
  if (doc.length > 5) { return doc; }

  const readable = decamelize(field.name);
  const parts: string[] = [`${titleCase(readable)} of type ${field.type}.`];
  if (field.isFinal) { parts.push('Constant value.'); }
  if (field.isStatic) { parts.push('Shared across all instances.'); }
  return parts.join(' ');
}

// ─────────────────────────────────────────────────────────────────
// Class summary
// ─────────────────────────────────────────────────────────────────

export function summarizeClass(cls: JavaClass): string {
  // 1. Javadoc wins
  const doc = cleanJavadoc(cls.javadoc);
  if (doc.length > 10) { return doc; }

  // 2. Template-based
  const parts: string[] = [];
  const readableName = decamelize(cls.name);

  switch (cls.kind) {
    case 'interface':
      parts.push(`Defines the contract for ${readableName}.`);
      break;
    case 'enum':
      parts.push(`Enumeration representing ${readableName}.`);
      break;
    case 'annotation':
      parts.push(`Custom annotation for ${readableName}.`);
      break;
    case 'record':
      parts.push(`Immutable data record representing ${readableName}.`);
      break;
    default: {
      if (cls.isAbstract) {
        parts.push(`Abstract base for ${readableName}.`);
      } else if (/Service$/i.test(cls.name)) {
        parts.push(`Service layer handling ${readableName.replace(/service$/i, '').trim()} business logic.`);
      } else if (/Repository$|Dao$/i.test(cls.name)) {
        parts.push(`Data access object for ${readableName.replace(/repository|dao$/i, '').trim()} persistence.`);
      } else if (/Controller$/i.test(cls.name)) {
        parts.push(`Controller handling ${readableName.replace(/controller$/i, '').trim()} HTTP requests.`);
      } else if (/Exception$|Error$/i.test(cls.name)) {
        parts.push(`Custom exception for ${readableName}.`);
      } else if (/Test$/i.test(cls.name)) {
        parts.push(`Unit tests for ${readableName.replace(/test$/i, '').trim()}.`);
      } else if (/Builder$/i.test(cls.name)) {
        parts.push(`Builder pattern for constructing ${readableName.replace(/builder$/i, '').trim()} objects.`);
      } else if (/Factory$/i.test(cls.name)) {
        parts.push(`Factory for creating ${readableName.replace(/factory$/i, '').trim()} instances.`);
      } else if (/Config$|Configuration$/i.test(cls.name)) {
        parts.push(`Configuration for ${readableName.replace(/config(uration)?$/i, '').trim()}.`);
      } else {
        parts.push(`${titleCase(readableName)} class.`);
      }
    }
  }

  const pubMethods = cls.methods.filter(m => m.visibility === 'public').length;
  if (pubMethods > 0) {
    parts.push(`Exposes ${pubMethods} public method${pubMethods > 1 ? 's' : ''}.`);
  }

  return parts.join(' ');
}

// ─────────────────────────────────────────────────────────────────
// Full-class summarization (attaches summaries in-place)
// ─────────────────────────────────────────────────────────────────

export interface ClassSummary {
  classSummary: string;
  methodSummaries: Map<string, string>;
  fieldSummaries: Map<string, string>;
}

export function buildClassSummary(cls: JavaClass): ClassSummary {
  const methodSummaries = new Map<string, string>();
  const fieldSummaries = new Map<string, string>();

  for (const method of cls.methods) {
    methodSummaries.set(`${method.name}|${method.parameters.map(p => p.type).join(',')}`, summarizeMethod(method));
  }
  for (const field of cls.fields) {
    fieldSummaries.set(field.name, summarizeField(field));
  }

  return {
    classSummary: summarizeClass(cls),
    methodSummaries,
    fieldSummaries
  };
}
