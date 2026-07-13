/**
 * Storefront contract inventory (AST, not regex).
 *
 * Individual contract UNITS are extracted from storefront sources using the
 * TypeScript compiler AST — never a regex over source text. For `.astro`
 * sources we first parse with `@astrojs/compiler`, then extract the frontmatter
 * body and every client/inline `<script>` body with origin metadata, and feed
 * each TypeScript/JavaScript fragment to the SAME TS AST walker. A full Astro
 * file is never handed directly to the TS parser.
 *
 * Static presence is a structural fact linked to a source row; BEHAVIOR (does
 * the event actually fire, does the fetch return, does storage persist) stays a
 * separate `UNKNOWN`/`status-open` case until Plan 2/3 exercises storage, event
 * payload, request/response and UI effects. Deleting one endpoint/event/action
 * therefore produces `requirement-missing` (via `overlayRequirements`) instead
 * of disappearing after an inventory refresh.
 *
 * Emitted units (each with a stable Task-1 capability ID + source ref):
 *   - `flow` storage.<key>              (localStorage/sessionStorage keys)
 *   - `flow` event.<name>               (dispatched/listened browser events)
 *   - `flow` <METHOD>.<encoded-route>   (fetch endpoints via makeEndpointId)
 *   - `flow` export.<name>              (exported atoms/stores/actions)
 *   - `flow` preview-demo.*             (units from the generated preview script)
 *   - `flow` cart-drawer.global.<name>  (five __MERFY_CART_DRAWER_*__ globals)
 *   - `flow` cart-drawer.reachability   (v2/built-theme/live call-site facts)
 */

import ts from 'typescript';
import { parse as parseAstro } from '@astrojs/compiler';
import {
  makeCapabilityId,
  makeEndpointId,
} from '../../../packages/theme-contract/conformance';
import type {
  CapabilityRecord,
  PreviewMode,
  ViewportName,
} from '../../../packages/theme-contract/conformance';

const ALL_MODES: PreviewMode[] = ['hot-preview', 'initial-preview', 'live'];
const ALL_VIEWPORTS: ViewportName[] = ['desktop', 'mobile'];

/** One storefront source fed to the inventory. */
export type StorefrontSourceInput =
  | { kind: 'ts'; ref: string; code: string }
  | { kind: 'astro'; ref: string; code: string }
  | {
      kind: 'generated-preview-script';
      ref: string;
      code: string;
      /**
       * The siteId the script was generated with. Its embedded literal is a
       * runtime parameter (the preview endpoint is site-agnostic), so it is
       * normalized to `{param}` — never baked into the endpoint capability ID.
       */
      siteId?: string;
    }
  | { kind: 'cart-drawer-resolver'; ref: string; code: string };

/** A discovered contract unit before it becomes a CapabilityRecord. */
interface RawUnit {
  /** dotted capability segments after theme+flow. */
  segments: string[];
  capability: string;
  ref: string;
  /** human/machine value shown in defaultValue (key/event/export name). */
  value?: unknown;
  /** endpoint IDs bypass makeCapabilityId (use makeEndpointId directly). */
  explicitId?: string;
  /** extra manifest facts (export name, global name, method, route, …). */
  manifest?: Record<string, unknown>;
}

// --- TS AST fragment walker -------------------------------------------------

interface FragmentUnits {
  storageKeys: string[];
  events: string[];
  endpoints: Array<{ method: string; route: string }>;
  exports: string[];
  /** true when the generated preview `preview-demo` line-item marker is present. */
  previewDemoMarker: boolean;
}

const STORAGE_OBJECTS = new Set(['localStorage', 'sessionStorage']);
const STORAGE_METHODS = new Set(['getItem', 'setItem', 'removeItem']);
const EVENT_CTORS = new Set(['CustomEvent', 'Event']);
const EVENT_LISTEN_METHODS = new Set(['addEventListener', 'removeEventListener']);
const EVENT_DISPATCH_METHODS = new Set(['dispatchEvent']);

