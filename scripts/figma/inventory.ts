#!/usr/bin/env tsx
/**
 * figma:inventory — walk Figma theme pages, map frames to block whitelist.
 * Output: docs/078-theme-system/figma-inventory.json
 *
 * Usage:
 *   pnpm figma:inventory
 *   FIGMA_API_KEY=xxx tsx scripts/figma/inventory.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { DEFAULT_FILE_KEY, loadEnv, requireEnv } from './lib/env.js';
import { walkFrames } from './lib/figma-tree-walker.js';
import { allMatches, matchBlockName } from './lib/name-mapping.js';
import { FigmaRestClient } from './lib/rest-client.js';
import {
  BLOCK_WHITELIST,
  FigmaInventory,
  FigmaNode,
  InventoryEntry,
  THEME_IDS,
  ThemeId,
  UnmappedFrame,
  Viewport,
  type BlockName,
} from './lib/types.js';
import { detectViewport } from './lib/viewport-detect.js';

loadEnv();

const FIGMA_PAGE_TO_THEME: Record<string, ThemeId> = {
  Rose: 'rose',
  // Figma page is "Vanila" (typo in designer's file); code package is theme-vanilla.
  Vanila: 'vanilla',
  Vanilla: 'vanilla',
  Satin: 'satin',
  Bloom: 'bloom',
  Flux: 'flux',
};

const SHARED_PAGE_NAME = 'Components';
const SKIP_PAGE_NAMES = ['Luna НЕ ДЕЛАТЬ'];

const OUT_PATH = resolve(
  process.cwd(),
  'docs/078-theme-system/figma-inventory.json',
);

async function main() {
  const apiKey = requireEnv('FIGMA_API_KEY');
  const fileKey = process.env.FIGMA_FILE_KEY || DEFAULT_FILE_KEY;
  const client = new FigmaRestClient({ apiKey, fileKey });

  console.log(`\n📐 figma:inventory`);
  console.log(`   file: ${fileKey}`);

  const me = await client.getMe().catch(() => null);
  if (me) console.log(`   user: ${me.handle} <${me.email}>`);

  console.log(`\n→ Fetching file structure (depth=2)...`);
  const file = await client.getFile({ depth: 2 });
  console.log(`   "${file.name}" — last modified ${file.lastModified}`);

  const pages = file.document.children ?? [];
  console.log(`   ${pages.length} pages`);

  const inventory: FigmaInventory = {
    fileKey,
    fileName: file.name,
    pulledAt: new Date().toISOString(),
    figmaUserHandle: me?.handle,
    sharedComponents: {
      pageNodeId: '',
      pageName: SHARED_PAGE_NAME,
      components: {},
    },
    themes: {} as FigmaInventory['themes'],
  };

  // Prime themes with empty structure
  for (const tid of THEME_IDS) {
    inventory.themes[tid] = {
      pageNodeId: '',
      pageName: '',
      viewports: [],
      blocks: {},
      unmapped: [],
      missingBlocks: [],
    };
  }

  const themeCandidates: { pageNodeId: string; pageName: string; themeId: ThemeId }[] = [];
  let sharedPageId: string | null = null;

  for (const page of pages) {
    if (SKIP_PAGE_NAMES.includes(page.name)) {
      console.log(`   ⊘ skip page "${page.name}"`);
      continue;
    }
    if (page.name === SHARED_PAGE_NAME) {
      sharedPageId = page.id;
      inventory.sharedComponents.pageNodeId = page.id;
      continue;
    }
    const themeId = FIGMA_PAGE_TO_THEME[page.name];
    if (themeId) {
      themeCandidates.push({ pageNodeId: page.id, pageName: page.name, themeId });
      inventory.themes[themeId].pageNodeId = page.id;
      inventory.themes[themeId].pageName = page.name;
    } else {
      console.log(`   ⚠ unrecognized page "${page.name}" — ignored`);
    }
  }

  // Shared components page (depth=2, it's 1-level library)
  if (sharedPageId) {
    console.log(`\n→ Fetching shared Components (node=${sharedPageId}, depth=2)...`);
    const res = await client.getNodes([sharedPageId], { depth: 2 });
    const node = res.nodes[sharedPageId]?.document;
    if (node) {
      for (const frame of walkFrames(node, { maxDepth: 2 })) {
        const match = matchBlockName(frame.node.name);
        if (match) {
          inventory.sharedComponents.components[match] = nodeToEntry(frame.node, match);
        }
      }
    }
    console.log(
      `   → ${Object.keys(inventory.sharedComponents.components).length} shared components mapped`,
    );
  }

  // Per-theme deep walk
  for (const { pageNodeId, pageName, themeId } of themeCandidates) {
    console.log(`\n→ Fetching theme "${pageName}" (node=${pageNodeId}, depth=5)...`);
    const res = await client.getNodes([pageNodeId], { depth: 5 });
    const pageNode = res.nodes[pageNodeId]?.document;
    if (!pageNode) {
      console.log(`   ⚠ empty response for ${pageName}`);
      continue;
    }
    analyzeThemePage(pageNode, inventory.themes[themeId]);
  }

  // Fill missingBlocks per theme
  for (const tid of THEME_IDS) {
    const found = new Set<BlockName>(Object.keys(inventory.themes[tid].blocks) as BlockName[]);
    inventory.themes[tid].missingBlocks = BLOCK_WHITELIST.filter((b) => !found.has(b));
  }

  // Summary print
  console.log(`\n✅ Inventory complete\n`);
  for (const tid of THEME_IDS) {
    const t = inventory.themes[tid];
    const blockCount = Object.keys(t.blocks).length;
    const viewports = t.viewports.join(', ') || '—';
    console.log(
      `  ${tid.padEnd(7)}  blocks: ${blockCount.toString().padStart(2)}  viewports: ${viewports.padEnd(18)}  unmapped: ${t.unmapped.length}  missing: ${t.missingBlocks.length}`,
    );
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(inventory, null, 2) + '\n');
  console.log(`\n💾 wrote ${OUT_PATH}`);
}

function nodeToEntry(node: FigmaNode, label: BlockName, figmaLabel?: string): InventoryEntry {
  const bbox = node.absoluteBoundingBox;
  return {
    nodeId: node.id,
    name: node.name,
    figmaLabel: figmaLabel || node.name,
    bbox: bbox ? { w: Math.round(bbox.width), h: Math.round(bbox.height) } : undefined,
  };
}

function analyzeThemePage(
  pageNode: FigmaNode,
  themeEntry: FigmaInventory['themes'][ThemeId],
) {
  const viewportsFound = new Set<Viewport>();
  const addedNodeIds = new Set<string>();

  // Track already-accepted blocks per viewport to dedupe
  const accepted = new Set<string>(); // key = `${block}@${viewport}`

  for (const { node, parentChain } of walkFrames(pageNode, {
    maxDepth: 6,
    includeTypes: ['FRAME', 'SECTION', 'COMPONENT', 'INSTANCE'],
  })) {
    if (addedNodeIds.has(node.id)) continue;

    const bbox = node.absoluteBoundingBox;
    const bboxWidth = bbox?.width;

    const match = matchBlockName(node.name);
    const viewport = detectViewport(node.name, bboxWidth, parentChain);

    if (!match) {
      // Skip obvious "page container" or "wrapper" large sections w/ viewport only
      const isContainer =
        /^(1920|1280|375)$/i.test(node.name.trim()) ||
        /(wrapper|container|page|canvas)/i.test(node.name);
      if (isContainer) continue;

      // Only log unmapped that are reasonably sized (skip tiny icons/helpers)
      if (bboxWidth && bboxWidth > 200) {
        const dup = themeEntry.unmapped.some((u) => u.nodeId === node.id);
        if (!dup) {
          const matches = allMatches(node.name);
          const reason: UnmappedFrame['reason'] =
            matches.length > 1 ? 'multiple_matches' : 'no_whitelist_match';
          themeEntry.unmapped.push({
            nodeId: node.id,
            name: node.name,
            bbox: bbox ? { w: Math.round(bbox.width), h: Math.round(bbox.height) } : { w: 0, h: 0 },
            reason,
          });
        }
      }
      continue;
    }

    if (!viewport) {
      themeEntry.unmapped.push({
        nodeId: node.id,
        name: node.name,
        bbox: bbox ? { w: Math.round(bbox.width), h: Math.round(bbox.height) } : { w: 0, h: 0 },
        reason: 'viewport_unclear',
      });
      continue;
    }

    const key = `${match}@${viewport}`;
    if (accepted.has(key)) continue; // prefer first occurrence

    themeEntry.blocks[match] = themeEntry.blocks[match] ?? {};
    themeEntry.blocks[match]![viewport] = nodeToEntry(node, match, node.name);
    accepted.add(key);
    addedNodeIds.add(node.id);
    viewportsFound.add(viewport);
  }

  themeEntry.viewports = (['1920', '1280', '375'] as Viewport[]).filter((v) =>
    viewportsFound.has(v),
  );
}

main().catch((err) => {
  console.error(`\n❌ figma:inventory failed:`, err);
  process.exit(1);
});
