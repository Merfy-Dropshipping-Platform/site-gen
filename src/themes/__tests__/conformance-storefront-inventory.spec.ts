/**
 * Task 4 — Storefront contract inventory (AST, not regex) + behavior split.
 *
 * Individual contract units (storage keys, browser events, exported
 * atoms/stores/actions, request endpoints+method) are extracted from `.ts`
 * runtime sources with the TypeScript compiler AST, and from `.astro`
 * files by first parsing with `@astrojs/compiler` and feeding every
 * frontmatter / client-script fragment to the SAME AST walker. A full Astro
 * file is never handed directly to the TS parser.
 *
 * Static presence is linked to a structural source row; behavior stays a
 * separate UNKNOWN/`status-open` case until Plan 2/3 exercises it. Deleting a
 * required endpoint/event/action therefore produces `requirement-missing`
 * (via overlayRequirements), never a silent disappearance.
 */

import {
  inventoryStorefrontContracts,
  type StorefrontSourceInput,
} from '../conformance/storefront-inventory';
import { buildPreviewCartDemoScript } from '../preview-cart-contract';
import { resolveCartDrawerGlobals } from '../cart-drawer-contract';
import {
  overlayRequirements,
  makeEndpointId,
  encodeOpaqueSegment,
} from '../../../packages/theme-contract/conformance';
import type { RequirementRecord } from '../../../packages/theme-contract/conformance';

const THEME = 'bloom';

/** A `.ts` runtime source that exercises constants, template events, methods. */
const CART_TS: StorefrontSourceInput = {
  kind: 'ts',
  ref: 'themes/bloom/src/lib/cart.ts',
  code: `
    const STORAGE_KEY = 'bloom:cart:v1';
    const UPDATED = \`\${'bloom'}:cart:updated\`;
    export function readCart() {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }
    export function writeCart(items) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      window.dispatchEvent(new CustomEvent(UPDATED, { detail: items }));
    }
    export function openCart() {
      document.dispatchEvent(new CustomEvent('bloom:cart:open'));
    }
    export async function fetchMe() {
      return fetch('/api/auth/me').then((r) => r.json());
    }
    export async function fetchOrders(customerId) {
      return fetch(\`/api/customers/\${customerId}/orders\`, { method: 'GET' });
    }
    export async function login(email, password) {
      return fetch('/api/auth/login', { method: 'POST' });
    }
    export const $token = createAtom(null);
    export const $customer = createAtom(null);
  `,
};

/** An `.astro` route with frontmatter + two client scripts. */
const CHECKOUT_ASTRO: StorefrontSourceInput = {
  kind: 'astro',
  ref: 'themes/bloom/src/pages/checkout.astro',
  code: `---
const CFG_KEY = 'bloom:buynow';
const cfg = sessionStorage.getItem(CFG_KEY);
---
<section id="checkout"></section>
<script>
  window.addEventListener('checkout:config-ready', () => {});
  window.dispatchEvent(new CustomEvent('cart:updated'));
</script>
<script is:inline>
  fetch('/api/orders', { method: 'POST' });
</script>`,
};

