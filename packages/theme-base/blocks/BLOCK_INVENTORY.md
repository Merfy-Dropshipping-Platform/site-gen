# Block Inventory — Phase 1a Reference

> **Generated:** 2026-04-20
> **Source:** `backend/services/constructor/src/contexts/ConstructorContext.tsx` (type `BuilderComponents`)
> **Scope:** Phase 1a content blocks (17). Chrome blocks (Header, Footer, CheckoutHeader) are Phase 1b — not listed here.
> **Token source:** `backend/services/sites/packages/theme-contract/tokens/registry.ts`
> **Constraints source:** `backend/services/constructor/CLAUDE.md` — section "Ограничения значений полей"

This document is the canonical per-block reference used by subagent implementers during Phase 1a. Props are extracted **verbatim** from `ConstructorContext.tsx` — do not paraphrase or rename fields when implementing Astro/Puck configs.

---

## PromoBanner

**Category:** hero
**Max instances per page:** unlimited
**Location in constructor:** `src/contexts/ConstructorContext.tsx:44`

**Props (verbatim from ConstructorContext.tsx):**

```typescript
PromoBanner: {
  id: string;
  text: string;
  size: "small" | "medium" | "large";
  link?: { href: string; text?: string };
  colorScheme: string;
};
```

**Required CSS tokens:**
- `--color-bg`
- `--color-heading`
- `--color-text`
- `--spacing-section-y`
- `--container-max-width`

**Constraints:**
- None specific.

**Notes:**
- Thin strip banner at top of page. Typically one per site but not enforced.
- `link` is optional — wraps entire banner as `<a>` when present.

---

## PopularProducts

**Category:** products
**Max instances per page:** unlimited
**Location in constructor:** `src/contexts/ConstructorContext.tsx:78`

**Props (verbatim from ConstructorContext.tsx):**

```typescript
PopularProducts: {
  id: string;
  dataSource: "auto" | "manual";
  collection: string;
  cards: number;
  heading: {
    text: string;
    size: "small" | "medium" | "large";
    alignment?: "left" | "center" | "right";
  };
  text: {
    content: string;
    size: "small" | "medium" | "large";
  };
  productCard: {
    buttonStyle: "link" | "primary" | "secondary";
    cardStyle: "auto" | "portrait" | "square" | "wide";
    nextPhoto: "true" | "false";
    quickAdd: "true" | "false";
    columns: number;
    buttonText?: string;
  };
  colorScheme: string;
  containerColorScheme: string;
  padding?: { top: number; bottom: number };
};
```

**Required CSS tokens:**
- `--color-bg`
- `--color-surface`
- `--color-heading`
- `--color-text`
- `--color-button-bg`
- `--color-button-text`
- `--color-button-border`
- `--color-button-2-bg`
- `--color-button-2-text`
- `--color-button-2-border`
- `--font-heading`
- `--size-hero-heading`
- `--radius-button`
- `--radius-card`
- `--radius-media`
- `--size-hero-button-h`
- `--size-card-border`
- `--spacing-section-y`
- `--spacing-grid-col-gap`
- `--spacing-grid-row-gap`
- `--container-max-width`
- `--card-style`
- `--card-alignment`
- `--button-style`

**Constraints:**
- **Коллекция товаров:** Карточки: мин. 2, макс. 24. Колонки: мин. 1, макс. 6.
- Отступы: мин. 0px, макс. 96px, шаг 8px. По умолчанию 80px.

**Notes:**
- Uses shared product card primitive — should consume `--card-style`, `--card-alignment` variant tokens.
- `dataSource: "auto"` → query products from `collection` slug; `manual` → explicit IDs (product selection UI TBD).
- `nextPhoto`/`quickAdd` are hover interactions — implement as vanilla JS on the storefront.

---

## Collections

**Category:** products
**Max instances per page:** unlimited
**Location in constructor:** `src/contexts/ConstructorContext.tsx:145`

**Props (verbatim from ConstructorContext.tsx):**

