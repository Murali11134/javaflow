/**
 * JavaFlow - Java Parser Module
 *
 * Parses Java source files using regex-based extraction.
 * Extracts: package, imports, classes/interfaces/enums,
 * fields, methods, call references, and Javadoc comments.
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

function parseParameters(raw: string): JavaParameter[] {
  raw = raw.trim();
  if (!raw) { return []; }
  return raw.split(',').map(p => {
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
  while ((m = callRe.exec(body)) !== null) {
    const n = m[1];
    const keywords = new Set([
      'if', 'for', 'while', 'switch', 'catch', 'synchronized',
      'assert', 'return', 'throw', 'new', 'super', 'this'
    ]);
    if (!keywords.has(n)) { calls.add(n); }
  }
  return Array.from(calls);
}

function findMatchingBrace(src: string, openBrace: number): number {
  let depth = 0;
  for (let i = openBrace; i < src.length; i++) {
    if (src[i] === '{') { depth++; }
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { return i; }
    }
  }
  return openBrace;
}

function maskRange(src: string, start: number, end: number): string {
  if (start < 0 || end < start) { return src; }
  return src.slice(0, start) + ' '.repeat(end - start + 1) + src.slice(end + 1);
}

function maskRanges(src: string, ranges: Array<{ start: number; end: number }>): string {
  return ranges
    .slice()
    .sort((a, b) => b.start - a.start)
    .reduce((current, range) => maskRange(current, range.start, range.end), src);
}

function maskAnonymousClassBodies(src: string): string {
  let masked = src;
  const anonymousClassRe = /\bnew\s+[\w.]+(?:\s*<[^>{}]*>)?\s*\([^)]*\)\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = anonymousClassRe.exec(masked)) !== null) {
    const openBrace = match.index + match[0].lastIndexOf('{');
    const closeBrace = findMatchingBrace(masked, openBrace);
    if (closeBrace > openBrace) {
      masked = maskRange(masked, openBrace + 1, closeBrace - 1);
      anonymousClassRe.lastIndex = closeBrace + 1;
    }
  }

  return masked;
}

function maskNestedTypeDeclarations(
  body: string,
  classBodyStart: number,
  classBodyEnd: number,
  ranges: Array<{ start: number; end: number }>
): string {
  const nestedRanges = ranges
    .filter(range => range.start > classBodyStart && range.end < classBodyEnd)
    .map(range => ({
      start: range.start - classBodyStart - 1,
      end: range.end - classBodyStart - 1
    }));

  return maskRanges(body, nestedRanges);
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseJavaFile(source: string, filePath: string): JavaClass[] {
  const classes: JavaClass[] = [];

  // Package
  const pkgMatch = source.match(/^\s*package\s+([\w.]+)\s*;/m);
  const packageName = pkgMatch ? pkgMatch[1] : '';

  // Imports
  const imports: string[] = [];
  const importRe = /^\s*import\s+(?:static\s+)?([\w.*]+)\s*;/gm;
  let imp: RegExpExecArray | null;
  while ((imp = importRe.exec(source)) !== null) {
    imports.push(imp[1]);
  }

  // Classes / Interfaces / Enums
  // Using new RegExp to avoid TypeScript 5.x strict regex literal checking
  const classPattern = [
    '(?:\\/\\*\\*[\\s\\S]*?\\*\\/\\s*)?',          // optional javadoc
    '((?:public|protected|private|static|abstract|final|\\s)*)',  // modifiers
    '\\b(class|interface|enum)',                     // kind keyword
    '\\s+(\\w+)',                                    // class name
    '\\s*(?:extends\\s+([\\w., ]+?))?',              // optional extends
    '\\s*(?:implements\\s+([\\w., ]+?))?',           // optional implements
    '\\s*\\{'                                        // opening brace
  ].join('');
  const classRe = new RegExp(classPattern, 'g');
  const classMatches: Array<{
    match: RegExpExecArray;
    bodyStart: number;
    bodyEnd: number;
    declarationStart: number;
    declarationEnd: number;
  }> = [];

  let cm: RegExpExecArray | null;
  while ((cm = classRe.exec(source)) !== null) {
    const bodyStart = cm.index + cm[0].length - 1;
    const bodyEnd = findMatchingBrace(source, bodyStart);
    classMatches.push({
      match: cm,
      bodyStart,
      bodyEnd,
      declarationStart: cm.index,
      declarationEnd: bodyEnd
    });
  }

  for (const classMatch of classMatches) {
    cm = classMatch.match;
    const modifiers = cm[1] || '';
    const rawKind = cm[2];
    const name = cm[3];
    const superClass = cm[4] ? cm[4].trim() : null;
    const ifaceRaw = cm[5] ? cm[5].trim() : '';
    const interfaces = ifaceRaw ? ifaceRaw.split(',').map(s => s.trim()) : [];
    const javadoc = extractJavadoc(source, cm.index);

    const kind: JavaClass['kind'] = rawKind === 'interface' ? 'interface'
      : rawKind === 'enum' ? 'enum'
      : 'class';

    // Extract class body via balanced brace walking
    const bodyStart = classMatch.bodyStart;
    const bodyEnd = classMatch.bodyEnd;
    const rawBody = source.substring(bodyStart + 1, bodyEnd);
    const isolatedBody = maskAnonymousClassBodies(
      maskNestedTypeDeclarations(
        rawBody,
        bodyStart,
        bodyEnd,
        classMatches.map(match => ({
          start: match.declarationStart,
          end: match.declarationEnd
        }))
      )
    );
    const strippedBody = stripComments(isolatedBody);
    const cleanBody = strippedBody.text;

    // Fields
    const fields: JavaField[] = [];
    const fieldPattern = [
      '(?:^|\\n)\\s*',
      '((?:(?:public|protected|private|static|final|volatile|transient)\\s+)+)',
      '([\\w]+(?:<[^>]*>)?(?:\\[\\])*)',   // type (simplified)
      '\\s+(\\w+)',                         // field name
      '\\s*(?:=[^;]+)?;'                   // optional initializer
    ].join('');
    const fieldRe = new RegExp(fieldPattern, 'g');
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(cleanBody)) !== null) {
      const mods = fm[1].trim();
      const ftype = fm[2].trim();
      const fname = fm[3].trim();
      fields.push({
        name: fname,
        type: ftype,
        visibility: /public/.test(mods) ? 'public'
          : /protected/.test(mods) ? 'protected'
          : /private/.test(mods) ? 'private' : 'package',
        isStatic: /static/.test(mods),
        isFinal: /final/.test(mods),
        javadoc: extractJavadoc(rawBody, rawIndexForMatch(strippedBody, fm.index, fm[0]))
      });
    }

    // Methods
    const methods: JavaMethod[] = [];
    const methodPattern = [
      '((?:public|protected|private|static|abstract|final|synchronized|native|\\s)+)',
      '\\s+([\\w]+(?:<[^>]*>)?(?:\\[\\])*)',   // return type
      '\\s+(\\w+)',                              // method name
      '\\s*\\(([^)]*)\\)',                       // parameters
      '\\s*(?:throws\\s+[\\w,\\s]+?)?',         // optional throws
      '\\s*([{;])'                               // body or abstract
    ].join('');
    const methodRe = new RegExp(methodPattern, 'g');
    let mm2: RegExpExecArray | null;
    while ((mm2 = methodRe.exec(cleanBody)) !== null) {
      const mods = mm2[1].trim();
      const retType = mm2[2].trim();
      const mname = mm2[3].trim();
      const params = mm2[4];
      const hasBody = mm2[5] === '{';

      const skipKeywords = ['if', 'for', 'while', 'switch', 'catch'];
      if (skipKeywords.includes(mname)) { continue; }
      if (/^\d/.test(retType)) { continue; }

      let callsTo: string[] = [];
      if (hasBody) {
        const mBodyStart = mm2.index + mm2[0].length - 1;
        let d = 0;
        let mBodyEnd = mBodyStart;
        for (let i = mBodyStart; i < cleanBody.length; i++) {
          if (cleanBody[i] === '{') { d++; }
          else if (cleanBody[i] === '}') {
            d--;
            if (d === 0) { mBodyEnd = i; break; }
          }
        }
        const mBody = cleanBody.substring(mBodyStart + 1, mBodyEnd);
        callsTo = extractCallsTo(mBody);
      }

      methods.push({
        name: mname,
        visibility: /public/.test(mods) ? 'public'
          : /protected/.test(mods) ? 'protected'
          : /private/.test(mods) ? 'private' : 'package',
        returnType: retType,
        parameters: parseParameters(params),
        isStatic: /static/.test(mods),
        isAbstract: /abstract/.test(mods),
        javadoc: extractJavadoc(rawBody, rawIndexForMatch(strippedBody, mm2.index, mm2[0])),
        callsTo
      });
    }

    classes.push({
      name,
      kind,
      visibility: /public/.test(modifiers) ? 'public' : 'package',
      isAbstract: /abstract/.test(modifiers),
      superClass,
      interfaces,
      fields,
      methods,
      javadoc: javadoc || extractEmbeddedJavadoc(cm[0]),
      packageName,
      imports,
      filePath
    });
  }

  return classes;
}
