# Checkout Parity Workflow — Figma → Live

> Систематический pixel-perfect проход по чекауту, **блок за блоком**.
> Источник: Figma file `h7IA1RsP8QDZZzauTN6qZm` (Components - Themes), node `1:13398` "Оформление заказа", тема Rose 1920.

## Структура

```
docs/checkout-parity/
├── README.md                ← этот файл — статус-таблица
├── figma-tree/
│   └── node-1:13398.json    ← полное дерево узла (REST API дамп)
├── figma-crops/             ← per-block PNG из Figma
├── figma-tokens/            ← per-block JSON (CSS-relevant: размеры, цвета, паддинги, шрифты)
├── live-crops/              ← per-block PNG live-сайта (TODO: Playwright)
└── blocks/
    ├── 01-CheckoutHeader.md
    ├── 02-CheckoutContactForm.md
    ├── ...
    └── 10-PageFooter.md
scripts/checkout-parity/
└── extract-figma-tokens.mjs ← перегенерирует figma-tokens/ из tree
```

## Workflow per block

1. **Open** `blocks/NN-<Block>.md`
2. **Side-by-side**: `figma-crops/<Block>.png` ↔ `live-crops/<Block>.png` (когда добавим Playwright capture)
3. **Read** `figma-tokens/<Block>.json` для точных значений (размеры, паддинги, шрифты, цвета)
4. **Compare** с `packages/theme-base/blocks/<Block>/<Block>.classes.ts` + `packages/storefront/checkout/sections/<Section>.tsx`
5. **List** расхождения в `## Gaps`
6. **Fix** в канон. источниках → sync во все 5 темплейтов
7. **Commit + push + sites-service deploy + tenant rebuild**
8. **Re-capture live** → check off

## Status

| # | Block | Figma node | Size | Status | Last review |
|---|---|---|---|---|---|
| 01 | CheckoutHeader | `1:13563` | 1920×80 | 🟡 6 fixes applied, awaiting verify | 2026-04-28 |
| 02 | CheckoutContactForm | `1:13461` | 652×94 | 🟢 6 fixes + floating-label done | 2026-04-28 |
| 03 | CheckoutDeliveryForm | `1:13474` | 652×310 | 🟢 search-icon + floating-label done | 2026-04-28 |
| 04 | CheckoutDeliveryMethod | `1:13501` | 652×174 | 🟡 60h px-3, font sizes per Figma | 2026-04-28 |
| 05 | CheckoutPayment | `1:13517` | 652×507 | 🟢 heading + payment radio + floating-label done | 2026-04-28 |
| 06 | CheckoutOrderSummary | `1:13403` | 520×370 | 🟡 image 120px, gaps 24/8/4, promo padded | 2026-04-28 |
| 07 | CheckoutTotals | `1:13451` | 520×61 | 🟡 gap-12, no border-t, total Manrope 20/400 | 2026-04-28 |
| 08 | CheckoutSubmit | `1:13560` | 652×56 | 🟡 h-14, no semibold | 2026-04-28 |
| 09 | CheckoutTerms | `1:13562` | 652×32 | 🟡 Montserrat Alternates 12/300 | 2026-04-28 |
| 10 | PageFooter | `1:13399` | 1920×64 | 🟢 already matches (Inter 16/300) | 2026-04-28 |

Legend: ⏳ pending · 🔴 has gaps · 🟡 in progress · 🟢 match

## Refresh from Figma

```bash
# 1. Re-fetch node tree
FIGMA_API_KEY=figd_xxx
curl -sS -H "X-Figma-Token: $FIGMA_API_KEY" \
  "https://api.figma.com/v1/files/h7IA1RsP8QDZZzauTN6qZm/nodes?ids=1:13398&geometry=paths" \
  > docs/checkout-parity/figma-tree/node-1:13398.json

# 2. Re-extract per-block tokens
node scripts/checkout-parity/extract-figma-tokens.mjs

# 3. Re-render PNG crops
# (см. download script — TODO: вынести в scripts/checkout-parity/render-figma.mjs)
```

## Notes

- **Source of truth для кода**: `packages/theme-base/blocks/Checkout*/` (Astro shells, копируются в `templates/astro/<theme>/src/components/` при сборке через `assemble-from-packages.ts`) и `packages/storefront/checkout/sections/*.tsx` (React Sections, копируются вручную в `templates/astro/<theme>/src/lib/storefront/checkout/sections/` — sync скриптом).
- **Sync канон → темплейты**: `for theme in rose vanilla satin bloom flux; do cp packages/storefront/checkout/sections/* templates/astro/$theme/src/lib/storefront/checkout/sections/; done`
- **Темы отличаются только tokens.json** (color, font-family, radius, size). Структура и spacing — общие.
- Figma 1920 — пока единственный viewport. 375 (mobile) и 1280 — добавим если понадобится.
