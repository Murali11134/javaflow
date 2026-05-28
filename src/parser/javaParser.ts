/**
 * JavaFlow — Java Parser (v3, CST-based)
 *
 * Replaces the regex parser with java-parser (chevrotain CST).
 * The output interfaces are identical to v2 so the rest of the codebase
 * is unaffected.
 */

import { parse } from 'java-parser';

// ── Public interfaces (unchanged from v2) ──────────────────────────────────

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
  annotations: string[];
}

export interface JavaClass {
  name: string;
  kind: 'class' | 'interface' | 'enum' | 'annotation' | 'record';
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
  parentClass: string | null;
  nestedClasses: string[];
  annotations: string[];
  enumConstants: string[];
}

// ── CST navigation helpers ─────────────────────────────────────────────────

function kids(ctx: any, key: string): any[] { return ctx?.[key] ?? []; }
function kid(ctx: any, key: string): any    { return ctx?.[key]?.[0]; }

/** Collect all token images in source order and join them. */
function flatten(node: any): string {
  if (!node) { return ''; }
  if (typeof node.image === 'string') { return node.image; }
  const tokens: Array<{ off: number; img: string }> = [];
  function collect(n: any): void {
    if (!n) { return; }
    if (typeof n.image === 'string') { tokens.push({ off: n.startOffset ?? 0, img: n.image }); return; }
    for (const arr of Object.values(n.children ?? {})) {
      for (const c of (arr as any[])) { collect(c); }
    }
  }
  collect(node);
  tokens.sort((a, b) => a.off - b.off);
  return tokens.map(t => t.img).join('');
}

/** Find the start offset of the first token inside a CST rule node. Returns -1 if not found. */
function startOf(node: any): number {
  if (!node) { return -1; }
  if (typeof node.startOffset === 'number') { return node.startOffset; }
  for (const arr of Object.values(node.children ?? {})) {
    for (const c of (arr as any[])) {
      const off = startOf(c);
      if (off >= 0) { return off; }
    }
  }
  return -1;
}

// ── Javadoc ────────────────────────────────────────────────────────────────

function findJavadoc(source: string, offset: number): string {
  if (offset < 0) { return ''; }
  const before = source.slice(0, offset);
  const m = before.match(/\/\*\*([\s\S]*?)\*\/\s*(?:@[^\n]*\s*)*$/);
  if (!m) { return ''; }
  return m[1]
    .split('\n')
    .map(l => l.replace(/^\s*\*\s?/, '').trim())
    .filter(Boolean)
    .join(' ');
}

// ── Modifiers ──────────────────────────────────────────────────────────────

interface Mods {
  visibility: string;
  isStatic: boolean;
  isFinal: boolean;
  isAbstract: boolean;
  annotations: string[];
}

function extractMods(modNodes: any[]): Mods {
  let visibility = 'package';
  let isStatic = false; let isFinal = false; let isAbstract = false;
  const annotations: string[] = [];
  for (const mod of modNodes) {
    const ctx = mod.children ?? {};
    if      (ctx.Public)    { visibility = 'public'; }
    else if (ctx.Protected) { visibility = 'protected'; }
    else if (ctx.Private)   { visibility = 'private'; }
    if (ctx.Static)   { isStatic = true; }
    if (ctx.Final)    { isFinal = true; }
    if (ctx.Abstract) { isAbstract = true; }
    for (const ann of kids(ctx, 'annotation')) { annotations.push(flatten(ann)); }
  }
  return { visibility, isStatic, isFinal, isAbstract, annotations };
}

// ── Parameters ─────────────────────────────────────────────────────────────

