# Codebase Report: Delivery Switching Logic — T070-T075 (spec 055)
Generated: 2026-04-06

## Summary

All backend logic (T070) is fully implemented. Frontend (T071-T073) is substantially implemented but has 3 specific gaps. T074-T075 are deployment/E2E steps not yet done.

---

## T070: `calculateDelivery()` returns unified response

**Status: FULLY IMPLEMENTED**

File: `backend/services/orders/src/delivery/delivery.service.ts`

The `CalculateDeliveryResult` interface (lines 37-46) includes all 3 types:
```typescript
export interface CalculateDeliveryResult {
  cdekAvailable: boolean;
  cdekError?: string;
  tariffs: CdekTariffOption[];        // CDEK tariffs
  pickupAvailable: boolean;
  pickupAddress: string | null;
  pickupNotification?: string | null;
  pickupExpectedDate?: string | null;
  customProfiles?: CustomDeliveryProfile[];  // Custom profiles
}
```

The `calculateDelivery()` method (lines 126-275):
- Reads shop settings, checks `cdekEnabled` + `pickupEnabled`
- Calls `getCustomProfilesForCart()` (lines 482-572) — queries `deliveryProfiles` + `deliveryTariffs` tables, applies product restrictions and conditional pricing (weight/subtotal rules)
- Attaches `customProfiles` to result at both the early-return `baseResult` path (lines 144-148) and the CDEK success path (lines 262-264)
- CDEK error paths all return `baseResult` which includes customProfiles via spread

**Edge cases handled in backend:**
- No CDEK credentials → returns `baseResult` with customProfiles intact (line 162-165)
- CDEK auth fail → returns `cdekError: "Не удалось авторизоваться в СДЭК..."` (lines 172-176)
- Empty cart → `cdekError: "Корзина пуста"` (lines 192-196)
- Digital-only cart → skips CDEK, returns pickup/custom (lines 199-210)
- CDEK API exception → `cdekError: "Не удалось рассчитать доставку..."` (lines 266-273)

---

## T071: `renderDeliveryTariffs()` renders all 3 types

**Status: FULLY IMPLEMENTED**

File: `backend/services/sites/templates/astro/rose/src/scripts/checkout.js`

`renderDeliveryTariffs(tariffs, pickupAvailable, pickupAddress, pickupNotification, pickupExpectedDate, customProfiles)` (lines 658-775):

- CDEK tariffs rendered as radio labels with `data-delivery="cdek"`, mode badges (Курьер/ПВЗ), price, period (lines 672-713)
- Custom profiles rendered (lines 716-739): iterates `customProfiles[].tariffs[]`, each tariff gets `data-delivery="custom"`, `data-tariff-code="{t.id}"` (string UUID, not integer), profile name shown as badge
- Pickup shown/hidden based on `pickupAvailable` flag (lines 744-770), shows `pickupAddress`, `pickupNotification`, `pickupExpectedDate`
- Ends by calling `this.bindDeliverySelection()` (line 774)

---

## T072: Switching logic

**Status: SUBSTANTIALLY IMPLEMENTED — 1 gap**

### CDEK → pickup (bindDeliveryMethodSelection, line 564-576)
- Hides address group, clears tariffs HTML, hides PVZ section
- Immediately sends `type: 'pickup'`, cost 0 to backend
- Updates totals UI
- VERIFIED CORRECT

### pickup → CDEK (bindDeliveryMethodSelection, line 551-563)
- Shows address group, clears tariffs HTML, resets `selectedDelivery = null`
- Calls `updateDeliveryTotals()` to show 0 cost
- User must re-enter address to recalculate CDEK tariffs
- VERIFIED CORRECT

