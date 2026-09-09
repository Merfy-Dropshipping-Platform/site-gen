/**
 * Task 3 — Satin storefront contract inventory (AST, not regex).
 *
 * Satin-shaped fixtures exercise the AST walker across the exact cases the plan
 * names: Astro frontmatter, MULTIPLE inline `<script>` blocks, template
 * literals, an implicit-GET fetch (method normalized to GET), an explicit-method
 * fetch, a dynamic route segment (encoded opaquely, never lossy slugification)
 * and one deleted required action. Every static unit stays `UNKNOWN` (behavior
 * is a separate tier), and deleting a required endpoint/event/action produces
 * `requirement-missing` via `overlayRequirements` — never a silent disappearance.
 *
 * The external audited refs are asserted as PROVENANCE-ONLY: they never cause an
 * integration/behavior PASS to be emitted from a site-gen-only run.
 */

import {
  inventoryStorefrontContracts,
  type StorefrontSourceInput,
} from '../conformance/storefront-inventory';
import {
  overlayRequirements,
  makeEndpointId,
  encodeOpaqueSegment,
} from '../../../packages/theme-contract/conformance';
import type { RequirementRecord } from '../../../packages/theme-contract/conformance';
import { SATIN_SOURCE_ADAPTER } from '../conformance/satin-source-adapter';
import { SATIN_RELEASE_CONTRACT } from '../conformance/satin-release-contract';

const THEME = 'satin';

/** A `.ts` runtime source: constants, template-literal event, storage, methods. */
const CART_TS: StorefrontSourceInput = {
  kind: 'ts',
  ref: 'themes/satin/src/lib/cart.ts',
  code: `
    const STORAGE_KEY = 'satin:cart:v1';
    const UPDATED = \`\${'satin'}:cart:updated\`;
    export function readCart() {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }
    export function writeCart(items) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      window.dispatchEvent(new CustomEvent(UPDATED, { detail: items }));
    }
    export function openCart() {
      document.dispatchEvent(new CustomEvent('satin:cart:open'));
    }
    export async function fetchMe() {
      return fetch('/api/store/auth/me').then((r) => r.json());
    }
    export async function fetchOrders(customerId) {
      return fetch(\`/api/customers/\${customerId}/orders\`, { method: 'GET' });
    }
    export async function login(email, password) {
      return fetch('/api/store/auth/login', { method: 'POST' });
    }
    export const $token = createAtom(null);
    export const $customer = createAtom(null);
  `,
};

/**
 * An `.astro` source with frontmatter + TWO inline scripts. The frontmatter has
 * an implicit-GET fetch; script #1 dispatches a checkout-config event; script #2
 * reads storage. The walker parses the frontmatter and BOTH scripts.
 */
const CHECKOUT_ASTRO: StorefrontSourceInput = {
  kind: 'astro',
  ref: 'themes/satin/src/pages/checkout.astro',
  code: `---
const res = await fetch('/api/store/checkout-config');
const data = await res.json();
---
<section data-checkout></section>
<script>
  const READY = 'satin:checkout:config-ready';
  document.dispatchEvent(new CustomEvent(READY));
</script>
<script>
  const raw = localStorage.getItem('satin:buynow');
  if (raw) window.dispatchEvent(new CustomEvent('satin:cart:updated'));
  await fetch('/api/store/orders', { method: 'POST' });
</script>
`,
};

/** An `.astro` source with a DYNAMIC route segment in its fetch. */
const ORDER_DETAIL_ASTRO: StorefrontSourceInput = {
  kind: 'astro',
  ref: 'themes/satin/src/pages/account/order.astro',
  code: `---
const { id } = Astro.params;
const res = await fetch(\`/api/store/orders/\${id}\`);
const order = await res.json();
---
<article data-order></article>
`,
};