```typescript
Collections: {
  id: string;
  title: string;
  titleSize: "small" | "medium" | "large";
  titleAlignment?: "left" | "center" | "right";
  subtitle: string;
  subtitleSize: "small" | "medium" | "large";
  columnsCount: number;
  imageView: "portrait" | "square" | "wide";
  colorScheme: string;
  padding?: {
    top: number;
    bottom: number;
  };
  collections: Array<{
    name: string;
    image: string;
    hidden?: boolean;
  }>;
};
```

**Required CSS tokens:**
- `--color-bg`
- `--color-heading`
- `--color-text`
- `--font-heading`
- `--size-hero-heading`
- `--radius-media`
- `--radius-card`
- `--spacing-section-y`
- `--spacing-grid-col-gap`
- `--spacing-grid-row-gap`
- `--container-max-width`

**Constraints:**
- **Список коллекций:** Колонки: мин. 1, макс. 6. Макс. 10 параметров коллекций в сайдбаре.
- Отступы: мин. 0px, макс. 96px, шаг 8px.

**Notes:**
- Collection card = image + name. Link resolves at render time from `name` → collection slug lookup (or explicit `collectionId` in future).
- Respect `hidden` flag — hidden items skip render.

---

## Gallery

**Category:** media
**Max instances per page:** unlimited
**Location in constructor:** `src/contexts/ConstructorContext.tsx:165`

**Props (verbatim from ConstructorContext.tsx):**

```typescript
Gallery: {
  id: string;
  heading: {
    text: string;
    size: "small" | "medium" | "large";
    alignment?: "left" | "center" | "right";
  };
  text: {
    content: string;
    size: "small" | "medium" | "large";
  };
  imagePosition: "left" | "right";
  colorScheme: string;
  padding?: { top: number; bottom: number };
  featuredImage: {
    url: string;
    alt: string;
  };
  productCard: {
    enabled: "true" | "false";
    name: string;
    price: string;
    oldPrice: string;
    image: string;
  };
  collectionCard: {
    enabled: "true" | "false";
    name: string;
    image: string;
  };
  productId?: string;
  collectionId?: string;
};
```

**Required CSS tokens:**
- `--color-bg`
- `--color-heading`
- `--color-text`
- `--font-heading`
- `--size-hero-heading`
- `--radius-media`
- `--radius-card`
- `--spacing-section-y`
- `--container-max-width`

**Constraints:**
- **Галерея:** Макс. 3 параметра (Изображение, товар, коллекция).
- Отступы: мин. 0px, макс. 96px, шаг 8px.

**Notes:**
- 3 sub-parameters: `featuredImage`, `productCard`, `collectionCard`. Constructor's `SortableItem` handles sub-items — Astro only renders based on `enabled` flags.
- `imagePosition` controls whether featured image is left or right of text content.

---

## Product

**Category:** products
**Max instances per page:** unlimited (typically 1 on product page)
**Location in constructor:** `src/contexts/ConstructorContext.tsx:198`

**Props (verbatim from ConstructorContext.tsx):**

```typescript
Product: {
  id: string;
  productId: string | null;
  layout: "stacked" | "two-columns" | "carousel" | "thumbnail";
  size: "small" | "medium" | "large";
  photoPosition: "left" | "right";
  zoomMode: "click" | "hover";
  dynamicButton: {
    enabled: "true" | "false";
  };
  colorScheme: string;
  padding?: { top: number; bottom: number };
  image: string;
  images: Array<{ url: string }>;
  badge: {
    enabled: "true" | "false";
    text: string;
    textSize: "small" | "medium" | "large";
  };
  title: {
    enabled: "true" | "false";
    text: string;
    size: "small" | "medium" | "large";
  };
  price: {
    enabled: "true" | "false";
    value: string;
    oldValue?: string;
  };
  variants: {
    enabled: "true" | "false";
    style: "button" | "list";
    shape: "circle" | "square" | "none";
    items: Array<{
      label: string;
      value: string;
    }>;
  };
  quantity: {
    enabled: "true" | "false";
  };
  buttons: {
    enabled: "true" | "false";
    addToCart: {
      enabled: "true" | "false";
      text: string;
    };
    buyNow: {
      enabled: "true" | "false";
      text: string;
    };
  };
  description: {
    enabled: "true" | "false";
    text: string;
  };
  share: {
    enabled: "true" | "false";
    text: string;
  };
};
```

