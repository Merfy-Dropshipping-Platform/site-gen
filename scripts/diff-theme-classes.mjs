#!/usr/bin/env node
/**
 * diff-theme-classes.mjs — systemic style migration tool for theme packages.
 *
 * Purpose: compare Tailwind classes between legacy showcase template
 *   (templates/astro/<theme>/src/components/<Block>.astro) and the current
 *   theme override (packages/theme-<theme>/blocks/<Block>/<Block>.classes.ts),
 *   highlighting drift so we can converge override classes onto the legacy
 *   pixel-perfect implementation without touching puckConfig / theme.json.
 *
 * Usage:
 *   node scripts/diff-theme-classes.mjs --theme=rose --block=Header
 *   node scripts/diff-theme-classes.mjs --theme=rose --block=Header --apply
 *   node scripts/diff-theme-classes.mjs --theme=rose --block=Header --apply --dry-run
 *
 * Constraints (user explicit):
 *   - NEVER touch Header.puckConfig.ts (sidebar fields preserved).
 *   - NEVER touch theme.json (color schemes / tokens preserved).
 *   - Translate legacy color utilities (bg-theme-background, text-theme-foreground,
 *     border-theme, font-body) to CSS-var form (bg-[rgb(var(--color-bg))], etc.)
 *     so validateBlock B-6 doesn't reject the override.
 *   - Pilot: rose Header only. Other blocks need their own selector map.
 */

import { parse } from '@astrojs/compiler';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = path.resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// CLI parsing
// ─────────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { theme: null, block: null, apply: false, dryRun: false };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--theme=')) out.theme = arg.slice('--theme='.length);
    else if (arg.startsWith('--block=')) out.block = arg.slice('--block='.length);
    else if (arg === '--apply') out.apply = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${arg}`);
      printHelp();
      process.exit(2);
    }
  }
  if (!out.theme || !out.block) {
    console.error('Missing required --theme=<name> and --block=<Name>');
    printHelp();
    process.exit(2);
  }
  return out;
}

function printHelp() {
  console.log(`
Usage: node scripts/diff-theme-classes.mjs --theme=<name> --block=<Name> [--apply] [--dry-run]

Options:
  --theme=<name>   theme package suffix, e.g. rose, vanilla, satin
  --block=<Name>   block component name, e.g. Header, Footer, Hero
  --apply          write transformed legacy classes into override (with .bak backup)
  --dry-run        used with --apply — print what would be written, no writes