function extractParams(fplCtx: any): JavaParameter[] {
  if (!fplCtx) { return []; }
  return kids(fplCtx, 'formalParameter').flatMap(fp => {
    const ctx = fp.children ?? {};
    const reg = kid(ctx, 'variableParaRegularParameter');
    if (reg) {
      const rc  = reg.children ?? {};
      const vid = kid(rc, 'variableDeclaratorId');
      const dims = kid(vid?.children, 'dims');
      return [{
        type: flatten(kid(rc, 'unannType')).trim() + (dims ? flatten(dims) : ''),
        name: kids(vid?.children, 'Identifier')[0]?.image ?? '',
      }];
    }
    const arity = kid(kid(ctx, 'variableParaLastParameter')?.children, 'variableArityParameter');
    if (arity) {
      const ac  = arity.children ?? {};
      const vid = kid(ac, 'variableDeclaratorId');
      return [{
        type: flatten(kid(ac, 'unannType')).trim() + '...',
        name: kids(vid?.children, 'Identifier')[0]?.image ?? '',
      }];
    }
    return [];
  });
}

// ── Field parsing ──────────────────────────────────────────────────────────

function parseFields(node: any, source: string, modKey: string): JavaField[] {
  const ctx  = node.children ?? {};
  const mods = extractMods(kids(ctx, modKey));
  const baseType = flatten(kid(ctx, 'unannType')).trim();
  const javadoc  = findJavadoc(source, startOf(node));
  return kids(kid(ctx, 'variableDeclaratorList')?.children, 'variableDeclarator').map(vd => {
    const vid  = kid(vd.children, 'variableDeclaratorId');
    const dims = kid(vid?.children, 'dims');
    return {
      name: kids(vid?.children, 'Identifier')[0]?.image ?? '',
      type: baseType + (dims ? flatten(dims) : ''),
      visibility: mods.visibility,
      isStatic: mods.isStatic,
      isFinal: mods.isFinal,
      javadoc,
    } as JavaField;
  }).filter(f => f.name);
}

// ── Call-graph extraction ──────────────────────────────────────────────────

/**
 * Walk a method/constructor body CST node and collect every method name that
 * is invoked, including chained calls.  Deduplicates via Set.
 *
 * Pattern: a `primary` node whose `primarySuffix` list contains a
 * `methodInvocationSuffix` entry.  The method name comes from:
 *   - suffix index 0 → last identifier inside `primaryPrefix.fqnOrRefType`
 *   - suffix index i > 0 → the Identifier in the immediately preceding suffix
 *     (the `Dot + Identifier` suffix that precedes the call parentheses)
 */
function extractCallsTo(bodyNode: any): string[] {
  const calls = new Set<string>();

  function fqnLastIdent(fqnNode: any): string | null {
    const fc = fqnNode.children ?? {};
    const rests = kids(fc, 'fqnOrRefTypePartRest');
    if (rests.length > 0) {
      const common = kid(rests[rests.length - 1].children, 'fqnOrRefTypePartCommon');
      return kids(common?.children, 'Identifier')[0]?.image ?? null;
    }
    const common = kid(kid(fc, 'fqnOrRefTypePartFirst')?.children, 'fqnOrRefTypePartCommon');
    return kids(common?.children, 'Identifier')[0]?.image ?? null;
  }

  function walkPrimary(node: any): void {
    const ctx = node.children ?? {};
    const suffixes = kids(ctx, 'primarySuffix');
    for (let i = 0; i < suffixes.length; i++) {
      const sc = suffixes[i].children ?? {};
      if (!kid(sc, 'methodInvocationSuffix')) { continue; }
      let name: string | null = null;
      if (i === 0) {
        const fqn = kid(kid(ctx, 'primaryPrefix')?.children, 'fqnOrRefType');
        if (fqn) { name = fqnLastIdent(fqn); }
      } else {
        name = kids(suffixes[i - 1].children, 'Identifier')[0]?.image ?? null;
      }
      if (name) { calls.add(name); }
    }
  }

  // Capture `new ClassName()` — extract the simple class name being instantiated.
  // CST path: newExpression → unqualifiedClassInstanceCreationExpression
  //           → classOrInterfaceTypeToInstantiate → Identifier(s)
  function walkNewExpression(node: any): void {
    const ctx   = node.children ?? {};
    const ucice = kid(ctx, 'unqualifiedClassInstanceCreationExpression');
    if (!ucice) { return; }
    const typeNode = kid(ucice.children ?? {}, 'classOrInterfaceTypeToInstantiate');
    if (!typeNode) { return; }
    // flatten gives "java.util.ArrayList" or "ArrayList"; strip generics, take last segment
    const typeName   = flatten(typeNode).replace(/<[\s\S]*$/, '').trim();
    const simpleName = typeName.split('.').pop();
    if (simpleName) { calls.add(simpleName); }
  }

  function walk(node: any): void {
    if (!node || typeof node.image === 'string') { return; }
    if (node.name === 'primary') { walkPrimary(node); }
    if (node.name === 'newExpression') { walkNewExpression(node); }
    for (const arr of Object.values(node.children ?? {})) {
      for (const c of arr as any[]) { walk(c); }
    }
  }

  walk(bodyNode);
  return [...calls];
}