**Required CSS tokens:**
- `--color-bg`
- `--color-heading`
- `--color-text`
- `--color-muted`
- `--color-accent`
- `--color-button-bg`
- `--color-button-text`
- `--color-button-border`
- `--color-button-2-bg`
- `--color-button-2-text`
- `--color-button-2-border`
- `--font-heading`
- `--size-hero-heading`
- `--radius-button`
- `--radius-media`
- `--radius-card`
- `--size-hero-button-h`
- `--spacing-section-y`
- `--spacing-grid-col-gap`
- `--container-max-width`
- `--button-style`

**Constraints:**
- Отступы: мин. 0px, макс. 96px, шаг 8px.

**Notes:**
- Emit JSON-LD `Product` schema per spec §11 (SEO). Fields: `name`, `image`, `description`, `offers.price`, `offers.priceCurrency`, `offers.availability`.
- `productId` nullable — when null, render from inline `title/price/images` props (preview mode); when set, hydrate from product service API.
- `variants.items` is a static fallback; real variants come from product service when `productId` is set.

---

## MainText

**Category:** content
**Max instances per page:** unlimited
**Location in constructor:** `src/contexts/ConstructorContext.tsx:259`

**Props (verbatim from ConstructorContext.tsx):**

```typescript
MainText: {
  id: string;
  position: "left" | "center" | "right";
  colorScheme: string;
  padding?: { top: number; bottom: number };
  heading: {
    text: string;
    size: "small" | "medium" | "large";
  };
  text: {
    content: string;
    size: "small" | "medium" | "large";
  };
  button: {
    text: string;
    link: { href: string; text?: string };
  };
};
```

**Required CSS tokens:**
- `--color-bg`
- `--color-heading`
- `--color-text`
- `--color-button-bg`
- `--color-button-text`
- `--color-button-border`
- `--font-heading`
- `--font-body`
- `--size-hero-heading`
- `--radius-button`
- `--size-hero-button-h`
- `--spacing-section-y`
- `--container-max-width`
- `--button-style`

**Constraints:**
- Отступы: мин. 0px, макс. 96px, шаг 8px.

**Notes:**
- Simplest content block — heading + text + optional button.
- `button.text` empty ⇒ skip render.

---

## ImageWithText

**Category:** content
**Max instances per page:** unlimited
**Location in constructor:** `src/contexts/ConstructorContext.tsx:277`

**Props (verbatim from ConstructorContext.tsx):**

```typescript
ImageWithText: {
  id: string;
  image: string;
  size: "small" | "medium" | "large";
  width: "small" | "medium" | "large";
  photoPosition: "left" | "right";
  colorScheme: string;
  containerColorScheme: string;
  padding?: { top: number; bottom: number };
  heading: {
    enabled: "true" | "false";
    text: string;
  };
  text: {
    enabled: "true" | "false";
    content: string;
  };
  button: {
    enabled: "true" | "false";
    text: string;
    link: string;
  };
};
```

**Required CSS tokens:**
- `--color-bg`
- `--color-surface`
- `--color-heading`
- `--color-text`
- `--color-button-bg`
- `--color-button-text`
- `--color-button-border`
- `--font-heading`
- `--font-body`
- `--size-hero-heading`
- `--radius-media`
- `--radius-button`
- `--size-hero-button-h`
- `--spacing-section-y`
- `--spacing-grid-col-gap`
- `--container-max-width`
- `--button-style`

**Constraints:**
- Отступы: мин. 0px, макс. 96px, шаг 8px.

**Notes:**
- `size` controls image column ratio; `width` controls overall container width constraint.
- `button.link` is a plain string (href) — differs from some other blocks using `{ href, text }`.

---

## Slideshow

**Category:** hero
**Max instances per page:** unlimited
**Location in constructor:** `src/contexts/ConstructorContext.tsx:300`

**Props (verbatim from ConstructorContext.tsx):**