/**
 * Resolve a node to a string only through deterministic constant/template
 * evaluation (string literal, a top-level `const NAME = 'literal'`, or a
 * template that is fully composed of such static pieces). Returns null when the
 * value is not statically knowable (a runtime variable/expression).
 */
function evalStatic(
  node: ts.Expression,
  consts: Map<string, string>,
  sf: ts.SourceFile,
): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isIdentifier(node)) {
    return consts.has(node.text) ? consts.get(node.text)! : null;
  }
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    for (const span of node.templateSpans) {
      const part = evalStatic(span.expression, consts, sf);
      if (part === null) return null;
      out += part + span.literal.text;
    }
    return out;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = evalStatic(node.left, consts, sf);
    const r = evalStatic(node.right, consts, sf);
    if (l === null || r === null) return null;
    return l + r;
  }
  if (ts.isParenthesizedExpression(node)) {
    return evalStatic(node.expression, consts, sf);
  }
  return null;
}

/**
 * Normalize a fetch route: keep the static prefix/suffix literals and replace
 * every interpolated dynamic segment with the named placeholder `{param}`, so
 * template expressions become a stable route without lossy slugification.
 * Returns null when the route is entirely dynamic (no static anchor).
 */
function normalizeFetchRoute(
  node: ts.Expression,
  consts: Map<string, string>,
  dynamicLiterals: ReadonlySet<string> = new Set(),
): string | null {
  const parts: string[] = [];
  let sawStatic = false;
  // A string-literal whose text is a KNOWN dynamic value (e.g. the injected
  // siteId in the generated preview script) is a runtime parameter, not a
  // hard-coded path segment: normalize it to {param}.
  const literalText = (expr: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral): void => {
    if (dynamicLiterals.has(expr.text)) {
      parts.push('{param}');
    } else {
      parts.push(expr.text);
      sawStatic = true;
    }
  };
  const push = (expr: ts.Expression): boolean => {
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      literalText(expr);
      return true;
    }
    if (ts.isIdentifier(expr) && consts.has(expr.text)) {
      parts.push(consts.get(expr.text)!);
      sawStatic = true;
      return true;
    }
    if (ts.isTemplateExpression(expr)) {
      parts.push(expr.head.text);
      if (expr.head.text) sawStatic = true;
      for (const span of expr.templateSpans) {
        if (
          ts.isStringLiteral(span.expression) &&
          !dynamicLiterals.has(span.expression.text)
        ) {
          parts.push(span.expression.text);
          sawStatic = true;
        } else if (
          ts.isIdentifier(span.expression) &&
          consts.has(span.expression.text)
        ) {
          parts.push(consts.get(span.expression.text)!);
          sawStatic = true;
        } else {
          parts.push('{param}');
        }
        parts.push(span.literal.text);
        if (span.literal.text) sawStatic = true;
      }
      return true;
    }
    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const okL = push(expr.left);
      const okR = push(expr.right);
      return okL || okR;
    }
    if (ts.isParenthesizedExpression(expr)) {
      return push(expr.expression);
    }
    // A dynamic runtime segment inside a concatenation.
    parts.push('{param}');
    return true;
  };
  push(node);
  if (!sawStatic) return null;
  return parts.join('');
}

/** HTTP method from a fetch `RequestInit` second argument; implicit GET. */
function methodFromInit(
  init: ts.Expression | undefined,
  consts: Map<string, string>,
): string {
  if (!init || !ts.isObjectLiteralExpression(init)) return 'GET';
  for (const prop of init.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ((ts.isIdentifier(prop.name) && prop.name.text === 'method') ||
        (ts.isStringLiteral(prop.name) && prop.name.text === 'method'))
    ) {
      const val = evalStatic(prop.initializer, consts, sf(prop));
      if (val) return val.toUpperCase();
    }
  }
  return 'GET';
}

function sf(node: ts.Node): ts.SourceFile {
  return node.getSourceFile();
}