### Custom tariff selection (bindDeliverySelection, lines 790-799)
- `deliveryType = 'custom'`, `tariffCode` kept as string (UUID) via line 794: `deliveryType === 'custom' ? rawTariffCode : parseInt(...)`
- Calls `selectDeliveryOption('custom', tariffId, costCents, 'custom', null, null)`
- In `selectDeliveryOption` (lines 804-823): `deliveryMode === 'pickup'` check is `false` (mode is `'custom'`), so goes directly to `sendDeliverySelection`
- `sendDeliverySelection` sends `{type: 'custom', tariffCode: 'uuid-string', deliveryCostCents: N}` to backend
- `updateDeliveryTotals()` called immediately on selection — cost updates in UI
- VERIFIED CORRECT

### GAP: CDEK + custom in method-selector flow (Case 1 in checkDeliveryOptions, lines 479-493)
When both CDEK and pickup are available (`cdekAvailable && pickupAvailable`):
- Shows the method radio (CDEK vs самовывоз)
- If `hasCustom`: immediately calls `renderDeliveryTariffs([], ...)` for custom profiles
- BUT: when user clicks CDEK method radio, tariffs are CLEARED (`tariffs.innerHTML = ''`, line 555) without re-rendering custom profiles. Custom tariffs disappear from the UI when user switches to CDEK method and back.

---

## T073: Edge cases

**Status: PARTIALLY IMPLEMENTED — 2 gaps**

### "No delivery options" → show message
IMPLEMENTED. `checkDeliveryOptions()` line 522-523: falls through to `setDeliveryState('unavailable')` when none of the cases match (no CDEK, no pickup, no custom). The `#co-delivery-unavailable` element is shown.

Also in `calculateDelivery()` (line 606-608): if no tariffs + no pickup + no custom → `setDeliveryState('unavailable')`.

### "Invalid CDEK keys" → hide CDEK option
GAP. The backend returns `cdekError` in the response (e.g. `"Не удалось авторизоваться в СДЭК"`), and `cdekAvailable: false`. In `checkDeliveryOptions()` the `cdekError` field is destructured (line 470) but is NOT stored or displayed. The code only looks at `cdekAvailable` boolean. There is no UI message shown to the shop owner/user explaining why CDEK is absent. The CDEK option is correctly hidden (because `cdekAvailable=false`), but there's no user-facing error message.

Also in `calculateDelivery()` (lines 603-617): `cdekError` is not checked from the response at all — only `tariffs`, `pickupAvailable`, `customProfiles` are used to decide the state. If CDEK keys are invalid but other options exist, the user sees those options with no explanation for missing CDEK.

### "No custom profile for product" → show general options
IMPLEMENTED. The backend's `getCustomProfilesForCart()` (lines 514-519) filters profiles by `productIds` — if no profile matches, returns empty array. The frontend's `checkDeliveryOptions()` stores `customProfiles: customProfiles || []` (line 471) and uses `const hasCustom = customProfiles && customProfiles.length > 0` (line 476). If empty, the code proceeds to show CDEK/pickup without custom options. No special handling needed.

---

## T074: Deploy

**Status: NOT DONE** (deployment task)

---

## T075: E2E verification

**Status: NOT DONE** (requires T074)

---

## Summary Table

| Task | Status | Gap |
|------|--------|-----|
| T070 | DONE | None — all 3 types in unified response |
| T071 | DONE | None — all 3 types rendered |
| T072 | MOSTLY DONE | Custom profiles disappear when switching in CDEK+pickup combined mode |
| T073 | MOSTLY DONE | No UI display of `cdekError` message; `cdekError` field ignored in `calculateDelivery()` flow |
| T074 | NOT DONE | Deployment pending |
| T075 | NOT DONE | E2E pending |

## Key File Locations

| File | Lines |
|------|-------|
| `backend/services/orders/src/delivery/delivery.service.ts` | 37-46 (interface), 126-275 (calculateDelivery), 482-572 (getCustomProfilesForCart) |
| `backend/services/sites/templates/astro/rose/src/scripts/checkout.js` | 465-527 (checkDeliveryOptions), 529-578 (bindDeliveryMethodSelection), 583-618 (calculateDelivery), 658-775 (renderDeliveryTariffs), 777-801 (bindDeliverySelection), 804-823 (selectDeliveryOption) |