```typescript
Slideshow: {
  id: string;
  slides: Array<{
    id: string;
    image: string;
    heading: {
      text: string;
      size: "small" | "medium" | "large";
    };
    text: {
      content: string;
      size: "small" | "medium" | "large";
    };
    button: {
      text: string;
      link: { href: string; text?: string };
    };
    container: "true" | "false";
    position: "left" | "center" | "right";
    alignment: "left" | "center" | "right";
    colorScheme: string;
    hidden?: boolean;
  }>;
  imagePosition: "fullscreen" | "window";
  overlay: number;
  size: "small" | "medium" | "large";
  interval: number;
  pagination: "numbers" | "dots" | "counter";
  colorScheme?: string;
  padding?: { top: number; bottom: number };
};
```

**Required CSS tokens:**
- `--color-bg`
- `--color-heading`
- `--color-text`
- `--color-button-bg`
- `--color-button-text`
- `--color-button-border`
- `--font-heading`
- `--size-hero-heading`
- `--radius-media`
- `--radius-button`
- `--size-hero-button-h`
- `--spacing-section-y`
- `--container-max-width`
- `--button-style`

**Constraints:**
- **Слайд-шоу:** Интервал: 3, 5, 7, 9 сек. Макс. 5 слайдов в сайдбаре.
- **Затемнение (overlay):** От 0% до 100%.
- Отступы: мин. 0px, макс. 96px, шаг 8px.

**Notes:**
- **Phase 1a: render first slide only** (static Astro). JS-driven carousel comes later.
- `overlay` is a 0–100 percent value applied as rgba overlay on background image.
- Respect `hidden` — skip in loop.

---

## MultiColumns

**Category:** layout
**Max instances per page:** unlimited
**Location in constructor:** `src/contexts/ConstructorContext.tsx:331`

**Props (verbatim from ConstructorContext.tsx):**

```typescript
MultiColumns: {
  id: string;
  heading: {
    enabled: "true" | "false";
    text: string;
    size: "small" | "medium" | "large";
    alignment?: "left" | "center" | "right";
  };
  columns: Array<{
    title: string;
    description: string;
    image: string;
    imageSize: "small" | "medium" | "large";
    headingSize: "small" | "medium" | "large";
    textSize: "small" | "medium" | "large";
    link: {
      enabled: "true" | "false";
      text: string;
      href: string;
    };
    hidden?: boolean;
  }>;
  columnsCount: "1" | "2" | "3" | "4";
  width: "small" | "medium" | "large";
  imageAspectRatio: "adapt" | "square" | "portrait" | "landscape";
  button: string;
  link: { href: string };
  textPosition: "left" | "center";
  background: { enabled: "true" | "false" };
  colorScheme: string;
  containerColorScheme: string;
  padding?: { top: number; bottom: number };
};
```

**Required CSS tokens:**
- `--color-bg`
- `--color-surface`
- `--color-heading`
- `--color-text`
- `--color-button-bg`
- `--color-button-text`
- `--color-button-border`
- `--font-heading`
- `--size-hero-heading`
- `--radius-media`
- `--radius-card`
- `--radius-button`
- `--size-hero-button-h`
- `--spacing-section-y`
- `--spacing-grid-col-gap`
- `--spacing-grid-row-gap`
- `--container-max-width`
- `--button-style`

**Constraints:**
- **Мультиколонны:** Колонки: мин. 1, макс. 4. Макс. 10 параметров в сайдбаре.
- Отступы: мин. 0px, макс. 96px, шаг 8px.

**Notes:**
- `columnsCount` is a string literal `"1" | "2" | "3" | "4"` — cast to number in render.
- `imageAspectRatio: "adapt"` = preserve original ratio; others = fixed CSS aspect-ratio.
- `button` is the text; `link.href` is its target. Column-level `link` shadows section-level button.

---

## MultiRows

**Category:** layout
**Max instances per page:** unlimited
**Location in constructor:** `src/contexts/ConstructorContext.tsx:364`

**Props (verbatim from ConstructorContext.tsx):**

