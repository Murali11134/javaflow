/**
 * JavaFlow - Java Parser Module (v2)
 *
 * Improvements over v1:
 *  - @interface annotation types are correctly detected
 *  - Inner / nested classes are linked to their parent via parentClass
 *  - Inner class members are NOT duplicated into the outer class
 *  - nestedClasses lists direct child class names on each JavaClass
 */

export interface JavaField {
  name: string;
  type: string;
  visibility: string;
  isStatic: boolean;
  isFinal: boolean;
  javadoc: string;
}

export interface JavaParameter {
  name: string;
  type: string;
}

export interface JavaMethod {
  name: string;
  visibility: string;
  returnType: string;
  parameters: JavaParameter[];
  isStatic: boolean;
  isAbstract: boolean;
  javadoc: string;
  callsTo: string[];
}

export interface JavaClass {
  name: string;
  kind: 'class' | 'interface' | 'enum' | 'annotation';
  visibility: string;
  isAbstract: boolean;
  superClass: string | null;
  interfaces: string[];
  fields: JavaField[];
  methods: JavaMethod[];
  javadoc: string;
  packageName: string;
  imports: string[];
  filePath: string;
  /** Name of the directly enclosing class, or null for top-level classes. */
  parentClass: string | null;
  /** Names of classes declared directly inside this class. */
  nestedClasses: string[];
  /** Class-level annotations, e.g. ["@Entity", "@Table(name=\"users\")"] */
  annotations: string[];
  /** Enum constants in declaration order; empty for non-enum kinds. */
  enumConstants: string[];
}

// ---------------------------------------------------------------------------
// Internal record used during the two-pass parse
// ---------------------------------------------------------------------------

interface ClassRecord {
  name: string;
  kind: JavaClass['kind'];
  visibility: string;
  isAbstract: boolean;
  superClass: string | null;
  interfaces: string[];
  javadoc: string;
  srcStart: number;   // position of the regex match start in source
  bodyStart: number;  // position of the opening '{' in source
  bodyEnd: number;    // position of the matching '}' in source
  rawBody: string;    // source.substring(bodyStart+1, bodyEnd)
  annotations: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface StrippedSource {
  text: string;
  rawIndexByTextIndex: number[];
}

function cleanJavadocBlock(raw: string): string {
  return raw
    .split('\n')
    .map(l => l.replace(/^\s*\*\s?/, '').trim())
    .filter(Boolean)
    .join(' ');
}

function extractEmbeddedJavadoc(src: string): string {
  const match = src.match(/\/\*\*([\s\S]*?)\*\//);
  return match ? cleanJavadocBlock(match[1]) : '';
}

function extractJavadoc(src: string, pos: number): string {
  const before = src.substring(0, pos).trimEnd();
  if (!before.endsWith('*/')) { return ''; }
  const start = before.lastIndexOf('/**');
  if (start === -1) { return ''; }
  const raw = before.substring(start + 3, before.length - 2);
  return cleanJavadocBlock(raw);
}

function stripComments(src: string): StrippedSource {
  const chars: string[] = [];
  const rawIndexByTextIndex: number[] = [];

  for (let i = 0; i < src.length;) {
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (let j = i; j < stop; j++) {
        if (src[j] === '\n') {
          chars.push('\n');
          rawIndexByTextIndex.push(j);
        }
      }
      i = stop;
      continue;
    }

    if (src.startsWith('//', i)) {
      while (i < src.length && src[i] !== '\n') {
        i++;
      }
      continue;
    }

    chars.push(src[i]);
    rawIndexByTextIndex.push(i);
    i++;
  }

  return {
    text: chars.join(''),
    rawIndexByTextIndex
  };
}

function rawIndexForMatch(stripped: StrippedSource, cleanIndex: number, matchText: string): number {
  const firstTokenOffset = matchText.search(/\S/);
  const adjustedIndex = cleanIndex + (firstTokenOffset === -1 ? 0 : firstTokenOffset);
  return stripped.rawIndexByTextIndex[adjustedIndex] ?? cleanIndex;
}

/** Split a parameter list on top-level commas only, ignoring commas inside <>, (), []. */
function splitOnComma(raw: string): string[] {
  const params: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '<' || ch === '(' || ch === '[') { depth++; }
    else if (ch === '>' || ch === ')' || ch === ']') { depth--; }
    else if (ch === ',' && depth === 0) {
      params.push(raw.substring(start, i).trim());
      start = i + 1;
    }
  }
  const last = raw.substring(start).trim();
  if (last) { params.push(last); }
  return params;
}