// ── Method parsing ─────────────────────────────────────────────────────────

function parseMethod(node: any, source: string, modKey: string): JavaMethod {
  const ctx      = node.children ?? {};
  const mods     = extractMods(kids(ctx, modKey));
  const headerCtx = kid(ctx, 'methodHeader')?.children ?? {};
  const resultCtx = kid(headerCtx, 'result')?.children ?? {};
  const returnType = resultCtx.Void ? 'void' : flatten(kid(resultCtx, 'unannType')).trim();
  const declCtx    = kid(headerCtx, 'methodDeclarator')?.children ?? {};
  const name       = kids(declCtx, 'Identifier')[0]?.image ?? '';
  const parameters = extractParams(kid(declCtx, 'formalParameterList')?.children);
  const bodyNode = kid(ctx, 'methodBody');
  return {
    name, returnType, parameters,
    visibility:  mods.visibility,
    isStatic:    mods.isStatic,
    isAbstract:  mods.isAbstract,
    annotations: mods.annotations,
    javadoc:     findJavadoc(source, startOf(node)),
    callsTo:     bodyNode ? extractCallsTo(bodyNode) : [],
  };
}

// ── Constructor parsing ────────────────────────────────────────────────────

function parseCtor(node: any, source: string): JavaMethod {
  const ctx     = node.children ?? {};
  const mods    = extractMods(kids(ctx, 'constructorModifier'));
  const declCtx = kid(ctx, 'constructorDeclarator')?.children ?? {};
  const typeIdCtx = kid(kid(declCtx, 'simpleTypeName')?.children, 'typeIdentifier')?.children ?? {};
  const name    = kids(typeIdCtx, 'Identifier')[0]?.image ?? '';
  const parameters = extractParams(kid(declCtx, 'formalParameterList')?.children);
  const bodyNode = kid(ctx, 'constructorBody');
  return {
    name, returnType: '', parameters,
    visibility:  mods.visibility,
    isStatic:    false,
    isAbstract:  false,
    annotations: mods.annotations,
    javadoc:     findJavadoc(source, startOf(node)),
    callsTo:     bodyNode ? extractCallsTo(bodyNode) : [],
  };
}

// ── Body member extraction ─────────────────────────────────────────────────

interface BodyResult { fields: JavaField[]; methods: JavaMethod[]; nested: JavaClass[]; }

function processClassBodyDecls(
  decls: any[], className: string, source: string, pkgName: string, imports: string[], filePath: string
): BodyResult {
  const fields: JavaField[] = []; const methods: JavaMethod[] = []; const nested: JavaClass[] = [];
  for (const decl of decls) {
    const ctx = decl.children ?? {};
    if (ctx.constructorDeclaration) {
      const ctor = parseCtor(ctx.constructorDeclaration[0], source);
      if (ctor.name) { methods.push(ctor); }
    }
    const mem = kid(ctx, 'classMemberDeclaration')?.children ?? {};
    if (mem.fieldDeclaration)   { fields.push(...parseFields(mem.fieldDeclaration[0], source, 'fieldModifier')); }
    if (mem.methodDeclaration)  { const m = parseMethod(mem.methodDeclaration[0], source, 'methodModifier'); if (m.name) { methods.push(m); } }
    if (mem.classDeclaration)   { nested.push(...processClassDecl(mem.classDeclaration[0], className, source, pkgName, imports, filePath)); }
    if (mem.interfaceDeclaration) { nested.push(...processInterfaceDecl(mem.interfaceDeclaration[0], className, source, pkgName, imports, filePath)); }
  }
  return { fields, methods, nested };
}

