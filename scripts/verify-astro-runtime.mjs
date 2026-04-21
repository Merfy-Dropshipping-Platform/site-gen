#!/usr/bin/env node
/**
 * Runtime verification: Astro Container can render all precompiled blocks from manifest.
 * Permanent CI check (pnpm verify:astro).
 */

import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = path.resolve(__dirname, '..');
const DIST = path.join(SITES_ROOT, 'dist', 'astro-blocks');

const basePadding = { top: 40, bottom: 40 };

// Minimal props per block — each one should render without throwing.
// Must match the block's Zod schema enough to satisfy required fields.
const MINIMAL_PROPS = {
  Hero: { id: 'verify', title: 'V', subtitle: '', image: { url: '', alt: '' }, cta: { text: 'OK', href: '/' }, variant: 'centered', colorScheme: 1, padding: basePadding },
  PromoBanner: { id: 'verify', text: 'v', linkText: 'x', linkUrl: '/', colorScheme: 1, padding: basePadding },
  PopularProducts: { id: 'verify', heading: 'v', cards: 2, columns: 2, colorScheme: 1, padding: basePadding },
  Collections: { id: 'verify', heading: 'v', collections: [{ id: 'c1', collectionId: null, heading: 'C', description: '' }], columns: 1, colorScheme: 1, padding: basePadding },
  Gallery: { id: 'verify', items: [{ type: 'image', id: 'i1', url: '', alt: '' }], layout: 'grid', colorScheme: 1, padding: basePadding },
  Product: { id: 'verify', productId: 'p1', colorScheme: 1, padding: basePadding },
  MainText: { id: 'verify', heading: 'V', text: 'Test', alignment: 'center', colorScheme: 1, padding: basePadding },
  ImageWithText: { id: 'verify', image: { url: '', alt: '' }, heading: 'V', text: 'T', button: { text: 'B', href: '/' }, imagePosition: 'left', colorScheme: 1, padding: basePadding },
  Slideshow: { id: 'verify', slides: [{ id: 's1', imageUrl: '', heading: 'V', subtitle: '', ctaText: '', ctaUrl: '' }], interval: 5, autoplay: false, colorScheme: 1, padding: basePadding },
  MultiColumns: { id: 'verify', columns: [{ id: 'c1', heading: 'C', text: '', imageUrl: '' }], displayColumns: 1, colorScheme: 1, padding: basePadding },
  MultiRows: { id: 'verify', rows: [{ id: 'r1', heading: 'R', text: '', imageUrl: '', imagePosition: 'left', button: { text: '', href: '' } }], colorScheme: 1, padding: basePadding },
  CollapsibleSection: { id: 'verify', heading: '', sections: [{ id: 's1', heading: 'S', content: 'C' }], colorScheme: 1, padding: basePadding },
  Newsletter: { id: 'verify', heading: 'V', description: '', placeholder: 'email', buttonText: 'Go', colorScheme: 1, padding: basePadding },
  ContactForm: { id: 'verify', heading: 'V', description: '', fields: { name: { enabled: true, required: true, label: 'Name' }, email: { enabled: true, required: true, label: 'Email' }, phone: { enabled: false, required: false, label: 'Phone' }, message: { enabled: false, required: false, label: 'Msg' } }, buttonText: 'Go', colorScheme: 1, padding: basePadding },
  Video: { id: 'verify', heading: '', videoUrl: '', poster: '', colorScheme: 1, padding: basePadding },
  Publications: { id: 'verify', heading: 'V', columns: 1, cards: 1, colorScheme: 1, padding: basePadding },
  CartSection: { id: 'verify', colorScheme: 1, padding: basePadding },
  CheckoutSection: { id: 'verify', colorScheme: 1, padding: basePadding },
};

async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(DIST, 'manifest.json'), 'utf-8'));
  const container = await AstroContainer.create();

  console.log(`=== Astro Runtime Verification (${manifest.blocks.length} blocks) ===`);
  let allPass = true;
  const failures = [];

  for (const entry of manifest.blocks) {
    const modPath = path.join(DIST, entry.outputName);
    const props = MINIMAL_PROPS[entry.blockName] ?? { id: 'verify', colorScheme: 1, padding: basePadding };
    try {
      const mod = await import(modPath);
      const Component = mod.default;
      if (!Component) throw new Error('no default export');
      const html = await container.renderToString(Component, { props });
      const ok = html.length > 50 && html.includes('data-puck-component-id="verify"');
      if (ok) {
        console.log(`✓ ${entry.blockName} → ${html.length} bytes`);
      } else {
        console.log(`✗ ${entry.blockName} → render produced ${html.length} bytes, missing marker`);
        console.log(`  preview: ${html.slice(0, 200)}`);
        failures.push({ block: entry.blockName, reason: 'missing marker', html: html.slice(0, 500) });
        allPass = false;
      }
    } catch (err) {
      console.log(`✗ ${entry.blockName} — ${err.message}`);
      failures.push({ block: entry.blockName, error: err.message });
      allPass = false;
    }
  }

  if (!allPass) {
    console.error(`\n=== FAIL ===`);
    console.error(`${failures.length}/${manifest.blocks.length} blocks failed.`);
    process.exit(1);
  }

  console.log(`\n=== PASS === (${manifest.blocks.length} blocks rendered)`);
}

main().catch(err => {
  console.error('UNEXPECTED ERROR:', err);
  process.exit(1);
});