function parseParameters(raw: string): JavaParameter[] {
  raw = raw.trim();
  if (!raw) { return []; }
  return splitOnComma(raw).map(p => {
    const parts = p.trim().split(/\s+/);
    if (parts.length < 2) { return { name: parts[0] || '?', type: '?' }; }
    const name = parts[parts.length - 1].replace(/[[\]]/g, '');
    const type = parts.slice(0, parts.length - 1).join(' ');
    return { name, type };
  });
}

function extractCallsTo(body: string): string[] {
  const calls = new Set<string>();
  const callRe = /\b([a-z][a-zA-Z0-9_]*)\s*\(/g;
  let m: RegExpExecArray | null;
  const keywords = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'synchronized',
    'assert', 'return', 'throw', 'new', 'super', 'this'
  ]);
  while ((m = callRe.exec(body)) !== null) {
    if (!keywords.has(m[1])) { calls.add(m[1]); }
  }
  return Array.from(calls);
}

/**
 * Walk balanced braces starting at srcPos (which must be '{') and return the
 * index of the matching '}'. Skips string literals, character literals, and
 * comments so that braces inside them are never counted.
 */
function findMatchingBrace(src: string, srcPos: number): number {
  let depth = 0;
  let i = srcPos;
  while (i < src.length) {
    const ch = src[i];

    // Single-line comment: skip to end of line
    if (ch === '/' && src[i + 1] === '/') {
      i += 2;
      while (i < src.length && src[i] !== '\n') { i++; }
      continue;
    }

    // Multi-line comment: skip to */
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i + 1 < src.length && !(src[i] === '*' && src[i + 1] === '/')) { i++; }
      i += 2;
      continue;
    }

    // Text block (Java 13+): """..."""
    if (ch === '"' && src[i + 1] === '"' && src[i + 2] === '"') {
      i += 3;
      while (i + 2 < src.length && !(src[i] === '"' && src[i + 1] === '"' && src[i + 2] === '"')) {
        if (src[i] === '\\') { i++; }
        i++;
      }
      i += 3;
      continue;
    }

    // String literal: skip to closing unescaped "
    if (ch === '"') {
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') { i++; }
        i++;
      }
      i++;
      continue;
    }

    // Character literal: skip to closing unescaped '
    if (ch === '\'') {
      i++;
      while (i < src.length && src[i] !== '\'') {
        if (src[i] === '\\') { i++; }
        i++;
      }
      i++;
      continue;
    }

    if (ch === '{') { depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0) { return i; }
    }

    i++;
  }
  return srcPos; // malformed — fall back to start
}

// ---------------------------------------------------------------------------
// Member extraction (fields + methods) from a stripped class body
// ---------------------------------------------------------------------------

function extractFields(cleanBody: string, rawBody: string): JavaField[] {
  const fields: JavaField[] = [];
  const fieldPattern = [
    '(?:^|\\n)\\s*',
    '((?:(?:public|protected|private|static|final|volatile|transient)\\s+)+)',
    '([\\w]+(?:<[^>]*>)?(?:\\[\\])*)',
    '\\s+(\\w+)',
    '\\s*(?:=[^;]+)?;'
  ].join('');
  const fieldRe = new RegExp(fieldPattern, 'g');
  let fm: RegExpExecArray | null;
  while ((fm = fieldRe.exec(cleanBody)) !== null) {
    const mods  = fm[1].trim();
    const ftype = fm[2].trim();
    const fname = fm[3].trim();
    fields.push({
      name: fname,
      type: ftype,
      visibility: /public/.test(mods) ? 'public'
        : /protected/.test(mods) ? 'protected'
        : /private/.test(mods) ? 'private' : 'package',
      isStatic: /static/.test(mods),
      isFinal:  /final/.test(mods),
      javadoc:  extractJavadoc(rawBody, fm.index)
    });
  }
  return fields;
}