```typescript
MultiRows: {
  id: string;
  size: "small" | "medium" | "large";
  width: "small" | "medium" | "large";
  rowsPosition: "left" | "right";
  heading: {
    enabled: "true" | "false";
    text: string;
    size: "small" | "medium" | "large";
    alignment?: "left" | "center" | "right";
  };
  buttonStyle: "primary" | "secondary";
  alignment: "left" | "center" | "right";
  colorScheme: string;
  containerColorScheme: string;
  padding?: { top: number; bottom: number };
  rows: Array<{
    id: string;
    image: string;
    size?: "small" | "medium" | "large";
    width?: "small" | "medium" | "large";
    title: string;
    headingSize: "small" | "medium" | "large";
    description: string;
    textSize: "small" | "medium" | "large";
    button: {
      enabled: "true" | "false";
      text: string;
      link: string;
    };
    hidden?: boolean;
  }>;
};
```

**Required CSS tokens:**
- `--color-bg`
- `--color-surface`
- `--color-heading`
- `--color-text`
- `--color-button-bg`
- `--color-button-text`
- `--color-button-border`
- `--color-button-2-bg`
- `--color-button-2-text`
- `--color-button-2-border`
- `--font-heading`
- `--size-hero-heading`
- `--radius-media`
- `--radius-button`
- `--size-hero-button-h`
- `--spacing-section-y`
- `--spacing-grid-row-gap`
- `--container-max-width`
- `--button-style`

**Constraints:**
- **Мультиряды:** Макс. 10 рядов в сайдбаре.
- Отступы: мин. 0px, макс. 96px, шаг 8px.

**Notes:**
- `rowsPosition` alternates image side per row when combined with row-level `size`/`width`.
- `buttonStyle: "primary" | "secondary"` → select between `--color-button-*` and `--color-button-2-*` groups.
- `rows[].button.link` is a plain string (href).

---

## CollapsibleSection

**Category:** content
**Max instances per page:** unlimited
**Location in constructor:** `src/contexts/ConstructorContext.tsx:397`

**Props (verbatim from ConstructorContext.tsx):**

```typescript
CollapsibleSection: {
  id: string;
  heading: {
    enabled: "true" | "false";
    text: string;
    size: "small" | "medium" | "large";
  };
  container: { enabled: "true" | "false" };
  colorScheme: string;
  containerColorScheme: string;
  padding?: { top: number; bottom: number };
  items: Array<{
    title: string;
    content: string;
    hidden?: boolean;
  }>;
};
```

**Required CSS tokens:**
- `--color-bg`
- `--color-surface`
- `--color-heading`
- `--color-text`
- `--font-heading`
- `--size-hero-heading`
- `--radius-card`
- `--radius-field`
- `--spacing-section-y`
- `--container-max-width`

**Constraints:**
- **Сворачиваемый раздел:** Макс. 10 разделов в сайдбаре.
- Отступы: мин. 0px, макс. 96px, шаг 8px.

**Notes:**
- Use native `<details>`/`<summary>` for progressive enhancement (no JS required for toggle).
- `container.enabled` wraps items in a surface-colored card when true.

---

## Newsletter

**Category:** form
**Max instances per page:** unlimited
**Location in constructor:** `src/contexts/ConstructorContext.tsx:414`

**Props (verbatim from ConstructorContext.tsx):**

```typescript
Newsletter: {
  colorScheme: string;
  position: "left" | "center" | "right";
  padding?: { top: number; bottom: number };
  heading: { text: string; size: "small" | "medium" | "large"; alignment?: "left" | "center" | "right" };
  text: { content: string; size: "small" | "medium" | "large" };
  form: { placeholder: string; buttonText: string };
};
```

**Required CSS tokens:**
- `--color-bg`
- `--color-heading`
- `--color-text`
- `--color-button-bg`
- `--color-button-text`
- `--color-button-border`
- `--color-error`
- `--font-heading`
- `--font-body`
- `--size-hero-heading`
- `--radius-input`
- `--radius-field`
- `--radius-button`
- `--size-hero-button-h`
- `--size-newsletter-form-w`
- `--spacing-section-y`
- `--container-max-width`
- `--button-style`

**Constraints:**
- Отступы: мин. 0px, макс. 96px, шаг 8px.

**Notes:**
- Newsletter block has no `id` prop in the source type — all other blocks do. Implementers should still emit `data-puck-component-id` using Puck's internal id.
- Form submission target: newsletter/marketing service endpoint (TBD in integration phase).
- Uses `--size-newsletter-form-w` to constrain input width.

---