function processInterfaceBodyDecls(
  decls: any[], ifaceName: string, source: string, pkgName: string, imports: string[], filePath: string
): BodyResult {
  const fields: JavaField[] = []; const methods: JavaMethod[] = []; const nested: JavaClass[] = [];
  for (const decl of decls) {
    const ctx = decl.children ?? {};
    if (ctx.constantDeclaration) {
      // Interface constants are implicitly public static final
      parseFields(ctx.constantDeclaration[0], source, 'constantModifier').forEach(f => {
        fields.push({ ...f, visibility: f.visibility === 'package' ? 'public' : f.visibility, isStatic: true, isFinal: true });
      });
    }
    if (ctx.interfaceMethodDeclaration) {
      const m = parseMethod(ctx.interfaceMethodDeclaration[0], source, 'interfaceMethodModifier');
      if (m.name) { methods.push({ ...m, visibility: m.visibility === 'package' ? 'public' : m.visibility }); }
    }
    if (ctx.classDeclaration)            { nested.push(...processClassDecl(ctx.classDeclaration[0], ifaceName, source, pkgName, imports, filePath)); }
    if (ctx.interfaceDeclaration)        { nested.push(...processInterfaceDecl(ctx.interfaceDeclaration[0], ifaceName, source, pkgName, imports, filePath)); }
  }
  return { fields, methods, nested };
}

// ── Type declaration processors ────────────────────────────────────────────