function extractMethods(cleanBody: string, rawBody: string): JavaMethod[] {
  const methods: JavaMethod[] = [];
  const methodPattern = [
    '((?:public|protected|private|static|abstract|final|synchronized|native|\\s)+)',
    '\\s+([\\w]+(?:<[^>]*>)?(?:\\[\\])*)',
    '\\s+(\\w+)',
    '\\s*\\(([^)]*)\\)',
    '\\s*(?:throws\\s+[\\w,\\s]+?)?',
    '\\s*([{;])'
  ].join('');
  const methodRe = new RegExp(methodPattern, 'g');
  const skipKeywords = new Set(['if', 'for', 'while', 'switch', 'catch']);
  let mm: RegExpExecArray | null;
  while ((mm = methodRe.exec(cleanBody)) !== null) {
    const mods    = mm[1].trim();
    const retType = mm[2].trim();
    const mname   = mm[3].trim();
    const params  = mm[4];
    const hasBody = mm[5] === '{';
    if (skipKeywords.has(mname) || /^\d/.test(retType)) { continue; }

    let callsTo: string[] = [];
    if (hasBody) {
      const mBodyStart = mm.index + mm[0].length - 1;
      const mBodyEnd   = findMatchingBrace(cleanBody, mBodyStart);
      callsTo = extractCallsTo(cleanBody.substring(mBodyStart + 1, mBodyEnd));
    }

    methods.push({
      name:       mname,
      visibility: /public/.test(mods) ? 'public'
        : /protected/.test(mods) ? 'protected'
        : /private/.test(mods) ? 'private' : 'package',
      returnType:  retType,
      parameters:  parseParameters(params),
      isStatic:    /static/.test(mods),
      isAbstract:  /abstract/.test(mods),
      javadoc:     extractJavadoc(rawBody, mm.index),
      callsTo
    });
  }
  return methods;
}

function stripAnonymousClasses(src: string): string {
  const ranges: Array<{ start: number; end: number }> = [];
  const newRe = /\bnew\s+[\w.]+(?:<[^>]*>)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = newRe.exec(src)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < src.length && depth > 0) {
      if (src[i] === '(') { depth++; }
      else if (src[i] === ')') { depth--; }
      i++;
    }
    while (i < src.length && /\s/.test(src[i])) { i++; }
    if (src[i] === '{') {
      const bodyEnd = findMatchingBrace(src, i);
      ranges.push({ start: m.index, end: bodyEnd + 1 });
    }
  }
  let result = src;
  for (let j = ranges.length - 1; j >= 0; j--) {
    const { start, end } = ranges[j];
    result = result.substring(0, start) + ' '.repeat(end - start) + result.substring(end);
  }
  return result;
}

function extractConstructors(cleanBody: string, rawBody: string, className: string): JavaMethod[] {
  const constructors: JavaMethod[] = [];
  const ctorRe = new RegExp(
    '((?:(?:public|protected|private)\\s+)?)' +
    '(' + className + ')' +
    '\\s*\\(([^)]*)\\)' +
    '\\s*(?:throws\\s+[\\w,\\s]+?)?' +
    '\\s*\\{',
    'g'
  );
  let cm: RegExpExecArray | null;
  while ((cm = ctorRe.exec(cleanBody)) !== null) {
    const mods = cm[1].trim();
    const mBodyStart = cm.index + cm[0].length - 1;
    const mBodyEnd = findMatchingBrace(cleanBody, mBodyStart);
    constructors.push({
      name: className,
      visibility: /public/.test(mods) ? 'public'
        : /protected/.test(mods) ? 'protected'
        : /private/.test(mods) ? 'private' : 'package',
      returnType: '',
      parameters: parseParameters(cm[3]),
      isStatic: false,
      isAbstract: false,
      javadoc: extractJavadoc(rawBody, cm.index),
      callsTo: extractCallsTo(cleanBody.substring(mBodyStart + 1, mBodyEnd))
    });
  }
  return constructors;
}