## ContactForm

**Category:** form
**Max instances per page:** unlimited
**Location in constructor:** `src/contexts/ConstructorContext.tsx:422`

**Props (verbatim from ConstructorContext.tsx):**

```typescript
ContactForm: {
  id: string;
  heading: {
    text: string;
    size: "small" | "medium" | "large";
    alignment?: "left" | "center" | "right";
  };
  colorScheme: string;
  padding?: { top: number; bottom: number };
};
```

**Required CSS tokens:**
- `--color-bg`
- `--color-heading`
- `--color-text`
- `--color-button-bg`
- `--color-button-text`
- `--color-button-border`
- `--color-error`
- `--font-heading`
- `--font-body`
- `--size-hero-heading`
- `--radius-input`
- `--radius-field`
- `--radius-button`
- `--size-hero-button-h`
- `--spacing-section-y`
- `--container-max-width`
- `--contact-form-layout`
- `--button-style`

**Constraints:**
- Отступы: мин. 0px, макс. 96px, шаг 8px.

**Notes:**
- Form fields (name, email, message) are implicit — not in props. Standard fields rendered by block itself.
- `--contact-form-layout: "wide" | "narrow"` variant token controls two-column vs single-column layout.
- In the iframe constructor preview, form submission must be blocked — emit `postMessage({ type: 'form-submit-blocked' })`.

---

## Video

**Category:** media
**Max instances per page:** unlimited
**Location in constructor:** `src/contexts/ConstructorContext.tsx:432`

**Props (verbatim from ConstructorContext.tsx):**

```typescript
Video: {
  id: string;
  video: {
    url: string;
    coverImage: string;
  };
  position: "fullscreen" | "window";
  size: "small" | "medium" | "large";
  overlay: number;
  content: {
    size: "small" | "medium" | "large";
    heading: {
      enabled: "true" | "false";
      text: string;
      size: "small" | "medium" | "large";
      alignment?: "left" | "center" | "right";
    };
    subheading: {
      enabled: "true" | "false";
      text: string;
    };
  };
  colorScheme: string;
  padding?: {
    top: number;
    bottom: number;
  };
};
```

**Required CSS tokens:**
- `--color-bg`
- `--color-heading`
- `--color-text`
- `--font-heading`
- `--size-hero-heading`
- `--radius-media`
- `--spacing-section-y`
- `--container-max-width`

**Constraints:**
- **Затемнение (overlay):** От 0% до 100%.
- Отступы: мин. 0px, макс. 96px, шаг 8px.

**Notes:**
- `video.url` may be YouTube, Vimeo, or direct MP4 — implement URL detection and embed accordingly.
- `coverImage` shown as poster until user clicks play (no autoplay).
- `overlay` is 0–100 percentage, applied over cover image.

---

## Publications

**Category:** content
**Max instances per page:** unlimited
**Location in constructor:** `src/contexts/ConstructorContext.tsx:460`

**Props (verbatim from ConstructorContext.tsx):**

```typescript
Publications: {
  id: string;
  mode?: "auto" | "manual";
  categoryFilter?: string;
  publicationType: string;
  cardsCount: number;
  heading: {
    enabled: "true" | "false";
    text: string;
    size: "small" | "medium" | "large";
    alignment?: "left" | "center" | "right";
  };
  columnsCount: number;
  dateTime: {
    enabled: "true" | "false";
  };
  colorScheme: string;
  padding?: {
    top: number;
    bottom: number;
  };
};
```

**Required CSS tokens:**
- `--color-bg`
- `--color-heading`
- `--color-text`
- `--color-muted`
- `--font-heading`
- `--font-body`
- `--size-hero-heading`
- `--radius-media`
- `--radius-card`
- `--spacing-section-y`
- `--spacing-grid-col-gap`
- `--spacing-grid-row-gap`
- `--container-max-width`

**Constraints:**
- **Публикации:** Колонки: мин. 1, макс. 4. Карточки: мин. 1, макс. 4.
- Отступы: мин. 0px, макс. 96px, шаг 8px.

**Notes:**
- `mode: "auto"` pulls from CMS with `categoryFilter`; `manual` uses explicit IDs (TBD).
- `publicationType` free-form string — expected values: `"article" | "news" | "blog"`.
- `dateTime.enabled` shows publication date on card.

