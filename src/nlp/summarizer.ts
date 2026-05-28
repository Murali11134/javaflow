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

/** Strip @param / @return / @throws tags from Javadoc and return the summary sentence */
function cleanJavadoc(doc: string): string {
  return doc
    .replace(/@\w+[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────
// Method summary
// ─────────────────────────────────────────────────────────────────

export function summarizeMethod(method: JavaMethod, parentClass: JavaClass): string {
  // 1. Javadoc wins
  const doc = cleanJavadoc(method.javadoc);
  if (doc.length > 10) { return doc; }

  // 2. Template-based
  const parts: string[] = [];
  const readableName = decamelize(method.name);

  // Detect common patterns
  if (/^get[A-Z]/.test(method.name)) {
    const prop = decamelize(method.name.slice(3));
    parts.push(`Returns the ${prop}.`);
  } else if (/^set[A-Z]/.test(method.name)) {
    const prop = decamelize(method.name.slice(3));
    parts.push(`Sets the ${prop}.`);
  } else if (/^is[A-Z]|^has[A-Z]|^can[A-Z]/.test(method.name)) {
    const prop = decamelize(method.name.slice(2));
    parts.push(`Checks whether ${prop}.`);
  } else if (/^on[A-Z]/.test(method.name)) {
    const event = decamelize(method.name.slice(2));
    parts.push(`Handles the ${event} event.`);
  } else if (/^create|^build|^make/.test(method.name)) {
    const thing = decamelize(method.name.replace(/^(create|build|make)/, ''));
    parts.push(`Creates ${thing ? 'a ' + thing : 'a new instance'}.`);
  } else if (/^find|^get|^fetch|^load|^read/.test(method.name)) {
    parts.push(`Retrieves ${readableName.replace(/^(find|get|fetch|load|read)\s*/, '')}.`);
  } else if (/^save|^persist|^write|^store/.test(method.name)) {
    parts.push(`Persists ${readableName.replace(/^(save|persist|write|store)\s*/, '')}.`);
  } else if (/^delete|^remove|^clear/.test(method.name)) {
    parts.push(`Removes ${readableName.replace(/^(delete|remove|clear)\s*/, '')}.`);
  } else if (/^validate|^check|^verify/.test(method.name)) {
    parts.push(`Validates ${readableName.replace(/^(validate|check|verify)\s*/, '')}.`);
  } else if (/^process|^handle|^execute|^run|^perform/.test(method.name)) {
    parts.push(`Processes ${readableName.replace(/^(process|handle|execute|run|perform)\s*/, '')}.`);
  } else {
    parts.push(`${titleCase(readableName)}.`);
  }

  // Params note
  if (method.parameters.length > 0) {
    const paramNames = method.parameters.map(p => `${p.name} (${p.type})`).join(', ');
    parts.push(`Takes ${paramNames}.`);
  }

  // Return type note
  if (method.returnType !== 'void' && method.returnType !== '') {
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

  if (cls.superClass) {
    parts.push(`Extends ${cls.superClass}.`);
  }
  if (cls.interfaces.length > 0) {
    parts.push(`Implements ${cls.interfaces.join(', ')}.`);
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
    methodSummaries.set(`${method.name}|${method.parameters.length}`, summarizeMethod(method, cls));
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