/**
 * Extract enum constant names from a raw enum body.
 * Handles simple constants (NORTH), constructor-arg constants (PLANET(mass, radius)),
 * body constants (NORTH { ... }), and annotated constants (@Deprecated NORTH).
 */
function extractEnumConstants(rawBody: string): string[] {
  const clean = stripComments(rawBody).text;

  // Isolate the constant section: everything before the first top-level ';'.
  // A simple enum with no methods has no ';', so the whole body is constants.
  let section = clean;
  let depth = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '(' || ch === '{' || ch === '[') { depth++; }
    else if (ch === ')' || ch === '}' || ch === ']') { depth--; }
    else if (ch === ';' && depth === 0) { section = clean.substring(0, i); break; }
  }

  // Split by top-level commas, then extract the leading identifier from each chunk.
  const constants: string[] = [];
  depth = 0;
  let start = 0;

  const push = (chunk: string) => {
    // Strip leading annotations before reading the name.
    let text = chunk.trim().replace(/(?:@[\w.]+(?:\s*\([^)]*\))?\s*)/g, '').trim();
    const m = text.match(/^([A-Z]\w*)\b/);
    if (m) { constants.push(m[1]); }
  };

  for (let i = 0; i < section.length; i++) {
    const ch = section[i];
    if (ch === '(' || ch === '{' || ch === '[') { depth++; }
    else if (ch === ')' || ch === '}' || ch === ']') { depth--; }
    else if (ch === ',' && depth === 0) {
      push(section.substring(start, i));
      start = i + 1;
    }
  }
  push(section.substring(start));

  return constants;
}

/**
 * Scan backwards from `pos` collecting @Annotation or @Annotation(...) entries
 * that immediately precede the class declaration (after any javadoc or whitespace).
 */
function extractClassAnnotations(source: string, pos: number): string[] {
  const annotations: string[] = [];
  let i = pos - 1;

  while (i >= 0 && /\s/.test(source[i])) { i--; }

  while (i >= 0) {
    const tokenEnd = i + 1;

    if (source[i] === ')') {
      let depth = 1;
      i--;
      while (i >= 0 && depth > 0) {
        if (source[i] === ')') { depth++; }
        else if (source[i] === '(') { depth--; }
        i--;
      }
      while (i >= 0 && (source[i] === ' ' || source[i] === '\t')) { i--; }
    }

    while (i >= 0 && /[\w.]/.test(source[i])) { i--; }

    if (i < 0 || source[i] !== '@') { break; }

    annotations.unshift(source.substring(i, tokenEnd).trim());
    i--;
    while (i >= 0 && /\s/.test(source[i])) { i--; }
  }

  return annotations;
}

// ---------------------------------------------------------------------------
// Main parser — two-pass
// ---------------------------------------------------------------------------