---

## CartSection

**Category:** products
**Max instances per page:** 1 (used on `/cart` page only)
**Location in constructor:** `src/contexts/ConstructorContext.tsx:482`

**Props (verbatim from ConstructorContext.tsx):**

```typescript
CartSection: {
  id: string;
  colorScheme: string;
  padding?: { top: number; bottom: number };
};
```

**Required CSS tokens:**
- `--color-bg`
- `--color-surface`
- `--color-heading`
- `--color-text`
- `--color-muted`
- `--color-button-bg`
- `--color-button-text`
- `--color-button-border`
- `--font-heading`
- `--font-body`
- `--size-hero-heading`
- `--radius-button`
- `--radius-input`
- `--radius-field`
- `--radius-media`
- `--radius-card`
- `--size-hero-button-h`
- `--spacing-section-y`
- `--spacing-grid-col-gap`
- `--spacing-grid-row-gap`
- `--container-max-width`
- `--cart-type`
- `--button-style`

**Constraints:**
- Отступы: мин. 0px, макс. 96px, шаг 8px.

**Notes:**
- Minimal props — content is fully data-driven from cart state (localStorage + orders API).
- `--cart-type: "drawer" | "page"` variant token — Phase 1a implements page version only.
- Must render server-side empty state + hydrate via vanilla JS using existing `cart-store.js`.

---

## CheckoutSection

**Category:** form
**Max instances per page:** 1 (used on `/checkout` page only)
**Location in constructor:** `src/contexts/ConstructorContext.tsx:487`

**Props (verbatim from ConstructorContext.tsx):**

```typescript
CheckoutSection: {
  id: string;
  colorScheme: string;
  padding: { top: number; bottom: number };
};
```

**Required CSS tokens:**
- `--color-bg`
- `--color-surface`
- `--color-heading`
- `--color-text`
- `--color-muted`
- `--color-button-bg`
- `--color-button-text`
- `--color-button-border`
- `--color-error`
- `--font-heading`
- `--font-body`
- `--size-hero-heading`
- `--radius-button`
- `--radius-input`
- `--radius-field`
- `--size-hero-button-h`
- `--spacing-section-y`
- `--spacing-grid-col-gap`
- `--spacing-grid-row-gap`
- `--container-max-width`
- `--button-style`

**Constraints:**
- Отступы: мин. 0px, макс. 96px, шаг 8px.
- Note: `padding` is **required** here (not optional), unlike all other blocks.

**Notes:**
- Data-driven — all content (delivery, payment, fields) comes from `order_settings` and YooKassa/СДЭК integrations.
- In constructor iframe preview, disable form submission — emit `postMessage({ type: 'form-submit-blocked' })`.
- Must integrate with existing checkout flow (see `specs/011-storefront-checkout`, `specs/031-cdek-delivery-checkout`, `specs/047-checkout-self-pickup`).

---

## Appendix — Global Constraints

From `backend/services/constructor/CLAUDE.md` section "Ограничения значений полей":

| Rule | Applies to |
|------|------------|
| Отступы: мин. 0px, макс. 96px, шаг 8px. По умолчанию 80px | All blocks with `padding?` prop |
| Макс. 25 добавленных секций на страницу | Global (enforced by constructor, not per-block) |

### Drag-n-Drop rules

- Секции — перетаскиваются только внутри своего блока.
- Параметры — перетаскиваются только внутри своей секции.

### Phase 1a Rendering Notes

- **Astro Container API** renders blocks inside iframe (see `specs/078-theme-system-refactor`, Phase 1).
- **CSS isolation:** iframe has its own `<html>` — theme tokens/Tailwind do not leak into constructor chrome.
- **Form blocks** (Newsletter, ContactForm, CheckoutSection): in constructor preview, intercept submit and emit `postMessage({ type: 'form-submit-blocked' })`.
- **Slideshow:** Phase 1a = first slide only. Carousel JS is Phase 2+.
- **Product:** emit JSON-LD per SEO spec.
- **data-puck-component-id** attribute required on root element of every block for constructor click-to-select.
