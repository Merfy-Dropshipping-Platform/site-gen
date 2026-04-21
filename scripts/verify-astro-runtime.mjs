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
  // Content blocks (Phase 1a)
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

  // Chrome blocks (Phase 1b)
  Header: { id: 'verify', siteTitle: 'V', logo: '', logoPosition: 'top-left', stickiness: 'none', menuType: 'dropdown', navigationLinks: [], actionButtons: { showSearch: true, showCart: true, showProfile: true }, colorScheme: 1, menuColorScheme: 1, padding: { top: 16, bottom: 16 } },
  Footer: { id: 'verify', newsletter: { enabled: false, heading: '', description: '', placeholder: '' }, heading: { text: 'V', size: 'medium', alignment: 'left' }, text: { content: '', size: 'small' }, navigationColumn: { title: '', links: [] }, informationColumn: { title: '', links: [] }, socialColumn: { title: '', email: '', socialLinks: [] }, colorScheme: 1, copyrightColorScheme: 1, padding: { top: 40, bottom: 40 } },
  CheckoutHeader: { id: 'verify', siteTitle: 'V', colorScheme: 1, padding: { top: 16, bottom: 16 } },
  AuthModal: { id: 'verify', mode: 'closed', siteTitle: 'V', showSocialLogin: false, colorScheme: 1, padding: basePadding },
  CartDrawer: { id: 'verify', position: 'right', showCheckoutButton: true, colorScheme: 1, padding: basePadding },
  CheckoutLayout: { id: 'verify', showOrderSummary: true, showTrustBadges: true, colorScheme: 1, padding: basePadding },
  AccountLayout: { id: 'verify', showGreeting: true, sidebarPosition: 'left', activePage: 'dashboard', colorScheme: 1, padding: basePadding },
};

// Minimal props for layouts/seo — these do not emit data-puck-component-id, so we
// just need to construct valid inputs and check render doesn't throw (or skip if
// they need slot content we can't provide here).
const LAYOUT_PROPS = {
  'layouts__BaseLayout': { title: 'V', description: 'D', tokensCss: '', fontHead: '' },
  'layouts__StoreLayout': null, // requires BaseLayout + Header + Footer child astros — Phase 1c wires this
};

const SEO_PROPS = {
  'seo__MetaTags': { pageTitle: 'V', siteName: 'S', description: 'D' },
  'seo__JsonLd': { data: { type: 'Organization', name: 'V', url: 'https://example.com' } },
  'seo__HrefLang': { alternates: [{ locale: 'ru', url: 'https://example.com' }] },
  'seo__TrackingScripts': {}, // all fields optional → renders empty
  'seo__CoreWebVitals__FontPreload': { fonts: [{ family: 'Inter', url: 'https://example.com/x.woff2' }] },
  'seo__CoreWebVitals__ImageOptimized': { src: '/x.jpg', alt: 'V' },
};

function kindOf(entry) {
  if (entry.kind) return entry.kind;
  if (entry.blockName.startsWith('layouts__')) return 'layouts';
  if (entry.blockName.startsWith('seo__')) return 'seo';
  return 'block';
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(DIST, 'manifest.json'), 'utf-8'));
  const container = await AstroContainer.create();

  console.log(`=== Astro Runtime Verification (${manifest.blocks.length} entries) ===`);
  const blockResults = { pass: 0, fail: 0 };
  const layoutResults = { pass: 0, warn: 0, skip: 0 };
  const seoResults = { pass: 0, warn: 0 };
  const hardFailures = [];

  for (const entry of manifest.blocks) {
    const kind = kindOf(entry);
    const modPath = path.join(DIST, entry.outputName);

    if (kind === 'block') {
      const props = MINIMAL_PROPS[entry.blockName] ?? { id: 'verify', colorScheme: 1, padding: basePadding };
      try {
        const mod = await import(modPath);
        const Component = mod.default;
        if (!Component) throw new Error('no default export');
        const html = await container.renderToString(Component, { props });
        const ok = html.length > 50 && html.includes('data-puck-component-id="verify"');
        if (ok) {
          console.log(`✓ [block]   ${entry.blockName} → ${html.length} bytes`);
          blockResults.pass++;
        } else {
          console.log(`✗ [block]   ${entry.blockName} → render produced ${html.length} bytes, missing marker`);
          console.log(`  preview: ${html.slice(0, 200)}`);
          hardFailures.push({ kind: 'block', block: entry.blockName, reason: 'missing marker', html: html.slice(0, 500) });
          blockResults.fail++;
        }
      } catch (err) {
        console.log(`✗ [block]   ${entry.blockName} — ${err.message}`);
        hardFailures.push({ kind: 'block', block: entry.blockName, error: err.message });
        blockResults.fail++;
      }
      continue;
    }

    if (kind === 'layouts') {
      const props = LAYOUT_PROPS[entry.blockName];
      if (props === null) {
        console.log(`~ [layout]  ${entry.blockName} — SKIPPED (needs child astros, Phase 1c)`);
        layoutResults.skip++;
        continue;
      }
      try {
        const mod = await import(modPath);
        const Component = mod.default;
        if (!Component) throw new Error('no default export');
        const html = await container.renderToString(Component, { props: props ?? {} });
        // Layouts must at least emit something; BaseLayout specifically should contain DOCTYPE.
        const ok = html.length > 50;
        if (ok) {
          console.log(`✓ [layout]  ${entry.blockName} → ${html.length} bytes`);
          layoutResults.pass++;
        } else {
          console.log(`⚠ [layout]  ${entry.blockName} → rendered ${html.length} bytes (too small)`);
          layoutResults.warn++;
        }
      } catch (err) {
        // Non-fatal: layouts/seo failing here is expected until Phase 1c wires real slots.
        console.log(`⚠ [layout]  ${entry.blockName} — ${err.message} (expected in Phase 1b, Phase 1c integrates)`);
        layoutResults.warn++;
      }
      continue;
    }

    if (kind === 'seo') {
      const props = SEO_PROPS[entry.blockName] ?? {};
      try {
        const mod = await import(modPath);
        const Component = mod.default;
        if (!Component) throw new Error('no default export');
        const html = await container.renderToString(Component, { props });
        // SEO components may render empty (e.g. TrackingScripts with no counters) —
        // acceptable. Just require that render didn't throw.
        console.log(`✓ [seo]     ${entry.blockName} → ${html.length} bytes`);
        seoResults.pass++;
      } catch (err) {
        console.log(`⚠ [seo]     ${entry.blockName} — ${err.message} (expected in Phase 1b)`);
        seoResults.warn++;
      }
      continue;
    }
  }

  console.log(``);
  console.log(`=== Summary ===`);
  console.log(`Blocks  : PASS ${blockResults.pass}  FAIL ${blockResults.fail}`);
  console.log(`Layouts : PASS ${layoutResults.pass}  WARN ${layoutResults.warn}  SKIP ${layoutResults.skip}`);
  console.log(`SEO     : PASS ${seoResults.pass}  WARN ${seoResults.warn}`);

  // Only hard-fail if a block did not render — layouts/seo warnings are acceptable in Phase 1b.
  if (blockResults.fail > 0) {
    console.error(`\n=== FAIL ===`);
    console.error(`${blockResults.fail}/${manifest.blocks.length} BLOCKS failed (hard failure).`);
    process.exit(1);
  }

  console.log(`\n=== PASS === (${blockResults.pass} blocks + ${layoutResults.pass} layouts + ${seoResults.pass} seo rendered)`);
}

main().catch(err => {
  console.error('UNEXPECTED ERROR:', err);
  process.exit(1);
});