export function parseJavaFile(source: string, filePath: string): JavaClass[] {
  // ── Package & imports ──────────────────────────────────────────
  const pkgMatch = source.match(/^\s*package\s+([\w.]+)\s*;/m);
  const packageName = pkgMatch ? pkgMatch[1] : '';

  const imports: string[] = [];
  const importRe = /^\s*import\s+(?:static\s+)?([\w.*]+)\s*;/gm;
  let imp: RegExpExecArray | null;
  while ((imp = importRe.exec(source)) !== null) { imports.push(imp[1]); }

  // ── Pass 1: collect all class-like declarations ────────────────
  const classPattern = [
    '(?:\\/\\*\\*[\\s\\S]*?\\*\\/\\s*)?',
    '((?:public|protected|private|static|abstract|final|\\s)*)',
    '(@interface|\\b(?:class|interface|enum))',
    '\\s+(\\w+)',
    '(?:<(?:[^<>]|<[^<>]*>)*>)?',
    '\\s*(?:extends\\s+([\\w., ]+?))?',
    '\\s*(?:implements\\s+([\\w., ]+?))?',
    '\\s*\\{'
  ].join('');
  const classRe = new RegExp(classPattern, 'g');

  const records: ClassRecord[] = [];
  let cm: RegExpExecArray | null;
  while ((cm = classRe.exec(source)) !== null) {
    const modifiers = cm[1] || '';
    const rawKind   = cm[2];
    const name      = cm[3];
    const superClass  = cm[4] ? cm[4].trim() : null;
    const ifaceRaw    = cm[5] ? cm[5].trim() : '';
    const interfaces  = ifaceRaw ? ifaceRaw.split(',').map(s => s.trim()) : [];
    const javadoc     = extractJavadoc(source, cm.index);
    const annotations = extractClassAnnotations(source, cm.index);

    const kind: JavaClass['kind'] =
      rawKind === '@interface' ? 'annotation'
      : rawKind === 'interface' ? 'interface'
      : rawKind === 'enum'      ? 'enum'
      : 'class';

    // The last char of cm[0] is '{' — the bodyStart
    const bodyStart = cm.index + cm[0].length - 1;
    const bodyEnd   = findMatchingBrace(source, bodyStart);
    const rawBody   = source.substring(bodyStart + 1, bodyEnd);

    records.push({
      name,
      kind,
      visibility: /public/.test(modifiers) ? 'public'
        : /protected/.test(modifiers) ? 'protected'
        : /private/.test(modifiers) ? 'private' : 'package',
      isAbstract:  /abstract/.test(modifiers),
      superClass,
      interfaces,
      javadoc,
      srcStart: cm.index,
      bodyStart,
      bodyEnd,
      rawBody,
      annotations
    });
  }

  // ── Pass 2: determine parent-child relationships ───────────────
  // For each record, find the narrowest other record whose body contains it.
  const parentOf = new Map<ClassRecord, ClassRecord | null>();
  for (const rec of records) {
    let directParent: ClassRecord | null = null;
    let minSize = Infinity;
    for (const other of records) {
      if (other === rec) { continue; }
      if (other.bodyStart < rec.srcStart && other.bodyEnd > rec.srcStart) {
        const size = other.bodyEnd - other.bodyStart;
        if (size < minSize) { minSize = size; directParent = other; }
      }
    }
    parentOf.set(rec, directParent);
  }

  // ── Pass 3: strip direct children's bodies, then extract members ─
  const classes: JavaClass[] = [];

  for (const rec of records) {
    const directChildren = records.filter(r => parentOf.get(r) === rec);
    const directParent   = parentOf.get(rec) ?? null;

    // Build a stripped body: replace each direct child's source range with spaces
    // so the field/method regexes don't see inner-class members.
    let strippedBody = rec.rawBody;
    // Sort descending by position so replacements don't shift subsequent offsets
    const sorted = [...directChildren].sort((a, b) => b.srcStart - a.srcStart);
    for (const child of sorted) {
      // Convert absolute source positions to offsets within rawBody
      const relStart = child.srcStart - (rec.bodyStart + 1);
      const relEnd   = child.bodyEnd  - (rec.bodyStart + 1) + 1; // +1 to include '}'
      if (relStart >= 0 && relEnd <= strippedBody.length && relStart < relEnd) {
        strippedBody =
          strippedBody.substring(0, relStart) +
          ' '.repeat(relEnd - relStart) +
          strippedBody.substring(relEnd);
      }
    }

    const cleanBody = stripAnonymousClasses(stripComments(strippedBody).text);

    classes.push({
      name:         rec.name,
      kind:         rec.kind,
      visibility:   rec.visibility,
      isAbstract:   rec.isAbstract,
      superClass:   rec.superClass,
      interfaces:   rec.interfaces,
      javadoc:      rec.javadoc,
      packageName,
      imports,
      filePath,
      parentClass:   directParent ? directParent.name : null,
      nestedClasses: directChildren.map(c => c.name),
      annotations:   rec.annotations,
      enumConstants: rec.kind === 'enum' ? extractEnumConstants(rec.rawBody) : [],
      fields:        extractFields(cleanBody, strippedBody),
      methods:       [
        ...extractConstructors(cleanBody, strippedBody, rec.name),
        ...extractMethods(cleanBody, strippedBody)
      ]
    });
  }

  return classes;
}