function collectConsts(source: ts.SourceFile): Map<string, string> {
  const consts = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          (ts.isStringLiteral(decl.initializer) ||
            ts.isNoSubstitutionTemplateLiteral(decl.initializer))
        ) {
          consts.set(decl.name.text, decl.initializer.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  // Second pass: resolve template/const-composed consts now that literals exist.
  const visit2 = (node: ts.Node): void => {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          !consts.has(decl.name.text)
        ) {
          const v = evalStatic(decl.initializer, consts, source);
          if (v !== null) consts.set(decl.name.text, v);
        }
      }
    }
    ts.forEachChild(node, visit2);
  };
  visit2(source);
  return consts;
}

/** Walk one TS/JS fragment and collect contract units. */
function walkFragment(
  code: string,
  dynamicLiterals: ReadonlySet<string> = new Set(),
): FragmentUnits {
  const source = ts.createSourceFile(
    'fragment.ts',
    code,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
  const consts = collectConsts(source);
  const storageKeys = new Set<string>();
  const events = new Set<string>();
  const endpoints: Array<{ method: string; route: string }> = [];
  const endpointSeen = new Set<string>();
  const exports = new Set<string>();
  let previewDemoMarker = false;

  const addEndpoint = (method: string, route: string) => {
    const key = `${method} ${route}`;
    if (!endpointSeen.has(key)) {
      endpointSeen.add(key);
      endpoints.push({ method, route });
    }
  };

  const visit = (node: ts.Node): void => {
    // Storage: X.getItem('key') / X.setItem('key', …)
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.name) &&
      STORAGE_METHODS.has(node.expression.name.text)
    ) {
      const objText = node.expression.expression.getText(source);
      // Accept `localStorage.` and `window.localStorage.` forms.
      const base = objText.replace(/^window\./, '');
      if (STORAGE_OBJECTS.has(base)) {
        const arg = node.arguments[0];
        const key = arg ? evalStatic(arg, consts, source) : null;
        if (key) storageKeys.add(key);
      }
    }

    // Events: X.dispatchEvent(new CustomEvent('name')) OR
    //         X.addEventListener('name', …)
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = ts.isIdentifier(node.expression.name)
        ? node.expression.name.text
        : '';
      if (EVENT_DISPATCH_METHODS.has(method)) {
        const arg0 = node.arguments[0];
        if (
          arg0 &&
          ts.isNewExpression(arg0) &&
          ts.isIdentifier(arg0.expression) &&
          EVENT_CTORS.has(arg0.expression.text)
        ) {
          const nameArg = arg0.arguments?.[0];
          const name = nameArg ? evalStatic(nameArg, consts, source) : null;
          if (name) events.add(name);
        }
      }
      if (EVENT_LISTEN_METHODS.has(method)) {
        const nameArg = node.arguments[0];
        const name = nameArg ? evalStatic(nameArg, consts, source) : null;
        if (name) events.add(name);
      }
    }

    // Endpoints: fetch('/route', { method })
    if (
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === 'fetch') ||
        (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.name) &&
          node.expression.name.text === 'fetch'))
    ) {
      const urlArg = node.arguments[0];
      if (urlArg) {
        const route = normalizeFetchRoute(urlArg, consts, dynamicLiterals);
        if (route) {
          const method = methodFromInit(node.arguments[1], consts);
          addEndpoint(method, route);
        }
      }
    }

    // Exported atoms/stores/actions.
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) exports.add(decl.name.text);
      }
    }
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      exports.add(node.name.text);
    }

    // Generated preview-demo line-item marker: { id: 'preview-demo', … }.
    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === 'id') ||
        (ts.isStringLiteral(node.name) && node.name.text === 'id')) &&
      ts.isStringLiteral(node.initializer) &&
      node.initializer.text === 'preview-demo'
    ) {
      previewDemoMarker = true;
    }

    ts.forEachChild(node, visit);
  };
  visit(source);

  return {
    storageKeys: [...storageKeys],
    events: [...events],
    endpoints,
    exports: [...exports],
    previewDemoMarker,
  };
}

// --- Astro fragment extraction ---------------------------------------------

interface AstroFragment {
  origin: string; // frontmatter | script#N | inline-script#N
  code: string;
}

