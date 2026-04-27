// 080 Phase 6 — checkout React Island mount script.
// Imports the shared CheckoutFlow from @merfy/storefront and mounts it onto
// `#checkout-island`. The Island reads [data-checkout-slot] placeholders that
// the Astro Checkout* blocks emit and Portals into them — preserving Puck
// data-puck-component-id wrappers + Tailwind classes.

import { mountCheckoutFlow } from '@merfy/storefront/checkout';

const config = window.__MERFY_CONFIG__ ?? {};
const target = document.getElementById('checkout-island');
if (target) {
  const cartId = (typeof localStorage !== 'undefined' && localStorage.getItem('merfy:cartId')) || null;
  mountCheckoutFlow(target, {
    apiBase: config.apiUrl ?? 'https://gateway.merfy.ru/api',
    shopId: config.shopId ?? '',
    preview: Boolean(window.__MERFY_PREVIEW__),
    initialCartId: cartId,
  });
}