function processClassDecl(
  classDeclNode: any, parentClass: string | null,
  source: string, pkgName: string, imports: string[], filePath: string
): JavaClass[] {
  const ctx  = classDeclNode.children ?? {};
  const mods = extractMods(kids(ctx, 'classModifier'));

  // Normal class
  const normalDecl = kid(ctx, 'normalClassDeclaration');
  if (normalDecl) {
    const nc   = normalDecl.children ?? {};
    const name = kids(kid(nc, 'typeIdentifier')?.children, 'Identifier')[0]?.image ?? '';
    if (!name) { return []; }
    const superClass = kid(nc, 'classExtends')
      ? flatten(kid(kid(nc, 'classExtends')?.children, 'classType')).trim() || null : null;
    const interfaces = kids(kid(kid(nc, 'classImplements')?.children, 'interfaceTypeList')?.children, 'interfaceType')
      .map(it => flatten(it).trim());
    const bodyDecls = kids(kid(nc, 'classBody')?.children, 'classBodyDeclaration');
    const { fields, methods, nested } = processClassBodyDecls(bodyDecls, name, source, pkgName, imports, filePath);
    const cls: JavaClass = {
      name, kind: 'class', parentClass,
      visibility: mods.visibility, isAbstract: mods.isAbstract,
      annotations: mods.annotations, superClass, interfaces,
      fields, methods,
      nestedClasses: nested.filter(n => n.parentClass === name).map(n => n.name),
      enumConstants: [],
      javadoc: findJavadoc(source, startOf(classDeclNode)),
      packageName: pkgName, imports, filePath,
    };
    return [cls, ...nested];
  }

  // Record
  const recordDecl = kid(ctx, 'recordDeclaration');
  if (recordDecl) {
    const rc   = recordDecl.children ?? {};
    const name = kids(kid(rc, 'typeIdentifier')?.children, 'Identifier')[0]?.image ?? '';
    if (!name) { return []; }
    const interfaces = kids(kid(kid(rc, 'classImplements')?.children, 'interfaceTypeList')?.children, 'interfaceType')
      .map((it: any) => flatten(it).trim());
    // Record components become implicitly public final fields
    const compList = kid(kid(rc, 'recordHeader')?.children, 'recordComponentList');
    const componentFields: JavaField[] = kids(compList?.children, 'recordComponent').map((comp: any) => {
      const cc = comp.children ?? {};
      return {
        name:       kids(cc, 'Identifier')[0]?.image ?? '',
        type:       flatten(kid(cc, 'unannType')).trim(),
        visibility: 'public',
        isStatic:   false,
        isFinal:    true,
        javadoc:    '',
      } as JavaField;
    }).filter((f: JavaField) => f.name);
    // Body declarations reuse the same classBodyDeclaration structure
    const bodyDecls = kids(kid(rc, 'recordBody')?.children, 'recordBodyDeclaration')
      .flatMap((rbd: any) => kids(rbd.children, 'classBodyDeclaration'));
    const { fields, methods, nested } = processClassBodyDecls(bodyDecls, name, source, pkgName, imports, filePath);
    const cls: JavaClass = {
      name, kind: 'record', parentClass,
      visibility: mods.visibility, isAbstract: false,
      annotations: mods.annotations, superClass: null, interfaces,
      fields: [...componentFields, ...fields],
      methods, enumConstants: [],
      nestedClasses: nested.filter(n => n.parentClass === name).map(n => n.name),
      javadoc: findJavadoc(source, startOf(classDeclNode)),
      packageName: pkgName, imports, filePath,
    };
    return [cls, ...nested];
  }

  // Enum
  const enumDecl = kid(ctx, 'enumDeclaration');
  if (enumDecl) {
    const ec   = enumDecl.children ?? {};
    const name = kids(kid(ec, 'typeIdentifier')?.children, 'Identifier')[0]?.image ?? '';
    if (!name) { return []; }
    const interfaces = kids(kid(kid(ec, 'classImplements')?.children, 'interfaceTypeList')?.children, 'interfaceType')
      .map(it => flatten(it).trim());
    const enumBodyCtx = kid(ec, 'enumBody')?.children ?? {};
    const enumConstants = kids(kid(enumBodyCtx, 'enumConstantList')?.children, 'enumConstant')
      .map(ec2 => kids(ec2.children, 'Identifier')[0]?.image ?? '').filter(Boolean);
    // Enum body declarations (methods/fields inside the enum)
    const bodyDeclsNode = kid(enumBodyCtx, 'enumBodyDeclarations');
    const bodyDecls = kids(bodyDeclsNode?.children, 'classBodyDeclaration');
    const { fields, methods, nested } = processClassBodyDecls(bodyDecls, name, source, pkgName, imports, filePath);
    const cls: JavaClass = {
      name, kind: 'enum', parentClass,
      visibility: mods.visibility, isAbstract: false,
      annotations: mods.annotations, superClass: null, interfaces,
      fields, methods, enumConstants,
      nestedClasses: nested.filter(n => n.parentClass === name).map(n => n.name),
      javadoc: findJavadoc(source, startOf(classDeclNode)),
      packageName: pkgName, imports, filePath,
    };
    return [cls, ...nested];
  }

  return [];
}