`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy utility → CSS-var token translation
// ─────────────────────────────────────────────────────────────────────────────
// These mappings translate legacy theme-aware Tailwind utilities (used in
// templates/astro/<theme>/) into CSS-var form that the override .classes.ts
// must use to pass validateBlock B-6 (no raw color literals).
const TOKEN_REPLACEMENTS = [
  // Fonts
  { from: /\bfont-body\b/g, to: '[font-family:var(--font-body)]' },
  { from: /\bfont-heading\b/g, to: '[font-family:var(--font-heading)]' },
  // Text colors
  { from: /\btext-theme-foreground\b/g, to: 'text-[rgb(var(--color-text))]' },
  { from: /\btext-theme-background\b/g, to: 'text-[rgb(var(--color-bg))]' },
  { from: /\btext-theme-primary\b/g, to: 'text-[rgb(var(--color-primary))]' },
  { from: /\btext-theme-muted\b/g, to: 'text-[rgb(var(--color-muted))]' },
  { from: /\btext-theme-button-text\b/g, to: 'text-[rgb(var(--color-button-text))]' },
  // Background colors
  { from: /\bbg-theme-background\b/g, to: 'bg-[rgb(var(--color-bg))]' },
  { from: /\bbg-theme-primary\b/g, to: 'bg-[rgb(var(--color-primary))]' },
  // Placeholders
  { from: /\bplaceholder:text-theme-muted\b/g, to: 'placeholder:text-[rgb(var(--color-muted))]' },
  // Hovers
  { from: /\bhover:text-theme-foreground\b/g, to: 'hover:text-[rgb(var(--color-text))]' },
  // Borders (default to /15 — same convention as rose override; reviewer can
  // bump to /30 manually if needed for search inputs etc.)
  { from: /\bborder-theme\b/g, to: 'border-[rgb(var(--color-text))]/15' },
];

function translateLegacyClasses(input) {
  let out = input;
  for (const { from, to } of TOKEN_REPLACEMENTS) {
    out = out.replace(from, to);
  }
  return normalizeWhitespace(out);
}

function normalizeWhitespace(str) {
  return str.replace(/\s+/g, ' ').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Header selector map — semantic element → key in HeaderClasses
// ─────────────────────────────────────────────────────────────────────────────
// Each entry produces ONE diff key. Some entries map to nested keys like
// `mobileMenu.search`. The extractor walks the .astro DOM and matches the
// first/canonical occurrence per key (legacy duplicates same element across
// logoPosition branches — top-left, top-center, etc — they share classes).
const HEADER_SELECTORS = [
  // Outer wrapper around <header> — has data-header-wrapper marker.
  {
    key: 'wrapper',
    match: (n) => n.name === 'div' && hasAttr(n, 'data-header-wrapper'),
    extract: extractWrapperWithoutSticky,
  },
  // Sticky variants are computed by stickyClass const in frontmatter, not by
  // a single element. Handled separately via frontmatter parsing.
  {
    key: 'header',
    match: (n) => n.name === 'header',
    extract: (n) => extractClassList(n, ['bg-theme-background', 'border-theme']),
  },
  {
    key: 'nav',
    match: (n) =>
      n.name === 'nav' && hasAnyClassToken(n, 'max-w-[1920px]'),
    extract: (n) => extractClassList(n, ['justify-between']),
  },
  {
    key: 'navJustified',
    match: (n) => n.name === 'nav' && hasClassListConditional(n, 'justify-between'),
    extract: () => 'justify-between',
  },
  {
    key: 'hamburger',
    match: (n) => n.name === 'button' && getAttrValue(n, 'id') === 'mobile-menu-button',
    extract: extractClassList,
  },
  // logoWrap.* — divs wrapping a logo <a href="/"> inside per-layout branches.
  // top-left: `absolute left-1/2 -translate-x-1/2 md:relative md:left-auto md:transform-none`
  {
    key: 'logoWrap.top-left',
    match: (n) =>
      n.name === 'div' &&
      hasClassToken(n, 'absolute') &&
      hasClassToken(n, 'md:relative') &&
      containsLogoLink(n),
    extract: extractClassList,
  },
  // top-center: `absolute left-1/2 -translate-x-1/2` (no md:relative)
  {
    key: 'logoWrap.top-center',
    match: (n) =>
      n.name === 'div' &&
      hasClassToken(n, 'absolute') &&
      hasClassToken(n, 'left-1/2') &&
      !hasClassToken(n, 'md:relative') &&
      containsLogoLink(n),
    extract: extractClassList,
  },
  // top-right: `hidden md:flex`
  {
    key: 'logoWrap.top-right',
    match: (n) =>
      n.name === 'div' &&
      hasClassToken(n, 'hidden') &&
      hasClassToken(n, 'md:flex') &&
      containsLogoLink(n),
    extract: extractClassList,
  },
  // center-left: logo <a> sits directly inside the center-left flex row, no
  // wrapper div with positioning classes; treat as empty string.
  {
    key: 'logoWrap.center-left',
    match: () => false, // no element to extract; default to ''
    extract: () => '',
  },
  // The <a href="/"> itself (logo link)
  {
    key: 'logoLink',
    match: (n) =>
      n.name === 'a' &&
      getAttrValue(n, 'href') === '/' &&
      hasClassToken(n, 'flex') &&
      hasClassToken(n, 'items-center'),
    extract: extractClassList,
  },
  // <img> for the uploaded logo file
  {
    key: 'logoImg',
    match: (n) => n.name === 'img' && hasClassToken(n, 'h-5'),
    extract: extractClassList,
  },
  // <span> fallback for siteTitle text
  {
    key: 'logoText',
    match: (n) => n.name === 'span' && hasAnyClassToken(n, 'tracking-wide'),
    extract: (n) =>
      extractClassList(n, ['text-theme-foreground']),
  },
  // Desktop nav container
  {
    key: 'navMenu',
    match: (n) =>
      n.name === 'div' &&
      hasClassToken(n, 'hidden') &&
      hasClassToken(n, 'md:flex') &&
      hasClassToken(n, '2xl:gap-[80px]') &&
      !hasClassToken(n, 'mt-2'),
    extract: extractClassList,
  },
  // Centered desktop nav (center-left layout, second row)
  {
    key: 'navMenuCentered',
    match: (n) =>
      n.name === 'div' &&
      hasClassToken(n, 'hidden') &&
      hasClassToken(n, 'md:flex') &&
      hasClassToken(n, 'mt-2'),
    extract: extractClassList,
  },
  // Nav <a> links
  {
    key: 'navLink',
    match: (n) =>
      n.name === 'a' &&
      hasClassListToken(n, 'xl:text-[20px]'),
    extract: (n) => extractClassList(n, ['text-theme-foreground']),
  },
  // Actions container (search/cart/profile)
  {
    key: 'actions',
    match: (n) =>
      n.name === 'div' &&
      hasClassToken(n, 'flex') &&
      hasClassToken(n, 'xl:gap-[25px]'),
    extract: extractClassList,
  },
  {
    key: 'actionSearch',
    match: (n) => n.name === 'button' && getAttrValue(n, 'aria-label') === 'Поиск',
    extract: (n) => extractClassList(n, ['text-theme-foreground']),
  },
  {
    key: 'actionCart',
    match: (n) => n.name === 'a' && getAttrValue(n, 'id') === 'header-cart-link',
    extract: (n) => extractClassList(n, ['text-theme-foreground']),
  },
  {
    key: 'actionProfile',
    match: (n) =>
      n.name === 'a' &&
      getAttrValue(n, 'aria-label') === 'Аккаунт' &&
      hasClassListToken(n, 'auth-nav-btn'),
    extract: (n) => extractClassList(n, ['text-theme-foreground']),
  },
  {
    key: 'cartBadge',
    match: (n) => n.name === 'span' && getAttrValue(n, 'id') === 'cart-badge',
    extract: extractClassList,
  },
  // Mobile menu root
  {
    key: 'mobileMenu.root',
    match: (n) => n.name === 'div' && getAttrValue(n, 'id') === 'mobile-menu',
    extract: extractClassList,
  },
  // Mobile menu nav
  {
    key: 'mobileMenu.nav',
    match: (n) =>
      n.name === 'nav' && getAttrValue(n, 'aria-label') === 'Мобильная навигация',
    extract: (n) => extractClassList(n, ['bg-theme-background']),
  },
  // Mobile menu search wrap
  {
    key: 'mobileMenu.search',
    match: (n) =>
      n.name === 'div' &&
      hasClassToken(n, 'px-4') &&
      hasClassToken(n, 'pt-6') &&
      hasClassToken(n, 'pb-4'),
    extract: extractClassList,
  },
  // Mobile menu search <input>
  {
    key: 'mobileMenu.searchInput',
    match: (n) => n.name === 'input' && getAttrValue(n, 'type') === 'search',
    extract: (n) =>
      extractClassList(n, [
        'bg-theme-background',
        'border-theme',
        'text-theme-foreground',
        'placeholder:text-theme-muted',
      ]),
  },
  // Mobile menu plain <a> link (no submenu)
  {
    key: 'mobileMenu.link',
    match: (n) =>
      n.name === 'a' &&
      hasClassListToken(n, 'border-t') &&
      hasClassListToken(n, 'py-4') &&
      !hasClassListToken(n, 'auth-nav-btn'),
    extract: (n) =>
      extractClassList(n, ['text-theme-foreground', 'border-theme']),
  },
  // Mobile submenu toggle <button>
  {
    key: 'mobileMenu.submenuToggle',
    match: (n) =>
      n.name === 'button' && hasClassListToken(n, 'mobile-submenu-toggle'),
    extract: (n) =>
      extractClassList(n, ['text-theme-foreground', 'border-theme']),
  },
  // Mobile submenu wrap div
  {
    key: 'mobileMenu.submenuWrap',
    match: (n) =>
      n.name === 'div' && hasClassToken(n, 'mobile-submenu'),
    extract: extractClassList,
  },
  // Mobile submenu <a> link
  {
    key: 'mobileMenu.submenuLink',
    match: (n) =>
      n.name === 'a' &&
      hasClassListToken(n, 'px-8') &&
      hasClassListToken(n, 'py-3'),
    extract: (n) =>
      extractClassList(n, [
        'text-theme-muted',
        'hover:text-theme-foreground',
        'border-theme',
      ]),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Astro AST helpers
// ─────────────────────────────────────────────────────────────────────────────
function walkAst(node, visit) {
  if (!node) return;
  visit(node);
  if (node.children) {
    for (const c of node.children) walkAst(c, visit);
  }
}

function getAttr(node, name) {
  if (!node.attributes) return null;
  return node.attributes.find((a) => a.name === name) || null;
}

function getAttrValue(node, name) {
  const attr = getAttr(node, name);
  if (!attr) return null;
  // Astro AST: attributes are { kind, name, value, ... }. value is a string
  // for static, or contains expression text for dynamic.
  return typeof attr.value === 'string' ? attr.value : '';
}

function hasAttr(node, name) {
  return getAttr(node, name) !== null;
}

/** Does the static `class="..."` attribute contain this exact whitespace-token? */
function hasClassToken(node, token) {
  const cls = getAttrValue(node, 'class');
  if (!cls) return false;
  return ` ${cls} `.includes(` ${token} `);
}

/**
 * Does either the static `class="..."` or any literal inside `class:list={[...]}`
 * contain `token`? Use this when the selector should match regardless of which
 * Astro class form the legacy uses.
 */
function hasAnyClassToken(node, token) {
  return hasClassToken(node, token) || hasClassListToken(node, token);
}

/** Does the `class:list={[...]}` attribute contain this token as a string literal? */
function hasClassListToken(node, token) {
  const attr = getAttr(node, 'class:list');
  if (!attr) return false;
  // class:list value is expression text — search literally for the token in
  // any quoted string within the array. We collect all string literals then
  // do whitespace-delimited token containment; this avoids `\b` failures for
  // Tailwind tokens with `:`, `[`, `]` characters (e.g. `xl:text-[20px]`).
  const text = typeof attr.value === 'string' ? attr.value : '';
  const literals = extractStringLiterals(text);
  for (const lit of literals) {
    if (` ${lit} `.includes(` ${token} `)) return true;
  }
  return false;
}

function hasClassListConditional(node, token) {
  return hasClassListToken(node, token);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns true if the subtree under `node` contains an <a href="/"> element —
 * used to disambiguate the logo wrap <div> from other absolute-positioned divs.
 */
function containsLogoLink(node) {
  let found = false;
  walkAst(node, (n) => {
    if (n.name === 'a' && getAttrValue(n, 'href') === '/') found = true;
  });
  return found;
}

/**
 * Extract the unconditional Tailwind class string from an element.
 *
 * Handles both:
 *   1) `class="foo bar"` — return literal value
 *   2) `class:list={[ 'foo bar', cond && 'baz' ]}` — concatenate the
 *      unconditional string literals, dropping conditionals (the conditional
 *      branches are legacy fallbacks like `!textColor && 'text-theme-foreground'`
 *      which are not needed in CSS-var form). Optionally, `dropTokens` (a list
 *      of conditional tokens to drop entirely) is used to filter conditional
 *      tokens from any extracted strings.
 *
 * The result is whitespace-normalized.
 */
function extractClassList(node, dropTokens = []) {
  if (!node) return '';
  const staticAttr = getAttr(node, 'class');
  const listAttr = getAttr(node, 'class:list');

  if (staticAttr && typeof staticAttr.value === 'string') {
    return normalizeWhitespace(staticAttr.value);
  }

  if (!listAttr) return '';

  // listAttr.value is the inner expression text (e.g. "[ 'foo', cond && 'bar' ]").
  // We parse it by extracting all string literals: any 'X' or "X" or `X`.
  const exprText = typeof listAttr.value === 'string' ? listAttr.value : '';
  const literals = extractStringLiterals(exprText);

  // For each literal, check if it's "unconditional". A literal is conditional
  // if the segment of text immediately preceding it contains `&&` (logical
  // AND for short-circuit conditionals). We approximate: literals appearing
  // bare after `[` or `,` are unconditional; literals after `&&` are
  // conditional.
  const unconditional = collectUnconditionalLiterals(exprText);

  // Filter out fallback tokens (e.g. 'text-theme-foreground' from
  // `!textColor && 'text-theme-foreground'`).
  const drops = new Set(dropTokens);
  const kept = unconditional.filter((lit) => !drops.has(lit.trim()));

  return normalizeWhitespace(kept.join(' '));
}

function extractStringLiterals(exprText) {
  const out = [];
  const re = /(['"`])([^'"`]*)\1/g;
  let m;
  while ((m = re.exec(exprText)) !== null) {
    out.push(m[2]);
  }
  return out;
}

/**
 * For an expression like:
 *   [ 'foo', !x && 'bar', y ? 'baz' : 'qux', 'always' ]
 * return the literals NOT inside a `&&` or `?:` conditional — here ['foo', 'always'].
 */
function collectUnconditionalLiterals(exprText) {
  const out = [];
  const re = /(['"`])([^'"`]*)\1/g;
  let m;
  while ((m = re.exec(exprText)) !== null) {
    const litStart = m.index;
    // Look back up to first non-whitespace char before this literal.
    let i = litStart - 1;
    while (i >= 0 && /\s/.test(exprText[i])) i--;
    const prev = exprText[i];
    // Unconditional if preceded by '[' or ',' (start of expression / array item).
    // Conditional if preceded by '&' (part of `&&`) or '?' or ':' (ternary).
    if (prev === '[' || prev === ',' || prev === undefined) {
      out.push(m[2]);
    }
  }
  return out;
}

/** Wrapper extractor that drops `${stickyClass}` template var (handled separately). */
function extractWrapperWithoutSticky(node) {
  const attr = getAttr(node, 'class');
  if (!attr) return '';
  // attr.kind === 'expression' here: value is the literal expression text,
  // e.g. `\`w-full shadow-sm ${stickyClass}\``. Strip wrapping backticks +
  // `${...}` template holes (handled via separate sticky map).
  let raw = typeof attr.value === 'string' ? attr.value : '';
  if (raw.startsWith('`') && raw.endsWith('`')) raw = raw.slice(1, -1);
  return normalizeWhitespace(raw.replace(/\$\{[^}]*\}/g, ''));
}

/**
 * Parse stickyClass branches from the frontmatter. The legacy pattern is:
 *
 *   const stickyClass = stickiness === "always"
 *     ? "sticky top-0 z-50"
 *     : stickiness === "scroll-up"
 *       ? "sticky top-0 z-50 transition-transform duration-300"
 *       : "relative z-50";
 *
 * Returns an object { always, 'scroll-up', none } or null if the pattern is
 * not found.
 */
function extractStickyClassFromFrontmatter(frontmatter) {
  if (!frontmatter) return null;
  // Find the assignment line(s) for stickyClass.
  const m = frontmatter.match(
    /const\s+stickyClass\s*=\s*([\s\S]*?);\s*\n/m,
  );
  if (!m) return null;
  const expr = m[1];

  // Match three string branches. The order in the legacy file is:
  //   stickiness === "always" ? "<always>" : stickiness === "scroll-up" ? "<scroll-up>" : "<none>"
  const branchRe = /"([^"]+)"/g;
  const strings = [];
  let bm;
  while ((bm = branchRe.exec(expr)) !== null) {
    strings.push(bm[1]);
  }
  // The pattern produces 5 strings: "always" condition, "<always>" result,
  // "scroll-up" condition, "<scroll-up>" result, "<none>" result.
  // We need indexes 1, 3, 4 for results.
  if (strings.length < 5) return null;
  return {
    always: strings[1],
    'scroll-up': strings[3],
    none: strings[4],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// .classes.ts parsing via TypeScript AST
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Parse the .classes.ts source and return the object literal as a nested
 * JavaScript object. Only supports the pattern:
 *
 *   export const HeaderClasses = { ... } as const;
 *
 * Properties can be:
 *   - string literal: `key: 'foo bar'`
 *   - nested object literal: `key: { 'sub': 'foo' }`
 */
function parseClassesTs(source) {
  const sf = ts.createSourceFile(
    'X.classes.ts',
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );

  let result = null;
  let exportName = null;

  ts.forEachChild(sf, (node) => {
    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      const decl = node.declarationList.declarations[0];
      if (decl && ts.isIdentifier(decl.name) && decl.initializer) {
        // Strip `as const` assertion if present.
        let init = decl.initializer;
        if (ts.isAsExpression(init)) init = init.expression;
        if (ts.isObjectLiteralExpression(init)) {
          exportName = decl.name.text;
          result = parseObjectLiteral(init);
        }
      }
    }
  });

  return { exportName, value: result };
}

function hasExportModifier(node) {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : node.modifiers;
  if (!mods) return false;
  return mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function parseObjectLiteral(obj) {
  const out = {};
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = propKeyText(prop.name);
    if (key === null) continue;
    const init = prop.initializer;
    if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
      out[key] = init.text;
    } else if (ts.isObjectLiteralExpression(init)) {
      out[key] = parseObjectLiteral(init);
    }
    // Other forms (numeric, expression) are not expected; skip silently.
  }
  return out;
}

