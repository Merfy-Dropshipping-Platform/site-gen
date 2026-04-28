# 01 — CheckoutHeader

| | |
|---|---|
| **Figma node** | `1:13563` ("Header; 1920; Слева") |
| **Size** | 1920 × 80 |
| **Source of truth** | `packages/theme-base/blocks/CheckoutHeader/` |
| **Status** | 🔴 6 gaps found |
| **Last review** | 2026-04-28 |

## Side-by-side

| Figma | Live |
|---|---|
| ![figma](../figma-crops/CheckoutHeader.png) | _capture pending — TODO Playwright_ |

## Figma tokens (`figma-tokens/CheckoutHeader.json`)

```yaml
frame: 1920×80, padding 24/300/24/300, layout HORIZONTAL SPACE_BETWEEN, fill #ffffff
  Rose (TEXT, 70×27)
    font: Comfortaa, size 24, weight 400, lh 26.76, letter-spacing 0, color #000000
  Иконки (FRAME 32×32, gap 16)
    icon (VECTOR 21×21, color #000000) — корзина
```

## Current code

`CheckoutHeader.classes.ts`:
```ts
root: 'relative w-full bg-[rgb(var(--color-bg))] border-b border-[rgb(var(--color-border)/.5)]',
container: 'mx-auto max-w-[var(--container-max-width)] px-4 py-4 flex items-center justify-between',
brand: '[font-family:var(--font-heading)] text-[length:var(--size-checkout-brand)] text-[rgb(var(--color-heading))] no-underline tracking-wide',
brandImage: 'h-[var(--size-checkout-brand-image)] w-auto object-contain',
iconRight: 'flex items-center justify-center w-8 h-8 text-[rgb(var(--color-heading))] hover:opacity-80',
```

`CheckoutHeader.astro`: rightIcon supports `'account' | 'back'`, нет `'cart'`.

## Gaps

| # | Aspect | Figma | Code | Action |
|---|---|---|---|---|
| 1 | Side padding | 300px / 300px | `mx-auto max-w-[container-max] px-4` (centered, 1280max) | Заменить на `px-[var(--checkout-side-pad,300px)]` чтобы матчилось с layout grid `1fr | 652 | 84 | 884` |
| 2 | Vertical padding | 24+24=48px (frame 80px) | `py-4` = 16+16=32px | `py-6` (24+24=48) → итог 80px высоты при контенте 32px |
| 3 | Logo font | **Comfortaa** 24/400 | `var(--font-heading)` (Manrope в Rose) | Добавить `--font-logo: Comfortaa` или хардкод `[font-family:'Comfortaa',sans-serif]` для checkout brand |
| 4 | Border bottom | _нет_ | `border-b border-[rgb(var(--color-border)/.5)]` | Убрать `border-b` |
| 5 | Right icon — cart | Корзина (vector 21×21) | `rightIcon='account'` (user icon) или `'back'` (стрелка) | Добавить `rightIcon='cart'` + SVG корзины |
| 6 | Logo text | "Rose" (capital R + lowercase, font может рендерить) | `siteTitle` prop | По умолчанию theme-name (Rose/Vanilla/Satin/...). Уже есть logoMode='text' — оставить, но дефолт sitetitle = theme name |

## Fix plan

1. **`CheckoutHeader.classes.ts`**:
   - `root`: убрать `border-b border-[rgb(var(--color-border)/.5)]`
   - `container`: `mx-auto max-w-[var(--container-max-width)] px-4 py-4` → `w-full px-4 md:px-[var(--checkout-side-pad,300px)] py-6`
   - `brand`: `[font-family:var(--font-heading)]` → `[font-family:'Comfortaa',var(--font-heading)]` (Comfortaa приоритет, fallback на тему)
2. **`CheckoutHeader.puckConfig.ts`**: добавить опцию `rightIcon: 'cart' | 'account' | 'back' | 'none'`
3. **`CheckoutHeader.astro`**: добавить ветку `rightIcon === 'cart'` с SVG корзины
4. **`CheckoutHeader.tokens.ts`**: возможно зарегистрировать `--font-logo` (Comfortaa); подумать после применения хардкода

## Fix log

- **2026-04-28** — initial pass: применены 6 правок в `packages/theme-base/blocks/CheckoutHeader/`:
  - `classes.ts`: убран `border-b`, container `mx-auto max-w-[container]` → `w-full px-4 md:px-[var(--checkout-side-pad,300px)]`, `py-4` → `py-6`, brand font → `[font-family:'Comfortaa',var(--font-heading)]`
  - `puckConfig.ts`: добавлена опция `rightIcon: 'cart'` + поле `cartLink`, дефолт `rightIcon` → 'cart'
  - `astro`: добавлен SVG корзины при `rightIcon === 'cart'`
- Awaiting deploy + live verification.