function processInterfaceDecl(
  ifaceDeclNode: any, parentClass: string | null,
  source: string, pkgName: string, imports: string[], filePath: string
): JavaClass[] {
  const ctx  = ifaceDeclNode.children ?? {};
  const mods = extractMods(kids(ctx, 'interfaceModifier'));

  // Normal interface
  const normalDecl = kid(ctx, 'normalInterfaceDeclaration');
  if (normalDecl) {
    const nc   = normalDecl.children ?? {};
    const name = kids(kid(nc, 'typeIdentifier')?.children, 'Identifier')[0]?.image ?? '';
    if (!name) { return []; }
    const bodyDecls = kids(kid(nc, 'interfaceBody')?.children, 'interfaceMemberDeclaration');
    const { fields, methods, nested } = processInterfaceBodyDecls(bodyDecls, name, source, pkgName, imports, filePath);
    const cls: JavaClass = {
      name, kind: 'interface', parentClass,
      visibility: mods.visibility, isAbstract: true,
      annotations: mods.annotations, superClass: null,
      interfaces: kids(kid(kid(nc, 'extendsInterfaces')?.children, 'interfaceTypeList')?.children, 'interfaceType')
        .map(it => flatten(it).trim()),
      fields, methods, enumConstants: [],
      nestedClasses: nested.filter(n => n.parentClass === name).map(n => n.name),
      javadoc: findJavadoc(source, startOf(ifaceDeclNode)),
      packageName: pkgName, imports, filePath,
    };
    return [cls, ...nested];
  }

  // Annotation type (@interface)
  const annotDecl = kid(ctx, 'annotationTypeDeclaration');
  if (annotDecl) {
    const ac   = annotDecl.children ?? {};
    const name = kids(kid(ac, 'typeIdentifier')?.children, 'Identifier')[0]?.image ?? '';
    if (!name) { return []; }
    const bodyDecls = kids(kid(ac, 'annotationTypeBody')?.children, 'annotationTypeElementDeclaration');
    const methods: JavaMethod[] = bodyDecls.flatMap((decl: any) => {
      const rest = kid(decl.children ?? {}, 'annotationTypeElementRest');
      if (!rest) { return []; }
      const rc = rest.children ?? {};
      const elemName = kids(rc, 'Identifier')[0]?.image ?? '';
      if (!elemName) { return []; }
      return [{
        name: elemName, returnType: flatten(kid(rc, 'unannType')).trim(),
        parameters: [], visibility: 'public', isStatic: false,
        isAbstract: false, annotations: [], javadoc: '', callsTo: [],
      } as JavaMethod];
    });
    return [{
      name, kind: 'annotation', parentClass,
      visibility: mods.visibility, isAbstract: false,
      annotations: mods.annotations, superClass: null, interfaces: [],
      fields: [], methods, enumConstants: [], nestedClasses: [],
      javadoc: findJavadoc(source, startOf(ifaceDeclNode)),
      packageName: pkgName, imports, filePath,
    }];
  }

  return [];
}

// ── Entry point ────────────────────────────────────────────────────────────

export function parseJavaFile(source: string, filePath: string): JavaClass[] {
  let cst: any;
  try {
    cst = parse(source);
  } catch {
    return [];
  }

  const occuCtx = kid(cst.children, 'ordinaryCompilationUnit')?.children ?? {};

  // Package
  const pkgCtx = kid(occuCtx, 'packageDeclaration')?.children ?? {};
  const pkgName = kids(pkgCtx, 'Identifier').map((t: any) => t.image).join('.');

  // Imports
  const imports = kids(occuCtx, 'importDeclaration').map(imp => {
    const ic = imp.children ?? {};
    const names = kids(kid(ic, 'packageOrTypeName')?.children, 'Identifier').map((t: any) => t.image);
    const base = names.join('.');
    if (ic.Star) { return base + '.*'; }
    // Static specific import (e.g. import static Foo.BAR): trailing Identifier is the member name
    if (ic.Static) {
      const trailing = (ic.Identifier ?? []).map((t: any) => t.image);
      if (trailing.length > 0) { return base + '.' + trailing[trailing.length - 1]; }
    }
    return base;
  });

  // Type declarations
  const classes: JavaClass[] = [];
  for (const typeDecl of kids(occuCtx, 'typeDeclaration')) {
    const tc = typeDecl.children ?? {};
    if (tc.classDeclaration)     { classes.push(...processClassDecl(tc.classDeclaration[0], null, source, pkgName, imports, filePath)); }
    if (tc.interfaceDeclaration) { classes.push(...processInterfaceDecl(tc.interfaceDeclaration[0], null, source, pkgName, imports, filePath)); }
  }

  return classes;
}
