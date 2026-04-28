#!/usr/bin/env node
// Extracts CSS-relevant tokens from cached Figma JSON tree → writes
// docs/checkout-parity/figma-tokens/<Block>.json (one per code-block we care about).
//
// Usage: node scripts/checkout-parity/extract-figma-tokens.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const TREE = resolve(ROOT, 'docs/checkout-parity/figma-tree/node-1:13398.json');
const OUT_DIR = resolve(ROOT, 'docs/checkout-parity/figma-tokens');
mkdirSync(OUT_DIR, { recursive: true });

const MAPPING = {
  CheckoutHeader: '1:13563',
  CheckoutContactForm: '1:13461',
  CheckoutDeliveryForm: '1:13474',
  CheckoutDeliveryMethod: '1:13501',
  CheckoutPayment: '1:13517',
  CheckoutOrderSummary: '1:13403',
  CheckoutTotals: '1:13451',
  CheckoutSubmit: '1:13560',
  CheckoutTerms: '1:13562',
  PageFooter: '1:13399',
};

const data = JSON.parse(readFileSync(TREE, 'utf8'));
const ROOT_NODE = data.nodes['1:13398'].document;

function findById(node, id) {
  if (node.id === id) return node;
  for (const c of node.children ?? []) {
    const r = findById(c, id);
    if (r) return r;
  }
  return null;
}

function rgb(c) {
  if (!c) return null;
  return `#${[c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}

function fillsToColors(node) {
  return (node.fills ?? [])
    .filter(f => f.type === 'SOLID' && f.visible !== false)
    .map(f => ({ color: rgb(f.color), opacity: f.opacity ?? 1 }));
}
function strokesToBorders(node) {
  return (node.strokes ?? [])
    .filter(s => s.type === 'SOLID' && s.visible !== false)
    .map(s => ({ color: rgb(s.color), opacity: s.opacity ?? 1, weight: node.strokeWeight }));
}

function summarize(node) {
  const bbox = node.absoluteBoundingBox ?? {};
  const out = {
    id: node.id,
    name: node.name,
    type: node.type,
    size: { w: Math.round(bbox.width ?? 0), h: Math.round(bbox.height ?? 0) },
  };
  if (node.layoutMode) {
    out.layout = {
      mode: node.layoutMode,
      direction: node.layoutMode,
      padding: {
        top: node.paddingTop ?? 0,
        right: node.paddingRight ?? 0,
        bottom: node.paddingBottom ?? 0,
        left: node.paddingLeft ?? 0,
      },
      gap: node.itemSpacing ?? 0,
      align: node.primaryAxisAlignItems ?? null,
      counterAlign: node.counterAxisAlignItems ?? null,
    };
  }
  if (node.cornerRadius != null) out.radius = node.cornerRadius;
  const fills = fillsToColors(node);
  if (fills.length) out.fill = fills;
  const strokes = strokesToBorders(node);
  if (strokes.length) out.border = strokes;
  if (node.type === 'TEXT') {
    const s = node.style ?? {};
    out.text = {
      content: node.characters,
      font: s.fontFamily,
      size: s.fontSize,
      weight: s.fontWeight,
      lineHeight: s.lineHeightPx,
      letterSpacing: s.letterSpacing,
      align: s.textAlignHorizontal,
    };
  }
  if (node.children) {
    out.children = node.children.map(summarize);
  }
  return out;
}

let total = 0;
for (const [block, nid] of Object.entries(MAPPING)) {
  const node = findById(ROOT_NODE, nid);
  if (!node) {
    console.warn(`MISS: ${block} (${nid})`);
    continue;
  }
  const summary = summarize(node);
  const out = resolve(OUT_DIR, `${block}.json`);
  writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(`✓ ${block}.json  (${summary.size.w}x${summary.size.h})`);
  total++;
}
console.log(`\nWrote ${total} files to ${OUT_DIR}`);