describe('inventoryStorefrontContracts — AST units (not regex)', () => {
  it('extracts storage keys from const-resolved localStorage/sessionStorage calls', async () => {
    const rows = await inventoryStorefrontContracts(THEME, [CART_TS, CHECKOUT_ASTRO]);
    const storage = rows.filter((r) => r.capability.startsWith('storage.'));
    const keys = storage.map((r) => r.defaultValue).sort();
    // bloom:cart:v1 (localStorage) + bloom:buynow (sessionStorage frontmatter).
    expect(keys).toEqual(expect.arrayContaining(['bloom:buynow', 'bloom:cart:v1']));
    // Behavior stays UNKNOWN; static presence only.
    for (const r of storage) expect(r.status).toBe('UNKNOWN');
  });

  it('resolves template-literal event names after constant/template evaluation', async () => {
    const rows = await inventoryStorefrontContracts(THEME, [CART_TS, CHECKOUT_ASTRO]);
    const events = rows.filter((r) => r.capability.startsWith('event.'));
    const names = events.map((r) => r.defaultValue).sort();
    // Never a wildcard prefix — exact names, including a template-derived one.
    expect(names).toEqual(
      expect.arrayContaining([
        'bloom:cart:open',
        'bloom:cart:updated',
        'cart:updated',
        'checkout:config-ready',
      ]),
    );
    expect(names).not.toContain('bloom:cart:*');
    for (const r of events) expect(r.status).toBe('UNKNOWN');
  });

  it('extracts endpoint + HTTP method with normalized template params (implicit GET)', async () => {
    const rows = await inventoryStorefrontContracts(THEME, [CART_TS, CHECKOUT_ASTRO]);
    const endpoints = rows.filter((r) => r.capability.startsWith('endpoint.'));
    const byId = new Map(endpoints.map((r) => [r.id, r]));
    // fetch without method → implicit GET; /api/auth/me.
    expect(byId.has(makeEndpointId(THEME, 'GET', '/api/auth/me'))).toBe(true);
    // explicit POST login.
    expect(byId.has(makeEndpointId(THEME, 'POST', '/api/auth/login'))).toBe(true);
    // template path normalized to a named parameter.
    expect(byId.has(makeEndpointId(THEME, 'GET', '/api/customers/{param}/orders'))).toBe(
      true,
    );
    // explicit POST from the astro inline script.
    expect(byId.has(makeEndpointId(THEME, 'POST', '/api/orders'))).toBe(true);
    for (const r of endpoints) expect(r.status).toBe('UNKNOWN');
  });

  it('inventories exported atoms/stores/actions actually exported', async () => {
    const rows = await inventoryStorefrontContracts(THEME, [CART_TS, CHECKOUT_ASTRO]);
    const actions = rows.filter((r) => r.capability.startsWith('export.'));
    const names = actions.map((r) => (r.constraints?.manifest?.export as string)).sort();
    expect(names).toEqual(
      expect.arrayContaining([
        '$customer',
        '$token',
        'fetchMe',
        'fetchOrders',
        'login',
        'openCart',
        'readCart',
        'writeCart',
      ]),
    );
    for (const r of actions) expect(r.status).toBe('UNKNOWN');
  });

  it('parses BOTH astro frontmatter and every client script (never TS-parses a full .astro)', async () => {
    const rows = await inventoryStorefrontContracts(THEME, [CHECKOUT_ASTRO]);
    // frontmatter sessionStorage key.
    expect(rows.some((r) => r.defaultValue === 'bloom:buynow')).toBe(true);
    // first <script> event listen/dispatch.
    expect(rows.some((r) => r.defaultValue === 'checkout:config-ready')).toBe(true);
    expect(rows.some((r) => r.defaultValue === 'cart:updated')).toBe(true);
    // is:inline <script> endpoint.
    expect(
      rows.some((r) => r.id === makeEndpointId(THEME, 'POST', '/api/orders')),
    ).toBe(true);
    // Each row carries its source ref for provenance.
    for (const r of rows) {
      expect(r.sources.some((s) => s.ref.includes('checkout.astro'))).toBe(true);
    }
  });
});

