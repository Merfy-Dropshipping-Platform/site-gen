# @merfy/ui

CVA-based UI primitives for Merfy storefront themes. Provides both React and Astro components with shared variant definitions.

## Installation

```bash
pnpm add @merfy/ui
```

## Components

| Component | Variants | Description |
|-----------|----------|-------------|
| Button | `primary`, `secondary`, `ghost` / `sm`, `md`, `lg` / `fullWidth` | Action button, renders as `<a>` when `href` provided (Astro) |
| Badge | `default`, `success`, `warning`, `error` / `sm`, `md` | Inline status label |
| Input | `default`, `error` / `sm`, `md`, `lg` | Form input field |
| Card | `elevated` (boolean) / padding: `none`, `sm`, `md`, `lg` | Content container |
| Container | size: `sm`, `md`, `lg`, `full` | Page-width wrapper |

## Exports

```
@merfy/ui              -> cn, formatMoney, formatDiscount, pluralize, tailwindPreset
@merfy/ui/react        -> Button, Badge, Input, Card
@merfy/ui/variants     -> buttonVariants, badgeVariants, inputVariants, cardVariants, containerVariants
@merfy/ui/astro/*      -> Button.astro, Badge.astro, Input.astro, Card.astro, Container.astro
@merfy/ui/lib/cn       -> cn()
@merfy/ui/lib/format   -> formatMoney(), formatDiscount(), pluralize()
```

## Utilities

### cn(...inputs)

Tailwind-safe class merger (clsx + tailwind-merge).

```ts
import { cn } from "@merfy/ui";
cn("px-4 py-2", isActive && "bg-primary", className);
```

### formatMoney(amount, currency?)

Formats price from minor units. Default currency: `"RUB"`.

```ts
formatMoney(299000, "RUB"); // "299000 ₽"  (RUB is in full units)
formatMoney(1500, "USD");   // "$15.00"     (USD is in cents)
```

### formatDiscount(percent)

```ts
formatDiscount(15); // "-15%"
formatDiscount(0);  // ""
```

### pluralize(count, one, few, many)

Russian pluralization.

```ts
pluralize(1, "товар", "товара", "товаров"); // "товар"
pluralize(3, "товар", "товара", "товаров"); // "товара"
pluralize(5, "товар", "товара", "товаров"); // "товаров"
```

## Tailwind Preset

Extends Tailwind with CSS custom property-based colors, fonts, radii, and spacing from theme tokens.

```ts
// tailwind.config.ts
import { tailwindPreset } from "@merfy/ui";

export default {
  presets: [tailwindPreset],
};
```

Maps token variables like `--color-primary-rgb`, `--font-heading`, `--radius-base`, `--page-width`, `--spacing-section` to Tailwind utilities.

## Usage: React

```tsx
import { Button, Badge, Input, Card } from "@merfy/ui/react";

<Button variant="primary" size="lg">Buy now</Button>
<Badge variant="success" size="sm">In stock</Badge>
<Input variant="default" size="md" placeholder="Email" />
<Card elevated padding="md">Content</Card>
```

## Usage: Astro

```astro
---
import Button from "@merfy/ui/astro/Button.astro";
---
<Button variant="primary" size="lg" href="/catalog">Browse</Button>
```

## Variant-only usage

Import CVA variant functions for custom components:

```ts
import { buttonVariants } from "@merfy/ui/variants";
const classes = buttonVariants({ variant: "secondary", size: "sm" });
```