/**
 * Parse an `.astro` source and return the frontmatter body plus every
 * client/inline `<script>` body as separate fragments (with origin metadata).
 */
async function extractAstroFragments(code: string): Promise<AstroFragment[]> {
  const { ast } = await parseAstro(code);
  const fragments: AstroFragment[] = [];
  let scriptIndex = 0;

  const textBody = (node: any): string =>
    (node.children ?? [])
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.value ?? '')
      .join('');

  const walk = (node: any): void => {
    if (node.type === 'frontmatter') {
      fragments.push({ origin: 'frontmatter', code: node.value ?? '' });
    }
    if (node.type === 'element' && node.name === 'script') {
      const isInline = (node.attributes ?? []).some(
        (a: any) => a.name === 'is:inline',
      );
      fragments.push({
        origin: `${isInline ? 'inline-script' : 'script'}#${scriptIndex++}`,
        code: textBody(node),
      });
    }
    (node.children ?? []).forEach(walk);
  };
  walk(ast);
  return fragments;
}

// --- unit → CapabilityRecord ------------------------------------------------

function unitRow(theme: string, unit: RawUnit): CapabilityRecord {
  const id = unit.explicitId ?? makeCapabilityId(theme, 'flow', ...unit.segments);
  return {
    id,
    theme,
    surface: 'flow',
    capability: unit.capability,
    ...(unit.value !== undefined ? { defaultValue: unit.value } : {}),
    editable: false,
    persisted: false,
    ...(unit.manifest
      ? { constraints: { manifest: unit.manifest } }
      : {}),
    scenarios: [],
    modes: ALL_MODES,
    viewports: ALL_VIEWPORTS,
    caseResults: [],
    sources: [{ kind: 'code', ref: unit.ref }],
    // Static presence only; behavior is exercised in Plan 2/3.
    status: 'UNKNOWN',
    failureIds: [],
  };
}

// --- generated preview-cart contract units (structural) ---------------------

/**
 * Fixed structural units of the generated preview-demo script, keyed by the
 * REAL generator’s stable contract (not copied literals): the extracted script
 * is fed through the same AST walker for storage/event/endpoint units, and the
 * `preview-demo` line-item marker is emitted here.
 */
function previewScriptExtraUnits(theme: string, ref: string): RawUnit[] {
  return [
    {
      segments: ['preview-demo', 'line-item', 'preview-demo'],
      capability: 'preview-demo.line-item.preview-demo',
      ref,
      value: 'preview-demo',
      manifest: { marker: 'preview-demo', previewOnly: true },
    },
  ];
}

// --- cart-drawer resolver / call-site units (structural) --------------------

const CART_DRAWER_GLOBALS = [
  '__MERFY_CART_DRAWER_SCHEME__',
  '__MERFY_CART_DRAWER_DISCLAIMER__',
  '__MERFY_CART_DRAWER_TITLE__',
  '__MERFY_CART_DRAWER_CHECKOUT__',
  '__MERFY_CART_DRAWER_EMPTY__',
] as const;

/**
 * Emit one unit per exact cart-drawer global (with coupling/optional rules) plus
 * a reachability unit describing v2-sections/built-theme/live call sites. These
 * are the STATIC resolver/call-site facts; actual drawer colors/text are a
 * separate UNKNOWN behavior case for Plan 2.
 */
