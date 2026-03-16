# Quick Fix: checkout.js ID mismatches with CheckoutSection.astro
Generated: 2026-03-16

## Change Made
- File: `templates/astro/rose/src/scripts/checkout.js`
- Also copied to: `templates/astro/rose/public/scripts/checkout.js`

## ID Fixes Applied

| Old ID (broken) | New ID (correct) | Notes |
|---|---|---|
| `product-summary` | `co-product-list` | renderProductSummary |
| `order-summary` | `co-product-list` | renderOrderSummary merged in (single page) |
| `btn-pay` | `co-submit-btn` | processPayment |
| `btn-apply-promo` | `co-btn-apply-promo` | applyPromo |
| `btn-remove-promo` | `co-btn-remove-promo` | removePromo |
| `promo-input` | `co-promo-input` | applyPromo, updatePromoUI |
| `promo-error` | `co-promo-error` | applyPromo, removePromo, updatePromoUI |
| `promo-applied` | `co-promo-applied` | updatePromoUI |
| `promo-applied-code` | `co-promo-code` | updatePromoUI |
| `promo-applied-discount` | `co-discount-value` | updatePromoUI (uses existing totals row) |
| `promo-input-row` | `co-promo-input-row` | updatePromoUI |
| `payment-error` | `co-error` | processPayment |
| `error-title` / `error-text` | `co-error` (combined) | showError |

## Step Navigation Removed (non-existent in single-page HTML)
- `btn-to-contacts`, `btn-back-to-product`, `btn-back-to-contacts`, `btn-back-to-address` — removed
- `customer-form`, `address-form` event listeners — removed
- `customer-error`, `address-error` — removed
- `goToStep()`, `.checkout-step`, `.step-dot`, `.step-indicator` — removed (no multi-step DOM)
- `showError()` — refactored to use `co-error` div

## Button Structure Fix
- Old: `.loading` / `.text` spans in button
- New: `.co-btn-loading` / `.co-btn-text` (matches HTML)

## processPayment Enhancement
- Now collects customer data (co-email, co-phone, co-firstName, co-lastName) and calls `CheckoutAPI.setCustomer` + `CheckoutAPI.setAddress` before checkout, since there are no separate form-submit steps

## renderProductSummary
- Updated to use `.checkout-product-item`, `.checkout-product-img-wrap`, `.checkout-product-img`, `.checkout-product-counter`, `.checkout-product-info`, `.checkout-product-name`, `.checkout-product-price`, `.checkout-product-price-current` CSS classes from the HTML

## updateDeliveryTotals
- Now also handles `co-discount-row` and `co-discount-value` for promo discount display

## Verification
- Syntax check: valid JS (no import errors, no broken references)
- All getElementById calls either have matching HTML IDs or are wrapped with null checks

## Files Modified
1. `templates/astro/rose/src/scripts/checkout.js` — full rewrite with correct IDs
2. `templates/astro/rose/public/scripts/checkout.js` — copied from src

## Notes
- The `renderOrderSummary()` method was removed since the product list is always visible in the right panel (single-page layout). `renderProductSummary()` handles initial render; `updateDeliveryTotals()` keeps totals in sync.
- The promo applied state uses `style.display` toggling (matching how the HTML has `display:none` inline) rather than classList hidden toggling, consistent with the existing HTML.