function propKeyText(name) {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name)) return name.text;
  if (ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name)) return null;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Diff engine
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Compare extracted-from-legacy object vs current override object. Returns
 * a list of { key, status, legacy, override }. Status is one of:
 *   - 'matched'  — equal (after whitespace normalize)
 *   - 'delta'    — both present, differ
 *   - 'missing'  — in legacy, not in override
 *   - 'extra'    — in override, not in legacy
 */
function diffObjects(legacy, override, prefix = '') {
  const out = [];
  const allKeys = new Set([
    ...Object.keys(legacy || {}),
    ...Object.keys(override || {}),
  ]);
  // Sort: top-level keys first in their original legacy order, then by name.
  const sortedKeys = Array.from(allKeys).sort();
  for (const key of sortedKeys) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const l = legacy ? legacy[key] : undefined;
    const o = override ? override[key] : undefined;

    if (typeof l === 'object' && l !== null) {
      // Nested
      out.push(...diffObjects(l, typeof o === 'object' && o !== null ? o : {}, fullKey));
      continue;
    }
    if (typeof o === 'object' && o !== null) {
      // Override has nested but legacy doesn't — treat each nested key as extra.
      out.push(...diffObjects({}, o, fullKey));
      continue;
    }

    if (l === undefined && o !== undefined) {
      out.push({ key: fullKey, status: 'extra', legacy: null, override: o });
    } else if (o === undefined && l !== undefined) {
      out.push({ key: fullKey, status: 'missing', legacy: l, override: null });
    } else if (normalizeWhitespace(l) === normalizeWhitespace(o)) {
      out.push({ key: fullKey, status: 'matched', legacy: l, override: o });
    } else {
      out.push({ key: fullKey, status: 'delta', legacy: l, override: o });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pretty-print
// ─────────────────────────────────────────────────────────────────────────────
function printDiffTable(rows) {
  const counts = { matched: 0, delta: 0, missing: 0, extra: 0 };
  for (const r of rows) counts[r.status]++;

  console.log('');
  console.log(
    `Diff summary:  ${counts.matched} matched  |  ${counts.delta} delta  |  ${counts.missing} missing  |  ${counts.extra} extra`,
  );
  console.log('─'.repeat(80));

  for (const r of rows) {
    const tag = padRight(`[${r.status}]`, 11);
    console.log(`${tag} ${r.key}`);
    if (r.status === 'delta') {
      console.log(`            legacy  : ${truncate(r.legacy, 120)}`);
      console.log(`            override: ${truncate(r.override, 120)}`);
    } else if (r.status === 'missing') {
      console.log(`            legacy  : ${truncate(r.legacy, 120)}`);
      console.log(`            override: (not present)`);
    } else if (r.status === 'extra') {
      console.log(`            legacy  : (not present)`);
      console.log(`            override: ${truncate(r.override, 120)}`);
    }
  }
  console.log('─'.repeat(80));
  console.log(
    `Diff summary:  ${counts.matched} matched  |  ${counts.delta} delta  |  ${counts.missing} missing  |  ${counts.extra} extra`,
  );
  return counts;
}

function padRight(s, n) {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function truncate(s, n) {
  if (s == null) return '';
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply mode — rewrite the override .classes.ts
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Take the current override structure and merge in legacy values for any
 * delta/missing keys. Extra keys are preserved.
 *
 * Merge strategy per key:
 *   - status=missing → set value to legacy as-is
 *   - status=delta → token-level union: legacy tokens (structural — sizing,
 *     layout, font-family) ∪ override CSS-var tokens (color/border tokens
 *     that depend on theme vars like `text-[rgb(var(--color-text))]` or
 *     `border-[rgb(var(--color-text))]/15`). This preserves both legacy
 *     pixel-perfect structure AND existing override color hooks.
 *
 * The result is then serialized back to a .classes.ts file with the same
 * `export const X = { ... } as const` shape and a banner comment.
 */
function mergeForApply(override, diffRows) {
  // Start from a deep clone of override so extras are preserved.
  const merged = deepClone(override);
  let applied = 0;
  for (const r of diffRows) {
    if (r.status === 'missing') {
      setByPath(merged, r.key, r.legacy);
      applied++;
    } else if (r.status === 'delta') {
      const unioned = unionClassTokens(r.legacy || '', r.override || '');
      setByPath(merged, r.key, unioned);
      applied++;
    }
  }
  return { merged, applied };
}

/**
 * Token-level merge that:
 *   1. Starts with all legacy tokens in their order (structural source of truth).
 *   2. Appends override tokens that reference CSS variables / theme tokens
 *      (`[var(--...)]`, `[rgb(var(--...))]`, etc.) and are NOT redundant with
 *      tokens already in legacy.
 *
 * Override tokens that look like literal Tailwind utilities also present in
 * legacy are dropped (legacy wins for structural). Override-only tokens that
 * carry CSS vars are kept (they encode theme color hooks).
 */
function unionClassTokens(legacy, override) {
  const legacyTokens = legacy.split(/\s+/).filter(Boolean);
  const overrideTokens = override.split(/\s+/).filter(Boolean);
  const legacySet = new Set(legacyTokens);
  const out = [...legacyTokens];
  for (const tok of overrideTokens) {
    if (legacySet.has(tok)) continue;
    if (hasCssVarReference(tok)) {
      out.push(tok);
    }
  }
  return out.join(' ');
}

function hasCssVarReference(token) {
  return token.includes('var(--') || token.includes('rgb(var(--');
}

function deepClone(o) {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map(deepClone);
  const out = {};
  for (const k of Object.keys(o)) out[k] = deepClone(o[k]);
  return out;
}

function setByPath(obj, dotPath, value) {
  const parts = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function serializeClassesTs(exportName, value, theme, block) {
  const body = serializeObject(value, 1);
  const banner = [
    `// ${block} classes for theme-${theme}.`,
    `// Auto-updated by scripts/diff-theme-classes.mjs — DO NOT hand-edit without re-running diff.`,
    `// Source of truth: templates/astro/${theme}/src/components/${block}.astro`,
  ].join('\n');
  return `${banner}\nexport const ${exportName} = ${body} as const;\n`;
}

function serializeObject(obj, indentLevel) {
  const indent = '  '.repeat(indentLevel);
  const closeIndent = '  '.repeat(indentLevel - 1);
  const lines = ['{'];
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    const keyOut = identOrQuoted(key);
    if (val === null || val === undefined) {
      lines.push(`${indent}${keyOut}: '',`);
    } else if (typeof val === 'string') {
      lines.push(`${indent}${keyOut}: ${quote(val)},`);
    } else if (typeof val === 'object') {
      lines.push(`${indent}${keyOut}: ${serializeObject(val, indentLevel + 1)},`);
    }
  }
  lines.push(`${closeIndent}}`);
  return lines.join('\n');
}

function identOrQuoted(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : quote(key);
}

function quote(s) {
  // Prefer single quotes; fall back to double if string contains single quote.
  if (!s.includes("'")) return `'${s}'`;
  if (!s.includes('"')) return `"${s}"`;
  return JSON.stringify(s); // last resort, escape with double quotes
}

// ─────────────────────────────────────────────────────────────────────────────
// File extractors per block — we run the registered selector map and pick
// out semantic keys from the parsed .astro AST.
// ─────────────────────────────────────────────────────────────────────────────
const BLOCK_SELECTORS = {
  Header: HEADER_SELECTORS,
};

async function extractLegacy(theme, block) {
  const astroPath = path.join(
    SITES_ROOT,
    'templates',
    'astro',
    theme,
    'src',
    'components',
    `${block}.astro`,
  );
  const source = await fs.readFile(astroPath, 'utf-8');
  const ast = await parse(source, { position: false });

  // Frontmatter is in source between the first ---\n and the next \n---\n.
  // We use raw source slicing rather than relying on AST node, because the
  // compiler exposes frontmatter under different node names across versions.
  const fmMatch = source.match(/^---\n([\s\S]*?)\n---/m);
  const frontmatter = fmMatch ? fmMatch[1] : '';

  const selectors = BLOCK_SELECTORS[block];
  if (!selectors) {
    throw new Error(`No selector map registered for block '${block}'. Add to BLOCK_SELECTORS.`);
  }

  // For each selector, walk the AST and pick the FIRST matching node.
  const extracted = {};
  const notFound = [];
  for (const sel of selectors) {
    let firstHit = null;
    walkAst(ast.ast, (n) => {
      if (firstHit) return;
      if (n.type !== 'element') return;
      if (sel.match(n)) firstHit = n;
    });
    let value;
    if (firstHit) {
      value = sel.extract(firstHit);
    } else if (sel.extract) {
      // Selectors with `match: () => false` produce a default static value.
      value = sel.extract(null);
    } else {
      value = null;
      notFound.push(sel.key);
    }
    // Translate legacy utilities to CSS-var form.
    value = translateLegacyClasses(value || '');
    setByPath(extracted, sel.key, value);
  }

  // Add sticky branches from frontmatter.
  const sticky = extractStickyClassFromFrontmatter(frontmatter);
  if (sticky) {
    extracted.sticky = sticky;
  } else {
    notFound.push('sticky');
  }

  return { extracted, notFound };
}

async function loadOverride(theme, block) {
  const overridePath = path.join(
    SITES_ROOT,
    'packages',
    `theme-${theme}`,
    'blocks',
    block,
    `${block}.classes.ts`,
  );
  const source = await fs.readFile(overridePath, 'utf-8');
  const { exportName, value } = parseClassesTs(source);
  if (!exportName || !value) {
    throw new Error(
      `Could not parse exported object literal from ${overridePath}. Expected ` +
        `\`export const ${block}Classes = { ... } as const;\``,
    );
  }
  return { overridePath, source, exportName, value };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);
  const { theme, block, apply, dryRun } = args;

  console.log(`Diff theme=${theme} block=${block}${apply ? ' (--apply)' : ''}${dryRun ? ' (--dry-run)' : ''}`);

  const { extracted, notFound } = await extractLegacy(theme, block);
  const overrideInfo = await loadOverride(theme, block);

  if (notFound.length > 0) {
    console.log(`\nLegacy selectors NOT FOUND (${notFound.length}):`);
    for (const k of notFound) console.log(`  - ${k}`);
  }

  const diffRows = diffObjects(extracted, overrideInfo.value);
  const counts = printDiffTable(diffRows);

  if (!apply) return;

  // ── --apply ──
  const { merged, applied } = mergeForApply(overrideInfo.value, diffRows);

  if (applied === 0) {
    console.log(`\nNothing to apply — override already matches legacy.`);
    return;
  }

  const out = serializeClassesTs(overrideInfo.exportName, merged, theme, block);

  if (dryRun) {
    console.log(`\n──── DRY RUN: file that WOULD be written to ${overrideInfo.overridePath} ────`);
    console.log(out);
    console.log(`──── end dry-run ────`);
    console.log(`Would apply ${applied} change(s) (${counts.delta} delta + ${counts.missing} missing).`);
    return;
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${overrideInfo.overridePath}.bak.${ts}`;
  await fs.writeFile(backupPath, overrideInfo.source, 'utf-8');
  await fs.writeFile(overrideInfo.overridePath, out, 'utf-8');

  console.log(``);
  console.log(`[+] applied ${applied} change(s) (${counts.delta} delta + ${counts.missing} missing)`);
  console.log(`[✓] kept ${counts.extra} extra key(s) untouched`);
  console.log(`[→] backup at ${backupPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