function cartDrawerUnits(theme: string, ref: string): RawUnit[] {
  const units: RawUnit[] = CART_DRAWER_GLOBALS.map((global) => ({
    segments: ['cart-drawer', 'global', global],
    capability: `cart-drawer.global.${global}`,
    ref,
    value: global,
    manifest: {
      global,
      // SCHEME and DISCLAIMER are a coupled pair; the three text globals opt-in.
      coupledWith:
        global === '__MERFY_CART_DRAWER_SCHEME__'
          ? '__MERFY_CART_DRAWER_DISCLAIMER__'
          : global === '__MERFY_CART_DRAWER_DISCLAIMER__'
            ? '__MERFY_CART_DRAWER_SCHEME__'
            : null,
      optional:
        global !== '__MERFY_CART_DRAWER_SCHEME__' &&
        global !== '__MERFY_CART_DRAWER_DISCLAIMER__',
    },
  }));
  units.push({
    segments: ['cart-drawer', 'reachability'],
    capability: 'cart-drawer.reachability',
    ref,
    manifest: {
      resolver: 'resolveCartDrawerGlobals',
      callSites: ['v2-sections', 'built-theme', 'live-build'],
      // Preview demo seeding is preview-only; NOT proof of live cart behavior.
      previewDemoIsPreviewOnly: true,
    },
  });
  return units;
}

// --- endpoint unit ----------------------------------------------------------

function endpointRow(
  theme: string,
  method: string,
  route: string,
  ref: string,
): CapabilityRecord {
  const id = makeEndpointId(theme, method, route);
  return {
    id,
    theme,
    surface: 'flow',
    capability: `endpoint.${method}.${route}`,
    defaultValue: route,
    editable: false,
    persisted: false,
    constraints: { manifest: { method, route } },
    scenarios: [],
    modes: ALL_MODES,
    viewports: ALL_VIEWPORTS,
    caseResults: [],
    sources: [{ kind: 'code', ref }],
    status: 'UNKNOWN',
    failureIds: [],
  };
}

// --- main -------------------------------------------------------------------

/**
 * Inventory storefront contract units from a set of sources. Async because
 * `.astro` parsing uses the (WASM) Astro compiler. Rows are NOT sorted here so
 * callers can merge/link before final `sortById`.
 */
export async function inventoryStorefrontContracts(
  theme: string,
  sources: StorefrontSourceInput[],
): Promise<CapabilityRecord[]> {
  const rows: CapabilityRecord[] = [];
  const seen = new Set<string>();
  const push = (row: CapabilityRecord) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    rows.push(row);
  };

  for (const src of sources) {
    // Gather TS/JS fragments for this source.
    const fragments: Array<{ code: string; ref: string }> = [];
    if (src.kind === 'astro') {
      const parts = await extractAstroFragments(src.code);
      for (const p of parts) fragments.push({ code: p.code, ref: `${src.ref}#${p.origin}` });
    } else {
      fragments.push({ code: src.code, ref: src.ref });
    }

    // The generated preview script embeds its siteId literal; treat it as a
    // runtime parameter so the endpoint stays site-agnostic (`{param}`).
    const dynamicLiterals =
      src.kind === 'generated-preview-script' && src.siteId
        ? new Set([src.siteId])
        : new Set<string>();

    for (const frag of fragments) {
      const units = walkFragment(frag.code, dynamicLiterals);
      for (const key of units.storageKeys) {
        push(
          unitRow(theme, {
            segments: ['storage', key],
            capability: `storage.${key}`,
            ref: frag.ref,
            value: key,
            manifest: { key },
          }),
        );
      }
      for (const ev of units.events) {
        push(
          unitRow(theme, {
            segments: ['event', ev],
            capability: `event.${ev}`,
            ref: frag.ref,
            value: ev,
            manifest: { event: ev },
          }),
        );
      }
      for (const ep of units.endpoints) {
        push(endpointRow(theme, ep.method, ep.route, frag.ref));
      }
      for (const ex of units.exports) {
        push(
          unitRow(theme, {
            segments: ['export', ex],
            capability: `export.${ex}`,
            ref: frag.ref,
            value: ex,
            manifest: { export: ex },
          }),
        );
      }
      if (units.previewDemoMarker && src.kind === 'generated-preview-script') {
        for (const u of previewScriptExtraUnits(theme, frag.ref)) {
          push(unitRow(theme, u));
        }
      }
    }

    // Structural resolver/call-site units for the cart-drawer resolver source.
    if (src.kind === 'cart-drawer-resolver') {
      for (const u of cartDrawerUnits(theme, src.ref)) {
        push(unitRow(theme, u));
      }
    }
  }

  return rows;
}