describe('inventoryStorefrontContracts — generated preview-cart + cart-drawer units', () => {
  it('inventories preview-script units from the REAL extracted generator (not copied literals)', async () => {
    const script = buildPreviewCartDemoScript('site-fixture', 'bloom');
    const rows = await inventoryStorefrontContracts(THEME, [
      {
        kind: 'generated-preview-script',
        ref: 'generated:preview-cart',
        code: script,
        siteId: 'site-fixture',
      },
    ]);
    // storage key, updated event, storefront-data endpoint from the generator.
    expect(rows.some((r) => r.defaultValue === 'bloom:cart:v1')).toBe(true);
    expect(rows.some((r) => r.defaultValue === 'bloom:cart:updated')).toBe(true);
    expect(
      rows.some(
        (r) =>
          r.id ===
          makeEndpointId(THEME, 'GET', '/api/sites/{param}/storefront-data'),
      ),
    ).toBe(true);
    // The preview-demo line-item marker is captured as a distinct unit.
    expect(rows.some((r) => r.capability === 'preview-demo.line-item.preview-demo')).toBe(
      true,
    );
    for (const r of rows) expect(r.status).toBe('UNKNOWN');
  });

  it('emits separate resolver/call-site units for the five exact cart-drawer globals', async () => {
    const rows = await inventoryStorefrontContracts(THEME, [
      { kind: 'cart-drawer-resolver', ref: 'src/themes/cart-drawer-contract.ts', code: '' },
    ]);
    const names = rows
      .filter((r) => r.capability.startsWith('cart-drawer.global.'))
      .map((r) => r.constraints?.manifest?.global as string)
      .sort();
    expect(names).toEqual([
      '__MERFY_CART_DRAWER_CHECKOUT__',
      '__MERFY_CART_DRAWER_DISCLAIMER__',
      '__MERFY_CART_DRAWER_EMPTY__',
      '__MERFY_CART_DRAWER_SCHEME__',
      '__MERFY_CART_DRAWER_TITLE__',
    ]);
    // Reachability facts (v2/built-theme/live) are attached but behavior UNKNOWN.
    const reach = rows.find((r) => r.capability === 'cart-drawer.reachability');
    expect(reach).toBeDefined();
    expect(reach!.status).toBe('UNKNOWN');
  });

  it('cart-drawer resolver behavior is validated against the real helper, not re-asserted here', () => {
    // Guard: the generator producing units must agree with the resolver’s real
    // coupling/optional contract (SCHEME couples DISCLAIMER; text globals opt-in).
    const g = resolveCartDrawerGlobals({
      pagesData: { 'page-cart': { content: [{ type: 'CartBody', props: { colorScheme: 'scheme-3' } }] } },
      themeSettings: { cartDrawerTitle: '  Cart  ' },
    });
    expect(g.__MERFY_CART_DRAWER_SCHEME__).toBe('scheme-3');
    expect(g.__MERFY_CART_DRAWER_DISCLAIMER__).toBeDefined();
    expect(g.__MERFY_CART_DRAWER_TITLE__).toBe('Cart');
    expect(g.__MERFY_CART_DRAWER_CHECKOUT__).toBeUndefined();
  });
});

describe('inventoryStorefrontContracts — deletion => requirement-missing', () => {
  it('deleting a required endpoint/event/action yields requirement-missing (not disappearance)', async () => {
    const full = await inventoryStorefrontContracts(THEME, [CART_TS]);
    const loginId = makeEndpointId(THEME, 'POST', '/api/auth/login');
    const openEventRow = full.find((r) => r.defaultValue === 'bloom:cart:open');
    expect(openEventRow).toBeDefined();

    // A reviewed requirement set that requires the login endpoint AND the open event.
    const requirements: RequirementRecord[] = [
      {
        id: loginId,
        sources: [{ kind: 'user', ref: 'decision:auth-login' }],
        required: true,
        label: 'POST /api/auth/login',
        contract: null,
      },
      {
        id: openEventRow!.id,
        sources: [{ kind: 'user', ref: 'decision:cart-open-event' }],
        required: true,
        label: 'bloom:cart:open event',
        contract: null,
      },
    ];

    // With the full inventory, both requirements match → no requirement-missing.
    const present = overlayRequirements(full, requirements);
    expect(present.findings.some((f) => f.id.endsWith('.requirement-missing'))).toBe(
      false,
    );

    // Now delete the login endpoint + open event from the source and re-inventory.
    const trimmedCode = CART_TS.code
      .replace(/export async function login[\s\S]*?}\n/, '')
      .replace(/document\.dispatchEvent\(new CustomEvent\('bloom:cart:open'\)\);/, '');
    const trimmed = await inventoryStorefrontContracts(THEME, [
      { ...CART_TS, code: trimmedCode },
    ]);
    expect(trimmed.some((r) => r.id === loginId)).toBe(false);
    expect(trimmed.some((r) => r.defaultValue === 'bloom:cart:open')).toBe(false);

    const overlaid = overlayRequirements(trimmed, requirements);
    const missing = overlaid.findings.filter((f) => f.id.endsWith('.requirement-missing'));
    expect(missing.map((f) => f.id).sort()).toEqual(
      [`${loginId}.requirement-missing`, `${openEventRow!.id}.requirement-missing`].sort(),
    );
    for (const f of missing) expect(f.status).toBe('GAP');
  });

  it('uses the opaque encoder for route/param segments (never lossy slugification)', async () => {
    const rows = await inventoryStorefrontContracts(THEME, [CART_TS]);
    const ordersId = makeEndpointId(THEME, 'GET', '/api/customers/{param}/orders');
    // The ID embeds the encoded raw route; /a-b vs /a/b stay distinct by construction.
    expect(ordersId).toContain(encodeOpaqueSegment('/api/customers/{param}/orders'));
    expect(rows.some((r) => r.id === ordersId)).toBe(true);
  });
});