describe('Satin storefront inventory — AST units (not regex)', () => {
  it('extracts storage keys from a .ts source and both inline .astro scripts', async () => {
    const rows = await inventoryStorefrontContracts(THEME, [CART_TS, CHECKOUT_ASTRO]);
    const storage = rows.filter((r) => r.capability.startsWith('storage.'));
    const keys = storage.map((r) => r.defaultValue).sort();
    expect(keys).toEqual(expect.arrayContaining(['satin:buynow', 'satin:cart:v1']));
    for (const r of storage) expect(r.status).toBe('UNKNOWN');
  });

  it('extracts events including a template-literal event and events from both scripts', async () => {
    const rows = await inventoryStorefrontContracts(THEME, [CART_TS, CHECKOUT_ASTRO]);
    const events = rows.filter((r) => r.capability.startsWith('event.'));
    const names = events.map((r) => r.defaultValue).sort();
    expect(names).toEqual(
      expect.arrayContaining([
        'satin:cart:open',
        'satin:cart:updated', // template literal `${'satin'}:cart:updated`
        'satin:checkout:config-ready', // inline script #1
      ]),
    );
    for (const r of events) expect(r.status).toBe('UNKNOWN');
  });

  it('normalizes an implicit-fetch method to GET and keeps an explicit method', async () => {
    const rows = await inventoryStorefrontContracts(THEME, [CART_TS, CHECKOUT_ASTRO]);
    const byId = new Set(rows.map((r) => r.id));
    // implicit GET (no options) from cart.ts fetchMe + astro frontmatter fetch.
    expect(byId.has(makeEndpointId(THEME, 'GET', '/api/store/auth/me'))).toBe(true);
    expect(byId.has(makeEndpointId(THEME, 'GET', '/api/store/checkout-config'))).toBe(true);
    // explicit POST from login + astro inline script #2 orders.
    expect(byId.has(makeEndpointId(THEME, 'POST', '/api/store/auth/login'))).toBe(true);
    expect(byId.has(makeEndpointId(THEME, 'POST', '/api/store/orders'))).toBe(true);
    for (const r of rows.filter((x) => x.capability.startsWith('endpoint.'))) {
      expect(r.status).toBe('UNKNOWN');
    }
  });

  it('encodes a dynamic route segment opaquely (never lossy slugification)', async () => {
    const rows = await inventoryStorefrontContracts(THEME, [CART_TS, ORDER_DETAIL_ASTRO]);
    const ordersId = makeEndpointId(THEME, 'GET', '/api/customers/{param}/orders');
    const orderDetailId = makeEndpointId(THEME, 'GET', '/api/store/orders/{param}');
    expect(ordersId).toContain(encodeOpaqueSegment('/api/customers/{param}/orders'));
    expect(rows.some((r) => r.id === ordersId)).toBe(true);
    expect(rows.some((r) => r.id === orderDetailId)).toBe(true);
    // /a-b vs /a/b would produce distinct IDs by construction (encoder is lossless).
    expect(orderDetailId).not.toBe(ordersId);
  });

  it('extracts exported atoms/actions and keeps them UNKNOWN', async () => {
    const rows = await inventoryStorefrontContracts(THEME, [CART_TS]);
    const actions = rows.filter((r) => r.capability.startsWith('export.'));
    const names = actions.map((r) => r.defaultValue).sort();
    expect(names).toEqual(
      expect.arrayContaining(['$customer', '$token', 'login', 'openCart', 'readCart', 'writeCart']),
    );
    for (const r of actions) expect(r.status).toBe('UNKNOWN');
  });
});

describe('Satin storefront inventory — deletion => requirement-missing', () => {
  it('deleting a required endpoint/action yields requirement-missing (not disappearance)', async () => {
    const full = await inventoryStorefrontContracts(THEME, [CART_TS]);
    const loginId = makeEndpointId(THEME, 'POST', '/api/store/auth/login');
    const openEventRow = full.find((r) => r.defaultValue === 'satin:cart:open');
    expect(openEventRow).toBeDefined();

    const requirements: RequirementRecord[] = [
      {
        id: loginId,
        sources: [{ kind: 'user', ref: 'decision:satin-auth-login' }],
        required: true,
        label: 'POST /api/store/auth/login',
        contract: null,
      },
      {
        id: openEventRow!.id,
        sources: [{ kind: 'user', ref: 'decision:satin-cart-open-event' }],
        required: true,
        label: 'satin:cart:open event',
        contract: null,
      },
    ];

    // Full inventory → both requirements match → no requirement-missing.
    const present = overlayRequirements(full, requirements);
    expect(present.findings.some((f) => f.id.endsWith('.requirement-missing'))).toBe(false);

    // Delete the login endpoint + the open event from source and re-inventory.
    const trimmedCode = CART_TS.code
      .replace(/export async function login[\s\S]*?}\n/, '')
      .replace(/document\.dispatchEvent\(new CustomEvent\('satin:cart:open'\)\);/, '');
    const trimmed = await inventoryStorefrontContracts(THEME, [{ ...CART_TS, code: trimmedCode }]);
    expect(trimmed.some((r) => r.id === loginId)).toBe(false);
    expect(trimmed.some((r) => r.defaultValue === 'satin:cart:open')).toBe(false);

    const overlaid = overlayRequirements(trimmed, requirements);
    const missing = overlaid.findings.filter((f) => f.id.endsWith('.requirement-missing'));
    expect(missing.map((f) => f.id).sort()).toEqual(
      [`${loginId}.requirement-missing`, `${openEventRow!.id}.requirement-missing`].sort(),
    );
    // A deleted required action never disappears — it becomes a GAP.
    for (const f of missing) expect(f.status).toBe('GAP');
  });
});

describe('Satin external audits — provenance-only, never an integration PASS', () => {
  it('records the three audited cross-service refs as evidence-only', () => {
    const audits = SATIN_RELEASE_CONTRACT.externalAudits;
    expect(audits.map((a) => a.repository).sort()).toEqual([
      'MerfyFrontend',
      'api-gateway',
      'orders',
    ]);
    for (const a of audits) {
      expect(a.evidenceOnly).toBe(true);
      expect(a.ref).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it('the release-contract and source-adapter audit arrays are deep-equal (one provenance set)', () => {
    expect(SATIN_RELEASE_CONTRACT.externalAudits).toEqual(
      SATIN_SOURCE_ADAPTER.externalAudits,
    );
  });

  it('an external ref never produces a storefront capability row (site-gen never reads it)', async () => {
    // The inventory walker only sees the storefront sources it is handed; the
    // audited external repos are NOT storefront sources and never appear as
    // capability rows — so no integration/behavior PASS can be emitted from them.
    const rows = await inventoryStorefrontContracts(THEME, [CART_TS]);
    for (const a of SATIN_RELEASE_CONTRACT.externalAudits) {
      expect(rows.some((r) => r.id.includes(a.ref))).toBe(false);
      expect(rows.some((r) => (r.sources ?? []).some((s) => s.ref.includes(a.ref)))).toBe(false);
    }
    // And every extracted row is UNKNOWN (structural presence, not a PASS).
    expect(rows.every((r) => r.status === 'UNKNOWN')).toBe(true);
  });
});
